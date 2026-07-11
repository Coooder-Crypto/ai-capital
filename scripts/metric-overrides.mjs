import fs from "node:fs";

const defaultPath = new URL("../data/metric-overrides.json", import.meta.url);

export function readMetricOverrides(pathUrl = defaultPath) {
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

export function validateMetricOverride(override, index, entityIds) {
  const prefix = `metric-overrides[${index}]`;
  const errors = [];

  if (!override.entityId || !entityIds.has(override.entityId)) {
    errors.push(`${prefix} references unknown entity: ${override.entityId || "(missing)"}`);
  }
  if (!override.source) errors.push(`${prefix} is missing source`);
  if (!override.sourceRef) errors.push(`${prefix} is missing sourceRef`);
  if (!override.asOf) errors.push(`${prefix} is missing asOf`);
  if (!override.metrics || typeof override.metrics !== "object" || Array.isArray(override.metrics)) {
    errors.push(`${prefix} is missing metrics object`);
  }
  if (!override.evidenceUrl || !String(override.evidenceUrl).startsWith("https://")) {
    errors.push(`${prefix} must include an https evidenceUrl`);
  }
  if (!override.evidenceStrength) errors.push(`${prefix} is missing evidenceStrength`);
  if (!override.reviewNote) errors.push(`${prefix} is missing reviewNote`);

  return errors;
}

export function metricOverrideKey(entry) {
  return [entry.entityId, entry.source, entry.sourceRef].join("|");
}

export function normalizeMetricOverride(override) {
  return {
    entityId: override.entityId,
    source: override.source,
    sourceRef: override.sourceRef,
    asOf: override.asOf,
    metrics: override.metrics,
    evidenceUrl: override.evidenceUrl,
    evidenceStrength: override.evidenceStrength,
    collectionMethod: "manual_review_override",
    reviewNote: override.reviewNote
  };
}

export function mergeMetricOverrides(snapshot, overrideBundle) {
  const resultByKey = new Map((snapshot.results || []).map((result) => [metricOverrideKey({
    entityId: result.entityId,
    source: result.source,
    sourceRef: result.repo || result.model || result.cik || result.query || result.sourceRef || "unknown"
  }), result]));

  const overrideResults = [];
  const overriddenEntitySources = new Set();
  for (const override of overrideBundle.overrides || []) {
    const normalized = normalizeMetricOverride(override);
    const key = metricOverrideKey(normalized);
    if (!override.force && resultByKey.has(key)) continue;
    overrideResults.push(normalized);
    overriddenEntitySources.add(`${normalized.entityId}|${normalized.source}`);
  }

  return {
    generatedAt: snapshot.generatedAt,
    results: [...(snapshot.results || []), ...overrideResults],
    errors: (snapshot.errors || []).filter((error) => !overriddenEntitySources.has(`${error.entityId}|${error.source}`))
  };
}
