import { spawnSync } from "node:child_process";

export function currentGitCommit({ env = process.env, cwd } = {}) {
  for (const fromEnv of [env.P0_P3_EXPECTED_SOURCE_COMMIT, env.GITHUB_SHA, env.SOURCE_COMMIT]) {
    if (/^[a-f0-9]{40}$/i.test(fromEnv || "")) return fromEnv;
  }
  const result = spawnSync("git", ["rev-parse", "--verify", "HEAD"], {
    cwd,
    encoding: "utf8",
    stdio: "pipe"
  });
  return result.status === 0 ? result.stdout.trim() : "";
}
