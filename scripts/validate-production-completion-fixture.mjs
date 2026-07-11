import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDir = new URL("../", import.meta.url).pathname;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-capital-production-completion."));
const matrixPath = path.join(rootDir, "data/research/p0-p3-completion-matrix.json");
const reportPath = path.join(rootDir, "data/research/p0-p3-readiness-report.json");
const checklistPath = path.join(rootDir, "data/research/p0-p3-production-release-checklist.json");
const originalMatrix = fs.existsSync(matrixPath) ? fs.readFileSync(matrixPath, "utf8") : null;
const originalReport = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, "utf8") : null;
const originalChecklist = fs.existsSync(checklistPath) ? fs.readFileSync(checklistPath, "utf8") : null;

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
const validRunMetadata = {
  databaseId: Number(validEvidence.sourceRevision.githubRunId),
  workflowName: "Validate P0-P3",
  name: "Validate P0-P3",
  event: "workflow_dispatch",
  status: "completed",
  conclusion: "success",
  headSha: validEvidence.sourceRevision.gitCommit,
  headBranch: "main",
  attempt: Number(validEvidence.sourceRevision.githubRunAttempt),
  createdAt: "2026-07-06T00:02:00.000Z",
  url: "https://github.com/example/ai-capital-map/actions/runs/123456789"
};

function writeEvidence(dir, evidence) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "p0-p3-production-readiness-report.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  const matrix = {
    status: "local_ready_production_pending",
    generatedAt: new Date().toISOString(),
    productionEvidence: "data/research/p0-p3-production-readiness-report.json",
    productionEvidenceDiagnostics: [],
    productionSourceRevision: evidence.sourceRevision,
    summary: {
      productionProvider: "http",
      productionGitCommit: evidence.sourceRevision.gitCommit
    },
    missingEvidence: [],
    externalPending: ["Verify production run metadata with validate:production-completion."],
    requirements: []
  };
  const checklist = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    sourceMatrix: "data/research/p0-p3-completion-matrix.json",
    sourceMatrixGeneratedAt: matrix.generatedAt,
    matrixStatus: matrix.status,
    productionEvidence: matrix.productionEvidence,
    productionGitCommit: matrix.summary.productionGitCommit,
    pendingCount: 1,
    categories: { github_workflow: 1 },
    items: [
      {
        id: "p0p3-prod-01",
        category: "github_workflow",
        status: "pending_external",
        description: matrix.externalPending[0],
        command: "npm run validate:production-completion -- --commit=WORKFLOW_COMMIT_SHA --repo=OWNER/REPO --ref=refs/heads/main --run-id=GITHUB_RUN_ID --dispatch-started-at=DISPATCH_ISO_TIMESTAMP --download",
        commands: [
          "npm run validate:production-completion -- --commit=WORKFLOW_COMMIT_SHA --repo=OWNER/REPO --ref=refs/heads/main --run-id=GITHUB_RUN_ID --dispatch-started-at=DISPATCH_ISO_TIMESTAMP --download"
        ],
        proof: "validate:production-completion passes and refreshes completion matrix"
      }
    ]
  };
  fs.writeFileSync(path.join(dir, "p0-p3-completion-matrix.json"), `${JSON.stringify(matrix, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, "p0-p3-production-release-checklist.json"), `${JSON.stringify(checklist, null, 2)}\n`);
}

function writeJson(name, value) {
  const filePath = path.join(tempDir, `${name}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function writeText(name, value) {
  const filePath = path.join(tempDir, name);
  fs.writeFileSync(filePath, value);
  return filePath;
}

function runCompletion(args) {
  return spawnSync("node", ["scripts/validate-production-completion.mjs", ...args], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe"
  });
}

function assertPass(label, args) {
  const result = runCompletion(args);
  if (result.status !== 0) {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`${label} should pass production completion validation`);
  }
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (!output.includes('"status": "complete"')) {
    process.stdout.write(output);
    throw new Error(`${label} did not produce a complete matrix`);
  }
}

function assertFail(label, args, expectedFragment) {
  const result = runCompletion(args);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status === 0) {
    process.stdout.write(output);
    throw new Error(`${label} should fail production completion validation`);
  }
  if (!output.includes(expectedFragment)) {
    process.stdout.write(output);
    throw new Error(`${label} did not report expected fragment: ${expectedFragment}`);
  }
}

