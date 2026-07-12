import assert from "node:assert/strict";
import { currentGitCommit } from "./lib/source-revision.mjs";

const p0p3Commit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const githubSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const sourceCommit = "cccccccccccccccccccccccccccccccccccccccc";

assert.equal(
  currentGitCommit({
    env: {
      P0_P3_EXPECTED_SOURCE_COMMIT: p0p3Commit,
      GITHUB_SHA: githubSha,
      SOURCE_COMMIT: sourceCommit
    }
  }),
  p0p3Commit,
  "P0_P3_EXPECTED_SOURCE_COMMIT must take precedence over GitHub defaults"
);

assert.equal(
  currentGitCommit({
    env: {
      GITHUB_SHA: githubSha,
      SOURCE_COMMIT: sourceCommit
    }
  }),
  githubSha,
  "GITHUB_SHA must take precedence over SOURCE_COMMIT"
);

assert.equal(
  currentGitCommit({
    env: {
      SOURCE_COMMIT: sourceCommit
    }
  }),
  sourceCommit,
  "SOURCE_COMMIT must be used when P0_P3_EXPECTED_SOURCE_COMMIT and GITHUB_SHA are absent"
);

assert.equal(
  currentGitCommit({
    env: {
      P0_P3_EXPECTED_SOURCE_COMMIT: "main",
      GITHUB_SHA: githubSha
    }
  }),
  githubSha,
  "invalid P0_P3_EXPECTED_SOURCE_COMMIT must not mask a valid GitHub SHA"
);

console.log("Source revision fixture verified.");
