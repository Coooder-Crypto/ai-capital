globalThis.window = {};
await import("../data/seed.js");
await import("../data/p1-extension.js");

import fs from "node:fs/promises";
import { applyEvidenceOverrides, readEvidenceOverrides, readRelationshipReviewOverrides } from "./evidence-overrides.mjs";

const seed = globalThis.window.AI_CAPITAL_SEED;
const connectors = JSON.parse(await fs.readFile(new URL("../data/connectors.json", import.meta.url), "utf8"));
const evidenceBundle = readEvidenceOverrides();
const relationshipReviewBundle = readRelationshipReviewOverrides();

if (!seed) {
  throw new Error("AI_CAPITAL_SEED was not loaded");
}
applyEvidenceOverrides(seed, evidenceBundle);

const allowedRelationshipTypes = new Set(Object.keys(seed.relationLabels));
const allowedRelationshipReviewStatuses = new Set([
  "reviewed_evidence_backed",
  "inferred_ecosystem_mapping",
  "needs_direct_evidence"
]);
const allowedEvidenceStrengths = new Set([
  "official_api",
  "official_docs",
  "official_product_overlap",
  "credible_report",
  "third_party_index",
  "manual_seed",
  "derived"
]);
const layerIds = new Set(seed.layers.map((layer) => layer.id));
const entityIds = new Set(seed.entities.map((entity) => entity.id));
const sourceIds = new Set(seed.sources.map((source) => source.id));
const relationshipIds = new Set(seed.relationships.map((relationship) => relationship.id));
const evidenceOverrideIds = new Set();
const relationshipReviewOverrideIds = new Set();
const errors = [];

function requireField(record, field, label) {
  if (record[field] === undefined || record[field] === null || record[field] === "") {
    errors.push(`${label} is missing required field: ${field}`);
  }
}

function assertUnique(records, field, label) {
  const seen = new Set();
  records.forEach((record) => {
    if (seen.has(record[field])) {
      errors.push(`${label} has duplicate ${field}: ${record[field]}`);
    }
    seen.add(record[field]);
  });
}

assertUnique(seed.layers, "id", "layers");
assertUnique(seed.entities, "id", "entities");
assertUnique(seed.sources, "id", "sources");
assertUnique(seed.relationships, "id", "relationships");

seed.layers.forEach((layer) => {
  requireField(layer, "id", "layer");
  requireField(layer, "name", `layer ${layer.id}`);
  requireField(layer, "color", `layer ${layer.id}`);
  requireField(layer, "description", `layer ${layer.id}`);
});

seed.entities.forEach((entity) => {
  requireField(entity, "id", "entity");
  requireField(entity, "name", `entity ${entity.id}`);
  requireField(entity, "type", `entity ${entity.id}`);
  requireField(entity, "layer", `entity ${entity.id}`);
  requireField(entity, "status", `entity ${entity.id}`);
  requireField(entity, "valuation", `entity ${entity.id}`);
  requireField(entity, "description", `entity ${entity.id}`);
  requireField(entity, "website_url", `entity ${entity.id}`);
  requireField(entity, "country", `entity ${entity.id}`);
  if (!layerIds.has(entity.layer)) {
    errors.push(`entity ${entity.id} references unknown layer: ${entity.layer}`);
  }
  if (!Array.isArray(entity.aliases) || entity.aliases.length === 0) {
    errors.push(`entity ${entity.id} must have a non-empty aliases array`);
  }
});

seed.sources.forEach((source) => {
  requireField(source, "id", "source");
  requireField(source, "title", `source ${source.id}`);
  requireField(source, "publisher", `source ${source.id}`);
  requireField(source, "url", `source ${source.id}`);
  requireField(source, "sourceType", `source ${source.id}`);
  requireField(source, "evidenceStrength", `source ${source.id}`);
  requireField(source, "licenseNote", `source ${source.id}`);
  if (!allowedEvidenceStrengths.has(source.evidenceStrength)) {
    errors.push(`source ${source.id} has unknown evidenceStrength: ${source.evidenceStrength}`);
  }
  if (source.fetchedAt && Number.isNaN(Date.parse(source.fetchedAt))) {
    errors.push(`source ${source.id} fetchedAt must be an ISO date string`);
  }
});

