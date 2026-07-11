import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDir = new URL("../", import.meta.url).pathname;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-capital-production-evidence."));

function writeJson(name, value) {
  const filePath = path.join(tempDir, name);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function writeText(name, value) {
  const filePath = path.join(tempDir, name);
  fs.writeFileSync(filePath, value);
  return filePath;
}

function runValidator(filePath, extraEnv = {}) {
  return spawnSync("node", ["scripts/validate-production-evidence.mjs", `--file=${filePath}`, "--require"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      ...extraEnv
    }
  });
}

function assertPass(label, filePath, extraEnv = {}) {
  const result = runValidator(filePath, extraEnv);
  if (result.status !== 0) {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`${label} should pass production evidence validation`);
  }
}

function assertFail(label, filePath, expectedFragment, extraEnv = {}) {
  const result = runValidator(filePath, extraEnv);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status === 0) {
    process.stdout.write(output);
    throw new Error(`${label} should fail production evidence validation`);
  }
  if (!output.includes(expectedFragment)) {
    process.stdout.write(output);
    throw new Error(`${label} did not report expected fragment: ${expectedFragment}`);
  }
}

const validEvidence = {
  status: "pass",
  generatedAt: new Date().toISOString(),
  provider: "http",
  allowLocalServices: false,
  adminAuthMode: "session",
  sourceRevision: {
    gitCommit: "0123456789abcdef0123456789abcdef01234567",
    githubRunId: "123456789",
    githubWorkflow: "Validate P0-P3",
    githubRepository: "example/ai-capital-map",
    githubRunAttempt: "1",
    githubRef: "refs/heads/main",
    githubEventName: "workflow_dispatch",
    productionLlmInput: "true",
    productionEnvironment: "production"
  },
  databaseUrl: "postgres://REDACTED:REDACTED@prod-db.example.com:5432/ai_capital",
  llmUrl: "https://llm-gateway.example.com/extract",
  commands: [
    "npm run validate:p0-p3:production -- --provider=http --timeout-ms=30000 --limit=1 --write-evidence",
    "npm run validate:env -- --require-production",
    "npm run db:status -- --require-ready",
    "npm run db:verify",
    "npm run worker:verify",
    "npm run db:verify:p3-persistent",
    "npm run audit:p0-p3 -- --require-production-llm",
    "npm run llm:verify-production -- --provider=http --timeout-ms=30000 --limit=1"
  ]
};

