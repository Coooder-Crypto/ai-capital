import { spawnSync } from "node:child_process";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const reportPath = new URL("data/research/p0-p3-readiness-report.json", root);
const matrixPath = new URL("data/research/p0-p3-completion-matrix.json", root);
const productionEvidencePath = new URL("data/research/p0-p3-production-readiness-report.json", root);
const productionEvidenceArtifactDir = process.env.P0_P3_PRODUCTION_ARTIFACT_DIR
  ? new URL(process.env.P0_P3_PRODUCTION_ARTIFACT_DIR, root)
  : new URL("data/research/p0-p3-production-readiness-report-artifact", root);

function runAuditReport() {
  const result = spawnSync("node", ["scripts/audit-p0-p3-readiness.mjs", "--write-report", "--json"], {
    cwd: root.pathname,
    encoding: "utf8",
    stdio: "pipe",
    env: process.env
  });
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    console.error(`readiness report generation failed with status ${result.status}`);
    process.exit(result.status || 1);
  }
}

function parseJsonOutput(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return null;
  }
}

function validateProductionEvidence(filePath = null) {
  const args = ["scripts/validate-production-evidence.mjs", "--require"];
  if (filePath) args.splice(1, 0, `--file=${filePath}`);
  const result = spawnSync("node", args, {
    cwd: root.pathname,
    encoding: "utf8",
    stdio: "pipe",
    env: process.env
  });
  const status = parseJsonOutput(result.stdout);
  return {
    ok: result.status === 0,
    errors: status?.errors || (result.status === 0 ? [] : ["production evidence validation failed"]),
    warnings: status?.warnings || []
  };
}

function validateProductionArtifact() {
  if (!fs.existsSync(productionEvidenceArtifactDir)) return null;
  const artifactDirArg = productionEvidenceArtifactDir.pathname;
  const result = spawnSync("node", ["scripts/validate-production-artifact.mjs", `--dir=${artifactDirArg}`], {
    cwd: root.pathname,
    encoding: "utf8",
    stdio: "pipe",
    env: process.env
  });
  const status = parseJsonOutput(result.stdout);
  if (result.status !== 0) {
    return {
      ok: false,
      source: "artifact",
      path: artifactDirArg,
      errors: status?.errors || ["production artifact validation failed"],
      warnings: status?.warnings || []
    };
  }
  try {
    if (!status.ok || !status.evidence) return null;
    const evidencePath = new URL(status.evidence, root);
    return {
      ok: true,
      source: "artifact",
      path: status.evidence,
      evidence: readJson(evidencePath)
    };
  } catch {
    return {
      ok: false,
      source: "artifact",
      path: artifactDirArg,
      errors: ["production artifact evidence could not be read after validation"],
      warnings: []
    };
  }
}

function productionEvidenceCandidate() {
  const diagnostics = [];
  if (fs.existsSync(productionEvidencePath)) {
    const validation = validateProductionEvidence();
    if (validation.ok) {
      return {
        path: "data/research/p0-p3-production-readiness-report.json",
        evidence: readJson(productionEvidencePath),
        diagnostics
      };
    }
    diagnostics.push({
      source: "file",
      path: "data/research/p0-p3-production-readiness-report.json",
      errors: validation.errors,
      warnings: validation.warnings
    });
  }
  const artifactEvidence = validateProductionArtifact();
  if (artifactEvidence?.ok) {
    const validation = validateProductionEvidence(artifactEvidence.path);
    if (validation.ok) return { ...artifactEvidence, diagnostics };
    diagnostics.push({
      source: "artifact",
      path: artifactEvidence.path,
      errors: validation.errors,
      warnings: validation.warnings
    });
  } else if (artifactEvidence) {
    diagnostics.push({
      source: "artifact",
      path: artifactEvidence.path,
      errors: artifactEvidence.errors,
      warnings: artifactEvidence.warnings
    });
  }
  return { path: null, evidence: null, diagnostics };
}

function readJson(url) {
  return JSON.parse(fs.readFileSync(url, "utf8"));
}

function checkMap(report) {
  return new Map((report.checks || []).map((check) => [check.label, check]));
}

function evidenceStatus(checks, labels) {
  const missing = labels.filter((label) => checks.get(label)?.status !== "pass");
  return {
    status: missing.length ? "missing_evidence" : "verified",
    evidence: labels,
    missing
  };
}

function requirement(id, title, description, labels, externalPending = []) {
  const evidence = evidenceStatus(checks, labels);
  const status =
    evidence.status === "missing_evidence"
      ? "missing_evidence"
      : externalPending.length
        ? "verified_locally_external_pending"
        : "verified";
  return {
    id,
    title,
    description,
    status,
    evidence: evidence.evidence,
    missingEvidence: evidence.missing,
    externalPending
  };
}

