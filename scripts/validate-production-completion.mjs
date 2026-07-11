import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = new URL("../", import.meta.url).pathname;
const args = process.argv.slice(2);
const artifactName = argValue("--artifact-name") || "p0-p3-production-readiness-report";
const expectedCommit = argValue("--commit") || process.env.P0_P3_EXPECTED_SOURCE_COMMIT || "";
const expectedRepository = argValue("--repo") || process.env.P0_P3_EXPECTED_GITHUB_REPOSITORY || "";
const expectedRef = argValue("--ref") || process.env.P0_P3_EXPECTED_GITHUB_REF || "refs/heads/main";
const runId = argValue("--run-id") || "";
const runMetadataFile = argValue("--run-metadata-file") || "";
const dispatchStartedAt = argValue("--dispatch-started-at") || "";
const download = args.includes("--download");
const artifactDirArg = argValue("--dir");
const artifactDir = path.resolve(
  rootDir,
  artifactDirArg || (download && runId ? `data/research/p0-p3-production-readiness-report-artifact/${runId}` : "data/research/p0-p3-production-readiness-report-artifact")
);
const errors = [];

function argValue(name) {
  const exactIndex = args.indexOf(name);
  if (exactIndex !== -1) return args[exactIndex + 1] || "";
  const prefixed = args.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : "";
}

