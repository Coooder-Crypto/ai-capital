globalThis.window = {};
await import("../data/seed.js");
await import("../data/p1-extension.js");

import { applyEvidenceOverrides, readEvidenceOverrides, readRelationshipReviewOverrides } from "./evidence-overrides.mjs";

const seed = globalThis.window.AI_CAPITAL_SEED;
if (!seed) throw new Error("AI_CAPITAL_SEED was not loaded");

applyEvidenceOverrides(seed, readEvidenceOverrides(), readRelationshipReviewOverrides());

const sourceById = new Map(seed.sources.map((source) => [source.id, source]));
const backlog = seed.relationships
  .filter(
    (relationship) =>
      !relationship.evidenceUrl &&
      (relationship.sourceId === "src_manual" || relationship.sourceId === "src_ecosystem_mapping" || relationship.confidence < 0.65)
  )
  .map((relationship) => {
    const manualSourcePenalty = relationship.sourceId === "src_manual" || relationship.sourceId === "src_ecosystem_mapping" ? 1 : 0;
    const lowConfidencePenalty = Math.max(0, 0.75 - relationship.confidence);
    return {
      relationship,
      priority: Number((manualSourcePenalty + lowConfidencePenalty).toFixed(3)),
      currentSourceTitle: sourceById.get(relationship.sourceId)?.title || relationship.sourceId
    };
  })
  .sort((a, b) => b.priority - a.priority || a.relationship.id.localeCompare(b.relationship.id))
  .slice(0, 75);

const errors = [];
for (const item of backlog) {
  const relationship = item.relationship;
  if (!relationship.reviewStatus || relationship.reviewStatus === "unreviewed") {
    errors.push(`${relationship.id} is in top evidence backlog but has no reviewStatus`);
  }
  if (relationship.reviewStatus === "reviewed_evidence_backed") {
    errors.push(`${relationship.id} is reviewed_evidence_backed but still lacks direct evidenceUrl`);
  }
  if (
    (relationship.reviewStatus === "inferred_ecosystem_mapping" || relationship.reviewStatus === "needs_direct_evidence") &&
    !relationship.reviewNote
  ) {
    errors.push(`${relationship.id} is ${relationship.reviewStatus} but has no reviewNote`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const statusCounts = backlog.reduce((counts, item) => {
  const status = item.relationship.reviewStatus || "unreviewed";
  counts[status] = (counts[status] || 0) + 1;
  return counts;
}, {});

console.log(
  `Evidence review valid: top ${backlog.length} backlog relationships reviewed (${Object.entries(statusCounts)
    .map(([status, count]) => `${status}: ${count}`)
    .join(", ")}).`
);
