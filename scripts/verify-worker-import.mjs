import pg from "pg";
import fs from "node:fs";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required for worker:verify.");
  process.exit(1);
}

const workerRun = JSON.parse(fs.readFileSync(new URL("../data/worker-run.json", import.meta.url), "utf8"));
const rawDocumentBundle = JSON.parse(fs.readFileSync(new URL("../data/raw-documents.json", import.meta.url), "utf8"));
const parsedDocumentBundle = JSON.parse(fs.readFileSync(new URL("../data/parsed-documents.json", import.meta.url), "utf8"));
const extractionBundle = JSON.parse(fs.readFileSync(new URL("../data/extraction-candidates.json", import.meta.url), "utf8"));
const llmBundle = JSON.parse(fs.readFileSync(new URL("../data/llm-extractions.json", import.meta.url), "utf8"));
const candidateSnapshot = JSON.parse(fs.readFileSync(new URL("../data/candidate-snapshot.json", import.meta.url), "utf8"));

const expected = {
  connector_run: workerRun.runs?.length || 0,
  raw_document: rawDocumentBundle.documents?.length || 0,
  parsed_document: parsedDocumentBundle.documents?.length || 0,
  extraction_record: extractionBundle.records?.length || 0,
  llm_extraction: llmBundle.records?.length || 0,
  candidate_relationship: candidateSnapshot.candidateRelationships?.length || 0,
  candidate_entity: candidateSnapshot.candidateEntities?.length || 0,
  candidate_metric: candidateSnapshot.candidateMetrics?.length || 0
};
const expectedLlmLinkedCandidateRelationships = (candidateSnapshot.candidateRelationships || []).filter(
  (candidate) => candidate.payload?.llmExtractionRecordId
).length;
const expectedCandidateEndpointRelationships = (candidateSnapshot.candidateRelationships || []).filter(
  (candidate) => candidate.payload?.sourceCandidateEntityId || candidate.payload?.targetCandidateEntityId
).length;

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

  const linked = await pool.query(`
    SELECT count(*)::int AS count
    FROM llm_extraction le
    JOIN extraction_record er ON er.id = le.extraction_record_id
    JOIN parsed_document pd ON pd.id = le.parsed_document_id
    JOIN raw_document rd ON rd.id = le.raw_document_id
  `);
  if (linked.rows[0].count !== expected.llm_extraction) {
    errors.push(`llm_extraction linked rows: expected ${expected.llm_extraction}, got ${linked.rows[0].count}`);
  }

  const candidateLinks = await pool.query(`
    SELECT count(*)::int AS count
    FROM candidate_relationship
    WHERE payload ? 'llmExtractionRecordId'
  `);
  if (candidateLinks.rows[0].count !== expectedLlmLinkedCandidateRelationships) {
    errors.push(
      `candidate_relationship llmExtractionRecordId rows: expected ${expectedLlmLinkedCandidateRelationships}, got ${candidateLinks.rows[0].count}`
    );
  }

  const candidateEndpointLinks = await pool.query(`
    SELECT count(*)::int AS count
    FROM candidate_relationship
    WHERE payload ? 'sourceCandidateEntityId' OR payload ? 'targetCandidateEntityId'
  `);
  if (candidateEndpointLinks.rows[0].count !== expectedCandidateEndpointRelationships) {
    errors.push(
      `candidate_relationship candidate endpoint rows: expected ${expectedCandidateEndpointRelationships}, got ${candidateEndpointLinks.rows[0].count}`
    );
  }
} finally {
  await pool.end();
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Worker artifact database import verified:");
Object.entries(expected).forEach(([table, count]) => {
  console.log(`- ${table}: ${count}`);
});
