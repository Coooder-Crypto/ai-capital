import fs from "node:fs";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required for persistent P3 DB verification.");
  process.exit(1);
}

const candidateSnapshot = JSON.parse(fs.readFileSync(new URL("../data/candidate-snapshot.json", import.meta.url), "utf8"));
const rawDocumentBundle = JSON.parse(fs.readFileSync(new URL("../data/raw-documents.json", import.meta.url), "utf8"));
const parsedDocumentBundle = JSON.parse(fs.readFileSync(new URL("../data/parsed-documents.json", import.meta.url), "utf8"));
const extractionBundle = JSON.parse(fs.readFileSync(new URL("../data/extraction-candidates.json", import.meta.url), "utf8"));
const llmBundle = JSON.parse(fs.readFileSync(new URL("../data/llm-extractions.json", import.meta.url), "utf8"));

const expected = {
  raw_document: rawDocumentBundle.documents?.length || 0,
  parsed_document: parsedDocumentBundle.documents?.length || 0,
  extraction_record: extractionBundle.records?.length || 0,
  llm_extraction: llmBundle.records?.length || 0,
  candidate_relationship: candidateSnapshot.candidateRelationships?.length || 0,
  candidate_entity: candidateSnapshot.candidateEntities?.length || 0,
  candidate_metric: candidateSnapshot.candidateMetrics?.length || 0
};

const correctionId = `user_correction_persistent_verify_${Date.now()}`;
const auditId = `audit_${correctionId}`;
const createdAt = new Date().toISOString();
const correctionPayload = {
  note: "Persistent database verification correction; should be cleaned up by script.",
  issueType: "missing_relationship",
  contact: "verification@example.invalid",
  sourceId: "src_manual"
};

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const errors = [];
const actualCounts = {};

async function countTable(client, table) {
  const result = await client.query(`SELECT count(*)::int AS count FROM ${table}`);
  return result.rows[0].count;
}

async function cleanup(client) {
  await client.query(
    "DELETE FROM audit_log WHERE id = $1 OR target_id = $2 OR id LIKE 'audit_user_correction_persistent_verify_%' OR target_id LIKE 'user_correction_persistent_verify_%'",
    [auditId, correctionId]
  );
  await client.query("DELETE FROM candidate_relationship WHERE id = $1 OR id LIKE 'user_correction_persistent_verify_%'", [correctionId]);
}

const client = await pool.connect();
try {
  await cleanup(client);
  for (const [table, expectedCount] of Object.entries(expected)) {
    const actualCount = await countTable(client, table);
    actualCounts[table] = actualCount;
    if (actualCount < expectedCount) {
      errors.push(`${table}: expected at least ${expectedCount}, got ${actualCount}`);
    }
  }

  const workerRelationship = await client.query(`
    SELECT id, evidence_url, payload
    FROM candidate_relationship
    WHERE payload ? 'llmExtractionRecordId' OR payload ? 'rawDocumentId' OR payload ? 'watchlistId'
    ORDER BY id
    LIMIT 1
  `);
  if (workerRelationship.rowCount !== 1) {
    errors.push("expected at least one persisted candidate_relationship with worker/LLM lineage payload");
  } else {
    const row = workerRelationship.rows[0];
    if (!row.evidence_url) errors.push(`${row.id} missing persisted evidence_url`);
    if (!row.payload?.rawDocumentId && !row.payload?.watchlistId && !row.payload?.llmExtractionRecordId) {
      errors.push(`${row.id} missing persisted worker/LLM payload linkage`);
    }
  }

  const candidateMetric = await client.query(`
    SELECT id, evidence_url, payload
    FROM candidate_metric
    WHERE payload ? 'llmExtractionRecordId' OR payload ? 'rawDocumentId' OR payload ? 'watchlistId'
    ORDER BY id
    LIMIT 1
  `);
  if (candidateMetric.rowCount !== 1) {
    errors.push("expected at least one persisted candidate_metric with worker/LLM lineage payload");
  } else if (!candidateMetric.rows[0].evidence_url) {
    errors.push(`${candidateMetric.rows[0].id} missing persisted metric evidence_url`);
  }

  await cleanup(client);
  await client.query(
    `
      INSERT INTO candidate_relationship (
        id,
        source_entity_id,
        target_entity_id,
        relation_type,
        confidence,
        evidence_url,
        extraction_method,
        status,
        payload,
        created_at
      )
      VALUES ($1, 'openai', 'azure', 'uses', 0.400, $2, 'user_correction', 'candidate', $3::jsonb, $4)
    `,
    [correctionId, "https://example.com/persistent-verification", JSON.stringify(correctionPayload), createdAt]
  );
  await client.query(
    `
      INSERT INTO audit_log (id, actor, action, target_type, target_id, after_payload, created_at)
      VALUES ($1, 'persistent-db-verifier', 'user_correction.submit', 'candidate_relationship', $2, $3::jsonb, $4)
    `,
    [
      auditId,
      correctionId,
      JSON.stringify({
        id: correctionId,
        sourceEntityId: "openai",
        targetEntityId: "azure",
        relationType: "uses",
        confidence: 0.4,
        evidenceUrl: "https://example.com/persistent-verification",
        extractionMethod: "user_correction",
        status: "candidate",
        payload: correctionPayload,
        createdAt
      }),
      createdAt
    ]
  );
  const verifyClient = await pool.connect();
  try {
    const persistedCorrection = await verifyClient.query(
      `
        SELECT cr.id, cr.source_entity_id, cr.target_entity_id, cr.relation_type, cr.evidence_url, cr.payload, al.action
        FROM candidate_relationship cr
        JOIN audit_log al ON al.target_id = cr.id
        WHERE cr.id = $1
      `,
      [correctionId]
    );
    if (persistedCorrection.rowCount !== 1) {
      errors.push("persisted user correction candidate/audit row was not readable after commit");
    } else {
      const row = persistedCorrection.rows[0];
      if (row.source_entity_id !== "openai" || row.target_entity_id !== "azure" || row.relation_type !== "uses") {
        errors.push(`${correctionId} persisted endpoint or relation type mismatch`);
      }
      if (row.evidence_url !== "https://example.com/persistent-verification") {
        errors.push(`${correctionId} persisted evidence_url mismatch`);
      }
      if (row.payload?.issueType !== "missing_relationship" || row.action !== "user_correction.submit") {
        errors.push(`${correctionId} persisted payload/audit mismatch`);
      }
    }
  } finally {
    verifyClient.release();
  }
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
} finally {
  try {
    await cleanup(client);
  } finally {
    client.release();
    await pool.end();
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Persistent P3 database verified:");
for (const [table, count] of Object.entries(expected)) {
  console.log(`- ${table}: ${actualCounts[table]} (expected at least ${count})`);
}
console.log(`- user correction candidate/audit write-read-cleanup: ${correctionId}`);
