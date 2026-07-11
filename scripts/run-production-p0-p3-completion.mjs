import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const productionRef = "refs/heads/main";
const repository = argValue("--repo") || process.env.P0_P3_EXPECTED_GITHUB_REPOSITORY || "";
const ref = argValue("--ref") || process.env.P0_P3_EXPECTED_GITHUB_REF || productionRef;
const timeoutMs = Number(argValue("--timeout-ms") || 30 * 60 * 1000);
const pollMs = Number(argValue("--poll-ms") || 15000);
const dryRun = args.includes("--dry-run");
const runsFile = argValue("--runs-file") || "";
const expectedHeadShaArg = argValue("--expected-head-sha") || "";
const dispatchTokenArg = argValue("--dispatch-token") || "";
const dispatchStartedAtArg = argValue("--dispatch-started-at") || "";
const skipDispatch = args.includes("--skip-dispatch");
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
    cwd: new URL("../", import.meta.url).pathname,
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

function ghJson(label, commandArgs) {
  const result = run(label, "gh", commandArgs);
  try {
    return JSON.parse(result.stdout);
  } catch {
    console.error(
      JSON.stringify(
        {
          ok: false,
          errors: [`${label} returned invalid JSON`]
        },
        null,
        2
      )
    );
    process.exit(1);
  }
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function readRuns() {
  let runs = null;
  if (runsFile) {
    try {
      runs = JSON.parse(fs.readFileSync(path.resolve(new URL("../", import.meta.url).pathname, runsFile), "utf8"));
    } catch {
      console.error(
        JSON.stringify(
          {
            ok: false,
            errors: ["--runs-file must be valid JSON"]
          },
          null,
          2
        )
      );
      process.exit(1);
    }
  } else {
    runs = ghJson("read production workflow runs", [
      "run",
      "list",
      "--repo",
      repository,
      "--workflow",
      "Validate P0-P3",
      "--event",
      "workflow_dispatch",
      "--branch",
      branch,
      "--limit",
      "10",
      "--json",
      "databaseId,workflowName,name,displayTitle,event,status,conclusion,headSha,headBranch,createdAt,url"
    ]);
  }
  if (!Array.isArray(runs)) {
    console.error(JSON.stringify({ ok: false, errors: ["workflow run list must be an array"] }, null, 2));
    process.exit(1);
  }
  return runs;
}

function refBranch(value) {
  return value.startsWith("refs/heads/") ? value.slice("refs/heads/".length) : value;
}

function createdAtMs(run) {
  const value = Date.parse(run.createdAt || "");
  return Number.isFinite(value) ? value : 0;
}

function runUrlMatchesRepository(run) {
  try {
    const parsedUrl = new URL(String(run.url || ""));
    const expectedPath = `/${repository}/actions/runs/${run.databaseId}`.toLowerCase();
    const actualPath = parsedUrl.pathname.replace(/\/$/, "").toLowerCase();
    return parsedUrl.hostname === "github.com" && actualPath === expectedPath;
  } catch {
    return false;
  }
}

function selectRun(runs, dispatchStartedAtMs, expectedHeadSha, expectedRunTitle) {
  return (
    runs
      .filter((run) => run && typeof run === "object")
      .filter((run) => (run.workflowName || run.name || "") === "Validate P0-P3")
      .filter((run) => run.displayTitle === expectedRunTitle)
      .filter((run) => run.event === "workflow_dispatch")
      .filter((run) => run.headBranch === branch)
      .filter((run) => /^\d+$/.test(String(run.databaseId || "")))
      .filter((run) => runUrlMatchesRepository(run))
      .filter((run) => /^[a-f0-9]{40}$/i.test(run.headSha || ""))
      .filter((run) => run.headSha.toLowerCase() === expectedHeadSha.toLowerCase())
      .filter((run) => Number.isFinite(createdAtMs(run)) && createdAtMs(run) > 0)
      .filter((run) => createdAtMs(run) >= dispatchStartedAtMs)
      .sort((a, b) => createdAtMs(b) - createdAtMs(a))[0] || null
  );
}

if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
  errors.push("--repo or P0_P3_EXPECTED_GITHUB_REPOSITORY must be OWNER/REPO");
}
if (!/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(ref)) {
  errors.push("--ref must be refs/heads/<branch> for production workflow dispatch");
} else if (ref !== productionRef) {
  errors.push("--ref must be refs/heads/main because the production workflow pins P0_P3_EXPECTED_GITHUB_REF=refs/heads/main");
}
if (!Number.isFinite(timeoutMs) || timeoutMs < 60000) {
  errors.push("--timeout-ms must be at least 60000");
}
if (!Number.isFinite(pollMs) || pollMs < 5000) {
  errors.push("--poll-ms must be at least 5000");
}
if (dispatchStartedAtArg && !Number.isFinite(Date.parse(dispatchStartedAtArg))) {
  errors.push("--dispatch-started-at must be an ISO timestamp when set");
}
if (runsFile && !skipDispatch) {
  errors.push("--runs-file requires --skip-dispatch");
}
if (skipDispatch && !runsFile) {
  errors.push("--skip-dispatch is only supported with --runs-file fixtures");
}
if (expectedHeadShaArg && !/^[a-f0-9]{40}$/i.test(expectedHeadShaArg)) {
  errors.push("--expected-head-sha must be a full 40-character git SHA when set");
}
if (dispatchTokenArg && !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(dispatchTokenArg)) {
  errors.push("--dispatch-token must be a UUID when set");
}
if (skipDispatch && !expectedHeadShaArg) {
  errors.push("--skip-dispatch requires --expected-head-sha=<remote_main_commit_sha>");
}
if (skipDispatch && !dispatchTokenArg) {
  errors.push("--skip-dispatch requires --dispatch-token=<dispatch_uuid>");
}
if (!skipDispatch && expectedHeadShaArg) {
  errors.push("--expected-head-sha is only supported with --skip-dispatch fixtures");
}
if (!skipDispatch && dispatchTokenArg) {
  errors.push("--dispatch-token is only supported with --skip-dispatch fixtures");
}
if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exit(1);
}

