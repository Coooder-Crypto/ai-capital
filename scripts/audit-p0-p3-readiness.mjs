import fs from "node:fs";

globalThis.window = {};
await import("../data/seed.js");
await import("../data/p1-extension.js");
await import("../data/metrics.js");

import { applyEvidenceOverrides, readEvidenceOverrides, readRelationshipReviewOverrides } from "./evidence-overrides.mjs";

const args = new Set(process.argv.slice(2));
const requireProductionLlm = args.has("--require-production-llm");
const jsonOnly = args.has("--json");
const writeReport = args.has("--write-report");
const root = new URL("../", import.meta.url);

function readJson(path) {
  return JSON.parse(fs.readFileSync(new URL(path, root), "utf8"));
}

function exists(path) {
  return fs.existsSync(new URL(path, root));
}

function packageScript(name) {
  return packageJson.scripts?.[name] || null;
}

function readText(path) {
  return fs.readFileSync(new URL(path, root), "utf8");
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item) || "none";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function pass(label, details = {}) {
  checks.push({ label, status: "pass", ...details });
}

function fail(label, reason, details = {}) {
  checks.push({ label, status: "fail", reason, ...details });
  failures.push({ label, reason });
}

function warn(label, reason, details = {}) {
  checks.push({ label, status: "warn", reason, ...details });
  warnings.push({ label, reason });
}

const packageJson = readJson("package.json");
const seed = globalThis.window.AI_CAPITAL_SEED;
const metricBundle = globalThis.window.AI_CAPITAL_METRICS || { metrics: [] };
const checks = [];
const failures = [];
const warnings = [];

if (!seed) {
  fail("seed data", "AI_CAPITAL_SEED was not loaded");
} else {
  pass("seed data", {
    entities: seed.entities?.length || 0,
    relationships: seed.relationships?.length || 0,
    sources: seed.sources?.length || 0
  });
}

pass("approved metrics", { groups: metricBundle.metrics?.length || 0 });

const requiredScripts = [
  "validate:p0-p3:local",
  "validate:p0-p3:production",
  "validate:p0-p3:production-fixture",
  "validate:source-revision-fixture",
  "validate:env-fixture",
  "validate:production-evidence",
  "validate:production-evidence-fixture",
  "validate:production-artifact",
  "validate:production-artifact-fixture",
  "validate:production-completion",
  "validate:production-completion-fixture",
  "validate:production-run-orchestrator-fixture",
  "validate:completion-matrix-artifact-fixture",
  "validate:production-release-checklist",
  "validate:production-release-checklist-fixture",
  "validate:env",
  "validate:deployment-secrets",
  "validate:github-production-preflight",
  "validate:github-production-preflight-fixture",
  "audit:p0-p3:write",
  "audit:p0-p3:matrix",
  "production:p0-p3:checklist",
  "production:p0-p3:run",
  "deploy:setup-guide",
  "validate:evidence",
  "validate:research",
  "db:e2e",
  "db:verify:p3-persistent",
  "worker:import",
  "llm:status",
  "validate:llm-http",
  "llm:verify-production",
  "research:weekly",
  "build"
];
for (const script of requiredScripts) {
  const command = packageScript(script);
  if (command) pass(`script ${script}`, { command });
  else fail(`script ${script}`, "missing package.json script");
}

for (const artifact of [
  "src/generated/seed.json",
  "src/generated/metrics.json",
  "data/candidate-snapshot.json",
  "data/evidence-backlog.json",
  "data/raw-documents.json",
  "data/parsed-documents.json",
  "data/extraction-candidates.json",
  "data/llm-extractions.json",
  "data/deployment-secrets.manifest.json",
  "data/research/production-setup-guide.md",
  "data/research/p0-p3-production-release-checklist.json",
  "data/research/graph-snapshot.json",
  "data/research/timeline.json",
  "data/research/candidate-snapshot-manifest.json",
  ".github/workflows/validate-p0-p3.yml",
  ".github/workflows/research-weekly.yml"
]) {
  if (exists(artifact)) pass(`artifact ${artifact}`);
  else fail(`artifact ${artifact}`, "missing required artifact");
}

function assertTextIncludes(label, text, fragments) {
  const missing = fragments.filter((fragment) => !text.includes(fragment));
  if (missing.length) {
    fail(label, `missing required workflow fragments: ${missing.join(", ")}`);
  } else {
    pass(label);
  }
}

