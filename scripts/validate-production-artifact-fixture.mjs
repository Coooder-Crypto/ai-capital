import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildProductionReleaseChecklist } from "./lib/production-release-checklist.mjs";

const rootDir = new URL("../", import.meta.url).pathname;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-capital-production-artifact."));

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

function releaseMatrix(evidence = validEvidence, externalPending = ["Verify production run metadata with validate:production-completion."]) {
  return {
    status: externalPending.length ? "local_ready_production_pending" : "complete",
    generatedAt: new Date().toISOString(),
    productionEvidence: "data/research/p0-p3-production-readiness-report.json",
    productionEvidenceDiagnostics: [],
    productionSourceRevision: evidence.sourceRevision,
    summary: {
      productionProvider: "http",
      productionGitCommit: evidence.sourceRevision.gitCommit
    },
    missingEvidence: [],
    externalPending,
    requirements: []
  };
}

function releaseChecklist(matrix) {
  return buildProductionReleaseChecklist(matrix);
}

function writeArtifactSupportFiles(dir, evidence = validEvidence, matrix = releaseMatrix(evidence)) {
  fs.writeFileSync(path.join(dir, "p0-p3-completion-matrix.json"), `${JSON.stringify(matrix, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, "p0-p3-production-release-checklist.json"), `${JSON.stringify(releaseChecklist(matrix), null, 2)}\n`);
}

function writeJson(dir, value) {
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, "p0-p3-production-readiness-report.json");
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  writeArtifactSupportFiles(dir, value);
  return filePath;
}

function writeText(dir, value) {
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, "p0-p3-production-readiness-report.json");
  fs.writeFileSync(filePath, value);
  writeArtifactSupportFiles(dir);
  return filePath;
}

function runValidator(dir, extraEnv = {}) {
  return spawnSync("node", ["scripts/validate-production-artifact.mjs", `--dir=${dir}`], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      ...extraEnv
    }
  });
}

function assertPass(label, dir, extraEnv = {}) {
  const result = runValidator(dir, extraEnv);
  if (result.status !== 0) {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`${label} should pass production artifact validation`);
  }
  return JSON.parse(result.stdout);
}

function assertFail(label, dir, expectedFragment, extraEnv = {}) {
  const result = runValidator(dir, extraEnv);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status === 0) {
    process.stdout.write(output);
    throw new Error(`${label} should fail production artifact validation`);
  }
  if (!output.includes(expectedFragment)) {
    process.stdout.write(output);
    throw new Error(`${label} did not report expected fragment: ${expectedFragment}`);
  }
}

try {
  const validDir = path.join(tempDir, "valid");
  writeJson(validDir, validEvidence);
  assertPass("valid artifact", validDir);
  assertPass("valid artifact with matching expected source", validDir, {
    P0_P3_EXPECTED_SOURCE_COMMIT: validEvidence.sourceRevision.gitCommit
  });
  assertPass("valid artifact with required github evidence", validDir, {
    P0_P3_REQUIRE_GITHUB_EVIDENCE: "true"
  });
  assertPass("valid artifact with matching expected repository", validDir, {
    P0_P3_EXPECTED_GITHUB_REPOSITORY: validEvidence.sourceRevision.githubRepository
  });
  assertPass("valid artifact with matching expected ref", validDir, {
    P0_P3_EXPECTED_GITHUB_REF: validEvidence.sourceRevision.githubRef
  });

  const nestedDir = path.join(tempDir, "nested");
  writeJson(path.join(nestedDir, "p0-p3-production-readiness-report"), validEvidence);
  assertPass("nested downloaded artifact", nestedDir);

  const metadataDir = path.join(tempDir, "metadata");
  writeJson(metadataDir, validEvidence);
  fs.writeFileSync(path.join(metadataDir, "run-metadata.json"), "{}\n");
  const metadataResult = assertPass("artifact with run metadata", metadataDir);
  if (!metadataResult.runMetadata?.endsWith("run-metadata.json")) {
    throw new Error("artifact with run metadata should report the metadata path");
  }

  const invalidMetadataDir = path.join(tempDir, "invalid-metadata");
  writeJson(invalidMetadataDir, validEvidence);
  fs.writeFileSync(path.join(invalidMetadataDir, "run-metadata.json"), "{not json");
  assertFail("artifact with invalid run metadata", invalidMetadataDir, "production artifact run metadata must be valid JSON");

  const unexpectedFileDir = path.join(tempDir, "unexpected-file");
  writeJson(unexpectedFileDir, validEvidence);
  fs.writeFileSync(path.join(unexpectedFileDir, "stale.txt"), "stale artifact data");
  assertFail(
    "artifact with unexpected extra file",
    unexpectedFileDir,
    "production artifact contains unexpected files; use a fresh artifact directory"
  );

  const multipleMetadataDir = path.join(tempDir, "multiple-metadata");
  writeJson(multipleMetadataDir, validEvidence);
  fs.writeFileSync(path.join(multipleMetadataDir, "run-metadata.json"), "{}\n");
  fs.mkdirSync(path.join(multipleMetadataDir, "copy"), { recursive: true });
  fs.writeFileSync(path.join(multipleMetadataDir, "copy", "run-metadata.json"), "{}\n");
  assertFail("artifact with multiple metadata files", multipleMetadataDir, "production artifact contains multiple run-metadata.json files");

  const missingDir = path.join(tempDir, "missing");
  fs.mkdirSync(missingDir);
  assertFail("missing evidence", missingDir, "production artifact is missing p0-p3-production-readiness-report.json");

  const missingMatrixDir = path.join(tempDir, "missing-matrix");
  writeJson(missingMatrixDir, validEvidence);
  fs.rmSync(path.join(missingMatrixDir, "p0-p3-completion-matrix.json"));
  assertFail("missing completion matrix", missingMatrixDir, "production artifact is missing p0-p3-completion-matrix.json");

  const missingChecklistDir = path.join(tempDir, "missing-checklist");
  writeJson(missingChecklistDir, validEvidence);
  fs.rmSync(path.join(missingChecklistDir, "p0-p3-production-release-checklist.json"));
  assertFail("missing release checklist", missingChecklistDir, "production artifact is missing p0-p3-production-release-checklist.json");

  const staleChecklistDir = path.join(tempDir, "stale-checklist");
  writeJson(staleChecklistDir, validEvidence);
  const staleChecklist = JSON.parse(fs.readFileSync(path.join(staleChecklistDir, "p0-p3-production-release-checklist.json"), "utf8"));
  staleChecklist.items = [];
  staleChecklist.pendingCount = 0;
  fs.writeFileSync(path.join(staleChecklistDir, "p0-p3-production-release-checklist.json"), `${JSON.stringify(staleChecklist, null, 2)}\n`);
  assertFail(
    "stale release checklist",
    staleChecklistDir,
    "production artifact release checklist pendingCount must match completion matrix externalPending length"
  );

  const legacyChecklistDir = path.join(tempDir, "legacy-checklist");
  writeJson(legacyChecklistDir, validEvidence);
  const legacyChecklist = JSON.parse(fs.readFileSync(path.join(legacyChecklistDir, "p0-p3-production-release-checklist.json"), "utf8"));
  legacyChecklist.schemaVersion = 1;
  fs.writeFileSync(path.join(legacyChecklistDir, "p0-p3-production-release-checklist.json"), `${JSON.stringify(legacyChecklist, null, 2)}\n`);
  assertFail(
    "legacy release checklist schema",
    legacyChecklistDir,
    "production artifact release checklist schemaVersion must be 2"
  );

  const missingCommandsChecklistDir = path.join(tempDir, "missing-commands-checklist");
  writeJson(missingCommandsChecklistDir, validEvidence);
  const missingCommandsChecklist = JSON.parse(
    fs.readFileSync(path.join(missingCommandsChecklistDir, "p0-p3-production-release-checklist.json"), "utf8")
  );
  delete missingCommandsChecklist.items[0].commands;
  fs.writeFileSync(
    path.join(missingCommandsChecklistDir, "p0-p3-production-release-checklist.json"),
    `${JSON.stringify(missingCommandsChecklist, null, 2)}\n`
  );
  assertFail(
    "release checklist missing commands array",
    missingCommandsChecklistDir,
    "production artifact release checklist items must include executable commands[]"
  );

  const mismatchedCommandChecklistDir = path.join(tempDir, "mismatched-command-checklist");
  writeJson(mismatchedCommandChecklistDir, validEvidence);
  const mismatchedCommandChecklist = JSON.parse(
    fs.readFileSync(path.join(mismatchedCommandChecklistDir, "p0-p3-production-release-checklist.json"), "utf8")
  );
  mismatchedCommandChecklist.items[0].command = "npm run validate:production-completion -- --stale";
  fs.writeFileSync(
    path.join(mismatchedCommandChecklistDir, "p0-p3-production-release-checklist.json"),
    `${JSON.stringify(mismatchedCommandChecklist, null, 2)}\n`
  );
  assertFail(
    "release checklist mismatched command",
    mismatchedCommandChecklistDir,
    "production artifact release checklist item command must match commands[0]"
  );

  const malformedItemChecklistDir = path.join(tempDir, "malformed-item-checklist");
  writeJson(malformedItemChecklistDir, validEvidence);
  const malformedItemChecklist = JSON.parse(
    fs.readFileSync(path.join(malformedItemChecklistDir, "p0-p3-production-release-checklist.json"), "utf8")
  );
  malformedItemChecklist.items[0].status = "verified";
  delete malformedItemChecklist.items[0].proof;
  fs.writeFileSync(
    path.join(malformedItemChecklistDir, "p0-p3-production-release-checklist.json"),
    `${JSON.stringify(malformedItemChecklist, null, 2)}\n`
  );
  assertFail(
    "release checklist malformed item fields",
    malformedItemChecklistDir,
    "production artifact release checklist items must include sequential id, pending_external status, category, and proof"
  );

  const tamperedChecklistDir = path.join(tempDir, "tampered-checklist");
  writeJson(tamperedChecklistDir, validEvidence);
  const tamperedChecklist = JSON.parse(fs.readFileSync(path.join(tamperedChecklistDir, "p0-p3-production-release-checklist.json"), "utf8"));
  tamperedChecklist.productionGitCommit = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
  tamperedChecklist.items[0].proof = "manually edited proof";
  fs.writeFileSync(path.join(tamperedChecklistDir, "p0-p3-production-release-checklist.json"), `${JSON.stringify(tamperedChecklist, null, 2)}\n`);
  assertFail(
    "release checklist does not match generated matrix checklist",
    tamperedChecklistDir,
    "production artifact release checklist must match generated checklist for completion matrix"
  );

  const prematureCompleteMatrixDir = path.join(tempDir, "premature-complete-matrix");
  fs.mkdirSync(prematureCompleteMatrixDir, { recursive: true });
  fs.writeFileSync(
    path.join(prematureCompleteMatrixDir, "p0-p3-production-readiness-report.json"),
    `${JSON.stringify(validEvidence, null, 2)}\n`
  );
  const prematureCompleteMatrix = releaseMatrix(validEvidence, []);
  writeArtifactSupportFiles(prematureCompleteMatrixDir, validEvidence, prematureCompleteMatrix);
  assertFail(
    "premature complete completion matrix",
    prematureCompleteMatrixDir,
    "production artifact completion matrix must not be complete before validate:production-completion verifies GitHub run metadata"
  );

  const multipleDir = path.join(tempDir, "multiple");
  writeJson(multipleDir, validEvidence);
  writeJson(path.join(multipleDir, "copy"), validEvidence);
  assertFail("multiple evidence files", multipleDir, "production artifact contains multiple p0-p3-production-readiness-report.json files");

  const invalidDir = path.join(tempDir, "invalid");
  writeJson(invalidDir, { ...validEvidence, allowLocalServices: true });
  assertFail("invalid evidence", invalidDir, "production artifact evidence validation failed");

  const invalidJsonDir = path.join(tempDir, "invalid-json");
  writeText(invalidJsonDir, "{not json");
  assertFail("invalid evidence json", invalidJsonDir, "production artifact evidence validation failed");

  assertFail(
    "artifact mismatched expected source",
    validDir,
    "production artifact evidence validation failed",
    { P0_P3_EXPECTED_SOURCE_COMMIT: "abcdefabcdefabcdefabcdefabcdefabcdefabcd" }
  );

  const missingGithubRunDir = path.join(tempDir, "missing-github-run");
  writeJson(missingGithubRunDir, {
    ...validEvidence,
    sourceRevision: { ...validEvidence.sourceRevision, githubRunId: null }
  });
  assertFail(
    "artifact missing github run id",
    missingGithubRunDir,
    "production artifact evidence validation failed",
    { P0_P3_REQUIRE_GITHUB_EVIDENCE: "true" }
  );

  assertFail(
    "artifact mismatched expected repository",
    validDir,
    "production artifact evidence validation failed",
    { P0_P3_EXPECTED_GITHUB_REPOSITORY: "other/repo" }
  );

  assertFail(
    "artifact mismatched expected ref",
    validDir,
    "production artifact evidence validation failed",
    { P0_P3_EXPECTED_GITHUB_REF: "refs/heads/feature" }
  );

  const wrongGithubEventDir = path.join(tempDir, "wrong-github-event");
  writeJson(wrongGithubEventDir, {
    ...validEvidence,
    sourceRevision: { ...validEvidence.sourceRevision, githubEventName: "push" }
  });
  assertFail(
    "artifact wrong github event",
    wrongGithubEventDir,
    "production artifact evidence validation failed",
    { P0_P3_REQUIRE_GITHUB_EVIDENCE: "true" }
  );

  const wrongProductionEnvironmentDir = path.join(tempDir, "wrong-production-environment");
  writeJson(wrongProductionEnvironmentDir, {
    ...validEvidence,
    sourceRevision: { ...validEvidence.sourceRevision, productionEnvironment: "staging" }
  });
  assertFail(
    "artifact wrong production environment",
    wrongProductionEnvironmentDir,
    "production artifact evidence validation failed",
    { P0_P3_REQUIRE_GITHUB_EVIDENCE: "true" }
  );

  console.log("Production artifact fixture validation passed.");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
