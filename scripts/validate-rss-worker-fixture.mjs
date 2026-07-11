import assert from "node:assert/strict";
import { parseDocument } from "./lib/structured-parser.mjs";
import {
  buildCandidateMetrics,
  buildCandidateRelationships,
  buildExtractionRecords,
  validateExtractionInputs
} from "./lib/extraction-artifacts.mjs";

globalThis.window = {};
await import("../data/seed.js");

const seed = globalThis.window.AI_CAPITAL_SEED;
if (!seed) {
  throw new Error("AI_CAPITAL_SEED was not loaded");
}

const generatedAt = "2026-07-05T00:00:00.000Z";
const extractionMethod = "rss_worker_fixture";
const watchlistItem = {
  id: "watch_fixture_anthropic_rss",
  entityId: "anthropic",
  connector: "news_rss",
  sourceId: "src_manual",
  sourceType: "company_news_rss",
  title: "Anthropic RSS fixture",
  cadence: "daily",
  publisher: "Anthropic",
  url: "https://example.com/anthropic/feed.xml",
  extractionHints: [
    {
      targetEntityId: "aws",
      relationType: "partners_with",
      confidence: 0.72,
      note: "RSS item describes Anthropic model availability through AWS."
    },
    {
      metricType: "reported_ai_commitment",
      confidence: 0.63,
      note: "RSS item references a reported infrastructure commitment that needs analyst review."
    }
  ]
};

const rawDocument = {
  id: "raw_fixture_anthropic_rss",
  entityId: "anthropic",
  connector: "news_rss",
  parseStatus: "parsed",
  fetchedAt: generatedAt,
  contentType: "application/rss+xml; charset=utf-8",
  contentHash: "hash_fixture_anthropic_rss",
  title: "Anthropic RSS fixture",
  url: "https://example.com/anthropic/feed.xml",
  payload: {
    mode: "fixture",
    watchlistId: watchlistItem.id,
    title: "Anthropic RSS fixture",
    contentExcerpt:
      "<rss><channel><title>Anthropic News</title><item><title>Claude availability on AWS expands</title><link>https://example.com/anthropic/aws-availability</link><pubDate>2026-06-30</pubDate><description>Anthropic expanded Claude model availability through AWS and referenced a $40 million AI infrastructure commitment.</description></item><item><title>Enterprise deployment update</title><link>https://example.com/anthropic/enterprise</link><pubDate>2026-07-01</pubDate><description>Enterprise customers can deploy new AI workflows after the partner launch.</description></item></channel></rss>",
    extractionHints: watchlistItem.extractionHints
  }
};

validateExtractionInputs([rawDocument], [watchlistItem], seed);

const parsedDocument = parseDocument(rawDocument, watchlistItem, generatedAt);
assert.equal(parsedDocument.format, "rss");
assert.equal(parsedDocument.parserStatus, "parsed");
assert.equal(parsedDocument.quality.rssItemCount, 2);
assert.equal(parsedDocument.sections.length, 2);
assert.ok(
  parsedDocument.facts.some((fact) => fact.type === "rss_item" && fact.value === "Claude availability on AWS expands"),
  "RSS item metadata should become structured facts"
);
assert.ok(parsedDocument.facts.some((fact) => fact.type === "money" && fact.value === "$40 million"));

const records = buildExtractionRecords(
  [rawDocument],
  [parsedDocument],
  [watchlistItem],
  generatedAt,
  extractionMethod
);
assert.equal(records.length, 1);
assert.equal(records[0].status, "extracted");
assert.equal(records[0].parsedFormat, "rss");
assert.equal(records[0].quality.rssItemCount, 2);
assert.equal(records[0].relationships.length, 1);
assert.equal(records[0].metrics.length, 1);
assert.match(records[0].prompt, /Structured sections:/);
assert.match(records[0].prompt, /Extracted facts:/);
assert.match(records[0].prompt, /rss_item: Claude availability on AWS expands/);

const watchlistById = new Map([[watchlistItem.id, watchlistItem]]);
const candidateRelationships = buildCandidateRelationships(records, watchlistById, generatedAt, extractionMethod);
const candidateMetrics = buildCandidateMetrics(records, watchlistById, generatedAt, extractionMethod);

