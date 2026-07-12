import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { currentGitCommit } from "./lib/source-revision.mjs";

const rootDir = new URL("../", import.meta.url).pathname;
const root = new URL("../", import.meta.url);
const providerArg = process.argv.find((arg) => arg.startsWith("--provider="))?.split("=")[1];
const timeoutMs = process.argv.find((arg) => arg.startsWith("--timeout-ms="))?.split("=")[1] || "30000";
const limit = process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || "1";
const allowLocalServices = process.argv.includes("--allow-local-services");
const writeEvidence = process.argv.includes("--write-evidence");
const provider = providerArg || (process.env.LLM_EXTRACT_URL ? "http" : "");

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
    console.error(`${label} failed with status ${result.status}`);
    process.exit(result.status || 1);
  }
}

if (provider !== "http") {
  console.error("Production readiness requires the HTTP LLM gateway: configure LLM_EXTRACT_URL/LLM_EXTRACT_API_KEY and use --provider=http.");
  process.exit(1);
}
if (writeEvidence && allowLocalServices) {
  console.error("--write-evidence is only allowed for real production services; remove --allow-local-services.");
  process.exit(1);
}

function redactUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.password) parsed.password = "REDACTED";
    if (parsed.username) parsed.username = "REDACTED";
    return parsed.toString();
  } catch {
    return "";
  }
}

function envFirst(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return null;
}

console.log(
  JSON.stringify(
    {
      provider,
      timeoutMs,
      limit,
      requireDatabase: true,
      requireProductionEnv: true,
      requireProductionLlm: true,
      allowLocalServices
    },
    null,
    2
  )
);

run("production environment config", [
  "run",
  "validate:env",
  "--",
  "--require-production",
  ...(allowLocalServices ? ["--allow-local-services"] : [])
]);
run("production database readiness", ["run", "db:status", "--", "--require-ready"]);
run("production seed import verification", ["run", "db:verify"]);
run("production worker artifact verification", ["run", "worker:verify"]);
run("production P3 persistence verification", ["run", "db:verify:p3-persistent"]);
run("P0-P3 release audit", ["run", "audit:p0-p3", "--", "--require-production-llm"]);
run("production LLM gateway dry-run", [
  "run",
  "llm:verify-production",
  "--",
  `--provider=${provider}`,
  `--timeout-ms=${timeoutMs}`,
  `--limit=${limit}`
]);

if (writeEvidence) {
  const evidence = {
    status: "pass",
    generatedAt: new Date().toISOString(),
    provider,
    allowLocalServices,
    adminAuthMode: "session",
    sourceRevision: {
      gitCommit: currentGitCommit({ cwd: rootDir }),
      githubRunId: envFirst("P0_P3_GITHUB_RUN_ID", "GITHUB_RUN_ID"),
      githubWorkflow: envFirst("P0_P3_GITHUB_WORKFLOW", "GITHUB_WORKFLOW"),
      githubRepository: envFirst("P0_P3_EXPECTED_GITHUB_REPOSITORY", "GITHUB_REPOSITORY"),
      githubRunAttempt: envFirst("P0_P3_GITHUB_RUN_ATTEMPT", "GITHUB_RUN_ATTEMPT"),
      githubRef: envFirst("P0_P3_EXPECTED_GITHUB_REF", "GITHUB_REF"),
      githubEventName: envFirst("P0_P3_GITHUB_EVENT_NAME", "GITHUB_EVENT_NAME"),
      productionLlmInput: process.env.P0_P3_PRODUCTION_LLM_INPUT || null,
      productionEnvironment: process.env.P0_P3_PRODUCTION_ENVIRONMENT || null
    },
    databaseUrl: redactUrl(process.env.DATABASE_URL || ""),
    llmUrl: redactUrl(process.env.LLM_EXTRACT_URL || ""),
    commands: [
      `npm run validate:p0-p3:production -- --provider=${provider} --timeout-ms=${timeoutMs} --limit=${limit} --write-evidence`,
      "npm run validate:env -- --require-production",
      "npm run db:status -- --require-ready",
      "npm run db:verify",
      "npm run worker:verify",
      "npm run db:verify:p3-persistent",
      "npm run audit:p0-p3 -- --require-production-llm",
      `npm run llm:verify-production -- --provider=${provider} --timeout-ms=${timeoutMs} --limit=${limit}`
    ]
  };
  fs.writeFileSync(new URL("data/research/p0-p3-production-readiness-report.json", root), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log("Production readiness evidence written to data/research/p0-p3-production-readiness-report.json.");
  run("production readiness evidence validation", ["run", "validate:production-evidence", "--", "--require"]);
}

console.log("Production P0-P3 readiness verified.");
