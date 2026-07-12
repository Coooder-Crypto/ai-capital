import { spawn } from "node:child_process";
import {
  buildOpenAiChatRequest,
  isOpenAiChatEndpoint,
  parseOpenAiChatResponse
} from "./lib/openai-chat-adapter.mjs";
import fs from "node:fs/promises";

globalThis.window = {};
await import("../data/seed.js");

const seed = globalThis.window.AI_CAPITAL_SEED;

if (!seed) {
  throw new Error("AI_CAPITAL_SEED was not loaded");
}

const root = new URL("../", import.meta.url);
const extractionCandidatesPath = new URL("data/extraction-candidates.json", root);
const candidateSnapshotPath = new URL("data/candidate-snapshot.json", root);
const llmOutputPath = new URL("data/llm-extractions.json", root);

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const noMerge = args.has("--no-merge");
const onlyExtracted = args.has("--only-extracted");
const providerArg = process.argv.find((arg) => arg.startsWith("--provider="))?.split("=")[1];
const timeoutMsArg = process.argv.find((arg) => arg.startsWith("--timeout-ms="))?.split("=")[1];
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1];
const provider =
  providerArg || (process.env.LLM_EXTRACT_URL ? "http" : process.env.LLM_EXTRACT_COMMAND ? "command" : "fixture");
const command = process.env.LLM_EXTRACT_COMMAND || "";
const httpUrl = process.env.LLM_EXTRACT_URL || "";
const httpApiKey = process.env.LLM_EXTRACT_API_KEY || "";
const httpModel = process.env.LLM_EXTRACT_MODEL || "http-extract-model";
const timeoutMs = Number.isFinite(Number(timeoutMsArg)) ? Number(timeoutMsArg) : 30000;
const limit = Number.isFinite(Number(limitArg)) && Number(limitArg) > 0 ? Number(limitArg) : null;
const configuredRpm = Number(process.env.LLM_EXTRACT_RPM || 0);
const configuredMinIntervalMs = Number(process.env.LLM_EXTRACT_MIN_INTERVAL_MS || 0);
const minIntervalMs =
  provider === "fixture"
    ? 0
    : Number.isFinite(configuredMinIntervalMs) && configuredMinIntervalMs > 0
      ? configuredMinIntervalMs
      : Number.isFinite(configuredRpm) && configuredRpm > 0
        ? Math.ceil(60000 / configuredRpm)
        : 0;
const maxRetries = Math.max(0, Number(process.env.LLM_EXTRACT_MAX_RETRIES || 0));
const retryBaseMs = Math.max(0, Number(process.env.LLM_EXTRACT_RETRY_BASE_MS || 1000));
let lastProviderRequestAt = 0;