try {
  assertPass("valid evidence", writeJson("valid.json", validEvidence));
  assertFail(
    "invalid evidence json",
    writeText("invalid-json.json", "{not json"),
    "production readiness evidence must be valid JSON"
  );
  assertPass("matching expected source commit", writeJson("matching-expected-source.json", validEvidence), {
    P0_P3_EXPECTED_SOURCE_COMMIT: validEvidence.sourceRevision.gitCommit
  });
  assertPass("required github evidence", writeJson("required-github-evidence.json", validEvidence), {
    P0_P3_REQUIRE_GITHUB_EVIDENCE: "true"
  });
  assertPass("matching expected github repository", writeJson("matching-expected-repository.json", validEvidence), {
    P0_P3_EXPECTED_GITHUB_REPOSITORY: validEvidence.sourceRevision.githubRepository
  });
  assertPass("matching expected github ref", writeJson("matching-expected-ref.json", validEvidence), {
    P0_P3_EXPECTED_GITHUB_REF: validEvidence.sourceRevision.githubRef
  });

  assertFail(
    "localhost database",
    writeJson("localhost-db.json", { ...validEvidence, databaseUrl: "postgres://REDACTED:REDACTED@127.0.0.1:5432/ai_capital" }),
    "production evidence databaseUrl must be non-localhost"
  );

  assertFail(
    "local services flag",
    writeJson("allow-local.json", { ...validEvidence, allowLocalServices: true }),
    "production evidence must not allow local services"
  );

  assertFail(
    "legacy admin auth mode",
    writeJson("legacy-auth.json", { ...validEvidence, adminAuthMode: "legacy_token" }),
    "production evidence adminAuthMode must be session"
  );

  assertFail(
    "missing source revision",
    writeJson("missing-source-revision.json", { ...validEvidence, sourceRevision: null }),
    "production evidence sourceRevision.gitCommit must be a full git SHA"
  );

  assertFail(
    "missing github run id",
    writeJson("missing-github-run-id.json", {
      ...validEvidence,
      sourceRevision: { ...validEvidence.sourceRevision, githubRunId: null }
    }),
    "production evidence sourceRevision.githubRunId must be a GitHub run id",
    { P0_P3_REQUIRE_GITHUB_EVIDENCE: "true" }
  );

  assertFail(
    "wrong github workflow",
    writeJson("wrong-github-workflow.json", {
      ...validEvidence,
      sourceRevision: { ...validEvidence.sourceRevision, githubWorkflow: "Other Workflow" }
    }),
    "production evidence sourceRevision.githubWorkflow must be Validate P0-P3",
    { P0_P3_REQUIRE_GITHUB_EVIDENCE: "true" }
  );

  assertFail(
    "missing github repository",
    writeJson("missing-github-repository.json", {
      ...validEvidence,
      sourceRevision: { ...validEvidence.sourceRevision, githubRepository: null }
    }),
    "production evidence sourceRevision.githubRepository must be owner/repo",
    { P0_P3_REQUIRE_GITHUB_EVIDENCE: "true" }
  );

  assertFail(
    "missing github run attempt",
    writeJson("missing-github-run-attempt.json", {
      ...validEvidence,
      sourceRevision: { ...validEvidence.sourceRevision, githubRunAttempt: null }
    }),
    "production evidence sourceRevision.githubRunAttempt must be a GitHub run attempt",
    { P0_P3_REQUIRE_GITHUB_EVIDENCE: "true" }
  );

  assertFail(
    "missing github ref",
    writeJson("missing-github-ref.json", {
      ...validEvidence,
      sourceRevision: { ...validEvidence.sourceRevision, githubRef: null }
    }),
    "production evidence sourceRevision.githubRef must be a GitHub ref",
    { P0_P3_REQUIRE_GITHUB_EVIDENCE: "true" }
  );

  assertFail(
    "tag github ref",
    writeJson("tag-github-ref.json", {
      ...validEvidence,
      sourceRevision: { ...validEvidence.sourceRevision, githubRef: "refs/tags/v1.0.0" }
    }),
    "production evidence sourceRevision.githubRef must be a GitHub ref",
    { P0_P3_REQUIRE_GITHUB_EVIDENCE: "true" }
  );

  assertFail(
    "wrong github event",
    writeJson("wrong-github-event.json", {
      ...validEvidence,
      sourceRevision: { ...validEvidence.sourceRevision, githubEventName: "push" }
    }),
    "production evidence sourceRevision.githubEventName must be workflow_dispatch",
    { P0_P3_REQUIRE_GITHUB_EVIDENCE: "true" }
  );

  assertFail(
    "wrong production llm input",
    writeJson("wrong-production-llm-input.json", {
      ...validEvidence,
      sourceRevision: { ...validEvidence.sourceRevision, productionLlmInput: "false" }
    }),
    "production evidence sourceRevision.productionLlmInput must be true",
    { P0_P3_REQUIRE_GITHUB_EVIDENCE: "true" }
  );

  assertFail(
    "wrong production environment",
    writeJson("wrong-production-environment.json", {
      ...validEvidence,
      sourceRevision: { ...validEvidence.sourceRevision, productionEnvironment: "staging" }
    }),
    "production evidence sourceRevision.productionEnvironment must be production",
    { P0_P3_REQUIRE_GITHUB_EVIDENCE: "true" }
  );

  assertFail(
    "invalid expected github repository",
    writeJson("invalid-expected-repository.json", validEvidence),
    "P0_P3_EXPECTED_GITHUB_REPOSITORY must be owner/repo when set",
    { P0_P3_EXPECTED_GITHUB_REPOSITORY: "example" }
  );

  assertFail(
    "mismatched expected github repository",
    writeJson("mismatched-expected-repository.json", validEvidence),
    "production evidence sourceRevision.githubRepository must match P0_P3_EXPECTED_GITHUB_REPOSITORY",
    { P0_P3_EXPECTED_GITHUB_REPOSITORY: "other/repo" }
  );

  assertFail(
    "invalid expected github ref",
    writeJson("invalid-expected-ref.json", validEvidence),
    "P0_P3_EXPECTED_GITHUB_REF must be refs/heads/<name> when set",
    { P0_P3_EXPECTED_GITHUB_REF: "main" }
  );

  assertFail(
    "tag expected github ref",
    writeJson("tag-expected-ref.json", validEvidence),
    "P0_P3_EXPECTED_GITHUB_REF must be refs/heads/<name> when set",
    { P0_P3_EXPECTED_GITHUB_REF: "refs/tags/v1.0.0" }
  );

  assertFail(
    "mismatched expected github ref",
    writeJson("mismatched-expected-ref.json", validEvidence),
    "production evidence sourceRevision.githubRef must match P0_P3_EXPECTED_GITHUB_REF",
    { P0_P3_EXPECTED_GITHUB_REF: "refs/heads/feature" }
  );

  assertFail(
    "invalid expected source commit",
    writeJson("invalid-expected-source.json", validEvidence),
    "P0_P3_EXPECTED_SOURCE_COMMIT must be a full git SHA when set",
    { P0_P3_EXPECTED_SOURCE_COMMIT: "main" }
  );

  assertFail(
    "mismatched expected source commit",
    writeJson("mismatched-expected-source.json", validEvidence),
    "production evidence sourceRevision.gitCommit must match P0_P3_EXPECTED_SOURCE_COMMIT",
    { P0_P3_EXPECTED_SOURCE_COMMIT: "abcdefabcdefabcdefabcdefabcdefabcdefabcd" }
  );

  assertFail(
    "future generatedAt",
    writeJson("future-generated-at.json", { ...validEvidence, generatedAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() }),
    "production evidence generatedAt must not be in the future"
  );

  assertFail(
    "stale generatedAt",
    writeJson("stale-generated-at.json", { ...validEvidence, generatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() }),
    "production evidence generatedAt must be within 14 days"
  );

  assertFail(
    "unredacted database password",
    writeJson("unredacted-db.json", { ...validEvidence, databaseUrl: "postgres://prod:secret@prod-db.example.com:5432/ai_capital" }),
    "production evidence databaseUrl password must be redacted"
  );

  assertFail(
    "unredacted database username",
    writeJson("unredacted-db-user.json", { ...validEvidence, databaseUrl: "postgres://prod:REDACTED@prod-db.example.com:5432/ai_capital" }),
    "production evidence databaseUrl username must be redacted"
  );

  assertFail(
    "missing command",
    writeJson("missing-command.json", { ...validEvidence, commands: validEvidence.commands.slice(0, 3) }),
    "production evidence missing llm:verify-production http command"
  );

  assertFail(
    "missing production gate command",
    writeJson("missing-production-gate-command.json", {
      ...validEvidence,
      commands: validEvidence.commands.filter((command) => !command.startsWith("npm run validate:p0-p3:production -- "))
    }),
    "production evidence missing validate:p0-p3:production http --write-evidence command"
  );

  assertFail(
    "production gate command with fixture-like provider",
    writeJson("fixture-like-provider-command.json", {
      ...validEvidence,
      commands: validEvidence.commands.map((command) =>
        command.startsWith("npm run validate:p0-p3:production -- ")
          ? command.replace("--provider=http", "--provider=http-fixture")
          : command
      )
    }),
    "production evidence missing validate:p0-p3:production http --write-evidence command"
  );

  assertFail(
    "production command allows local services",
    writeJson("allow-local-services-command.json", {
      ...validEvidence,
      commands: validEvidence.commands.map((command) =>
        command.startsWith("npm run validate:p0-p3:production -- ") ? `${command} --allow-local-services` : command
      )
    }),
    "production evidence commands must not include --allow-local-services"
  );

  console.log("Production evidence fixture validation passed.");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