try {
  const validDir = path.join(tempDir, "valid");
  const validRunMetadataFile = writeJson("valid-run-metadata", validRunMetadata);
  writeEvidence(validDir, validEvidence);
  assertPass("valid completion", [
    `--dir=${validDir}`,
    `--commit=${validEvidence.sourceRevision.gitCommit}`,
    `--repo=${validEvidence.sourceRevision.githubRepository}`,
    `--ref=${validEvidence.sourceRevision.githubRef}`,
    `--run-id=${validEvidence.sourceRevision.githubRunId}`,
    "--dispatch-started-at=2026-07-06T00:01:00.000Z",
    `--run-metadata-file=${validRunMetadataFile}`
  ]);

  const embeddedMetadataDir = path.join(tempDir, "embedded-run-metadata");
  const embeddedMetadataFile = path.join(embeddedMetadataDir, "run-metadata.json");
  writeEvidence(embeddedMetadataDir, validEvidence);
  fs.writeFileSync(embeddedMetadataFile, `${JSON.stringify(validRunMetadata, null, 2)}\n`);
  assertPass("valid completion with run metadata inside artifact", [
    `--dir=${embeddedMetadataDir}`,
    `--commit=${validEvidence.sourceRevision.gitCommit}`,
    `--repo=${validEvidence.sourceRevision.githubRepository}`,
    `--ref=${validEvidence.sourceRevision.githubRef}`,
    `--run-id=${validEvidence.sourceRevision.githubRunId}`,
    "--dispatch-started-at=2026-07-06T00:01:00.000Z",
    `--run-metadata-file=${embeddedMetadataFile}`
  ]);

  assertFail("missing commit", [`--dir=${validDir}`, `--repo=${validEvidence.sourceRevision.githubRepository}`], "must be a full 40-character git SHA");
  assertFail(
    "mismatched repository",
    [
      `--dir=${validDir}`,
      `--commit=${validEvidence.sourceRevision.gitCommit}`,
      "--repo=other/repo",
      `--ref=${validEvidence.sourceRevision.githubRef}`
    ],
    "production artifact evidence validation failed"
  );
  assertFail(
    "download without run id",
    [
      "--download",
      `--dir=${validDir}`,
      `--commit=${validEvidence.sourceRevision.gitCommit}`,
      `--repo=${validEvidence.sourceRevision.githubRepository}`,
      `--ref=${validEvidence.sourceRevision.githubRef}`
    ],
    "--download requires --run-id=<numeric_github_run_id>"
  );
  const nonEmptyDownloadDir = path.join(tempDir, "non-empty-download");
  fs.mkdirSync(nonEmptyDownloadDir, { recursive: true });
  fs.writeFileSync(path.join(nonEmptyDownloadDir, "stale.txt"), "stale artifact data");
  assertFail(
    "download into non-empty directory",
    [
      "--download",
      `--dir=${nonEmptyDownloadDir}`,
      `--commit=${validEvidence.sourceRevision.gitCommit}`,
      `--repo=${validEvidence.sourceRevision.githubRepository}`,
      `--ref=${validEvidence.sourceRevision.githubRef}`,
      `--run-id=${validEvidence.sourceRevision.githubRunId}`
    ],
    "--download requires an empty artifact directory to avoid mixing stale production evidence"
  );
  const downloadFilePath = path.join(tempDir, "download-target-file");
  fs.writeFileSync(downloadFilePath, "not a directory");
  assertFail(
    "download into file path",
    [
      "--download",
      `--dir=${downloadFilePath}`,
      `--commit=${validEvidence.sourceRevision.gitCommit}`,
      `--repo=${validEvidence.sourceRevision.githubRepository}`,
      `--ref=${validEvidence.sourceRevision.githubRef}`,
      `--run-id=${validEvidence.sourceRevision.githubRunId}`
    ],
    "--download artifact path must be a directory"
  );
  assertFail(
    "tag ref",
    [
      `--dir=${validDir}`,
      `--commit=${validEvidence.sourceRevision.gitCommit}`,
      `--repo=${validEvidence.sourceRevision.githubRepository}`,
      "--ref=refs/tags/v1.0.0"
    ],
    "--ref or P0_P3_EXPECTED_GITHUB_REF must be a full refs/heads/* ref"
  );
  assertFail(
    "mismatched run id",
    [
      `--dir=${validDir}`,
      `--commit=${validEvidence.sourceRevision.gitCommit}`,
      `--repo=${validEvidence.sourceRevision.githubRepository}`,
      `--ref=${validEvidence.sourceRevision.githubRef}`,
      "--run-id=987654321",
      "--dispatch-started-at=2026-07-06T00:01:00.000Z",
      `--run-metadata-file=${writeJson("mismatched-run-id-metadata", {
        ...validRunMetadata,
        databaseId: 987654321,
        url: "https://github.com/example/ai-capital-map/actions/runs/987654321"
      })}`
    ],
    "production evidence sourceRevision.githubRunId must match --run-id"
  );
  assertFail(
    "run id without metadata source",
    [
      `--dir=${validDir}`,
      `--commit=${validEvidence.sourceRevision.gitCommit}`,
      `--repo=${validEvidence.sourceRevision.githubRepository}`,
      `--ref=${validEvidence.sourceRevision.githubRef}`,
      `--run-id=${validEvidence.sourceRevision.githubRunId}`,
      "--dispatch-started-at=2026-07-06T00:01:00.000Z"
    ],
    "--run-id requires --download or --run-metadata-file=<github_run_metadata_json>"
  );
  assertFail(
    "run id without dispatch timestamp",
    [
      `--dir=${validDir}`,
      `--commit=${validEvidence.sourceRevision.gitCommit}`,
      `--repo=${validEvidence.sourceRevision.githubRepository}`,
      `--ref=${validEvidence.sourceRevision.githubRef}`,
      `--run-id=${validEvidence.sourceRevision.githubRunId}`,
      `--run-metadata-file=${validRunMetadataFile}`
    ],
    "--run-id requires --dispatch-started-at=<dispatch_iso_timestamp>"
  );
  assertFail(
    "dispatch timestamp without run id",
    [
      `--dir=${validDir}`,
      `--commit=${validEvidence.sourceRevision.gitCommit}`,
      `--repo=${validEvidence.sourceRevision.githubRepository}`,
      `--ref=${validEvidence.sourceRevision.githubRef}`,
      "--dispatch-started-at=2026-07-06T00:01:00.000Z"
    ],
    "--dispatch-started-at requires --run-id"
  );
  assertFail(
    "invalid dispatch timestamp",
    [
      `--dir=${validDir}`,
      `--commit=${validEvidence.sourceRevision.gitCommit}`,
      `--repo=${validEvidence.sourceRevision.githubRepository}`,
      `--ref=${validEvidence.sourceRevision.githubRef}`,
      `--run-id=${validEvidence.sourceRevision.githubRunId}`,
      "--dispatch-started-at=not-a-date",
      `--run-metadata-file=${validRunMetadataFile}`
    ],
    "--dispatch-started-at must be an ISO timestamp when set"
  );
  assertFail(
    "missing run metadata file",
    [
      `--dir=${validDir}`,
      `--commit=${validEvidence.sourceRevision.gitCommit}`,
      `--repo=${validEvidence.sourceRevision.githubRepository}`,
      `--ref=${validEvidence.sourceRevision.githubRef}`,
      `--run-id=${validEvidence.sourceRevision.githubRunId}`,
      "--dispatch-started-at=2026-07-06T00:01:00.000Z",
      `--run-metadata-file=${path.join(tempDir, "missing-run-metadata.json")}`
    ],
    "--run-metadata-file must exist"
  );
  assertFail(
    "invalid run metadata json",
    [
      `--dir=${validDir}`,
      `--commit=${validEvidence.sourceRevision.gitCommit}`,
      `--repo=${validEvidence.sourceRevision.githubRepository}`,
      `--ref=${validEvidence.sourceRevision.githubRef}`,
      `--run-id=${validEvidence.sourceRevision.githubRunId}`,
      "--dispatch-started-at=2026-07-06T00:01:00.000Z",
      `--run-metadata-file=${writeText("invalid-run-metadata.json", "{not json")}`
    ],
    "--run-metadata-file must be valid JSON"
  );
  assertFail(
    "metadata id without database id",
    [
      `--dir=${validDir}`,
      `--commit=${validEvidence.sourceRevision.gitCommit}`,
      `--repo=${validEvidence.sourceRevision.githubRepository}`,
      `--ref=${validEvidence.sourceRevision.githubRef}`,
      `--run-id=${validEvidence.sourceRevision.githubRunId}`,
      "--dispatch-started-at=2026-07-06T00:01:00.000Z",
      `--run-metadata-file=${writeJson("id-only-run-metadata", {
        ...validRunMetadata,
        databaseId: undefined,
        id: Number(validEvidence.sourceRevision.githubRunId)
      })}`
    ],
    "GitHub run metadata databaseId must match --run-id"
  );
  assertFail(
    "unsuccessful run metadata",
    [
      `--dir=${validDir}`,
      `--commit=${validEvidence.sourceRevision.gitCommit}`,
      `--repo=${validEvidence.sourceRevision.githubRepository}`,
      `--ref=${validEvidence.sourceRevision.githubRef}`,
      `--run-id=${validEvidence.sourceRevision.githubRunId}`,
      "--dispatch-started-at=2026-07-06T00:01:00.000Z",
      `--run-metadata-file=${writeJson("failed-run-metadata", { ...validRunMetadata, conclusion: "failure" })}`
    ],
    "GitHub run metadata conclusion must be success"
  );
  assertFail(
    "wrong run commit metadata",
    [
      `--dir=${validDir}`,
      `--commit=${validEvidence.sourceRevision.gitCommit}`,
      `--repo=${validEvidence.sourceRevision.githubRepository}`,
      `--ref=${validEvidence.sourceRevision.githubRef}`,
      `--run-id=${validEvidence.sourceRevision.githubRunId}`,
      "--dispatch-started-at=2026-07-06T00:01:00.000Z",
      `--run-metadata-file=${writeJson("wrong-sha-run-metadata", { ...validRunMetadata, headSha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd" })}`
    ],
    "GitHub run metadata headSha must match --commit"
  );
  assertFail(
    "wrong run url metadata",
    [
      `--dir=${validDir}`,
      `--commit=${validEvidence.sourceRevision.gitCommit}`,
      `--repo=${validEvidence.sourceRevision.githubRepository}`,
      `--ref=${validEvidence.sourceRevision.githubRef}`,
      `--run-id=${validEvidence.sourceRevision.githubRunId}`,
      "--dispatch-started-at=2026-07-06T00:01:00.000Z",
      `--run-metadata-file=${writeJson("wrong-url-run-metadata", { ...validRunMetadata, url: "https://github.com/other/repo/actions/runs/123456789" })}`
    ],
    "GitHub run metadata url must match --repo and --run-id"
  );
  assertFail(
    "wrong run attempt metadata",
    [
      `--dir=${validDir}`,
      `--commit=${validEvidence.sourceRevision.gitCommit}`,
      `--repo=${validEvidence.sourceRevision.githubRepository}`,
      `--ref=${validEvidence.sourceRevision.githubRef}`,
      `--run-id=${validEvidence.sourceRevision.githubRunId}`,
      "--dispatch-started-at=2026-07-06T00:01:00.000Z",
      `--run-metadata-file=${writeJson("wrong-attempt-run-metadata", { ...validRunMetadata, attempt: 2 })}`
    ],
    "production evidence sourceRevision.githubRunAttempt must match GitHub run metadata attempt"
  );
  assertFail(
    "missing run attempt metadata",
    [
      `--dir=${validDir}`,
      `--commit=${validEvidence.sourceRevision.gitCommit}`,
      `--repo=${validEvidence.sourceRevision.githubRepository}`,
      `--ref=${validEvidence.sourceRevision.githubRef}`,
      `--run-id=${validEvidence.sourceRevision.githubRunId}`,
      "--dispatch-started-at=2026-07-06T00:01:00.000Z",
      `--run-metadata-file=${writeJson("missing-attempt-run-metadata", { ...validRunMetadata, attempt: null })}`
    ],
    "GitHub run metadata attempt must be numeric"
  );
  assertFail(
    "missing run createdAt metadata",
    [
      `--dir=${validDir}`,
      `--commit=${validEvidence.sourceRevision.gitCommit}`,
      `--repo=${validEvidence.sourceRevision.githubRepository}`,
      `--ref=${validEvidence.sourceRevision.githubRef}`,
      `--run-id=${validEvidence.sourceRevision.githubRunId}`,
      "--dispatch-started-at=2026-07-06T00:01:00.000Z",
      `--run-metadata-file=${writeJson("missing-created-at-run-metadata", { ...validRunMetadata, createdAt: null })}`
    ],
    "GitHub run metadata createdAt must be an ISO timestamp"
  );
  assertFail(
    "old run metadata before dispatch",
    [
      `--dir=${validDir}`,
      `--commit=${validEvidence.sourceRevision.gitCommit}`,
      `--repo=${validEvidence.sourceRevision.githubRepository}`,
      `--ref=${validEvidence.sourceRevision.githubRef}`,
      `--run-id=${validEvidence.sourceRevision.githubRunId}`,
      "--dispatch-started-at=2026-07-06T00:03:00.000Z",
      `--run-metadata-file=${validRunMetadataFile}`
    ],
    "GitHub run metadata createdAt must be at or after --dispatch-started-at"
  );

  console.log("Production completion fixture validation passed.");
} finally {
  if (originalMatrix === null) fs.rmSync(matrixPath, { force: true });
  else fs.writeFileSync(matrixPath, originalMatrix);
  if (originalReport === null) fs.rmSync(reportPath, { force: true });
  else fs.writeFileSync(reportPath, originalReport);
  if (originalChecklist === null) fs.rmSync(checklistPath, { force: true });
  else fs.writeFileSync(checklistPath, originalChecklist);
  fs.rmSync(tempDir, { recursive: true, force: true });
}
