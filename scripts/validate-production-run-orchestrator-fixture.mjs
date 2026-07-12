import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDir = new URL("../", import.meta.url).pathname;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-capital-production-run."));
const expectedHeadSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const expectedHeadShaArg = `--expected-head-sha=${expectedHeadSha}`;
const dispatchToken = "11111111-2222-4333-8444-555555555555";
const dispatchTokenArg = `--dispatch-token=${dispatchToken}`;
const expectedRunTitle = `Validate P0-P3 (${dispatchToken})`;

function run(args) {
  return spawnSync("node", ["scripts/run-production-p0-p3-completion.mjs", ...args], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe"
  });
}

function assertPass(label, args, expectedFragment) {
  const result = run(args);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status !== 0) {
    process.stdout.write(output);
    throw new Error(`${label} should pass production run orchestrator validation`);
  }
  if (!output.includes(expectedFragment)) {
    process.stdout.write(output);
    throw new Error(`${label} did not report expected fragment: ${expectedFragment}`);
  }
}

function assertFail(label, args, expectedFragment) {
  const result = run(args);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status === 0) {
    process.stdout.write(output);
    throw new Error(`${label} should fail production run orchestrator validation`);
  }
  if (!output.includes(expectedFragment)) {
    process.stdout.write(output);
    throw new Error(`${label} did not report expected fragment: ${expectedFragment}`);
  }
}

assertPass(
  "dry run",
  ["--dry-run", "--repo=example/ai-capital-map", "--ref=refs/heads/main", "--timeout-ms=60000", "--poll-ms=5000"],
  "gh workflow run 'Validate P0-P3'"
);
assertPass(
  "dry run command args",
  ["--dry-run", "--repo=example/ai-capital-map", "--ref=refs/heads/main", "--timeout-ms=60000", "--poll-ms=5000"],
  '"nextCommandArgs"'
);
assertPass(
  "dry run unique dispatch token",
  ["--dry-run", "--repo=example/ai-capital-map", "--ref=refs/heads/main", "--timeout-ms=60000", "--poll-ms=5000"],
  "dispatch_token="
);
assertFail("invalid repo", ["--dry-run", "--repo=invalid", "--ref=refs/heads/main"], "must be OWNER/REPO");
assertFail("invalid ref", ["--dry-run", "--repo=example/ai-capital-map", "--ref=main"], "--ref must be refs/heads/<branch>");
assertFail(
  "non-main production ref",
  ["--dry-run", "--repo=example/ai-capital-map", "--ref=refs/heads/feature"],
  "--ref must be refs/heads/main because the production workflow pins P0_P3_EXPECTED_GITHUB_REF=refs/heads/main"
);
assertFail(
  "too low timeout",
  ["--dry-run", "--repo=example/ai-capital-map", "--ref=refs/heads/main", "--timeout-ms=1000"],
  "--timeout-ms must be at least 60000"
);
assertFail(
  "invalid expected source commit",
  ["--dry-run", "--repo=example/ai-capital-map", "--ref=refs/heads/main", "--expected-head-sha=invalid"],
  "--expected-head-sha must be a full 40-character git SHA when set"
);
assertFail(
  "production source override",
  ["--dry-run", "--repo=example/ai-capital-map", "--ref=refs/heads/main", `--expected-head-sha=${expectedHeadSha}`],
  "--expected-head-sha is only supported with --skip-dispatch fixtures"
);
assertFail(
  "invalid dispatch token",
  ["--dry-run", "--repo=example/ai-capital-map", "--ref=refs/heads/main", "--dispatch-token=invalid"],
  "--dispatch-token must be a UUID when set"
);
assertFail(
  "production dispatch token override",
  ["--dry-run", "--repo=example/ai-capital-map", "--ref=refs/heads/main", dispatchTokenArg],
  "--dispatch-token is only supported with --skip-dispatch fixtures"
);
assertFail(
  "skip dispatch without runs file",
  ["--skip-dispatch", "--repo=example/ai-capital-map", "--ref=refs/heads/main", "--timeout-ms=60000", "--poll-ms=5000"],
  "--skip-dispatch is only supported with --runs-file fixtures"
);