if (exists(".github/workflows/validate-p0-p3.yml")) {
  const validationWorkflow = readText(".github/workflows/validate-p0-p3.yml");
  assertTextIncludes("validation workflow local gate", validationWorkflow, [
    "pull_request:",
    "branches:",
    "- main",
    "run-name: Validate P0-P3 (",
    "workflow_dispatch:",
    "production_llm:",
    "dispatch_token:",
    "sudo apt-get install -y postgresql",
    "npm run validate:p0-p3:local",
    "npm run audit:p0-p3:matrix",
    "npm run production:p0-p3:checklist",
    "npm run validate:production-release-checklist",
    "npm run validate:p0-p3:production-fixture"
  ]);
  assertTextIncludes("validation workflow production LLM gate", validationWorkflow, [
    "secrets.DATABASE_URL",
    "secrets.ADMIN_REVIEW_SESSION_SECRET",
    "secrets.LLM_EXTRACT_URL",
    "secrets.LLM_EXTRACT_API_KEY",
    "environment: production",
    "P0_P3_EXPECTED_SOURCE_COMMIT: ${{ github.sha }}",
    "P0_P3_EXPECTED_GITHUB_REPOSITORY: ${{ github.repository }}",
    "P0_P3_EXPECTED_GITHUB_REF: refs/heads/main",
    "P0_P3_REQUIRE_GITHUB_EVIDENCE: \"true\"",
    "P0_P3_GITHUB_RUN_ID: ${{ github.run_id }}",
    "P0_P3_GITHUB_RUN_ATTEMPT: ${{ github.run_attempt }}",
    "P0_P3_GITHUB_WORKFLOW: ${{ github.workflow }}",
    "P0_P3_GITHUB_EVENT_NAME: ${{ github.event_name }}",
    "P0_P3_PRODUCTION_LLM_INPUT: ${{ github.event.inputs.production_llm }}",
    "P0_P3_PRODUCTION_ENVIRONMENT: production",
    "npm run validate:p0-p3:production -- --timeout-ms=30000 --limit=1 --write-evidence",
    "npm run audit:p0-p3:matrix",
    "npm run production:p0-p3:checklist",
    "npm run validate:production-release-checklist",
    "actions/upload-artifact@v4",
    "p0-p3-production-readiness-report",
    "data/research/p0-p3-production-readiness-report.json",
    "data/research/p0-p3-completion-matrix.json",
    "data/research/p0-p3-production-release-checklist.json"
  ]);
  if (validationWorkflow.includes("--allow-local-services")) {
    fail("validation workflow production locality guard", "production workflow must not allow localhost services");
  } else {
    pass("validation workflow production locality guard");
  }
}

if (exists(".github/workflows/research-weekly.yml")) {
  const weeklyWorkflow = readText(".github/workflows/research-weekly.yml");
  assertTextIncludes("weekly workflow refresh gate", weeklyWorkflow, [
    "schedule:",
    "workflow_dispatch:",
    "llm_provider:",
    "npm run research:weekly",
    "npm run audit:p0-p3",
    "npm run audit:p0-p3 -- --require-production-llm"
  ]);
  assertTextIncludes("weekly workflow PR safety", weeklyWorkflow, [
    "git diff --quiet",
    "automation/weekly-research-refresh",
    "git add data src/generated",
    "gh pr create"
  ]);
}

const productionReadinessScript = readText("scripts/validate-production-readiness.mjs");
const sourceRevisionLib = readText("scripts/lib/source-revision.mjs");
assertTextIncludes("production gate database import verification", productionReadinessScript, [
  "npm run validate:p0-p3:production -- --provider=${provider} --timeout-ms=${timeoutMs} --limit=${limit} --write-evidence",
  "db:status",
  "db:verify",
  "worker:verify",
  "db:verify:p3-persistent"
]);
assertTextIncludes("production gate source revision binding", sourceRevisionLib, [
  "env.P0_P3_EXPECTED_SOURCE_COMMIT",
  "env.GITHUB_SHA",
  "env.SOURCE_COMMIT",
  "export function currentGitCommit",
  "rev-parse",
  "HEAD"
]);
assertTextIncludes("production gate source revision evidence fields", productionReadinessScript, [
  "envFirst(\"P0_P3_GITHUB_RUN_ID\", \"GITHUB_RUN_ID\")",
  "envFirst(\"P0_P3_GITHUB_RUN_ATTEMPT\", \"GITHUB_RUN_ATTEMPT\")",
  "envFirst(\"P0_P3_GITHUB_WORKFLOW\", \"GITHUB_WORKFLOW\")",
  "envFirst(\"P0_P3_GITHUB_EVENT_NAME\", \"GITHUB_EVENT_NAME\")",
  "envFirst(\"P0_P3_EXPECTED_GITHUB_REPOSITORY\", \"GITHUB_REPOSITORY\")",
  "envFirst(\"P0_P3_EXPECTED_GITHUB_REF\", \"GITHUB_REF\")"
]);

