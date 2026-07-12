import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = new URL("../", import.meta.url).pathname;
const stateDir = process.env.DB_NATIVE_STATE_DIR || path.join(rootDir, ".local", "postgres");
const dataDir = process.env.DB_NATIVE_DATA_DIR || path.join(stateDir, "data");
const logPath = process.env.DB_NATIVE_LOG_PATH || path.join(stateDir, "postgres.log");
const port = Number(process.env.DB_NATIVE_PORT || 55432);
const host = process.env.DB_NATIVE_HOST || "127.0.0.1";
const database = process.env.DB_NATIVE_DATABASE || "ai_capital";
const username = process.env.DB_NATIVE_USER || "ai_capital";
const password = process.env.DB_NATIVE_PASSWORD || "ai_capital";
const databaseUrl = process.env.DATABASE_URL || `postgres://${username}:${password}@${host}:${port}/${database}`;
const waitTimeoutMs = Number(process.env.DB_BOOTSTRAP_TIMEOUT_MS || 60000);
const shouldStop = process.argv.includes("--stop");
const shouldRestart = process.argv.includes("--restart");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      DATABASE_URL: options.withDatabase ? databaseUrl : process.env.DATABASE_URL,
      PGPASSWORD: options.password ? password : process.env.PGPASSWORD
    }
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
  return result;
}

function tryRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      PGPASSWORD: options.password ? password : process.env.PGPASSWORD
    }
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim()
  };
}

function pgReady(dbName = "postgres") {
  return tryRun("pg_isready", ["-h", host, "-p", String(port), "-d", dbName]).ok;
}

function waitForPostgres() {
  const startedAt = Date.now();
  process.stdout.write(`Waiting for PostgreSQL at ${host}:${port}`);
  while (Date.now() - startedAt < waitTimeoutMs) {
    if (pgReady("postgres")) {
      process.stdout.write("\n");
      return;
    }
    process.stdout.write(".");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  process.stdout.write("\n");
  throw new Error(`Timed out waiting for PostgreSQL after ${waitTimeoutMs}ms`);
}

function ensureCluster() {
  fs.mkdirSync(stateDir, { recursive: true });
  if (fs.existsSync(path.join(dataDir, "PG_VERSION"))) {
    console.log(`Using existing native PostgreSQL cluster: ${dataDir}`);
    return;
  }
  console.log(`Initializing native PostgreSQL cluster: ${dataDir}`);
  run("initdb", ["-D", dataDir, "--no-locale", "--encoding=UTF8", "-A", "trust"]);
}

function startCluster() {
  if (pgReady("postgres")) {
    console.log(`PostgreSQL already reachable at ${host}:${port}`);
    return;
  }
  console.log(`Starting native PostgreSQL on ${host}:${port}`);
  run("pg_ctl", ["-D", dataDir, "-o", `-p ${port} -h ${host}`, "-l", logPath, "start"]);
  waitForPostgres();
}

function stopCluster() {
  if (!fs.existsSync(path.join(dataDir, "PG_VERSION"))) {
    console.log(`No native PostgreSQL cluster found at ${dataDir}`);
    return;
  }
  run("pg_ctl", ["-D", dataDir, "stop", "-m", "fast"]);
}

function ensureRoleAndDatabase() {
  const roleSql = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${username.replaceAll("'", "''")}') THEN
    CREATE ROLE ${username} LOGIN PASSWORD '${password.replaceAll("'", "''")}';
  ELSE
    ALTER ROLE ${username} LOGIN PASSWORD '${password.replaceAll("'", "''")}';
  END IF;
END
$$;
`;
  run("psql", ["-h", host, "-p", String(port), "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", roleSql]);

  const exists = tryRun("psql", [
    "-h",
    host,
    "-p",
    String(port),
    "-d",
    "postgres",
    "-tAc",
    `SELECT 1 FROM pg_database WHERE datname = '${database.replaceAll("'", "''")}'`
  ]);
  if (exists.stdout === "1") {
    console.log(`Database already exists: ${database}`);
    return;
  }
  run("createdb", ["-h", host, "-p", String(port), "-O", username, database]);
}

if (shouldStop) {
  stopCluster();
  process.exit(0);
}

ensureCluster();
if (shouldRestart) {
  stopCluster();
}
startCluster();
ensureRoleAndDatabase();

run("npm", ["run", "db:import"], { withDatabase: true });
run("npm", ["run", "worker:import"], { withDatabase: true });
run("npm", ["run", "db:verify"], { withDatabase: true });
run("npm", ["run", "worker:verify"], { withDatabase: true });

console.log("Native local PostgreSQL is ready.");
console.log(`DATABASE_URL=${databaseUrl}`);
console.log(`Data directory: ${dataDir}`);
console.log(`Log file: ${logPath}`);
