import fs from "node:fs/promises";
import { applyEvidenceOverrides } from "./evidence-overrides.mjs";

globalThis.window = {};
await import("../data/seed.js");
await import("../data/p1-extension.js");
await import("../data/metrics.js");

const seed = globalThis.window.AI_CAPITAL_SEED;
const metrics = globalThis.window.AI_CAPITAL_METRICS;

if (!seed) {
  throw new Error("AI_CAPITAL_SEED was not loaded");
}
applyEvidenceOverrides(seed);

await fs.mkdir(new URL("../src/generated", import.meta.url), { recursive: true });
await fs.writeFile(new URL("../src/generated/seed.json", import.meta.url), `${JSON.stringify(seed, null, 2)}\n`);
await fs.writeFile(new URL("../src/generated/metrics.json", import.meta.url), `${JSON.stringify(metrics || { metrics: [] }, null, 2)}\n`);

console.log(`Exported ${seed.entities.length} entities and ${(metrics?.metrics || []).length} metric groups for Next.js.`);