seed.relationships.forEach((relationship) => {
  requireField(relationship, "id", "relationship");
  requireField(relationship, "source", `relationship ${relationship.id}`);
  requireField(relationship, "target", `relationship ${relationship.id}`);
  requireField(relationship, "type", `relationship ${relationship.id}`);
  requireField(relationship, "confidence", `relationship ${relationship.id}`);
  requireField(relationship, "sourceId", `relationship ${relationship.id}`);
  if (!entityIds.has(relationship.source)) {
    errors.push(`relationship ${relationship.id} references unknown source entity: ${relationship.source}`);
  }
  if (!entityIds.has(relationship.target)) {
    errors.push(`relationship ${relationship.id} references unknown target entity: ${relationship.target}`);
  }
  if (!sourceIds.has(relationship.sourceId)) {
    errors.push(`relationship ${relationship.id} references unknown evidence source: ${relationship.sourceId}`);
  }
  if (!allowedRelationshipTypes.has(relationship.type)) {
    errors.push(`relationship ${relationship.id} has unknown type: ${relationship.type}`);
  }
  if (typeof relationship.confidence !== "number" || relationship.confidence < 0 || relationship.confidence > 1) {
    errors.push(`relationship ${relationship.id} confidence must be a number from 0 to 1`);
  }
  if (relationship.evidenceUrl && !/^https?:\/\//.test(relationship.evidenceUrl)) {
    errors.push(`relationship ${relationship.id} evidenceUrl must be an absolute http(s) URL`);
  }
  if (relationship.reviewStatus && !allowedRelationshipReviewStatuses.has(relationship.reviewStatus)) {
    errors.push(`relationship ${relationship.id} has unknown reviewStatus: ${relationship.reviewStatus}`);
  }
});

evidenceBundle.overrides.forEach((override, index) => {
  const label = `evidence override[${index}]`;
  requireField(override, "relationshipId", label);
  requireField(override, "evidenceTitle", label);
  requireField(override, "evidenceUrl", label);
  requireField(override, "evidencePublisher", label);
  requireField(override, "evidenceStrength", label);
  if (!relationshipIds.has(override.relationshipId)) {
    errors.push(`${label} references unknown relationship: ${override.relationshipId}`);
  }
  if (evidenceOverrideIds.has(override.relationshipId)) {
    errors.push(`${label} duplicates relationship override: ${override.relationshipId}`);
  }
  evidenceOverrideIds.add(override.relationshipId);
  if (!allowedEvidenceStrengths.has(override.evidenceStrength)) {
    errors.push(`${label} has unknown evidenceStrength: ${override.evidenceStrength}`);
  }
  if (!/^https?:\/\//.test(override.evidenceUrl || "")) {
    errors.push(`${label} evidenceUrl must be an absolute http(s) URL`);
  }
});

relationshipReviewBundle.overrides.forEach((override, index) => {
  const label = `relationship review override[${index}]`;
  requireField(override, "relationshipId", label);
  requireField(override, "reviewStatus", label);
  requireField(override, "reviewNote", label);
  if (!relationshipIds.has(override.relationshipId)) {
    errors.push(`${label} references unknown relationship: ${override.relationshipId}`);
  }
  if (relationshipReviewOverrideIds.has(override.relationshipId)) {
    errors.push(`${label} duplicates relationship review override: ${override.relationshipId}`);
  }
  relationshipReviewOverrideIds.add(override.relationshipId);
  if (!allowedRelationshipReviewStatuses.has(override.reviewStatus)) {
    errors.push(`${label} has unknown reviewStatus: ${override.reviewStatus}`);
  }
  if (override.confidence !== undefined && (typeof override.confidence !== "number" || override.confidence < 0 || override.confidence > 1)) {
    errors.push(`${label} confidence must be a number from 0 to 1`);
  }
});

for (const [sourceName, items] of Object.entries(connectors)) {
  if (!Array.isArray(items)) {
    errors.push(`connector ${sourceName} must be an array`);
    continue;
  }
  items.forEach((item, index) => {
    if (!entityIds.has(item.entityId)) {
      errors.push(`connector ${sourceName}[${index}] references unknown entity: ${item.entityId}`);
    }
    if (sourceName === "wikidata" && !item.qid && !item.search) {
      errors.push(`connector ${sourceName}[${index}] must include qid or search`);
    }
  });
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `Seed data valid: ${seed.layers.length} layers, ${seed.entities.length} entities, ${seed.relationships.length} relationships, ${seed.sources.length} sources.`
);
