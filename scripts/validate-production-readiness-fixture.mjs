import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const rootDir = new URL("../", import.meta.url).pathname;
const token = "test-token";
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-capital-production-fixture."));
const dataDir = path.join(tempDir, "data");
const logPath = path.join(tempDir, "postgres.log");

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => (port ? resolve(port) : reject(new Error("Could not allocate local port."))));
    });
  });
}

function run(label, command, args, env) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    env
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${label} failed with status ${result.status}`);
  }
}

function waitForFixture(child, port) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`LLM fixture did not start on ${port}. Output: ${output}`)), 5000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes(`http://127.0.0.1:${port}`)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`LLM fixture exited before readiness with status ${code}. Output: ${output}`));
    });
  });
}

async function stopFixture(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function stopPostgres(env) {
  if (!fs.existsSync(dataDir)) return;
  const result = spawnSync("pg_ctl", ["-D", dataDir, "stop", "-m", "fast"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    env
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function startPostgres(env, port) {
  try {
    run(
      "start temporary PostgreSQL",
      "pg_ctl",
      ["-D", dataDir, "-o", `-p ${port} -h 127.0.0.1 -k ${tempDir}`, "-l", logPath, "start"],
      env
    );
  } catch (error) {
    if (fs.existsSync(logPath)) {
      process.stderr.write(`\nPostgreSQL startup log (${logPath}):\n`);
      process.stderr.write(fs.readFileSync(logPath, "utf8"));
    }
    throw error;
  }
}

const pgPort = await availablePort();
let llmPort = await availablePort();
while (llmPort === pgPort) {
  llmPort = await availablePort();
}
const databaseUrl = `postgres://127.0.0.1:${pgPort}/postgres`;
let fixture = null;

const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  ADMIN_REVIEW_SESSION_SECRET: "fixture-session-secret",
  ADMIN_REVIEW_ADMIN_PASSWORD: "fixture-admin-password",
  ADMIN_REVIEW_REVIEWER_PASSWORD: "fixture-reviewer-password",
  LLM_EXTRACT_URL: `http://127.0.0.1:${llmPort}`,
  LLM_EXTRACT_API_KEY: token,
  LLM_EXTRACT_RPM: "600",
  LLM_EXTRACT_MAX_RETRIES: "1"
};

try {
  console.log(`Creating production readiness fixture PostgreSQL cluster in ${tempDir}`);
  run("init temporary PostgreSQL", "initdb", ["-D", dataDir, "--no-locale", "--encoding=UTF8"], env);
  startPostgres(env, pgPort);
  run("import seed data", "npm", ["run", "db:import"], env);
  run("import worker artifacts", "npm", ["run", "worker:import"], env);

  fixture = spawn("node", ["scripts/llm-http-fixture-server.mjs", `--port=${llmPort}`, `--require-token=${token}`], {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"],
    env
  });
  await waitForFixture(fixture, llmPort);

  run(
    "production readiness fixture gate",
    "npm",
    [
      "run",
      "validate:p0-p3:production",
      "--",
      "--provider=http",
      "--timeout-ms=5000",
      "--limit=1",
      "--allow-local-services"
    ],
    env
  );
  console.log("Production readiness fixture verified.");
} finally {
  await stopFixture(fixture);
  stopPostgres(env);
  fs.rmSync(tempDir, { recursive: true, force: true });
}
