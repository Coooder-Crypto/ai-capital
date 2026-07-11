import assert from "node:assert/strict";
import fs from "node:fs";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function workerRows(rows, prefix) {
  return rows.filter((row) => String(row?.id || "").startsWith(prefix) && row?.payload?.watchlistId);
}

const rawBundle = readJson("data/raw-documents.json");
const parsedBundle = readJson("data/parsed-documents.json");
const snapshot = readJson("data/candidate-snapshot.json");
const generatedRelationships = readJson("src/generated/candidate-relationships.json");
const generatedMetrics = readJson("src/generated/candidate-metrics.json");

const failedWatchlistIds = new Set(
  (rawBundle.documents || [])
    .filter((document) => document.parseStatus !== "parsed")
    .map((document) => document.payload?.watchlistId)
    .filter(Boolean)
);

const staleRows = [
  ...workerRows(snapshot.candidateRelationships || [], "worker_candidate_"),
  ...workerRows(snapshot.candidateMetrics || [], "worker_metric_"),
  ...workerRows(generatedRelationships || [], "worker_candidate_"),
  ...workerRows(generatedMetrics || [], "worker_metric_")
].filter((row) => failedWatchlistIds.has(row.payload.watchlistId));

assert.deepEqual(
  staleRows.map((row) => row.id),
  [],
  "fetch_failed watchlist items must not retain generated worker candidates"
);

const rssDocuments = (parsedBundle.documents || []).filter((document) => document.format === "rss");
assert.ok(rssDocuments.length >= 2, "real RSS fetch artifacts should include at least two parsed RSS documents");
assert.ok(
  rssDocuments.every((document) => document.parserStatus === "parsed" && document.quality?.rssItemCount > 0),
  "RSS documents should be parsed and expose RSS item counts"
);

console.log(
  `Worker candidate cleanup valid: ${failedWatchlistIds.size} failed watchlists, ${rssDocuments.length} RSS documents`
);
