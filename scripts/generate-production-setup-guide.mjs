import fs from "node:fs";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL("data/deployment-secrets.manifest.json", root), "utf8"));
const outputPath = new URL("data/research/production-setup-guide.md", root);

const secrets = manifest.githubActions?.secrets || [];
const optionalSecrets = manifest.githubActions?.optionalSecrets || [];
const vars = manifest.githubActions?.vars || [];

function exportLine(name, value = "") {
  return `export ${name}='${value || `<${name.toLowerCase()}>`}'`;
}

function secretCommand(name) {
  return `gh secret set ${name} --body "$${name}"`;
}

function varCommand(name, value) {
  return `gh variable set ${name} --body "${value || ""}"`;
}

const lines = [
  "# P0-P3 Production Setup Guide",
  "",
  "This file is generated from `data/deployment-secrets.manifest.json`.",
  "Do not put real secret values in this repository.",
  "",
  "## Production Database Bootstrap",
  "",
  "`DATABASE_URL` must point to a PostgreSQL database with the schema, seed data, and P3 worker artifacts imported before the production gate runs.",
  "For the real production gate, `DATABASE_URL` and `LLM_EXTRACT_URL` must point to non-localhost services; localhost is only allowed inside `validate:p0-p3:production-fixture`.",
  "",
  "For a local shell connected to the production database, run:",
  "",
  "```bash",
  "export DATABASE_URL='<database_url>'",
  "npm run db:import",
  "npm run worker:import",
  "npm run db:status -- --require-ready",
  "npm run db:verify",
  "npm run worker:verify",
  "npm run db:verify:p3-persistent",
  "```",
  "",
  "The production gate re-runs `db:status -- --require-ready`, `db:verify`, `worker:verify`, and `db:verify:p3-persistent` so an empty or partially imported database cannot pass release readiness.",
  "",
  "## Required GitHub Secrets",
  "",
  "Production readiness requires the session-based admin review secrets below. Legacy review tokens are optional compatibility helpers and do not replace the session secrets for the production gate.",
  "",
  "Set these values in your shell, then run the `gh secret set` commands.",
  "",
  "```bash",
  ...secrets.map((entry) => exportLine(entry.name)),
  "",
  ...secrets.map((entry) => secretCommand(entry.name)),
  "```",
  "",
  "## Optional GitHub Secrets",
  "",
  "Use these only if you prefer token auth in addition to session auth.",
  "",
  "```bash",
  ...optionalSecrets.map((entry) => exportLine(entry.name)),
  "",
  ...optionalSecrets.map((entry) => secretCommand(entry.name)),
  "```",
  "",
  "## GitHub Variables",
  "",
  "```bash",
  ...vars.map((entry) => varCommand(entry.name, entry.default)),
  "```",
  "",
  "## GitHub Production Environment",
  "",
  "Create a GitHub environment named `production` before running the production gate.",
  "Store the production `DATABASE_URL`, admin session secrets, and `LLM_EXTRACT_URL`/`LLM_EXTRACT_API_KEY` in that environment whenever repository policy allows environment-scoped secrets.",
  "Enable required reviewers or another environment protection rule so production secrets are only released after an explicit release review.",
  "The `Validate P0-P3` production job declares `environment: production`; if the environment is missing or the protection rule is not approved, the production evidence artifact should not be treated as release evidence.",
  "",
  "## Production Gate",
  "",
  "Commit and push the complete release source, including the workflow files, to the production repository `main` branch before running the gate. The orchestrator reads the remote repository and does not upload the local working tree.",
  "",
  "Run the production orchestrator after secrets and variables are configured. It resolves the remote `main` commit before dispatch, generates a unique dispatch UUID, records its dispatch time, and only accepts a workflow run whose display title contains that UUID and whose head SHA exactly matches; it also ignores older successful workflow runs plus any run whose GitHub Actions URL does not match the expected repository and run id.",
  "Production completion is pinned to `refs/heads/main`; the orchestrator rejects other refs because the workflow evidence validator pins `P0_P3_EXPECTED_GITHUB_REF=refs/heads/main`.",
  "",
  "```bash",
  "npm run production:p0-p3:run -- --repo=OWNER/REPO --ref=refs/heads/main",
  "",
  "# Equivalent manual sequence:",
  "npm run validate:github-production-preflight -- --repo=OWNER/REPO",
  "gh workflow run \"Validate P0-P3\" --repo OWNER/REPO --ref main -f production_llm=true -f dispatch_token=UNIQUE_UUID",
  "```",
  "",
  "For a local shell connected to the same production services, run:",
  "",
  "```bash",
  "npm run validate:p0-p3:production -- --provider=http --timeout-ms=30000 --limit=1 --write-evidence",
  "```",
  "",
  "The production evidence file and downloaded production artifact directory are ignored by git. The `Validate P0-P3` workflow uploads `data/research/p0-p3-production-readiness-report.json`, `data/research/p0-p3-completion-matrix.json`, and `data/research/p0-p3-production-release-checklist.json` together as the `p0-p3-production-readiness-report` artifact. Use a fresh or empty artifact directory for each production artifact download so stale evidence cannot mix with the verified run; artifact validation allows only those three JSON files plus optional `run-metadata.json`, which must contain valid JSON.",
  "The uploaded artifact's completion matrix must still be `local_ready_production_pending`; `complete` is only valid after `validate:production-completion` verifies GitHub run metadata and refreshes the local matrix.",
  "The production gate job runs in the GitHub `production` environment so repository environment protection rules can gate secret access.",
  "The production workflow sets `P0_P3_EXPECTED_SOURCE_COMMIT` to the workflow commit, `P0_P3_EXPECTED_GITHUB_REPOSITORY` to the workflow repository, and `P0_P3_EXPECTED_GITHUB_REF=refs/heads/main`, so the evidence source revision must match the code, repository, and release branch that produced the artifact.",
  "The production workflow also sets `P0_P3_REQUIRE_GITHUB_EVIDENCE=true` plus explicit `P0_P3_GITHUB_RUN_ID` and `P0_P3_GITHUB_RUN_ATTEMPT` bindings from the GitHub Actions run context, requiring `sourceRevision.githubRunId`, `sourceRevision.githubRunAttempt`, `sourceRevision.githubRepository`, `sourceRevision.githubRef=refs/heads/main`, `sourceRevision.githubEventName=workflow_dispatch`, `sourceRevision.productionLlmInput=true`, `sourceRevision.productionEnvironment=production`, and `sourceRevision.githubWorkflow=Validate P0-P3` in the evidence.",
  "The evidence validator requires `adminAuthMode=session`, `sourceRevision.gitCommit`, a non-future `generatedAt` timestamp within 14 days by default, non-localhost DB/LLM URLs, redacted credentials, and the full production command chain.",
  "Set `P0_P3_PRODUCTION_EVIDENCE_MAX_AGE_DAYS` only when your release policy needs a different evidence freshness window.",
  "`audit:p0-p3:matrix` records the verified artifact path plus `productionSourceRevision.gitCommit` and `summary.productionGitCommit` only when expected commit/repository/ref match, the evidence came from the GitHub `production` environment via `workflow_dispatch` with `production_llm=true`, and `validate:production-completion` has injected verified `P0_P3_VERIFIED_GITHUB_RUN_ID` and `P0_P3_VERIFIED_GITHUB_RUN_ATTEMPT` values from GitHub run metadata.",
  "If a candidate production evidence file or downloaded artifact is present but invalid, `audit:p0-p3:matrix` keeps the status at `local_ready_production_pending` and writes the validation failure into `productionEvidenceDiagnostics`; diagnostics are for troubleshooting only and never count as completion evidence.",
  "Run `npm run production:p0-p3:checklist` after refreshing the matrix to write `data/research/p0-p3-production-release-checklist.json`; schema v2 keeps a single `command` for compatibility and adds executable `commands[]` steps for source revision exports, production secrets, database import/verify, and completion validation. `npm run validate:production-release-checklist` fails if the checklist no longer matches the current matrix external pending items.",
  "After the workflow finishes, download and re-validate that artifact before marking the production gate complete. The completion command requires `--run-id` and `--dispatch-started-at` together, checks that `sourceRevision.githubRunId` in the evidence matches `--run-id`, that `sourceRevision.githubRunAttempt` matches GitHub run metadata, and that the GitHub run metadata is `workflow_dispatch`, `completed`, `success`, `Validate P0-P3`, tied to the expected commit and branch, created at or after the dispatch timestamp, and has a GitHub Actions URL under the expected repository and run id.",
  "",
  "```bash",
  "npm run validate:production-completion -- --commit=WORKFLOW_COMMIT_SHA --repo=OWNER/REPO --ref=refs/heads/main --run-id=GITHUB_RUN_ID --dispatch-started-at=DISPATCH_ISO_TIMESTAMP --download",
  "",
  "# Equivalent manual sequence if the artifact has already been downloaded:",
  "export P0_P3_EXPECTED_SOURCE_COMMIT='<workflow_commit_sha>'",
  "export P0_P3_EXPECTED_GITHUB_REPOSITORY='OWNER/REPO'",
  "export P0_P3_EXPECTED_GITHUB_REF='refs/heads/main'",
  "export P0_P3_REQUIRE_GITHUB_EVIDENCE=true",
  "mkdir -p data/research/p0-p3-production-readiness-report-artifact",
  "gh run download GITHUB_RUN_ID --repo OWNER/REPO --name p0-p3-production-readiness-report --dir data/research/p0-p3-production-readiness-report-artifact",
  "gh run view GITHUB_RUN_ID --repo OWNER/REPO --json databaseId,workflowName,name,event,status,conclusion,headSha,headBranch,attempt,createdAt,url > data/research/p0-p3-production-readiness-report-artifact/run-metadata.json",
  "npm run validate:production-artifact -- --dir=data/research/p0-p3-production-readiness-report-artifact",
  "npm run validate:production-completion -- --dir=data/research/p0-p3-production-readiness-report-artifact --commit=\"$P0_P3_EXPECTED_SOURCE_COMMIT\" --repo=\"$P0_P3_EXPECTED_GITHUB_REPOSITORY\" --ref=\"$P0_P3_EXPECTED_GITHUB_REF\" --run-id=GITHUB_RUN_ID --dispatch-started-at=DISPATCH_ISO_TIMESTAMP --run-metadata-file=data/research/p0-p3-production-readiness-report-artifact/run-metadata.json",
  "npm run audit:p0-p3:matrix # optional read-only recheck after validate:production-completion passes",
  "npm run production:p0-p3:checklist",
  "npm run validate:production-release-checklist",
  "```",
  ""
];

fs.writeFileSync(outputPath, `${lines.join("\n")}`);
console.log(
  JSON.stringify(
    {
      ok: true,
      output: "data/research/production-setup-guide.md",
      requiredSecrets: secrets.length,
      optionalSecrets: optionalSecrets.length,
      vars: vars.length
    },
    null,
    2
  )
);