const branch = refBranch(ref);
const dispatchToken = skipDispatch ? dispatchTokenArg : randomUUID();
const expectedRunTitle = `Validate P0-P3 (${dispatchToken})`;
const workflowArgs = [
  "workflow",
  "run",
  "Validate P0-P3",
  "--repo",
  repository,
  "--ref",
  branch,
  "-f",
  "production_llm=true",
  "-f",
  `dispatch_token=${dispatchToken}`
];
if (dryRun) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: true,
        nextCommand: `gh ${workflowArgs.map(shellQuote).join(" ")}`,
        nextCommandArgs: workflowArgs,
        repository,
        ref,
        dispatchToken,
        expectedRunTitle
      },
      null,
      2
    )
  );
  process.exit(0);
}

let dispatchStartedAt = dispatchStartedAtArg || (skipDispatch ? new Date().toISOString() : "");
let expectedHeadSha = expectedHeadShaArg;

if (!skipDispatch) {
  run("GitHub production preflight", "npm", [
    "run",
    "validate:github-production-preflight",
    "--",
    `--repo=${repository}`
  ]);

  const sourceCommit = ghJson("resolve production source commit", [
    "api",
    `repos/${repository}/commits/${branch}`,
    "--jq",
    "{sha: .sha}"
  ]);
  expectedHeadSha = String(sourceCommit?.sha || "");
  if (!/^[a-f0-9]{40}$/i.test(expectedHeadSha)) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          repository,
          ref,
          errors: ["remote production ref did not resolve to a full 40-character git SHA"]
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  if (!dispatchStartedAt) dispatchStartedAt = new Date().toISOString();
  run("dispatch production P0-P3 workflow", "gh", workflowArgs);
}

const dispatchStartedAtMs = Date.parse(dispatchStartedAt);
const deadline = Date.now() + timeoutMs;
let selectedRun = null;
while (Date.now() <= deadline) {
  const runs = readRuns();
  selectedRun = selectRun(runs, dispatchStartedAtMs, expectedHeadSha, expectedRunTitle);
  if (selectedRun?.status === "completed") break;
  if (runsFile) break;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pollMs);
}

if (!selectedRun) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        dispatchStartedAt,
        expectedHeadSha,
        dispatchToken,
        expectedRunTitle,
        errors: ["no workflow_dispatch run created after dispatch was found"]
      },
      null,
      2
    )
  );
  process.exit(1);
}
if (selectedRun.status !== "completed" || selectedRun.conclusion !== "success") {
  console.error(
    JSON.stringify(
      {
        ok: false,
        errors: ["production workflow run did not complete successfully"],
        run: selectedRun
      },
      null,
      2
    )
  );
  process.exit(1);
}

if (skipDispatch) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        expectedHeadSha,
        dispatchToken,
        expectedRunTitle,
        selectedRun
      },
      null,
      2
    )
  );
} else {
  run("validate production completion", "npm", [
    "run",
    "validate:production-completion",
    "--",
    `--commit=${expectedHeadSha}`,
    `--repo=${repository}`,
    `--ref=${ref}`,
    `--run-id=${selectedRun.databaseId}`,
    `--dispatch-started-at=${dispatchStartedAt}`,
    "--download"
  ]);
}
