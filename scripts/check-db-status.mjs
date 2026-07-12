import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const rootDir = new URL("../", import.meta.url).pathname;
const defaultDatabaseUrl = "postgres://ai_capital:ai_capital@127.0.0.1:55432/ai_capital";
const databaseUrl = process.env.DATABASE_URL || defaultDatabaseUrl;
const requireReady = process.argv.includes("--require-ready") || process.env.AI_CAPITAL_REQUIRE_DB === "1";
const nativeStateDir = process.env.DB_NATIVE_STATE_DIR || path.join(rootDir, ".local", "postgres");
const nativeDataDir = process.env.DB_NATIVE_DATA_DIR || path.join(nativeStateDir, "data");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe"
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim()
  };
}

function redactDatabaseUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.password) parsed.password = "REDACTED";
    return parsed.toString();
  } catch {
    return value.replace(/(:\/\/[^:\s]+:)[^@\s]+(@)/, "$1REDACTED$2");
  }
}

async function checkDatabase() {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 3000,
    max: 1
  });

  try {
    const result = await pool.query(`
      SELECT
        current_database() AS database,
        current_user AS username,
        to_regclass('public.entity') IS NOT NULL AS has_entity_table,
        to_regclass('public.candidate_relationship') IS NOT NULL AS has_candidate_relationship_table
    `);
    const row = result.rows[0];
    const counts = {};
    if (row.has_entity_table) {
      const entityCount = await pool.query("SELECT count(*)::int AS count FROM entity");
      counts.entity = entityCount.rows[0].count;
    }
    if (row.has_candidate_relationship_table) {
      const candidateCount = await pool.query("SELECT count(*)::int AS count FROM candidate_relationship");
      counts.candidateRelationship = candidateCount.rows[0].count;
    }
    return {
      ok: true,
      database: row.database,
      username: row.username,
      schemaReady: row.has_entity_table && row.has_candidate_relationship_table,
      counts
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await pool.end().catch(() => {});
  }
}

const composeConfig = run("docker", ["compose", "config", "--quiet"]);
const composePs = run("docker", ["compose", "ps", "--format", "json"]);
const composeHealth = run("docker", ["compose", "exec", "-T", "postgres", "pg_isready", "-U", "ai_capital", "-d", "ai_capital"]);
const initdb = run("which", ["initdb"]);
const pgCtl = run("which", ["pg_ctl"]);
const psql = run("which", ["psql"]);
const database = await checkDatabase();

const status = {
  databaseUrl: redactDatabaseUrl(databaseUrl),
  ready: Boolean(database.ok && database.schemaReady),
  composeConfigValid: composeConfig.ok,
  dockerDaemonReachable: composePs.ok,
  postgresServiceHealthy: composeHealth.ok,
  nativePostgresToolsAvailable: initdb.ok && pgCtl.ok && psql.ok,
  nativeDataDir,
  nativeClusterInitialized: fs.existsSync(path.join(nativeDataDir, "PG_VERSION")),
  databaseReachable: database.ok,
  schemaReady: database.schemaReady || false,
  counts: database.counts || {},
  diagnostics: {
    composeConfig: composeConfig.ok ? "ok" : composeConfig.stderr || composeConfig.stdout,
    composePs: composePs.ok ? "ok" : composePs.stderr || composePs.stdout,
    postgresHealth: composeHealth.ok ? composeHealth.stdout || "ok" : composeHealth.stderr || composeHealth.stdout,
    nativeTools: {
      initdb: initdb.ok ? initdb.stdout : initdb.stderr || initdb.stdout,
      pgCtl: pgCtl.ok ? pgCtl.stdout : pgCtl.stderr || pgCtl.stdout,
      psql: psql.ok ? psql.stdout : psql.stderr || psql.stdout
    },
    database: database.ok ? `${database.database} as ${database.username}` : database.error
  }
};

console.log(JSON.stringify(status, null, 2));

if (requireReady && !status.ready) {
  console.error(
    "Local PostgreSQL is not ready. Run npm run db:bootstrap:native, or start Docker Desktop and run npm run db:bootstrap."
  );
  process.exit(1);
}