const productionCompletionScript = readText("scripts/validate-production-completion.mjs");
assertTextIncludes("production completion dispatch freshness guard", productionCompletionScript, [
  "const dispatchStartedAt = argValue(\"--dispatch-started-at\")",
  "--run-id requires --dispatch-started-at=<dispatch_iso_timestamp>",
  "\"databaseId,workflowName,name,event,status,conclusion,headSha,headBranch,attempt,createdAt,url\"",
  "GitHub run metadata createdAt must be at or after --dispatch-started-at"
]);

const productionEvidenceScript = readText("scripts/validate-production-evidence.mjs");
assertTextIncludes("production evidence command chain", productionEvidenceScript, [
  "production evidence missing validate:p0-p3:production http --write-evidence command",
  "command.startsWith(\"npm run validate:p0-p3:production -- \")",
  "commandHasToken(command, \"--provider=http\")",
  "commandHasToken(command, \"--write-evidence\")",
  "production evidence commands must not include --allow-local-services"
]);

const productionArtifactScript = readText("scripts/validate-production-artifact.mjs");
assertTextIncludes("production artifact rejects premature completion", productionArtifactScript, [
  "matrix.status === \"complete\"",
  "production artifact completion matrix must not be complete before validate:production-completion verifies GitHub run metadata",
  "production artifact release checklist schemaVersion must be 2",
  "production artifact release checklist items must include executable commands[]",
  "production artifact release checklist item command must match commands[0]",
  "production artifact release checklist items must include sequential id, pending_external status, category, and proof",
  "production artifact contains unexpected files; use a fresh artifact directory",
  "production artifact contains multiple run-metadata.json files",
  "readJsonFile(metadataPath, \"run metadata\")",
  "runMetadata: metadataPath ? path.relative(rootDir, metadataPath) : null",
  "buildProductionReleaseChecklist(matrix",
  "production artifact release checklist must match generated checklist for completion matrix"
]);

const productionReleaseChecklistLib = readText("scripts/lib/production-release-checklist.mjs");
assertTextIncludes("production release checklist shared rules", productionReleaseChecklistLib, [
  "export function buildProductionReleaseChecklist",
  "export function commandsForProductionReleaseItem",
  "schemaVersion: 2",
  "export P0_P3_EXPECTED_SOURCE_COMMIT='WORKFLOW_COMMIT_SHA'",
  "gh secret set ADMIN_REVIEW_SESSION_SECRET --env production",
  "gh secret set LLM_EXTRACT_URL --env production",
  "npm run db:status -- --require-ready",
  "npm run db:verify:p3-persistent",
  "npm run validate:production-completion -- --commit=WORKFLOW_COMMIT_SHA --repo=OWNER/REPO --ref=refs/heads/main --run-id=GITHUB_RUN_ID --dispatch-started-at=DISPATCH_ISO_TIMESTAMP --download"
]);

const productionRunScript = readText("scripts/run-production-p0-p3-completion.mjs");
assertTextIncludes("production run passes dispatch timestamp", productionRunScript, [
  "`--dispatch-started-at=${dispatchStartedAt}`"
]);
assertTextIncludes("production run pins release ref", productionRunScript, [
  "const productionRef = \"refs/heads/main\"",
  "--ref must be refs/heads/main because the production workflow pins P0_P3_EXPECTED_GITHUB_REF=refs/heads/main"
]);
assertTextIncludes("production run binds remote source commit", productionRunScript, [
  "randomUUID",
  "resolve production source commit",
  "`repos/${repository}/commits/${branch}`",
  "`dispatch_token=${dispatchToken}`",
  "run.displayTitle === expectedRunTitle",
  "run.headSha.toLowerCase() === expectedHeadSha.toLowerCase()",
  "`--commit=${expectedHeadSha}`"
]);

const productionReleaseChecklistScript = readText("scripts/generate-production-release-checklist.mjs");
assertTextIncludes("production release checklist command mapping", productionReleaseChecklistScript, [
  "buildProductionReleaseChecklist(matrix)",
  "comparableProductionReleaseChecklist(existing)",
  "comparableProductionReleaseChecklist(expected)"
]);

if (exists(".gitignore")) {
  const gitignore = readText(".gitignore");
  assertTextIncludes("production evidence gitignore", gitignore, [
    "data/research/p0-p3-production-readiness-report.json",
    "data/research/p0-p3-production-readiness-report-artifact/"
  ]);
}

