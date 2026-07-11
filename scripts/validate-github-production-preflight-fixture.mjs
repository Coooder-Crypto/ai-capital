import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDir = new URL("../", import.meta.url).pathname;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-capital-github-preflight."));
const requiredSecrets = [
  "DATABASE_URL",
  "ADMIN_REVIEW_SESSION_SECRET",
  "ADMIN_REVIEW_ADMIN_PASSWORD",
  "ADMIN_REVIEW_REVIEWER_PASSWORD",
  "LLM_EXTRACT_URL",
  "LLM_EXTRACT_API_KEY"
];
const requiredVars = [
  "LLM_EXTRACT_MODEL",
  "LLM_EXTRACT_RPM",
  "LLM_EXTRACT_MAX_RETRIES",
  "LLM_EXTRACT_RETRY_BASE_MS"
];

const validFixture = {
  repository: "example/ai-capital-map",
  environment: {
    name: "production",
    protection_rules: [{ type: "required_reviewers" }]
  },
  environmentSecrets: requiredSecrets.map((name) => ({ name })),
  repositorySecrets: [],
  environmentVariables: [],
  repositoryVariables: requiredVars.map((name) => ({ name }))
};

function writeFixture(name, value) {
  const filePath = path.join(tempDir, `${name}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function runFixture(filePath) {
  return spawnSync("node", ["scripts/validate-github-production-preflight.mjs", `--fixture=${filePath}`], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe"
  });
}

function runFixtureWithWorkflow(filePath, workflowPath) {
  return spawnSync("node", ["scripts/validate-github-production-preflight.mjs", `--fixture=${filePath}`, `--workflow-file=${workflowPath}`], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe"
  });
}

function assertPass(label, fixture) {
  const result = runFixture(writeFixture(label, fixture));
  if (result.status !== 0) {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`${label} should pass GitHub production preflight`);
  }
}

function assertFail(label, fixture, expectedFragment) {
  const result = runFixture(writeFixture(label, fixture));
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status === 0) {
    process.stdout.write(output);
    throw new Error(`${label} should fail GitHub production preflight`);
  }
  if (!output.includes(expectedFragment)) {
    process.stdout.write(output);
    throw new Error(`${label} did not report expected fragment: ${expectedFragment}`);
  }
}

function assertWorkflowFail(label, fixture, workflowText, expectedFragment) {
  const fixturePath = writeFixture(label, fixture);
  const workflowPath = path.join(tempDir, `${label}.yml`);
  fs.writeFileSync(workflowPath, workflowText);
  const result = runFixtureWithWorkflow(fixturePath, workflowPath);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status === 0) {
    process.stdout.write(output);
    throw new Error(`${label} should fail GitHub production preflight`);
  }
  if (!output.includes(expectedFragment)) {
    process.stdout.write(output);
    throw new Error(`${label} did not report expected fragment: ${expectedFragment}`);
  }
}

try {
  assertPass("valid", validFixture);
  assertPass("repo-scoped-secret-warning", {
    ...validFixture,
    environmentSecrets: requiredSecrets.filter((name) => name !== "DATABASE_URL").map((name) => ({ name })),
    repositorySecrets: [{ name: "DATABASE_URL" }]
  });

  assertFail("missing-environment", { ...validFixture, environment: null }, "GitHub environment production is missing");
  assertFail(
    "missing-protection",
    { ...validFixture, environment: { name: "production", protection_rules: [] } },
    "must have at least one protection rule"
  );
  assertFail(
    "missing-secret",
    {
      ...validFixture,
      environmentSecrets: requiredSecrets.filter((name) => name !== "LLM_EXTRACT_API_KEY").map((name) => ({ name }))
    },
    "missing production secrets: LLM_EXTRACT_API_KEY"
  );
  assertFail(
    "missing-var",
    {
      ...validFixture,
      repositoryVariables: requiredVars.filter((name) => name !== "LLM_EXTRACT_RPM").map((name) => ({ name }))
    },
    "missing GitHub variables: LLM_EXTRACT_RPM"
  );
  assertFail("invalid-repo", { ...validFixture, repository: "invalid" }, "repository must be owner/repo");
  assertWorkflowFail(
    "workflow-missing-production-command",
    validFixture,
    fs.readFileSync(path.join(rootDir, ".github/workflows/validate-p0-p3.yml"), "utf8").replace(
      "npm run validate:p0-p3:production -- --timeout-ms=30000 --limit=1 --write-evidence",
      "npm run validate:p0-p3:local"
    ),
    "validate-p0-p3 workflow missing npm run validate:p0-p3:production -- --timeout-ms=30000 --limit=1 --write-evidence"
  );

  console.log("GitHub production preflight fixture validation passed.");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
