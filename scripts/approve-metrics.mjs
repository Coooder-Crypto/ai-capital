import fs from "node:fs/promises";
import { mergeMetricOverrides, readMetricOverrides, validateMetricOverride } from "./metric-overrides.mjs";

const snapshotPath = new URL("../data/free-metrics.snapshot.json", import.meta.url);
const outputPath = new URL("../data/metrics.js", import.meta.url);
const overridePath = process.env.METRIC_OVERRIDES_PATH ? new URL(process.env.METRIC_OVERRIDES_PATH, import.meta.url) : undefined;

globalThis.window = {};
await import("../data/seed.js");

const seed = globalThis.window.AI_CAPITAL_SEED;
const entityIds = new Set((seed?.entities || []).map((entity) => entity.id));
const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf8"));
const overrideBundle = readMetricOverrides(overridePath);
const overrideErrors = (overrideBundle.overrides || []).flatMap((override, index) => validateMetricOverride(override, index, entityIds));

if (overrideErrors.length > 0) {
  console.error(overrideErrors.join("\n"));
  process.exit(1);
}

const mergedSnapshot = mergeMetricOverrides(snapshot, overrideBundle);

const approvedMetrics = mergedSnapshot.results.map((result) => ({
  entityId: result.entityId,
  source: result.source,
  sourceRef: result.sourceRef || result.repo || result.model || result.cik || result.query,
  asOf: result.asOf,
  metrics: result.metrics,
  evidenceUrl: result.evidenceUrl,
  evidenceStrength: result.evidenceStrength,
  collectionMethod: result.collectionMethod,
  reviewNote: result.reviewNote
}));

const output = `(() => {
  window.AI_CAPITAL_METRICS = ${JSON.stringify(
    {
      generatedAt: mergedSnapshot.generatedAt,
      approvedAt: new Date().toISOString(),
      metrics: approvedMetrics,
      rejectedOrFailed: mergedSnapshot.errors || []
    },
    null,
    2
  )};
})();
`;

await fs.writeFile(outputPath, output);
console.log(`Approved ${approvedMetrics.length} metric groups into data/metrics.js.`);
