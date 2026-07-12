import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyEvidenceOverrides } from "./evidence-overrides.mjs";

globalThis.window = {};
await import("../data/seed.js");
await import("../data/p1-extension.js");
await import("../data/metrics.js");

const seed = globalThis.window.AI_CAPITAL_SEED;
const metricBundle = globalThis.window.AI_CAPITAL_METRICS || { metrics: [] };

if (!seed) {
  throw new Error("AI_CAPITAL_SEED was not loaded");
}
applyEvidenceOverrides(seed);

const sourceByMetricProvider = new Map([
  ["github", "src_github"],
  ["huggingface", "src_hf"],
  ["sec", "src_sec"],
  ["openAlex", "src_openalex"],
  ["openalex", "src_openalex"]
]);

const warnings = [];
const args = new Set(process.argv.slice(2));

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function stableId(...parts) {
  return parts
    .filter((part) => part !== undefined && part !== null && part !== "")
    .join("__")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function countDuplicateIds(rows, label) {
  const seen = new Set();
  const duplicates = new Set();
  rows.forEach((row) => {
    if (seen.has(row.id)) duplicates.add(row.id);
    seen.add(row.id);
  });
  if (duplicates.size > 0) {
    warnings.push(`${label} has duplicate ids: ${[...duplicates].join(", ")}`);
  }
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlInsert(table, columns, rows, conflictTarget, updateColumns = columns) {
  if (rows.length === 0) return "";
  const values = rows
    .map((row) => `  (${columns.map((column) => sqlValue(row[column])).join(", ")})`)
    .join(",\n");
  const updates = updateColumns
    .filter((column) => !conflictTarget.includes(column))
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(", ");

  return [
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES`,
    values,
    updates ? `ON CONFLICT (${conflictTarget.join(", ")}) DO UPDATE SET ${updates};` : `ON CONFLICT (${conflictTarget.join(", ")}) DO NOTHING;`
  ].join("\n");
}

const sourceRows = seed.sources.map((source) => ({
  id: source.id,
  source_type: source.sourceType || "web",
  url: source.url,
  title: source.title,
  publisher: source.publisher,
  published_at: source.date,
  fetched_at: source.fetchedAt || null,
  license_note: source.licenseNote || null,
  content_hash: source.contentHash || null,
  note: source.note
}));

const entityRows = seed.entities.map((entity) => ({
  id: entity.id,
  type: entity.type,
  name: entity.name,
  slug: entity.id || slugify(entity.name),
  layer: entity.layer,
  description: entity.description,
  website_url: entity.website_url || null,
  country: entity.country || null,
  status: entity.status,
  valuation: entity.valuation
}));

const aliasRows = [
  ...new Map(
    seed.entities.flatMap((entity) =>
      (entity.aliases || []).map((alias) => [
        `${entity.id}:${alias.toLowerCase()}`,
        {
    id: stableId("alias", entity.id, alias),
    entity_id: entity.id,
    alias,
    alias_type: "name",
    source_id: "src_manual"
        }
      ])
    )
  ).values()
];

const companyProfileRows = seed.entities
  .filter((entity) => entity.type === "company")
  .map((entity) => ({
    entity_id: entity.id,
    ticker: entity.ticker || null,
    exchange: entity.exchange || null,
    headquarters: entity.country || null,
    is_public: entity.status === "public"
  }));

const relationshipRows = seed.relationships.map((relationship) => ({
  id: relationship.id,
  source_entity_id: relationship.source,
  target_entity_id: relationship.target,
  relation_type: relationship.type,
  confidence: relationship.confidence,
  is_inferred:
    relationship.confidence < 0.6 ||
    relationship.reviewStatus === "inferred_ecosystem_mapping" ||
    relationship.reviewStatus === "needs_direct_evidence",
  extraction_method: relationship.evidenceUrl
    ? "evidence_override_seed"
    : relationship.sourceId === "src_manual"
      ? "manual_seed"
      : "public_source_seed",
  status: "approved",
  note: relationship.reviewNote ? `${relationship.note} Review: ${relationship.reviewNote}` : relationship.note
}));

const relationshipEvidenceRows = seed.relationships.map((relationship) => {
  const source = seed.sources.find((item) => item.id === relationship.sourceId);
  return {
    id: stableId("evidence", relationship.id, relationship.sourceId),
    relationship_id: relationship.id,
    source_id: relationship.sourceId,
    evidence_title: relationship.evidenceTitle || source?.title || relationship.sourceId,
    evidence_url: relationship.evidenceUrl || source?.url || "",
    evidence_date: relationship.evidenceDate || source?.date || null,
    notes: relationship.evidenceNote || relationship.note
  };
});

const metricRows = metricBundle.metrics.flatMap((group) => {
  const sourceId = sourceByMetricProvider.get(group.source);
  if (!sourceId) {
    warnings.push(`metric provider ${group.source} does not map to a source row`);
  }

  return Object.entries(group.metrics)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([metricType, value]) => ({
      id: stableId("metric", group.entityId, group.source, group.sourceRef || "na", group.asOf, metricType),
      entity_id: group.entityId,
      metric_type: metricType,
      value_number: typeof value === "number" ? value : null,
      value_text: typeof value === "number" ? null : String(value),
      as_of_date: group.asOf,
      source_id: sourceId || null,
      source_ref: group.sourceRef || null,
      confidence: group.source === "sec" ? 1 : 0.7,
      is_estimated: false
    }));
});

const plan = {
  mode: "dry-run",
  tables: {
    source: sourceRows.length,
    entity: entityRows.length,
    entity_alias: aliasRows.length,
    entity_redirect: 0,
    company_profile: companyProfileRows.length,
    relationship: relationshipRows.length,
    relationship_evidence: relationshipEvidenceRows.length,
    metric: metricRows.length,
    connector_run: 0,
    raw_document: 0,
    candidate_relationship: 0,
    candidate_entity: 0,
    candidate_metric: 0,
    audit_log: 0
  },
  samples: {
    entity: entityRows.slice(0, 3),
    relationship: relationshipRows.slice(0, 3),
    metric: metricRows.slice(0, 3)
  },
  warnings
};

[
  ["source", sourceRows],
  ["entity", entityRows],
  ["entity_alias", aliasRows],
  ["relationship", relationshipRows],
  ["relationship_evidence", relationshipEvidenceRows],
  ["metric", metricRows]
].forEach(([label, rows]) => countDuplicateIds(rows, label));

const schemaSql = fs.readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
const importSql = [
  "-- AI Capital Map seed import",
  "-- Generated from data/seed.js, data/p1-extension.js and data/metrics.js",
  "BEGIN;",
  schemaSql,
  sqlInsert(
    "source",
    ["id", "source_type", "url", "title", "publisher", "published_at", "fetched_at", "license_note", "content_hash", "note"],
    sourceRows,
    ["id"]
  ),
  sqlInsert(
    "entity",
    ["id", "type", "name", "slug", "layer", "description", "website_url", "country", "status", "valuation"],
    entityRows,
    ["id"]
  ),
  sqlInsert(
    "entity_alias",
    ["id", "entity_id", "alias", "alias_type", "source_id"],
    aliasRows,
    ["id"]
  ),
  sqlInsert(
    "company_profile",
    ["entity_id", "ticker", "exchange", "headquarters", "is_public"],
    companyProfileRows,
    ["entity_id"]
  ),
  sqlInsert(
    "relationship",
    [
      "id",
      "source_entity_id",
      "target_entity_id",
      "relation_type",
      "confidence",
      "is_inferred",
      "extraction_method",
      "status",
      "note"
    ],
    relationshipRows,
    ["id"]
  ),
  sqlInsert(
    "relationship_evidence",
    ["id", "relationship_id", "source_id", "evidence_title", "evidence_url", "evidence_date", "notes"],
    relationshipEvidenceRows,
    ["id"]
  ),
  sqlInsert(
    "metric",
    [
      "id",
      "entity_id",
      "metric_type",
      "value_number",
      "value_text",
      "as_of_date",
      "source_id",
      "source_ref",
      "confidence",
      "is_estimated"
    ],
    metricRows,
    ["id"]
  ),
  "COMMIT;"
]
  .filter(Boolean)
  .join("\n\n");

const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : "";

if (args.has("--json")) {
  console.log(JSON.stringify(plan, null, 2));
} else if (args.has("--sql") || outputPath) {
  if (outputPath) {
    fs.writeFileSync(outputPath, `${importSql}\n`);
    console.log(`Wrote seed import SQL to ${outputPath}`);
  } else {
    console.log(importSql);
  }
} else if (args.has("--apply")) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required for --apply.");
    process.exit(1);
  }

  const tempPath = path.join(os.tmpdir(), `ai-capital-seed-import-${Date.now()}.sql`);
  fs.writeFileSync(tempPath, `${importSql}\n`);
  const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", tempPath], {
    encoding: "utf8",
    stdio: "pipe"
  });
  fs.rmSync(tempPath, { force: true });

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }

  console.log("Seed import applied successfully:");
  Object.entries(plan.tables).forEach(([table, count]) => {
    console.log(`- ${table}: ${count}`);
  });
} else {
  console.log("Seed import dry-run plan:");
  Object.entries(plan.tables).forEach(([table, count]) => {
    console.log(`- ${table}: ${count}`);
  });
  if (warnings.length > 0) {
    console.log("\nWarnings:");
    warnings.forEach((warning) => console.log(`- ${warning}`));
  }
}
