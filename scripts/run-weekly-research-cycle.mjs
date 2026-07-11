import { spawnSync } from "node:child_process";

const rootDir = new URL("../", import.meta.url).pathname;
const args = new Set(process.argv.slice(2));
const shouldFetch = args.has("--fetch");
const importDb = args.has("--import-db");
const skipDb = args.has("--skip-db");
const skipBuild = args.has("--skip-build");
const llmProvider = process.argv.find((arg) => arg.startsWith("--llm-provider="))?.split("=")[1] || "fixture";
const timeoutMs = process.argv.find((arg) => arg.startsWith("--timeout-ms="))?.split("=")[1] || "15000";
const openAlexPerPage = process.argv.find((arg) => arg.startsWith("--openalex-per-page="))?.split("=")[1] || "5";
const arxivMaxResults = process.argv.find((arg) => arg.startsWith("--arxiv-max-results="))?.split("=")[1] || "5";

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
    throw new Error(`${label} failed: ${command} ${commandArgs.join(" ")} exited with ${result.status}`);
  }
}

function npm(script, scriptArgs = [], options = {}) {
  run(`npm run ${script}`, "npm", ["run", script, "--", ...scriptArgs], options);
}

const mode = shouldFetch ? "fetch-and-write" : "dry-run";
console.log(
  JSON.stringify(
    {
      mode,
      importDb,
      skipDb,
      skipBuild,
      llmProvider,
      timeoutMs,
      openAlexPerPage,
      arxivMaxResults
    },
    null,
    2
  )
);

if (shouldFetch) {
  npm("fetch:wikidata", ["--fetch", `--timeout-ms=${timeoutMs}`]);
  npm("fetch:openalex", ["--fetch", `--per-page=${openAlexPerPage}`, `--timeout-ms=${timeoutMs}`]);
  npm("fetch:arxiv", ["--fetch", `--max-results=${arxivMaxResults}`, `--timeout-ms=${timeoutMs}`]);
  npm("candidates:generate");
  npm("worker:run", ["--fetch", `--timeout-ms=${timeoutMs}`]);
  npm("worker:parse");
  npm("worker:extract");
  npm("worker:llm", [`--provider=${llmProvider}`, `--timeout-ms=${timeoutMs}`]);
  npm("candidates:archive");
  npm("research:generate");
  npm("export:data");
} else {
  npm("fetch:wikidata");
  npm("fetch:openalex", [`--per-page=${openAlexPerPage}`]);
  npm("fetch:arxiv", [`--max-results=${arxivMaxResults}`]);
  npm("candidates:generate", ["--dry-run"]);
  npm("worker:run", ["--dry-run"]);
  npm("worker:parse", ["--dry-run"]);
  npm("worker:extract", ["--dry-run"]);
  npm("worker:llm", [`--provider=${llmProvider}`, "--dry-run", `--timeout-ms=${timeoutMs}`]);
  npm("candidates:archive", ["--dry-run"]);
}

npm("validate:parser");
npm("validate:rss-worker");
npm("validate:worker-cleanup");
npm("validate:research");
npm("validate:next-data");

if (importDb && !skipDb) {
  npm("db:status", ["--require-ready"]);
  npm("db:import");
  npm("worker:import");
  npm("db:verify");
  npm("worker:verify");
  npm("db:verify:p3-persistent");
} else if (!skipDb) {
  npm("db:e2e");
}

if (!skipBuild) {
  npm("build");
}

console.log(`Weekly research cycle completed in ${mode} mode.`);