const invalidJsonRunsFile = path.join(tempDir, "invalid-runs.json");
fs.writeFileSync(invalidJsonRunsFile, "{not json");
assertFail(
  "invalid runs json",
  [
    "--skip-dispatch",
    expectedHeadShaArg,
    dispatchTokenArg,
    `--runs-file=${invalidJsonRunsFile}`,
    "--repo=example/ai-capital-map",
    "--ref=refs/heads/main",
    "--timeout-ms=60000",
    "--poll-ms=5000"
  ],
  "--runs-file must be valid JSON"
);

const nonArrayRunsFile = path.join(tempDir, "non-array-runs.json");
fs.writeFileSync(nonArrayRunsFile, `${JSON.stringify({ runs: [] })}\n`);
assertFail(
  "non-array runs json",
  [
    "--skip-dispatch",
    expectedHeadShaArg,
    dispatchTokenArg,
    `--runs-file=${nonArrayRunsFile}`,
    "--repo=example/ai-capital-map",
    "--ref=refs/heads/main",
    "--timeout-ms=60000",
    "--poll-ms=5000"
  ],
  "workflow run list must be an array"
);

const oldAndNewRunsFile = path.join(tempDir, "old-and-new-runs.json");
fs.writeFileSync(
  oldAndNewRunsFile,
  `${JSON.stringify(
    [
      {
        databaseId: 111,
        workflowName: "Validate P0-P3",
        displayTitle: expectedRunTitle,
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "success",
        headSha: expectedHeadSha,
        headBranch: "main",
        createdAt: "2026-07-06T00:00:00.000Z",
        url: "https://github.com/example/ai-capital-map/actions/runs/111"
      },
      {
        databaseId: 222,
        workflowName: "Validate P0-P3",
        displayTitle: expectedRunTitle,
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "success",
        headSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        headBranch: "main",
        createdAt: "2026-07-06T00:02:00.000Z",
        url: "https://github.com/example/ai-capital-map/actions/runs/222"
      }
    ],
    null,
    2
  )}\n`
);
assertFail(
  "skip fixture without expected source commit",
  [
    "--skip-dispatch",
    `--runs-file=${oldAndNewRunsFile}`,
    "--dispatch-started-at=2026-07-06T00:01:00.000Z",
    "--repo=example/ai-capital-map",
    "--ref=refs/heads/main",
    "--timeout-ms=60000",
    "--poll-ms=5000"
  ],
  "--skip-dispatch requires --expected-head-sha=<remote_main_commit_sha>"
);
assertFail(
  "skip fixture without dispatch token",
  [
    "--skip-dispatch",
    expectedHeadShaArg,
    `--runs-file=${oldAndNewRunsFile}`,
    "--dispatch-started-at=2026-07-06T00:01:00.000Z",
    "--repo=example/ai-capital-map",
    "--ref=refs/heads/main",
    "--timeout-ms=60000",
    "--poll-ms=5000"
  ],
  "--skip-dispatch requires --dispatch-token=<dispatch_uuid>"
);
assertPass(
  "select new run after dispatch",
  [
    "--skip-dispatch",
    expectedHeadShaArg,
    dispatchTokenArg,
    `--runs-file=${oldAndNewRunsFile}`,
    "--dispatch-started-at=2026-07-06T00:01:00.000Z",
    "--repo=example/ai-capital-map",
    "--ref=refs/heads/main",
    "--timeout-ms=60000",
    "--poll-ms=5000"
  ],
  '"databaseId": 222'
);

