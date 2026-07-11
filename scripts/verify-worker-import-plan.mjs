import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = new URL("../", import.meta.url);
const candidateSnapshotPath = new URL("data/candidate-snapshot.json", root);
const snapshot = JSON.parse(fs.readFileSync(candidateSnapshotPath, "utf8"));
const tempPath = path.join(os.tmpdir(), `ai-capital-candidate-entity-snapshot-${Date.now()}.json`);

snapshot.candidateEntities = [
  {
    id: "candidate_entity_fixture_model",
    entityId: "fixture_model",
    type: "model",
    name: "Fixture Model",
    layer: "foundation_model",
    description: "Fixture candidate entity for worker import planning.",
    websiteUrl: "https://example.com/fixture-model",
    country: "US",
    statusText: "private",
    valuation: "Unknown",
    aliases: ["Fixture"],
    confidence: 0.72,
    evidenceUrl: "https://example.com/fixture-model",
    extractionMethod: "fixture_test",
    status: "candidate",
    payload: { test: true },
    createdAt: "2026-07-04T00:00:00.000Z"
  }
];

try {
  fs.writeFileSync(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  const result = spawnSync(
    process.execPath,
    ["scripts/plan-worker-import.mjs", "--json", `--candidate-snapshot=${tempPath}`],
    {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
      stdio: "pipe"
    }
  );

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }

  const plan = JSON.parse(result.stdout);
  const errors = [];
  if (plan.tables.candidate_entity !== 1) {
    errors.push(`candidate_entity: expected 1, got ${plan.tables.candidate_entity}`);
  }
  if (plan.samples.candidate_entity?.[0]?.id !== "candidate_entity_fixture_model") {
    errors.push("candidate_entity sample should include fixture candidate entity");
  }
  if ((plan.tables.candidate_relationship || 0) < 1) {
    errors.push("candidate_relationship rows should still be present when overriding candidate snapshot");
  }

  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }

  console.log("Worker import plan verified with candidate entity fixture:");
  console.log(`- candidate_relationship: ${plan.tables.candidate_relationship}`);
  console.log(`- candidate_entity: ${plan.tables.candidate_entity}`);
  console.log(`- candidate_metric: ${plan.tables.candidate_metric}`);
} finally {
  fs.rmSync(tempPath, { force: true });
}