runAuditReport();

const report = readJson(reportPath);
const checks = checkMap(report);
const productionProvider = report.summary?.productionProvider || "not_configured";
const productionEvidenceCandidateResult = productionEvidenceCandidate();
const productionEvidence = productionEvidenceCandidateResult?.evidence || null;
const expectedProductionGitCommit = process.env.P0_P3_EXPECTED_SOURCE_COMMIT || "";
const expectedGithubRepository = process.env.P0_P3_EXPECTED_GITHUB_REPOSITORY || "";
const expectedGithubRef = process.env.P0_P3_EXPECTED_GITHUB_REF || "";
const verifiedGithubRunId = process.env.P0_P3_VERIFIED_GITHUB_RUN_ID || "";
const verifiedGithubRunAttempt = process.env.P0_P3_VERIFIED_GITHUB_RUN_ATTEMPT || "";
const productionEvidenceVerified =
  productionEvidence?.status === "pass" &&
  productionEvidence?.provider === "http" &&
  productionEvidence?.allowLocalServices === false &&
  /^[a-f0-9]{40}$/i.test(expectedProductionGitCommit) &&
  productionEvidence?.sourceRevision?.gitCommit?.toLowerCase() === expectedProductionGitCommit.toLowerCase() &&
  /^\d+$/.test(productionEvidence?.sourceRevision?.githubRunId || "") &&
  productionEvidence?.sourceRevision?.githubWorkflow === "Validate P0-P3" &&
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(expectedGithubRepository) &&
  productionEvidence?.sourceRevision?.githubRepository?.toLowerCase() === expectedGithubRepository.toLowerCase() &&
  /^\d+$/.test(productionEvidence?.sourceRevision?.githubRunAttempt || "") &&
  productionEvidence?.sourceRevision?.githubRunId === verifiedGithubRunId &&
  productionEvidence?.sourceRevision?.githubRunAttempt === verifiedGithubRunAttempt &&
  /^refs\/heads\/[A-Za-z0-9._/-]+$/.test(expectedGithubRef) &&
  productionEvidence?.sourceRevision?.githubRef === expectedGithubRef &&
  productionEvidence?.sourceRevision?.githubEventName === "workflow_dispatch" &&
  productionEvidence?.sourceRevision?.productionLlmInput === "true" &&
  productionEvidence?.sourceRevision?.productionEnvironment === "production";
const productionSourceRevision = productionEvidenceVerified ? productionEvidence.sourceRevision || null : null;
const productionPending =
  !productionEvidenceVerified
    ? [
        "Set P0_P3_EXPECTED_SOURCE_COMMIT to the production workflow commit before validating production evidence.",
        "Set P0_P3_EXPECTED_GITHUB_REPOSITORY to the production workflow repository before validating production evidence.",
        "Set P0_P3_EXPECTED_GITHUB_REF to refs/heads/main before validating production evidence.",
        "Use the Validate P0-P3 GitHub production workflow artifact as production evidence.",
        "Verify the production artifact was generated by workflow_dispatch with production_llm=true.",
        "Verify the production artifact was generated from the GitHub production environment.",
        "Run npm run validate:github-production-preflight -- --repo=OWNER/REPO against the production repository.",
        "Commit and push the release source to the production repository main branch, then run npm run production:p0-p3:run -- --repo=OWNER/REPO --ref=refs/heads/main to bind the remote main commit and a unique dispatch UUID, trigger, wait for, download, and verify that exact production workflow run.",
        "Run npm run validate:production-completion -- --commit=WORKFLOW_COMMIT_SHA --repo=OWNER/REPO --ref=refs/heads/main --run-id=GITHUB_RUN_ID --dispatch-started-at=DISPATCH_ISO_TIMESTAMP --download after the production workflow succeeds, requiring sourceRevision.githubRunId/sourceRevision.githubRunAttempt and GitHub run metadata to match the expected run, attempt, commit, workflow, event, status, conclusion, branch, createdAt-after-dispatch, and GitHub Actions URL.",
        "Only mark the matrix complete after validate:production-completion injects P0_P3_VERIFIED_GITHUB_RUN_ID and P0_P3_VERIFIED_GITHUB_RUN_ATTEMPT from GitHub run metadata.",
        "Configure production DATABASE_URL with imported schema and data.",
        "Configure admin review authentication secrets.",
        "Configure LLM_EXTRACT_URL/LLM_EXTRACT_API_KEY.",
        "Run npm run validate:p0-p3:production -- --provider=http --write-evidence against the real non-localhost environment."
      ]
    : [];

