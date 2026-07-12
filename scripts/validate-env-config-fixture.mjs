import { spawnSync } from "node:child_process";

const rootDir = new URL("../", import.meta.url).pathname;

const cleanKeys = [
  "DATABASE_URL",
  "AI_CAPITAL_REQUIRE_DB",
  "ADMIN_REVIEW_TOKEN",
  "ADMIN_REVIEW_ADMIN_TOKEN",
  "ADMIN_REVIEW_REVIEWER_TOKEN",
  "ADMIN_REVIEW_SESSION_SECRET",
  "ADMIN_REVIEW_ADMIN_PASSWORD",
  "ADMIN_REVIEW_REVIEWER_PASSWORD",
  "LLM_EXTRACT_COMMAND",
  "LLM_EXTRACT_URL",
  "LLM_EXTRACT_API_KEY"
];

function run(args = [], env = {}) {
  const nextEnv = { ...process.env };
  for (const key of cleanKeys) delete nextEnv[key];
  Object.assign(nextEnv, env);
  return spawnSync("node", ["scripts/validate-env-config.mjs", ...args], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    env: nextEnv
  });
}

function output(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function assertPass(label, result) {
  if (result.status !== 0) {
    process.stdout.write(output(result));
    throw new Error(`${label} should pass env validation`);
  }
}

function assertFail(label, result, expectedFragment) {
  const text = output(result);
  if (result.status === 0) {
    process.stdout.write(text);
    throw new Error(`${label} should fail env validation`);
  }
  if (!text.includes(expectedFragment)) {
    process.stdout.write(text);
    throw new Error(`${label} missing expected validation fragment: ${expectedFragment}`);
  }
}

const productionBaseEnv = {
  DATABASE_URL: "postgres://prod:secret@prod-db.example.com:5432/ai_capital",
  LLM_EXTRACT_URL: "https://llm-gateway.example.com/extract",
  LLM_EXTRACT_API_KEY: "llm-token"
};

assertPass(
  "local legacy token",
  run([], {
    ADMIN_REVIEW_TOKEN: "legacy-token"
  })
);

assertFail(
  "production legacy token only",
  run(["--require-production"], {
    ...productionBaseEnv,
    ADMIN_REVIEW_TOKEN: "legacy-token"
  }),
  "production readiness requires ADMIN_REVIEW_SESSION_SECRET, ADMIN_REVIEW_ADMIN_PASSWORD, and ADMIN_REVIEW_REVIEWER_PASSWORD"
);

assertFail(
  "production role tokens only",
  run(["--require-production"], {
    ...productionBaseEnv,
    ADMIN_REVIEW_ADMIN_TOKEN: "admin-token",
    ADMIN_REVIEW_REVIEWER_TOKEN: "reviewer-token"
  }),
  "production readiness requires ADMIN_REVIEW_SESSION_SECRET, ADMIN_REVIEW_ADMIN_PASSWORD, and ADMIN_REVIEW_REVIEWER_PASSWORD"
);

assertPass(
  "production session auth",
  run(["--require-production"], {
    ...productionBaseEnv,
    ADMIN_REVIEW_SESSION_SECRET: "session-secret",
    ADMIN_REVIEW_ADMIN_PASSWORD: "admin-password",
    ADMIN_REVIEW_REVIEWER_PASSWORD: "reviewer-password"
  })
);

assertFail(
  "production localhost services",
  run(["--require-production"], {
    DATABASE_URL: "postgres://prod:secret@127.0.0.1:5432/ai_capital",
    LLM_EXTRACT_URL: "http://localhost:3001/extract",
    LLM_EXTRACT_API_KEY: "llm-token",
    ADMIN_REVIEW_SESSION_SECRET: "session-secret",
    ADMIN_REVIEW_ADMIN_PASSWORD: "admin-password",
    ADMIN_REVIEW_REVIEWER_PASSWORD: "reviewer-password"
  }),
  "production readiness requires DATABASE_URL to point to a non-localhost PostgreSQL service"
);

console.log("Environment config fixture validation passed.");
