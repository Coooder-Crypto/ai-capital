import { spawnSync } from "node:child_process";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const args = process.argv.slice(2);
const fixtureArg = argValue("--fixture");
const workflowFileArg = argValue("--workflow-file");
const repoArg = argValue("--repo");
const environmentName = argValue("--environment") || "production";
const manifest = readJson("data/deployment-secrets.manifest.json");
const workflow = fs.readFileSync(workflowFileArg ? new URL(workflowFileArg, root) : new URL(".github/workflows/validate-p0-p3.yml", root), "utf8");
const errors = [];
const warnings = [];

function argValue(name) {
  const exactIndex = args.indexOf(name);
  if (exactIndex !== -1) return args[exactIndex + 1] || "";
  const prefixed = args.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : "";
}

function readJson(pathOrUrl) {
  return JSON.parse(fs.readFileSync(pathOrUrl instanceof URL ? pathOrUrl : new URL(pathOrUrl, root), "utf8"));
}

function listNames(value, key) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => (typeof item === "string" ? item : item?.name)).filter(Boolean);
  if (Array.isArray(value[key])) return listNames(value[key]);
  return [];
}

function gh(argsForGh, required = true) {
  const result = spawnSync("gh", argsForGh, {
    cwd: root.pathname,
    encoding: "utf8",
    stdio: "pipe"
  });
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || "").trim() || `gh ${argsForGh.join(" ")} failed`;
    if (required) errors.push(message);
    else warnings.push(message);
    return null;
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    errors.push(`gh ${argsForGh.join(" ")} returned non-JSON output`);
    return null;
  }
}

function loadLiveState() {
  const repo =
    repoArg ||
    gh(["repo", "view", "--json", "nameWithOwner"])?.nameWithOwner ||
    "";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    errors.push("--repo must be owner/repo, or gh repo view must resolve nameWithOwner");
    return { repository: repo };
  }
  return {
    repository: repo,
    environment: gh(["api", `repos/${repo}/environments/${environmentName}`]),
    environmentSecrets: gh(["api", `repos/${repo}/environments/${environmentName}/secrets`]),
    repositorySecrets: gh(["api", `repos/${repo}/actions/secrets`], false),
    environmentVariables: gh(["api", `repos/${repo}/environments/${environmentName}/variables`], false),
    repositoryVariables: gh(["api", `repos/${repo}/actions/variables`], false)
  };
}

function loadFixtureState() {
  const fixture = readJson(new URL(fixtureArg, root));
  return {
    repository: fixture.repository,
    environment: fixture.environment,
    environmentSecrets: fixture.environmentSecrets,
    repositorySecrets: fixture.repositorySecrets,
    environmentVariables: fixture.environmentVariables,
    repositoryVariables: fixture.repositoryVariables
  };
}

function requireWorkflowFragment(fragment) {
  if (!workflow.includes(fragment)) errors.push(`validate-p0-p3 workflow missing ${fragment}`);
}

const state = fixtureArg ? loadFixtureState() : loadLiveState();
const requiredSecrets = manifest.githubActions?.secrets?.map((entry) => entry.name) || [];
const requiredVars = manifest.githubActions?.vars?.map((entry) => entry.name) || [];
const environment = state.environment || {};
const protectionRules = environment.protection_rules || environment.protectionRules || [];
const environmentSecrets = new Set(listNames(state.environmentSecrets, "secrets"));
const repositorySecrets = new Set(listNames(state.repositorySecrets, "secrets"));
const environmentVariables = new Set(listNames(state.environmentVariables, "variables"));
const repositoryVariables = new Set(listNames(state.repositoryVariables, "variables"));

if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(state.repository || "")) {
  errors.push("repository must be owner/repo");
}
if ((environment.name || "") !== environmentName) {
  errors.push(`GitHub environment ${environmentName} is missing`);
}
if (!Array.isArray(protectionRules) || protectionRules.length === 0) {
  errors.push(`GitHub environment ${environmentName} must have at least one protection rule such as required reviewers`);
}

const missingSecrets = [];
const repoOnlySecrets = [];
for (const name of requiredSecrets) {
  if (environmentSecrets.has(name)) continue;
  if (repositorySecrets.has(name)) {
    repoOnlySecrets.push(name);
    continue;
  }
  missingSecrets.push(name);
}
if (missingSecrets.length) errors.push(`missing production secrets: ${missingSecrets.join(", ")}`);
if (repoOnlySecrets.length) {
  warnings.push(`required secrets are repository-scoped, not environment-scoped: ${repoOnlySecrets.join(", ")}`);
}

const missingVars = requiredVars.filter((name) => !environmentVariables.has(name) && !repositoryVariables.has(name));
if (missingVars.length) errors.push(`missing GitHub variables: ${missingVars.join(", ")}`);

for (const fragment of [
  "run-name: Validate P0-P3 (",
  "workflow_dispatch:",
  "production_llm:",
  "dispatch_token:",
  "environment: production",
  "P0_P3_EXPECTED_SOURCE_COMMIT: ${{ github.sha }}",
  "P0_P3_EXPECTED_GITHUB_REPOSITORY: ${{ github.repository }}",
  "P0_P3_EXPECTED_GITHUB_REF: refs/heads/main",
  "P0_P3_REQUIRE_GITHUB_EVIDENCE: \"true\"",
  "P0_P3_PRODUCTION_LLM_INPUT: ${{ github.event.inputs.production_llm }}",
  "P0_P3_PRODUCTION_ENVIRONMENT: production",
  "npm run validate:p0-p3:production -- --timeout-ms=30000 --limit=1 --write-evidence",
  "actions/upload-artifact@v4",
  "p0-p3-production-readiness-report",
  "if-no-files-found: error"
]) {
  requireWorkflowFragment(fragment);
}

const status = {
  ok: errors.length === 0,
  source: fixtureArg ? "fixture" : "gh",
  repository: state.repository || null,
  environment: environment.name || null,
  protectionRules: Array.isArray(protectionRules) ? protectionRules.map((rule) => rule.type || rule.name || "rule") : [],
  requiredSecrets: requiredSecrets.map((name) => ({
    name,
    scope: environmentSecrets.has(name) ? "environment" : repositorySecrets.has(name) ? "repository" : "missing"
  })),
  requiredVars: requiredVars.map((name) => ({
    name,
    scope: environmentVariables.has(name) ? "environment" : repositoryVariables.has(name) ? "repository" : "missing"
  })),
  warnings,
  errors
};

console.log(JSON.stringify(status, null, 2));
if (errors.length) process.exit(1);