assert.deepEqual(candidateRelationships, [
  {
    id: "worker_candidate_watch_fixture_anthropic_rss_anthropic_aws_partners_with",
    sourceEntityId: "anthropic",
    targetEntityId: "aws",
    relationType: "partners_with",
    confidence: 0.72,
    evidenceUrl: rawDocument.url,
    extractionMethod,
    status: "candidate",
    payload: {
      note: "RSS item describes Anthropic model availability through AWS.",
      sourceId: "src_manual",
      watchlistId: watchlistItem.id,
      rawDocumentId: rawDocument.id,
      extractionRecordId: "extract_raw_fixture_anthropic_rss",
      parsedDocumentId: "parsed_raw_fixture_anthropic_rss",
      rawDocumentContentHash: rawDocument.contentHash,
      sourceType: "company_news_rss",
      title: "Anthropic RSS fixture",
      cadence: "daily"
    },
    createdAt: generatedAt
  }
]);

assert.equal(candidateMetrics.length, 1);
assert.equal(candidateMetrics[0].id, "worker_metric_watch_fixture_anthropic_rss_anthropic_reported_ai_commitment");
assert.equal(candidateMetrics[0].entityId, "anthropic");
assert.equal(candidateMetrics[0].metricType, "reported_ai_commitment");
assert.equal(candidateMetrics[0].valueText, "review_required");
assert.equal(candidateMetrics[0].asOfDate, "2026-07-05");
assert.equal(candidateMetrics[0].extractionMethod, extractionMethod);

const financialWatchlistItem = {
  id: "watch_fixture_nvidia_financial",
  entityId: "nvidia",
  connector: "company_ir",
  sourceId: "src_manual",
  sourceType: "company_ir",
  title: "NVIDIA financial fixture",
  cadence: "quarterly",
  publisher: "NVIDIA",
  url: "https://example.com/nvidia/results",
  extractionHints: []
};
const financialRawDocument = {
  id: "raw_fixture_nvidia_financial",
  entityId: "nvidia",
  connector: "company_ir",
  parseStatus: "parsed",
  fetchedAt: generatedAt,
  contentType: "text/html",
  contentHash: "hash_fixture_nvidia_financial",
  title: "NVIDIA financial fixture",
  url: "https://example.com/nvidia/results",
  payload: {
    watchlistId: financialWatchlistItem.id,
    title: "NVIDIA financial fixture",
    contentExcerpt:
      "<html><body><h1>Quarterly results</h1><table><tr><th>Metric</th><th>Value</th></tr><tr><td>Revenue</td><td>$26.0 billion</td></tr><tr><td>Gross margin</td><td>76.0%</td></tr><tr><td>Capital expenditures</td><td>$1.1 billion</td></tr></table></body></html>"
  }
};
validateExtractionInputs([financialRawDocument], [financialWatchlistItem], seed);
const financialParsedDocument = parseDocument(financialRawDocument, financialWatchlistItem, generatedAt);
assert.equal(financialParsedDocument.quality.financialFactCount, 3);

const financialRecords = buildExtractionRecords(
  [financialRawDocument],
  [financialParsedDocument],
  [financialWatchlistItem],
  generatedAt,
  extractionMethod
);
assert.equal(financialRecords[0].metrics.length, 3);
assert.ok(financialRecords[0].metrics.some((metric) => metric.metricType === "revenue" && metric.valueText === "$26.0 billion"));
assert.ok(financialRecords[0].metrics.some((metric) => metric.metricType === "gross_margin" && metric.valueText === "76.0%"));
assert.ok(
  financialRecords[0].metrics.some((metric) => metric.metricType === "capital_expenditure" && metric.valueText === "$1.1 billion")
);

const financialCandidateMetrics = buildCandidateMetrics(
  financialRecords,
  new Map([[financialWatchlistItem.id, financialWatchlistItem]]),
  generatedAt,
  extractionMethod
);
assert.equal(financialCandidateMetrics.length, 3);
assert.ok(financialCandidateMetrics.some((metric) => metric.id === "worker_metric_watch_fixture_nvidia_financial_nvidia_revenue"));
assert.ok(financialCandidateMetrics.every((metric) => metric.status === "candidate"));

console.log("RSS worker fixture validation passed");
