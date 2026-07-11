import fs from "node:fs/promises";
import {
  buildCandidateMetrics,
  buildCandidateRelationships,
  buildExtractionRecords,
  mergeById,
  replaceWorkerGeneratedForWatchlists,
  validateExtractionInputs
} from "./lib/extraction-artifacts.mjs";

globalThis.window = {};
await import("../data/seed.js");

const seed = globalThis.window.AI_CAPITAL_SEED;

if (!seed) {
  throw new Error("AI_CAPITAL_SEED was not loaded");
}

const root = new URL("../", import.meta.url);
const rawDocumentsPath = new URL("data/raw-documents.json", root);
const parsedDocumentsPath = new URL("data/parsed-documents.json", root);
const watchlistPath = new URL("data/research-watchlist.json", root);
const candidateSnapshotPath = new URL("data/candidate-snapshot.json", root);
const extractionOutputPath = new URL("data/extraction-candidates.json", root);

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipMerge = args.has("--no-merge");
const extractionMethod = args.has("--llm-ready") ? "llm_ready_heuristic" : "raw_document_heuristic";

async function readJsonIfExists(pathUrl, fallback) {
  try {
    return JSON.parse(await fs.readFile(pathUrl, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

const rawDocumentBundle = await readJsonIfExists(rawDocumentsPath, { generatedAt: null, documents: [] });
const parsedDocumentBundle = await readJsonIfExists(parsedDocumentsPath, { generatedAt: null, documents: [] });
const watchlist = await readJsonIfExists(watchlistPath, []);
validateExtractionInputs(rawDocumentBundle.documents || [], watchlist, seed);

const generatedAt = new Date().toISOString();
const watchlistById = new Map(watchlist.map((item) => [item.id, item]));
const records = buildExtractionRecords(
  rawDocumentBundle.documents || [],
  parsedDocumentBundle.documents || [],
  watchlist,
  generatedAt,
  extractionMethod
);
const candidateRelationships = buildCandidateRelationships(records, watchlistById, generatedAt, extractionMethod);
const candidateMetrics = buildCandidateMetrics(records, watchlistById, generatedAt, extractionMethod);
const candidateEntities = [];
const extractionArtifact = {
  generatedAt,
  sourceRawDocumentsGeneratedAt: rawDocumentBundle.generatedAt,
  sourceParsedDocumentsGeneratedAt: parsedDocumentBundle.generatedAt,
  extractionMethod,
  records,
  candidateRelationships,
  candidateEntities,
  candidateMetrics,
  summary: {
    rawDocuments: records.length,
    parsedDocuments: parsedDocumentBundle.documents?.length || 0,
    extractedDocuments: records.filter((record) => record.status === "extracted").length,
    skippedDocuments: records.filter((record) => record.status !== "extracted").length,
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
  extractionGeneratedAt: generatedAt,
  candidateRelationships: mergedRelationships.rows,
  candidateEntities: mergedEntities.rows,
  candidateMetrics: mergedMetrics.rows,
  summary: {
    ...(existingSnapshot.summary || {}),
    candidateRelationships: mergedRelationships.rows.length,
    candidateEntities: mergedEntities.rows.length,
    candidateMetrics: mergedMetrics.rows.length,
    extractionRecords: records.length,
    extractedDocuments: extractionArtifact.summary.extractedDocuments
  }
};

if (!dryRun) {
  await fs.writeFile(extractionOutputPath, `${JSON.stringify(extractionArtifact, null, 2)}\n`);
  if (!skipMerge) {
    await fs.writeFile(candidateSnapshotPath, `${JSON.stringify(nextSnapshot, null, 2)}\n`);
  }
}

console.log(
  JSON.stringify(
    {
      ...extractionArtifact.summary,
      mergedCandidateRelationships: mergedRelationships.rows.length,
      mergedCandidateMetrics: mergedMetrics.rows.length,
      relationshipInsertions: mergedRelationships.inserted,
      relationshipUpdates: mergedRelationships.updated,
      relationshipRemovals: mergedRelationships.removed,
      metricInsertions: mergedMetrics.inserted,
      metricUpdates: mergedMetrics.updated,
      metricRemovals: mergedMetrics.removed,
      mergedIntoCandidateSnapshot: !skipMerge,
      dryRun
    },
    null,
    2
  )
);

if (dryRun) {
  console.log("Dry run only; extraction-candidates and candidate-snapshot were not changed.");
}
