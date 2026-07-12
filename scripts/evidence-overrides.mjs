import fs from "node:fs";

export function readEvidenceOverrides(pathUrl = new URL("../data/evidence-overrides.json", import.meta.url)) {
  try {
    const bundle = JSON.parse(fs.readFileSync(pathUrl, "utf8"));
    return {
      generatedAt: bundle.generatedAt || null,
      overrides: Array.isArray(bundle.overrides) ? bundle.overrides : []
    };
  } catch (error) {
    if (error.code === "ENOENT") return { generatedAt: null, overrides: [] };
    throw error;
  }
}

export function readRelationshipReviewOverrides(pathUrl = new URL("../data/relationship-review-overrides.json", import.meta.url)) {
  try {
    const bundle = JSON.parse(fs.readFileSync(pathUrl, "utf8"));
    return {
      generatedAt: bundle.generatedAt || null,
      overrides: Array.isArray(bundle.overrides) ? bundle.overrides : []
    };
  } catch (error) {
    if (error.code === "ENOENT") return { generatedAt: null, overrides: [] };
    throw error;
  }
}

export function evidenceOverrideByRelationshipId(bundle = readEvidenceOverrides()) {
  return new Map(bundle.overrides.map((override) => [override.relationshipId, override]));
}

export function relationshipReviewOverrideByRelationshipId(bundle = readRelationshipReviewOverrides()) {
  return new Map(bundle.overrides.map((override) => [override.relationshipId, override]));
}

export function applyEvidenceOverrides(seed, bundle = readEvidenceOverrides(), reviewBundle = readRelationshipReviewOverrides()) {
  const overrideById = evidenceOverrideByRelationshipId(bundle);
  const reviewOverrideById = relationshipReviewOverrideByRelationshipId(reviewBundle);
  seed.relationships.forEach((relationship) => {
    const override = overrideById.get(relationship.id);
    if (override) {
      Object.assign(relationship, {
        evidenceTitle: override.evidenceTitle,
        evidenceUrl: override.evidenceUrl,
        evidencePublisher: override.evidencePublisher,
        evidenceDate: override.evidenceDate,
        evidenceStrength: override.evidenceStrength,
        evidenceNote: override.note,
        reviewStatus: "reviewed_evidence_backed"
      });
    }
    const reviewOverride = reviewOverrideById.get(relationship.id);
    if (reviewOverride) {
      Object.assign(relationship, {
        confidence: reviewOverride.confidence ?? relationship.confidence,
        note: reviewOverride.note || relationship.note,
        reviewStatus: reviewOverride.reviewStatus || relationship.reviewStatus || "needs_direct_evidence",
        reviewNote: reviewOverride.reviewNote
      });
    }
  });
  return seed;
}
