import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL || "postgres://ai_capital:ai_capital@127.0.0.1:55432/ai_capital";
const waitTimeoutMs = Number(process.env.DB_BOOTSTRAP_TIMEOUT_MS || 60000);
const startedAt = Date.now();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: new URL("../", import.meta.url).pathname,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      DATABASE_URL: options.withDatabase ? databaseUrl : process.env.DATABASE_URL
    }
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
}

function tryRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: new URL("../", import.meta.url).pathname,
    encoding: "utf8",
    stdio: "pipe",
    env: {
      ...process.env,
      DATABASE_URL: options.withDatabase ? databaseUrl : process.env.DATABASE_URL
    }
  });
  return result.status === 0;
}

console.log("Starting local PostgreSQL service with Docker Compose...");
try {
  run("docker", ["compose", "up", "-d", "postgres"]);

  process.stdout.write(`Waiting for PostgreSQL at ${databaseUrl}`);
  while (Date.now() - startedAt < waitTimeoutMs) {
    if (tryRun("docker", ["compose", "exec", "-T", "postgres", "pg_isready", "-U", "ai_capital", "-d", "ai_capital"])) {
      process.stdout.write("\n");
      break;
    }
    process.stdout.write(".");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }

  if (Date.now() - startedAt >= waitTimeoutMs) {
    process.stdout.write("\n");
    throw new Error(`Timed out waiting for PostgreSQL after ${waitTimeoutMs}ms`);
  }

  run("npm", ["run", "db:import"], { withDatabase: true });
  run("npm", ["run", "worker:import"], { withDatabase: true });
  run("npm", ["run", "db:verify"], { withDatabase: true });
  run("npm", ["run", "worker:verify"], { withDatabase: true });

  console.log(`Local PostgreSQL is ready: ${databaseUrl}`);
} catch (error) {
  console.error(error.message);
  console.error("If Docker is installed, start Docker Desktop or the Docker daemon and rerun npm run db:bootstrap.");
  process.exit(1);
}
