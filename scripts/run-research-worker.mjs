import crypto from "node:crypto";
import fs from "node:fs/promises";

globalThis.window = {};
await import("../data/seed.js");

const seed = globalThis.window.AI_CAPITAL_SEED;

if (!seed) {
  throw new Error("AI_CAPITAL_SEED was not loaded");
}

const root = new URL("../", import.meta.url);
const watchlistPath = new URL("data/research-watchlist.json", root);
const candidateSnapshotPath = new URL("data/candidate-snapshot.json", root);
const workerRunPath = new URL("data/worker-run.json", root);
const rawDocumentsPath = new URL("data/raw-documents.json", root);

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const offline = args.has("--offline") || !args.has("--fetch");
const fetchTimeoutMs = Number(process.argv.find((arg) => arg.startsWith("--timeout-ms="))?.split("=")[1] || 10000);

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

function contentHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function compactText(value, maxLength = 4000) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function compactExcerpt(value, maxLength = 30000) {
  return String(value || "").slice(0, maxLength);
}

function mergeById(existing, incoming) {
  const merged = new Map(existing.map((item) => [item.id, item]));
  let inserted = 0;
  let updated = 0;
  for (const item of incoming) {
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

function validateWatchlist(items) {
  const entityIds = new Set(seed.entities.map((entity) => entity.id));
  const relationTypes = new Set(Object.keys(seed.relationLabels));
  const errors = [];

  for (const [index, item] of items.entries()) {
    if (!item.id) errors.push(`watchlist[${index}] missing id`);
    if (!item.connector) errors.push(`watchlist[${index}] missing connector`);
    if (!entityIds.has(item.entityId)) errors.push(`${item.id} references unknown entityId: ${item.entityId}`);
    if (!item.url || !/^https?:\/\//i.test(item.url)) errors.push(`${item.id} must have an http(s) url`);
    for (const hint of item.extractionHints || []) {
      if (hint.targetEntityId && !entityIds.has(hint.targetEntityId)) {
        errors.push(`${item.id} references unknown targetEntityId: ${hint.targetEntityId}`);
      }
      if (hint.relationType && !relationTypes.has(hint.relationType)) {
        errors.push(`${item.id} has unknown relationType: ${hint.relationType}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
}

async function fetchWatchlistItem(item) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
  try {
    const response = await fetch(item.url, {
      signal: controller.signal,
      headers: {
        "Accept":
          item.contentType === "application/json"
            ? "application/json"
            : "text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml,text/xml,application/json",
        "User-Agent": "AI Capital Map research worker contact@example.com"
      }
    });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get("content-type") || item.contentType || "text/plain",
      body
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      statusText: error instanceof Error ? error.message : "fetch failed",
      contentType: item.contentType || "text/plain",
      body: ""
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function buildRawDocument(item, generatedAt) {
  const fetched = offline ? null : await fetchWatchlistItem(item);
  const body = offline
    ? JSON.stringify({
        mode: "offline-placeholder",
        watchlistId: item.id,
        title: item.title,
        url: item.url,
        extractionHints: item.extractionHints || []
      })
    : fetched?.body || JSON.stringify({ mode: "fetch_failed", watchlistId: item.id, url: item.url });
  const parseStatus = offline ? "parsed" : fetched?.ok ? "parsed" : "fetch_failed";

  return {
    id: stableId("raw", item.id),
    sourceId: item.sourceId || "src_manual",
    entityId: item.entityId,
    connector: item.connector,
    url: item.url,
    title: item.title,
    publisher: item.publisher,
    fetchedAt: generatedAt,
    contentType: fetched?.contentType || item.contentType || "text/html",
    contentHash: contentHash(body),
    storagePath: `memory://${item.id}`,
    parseStatus,
      payload: offline
      ? JSON.parse(body)
      : {
          mode: fetched?.ok ? "fetched" : "fetch_failed",
          watchlistId: item.id,
          status: fetched?.status,
          statusText: fetched?.statusText,
          title: item.title,
          url: item.url,
          contentLength: body.length,
          contentExcerpt: compactExcerpt(body),
          textPreview: compactText(body),
          extractionHints: item.extractionHints || []
        }
  };
}

function buildCandidateRelationships(item, rawDocument, generatedAt) {
  if (rawDocument.parseStatus !== "parsed") return [];
  return (item.extractionHints || [])
    .filter((hint) => hint.targetEntityId && hint.relationType)
    .map((hint) => ({
      id: stableId("worker_candidate", item.id, item.entityId, hint.targetEntityId, hint.relationType),
      sourceEntityId: item.entityId,
      targetEntityId: hint.targetEntityId,
      relationType: hint.relationType,
      confidence: Number((hint.confidence ?? 0.55).toFixed(3)),
      evidenceUrl: item.url,
      extractionMethod: `research_worker_${item.connector}`,
      status: "candidate",
      payload: {
        note: hint.note || `Candidate extracted from ${item.title}`,
        sourceId: item.sourceId || "src_manual",
        watchlistId: item.id,
        rawDocumentId: rawDocument.id,
        sourceType: item.sourceType,
        title: item.title,
        cadence: item.cadence
      },
      createdAt: generatedAt
    }));
}

function buildCandidateMetrics(item, rawDocument, generatedAt) {
  if (rawDocument.parseStatus !== "parsed") return [];
  return (item.extractionHints || [])
    .filter((hint) => hint.metricType)
    .map((hint) => ({
      id: stableId("worker_metric", item.id, item.entityId, hint.metricType),
      entityId: item.entityId,
      metricType: hint.metricType,
      valueNumber: null,
      valueText: "review_required",
      asOfDate: generatedAt.slice(0, 10),
      sourceId: item.sourceId || "src_openalex",
      sourceRef: item.url,
      confidence: Number((hint.confidence ?? 0.5).toFixed(3)),
      evidenceUrl: item.url,
      extractionMethod: `research_worker_${item.connector}`,
      status: "candidate",
      payload: {
        note: hint.note || `Candidate metric extracted from ${item.title}`,
        watchlistId: item.id,
        rawDocumentId: rawDocument.id,
        sourceType: item.sourceType,
        title: item.title
      },
      createdAt: generatedAt
    }));
}

const watchlist = JSON.parse(await fs.readFile(watchlistPath, "utf8"));
validateWatchlist(watchlist);

const generatedAt = new Date().toISOString();
const rawDocuments = [];
for (const item of watchlist) {
  rawDocuments.push(await buildRawDocument(item, generatedAt));
}
const candidateRelationships = watchlist.flatMap((item, index) =>
  buildCandidateRelationships(item, rawDocuments[index], generatedAt)
);
const candidateMetrics = watchlist.flatMap((item, index) => buildCandidateMetrics(item, rawDocuments[index], generatedAt));

const runsByConnector = new Map();
for (const item of watchlist) {
  const run = runsByConnector.get(item.connector) || {
    id: stableId("run", item.connector, generatedAt.slice(0, 10)),
    connectorName: item.connector,
    status: "success",
    startedAt: generatedAt,
    completedAt: generatedAt,
    plannedItems: 0,
    rawDocuments: 0,
    candidateRelationships: 0,
    candidateEntities: 0,
    candidateMetrics: 0,
    errorMessage: null,
    payload: {
      mode: offline ? "offline" : "fetch",
      cadence: []
    }
  };
  run.plannedItems += 1;
  const itemRawDocument = rawDocuments.find((document) => document.payload.watchlistId === item.id);
  run.rawDocuments += itemRawDocument?.parseStatus === "parsed" ? 1 : 0;
  run.failedDocuments = (run.failedDocuments || 0) + (itemRawDocument?.parseStatus === "parsed" ? 0 : 1);
  run.candidateRelationships += candidateRelationships.filter((candidate) => candidate.payload.watchlistId === item.id).length;
  run.candidateMetrics += candidateMetrics.filter((candidate) => candidate.payload.watchlistId === item.id).length;
  if (itemRawDocument?.parseStatus !== "parsed") {
    run.status = "partial";
    run.errorMessage = [run.errorMessage, `${item.id}: ${itemRawDocument?.payload.statusText || "fetch failed"}`]
      .filter(Boolean)
      .join("; ");
  }
  run.payload.cadence = [...new Set([...run.payload.cadence, item.cadence].filter(Boolean))];
  runsByConnector.set(item.connector, run);
}

const workerRun = {
  generatedAt,
  mode: offline ? "offline" : "fetch",
  runs: [...runsByConnector.values()].sort((a, b) => a.connectorName.localeCompare(b.connectorName)),
  rawDocuments,
  candidateRelationships,
  candidateEntities: [],
  candidateMetrics,
  summary: {
    plannedItems: watchlist.length,
    connectorRuns: runsByConnector.size,
    rawDocuments: rawDocuments.filter((document) => document.parseStatus === "parsed").length,
    failedRawDocuments: rawDocuments.filter((document) => document.parseStatus !== "parsed").length,
    candidateRelationships: candidateRelationships.length,
    candidateEntities: 0,
    candidateMetrics: candidateMetrics.length
  }
};

const existingSnapshot = await readJsonIfExists(candidateSnapshotPath, {
  generatedAt: null,
  sourceSnapshotGeneratedAt: null,
  plannedRequestCount: 0,
  candidateRelationships: [],
  candidateEntities: [],
  candidateMetrics: [],
  retryBacklog: [],
  summary: {}
});

const activeWatchlistIds = watchlist.map((item) => item.id).filter(Boolean);
const mergedRelationships = replaceWorkerGeneratedForWatchlists(
  existingSnapshot.candidateRelationships || [],
  candidateRelationships,
  activeWatchlistIds,
  "worker_candidate_"
);
const mergedEntities = mergeById(existingSnapshot.candidateEntities || [], []);
const mergedMetrics = replaceWorkerGeneratedForWatchlists(
  existingSnapshot.candidateMetrics || [],
  candidateMetrics,
  activeWatchlistIds,
  "worker_metric_"
);

const nextSnapshot = {
  ...existingSnapshot,
  generatedAt,
  workerRunGeneratedAt: generatedAt,
  candidateRelationships: mergedRelationships.rows,
  candidateEntities: mergedEntities.rows,
  candidateMetrics: mergedMetrics.rows,
  summary: {
    ...(existingSnapshot.summary || {}),
    candidateRelationships: mergedRelationships.rows.length,
    candidateEntities: mergedEntities.rows.length,
    candidateMetrics: mergedMetrics.rows.length,
    retryBacklog: (existingSnapshot.retryBacklog || []).length,
    evidenceBacklog: existingSnapshot.summary?.evidenceBacklog || 0,
    workerRawDocuments: rawDocuments.length,
    workerConnectorRuns: runsByConnector.size
  }
};

if (!dryRun) {
  await fs.writeFile(workerRunPath, `${JSON.stringify(workerRun, null, 2)}\n`);
  await fs.writeFile(rawDocumentsPath, `${JSON.stringify({ generatedAt, documents: rawDocuments }, null, 2)}\n`);
  await fs.writeFile(candidateSnapshotPath, `${JSON.stringify(nextSnapshot, null, 2)}\n`);
}

console.log(
  JSON.stringify(
    {
      ...workerRun.summary,
      mergedCandidateRelationships: mergedRelationships.rows.length,
      mergedCandidateMetrics: mergedMetrics.rows.length,
      relationshipRemovals: mergedRelationships.removed,
      metricRemovals: mergedMetrics.removed,
      dryRun
    },
    null,
    2
  )
);
if (dryRun) {
  console.log("Dry run only; worker-run, raw-documents and candidate-snapshot were not changed.");
}
