import { spawnSync } from "node:child_process";

const rootDir = new URL("../", import.meta.url).pathname;
const providerArg = process.argv.find((arg) => arg.startsWith("--provider="))?.split("=")[1];
const timeoutMs = process.argv.find((arg) => arg.startsWith("--timeout-ms="))?.split("=")[1] || "30000";
const limit = process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || "1";
const provider = providerArg || (process.env.LLM_EXTRACT_URL ? "http" : "fixture");

function run(label, args) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync("npm", args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    env: process.env
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${label} failed with status ${result.status}`);
  }
}

if (provider !== "http") {
  console.error("Production LLM verification requires --provider=http.");
  console.error("Configure LLM_EXTRACT_URL/LLM_EXTRACT_API_KEY before running this gate.");
  process.exit(1);
}

if (!process.env.LLM_EXTRACT_URL) {
  console.error("LLM_EXTRACT_URL is required for --provider=http.");
  process.exit(1);
}
if (!process.env.LLM_EXTRACT_API_KEY) {
  console.error("LLM_EXTRACT_API_KEY is required for production LLM verification.");
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      provider,
      timeoutMs,
      limit,
      model: process.env.LLM_EXTRACT_MODEL || null,
      rpm: process.env.LLM_EXTRACT_RPM || null,
      minIntervalMs: process.env.LLM_EXTRACT_MIN_INTERVAL_MS || null,
      maxRetries: process.env.LLM_EXTRACT_MAX_RETRIES || null,
      retryBaseMs: process.env.LLM_EXTRACT_RETRY_BASE_MS || null
    },
    null,
    2
  )
);

run("llm provider status", [
  "run",
  "llm:status",
  "--",
  `--provider=${provider}`,
  `--require-provider=${provider}`,
  `--timeout-ms=${timeoutMs}`
]);
run("llm extraction dry-run", [
  "run",
  "worker:llm",
  "--",
  `--provider=${provider}`,
  "--dry-run",
  "--no-merge",
  "--only-extracted",
  `--limit=${limit}`,
  `--timeout-ms=${timeoutMs}`
]);

console.log("Production LLM gateway verified.");