if (exists("data/research/production-setup-guide.md")) {
  const productionSetupGuide = readText("data/research/production-setup-guide.md");
  assertTextIncludes("production setup guide database bootstrap", productionSetupGuide, [
    "npm run db:import",
    "npm run worker:import",
    "npm run db:status -- --require-ready",
    "npm run db:verify",
    "npm run worker:verify",
    "npm run db:verify:p3-persistent"
  ]);
  assertTextIncludes("production setup guide artifact validation", productionSetupGuide, [
    "GitHub Production Environment",
    "environment named `production`",
    "environment-scoped secrets",
    "required reviewers",
    "environment protection rule",
    "npm run validate:github-production-preflight -- --repo=OWNER/REPO",
    "does not upload the local working tree",
    "generates a unique dispatch UUID",
    "records its dispatch time",
    "ignores older successful workflow runs",
    "resolves the remote `main` commit before dispatch",
    "GitHub Actions URL does not match the expected repository and run id",
    "gh workflow run \"Validate P0-P3\" --repo OWNER/REPO --ref main -f production_llm=true -f dispatch_token=UNIQUE_UUID",
    "P0_P3_EXPECTED_SOURCE_COMMIT",
    "P0_P3_EXPECTED_GITHUB_REPOSITORY",
    "P0_P3_EXPECTED_GITHUB_REF",
    "P0_P3_REQUIRE_GITHUB_EVIDENCE",
    "P0_P3_GITHUB_RUN_ID",
    "P0_P3_GITHUB_RUN_ATTEMPT",
    "workflow_dispatch",
    "production_llm=true",
    "`production` environment",
    "fresh or empty artifact directory",
    "The uploaded artifact's completion matrix must still be `local_ready_production_pending`",
    "gh run download GITHUB_RUN_ID --repo OWNER/REPO --name p0-p3-production-readiness-report",
    "gh run view GITHUB_RUN_ID --repo OWNER/REPO --json databaseId,workflowName,name,event,status,conclusion,headSha,headBranch,attempt,createdAt,url",
    "--dispatch-started-at",
    "GitHub Actions URL under the expected repository and run id",
    "npm run validate:production-completion",
    "--run-metadata-file=data/research/p0-p3-production-readiness-report-artifact/run-metadata.json",
    "P0_P3_VERIFIED_GITHUB_RUN_ID",
    "P0_P3_VERIFIED_GITHUB_RUN_ATTEMPT",
    "sourceRevision.githubRunAttempt",
    "productionEvidenceDiagnostics",
    "local_ready_production_pending",
    "diagnostics are for troubleshooting only",
    "p0-p3-production-release-checklist.json",
    "npm run production:p0-p3:checklist",
    "npm run validate:production-release-checklist",
    "npm run production:p0-p3:run",
    "npm run audit:p0-p3:matrix"
  ]);
}

if (exists("README.md")) {
  const readme = readText("README.md");
  assertTextIncludes("README production completion freshness docs", readme, [
    "`createdAt` 不早于 `--dispatch-started-at`",
    "触发前解析远端 `main` 的 commit SHA",
    "唯一 dispatch UUID",
    "不会上传本地工作树",
    "手动调用 `validate:production-completion` 时，`--run-id` 也必须同时提供 `--dispatch-started-at`"
  ]);
}

if (exists("AI_INDUSTRY_CHAIN_TECH_PLAN.md")) {
  const techPlan = readText("AI_INDUSTRY_CHAIN_TECH_PLAN.md");
  assertTextIncludes("technical plan production completion freshness docs", techPlan, [
    "dispatch timestamp",
    "createdAt-after-dispatch",
    "--dispatch-started-at=...",
    "`createdAt` 不早于 `--dispatch-started-at`",
    "触发前解析远端 `main` 的 commit SHA",
    "唯一 dispatch UUID",
    "不会上传本地工作树",
    "手动调用 `validate:production-completion` 时，`--run-id` 也必须同时提供 `--dispatch-started-at`"
  ]);
}

const generatedSeed = readJson("src/generated/seed.json");
const candidateSnapshot = readJson("data/candidate-snapshot.json");
const evidenceBacklog = readJson("data/evidence-backlog.json");
const graphSnapshot = readJson("data/research/graph-snapshot.json");
const timeline = readJson("data/research/timeline.json");

if ((generatedSeed.entities?.length || 0) === (seed.entities?.length || 0)) {
  pass("generated seed entity parity", { entities: generatedSeed.entities.length });
} else {
  fail("generated seed entity parity", "src/generated/seed.json does not match seed entity count", {
    generated: generatedSeed.entities?.length || 0,
    source: seed.entities?.length || 0
  });
}

