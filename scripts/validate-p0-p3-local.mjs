import { spawnSync } from "node:child_process";

const rootDir = new URL("../", import.meta.url).pathname;
const args = new Set(process.argv.slice(2));
const withPersistentDb = args.has("--with-persistent-db");
const withProductionLlm = args.has("--with-production-llm");
const skipDbE2e = args.has("--skip-db-e2e");
const skipBuild = args.has("--skip-build");

function run(label, commandArgs, options = {}) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync("npm", commandArgs, {
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
}

function npm(script, scriptArgs = [], options = {}) {
  run(`npm run ${script}`, ["run", script, "--", ...scriptArgs], options);
}

console.log(
  JSON.stringify(
    {
      withPersistentDb,
      withProductionLlm,
      skipDbE2e,
      skipBuild
    },
    null,
    2
  )
);

const coreValidationScripts = [
  "validate:env",
  "validate:env-fixture",
  "validate:deployment-secrets",
  "validate:github-production-preflight-fixture",
  "validate:source-revision-fixture",
  "validate:production-evidence",
  "validate:production-evidence-fixture",
  "validate:production-artifact-fixture",
  "validate:production-completion-fixture",
  "validate:production-run-orchestrator-fixture",
  "validate:completion-matrix-artifact-fixture",
  "validate:production-release-checklist",
  "validate:production-release-checklist-fixture",
  "validate:data",
  "validate:metrics",
  "validate:evidence",
  "validate:next-data",
  "validate:ui",
  "validate:graph",
  "validate:render",
  "validate:interactions",
  "validate:dedup",
  "validate:admin-ux",
  "validate:admin-auth",
  "validate:parser",
  "validate:rss-worker",
  "validate:llm-http",
  "validate:worker-cleanup",
  "validate:research",
  "audit:p0-p3",
  "worker:verify-plan"
];

for (const script of coreValidationScripts) {
  npm(script);
}

npm("llm:status");
npm("worker:llm", ["--provider=fixture", "--dry-run", "--only-extracted", "--limit=1"]);
npm("research:weekly", ["--skip-db", "--skip-build"]);

if (withProductionLlm) {
  const provider = process.env.LLM_EXTRACT_URL ? "http" : "";
  if (!provider) {
    throw new Error("withProductionLlm requires LLM_EXTRACT_URL and LLM_EXTRACT_API_KEY.");
  }
  npm("validate:env", ["--require-production"]);
  npm("audit:p0-p3", ["--require-production-llm"]);
  npm("llm:verify-production", [`--provider=${provider}`, "--timeout-ms=30000", "--limit=1"]);
}

if (withPersistentDb) {
  npm("db:status", ["--require-ready"]);
  npm("db:verify:p3-persistent");
}

if (!skipDbE2e) {
  npm("db:e2e");
}

if (!skipBuild) {
  npm("build");
}

console.log("P0-P3 local validation completed.");