const incompleteRunsFile = path.join(tempDir, "incomplete-runs.json");
fs.writeFileSync(
  incompleteRunsFile,
  `${JSON.stringify(
    [
      {
        databaseId: 222,
        workflowName: "Validate P0-P3",
        displayTitle: expectedRunTitle,
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "success",
        headBranch: "main",
        createdAt: "2026-07-06T00:02:00.000Z",
        url: "https://github.com/example/ai-capital-map/actions/runs/222"
      }
    ],
    null,
    2
  )}\n`
);
assertFail(
  "ignore incomplete run record",
  [
    "--skip-dispatch",
    expectedHeadShaArg,
    dispatchTokenArg,
    `--runs-file=${incompleteRunsFile}`,
    "--dispatch-started-at=2026-07-06T00:01:00.000Z",
    "--repo=example/ai-capital-map",
    "--ref=refs/heads/main",
    "--timeout-ms=60000",
    "--poll-ms=5000"
  ],
  "no workflow_dispatch run created after dispatch was found"
);

const idOnlyRunsFile = path.join(tempDir, "id-only-runs.json");
fs.writeFileSync(
  idOnlyRunsFile,
  `${JSON.stringify(
    [
      {
        id: 222,
        workflowName: "Validate P0-P3",
        displayTitle: expectedRunTitle,
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "success",
        headSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        headBranch: "main",
        createdAt: "2026-07-06T00:02:00.000Z",
        url: "https://github.com/example/ai-capital-map/actions/runs/222"
      }
    ],
    null,
    2
  )}\n`
);
assertFail(
  "ignore run without database id",
  [
    "--skip-dispatch",
    expectedHeadShaArg,
    dispatchTokenArg,
    `--runs-file=${idOnlyRunsFile}`,
    "--dispatch-started-at=2026-07-06T00:01:00.000Z",
    "--repo=example/ai-capital-map",
    "--ref=refs/heads/main",
    "--timeout-ms=60000",
    "--poll-ms=5000"
  ],
  "no workflow_dispatch run created after dispatch was found"
);

const mixedWorkflowRunsFile = path.join(tempDir, "mixed-workflow-runs.json");
fs.writeFileSync(
  mixedWorkflowRunsFile,
  `${JSON.stringify(
    [
      {
        databaseId: 333,
        workflowName: "Other Workflow",
        displayTitle: expectedRunTitle,
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "success",
        headSha: expectedHeadSha,
        headBranch: "main",
        createdAt: "2026-07-06T00:03:00.000Z",
        url: "https://github.com/example/ai-capital-map/actions/runs/333"
      },
      {
        databaseId: 222,
        workflowName: "Validate P0-P3",
        displayTitle: expectedRunTitle,
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "success",
        headSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        headBranch: "main",
        createdAt: "2026-07-06T00:02:00.000Z",
        url: "https://github.com/example/ai-capital-map/actions/runs/222"
      }
    ],
    null,
    2
  )}\n`
);
assertPass(
  "ignore newer different workflow",
  [
    "--skip-dispatch",
    expectedHeadShaArg,
    dispatchTokenArg,
    `--runs-file=${mixedWorkflowRunsFile}`,
    "--dispatch-started-at=2026-07-06T00:01:00.000Z",
    "--repo=example/ai-capital-map",
    "--ref=refs/heads/main",
    "--timeout-ms=60000",
    "--poll-ms=5000"
  ],
  '"databaseId": 222'
);

const wrongUrlRunsFile = path.join(tempDir, "wrong-url-runs.json");
fs.writeFileSync(
  wrongUrlRunsFile,
  `${JSON.stringify(
    [
      {
        databaseId: 333,
        workflowName: "Validate P0-P3",
        displayTitle: expectedRunTitle,
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "success",
        headSha: expectedHeadSha,
        headBranch: "main",
        createdAt: "2026-07-06T00:03:00.000Z",
        url: "https://github.com/other/repo/actions/runs/333"
      },
      {
        databaseId: 222,
        workflowName: "Validate P0-P3",
        displayTitle: expectedRunTitle,
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "success",
        headSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        headBranch: "main",
        createdAt: "2026-07-06T00:02:00.000Z",
        url: "https://github.com/example/ai-capital-map/actions/runs/222"
      }
    ],
    null,
    2
  )}\n`
);
assertPass(
  "ignore newer wrong run url",
  [
    "--skip-dispatch",
    expectedHeadShaArg,
    dispatchTokenArg,
    `--runs-file=${wrongUrlRunsFile}`,
    "--dispatch-started-at=2026-07-06T00:01:00.000Z",
    "--repo=example/ai-capital-map",
    "--ref=refs/heads/main",
    "--timeout-ms=60000",
    "--poll-ms=5000"
  ],
  '"databaseId": 222'
);