const requirements = [
  requirement(
    "product",
    "产品层",
    "用户能搜索实体、过滤图谱、看详情、看来源、提交纠错，并能构建 Next.js 生产版本。",
    ["script validate:p0-p3:local", "script build", "validation workflow local gate"]
  ),
  requirement("data", "数据层", "主图谱 seed、generated JSON、来源和证据状态一致。", [
    "seed data",
    "generated seed entity parity",
    "evidence backlog review state"
  ]),
  requirement("metrics", "指标层", "免费公开指标有已审核指标组，generated metrics artifact 存在。", [
    "approved metrics",
    "artifact src/generated/metrics.json"
  ]),
  requirement("api_db", "API/DB 层", "JSON fallback、临时 PostgreSQL E2E、worker artifact import 和常驻库验证入口齐备。", [
    "script db:e2e",
    "script db:verify:p3-persistent",
    "script worker:import",
    "script validate:p0-p3:local"
  ]),
  requirement("review", "审核层", "候选关系、实体和指标进入人工审核队列，审核脚本入口和 candidate snapshot 齐备。", [
    "candidate snapshot coverage",
    "artifact data/candidate-snapshot.json",
    "script validate:p0-p3:local"
  ]),
  requirement("collection", "采集层", "免费源进入 raw/parsed/extraction/LLM/candidate/archive/research artifact 链路。", [
    "artifact data/raw-documents.json",
    "artifact data/parsed-documents.json",
    "artifact data/extraction-candidates.json",
    "artifact data/llm-extractions.json",
    "script research:weekly",
    "weekly workflow refresh gate",
    "weekly workflow PR safety"
  ]),
  requirement("research", "研究体验层", "graph snapshot、timeline、candidate archive manifest 和 candidate statuses 可验证。", [
    "artifact data/research/graph-snapshot.json",
    "artifact data/research/timeline.json",
    "artifact data/research/candidate-snapshot-manifest.json",
    "timeline candidate statuses",
    "timeline candidate_relationship",
    "timeline candidate_entity",
    "timeline candidate_metric"
  ]),
  requirement(
    "llm",
    "LLM 层",
    "LLM 只产候选，本地 fixture、HTTP fixture、schema、鉴权、限流和 dry-run 门禁齐备。",
    ["script llm:status", "script validate:llm-http", "script llm:verify-production"],
    !productionEvidenceVerified
      ? ["Verify a real HTTP LLM gateway with npm run validate:p0-p3:production -- --provider=http --write-evidence."]
      : []
  ),
  requirement(
    "release",
    "发布验收层",
    "本地、CI、生产三类门禁可执行且生产门禁不会在缺真实环境时误通过。",
    [
      "script validate:p0-p3:production",
      "script validate:p0-p3:production-fixture",
      "script validate:production-evidence",
      "script validate:production-evidence-fixture",
      "script validate:production-artifact",
      "script validate:production-artifact-fixture",
      "script validate:production-completion",
      "script validate:production-completion-fixture",
      "script validate:production-run-orchestrator-fixture",
      "script validate:env",
      "script validate:deployment-secrets",
      "script validate:github-production-preflight",
      "script validate:github-production-preflight-fixture",
      "script audit:p0-p3:write",
      "script production:p0-p3:run",
      "script deploy:setup-guide",
      "production gate database import verification",
      "production setup guide database bootstrap",
      "validation workflow production LLM gate"
    ],
    productionPending
  )
];

const missingEvidence = requirements.filter((item) => item.status === "missing_evidence");
const externalPending = requirements.flatMap((item) => item.externalPending);
const matrix = {
  status: missingEvidence.length
    ? "missing_evidence"
    : externalPending.length
      ? "local_ready_production_pending"
      : "complete",
  generatedAt: new Date().toISOString(),
  sourceReport: "data/research/p0-p3-readiness-report.json",
  productionEvidence: productionEvidenceVerified ? productionEvidenceCandidateResult.path : null,
  productionEvidenceDiagnostics: productionEvidenceCandidateResult?.diagnostics || [],
  productionSourceRevision,
  summary: {
    ...report.summary,
    productionProvider: productionEvidenceVerified ? "http" : productionProvider,
    productionGitCommit: productionSourceRevision?.gitCommit || null
  },
  missingEvidence: missingEvidence.map((item) => ({ id: item.id, missingEvidence: item.missingEvidence })),
  externalPending,
  requirements
};

fs.writeFileSync(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      status: matrix.status,
      report: "data/research/p0-p3-readiness-report.json",
      matrix: "data/research/p0-p3-completion-matrix.json",
      missingEvidence: matrix.missingEvidence.length,
      externalPending: matrix.externalPending.length
    },
    null,
    2
  )
);
