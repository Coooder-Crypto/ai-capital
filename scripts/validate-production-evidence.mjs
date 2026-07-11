import fs from "node:fs";

const root = new URL("../", import.meta.url);
const fileArg = process.argv.find((arg) => arg.startsWith("--file="))?.split("=")[1];
const evidencePath = fileArg ? new URL(fileArg, root) : new URL("data/research/p0-p3-production-readiness-report.json", root);
const evidenceLabel = fileArg || "data/research/p0-p3-production-readiness-report.json";
const requireEvidence = process.argv.includes("--require");
const errors = [];
const warnings = [];
const maxAgeDays = Number(process.env.P0_P3_PRODUCTION_EVIDENCE_MAX_AGE_DAYS || "14");
const maxFutureSkewMs = 5 * 60 * 1000;
const expectedSourceCommit = process.env.P0_P3_EXPECTED_SOURCE_COMMIT || "";
const requireGithubEvidence = process.env.P0_P3_REQUIRE_GITHUB_EVIDENCE === "true";
const expectedGithubRepository = process.env.P0_P3_EXPECTED_GITHUB_REPOSITORY || "";
const expectedGithubRef = process.env.P0_P3_EXPECTED_GITHUB_REF || "";

function isLocalServiceHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function parseUrlField(label, value) {
  if (!value || typeof value !== "string") {
    errors.push(`${label} is required`);
    return null;
  }
  try {
    return new URL(value);
  } catch {
    errors.push(`${label} must be a valid URL`);
    return null;
  }
}

function requireCommand(commands, expected) {
  if (!commands.includes(expected)) errors.push(`production evidence missing command: ${expected}`);
}

function commandTokens(command) {
  return typeof command === "string" ? command.trim().split(/\s+/).filter(Boolean) : [];
}

function commandHasToken(command, token) {
  return commandTokens(command).includes(token);
}

function validGitCommit(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/i.test(value);
}

function validGithubRunId(value) {
  return typeof value === "string" && /^\d+$/.test(value);
}

