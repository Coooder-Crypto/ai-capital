import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const candidateSnapshotArg = process.argv.find((arg) => arg.startsWith("--candidate-snapshot="))?.split("=")[1];
const workerRun = JSON.parse(fs.readFileSync(new URL("../data/worker-run.json", import.meta.url), "utf8"));
const rawDocumentBundle = JSON.parse(fs.readFileSync(new URL("../data/raw-documents.json", import.meta.url), "utf8"));
const parsedDocumentBundle = JSON.parse(fs.readFileSync(new URL("../data/parsed-documents.json", import.meta.url), "utf8"));
const extractionBundle = JSON.parse(fs.readFileSync(new URL("../data/extraction-candidates.json", import.meta.url), "utf8"));
const llmBundle = JSON.parse(fs.readFileSync(new URL("../data/llm-extractions.json", import.meta.url), "utf8"));
const candidateSnapshotInput = candidateSnapshotArg
  ? path.resolve(candidateSnapshotArg)
  : new URL("../data/candidate-snapshot.json", import.meta.url);
const candidateSnapshot = JSON.parse(fs.readFileSync(candidateSnapshotInput, "utf8"));

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "object") return `'${JSON.stringify(value).replaceAll("'", "''")}'`;
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlInsert(table, columns, rows, conflictTarget, updateColumns = columns) {
  if (rows.length === 0) return "";
  const values = rows
    .map((row) => `  (${columns.map((column) => sqlValue(row[column])).join(", ")})`)
    .join(",\n");
  const updates = updateColumns
    .filter((column) => !conflictTarget.includes(column))
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(", ");

  return [
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES`,
    values,
    updates ? `ON CONFLICT (${conflictTarget.join(", ")}) DO UPDATE SET ${updates};` : `ON CONFLICT (${conflictTarget.join(", ")}) DO NOTHING;`
  ].join("\n");
}

function assertUnique(rows, label) {
  const seen = new Set();
  const duplicates = new Set();
  for (const row of rows) {
    if (seen.has(row.id)) duplicates.add(row.id);
    seen.add(row.id);
  }
  if (duplicates.size > 0) {
    throw new Error(`${label} has duplicate ids: ${[...duplicates].join(", ")}`);
  }
}

const connectorRunRows = (workerRun.runs || []).map((run) => ({
  id: run.id,
  connector_name: run.connectorName,
  status: run.status,
  started_at: run.startedAt,
  completed_at: run.completedAt || null,
  planned_items: run.plannedItems || 0,
  raw_documents: run.rawDocuments || 0,
  candidate_relationships: run.candidateRelationships || 0,
  candidate_entities: run.candidateEntities || 0,
  candidate_metrics: run.candidateMetrics || 0,
  error_message: run.errorMessage || null,
  payload: run.payload || {}
}));

const rawDocumentRows = (rawDocumentBundle.documents || []).map((document) => ({
  id: document.id,
  source_id: document.sourceId || "src_manual",
  url: document.url,
  fetched_at: document.fetchedAt,
  content_type: document.contentType || null,
  content_hash: document.contentHash || null,
  storage_path: document.storagePath || null,
  parse_status: document.parseStatus || "pending"
}));

const parsedDocumentRows = (parsedDocumentBundle.documents || []).map((document) => ({
  id: document.id,
  raw_document_id: document.rawDocumentId,
  entity_id: document.entityId || null,
  connector: document.connector || null,
  parser: document.parser,
  parser_status: document.parserStatus,
  parsed_at: document.parsedAt,
  format: document.format,
  content_hash: document.contentHash || null,
  title: document.title || null,
  canonical_url: document.canonicalUrl || null,
  publisher: document.publisher || null,
  text_excerpt: document.text || null,
  sections: document.sections || [],
  links: document.links || [],
  facts: document.facts || [],
  extraction_hints: document.extractionHints || [],
  json_summary: document.jsonSummary || null,
  quality: document.quality || {}
}));

const extractionRecordRows = (extractionBundle.records || []).map((record) => ({
  id: record.id,
  raw_document_id: record.rawDocumentId,
  parsed_document_id: record.parsedDocumentId || null,
  entity_id: record.entityId || null,
  connector: record.connector || null,
  status: record.status,
  extraction_method: record.extractionMethod,
  extracted_at: record.extractedAt,
  content_hash: record.contentHash || null,
  evidence_url: record.evidenceUrl || null,
  prompt: record.prompt || null,
  relationships: record.relationships || [],
  metrics: record.metrics || [],
  entities: record.entities || [],
  quality: record.quality || {}
}));

const llmExtractionRows = (llmBundle.records || []).map((record) => ({
  id: record.id,
  extraction_record_id: record.extractionRecordId,
  raw_document_id: record.rawDocumentId,
  parsed_document_id: record.parsedDocumentId || null,
  entity_id: record.entityId || null,
  provider: record.provider,
  model: record.model || null,
  status: record.status,
  requested_at: record.requestedAt,
  evidence_url: record.evidenceUrl || null,
  prompt_hash: record.promptHash || null,
  relationships: record.relationships || [],
  metrics: record.metrics || [],
  entities: record.entities || [],
  raw_response: record.rawResponse || {},
  quality: record.quality || {}
}));

const candidateRelationshipRows = (candidateSnapshot.candidateRelationships || []).map((candidate) => ({
  id: candidate.id,
  source_entity_id: candidate.sourceEntityId || null,
  target_entity_id: candidate.targetEntityId || null,
  relation_type: candidate.relationType,
  confidence: candidate.confidence,
  evidence_url: candidate.evidenceUrl || null,
  extraction_method: candidate.extractionMethod,
  status: candidate.status || "candidate",
  payload: candidate.payload || {},
  created_at: candidate.createdAt,
  reviewed_at: candidate.reviewedAt || null
}));

const candidateEntityRows = (candidateSnapshot.candidateEntities || []).map((candidate) => ({
  id: candidate.id,
  entity_id: candidate.entityId || null,
  type: candidate.type,
  name: candidate.name,
  layer: candidate.layer,
  description: candidate.description,
  website_url: candidate.websiteUrl || null,
  country: candidate.country || null,
  status_text: candidate.statusText,
  valuation: candidate.valuation || null,
  aliases: candidate.aliases || [],
  confidence: candidate.confidence,
  evidence_url: candidate.evidenceUrl || null,
  extraction_method: candidate.extractionMethod,
  status: candidate.status || "candidate",
  payload: candidate.payload || {},
  created_at: candidate.createdAt,
  reviewed_at: candidate.reviewedAt || null
}));

const candidateMetricRows = (candidateSnapshot.candidateMetrics || []).map((candidate) => ({
  id: candidate.id,
  entity_id: candidate.entityId || null,
  metric_type: candidate.metricType,
  value_number: candidate.valueNumber ?? null,
  value_text: candidate.valueText ?? null,
  as_of_date: candidate.asOfDate,
  source_id: candidate.sourceId || null,
  source_ref: candidate.sourceRef || null,
  confidence: candidate.confidence,
  evidence_url: candidate.evidenceUrl || null,
  extraction_method: candidate.extractionMethod,
  status: candidate.status || "candidate",
  payload: candidate.payload || {},
  created_at: candidate.createdAt,
  reviewed_at: candidate.reviewedAt || null
}));

[
  ["connector_run", connectorRunRows],
  ["raw_document", rawDocumentRows],
  ["parsed_document", parsedDocumentRows],
  ["extraction_record", extractionRecordRows],
  ["llm_extraction", llmExtractionRows],
  ["candidate_relationship", candidateRelationshipRows],
  ["candidate_entity", candidateEntityRows],
  ["candidate_metric", candidateMetricRows]
].forEach(([label, rows]) => assertUnique(rows, label));

const plan = {
  mode: "dry-run",
  generatedAt: workerRun.generatedAt || candidateSnapshot.generatedAt,
  tables: {
    connector_run: connectorRunRows.length,
    raw_document: rawDocumentRows.length,
    parsed_document: parsedDocumentRows.length,
    extraction_record: extractionRecordRows.length,
    llm_extraction: llmExtractionRows.length,
    candidate_relationship: candidateRelationshipRows.length,
    candidate_entity: candidateEntityRows.length,
    candidate_metric: candidateMetricRows.length
  },
  samples: {
    connector_run: connectorRunRows.slice(0, 2),
    raw_document: rawDocumentRows.slice(0, 2),
    parsed_document: parsedDocumentRows.slice(0, 2),
    extraction_record: extractionRecordRows.slice(0, 2),
    llm_extraction: llmExtractionRows.slice(0, 2),
    candidate_relationship: candidateRelationshipRows.slice(0, 2),
    candidate_entity: candidateEntityRows.slice(0, 2),
    candidate_metric: candidateMetricRows.slice(0, 2)
  }
};

const schemaSql = fs.readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
const importSql = [
  "-- AI Capital Map worker artifact import",
  "-- Generated from worker, raw, parsed, extraction, LLM and candidate artifacts.",
  "-- Requires base seed entities and sources to already exist for foreign keys.",
  "BEGIN;",
  schemaSql,
  sqlInsert(
    "connector_run",
    [
      "id",
      "connector_name",
      "status",
      "started_at",
      "completed_at",
      "planned_items",
      "raw_documents",
      "candidate_relationships",
      "candidate_entities",
      "candidate_metrics",
      "error_message",
      "payload"
    ],
    connectorRunRows,
    ["id"]
  ),
  sqlInsert(
    "raw_document",
    ["id", "source_id", "url", "fetched_at", "content_type", "content_hash", "storage_path", "parse_status"],
    rawDocumentRows,
    ["id"]
  ),
  sqlInsert(
    "parsed_document",
    [
      "id",
      "raw_document_id",
      "entity_id",
      "connector",
      "parser",
      "parser_status",
      "parsed_at",
      "format",
      "content_hash",
      "title",
      "canonical_url",
      "publisher",
      "text_excerpt",
      "sections",
      "links",
      "facts",
      "extraction_hints",
      "json_summary",
      "quality"
    ],
    parsedDocumentRows,
    ["id"]
  ),
  sqlInsert(
    "extraction_record",
    [
      "id",
      "raw_document_id",
      "parsed_document_id",
      "entity_id",
      "connector",
      "status",
      "extraction_method",
      "extracted_at",
      "content_hash",
      "evidence_url",
      "prompt",
      "relationships",
      "metrics",
      "entities",
      "quality"
    ],
    extractionRecordRows,
    ["id"]
  ),
  sqlInsert(
    "llm_extraction",
    [
      "id",
      "extraction_record_id",
      "raw_document_id",
      "parsed_document_id",
      "entity_id",
      "provider",
      "model",
      "status",
      "requested_at",
      "evidence_url",
      "prompt_hash",
      "relationships",
      "metrics",
      "entities",
      "raw_response",
      "quality"
    ],
    llmExtractionRows,
    ["id"]
  ),
  sqlInsert(
    "candidate_relationship",
    [
      "id",
      "source_entity_id",
      "target_entity_id",
      "relation_type",
      "confidence",
      "evidence_url",
      "extraction_method",
      "status",
      "payload",
      "created_at",
      "reviewed_at"
    ],
    candidateRelationshipRows,
    ["id"]
  ),
  sqlInsert(
    "candidate_entity",
    [
      "id",
      "entity_id",
      "type",
      "name",
      "layer",
      "description",
      "website_url",
      "country",
      "status_text",
      "valuation",
      "aliases",
      "confidence",
      "evidence_url",
      "extraction_method",
      "status",
      "payload",
      "created_at",
      "reviewed_at"
    ],
    candidateEntityRows,
    ["id"]
  ),
  sqlInsert(
    "candidate_metric",
    [
      "id",
      "entity_id",
      "metric_type",
      "value_number",
      "value_text",
      "as_of_date",
      "source_id",
      "source_ref",
      "confidence",
      "evidence_url",
      "extraction_method",
      "status",
      "payload",
      "created_at",
      "reviewed_at"
    ],
    candidateMetricRows,
    ["id"]
  ),
  "COMMIT;"
]
  .filter(Boolean)
  .join("\n\n");

const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : "";

if (args.has("--json")) {
  console.log(JSON.stringify(plan, null, 2));
} else if (args.has("--sql") || outputPath) {
  if (outputPath) {
    fs.writeFileSync(outputPath, `${importSql}\n`);
    console.log(`Wrote worker artifact SQL to ${outputPath}`);
  } else {
    console.log(importSql);
  }
} else if (args.has("--apply")) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required for --apply.");
    process.exit(1);
  }

  const tempPath = path.join(os.tmpdir(), `ai-capital-worker-import-${Date.now()}.sql`);
  fs.writeFileSync(tempPath, `${importSql}\n`);
  const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", tempPath], {
    encoding: "utf8",
    stdio: "pipe"
  });
  fs.rmSync(tempPath, { force: true });

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }

  console.log("Worker artifact import applied successfully:");
  Object.entries(plan.tables).forEach(([table, count]) => {
    console.log(`- ${table}: ${count}`);
  });
} else {
  console.log("Worker artifact import dry-run plan:");
  Object.entries(plan.tables).forEach(([table, count]) => {
    console.log(`- ${table}: ${count}`);
  });
}