async function readJsonIfExists(pathUrl, fallback) {
  try {
    return JSON.parse(await fs.readFile(pathUrl, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function stableId(...parts) {
  return parts
    .filter((part) => part !== undefined && part !== null && part !== "")
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function mergeById(existing, incoming) {
  const merged = new Map((existing || []).map((item) => [item.id, item]));
  let inserted = 0;
  let updated = 0;

  for (const item of incoming || []) {
    if (!item?.id) continue;
    if (merged.has(item.id)) updated += 1;
    else inserted += 1;
    merged.set(item.id, item);
  }

  return {
    rows: [...merged.values()].sort((a, b) => String(a.id).localeCompare(String(b.id))),
    inserted,
    updated
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimit() {
  if (!minIntervalMs) return;
  const elapsed = Date.now() - lastProviderRequestAt;
  if (elapsed < minIntervalMs) {
    await sleep(minIntervalMs - elapsed);
  }
  lastProviderRequestAt = Date.now();
}

function replaceWorkerGeneratedForWatchlists(existing, incoming, watchlistIds, idPrefix) {
  const activeWatchlistIds = new Set(watchlistIds || []);
  const retained = (existing || []).filter(
    (item) => !(String(item?.id || "").startsWith(idPrefix) && activeWatchlistIds.has(item?.payload?.watchlistId))
  );
  const merged = mergeById(retained, incoming || []);
  return {
    ...merged,
    removed: (existing || []).length - retained.length
  };
}

function assertKnownExtractionValues(record, result) {
  const entityIds = new Set(seed.entities.map((entity) => entity.id));
  const relationTypes = new Set(Object.keys(seed.relationLabels));
  const errors = [];

  for (const relationship of result.relationships || []) {
    if (!entityIds.has(relationship.sourceEntityId)) {
      errors.push(`${record.id} LLM output references unknown sourceEntityId: ${relationship.sourceEntityId}`);
    }
    if (!entityIds.has(relationship.targetEntityId)) {
      errors.push(`${record.id} LLM output references unknown targetEntityId: ${relationship.targetEntityId}`);
    }
    if (!relationTypes.has(relationship.relationType)) {
      errors.push(`${record.id} LLM output has unknown relationType: ${relationship.relationType}`);
    }
    if (!relationship.evidenceUrl) errors.push(`${record.id} LLM relationship missing evidenceUrl`);
  }

  for (const metric of result.metrics || []) {
    if (!entityIds.has(metric.entityId)) errors.push(`${record.id} LLM metric references unknown entityId: ${metric.entityId}`);
    if (!metric.metricType) errors.push(`${record.id} LLM metric missing metricType`);
    if (!metric.evidenceUrl) errors.push(`${record.id} LLM metric missing evidenceUrl`);
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
}

function normalizeConfidence(value, fallback = 0.5) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Number(number.toFixed(3)), 0), 1);
}

function normalizeLlmResult(record, rawResult) {
  const result = rawResult && typeof rawResult === "object" ? rawResult : {};
  const relationships = (result.relationships || []).map((relationship) => ({
    sourceEntityId: relationship.sourceEntityId || record.entityId,
    targetEntityId: relationship.targetEntityId,
    relationType: relationship.relationType,
    confidence: normalizeConfidence(relationship.confidence, 0.5),
    evidenceUrl: relationship.evidenceUrl || record.evidenceUrl,
    note: relationship.note || "LLM extracted candidate; requires human review."
  }));
  const metrics = (result.metrics || []).map((metric) => ({
    entityId: metric.entityId || record.entityId,
    metricType: metric.metricType,
    valueNumber: Number.isFinite(Number(metric.valueNumber)) ? Number(metric.valueNumber) : null,
    valueText: metric.valueText ?? (metric.valueNumber === null || metric.valueNumber === undefined ? "review_required" : null),
    asOfDate: metric.asOfDate || new Date().toISOString().slice(0, 10),
    sourceId: metric.sourceId || "src_manual",
    sourceRef: metric.sourceRef || record.evidenceUrl,
    confidence: normalizeConfidence(metric.confidence, 0.5),
    evidenceUrl: metric.evidenceUrl || record.evidenceUrl,
    note: metric.note || "LLM extracted metric candidate; requires human review."
  }));

  const normalized = {
    provider: result.provider || provider,
    model: result.model || result.modelName || "unspecified",
    relationships,
    metrics,
    entities: Array.isArray(result.entities) ? result.entities : [],
    raw: result
  };
  assertKnownExtractionValues(record, normalized);
  return normalized;
}

function fixtureResult(record) {
  return {
    provider: "fixture",
    model: "local-schema-fixture",
    relationships: (record.relationships || []).map((relationship) => ({
      ...relationship,
      confidence: normalizeConfidence(Math.min((relationship.confidence || 0.5) + 0.02, 0.85), relationship.confidence)
    })),
    metrics: (record.metrics || []).map((metric) => ({
      ...metric,
      confidence: normalizeConfidence(Math.min((metric.confidence || 0.5) + 0.02, 0.8), metric.confidence)
    })),
    entities: []
  };
}

function commandResult(record) {
  if (!command) {
    throw new Error("LLM_EXTRACT_COMMAND is required when --provider=command.");
  }

  const request = {
    task: "ai_capital_extract_candidates",
    schemaVersion: 1,
    recordId: record.id,
    entityId: record.entityId,
    evidenceUrl: record.evidenceUrl,
    prompt: record.prompt,
    parsedDocumentId: record.parsedDocumentId,
    rawDocumentId: record.rawDocumentId
  };

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`LLM_EXTRACT_COMMAND timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`LLM_EXTRACT_COMMAND exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`LLM_EXTRACT_COMMAND returned invalid JSON: ${error.message}`));
      }
    });

    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

async function httpResult(record) {
  if (!httpUrl) {
    throw new Error("LLM_EXTRACT_URL is required when --provider=http.");
  }

  const request = {
    task: "ai_capital_extract_candidates",
    schemaVersion: 1,
    recordId: record.id,
    entityId: record.entityId,
    evidenceUrl: record.evidenceUrl,
    prompt: record.prompt,
    parsedDocumentId: record.parsedDocumentId,
    rawDocumentId: record.rawDocumentId,
    model: httpModel
  };
  const openAiCompatible = isOpenAiChatEndpoint(httpUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(httpUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(httpApiKey ? { authorization: `Bearer ${httpApiKey}` } : {})
      },
      body: JSON.stringify(openAiCompatible ? buildOpenAiChatRequest(request) : request),
      signal: controller.signal
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP LLM provider returned ${response.status}: ${responseText}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (error) {
      throw new Error(`HTTP LLM provider returned invalid JSON: ${error.message}`);
    }

    if (openAiCompatible) return parseOpenAiChatResponse(parsed, httpModel);
    return parsed && typeof parsed === "object" && parsed.data ? parsed.data : parsed;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`HTTP LLM provider timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function runProvider(record) {
  if (record.status !== "extracted") {
    return {
      provider,
      model: "skipped",
      relationships: [],
      metrics: [],
      entities: [],
      raw: { skippedReason: record.status }
    };
  }

  if (provider === "fixture") return normalizeLlmResult(record, fixtureResult(record));
  if (provider === "command") return normalizeLlmResult(record, await commandResult(record));
  if (provider === "http") return normalizeLlmResult(record, await httpResult(record));
  throw new Error(`Unsupported LLM provider: ${provider}`);
}

async function runProviderWithRetry(record) {
  if (record.status !== "extracted" || provider === "fixture") {
    return runProvider(record);
  }

  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await waitForRateLimit();
      return await runProvider(record);
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
      await sleep(retryBaseMs * 2 ** attempt);
    }
  }
  throw lastError;
}

function buildCandidateRelationships(records, generatedAt) {
  return records.flatMap((record) =>
    (record.relationships || []).map((relationship) => ({
      id: stableId("worker_candidate", record.watchlistId, relationship.sourceEntityId, relationship.targetEntityId, relationship.relationType),
      sourceEntityId: relationship.sourceEntityId,
      targetEntityId: relationship.targetEntityId,
      relationType: relationship.relationType,
      confidence: relationship.confidence,
      evidenceUrl: relationship.evidenceUrl,
      extractionMethod: `llm_${record.provider}`,
      status: "candidate",
      payload: {
        note: relationship.note,
        watchlistId: record.watchlistId,
        rawDocumentId: record.rawDocumentId,
        parsedDocumentId: record.parsedDocumentId,
        extractionRecordId: record.extractionRecordId,
        llmExtractionRecordId: record.id,
        model: record.model
      },
      createdAt: generatedAt
    }))
  );
}

function buildCandidateMetrics(records, generatedAt) {
  return records.flatMap((record) =>
    (record.metrics || []).map((metric) => ({
      id: stableId("worker_metric", record.watchlistId, metric.entityId, metric.metricType),
      entityId: metric.entityId,
      metricType: metric.metricType,
      valueNumber: metric.valueNumber,
      valueText: metric.valueText,
      asOfDate: metric.asOfDate,
      sourceId: metric.sourceId,
      sourceRef: metric.sourceRef,
      confidence: metric.confidence,
      evidenceUrl: metric.evidenceUrl,
      extractionMethod: `llm_${record.provider}`,
      status: "candidate",
      payload: {
        note: metric.note,
        watchlistId: record.watchlistId,
        rawDocumentId: record.rawDocumentId,
        parsedDocumentId: record.parsedDocumentId,
        extractionRecordId: record.extractionRecordId,
        llmExtractionRecordId: record.id,
        model: record.model
      },
      createdAt: generatedAt
    }))
  );
}

const extractionBundle = await readJsonIfExists(extractionCandidatesPath, { generatedAt: null, records: [] });
const availableRecords = onlyExtracted
  ? (extractionBundle.records || []).filter((record) => record.status === "extracted")
  : extractionBundle.records || [];
const sourceRecords = limit ? availableRecords.slice(0, limit) : availableRecords;
const generatedAt = new Date().toISOString();
const records = [];

for (const record of sourceRecords) {
  const result = await runProviderWithRetry(record);
  records.push({
    id: stableId("llm", record.id),
    extractionRecordId: record.id,
    rawDocumentId: record.rawDocumentId,
    parsedDocumentId: record.parsedDocumentId || null,
    watchlistId: record.watchlistId,
    entityId: record.entityId,
    provider: result.provider,
    model: result.model,
    status: record.status === "extracted" ? "completed" : "skipped",
    requestedAt: generatedAt,
    evidenceUrl: record.evidenceUrl,
    promptHash: stableId("prompt", record.id, record.contentHash),
    relationships: result.relationships,
    metrics: result.metrics,
    entities: result.entities,
    rawResponse: result.raw,
    quality: {
      relationshipCount: result.relationships.length,
      metricCount: result.metrics.length,
      entityCount: result.entities.length,
      requiresHumanReview: result.relationships.length + result.metrics.length + result.entities.length > 0
    }
  });
}

const candidateRelationships = buildCandidateRelationships(records, generatedAt);
const candidateMetrics = buildCandidateMetrics(records, generatedAt);
const candidateEntities = [];
const artifact = {
  generatedAt,
  sourceExtractionGeneratedAt: extractionBundle.generatedAt,
  provider,
  records,
  candidateRelationships,
  candidateEntities,
  candidateMetrics,
  summary: {
    sourceExtractionRecords: extractionBundle.records?.length || 0,
    llmExtractionRecords: records.length,
    completedRecords: records.filter((record) => record.status === "completed").length,
    skippedRecords: records.filter((record) => record.status !== "completed").length,
    candidateRelationships: candidateRelationships.length,
    candidateEntities: candidateEntities.length,
    candidateMetrics: candidateMetrics.length
  }
};

const existingSnapshot = await readJsonIfExists(candidateSnapshotPath, {
  generatedAt: null,
  candidateRelationships: [],
  candidateEntities: [],
  candidateMetrics: [],
  retryBacklog: [],
  summary: {}
});
const activeWatchlistIds = records.map((record) => record.watchlistId).filter(Boolean);
const mergedRelationships = replaceWorkerGeneratedForWatchlists(
  existingSnapshot.candidateRelationships || [],
  candidateRelationships,
  activeWatchlistIds,
  "worker_candidate_"
);
const mergedEntities = mergeById(existingSnapshot.candidateEntities || [], candidateEntities);
const mergedMetrics = replaceWorkerGeneratedForWatchlists(
  existingSnapshot.candidateMetrics || [],
  candidateMetrics,
  activeWatchlistIds,
  "worker_metric_"
);
const nextSnapshot = {
  ...existingSnapshot,
  generatedAt,
  llmExtractionGeneratedAt: generatedAt,
  candidateRelationships: mergedRelationships.rows,
  candidateEntities: mergedEntities.rows,
  candidateMetrics: mergedMetrics.rows,
  summary: {
    ...(existingSnapshot.summary || {}),
    candidateRelationships: mergedRelationships.rows.length,
    candidateEntities: mergedEntities.rows.length,
    candidateMetrics: mergedMetrics.rows.length,
    llmExtractionRecords: records.length,
    llmCompletedRecords: artifact.summary.completedRecords
  }
};

if (!dryRun) {
  await fs.writeFile(llmOutputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  if (!noMerge) {
    await fs.writeFile(candidateSnapshotPath, `${JSON.stringify(nextSnapshot, null, 2)}\n`);
  }
}

console.log(
  JSON.stringify(
    {
      ...artifact.summary,
      mergedCandidateRelationships: mergedRelationships.rows.length,
      mergedCandidateMetrics: mergedMetrics.rows.length,
      relationshipInsertions: mergedRelationships.inserted,
      relationshipUpdates: mergedRelationships.updated,
      relationshipRemovals: mergedRelationships.removed,
      metricInsertions: mergedMetrics.inserted,
      metricUpdates: mergedMetrics.updated,
      metricRemovals: mergedMetrics.removed,
      mergedIntoCandidateSnapshot: !noMerge,
    provider,
    limit,
    onlyExtracted,
    minIntervalMs,
    maxRetries,
    dryRun
    },
    null,
    2
  )
);

if (dryRun) {
  console.log("Dry run only; llm-extractions and candidate-snapshot were not changed.");
}
