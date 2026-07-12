import fs from "node:fs";
import {
  buildProductionReleaseChecklist,
  comparableProductionReleaseChecklist
} from "./lib/production-release-checklist.mjs";

const root = new URL("../", import.meta.url);
const matrixPath = new URL("data/research/p0-p3-completion-matrix.json", root);
const outputPath = new URL("data/research/p0-p3-production-release-checklist.json", root);
const checkOnly = process.argv.includes("--check");

function readJson(url) {
  return JSON.parse(fs.readFileSync(url, "utf8"));
}

const matrix = readJson(matrixPath);
const checklist = buildProductionReleaseChecklist(matrix);

if (checkOnly) {
  if (!fs.existsSync(outputPath)) {
    console.error("production release checklist is missing; run npm run production:p0-p3:checklist");
    process.exit(1);
  }
  const existing = readJson(outputPath);
  const expected = {
    ...checklist,
    generatedAt: existing.generatedAt
  };
  if (JSON.stringify(comparableProductionReleaseChecklist(existing)) !== JSON.stringify(comparableProductionReleaseChecklist(expected))) {
    console.error("production release checklist is stale; run npm run production:p0-p3:checklist");
    process.exit(1);
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        checklist: "data/research/p0-p3-production-release-checklist.json",
        pendingCount: existing.pendingCount,
        matrixStatus: existing.matrixStatus
      },
      null,
      2
    )
  );
} else {
  fs.writeFileSync(outputPath, `${JSON.stringify(checklist, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        checklist: "data/research/p0-p3-production-release-checklist.json",
        pendingCount: checklist.pendingCount,
        matrixStatus: checklist.matrixStatus
      },
      null,
      2
    )
  );
}
