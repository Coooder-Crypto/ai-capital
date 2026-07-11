import fs from "node:fs/promises";
import { applyEvidenceOverrides } from "./evidence-overrides.mjs";

globalThis.window = {};
await import("../data/seed.js");
await import("../data/p1-extension.js");
await import("../data/metrics.js");

const seed = globalThis.window.AI_CAPITAL_SEED;
const metrics = globalThis.window.AI_CAPITAL_METRICS || { metrics: [] };
const generatedSeed = JSON.parse(await fs.readFile(new URL("../src/generated/seed.json", import.meta.url), "utf8"));
const generatedMetrics = JSON.parse(await fs.readFile(new URL("../src/generated/metrics.json", import.meta.url), "utf8"));

const errors = [];

function assertEqual(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(`${label} is stale. Run npm run export:data.`);
  }
}

if (!seed) {
  errors.push("AI_CAPITAL_SEED was not loaded");
} else {
  applyEvidenceOverrides(seed);
  assertEqual("src/generated/seed.json", generatedSeed, seed);
}

assertEqual("src/generated/metrics.json", generatedMetrics, metrics);

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `Next generated data valid: ${generatedSeed.entities.length} entities, ${generatedSeed.relationships.length} relationships, ${generatedMetrics.metrics.length} metric groups.`
);
