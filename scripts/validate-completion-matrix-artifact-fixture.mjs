import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDir = new URL("../", import.meta.url).pathname;
const matrixPath = path.join(rootDir, "data/research/p0-p3-completion-matrix.json");
const originalMatrix = fs.existsSync(matrixPath) ? fs.readFileSync(matrixPath, "utf8") : null;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-capital-completion-matrix-artifact."));
const artifactDir = path.join(tempDir, "artifact");
const evidencePath = path.join(artifactDir, "p0-p3-production-readiness-report.json");

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeArtifactSupportFiles(evidence = validEvidence) {
  const matrix = {
    status: "local_ready_production_pending",
    generatedAt: new Date().toISOString(),
    productionEvidence: "data/research/p0-p3-production-readiness-report.json",
    productionEvidenceDiagnostics: [],
    productionSourceRevision: evidence.sourceRevision,
    summary: {
      productionProvider: "http",
      productionGitCommit: evidence.sourceRevision?.gitCommit || null
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
  fs.writeFileSync(path.join(artifactDir, "p0-p3-completion-matrix.json"), `${JSON.stringify(matrix, null, 2)}\n`);
  fs.writeFileSync(path.join(artifactDir, "p0-p3-production-release-checklist.json"), `${JSON.stringify(checklist, null, 2)}\n`);
}

function fixtureEnv(overrides = {}) {
  const env = { ...process.env };
  delete env.P0_P3_EXPECTED_SOURCE_COMMIT;
  delete env.P0_P3_EXPECTED_GITHUB_REPOSITORY;
  delete env.P0_P3_EXPECTED_GITHUB_REF;
  delete env.P0_P3_REQUIRE_GITHUB_EVIDENCE;
  delete env.P0_P3_PRODUCTION_LLM_INPUT;
  return { ...env, ...overrides };
}

try {
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(evidencePath, "{not json");
  writeArtifactSupportFiles();

  const invalidArtifactResult = spawnSync("node", ["scripts/generate-p0-p3-completion-matrix.mjs"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    env: fixtureEnv({
      P0_P3_PRODUCTION_ARTIFACT_DIR: artifactDir,
      P0_P3_EXPECTED_SOURCE_COMMIT: validEvidence.sourceRevision.gitCommit,
      P0_P3_EXPECTED_GITHUB_REPOSITORY: validEvidence.sourceRevision.githubRepository,
      P0_P3_EXPECTED_GITHUB_REF: validEvidence.sourceRevision.githubRef,
      P0_P3_VERIFIED_GITHUB_RUN_ID: validEvidence.sourceRevision.githubRunId,
      P0_P3_VERIFIED_GITHUB_RUN_ATTEMPT: validEvidence.sourceRevision.githubRunAttempt
    })
  });
  if (invalidArtifactResult.status !== 0) {
    process.stdout.write(invalidArtifactResult.stdout || "");
    process.stderr.write(invalidArtifactResult.stderr || "");
    throw new Error(`completion matrix invalid artifact fixture failed with status ${invalidArtifactResult.status}`);
  }
  const invalidArtifactMatrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
  assert(
    invalidArtifactMatrix.status === "local_ready_production_pending",
    `expected pending matrix with invalid artifact, got ${invalidArtifactMatrix.status}`
  );
  assert(invalidArtifactMatrix.productionEvidence === null, "expected no productionEvidence with invalid artifact");
  assert(
    invalidArtifactMatrix.productionEvidenceDiagnostics?.some((item) => item.source === "artifact"),
    "expected productionEvidenceDiagnostics to include artifact validation failure"
  );

  fs.writeFileSync(evidencePath, `${JSON.stringify(validEvidence, null, 2)}\n`);
  writeArtifactSupportFiles(validEvidence);

  const pendingResult = spawnSync("node", ["scripts/generate-p0-p3-completion-matrix.mjs"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    env: fixtureEnv({
      P0_P3_PRODUCTION_ARTIFACT_DIR: artifactDir
    })
  });
  if (pendingResult.status !== 0) {
    process.stdout.write(pendingResult.stdout || "");
    process.stderr.write(pendingResult.stderr || "");
    throw new Error(`completion matrix artifact pending fixture failed with status ${pendingResult.status}`);
  }
  const pendingMatrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
  assert(
    pendingMatrix.status === "local_ready_production_pending",
    `expected pending matrix without P0_P3_EXPECTED_SOURCE_COMMIT, got ${pendingMatrix.status}`
  );
  assert(pendingMatrix.productionEvidence === null, "expected no productionEvidence without expected source commit");

  fs.writeFileSync(
    evidencePath,
    `${JSON.stringify(
      {
        ...validEvidence,
        sourceRevision: { ...validEvidence.sourceRevision, githubRunId: null }
      },
      null,
      2
    )}\n`
  );
  writeArtifactSupportFiles(validEvidence);
  const missingGithubRunResult = spawnSync("node", ["scripts/generate-p0-p3-completion-matrix.mjs"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    env: fixtureEnv({
      P0_P3_PRODUCTION_ARTIFACT_DIR: artifactDir,
      P0_P3_EXPECTED_SOURCE_COMMIT: validEvidence.sourceRevision.gitCommit
    })
  });
  if (missingGithubRunResult.status !== 0) {
    process.stdout.write(missingGithubRunResult.stdout || "");
    process.stderr.write(missingGithubRunResult.stderr || "");
    throw new Error(`completion matrix missing github run fixture failed with status ${missingGithubRunResult.status}`);
  }
  const missingGithubRunMatrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
  assert(
    missingGithubRunMatrix.status === "local_ready_production_pending",
    `expected pending matrix without github run id, got ${missingGithubRunMatrix.status}`
  );
  assert(missingGithubRunMatrix.productionEvidence === null, "expected no productionEvidence without github run id");

  fs.writeFileSync(evidencePath, `${JSON.stringify(validEvidence, null, 2)}\n`);
  writeArtifactSupportFiles(validEvidence);
  const missingExpectedRepositoryResult = spawnSync("node", ["scripts/generate-p0-p3-completion-matrix.mjs"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    env: fixtureEnv({
      P0_P3_PRODUCTION_ARTIFACT_DIR: artifactDir,
      P0_P3_EXPECTED_SOURCE_COMMIT: validEvidence.sourceRevision.gitCommit
    })
  });
  if (missingExpectedRepositoryResult.status !== 0) {
    process.stdout.write(missingExpectedRepositoryResult.stdout || "");
    process.stderr.write(missingExpectedRepositoryResult.stderr || "");
    throw new Error(`completion matrix missing expected repository fixture failed with status ${missingExpectedRepositoryResult.status}`);
  }
  const missingExpectedRepositoryMatrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
  assert(
    missingExpectedRepositoryMatrix.status === "local_ready_production_pending",
    `expected pending matrix without P0_P3_EXPECTED_GITHUB_REPOSITORY, got ${missingExpectedRepositoryMatrix.status}`
  );
  assert(missingExpectedRepositoryMatrix.productionEvidence === null, "expected no productionEvidence without expected github repository");

  fs.writeFileSync(evidencePath, `${JSON.stringify(validEvidence, null, 2)}\n`);
  writeArtifactSupportFiles(validEvidence);
  const missingExpectedRefResult = spawnSync("node", ["scripts/generate-p0-p3-completion-matrix.mjs"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    env: fixtureEnv({
      P0_P3_PRODUCTION_ARTIFACT_DIR: artifactDir,
      P0_P3_EXPECTED_SOURCE_COMMIT: validEvidence.sourceRevision.gitCommit,
      P0_P3_EXPECTED_GITHUB_REPOSITORY: validEvidence.sourceRevision.githubRepository
    })
  });
  if (missingExpectedRefResult.status !== 0) {
    process.stdout.write(missingExpectedRefResult.stdout || "");
    process.stderr.write(missingExpectedRefResult.stderr || "");
    throw new Error(`completion matrix missing expected ref fixture failed with status ${missingExpectedRefResult.status}`);
  }
  const missingExpectedRefMatrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
  assert(
    missingExpectedRefMatrix.status === "local_ready_production_pending",
    `expected pending matrix without P0_P3_EXPECTED_GITHUB_REF, got ${missingExpectedRefMatrix.status}`
  );
  assert(missingExpectedRefMatrix.productionEvidence === null, "expected no productionEvidence without expected github ref");

  fs.writeFileSync(
    evidencePath,
    `${JSON.stringify(
      {
        ...validEvidence,
        sourceRevision: { ...validEvidence.sourceRevision, githubEventName: "push" }
      },
      null,
      2
    )}\n`
  );
  writeArtifactSupportFiles(validEvidence);
  const wrongGithubEventResult = spawnSync("node", ["scripts/generate-p0-p3-completion-matrix.mjs"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    env: fixtureEnv({
      P0_P3_PRODUCTION_ARTIFACT_DIR: artifactDir,
      P0_P3_EXPECTED_SOURCE_COMMIT: validEvidence.sourceRevision.gitCommit,
      P0_P3_EXPECTED_GITHUB_REPOSITORY: validEvidence.sourceRevision.githubRepository,
      P0_P3_EXPECTED_GITHUB_REF: validEvidence.sourceRevision.githubRef
    })
  });
  if (wrongGithubEventResult.status !== 0) {
    process.stdout.write(wrongGithubEventResult.stdout || "");
    process.stderr.write(wrongGithubEventResult.stderr || "");
    throw new Error(`completion matrix wrong github event fixture failed with status ${wrongGithubEventResult.status}`);
  }
  const wrongGithubEventMatrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
  assert(
    wrongGithubEventMatrix.status === "local_ready_production_pending",
    `expected pending matrix with wrong github event, got ${wrongGithubEventMatrix.status}`
  );
  assert(wrongGithubEventMatrix.productionEvidence === null, "expected no productionEvidence with wrong github event");

  fs.writeFileSync(
    evidencePath,
    `${JSON.stringify(
      {
        ...validEvidence,
        sourceRevision: { ...validEvidence.sourceRevision, productionEnvironment: "staging" }
      },
      null,
      2
    )}\n`
  );
  writeArtifactSupportFiles(validEvidence);
  const wrongProductionEnvironmentResult = spawnSync("node", ["scripts/generate-p0-p3-completion-matrix.mjs"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    env: fixtureEnv({
      P0_P3_PRODUCTION_ARTIFACT_DIR: artifactDir,
      P0_P3_EXPECTED_SOURCE_COMMIT: validEvidence.sourceRevision.gitCommit,
      P0_P3_EXPECTED_GITHUB_REPOSITORY: validEvidence.sourceRevision.githubRepository,
      P0_P3_EXPECTED_GITHUB_REF: validEvidence.sourceRevision.githubRef
    })
  });
  if (wrongProductionEnvironmentResult.status !== 0) {
    process.stdout.write(wrongProductionEnvironmentResult.stdout || "");
    process.stderr.write(wrongProductionEnvironmentResult.stderr || "");
    throw new Error(`completion matrix wrong production environment fixture failed with status ${wrongProductionEnvironmentResult.status}`);
  }
  const wrongProductionEnvironmentMatrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
  assert(
    wrongProductionEnvironmentMatrix.status === "local_ready_production_pending",
    `expected pending matrix with wrong production environment, got ${wrongProductionEnvironmentMatrix.status}`
  );
  assert(wrongProductionEnvironmentMatrix.productionEvidence === null, "expected no productionEvidence with wrong production environment");

  fs.writeFileSync(evidencePath, `${JSON.stringify(validEvidence, null, 2)}\n`);
  writeArtifactSupportFiles(validEvidence);

  const unverifiedRunMetadataResult = spawnSync("node", ["scripts/generate-p0-p3-completion-matrix.mjs"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    env: fixtureEnv({
      P0_P3_PRODUCTION_ARTIFACT_DIR: artifactDir,
      P0_P3_EXPECTED_SOURCE_COMMIT: validEvidence.sourceRevision.gitCommit,
      P0_P3_EXPECTED_GITHUB_REPOSITORY: validEvidence.sourceRevision.githubRepository,
      P0_P3_EXPECTED_GITHUB_REF: validEvidence.sourceRevision.githubRef
    })
  });
  if (unverifiedRunMetadataResult.status !== 0) {
    process.stdout.write(unverifiedRunMetadataResult.stdout || "");
    process.stderr.write(unverifiedRunMetadataResult.stderr || "");
    throw new Error(`completion matrix unverified run metadata fixture failed with status ${unverifiedRunMetadataResult.status}`);
  }
  const unverifiedRunMetadataMatrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
  assert(
    unverifiedRunMetadataMatrix.status === "local_ready_production_pending",
    `expected pending matrix without verified github run metadata, got ${unverifiedRunMetadataMatrix.status}`
  );
  assert(unverifiedRunMetadataMatrix.productionEvidence === null, "expected no productionEvidence without verified github run metadata");

  const result = spawnSync("node", ["scripts/generate-p0-p3-completion-matrix.mjs"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    env: fixtureEnv({
      P0_P3_PRODUCTION_ARTIFACT_DIR: artifactDir,
      P0_P3_EXPECTED_SOURCE_COMMIT: validEvidence.sourceRevision.gitCommit,
      P0_P3_EXPECTED_GITHUB_REPOSITORY: validEvidence.sourceRevision.githubRepository,
      P0_P3_EXPECTED_GITHUB_REF: validEvidence.sourceRevision.githubRef,
      P0_P3_VERIFIED_GITHUB_RUN_ID: validEvidence.sourceRevision.githubRunId,
      P0_P3_VERIFIED_GITHUB_RUN_ATTEMPT: validEvidence.sourceRevision.githubRunAttempt
    })
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`completion matrix artifact complete fixture failed with status ${result.status}`);
  }

  const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
  assert(matrix.status === "complete", `expected complete matrix status, got ${matrix.status}`);
  assert(matrix.productionEvidence, "expected matrix productionEvidence from artifact");
  assert(
    matrix.productionSourceRevision?.gitCommit === validEvidence.sourceRevision.gitCommit,
    "expected matrix productionSourceRevision gitCommit from artifact evidence"
  );
  assert(matrix.externalPending.length === 0, "expected no external pending items with valid artifact evidence");
  assert(matrix.summary.productionProvider === "http", "expected productionProvider to be http");
  assert(
    matrix.summary.productionGitCommit === validEvidence.sourceRevision.gitCommit,
    "expected summary productionGitCommit from artifact evidence"
  );

  console.log("Completion matrix production artifact fixture validation passed.");
} finally {
  if (originalMatrix === null) fs.rmSync(matrixPath, { force: true });
  else fs.writeFileSync(matrixPath, originalMatrix);
  fs.rmSync(tempDir, { recursive: true, force: true });
}