function validGithubRepository(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function validGithubRef(value) {
  return typeof value === "string" && /^refs\/heads\/[A-Za-z0-9._/-]+$/.test(value);
}

if (expectedSourceCommit && !validGitCommit(expectedSourceCommit)) {
  errors.push("P0_P3_EXPECTED_SOURCE_COMMIT must be a full git SHA when set");
}
if (expectedGithubRepository && !validGithubRepository(expectedGithubRepository)) {
  errors.push("P0_P3_EXPECTED_GITHUB_REPOSITORY must be owner/repo when set");
}
if (expectedGithubRef && !validGithubRef(expectedGithubRef)) {
  errors.push("P0_P3_EXPECTED_GITHUB_REF must be refs/heads/<name> when set");
}

let evidence = null;
if (!fs.existsSync(evidencePath)) {
  if (requireEvidence) errors.push("production readiness evidence is required");
  else warnings.push("production readiness evidence is not present");
} else {
  try {
    evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  } catch {
    errors.push("production readiness evidence must be valid JSON");
  }
}

if (evidence) {
  if (evidence.status !== "pass") errors.push("production evidence status must be pass");
  if (evidence.provider !== "http") errors.push("production evidence provider must be http");
  if (evidence.allowLocalServices !== false) errors.push("production evidence must not allow local services");
  if (evidence.adminAuthMode !== "session") errors.push("production evidence adminAuthMode must be session");
  if (!validGitCommit(evidence.sourceRevision?.gitCommit)) {
    errors.push("production evidence sourceRevision.gitCommit must be a full git SHA");
  } else if (expectedSourceCommit && evidence.sourceRevision.gitCommit.toLowerCase() !== expectedSourceCommit.toLowerCase()) {
    errors.push("production evidence sourceRevision.gitCommit must match P0_P3_EXPECTED_SOURCE_COMMIT");
  }
  if (requireGithubEvidence) {
    if (!validGithubRunId(evidence.sourceRevision?.githubRunId)) {
      errors.push("production evidence sourceRevision.githubRunId must be a GitHub run id");
    }
    if (evidence.sourceRevision?.githubWorkflow !== "Validate P0-P3") {
      errors.push("production evidence sourceRevision.githubWorkflow must be Validate P0-P3");
    }
    if (!validGithubRepository(evidence.sourceRevision?.githubRepository)) {
      errors.push("production evidence sourceRevision.githubRepository must be owner/repo");
    }
    if (!validGithubRunId(evidence.sourceRevision?.githubRunAttempt)) {
      errors.push("production evidence sourceRevision.githubRunAttempt must be a GitHub run attempt");
    }
    if (!validGithubRef(evidence.sourceRevision?.githubRef)) {
      errors.push("production evidence sourceRevision.githubRef must be a GitHub ref");
    }
    if (evidence.sourceRevision?.githubEventName !== "workflow_dispatch") {
      errors.push("production evidence sourceRevision.githubEventName must be workflow_dispatch");
    }
    if (evidence.sourceRevision?.productionLlmInput !== "true") {
      errors.push("production evidence sourceRevision.productionLlmInput must be true");
    }
    if (evidence.sourceRevision?.productionEnvironment !== "production") {
      errors.push("production evidence sourceRevision.productionEnvironment must be production");
    }
  }
  if (
    expectedGithubRepository &&
    validGithubRepository(evidence.sourceRevision?.githubRepository) &&
    evidence.sourceRevision.githubRepository.toLowerCase() !== expectedGithubRepository.toLowerCase()
  ) {
    errors.push("production evidence sourceRevision.githubRepository must match P0_P3_EXPECTED_GITHUB_REPOSITORY");
  }
  if (expectedGithubRef && validGithubRef(evidence.sourceRevision?.githubRef) && evidence.sourceRevision.githubRef !== expectedGithubRef) {
    errors.push("production evidence sourceRevision.githubRef must match P0_P3_EXPECTED_GITHUB_REF");
  }

  const generatedAt = Date.parse(evidence.generatedAt || "");
  if (!Number.isFinite(generatedAt)) {
    errors.push("production evidence generatedAt must be an ISO timestamp");
  } else {
    const now = Date.now();
    if (generatedAt > now + maxFutureSkewMs) {
      errors.push("production evidence generatedAt must not be in the future");
    }
    if (Number.isFinite(maxAgeDays) && maxAgeDays > 0) {
      const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
      if (now - generatedAt > maxAgeMs) {
        errors.push(`production evidence generatedAt must be within ${maxAgeDays} days`);
      }
    }
  }

  const databaseUrl = parseUrlField("production evidence databaseUrl", evidence.databaseUrl);
  if (databaseUrl) {
    if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
      errors.push("production evidence databaseUrl must be postgres/postgresql");
    }
    if (isLocalServiceHost(databaseUrl.hostname)) {
      errors.push("production evidence databaseUrl must be non-localhost");
    }
    if (databaseUrl.password && databaseUrl.password !== "REDACTED") {
      errors.push("production evidence databaseUrl password must be redacted");
    }
    if (databaseUrl.username && databaseUrl.username !== "REDACTED") {
      errors.push("production evidence databaseUrl username must be redacted");
    }
  }

  const llmUrl = parseUrlField("production evidence llmUrl", evidence.llmUrl);
  if (llmUrl) {
    if (!["http:", "https:"].includes(llmUrl.protocol)) {
      errors.push("production evidence llmUrl must be http/https");
    }
    if (isLocalServiceHost(llmUrl.hostname)) {
      errors.push("production evidence llmUrl must be non-localhost");
    }
    if (llmUrl.password && llmUrl.password !== "REDACTED") {
      errors.push("production evidence llmUrl password must be redacted");
    }
    if (llmUrl.username && llmUrl.username !== "REDACTED") {
      errors.push("production evidence llmUrl username must be redacted");
    }
  }

  const commands = Array.isArray(evidence.commands) ? evidence.commands : [];
  if (commands.some((command) => commandHasToken(command, "--allow-local-services"))) {
    errors.push("production evidence commands must not include --allow-local-services");
  }
  if (
    !commands.some(
      (command) =>
        command.startsWith("npm run validate:p0-p3:production -- ") &&
        commandHasToken(command, "--provider=http") &&
        commandHasToken(command, "--write-evidence")
    )
  ) {
    errors.push("production evidence missing validate:p0-p3:production http --write-evidence command");
  }
  requireCommand(commands, "npm run validate:env -- --require-production");
  requireCommand(commands, "npm run db:status -- --require-ready");
  requireCommand(commands, "npm run db:verify");
  requireCommand(commands, "npm run worker:verify");
  requireCommand(commands, "npm run db:verify:p3-persistent");
  requireCommand(commands, "npm run audit:p0-p3 -- --require-production-llm");
  if (!commands.some((command) => command.startsWith("npm run llm:verify-production -- --provider=http "))) {
    errors.push("production evidence missing llm:verify-production http command");
  }
}

const status = {
  ok: errors.length === 0,
  present: Boolean(evidence),
  evidence: evidence ? evidenceLabel : null,
  warnings,
  errors
};

console.log(JSON.stringify(status, null, 2));
if (errors.length) process.exit(1);
