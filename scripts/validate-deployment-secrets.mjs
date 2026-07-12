import fs from "node:fs";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL("data/deployment-secrets.manifest.json", root), "utf8"));
const envExample = fs.readFileSync(new URL(".env.example", root), "utf8");
const validateWorkflow = fs.readFileSync(new URL(".github/workflows/validate-p0-p3.yml", root), "utf8");
const weeklyWorkflow = fs.readFileSync(new URL(".github/workflows/research-weekly.yml", root), "utf8");
const setupGuidePath = new URL("data/research/production-setup-guide.md", root);
const setupGuide = fs.existsSync(setupGuidePath) ? fs.readFileSync(setupGuidePath, "utf8") : "";
const errors = [];
const warnings = [];

function hasEnvExampleKey(name) {
  return new RegExp(`^${name}=`, "m").test(envExample);
}

function requireFragment(label, text, fragment) {
  if (!text.includes(fragment)) errors.push(`${label} missing ${fragment}`);
}

function warnIfMissing(label, text, fragment) {
  if (!text.includes(fragment)) warnings.push(`${label} missing optional ${fragment}`);
}

const secrets = manifest.githubActions?.secrets || [];
const optionalSecrets = manifest.githubActions?.optionalSecrets || [];
const vars = manifest.githubActions?.vars || [];
const localOnly = manifest.localOnly || [];

if (manifest.schemaVersion !== 1) errors.push("deployment secrets manifest schemaVersion must be 1");

for (const entry of [...secrets, ...optionalSecrets, ...vars.map((item) => ({ name: item.name }))]) {
  if (!entry.name) errors.push("deployment secrets manifest entry is missing name");
  else if (!hasEnvExampleKey(entry.name)) errors.push(`.env.example missing ${entry.name}`);
}
for (const name of localOnly) {
  if (!hasEnvExampleKey(name)) errors.push(`.env.example missing local-only ${name}`);
}

for (const entry of secrets) {
  requireFragment("validate-p0-p3 workflow", validateWorkflow, `secrets.${entry.name}`);
  requireFragment("production setup guide", setupGuide, `gh secret set ${entry.name}`);
}
for (const entry of optionalSecrets) {
  warnIfMissing("validate-p0-p3 workflow", validateWorkflow, `secrets.${entry.name}`);
  warnIfMissing("production setup guide", setupGuide, `gh secret set ${entry.name}`);
}
for (const entry of vars) {
  requireFragment("validate-p0-p3 workflow", validateWorkflow, `vars.${entry.name}`);
  requireFragment("production setup guide", setupGuide, `gh variable set ${entry.name}`);
}

for (const name of ["LLM_EXTRACT_URL", "LLM_EXTRACT_API_KEY"]) {
  requireFragment("weekly workflow", weeklyWorkflow, `secrets.${name}`);
}
for (const name of ["LLM_EXTRACT_MODEL", "LLM_EXTRACT_RPM", "LLM_EXTRACT_MAX_RETRIES", "LLM_EXTRACT_RETRY_BASE_MS"]) {
  requireFragment("weekly workflow", weeklyWorkflow, `vars.${name}`);
}
if (weeklyWorkflow.includes("\n          - command")) {
  errors.push("weekly workflow must not expose llm_provider=command unless LLM_EXTRACT_COMMAND is added to deployment manifest");
}
requireFragment("production setup guide", setupGuide, "gh workflow run \"Validate P0-P3\" --repo OWNER/REPO --ref main -f production_llm=true -f dispatch_token=UNIQUE_UUID");
requireFragment("production setup guide", setupGuide, "npm run validate:github-production-preflight -- --repo=OWNER/REPO");
requireFragment("production setup guide", setupGuide, "npm run validate:p0-p3:production -- --provider=http");
requireFragment("production setup guide", setupGuide, "--write-evidence");
requireFragment("production setup guide", setupGuide, "non-localhost");
requireFragment("production setup guide", setupGuide, "p0-p3-production-readiness-report");
requireFragment("production setup guide", setupGuide, "data/research/p0-p3-production-readiness-report.json");
requireFragment("production setup guide", setupGuide, "data/research/p0-p3-completion-matrix.json");
requireFragment("production setup guide", setupGuide, "data/research/p0-p3-production-release-checklist.json");
requireFragment("production setup guide", setupGuide, "P0_P3_GITHUB_RUN_ID");
requireFragment("production setup guide", setupGuide, "P0_P3_GITHUB_RUN_ATTEMPT");
requireFragment("production setup guide", setupGuide, "npm run validate:production-artifact");
requireFragment("production setup guide", setupGuide, "npm run validate:production-completion");
requireFragment("production setup guide", setupGuide, "gh run view GITHUB_RUN_ID --repo OWNER/REPO --json databaseId,workflowName,name,event,status,conclusion,headSha,headBranch,attempt,createdAt,url");
requireFragment("production setup guide", setupGuide, "GitHub Actions URL under the expected repository and run id");
requireFragment("production setup guide", setupGuide, "--dispatch-started-at");
requireFragment("production setup guide", setupGuide, "--run-metadata-file=data/research/p0-p3-production-readiness-report-artifact/run-metadata.json");
requireFragment("production setup guide", setupGuide, "npm run production:p0-p3:run");
requireFragment("production setup guide", setupGuide, "npm run audit:p0-p3:matrix");
requireFragment("production setup guide", setupGuide, "npm run production:p0-p3:checklist");
requireFragment("production setup guide", setupGuide, "npm run validate:production-release-checklist");
requireFragment("production setup guide", setupGuide, "p0-p3-production-release-checklist.json");
requireFragment("production setup guide", setupGuide, "productionEvidenceDiagnostics");
requireFragment("production setup guide", setupGuide, "local_ready_production_pending");
requireFragment("production setup guide", setupGuide, "diagnostics are for troubleshooting only");
for (const fragment of [
  "actions/upload-artifact@v4",
  "p0-p3-production-readiness-report",
  "data/research/p0-p3-production-readiness-report.json",
  "P0_P3_GITHUB_RUN_ID: ${{ github.run_id }}",
  "P0_P3_GITHUB_RUN_ATTEMPT: ${{ github.run_attempt }}"
]) {
  requireFragment("validate-p0-p3 workflow", validateWorkflow, fragment);
}
for (const fragment of [
  "npm run db:import",
  "npm run worker:import",
  "npm run db:status -- --require-ready",
  "npm run db:verify",
  "npm run worker:verify",
  "npm run db:verify:p3-persistent"
]) {
  requireFragment("production setup guide", setupGuide, fragment);
}

const status = {
  ok: errors.length === 0,
  requiredSecrets: secrets.map((entry) => entry.name),
  optionalSecrets: optionalSecrets.map((entry) => entry.name),
  vars: vars.map((entry) => entry.name),
  localOnly,
  setupGuide: fs.existsSync(setupGuidePath),
  warnings,
  errors
};

console.log(JSON.stringify(status, null, 2));
if (errors.length) process.exit(1);
