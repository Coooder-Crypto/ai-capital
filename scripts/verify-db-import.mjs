import pg from "pg";
import { applyEvidenceOverrides, readEvidenceOverrides } from "./evidence-overrides.mjs";

globalThis.window = {};
await import("../data/seed.js");
await import("../data/p1-extension.js");
await import("../data/metrics.js");

const seed = globalThis.window.AI_CAPITAL_SEED;
const metricBundle = globalThis.window.AI_CAPITAL_METRICS || { metrics: [] };
const evidenceBundle = readEvidenceOverrides();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required for db:verify.");
  process.exit(1);
}

if (!seed) {
  throw new Error("AI_CAPITAL_SEED was not loaded");
}
applyEvidenceOverrides(seed);

const aliasCount = [
  ...new Map(
    seed.entities.flatMap((entity) =>
      (entity.aliases || []).map((alias) => [`${entity.id}:${alias.toLowerCase()}`, alias])
    )
  ).values()
].length;

const metricCount = metricBundle.metrics.reduce(
  (count, group) =>
    count + Object.values(group.metrics).filter((value) => value !== null && value !== undefined).length,
  0
);

const expected = {
  source: seed.sources.length,
  entity: seed.entities.length,
  entity_alias: aliasCount,
  company_profile: seed.entities.filter((entity) => entity.type === "company").length,
  relationship: seed.relationships.length,
  relationship_evidence: seed.relationships.length,
  metric: metricCount
};

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const errors = [];

try {
  for (const [table, expectedCount] of Object.entries(expected)) {
    const result = await pool.query(`SELECT count(*)::int AS count FROM ${table}`);
    const actualCount = result.rows[0].count;
    if (actualCount !== expectedCount) {
      errors.push(`${table}: expected ${expectedCount}, got ${actualCount}`);
    }
  }

  const nvidia = await pool.query(
    `
      SELECT e.id, e.name, cp.ticker
      FROM entity e
      LEFT JOIN company_profile cp ON cp.entity_id = e.id
      WHERE e.id = 'nvidia'
    `
  );
  if (nvidia.rows[0]?.ticker !== "NVDA") {
    errors.push("nvidia company_profile ticker should be NVDA");
  }

  const sourceMetadata = await pool.query(`
    SELECT
      count(*)::int AS count,
      count(*) FILTER (WHERE source_type IS NOT NULL AND source_type <> '')::int AS typed_count,
      count(*) FILTER (WHERE license_note IS NOT NULL AND license_note <> '')::int AS licensed_count,
      count(*) FILTER (WHERE fetched_at IS NOT NULL)::int AS fetched_count
    FROM source
  `);
  const sourceMeta = sourceMetadata.rows[0];
  if (sourceMeta.typed_count !== expected.source) {
    errors.push(`source metadata typed_count: expected ${expected.source}, got ${sourceMeta.typed_count}`);
  }
  if (sourceMeta.licensed_count !== expected.source) {
    errors.push(`source metadata licensed_count: expected ${expected.source}, got ${sourceMeta.licensed_count}`);
  }
  if (sourceMeta.fetched_count !== expected.source) {
    errors.push(`source metadata fetched_count: expected ${expected.source}, got ${sourceMeta.fetched_count}`);
  }

  const keySources = await pool.query("SELECT id, source_type FROM source WHERE id IN ('src_sec', 'src_manual') ORDER BY id");
  const keySourceTypes = new Map(keySources.rows.map((row) => [row.id, row.source_type]));
  if (keySourceTypes.get("src_sec") !== "official_api") {
    errors.push("src_sec source_type should be official_api");
  }
  if (keySourceTypes.get("src_manual") !== "manual_seed") {
    errors.push("src_manual source_type should be manual_seed");
  }

  const overriddenEvidence = await pool.query(
    `
      SELECT count(*)::int AS count
      FROM relationship_evidence
      WHERE relationship_id = ANY($1::text[])
        AND evidence_url = ANY($2::text[])
    `,
    [evidenceBundle.overrides.map((override) => override.relationshipId), evidenceBundle.overrides.map((override) => override.evidenceUrl)]
  );
  if (overriddenEvidence.rows[0].count !== evidenceBundle.overrides.length) {
    errors.push(
      `relationship_evidence overrides: expected ${evidenceBundle.overrides.length}, got ${overriddenEvidence.rows[0].count}`
    );
  }

  const evidenceOverrideMethods = await pool.query(
    "SELECT count(*)::int AS count FROM relationship WHERE id = ANY($1::text[]) AND extraction_method = 'evidence_override_seed'",
    [evidenceBundle.overrides.map((override) => override.relationshipId)]
  );
  if (evidenceOverrideMethods.rows[0].count !== evidenceBundle.overrides.length) {
    errors.push(
      `relationship evidence_override_seed methods: expected ${evidenceBundle.overrides.length}, got ${evidenceOverrideMethods.rows[0].count}`
    );
  }

  const qdrantGraph = await pool.query(
    `
      SELECT count(*)::int AS count
      FROM relationship
      WHERE status = 'approved'
        AND relation_type = 'integrates_with'
        AND confidence >= 0.7
        AND (source_entity_id = 'qdrant' OR target_entity_id = 'qdrant')
    `
  );
  if (qdrantGraph.rows[0].count < 1) {
    errors.push("qdrant should have at least one approved integrates_with relationship at confidence >= 0.7");
  }
} finally {
  await pool.end();
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Database import verified:");
Object.entries(expected).forEach(([table, count]) => {
  console.log(`- ${table}: ${count}`);
});