function run(label, command, commandArgs, options = {}) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(command, commandArgs, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      ...(options.env || {})
    }
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${label} failed with status ${result.status}`);
  }
  return result;
}

if (!/^[a-f0-9]{40}$/i.test(expectedCommit)) {
  errors.push("--commit or P0_P3_EXPECTED_SOURCE_COMMIT must be a full 40-character git SHA");
}
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(expectedRepository)) {
  errors.push("--repo or P0_P3_EXPECTED_GITHUB_REPOSITORY must be OWNER/REPO");
}
if (!/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(expectedRef)) {
  errors.push("--ref or P0_P3_EXPECTED_GITHUB_REF must be a full refs/heads/* ref");
}
if (download && !/^\d+$/.test(runId)) {
  errors.push("--download requires --run-id=<numeric_github_run_id>");
}
if (runId && !/^\d+$/.test(runId)) {
  errors.push("--run-id must be numeric when set");
}
if (runId && !download && !runMetadataFile) {
  errors.push("--run-id requires --download or --run-metadata-file=<github_run_metadata_json>");
}
if (runId && !dispatchStartedAt) {
  errors.push("--run-id requires --dispatch-started-at=<dispatch_iso_timestamp>");
}
if (dispatchStartedAt && !Number.isFinite(Date.parse(dispatchStartedAt))) {
  errors.push("--dispatch-started-at must be an ISO timestamp when set");
}
if (dispatchStartedAt && !runId) {
  errors.push("--dispatch-started-at requires --run-id");
}
if (download && fs.existsSync(artifactDir)) {
  if (!fs.statSync(artifactDir).isDirectory()) {
    errors.push("--download artifact path must be a directory");
  } else if (fs.readdirSync(artifactDir).length > 0) {
    errors.push("--download requires an empty artifact directory to avoid mixing stale production evidence");
  }
}
if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exit(1);
}

function validateRunMetadata() {
  if (!runId) return null;
  let metadata = null;
  if (runMetadataFile) {
    const metadataPath = path.resolve(rootDir, runMetadataFile);
    if (!fs.existsSync(metadataPath)) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            runMetadataFile,
            errors: ["--run-metadata-file must exist"]
          },
          null,
          2
        )
      );
      process.exit(1);
    }
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    } catch {
      console.error(
        JSON.stringify(
          {
            ok: false,
            runMetadataFile,
            errors: ["--run-metadata-file must be valid JSON"]
          },
          null,
          2
        )
      );
      process.exit(1);
    }
  } else if (download) {
    const result = run("read GitHub workflow run metadata", "gh", [
      "run",
      "view",
      runId,
      "--repo",
      expectedRepository,
      "--json",
      "databaseId,workflowName,name,event,status,conclusion,headSha,headBranch,attempt,createdAt,url"
    ]);
    metadata = JSON.parse(result.stdout);
  }
  if (!metadata) return null;

  const metadataErrors = [];
  const metadataRunId = String(metadata.databaseId || "");
  const workflowName = metadata.workflowName || metadata.name || "";
  const expectedBranch = expectedRef.startsWith("refs/heads/") ? expectedRef.slice("refs/heads/".length) : "";
  const metadataAttempt = String(metadata.attempt || "");
  const metadataUrl = String(metadata.url || "");
  const metadataCreatedAt = Date.parse(metadata.createdAt || "");

  if (metadataRunId !== runId) metadataErrors.push("GitHub run metadata databaseId must match --run-id");
  if (!/^\d+$/.test(metadataAttempt)) metadataErrors.push("GitHub run metadata attempt must be numeric");
  if (!Number.isFinite(metadataCreatedAt)) metadataErrors.push("GitHub run metadata createdAt must be an ISO timestamp");
  if (Number.isFinite(metadataCreatedAt) && dispatchStartedAt && metadataCreatedAt < Date.parse(dispatchStartedAt)) {
    metadataErrors.push("GitHub run metadata createdAt must be at or after --dispatch-started-at");
  }
  try {
    const parsedUrl = new URL(metadataUrl);
    const expectedPath = `/${expectedRepository}/actions/runs/${runId}`.toLowerCase();
    const actualPath = parsedUrl.pathname.replace(/\/$/, "").toLowerCase();
    if (parsedUrl.hostname !== "github.com" || actualPath !== expectedPath) {
      metadataErrors.push("GitHub run metadata url must match --repo and --run-id");
    }
  } catch {
    metadataErrors.push("GitHub run metadata url must be a valid GitHub Actions run URL");
  }
  if (workflowName !== "Validate P0-P3") metadataErrors.push("GitHub run metadata workflowName must be Validate P0-P3");
  if (metadata.event !== "workflow_dispatch") metadataErrors.push("GitHub run metadata event must be workflow_dispatch");
  if (metadata.status !== "completed") metadataErrors.push("GitHub run metadata status must be completed");
  if (metadata.conclusion !== "success") metadataErrors.push("GitHub run metadata conclusion must be success");
  if ((metadata.headSha || "").toLowerCase() !== expectedCommit.toLowerCase()) {
    metadataErrors.push("GitHub run metadata headSha must match --commit");
  }
  if (expectedBranch && metadata.headBranch !== expectedBranch) {
    metadataErrors.push("GitHub run metadata headBranch must match --ref");
  }
  if (metadataErrors.length) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          expectedGithubRunId: runId,
          runMetadata: metadata,
          errors: metadataErrors
        },
        null,
        2
      )
    );
    process.exit(1);
  }
  return metadata;
}

function findEvidenceFiles(dir) {
  const matches = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      matches.push(...findEvidenceFiles(fullPath));
    } else if (entry.isFile() && entry.name === "p0-p3-production-readiness-report.json") {
      matches.push(fullPath);
    }
  }
  return matches;
}

function readArtifactEvidence() {
  const matches = fs.existsSync(artifactDir) ? findEvidenceFiles(artifactDir) : [];
  if (matches.length !== 1) return null;
  return JSON.parse(fs.readFileSync(matches[0], "utf8"));
}

const runMetadata = validateRunMetadata();
const verifiedGithubRunId = runMetadata ? String(runMetadata.databaseId || "") : "";
const verifiedGithubRunAttempt = runMetadata ? String(runMetadata.attempt || "") : "";

const verificationEnv = {
  P0_P3_EXPECTED_SOURCE_COMMIT: expectedCommit,
  P0_P3_EXPECTED_GITHUB_REPOSITORY: expectedRepository,
  P0_P3_EXPECTED_GITHUB_REF: expectedRef,
  P0_P3_REQUIRE_GITHUB_EVIDENCE: "true",
  P0_P3_PRODUCTION_ARTIFACT_DIR: artifactDir,
  P0_P3_VERIFIED_GITHUB_RUN_ID: verifiedGithubRunId,
  P0_P3_VERIFIED_GITHUB_RUN_ATTEMPT: verifiedGithubRunAttempt
};

if (download) {
  fs.mkdirSync(artifactDir, { recursive: true });
  run("download production readiness artifact", "gh", [
    "run",
    "download",
    runId,
    "--repo",
    expectedRepository,
    "--name",
    artifactName,
    "--dir",
    artifactDir
  ]);
}

run("validate production artifact", "npm", ["run", "validate:production-artifact", "--", `--dir=${artifactDir}`], {
  env: verificationEnv
});
const artifactEvidence = readArtifactEvidence();
if (runId && artifactEvidence?.sourceRevision?.githubRunId !== runId) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        productionEvidence: artifactEvidence ? artifactDir : null,
        expectedGithubRunId: runId,
        evidenceGithubRunId: artifactEvidence?.sourceRevision?.githubRunId || null,
        errors: ["production evidence sourceRevision.githubRunId must match --run-id"]
      },
      null,
      2
    )
  );
  process.exit(1);
}
if (runMetadata && artifactEvidence?.sourceRevision?.githubRunAttempt !== verifiedGithubRunAttempt) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        productionEvidence: artifactEvidence ? artifactDir : null,
        expectedGithubRunAttempt: verifiedGithubRunAttempt || null,
        evidenceGithubRunAttempt: artifactEvidence?.sourceRevision?.githubRunAttempt || null,
        errors: ["production evidence sourceRevision.githubRunAttempt must match GitHub run metadata attempt"]
      },
      null,
      2
    )
  );
  process.exit(1);
}
run("refresh P0-P3 completion matrix", "npm", ["run", "audit:p0-p3:matrix"], {
  env: verificationEnv
});
run("refresh production release checklist", "npm", ["run", "production:p0-p3:checklist"], {
  env: verificationEnv
});
run("validate production release checklist", "npm", ["run", "validate:production-release-checklist"], {
  env: verificationEnv
});

const matrix = JSON.parse(fs.readFileSync(path.join(rootDir, "data/research/p0-p3-completion-matrix.json"), "utf8"));
const evidenceRunId = matrix.productionSourceRevision?.githubRunId || "";
const evidenceRunAttempt = matrix.productionSourceRevision?.githubRunAttempt || "";
if (runId && evidenceRunId !== runId) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        status: matrix.status,
        productionEvidence: matrix.productionEvidence,
        expectedGithubRunId: runId,
        evidenceGithubRunId: evidenceRunId || null,
        errors: ["production evidence sourceRevision.githubRunId must match --run-id"]
      },
      null,
      2
    )
  );
  process.exit(1);
}
if (runMetadata && String(runMetadata.attempt || "") !== evidenceRunAttempt) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        status: matrix.status,
        productionEvidence: matrix.productionEvidence,
        expectedGithubRunAttempt: String(runMetadata.attempt || "") || null,
        evidenceGithubRunAttempt: evidenceRunAttempt || null,
        errors: ["production evidence sourceRevision.githubRunAttempt must match GitHub run metadata attempt"]
      },
      null,
      2
    )
  );
  process.exit(1);
}
if (matrix.status !== "complete") {
  console.error(
    JSON.stringify(
      {
        ok: false,
        status: matrix.status,
        productionEvidence: matrix.productionEvidence,
        externalPending: matrix.externalPending || []
      },
      null,
      2
    )
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      status: matrix.status,
      productionEvidence: matrix.productionEvidence,
      productionGitCommit: matrix.summary?.productionGitCommit || null,
      productionGithubRunId: evidenceRunId || null,
      productionGithubRunUrl: runMetadata?.url || null,
      productionRepository: expectedRepository,
      productionRef: expectedRef
    },
    null,
    2
  )
);
