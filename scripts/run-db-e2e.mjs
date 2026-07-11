import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const port = portArg ? Number(portArg.split("=")[1]) : 55433;
const keepDb = process.argv.includes("--keep-db");
const rootDir = new URL("../", import.meta.url).pathname;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-capital-pg-e2e."));
const dataDir = path.join(tempDir, "data");
const logPath = path.join(tempDir, "postgres.log");
const databaseUrl = `postgres://127.0.0.1:${port}/postgres`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      DATABASE_URL: options.databaseUrl ? databaseUrl : process.env.DATABASE_URL
    }
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

function stopServer() {
  try {
    run("pg_ctl", ["-D", dataDir, "stop", "-m", "fast"]);
  } catch {
    // Best effort cleanup; earlier failure may mean the server never started.
  }
}

try {
  console.log(`Creating temporary PostgreSQL cluster in ${tempDir}`);
  run("initdb", ["-D", dataDir, "--no-locale", "--encoding=UTF8"]);
  run("pg_ctl", ["-D", dataDir, "-o", `-p ${port} -h 127.0.0.1`, "-l", logPath, "start"]);

  console.log(`Running database E2E against ${databaseUrl}`);
  run("npm", ["run", "db:import"], { databaseUrl: true });
  run("npm", ["run", "worker:import"], { databaseUrl: true });
  run("npm", ["run", "db:verify"], { databaseUrl: true });
  run("npm", ["run", "worker:verify"], { databaseUrl: true });
  run("npm", ["run", "candidate:verify-approval"], { databaseUrl: true });
  run("npm", ["run", "candidate:verify-merge"], { databaseUrl: true });
  run("npm", ["run", "candidate:verify-metric-edit"], { databaseUrl: true });
  run("npm", ["run", "candidate:verify-worker-metric"], { databaseUrl: true });
  console.log("Database E2E verified successfully.");
} finally {
  if (fs.existsSync(dataDir)) {
    stopServer();
  }
  if (!keepDb) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } else {
    console.log(`Temporary PostgreSQL files kept at ${tempDir}`);
  }
}