const candidateCounts = {
  relationships: candidateSnapshot.candidateRelationships?.length || 0,
  entities: candidateSnapshot.candidateEntities?.length || 0,
  metrics: candidateSnapshot.candidateMetrics?.length || 0
};
if (candidateCounts.relationships > 0 && candidateCounts.entities > 0 && candidateCounts.metrics > 0) {
  pass("candidate snapshot coverage", candidateCounts);
} else {
  fail("candidate snapshot coverage", "candidate snapshot must include relationship, entity and metric candidates", candidateCounts);
}

const graphCounts = graphSnapshot.counts || {};
for (const [key, expected] of [
  ["entities", seed.entities?.length || 0],
  ["relationships", seed.relationships?.length || 0],
  ["candidateRelationships", candidateCounts.relationships],
  ["candidateEntities", candidateCounts.entities],
  ["candidateMetrics", candidateCounts.metrics]
]) {
  if (graphCounts[key] === expected) pass(`graph snapshot ${key}`, { count: expected });
  else fail(`graph snapshot ${key}`, `expected ${expected}, got ${graphCounts[key] ?? "missing"}`);
}

const timelineEvents = timeline.events || [];
const timelineTypeCounts = countBy(timelineEvents, (event) => event.type);
for (const [type, expected] of [
  ["candidate_relationship", candidateCounts.relationships],
  ["candidate_entity", candidateCounts.entities],
  ["candidate_metric", candidateCounts.metrics]
]) {
  if (timelineTypeCounts[type] === expected) pass(`timeline ${type}`, { count: expected });
  else fail(`timeline ${type}`, `expected ${expected}, got ${timelineTypeCounts[type] || 0}`);
}

const candidateTimelineEvents = timelineEvents.filter((event) => event.type?.startsWith("candidate_"));
const missingStatus = candidateTimelineEvents.filter((event) => !event.status).length;
if (missingStatus === 0) pass("timeline candidate statuses", { events: candidateTimelineEvents.length });
else fail("timeline candidate statuses", `${missingStatus} candidate timeline events are missing status`);

applyEvidenceOverrides(seed, readEvidenceOverrides(), readRelationshipReviewOverrides());
const relationshipReviewCounts = countBy(seed.relationships || [], (relationship) => relationship.reviewStatus || "none");
const unreviewedPriorityBacklog = (evidenceBacklog.relationships || []).filter((relationship) => !relationship.reviewStatus).length;
if (unreviewedPriorityBacklog === 0) pass("evidence backlog review state", { relationships: evidenceBacklog.relationships?.length || 0, relationshipReviewCounts });
else fail("evidence backlog review state", `${unreviewedPriorityBacklog} evidence backlog relationships are missing reviewStatus`);

const productionProvider = process.env.LLM_EXTRACT_URL ? "http" : null;
if (productionProvider) {
  pass("production LLM provider configured", {
    provider: productionProvider,
    hasApiKey: Boolean(process.env.LLM_EXTRACT_API_KEY),
    model: process.env.LLM_EXTRACT_MODEL || null
  });
} else if (requireProductionLlm) {
  fail("production LLM provider configured", "LLM_EXTRACT_URL is required for production readiness");
} else {
  warn("production LLM provider configured", "not configured in this environment; run with --require-production-llm for release gating");
}

const audit = {
  status: failures.length ? "fail" : "pass",
  generatedAt: new Date().toISOString(),
  requireProductionLlm,
  checks,
  warnings,
  failures,
  summary: {
    entities: seed.entities?.length || 0,
    relationships: seed.relationships?.length || 0,
    approvedMetricGroups: metricBundle.metrics?.length || 0,
    candidateCounts,
    timelineEvents: timelineEvents.length,
    evidenceBacklogRelationships: evidenceBacklog.relationships?.length || 0,
    relationshipReviewCounts,
    productionProvider: productionProvider || "not_configured"
  }
};

if (writeReport) {
  const reportPath = new URL("data/research/p0-p3-readiness-report.json", root);
  fs.writeFileSync(reportPath, `${JSON.stringify(audit, null, 2)}\n`);
}

if (jsonOnly) {
  console.log(JSON.stringify(audit, null, 2));
} else {
  console.log(
    JSON.stringify(
      {
        status: audit.status,
        warnings: audit.warnings,
        failures: audit.failures,
        report: writeReport ? "data/research/p0-p3-readiness-report.json" : null,
        summary: audit.summary
      },
      null,
      2
    )
  );
}

if (failures.length) process.exit(1);