const concurrentCommitRunsFile = path.join(tempDir, "concurrent-commit-runs.json");
fs.writeFileSync(
  concurrentCommitRunsFile,
  `${JSON.stringify(
    [
      {
        databaseId: 333,
        workflowName: "Validate P0-P3",
        displayTitle: "Validate P0-P3 (aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee)",
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "success",
        headSha: expectedHeadSha,
        headBranch: "main",
        createdAt: "2026-07-06T00:03:00.000Z",
        url: "https://github.com/example/ai-capital-map/actions/runs/333"
      },
      {
        databaseId: 222,
        workflowName: "Validate P0-P3",
        displayTitle: expectedRunTitle,
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "success",
        headSha: expectedHeadSha,
        headBranch: "main",
        createdAt: "2026-07-06T00:02:00.000Z",
        url: "https://github.com/example/ai-capital-map/actions/runs/222"
      }
    ],
    null,
    2
  )}\n`
);
assertPass(
  "ignore newer same-commit run from a different dispatch token",
  [
    "--skip-dispatch",
    expectedHeadShaArg,
    dispatchTokenArg,
    `--runs-file=${concurrentCommitRunsFile}`,
    "--dispatch-started-at=2026-07-06T00:01:00.000Z",
    "--repo=example/ai-capital-map",
    "--ref=refs/heads/main",
    "--timeout-ms=60000",
    "--poll-ms=5000"
  ],
  '"databaseId": 222'
);

const oldOnlyRunsFile = path.join(tempDir, "old-only-runs.json");
fs.writeFileSync(
  oldOnlyRunsFile,
  `${JSON.stringify(
    [
      {
        databaseId: 111,
        workflowName: "Validate P0-P3",
        displayTitle: expectedRunTitle,
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "success",
        headSha: expectedHeadSha,
        headBranch: "main",
        createdAt: "2026-07-06T00:00:00.000Z",
        url: "https://github.com/example/ai-capital-map/actions/runs/111"
      }
    ],
    null,
    2
  )}\n`
);
assertFail(
  "ignore old run before dispatch",
  [
    "--skip-dispatch",
    expectedHeadShaArg,
    dispatchTokenArg,
    `--runs-file=${oldOnlyRunsFile}`,
    "--dispatch-started-at=2026-07-06T00:01:00.000Z",
    "--repo=example/ai-capital-map",
    "--ref=refs/heads/main",
    "--timeout-ms=60000",
    "--poll-ms=5000"
  ],
  "no workflow_dispatch run created after dispatch was found"
);

const justBeforeDispatchRunsFile = path.join(tempDir, "just-before-dispatch-runs.json");
fs.writeFileSync(
  justBeforeDispatchRunsFile,
  `${JSON.stringify(
    [
      {
        databaseId: 111,
        workflowName: "Validate P0-P3",
        displayTitle: expectedRunTitle,
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "success",
        headSha: expectedHeadSha,
        headBranch: "main",
        createdAt: "2026-07-06T00:00:59.000Z",
        url: "https://github.com/example/ai-capital-map/actions/runs/111"
      }
    ],
    null,
    2
  )}\n`
);
assertFail(
  "ignore run one second before dispatch",
  [
    "--skip-dispatch",
    expectedHeadShaArg,
    dispatchTokenArg,
    `--runs-file=${justBeforeDispatchRunsFile}`,
    "--dispatch-started-at=2026-07-06T00:01:00.000Z",
    "--repo=example/ai-capital-map",
    "--ref=refs/heads/main",
    "--timeout-ms=60000",
    "--poll-ms=5000"
  ],
  "no workflow_dispatch run created after dispatch was found"
);

console.log("Production run orchestrator fixture validation passed.");
fs.rmSync(tempDir, { recursive: true, force: true });
