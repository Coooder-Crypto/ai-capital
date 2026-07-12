globalThis.window = {};
await import("../data/seed.js");
await import("../data/p1-extension.js");
await import("../data/metrics.js");
const { readMetricOverrides, validateMetricOverride } = await import("./metric-overrides.mjs");

const seed = globalThis.window.AI_CAPITAL_SEED;
const metricBundle = globalThis.window.AI_CAPITAL_METRICS;
const entityIds = new Set(seed.entities.map((entity) => entity.id));
const errors = [];
const overrideBundle = readMetricOverrides();

if (!metricBundle) {
  errors.push("AI_CAPITAL_METRICS was not loaded");
}

if (!Array.isArray(metricBundle?.metrics)) {
  errors.push("metrics must be an array");
}

(metricBundle?.metrics || []).forEach((entry, index) => {
  if (!entityIds.has(entry.entityId)) {
    errors.push(`metrics[${index}] references unknown entity: ${entry.entityId}`);
  }
  if (!entry.source) {
    errors.push(`metrics[${index}] is missing source`);
  }
  if (!entry.asOf) {
    errors.push(`metrics[${index}] is missing asOf`);
  }
  if (!entry.metrics || typeof entry.metrics !== "object") {
    errors.push(`metrics[${index}] is missing metrics object`);
  }
  if (entry.collectionMethod === "manual_review_override") {
    if (!entry.evidenceUrl || !String(entry.evidenceUrl).startsWith("https://")) {
      errors.push(`metrics[${index}] manual override must include https evidenceUrl`);
    }
    if (!entry.evidenceStrength) {
      errors.push(`metrics[${index}] manual override must include evidenceStrength`);
    }
    if (!entry.reviewNote) {
      errors.push(`metrics[${index}] manual override must include reviewNote`);
    }
  }
});

(overrideBundle.overrides || []).forEach((override, index) => {
  errors.push(...validateMetricOverride(override, index, entityIds));
});

const approvedEntitySources = new Set((metricBundle?.metrics || []).map((entry) => `${entry.entityId}|${entry.source}`));
(metricBundle?.rejectedOrFailed || []).forEach((entry, index) => {
  if (approvedEntitySources.has(`${entry.entityId}|${entry.source}`)) {
    errors.push(`rejectedOrFailed[${index}] duplicates an approved metric entity/source: ${entry.entityId}/${entry.source}`);
  }
});

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Metrics valid: ${metricBundle.metrics.length} approved metric groups.`);
