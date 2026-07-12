import fs from "node:fs/promises";

globalThis.window = {};
await import("../data/seed.js");
await import("../data/p1-extension.js");
await import("../data/metrics.js");

const seed = globalThis.window.AI_CAPITAL_SEED;
const metricBundle = globalThis.window.AI_CAPITAL_METRICS || { metrics: [] };

if (!seed) {
  throw new Error("AI_CAPITAL_SEED was not loaded");
}

const root = new URL("../", import.meta.url);

async function readJson(path) {
  return JSON.parse(await fs.readFile(new URL(path, root), "utf8"));
}

function addUniqueErrors(items, label, errors) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items || []) {
    if (!item?.id) {
      errors.push(`${label} item missing id`);
      continue;
    }
    if (seen.has(item.id)) duplicates.add(item.id);
    seen.add(item.id);
  }
  for (const id of duplicates) {
    errors.push(`${label} duplicate id: ${id}`);
  }
}

function isConfidence(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function payloadArray(item, key) {
  const value = item.payload?.[key];
  return Array.isArray(value) ? value : [];
}

function normalizeTextKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function validAuthorName(value) {
  const normalized = normalizeTextKey(value);
  if (!normalized || normalized.length < 2) return false;
  if (["and", "et al", "anonymous", "unknown", "none", "na", "n a"].includes(normalized)) return false;
  return /[a-z]/.test(normalized);
}

function validArxivId(value) {
  return /^\d{4}\.\d{4,5}$/.test(value) || /^[a-z-]+(?:\.[a-z-]+)?\/\d{7}$/.test(value);
}

const rawDocumentBundle = await readJson("data/raw-documents.json");
const parsedDocumentBundle = await readJson("data/parsed-documents.json");
const extractionBundle = await readJson("data/extraction-candidates.json");
const llmBundle = await readJson("data/llm-extractions.json");
const candidateSnapshot = await readJson("data/candidate-snapshot.json");
const wikidataSnapshot = await readJson("data/wikidata-profiles.snapshot.json");
const openAlexWorksSnapshot = await readJson("data/openalex-works.snapshot.json");
const arxivPapersSnapshot = await readJson("data/arxiv-papers.snapshot.json");
const candidateSnapshotManifest = await readJson("data/research/candidate-snapshot-manifest.json");
const graphSnapshot = await readJson("data/research/graph-snapshot.json");
const timeline = await readJson("data/research/timeline.json");

const errors = [];
const entityIds = new Set(seed.entities.map((entity) => entity.id));
const layerIds = new Set(seed.layers.map((layer) => layer.id));
const sourceIds = new Set(seed.sources.map((source) => source.id));
const relationTypes = new Set(Object.keys(seed.relationLabels));
const candidateEntityIds = new Set((candidateSnapshot.candidateEntities || []).map((candidate) => candidate.entityId));
const rawDocumentIds = new Set((rawDocumentBundle.documents || []).map((document) => document.id));
const parsedDocumentIds = new Set((parsedDocumentBundle.documents || []).map((document) => document.id));
const extractionRecordIds = new Set((extractionBundle.records || []).map((record) => record.id));
const extractionByRawDocumentId = new Map((extractionBundle.records || []).map((record) => [record.rawDocumentId, record]));

addUniqueErrors(rawDocumentBundle.documents, "raw_document", errors);
addUniqueErrors(parsedDocumentBundle.documents, "parsed_document", errors);
addUniqueErrors(extractionBundle.records, "extraction_record", errors);
addUniqueErrors(llmBundle.records, "llm_extraction", errors);
addUniqueErrors(candidateSnapshot.candidateRelationships, "candidate_relationship", errors);
addUniqueErrors(candidateSnapshot.candidateEntities, "candidate_entity", errors);
addUniqueErrors(candidateSnapshot.candidateMetrics, "candidate_metric", errors);
addUniqueErrors(wikidataSnapshot.results, "wikidata_profile", errors);
addUniqueErrors(openAlexWorksSnapshot.results, "openalex_work_result", errors);
addUniqueErrors(arxivPapersSnapshot.results, "arxiv_paper_result", errors);
addUniqueErrors(candidateSnapshotManifest.archives, "candidate_snapshot_archive", errors);

for (const document of rawDocumentBundle.documents || []) {
  if (!entityIds.has(document.entityId)) errors.push(`${document.id} references unknown entityId: ${document.entityId}`);
  if (!document.url) errors.push(`${document.id} missing url`);
  if (!document.contentHash) errors.push(`${document.id} missing contentHash`);
  if (!["parsed", "fetch_failed", "pending", "failed"].includes(document.parseStatus)) {
    errors.push(`${document.id} has unsupported parseStatus: ${document.parseStatus}`);
  }
  if (document.parseStatus === "parsed" && !document.payload?.watchlistId) {
    errors.push(`${document.id} parsed payload missing watchlistId`);
  }
}

for (const document of parsedDocumentBundle.documents || []) {
  if (!rawDocumentIds.has(document.rawDocumentId)) {
    errors.push(`${document.id} references unknown rawDocumentId: ${document.rawDocumentId}`);
  }
  if (!entityIds.has(document.entityId)) errors.push(`${document.id} references unknown entityId: ${document.entityId}`);
  if (!["parsed", "empty", "skipped"].includes(document.parserStatus)) {
    errors.push(`${document.id} has unsupported parserStatus: ${document.parserStatus}`);
  }
  if (!["html", "json", "rss", "pdf", "text"].includes(document.format)) {
    errors.push(`${document.id} has unsupported format: ${document.format}`);
  }
  if (document.parserStatus === "parsed" && !document.text) {
    errors.push(`${document.id} parsed document missing text`);
  }
  if (!Array.isArray(document.facts)) {
    errors.push(`${document.id} facts must be an array`);
  }
  if (!Array.isArray(document.sections)) {
    errors.push(`${document.id} sections must be an array`);
  }
  if (!Array.isArray(document.links)) {
    errors.push(`${document.id} links must be an array`);
  }
  if ((document.quality?.factCount || 0) !== (document.facts || []).length) {
    errors.push(`${document.id} quality.factCount does not match facts length`);
  }
  if ((document.quality?.sectionCount || 0) !== (document.sections || []).length) {
    errors.push(`${document.id} quality.sectionCount does not match sections length`);
  }
  if ((document.quality?.linkCount || 0) !== (document.links || []).length) {
    errors.push(`${document.id} quality.linkCount does not match links length`);
  }
  const rawDocument = (rawDocumentBundle.documents || []).find((item) => item.id === document.rawDocumentId);
  if (rawDocument && document.contentHash !== rawDocument.contentHash) {
    errors.push(`${document.id} contentHash does not match ${document.rawDocumentId}`);
  }
}

for (const record of extractionBundle.records || []) {
  if (!rawDocumentIds.has(record.rawDocumentId)) {
    errors.push(`${record.id} references unknown rawDocumentId: ${record.rawDocumentId}`);
  }
  const rawDocument = (rawDocumentBundle.documents || []).find((document) => document.id === record.rawDocumentId);
  if (rawDocument && record.contentHash !== rawDocument.contentHash) {
    errors.push(`${record.id} contentHash does not match ${record.rawDocumentId}`);
  }
  if (!["extracted", "skipped"].includes(record.status)) {
    errors.push(`${record.id} has unsupported status: ${record.status}`);
  }
  if (record.parsedDocumentId && !parsedDocumentIds.has(record.parsedDocumentId)) {
    errors.push(`${record.id} references unknown parsedDocumentId: ${record.parsedDocumentId}`);
  }
  if (record.status === "extracted" && !record.prompt) {
    errors.push(`${record.id} missing LLM-ready prompt`);
  }
  if (record.status === "extracted" && record.parsedDocumentId) {
    const parsedDocument = (parsedDocumentBundle.documents || []).find((document) => document.id === record.parsedDocumentId);
    if (parsedDocument?.quality?.sectionCount > 0 && !record.prompt.includes("Structured sections:")) {
      errors.push(`${record.id} prompt missing structured section context`);
    }
  }
  for (const relationship of record.relationships || []) {
    if (!entityIds.has(relationship.sourceEntityId)) {
      errors.push(`${record.id} relationship references unknown sourceEntityId: ${relationship.sourceEntityId}`);
    }
    if (!entityIds.has(relationship.targetEntityId)) {
      errors.push(`${record.id} relationship references unknown targetEntityId: ${relationship.targetEntityId}`);
    }
    if (!relationTypes.has(relationship.relationType)) {
      errors.push(`${record.id} relationship has unknown relationType: ${relationship.relationType}`);
    }
    if (!relationship.evidenceUrl) errors.push(`${record.id} relationship missing evidenceUrl`);
    if (!isConfidence(relationship.confidence)) errors.push(`${record.id} relationship has invalid confidence`);
  }
  for (const metric of record.metrics || []) {
    if (!entityIds.has(metric.entityId)) errors.push(`${record.id} metric references unknown entityId: ${metric.entityId}`);
    if (!sourceIds.has(metric.sourceId)) errors.push(`${record.id} metric references unknown sourceId: ${metric.sourceId}`);
    if (!metric.evidenceUrl) errors.push(`${record.id} metric missing evidenceUrl`);
    if (!isConfidence(metric.confidence)) errors.push(`${record.id} metric has invalid confidence`);
  }
}

for (const record of llmBundle.records || []) {
  if (!extractionRecordIds.has(record.extractionRecordId)) {
    errors.push(`${record.id} references unknown extractionRecordId: ${record.extractionRecordId}`);
  }
  if (!rawDocumentIds.has(record.rawDocumentId)) {
    errors.push(`${record.id} references unknown rawDocumentId: ${record.rawDocumentId}`);
  }
  if (record.parsedDocumentId && !parsedDocumentIds.has(record.parsedDocumentId)) {
    errors.push(`${record.id} references unknown parsedDocumentId: ${record.parsedDocumentId}`);
  }
  if (!["completed", "skipped", "failed"].includes(record.status)) {
    errors.push(`${record.id} has unsupported status: ${record.status}`);
  }
  if (!record.provider) errors.push(`${record.id} missing provider`);
  for (const relationship of record.relationships || []) {
    if (!entityIds.has(relationship.sourceEntityId)) {
      errors.push(`${record.id} relationship references unknown sourceEntityId: ${relationship.sourceEntityId}`);
    }
    if (!entityIds.has(relationship.targetEntityId)) {
      errors.push(`${record.id} relationship references unknown targetEntityId: ${relationship.targetEntityId}`);
    }
    if (!relationTypes.has(relationship.relationType)) {
      errors.push(`${record.id} relationship has unknown relationType: ${relationship.relationType}`);
    }
    if (!relationship.evidenceUrl) errors.push(`${record.id} relationship missing evidenceUrl`);
    if (!isConfidence(relationship.confidence)) errors.push(`${record.id} relationship has invalid confidence`);
  }
}

for (const candidate of candidateSnapshot.candidateRelationships || []) {
  const sourceCandidateEntityId = candidate.sourceCandidateEntityId || candidate.payload?.sourceCandidateEntityId;
  const targetCandidateEntityId = candidate.targetCandidateEntityId || candidate.payload?.targetCandidateEntityId;
  if (candidate.sourceEntityId) {
    if (!entityIds.has(candidate.sourceEntityId)) {
      errors.push(`${candidate.id} references unknown sourceEntityId: ${candidate.sourceEntityId}`);
    }
  } else if (sourceCandidateEntityId) {
    if (!candidateEntityIds.has(sourceCandidateEntityId)) {
      errors.push(`${candidate.id} references unknown sourceCandidateEntityId: ${sourceCandidateEntityId}`);
    }
  } else {
    errors.push(`${candidate.id} missing sourceEntityId or sourceCandidateEntityId`);
  }
  if (candidate.targetEntityId) {
    if (!entityIds.has(candidate.targetEntityId)) {
      errors.push(`${candidate.id} references unknown targetEntityId: ${candidate.targetEntityId}`);
    }
  } else if (targetCandidateEntityId) {
    if (!candidateEntityIds.has(targetCandidateEntityId)) {
      errors.push(`${candidate.id} references unknown targetCandidateEntityId: ${targetCandidateEntityId}`);
    }
  } else {
    errors.push(`${candidate.id} missing targetEntityId or targetCandidateEntityId`);
  }
  if (!relationTypes.has(candidate.relationType)) {
    errors.push(`${candidate.id} has unknown relationType: ${candidate.relationType}`);
  }
  if (!candidate.evidenceUrl) errors.push(`${candidate.id} missing evidenceUrl`);
  if (!isConfidence(candidate.confidence)) errors.push(`${candidate.id} has invalid confidence`);
  const extractionRecordId = candidate.payload?.extractionRecordId;
  if (extractionRecordId && !(extractionBundle.records || []).some((record) => record.id === extractionRecordId)) {
    errors.push(`${candidate.id} references unknown extractionRecordId: ${extractionRecordId}`);
  }
  const parsedDocumentId = candidate.payload?.parsedDocumentId;
  if (parsedDocumentId && !parsedDocumentIds.has(parsedDocumentId)) {
    errors.push(`${candidate.id} references unknown parsedDocumentId: ${parsedDocumentId}`);
  }
  if (candidate.extractionMethod === "openalex_citation_relationship_snapshot") {
    if (!candidate.payload?.sourceOpenAlexWorkId) errors.push(`${candidate.id} missing sourceOpenAlexWorkId`);
    if (!candidate.payload?.referencedOpenAlexWorkId) errors.push(`${candidate.id} missing referencedOpenAlexWorkId`);
    if (!candidate.payload?.referencedOpenAlexUrl) errors.push(`${candidate.id} missing referencedOpenAlexUrl`);
    if (candidate.payload?.citationDirection !== "outgoing_reference") errors.push(`${candidate.id} missing citationDirection`);
    if (!payloadArray(candidate, "sourcePaperDedupKeys").length) errors.push(`${candidate.id} missing sourcePaperDedupKeys`);
  }
  if (
    ["openalex_authorship_relationship_snapshot", "arxiv_authorship_relationship_snapshot"].includes(candidate.extractionMethod) &&
    candidate.payload?.targetCandidateType === "research_author"
  ) {
    if (!candidate.payload?.normalizedAuthorName) errors.push(`${candidate.id} missing normalizedAuthorName`);
    if (!payloadArray(candidate, "dedupKeys").length) errors.push(`${candidate.id} missing author relationship dedupKeys`);
  }
}

for (const candidate of candidateSnapshot.candidateMetrics || []) {
  if (!entityIds.has(candidate.entityId)) errors.push(`${candidate.id} references unknown entityId: ${candidate.entityId}`);
  if (candidate.sourceId && !sourceIds.has(candidate.sourceId)) {
    errors.push(`${candidate.id} references unknown sourceId: ${candidate.sourceId}`);
  }
  if (!candidate.evidenceUrl) errors.push(`${candidate.id} missing evidenceUrl`);
  if (!isConfidence(candidate.confidence)) errors.push(`${candidate.id} has invalid confidence`);
}

for (const profile of wikidataSnapshot.results || []) {
  if (!entityIds.has(profile.entityId)) errors.push(`${profile.id} references unknown entityId: ${profile.entityId}`);
  if (profile.sourceId && !sourceIds.has(profile.sourceId)) {
    errors.push(`${profile.id} references unknown sourceId: ${profile.sourceId}`);
  }
  if (!profile.wikidataUrl || !/^https:\/\/www\.wikidata\.org\/wiki\/Q/.test(profile.wikidataUrl)) {
    errors.push(`${profile.id} missing Wikidata entity URL`);
  }
  if (!isConfidence(profile.confidence)) errors.push(`${profile.id} has invalid confidence`);
}

for (const candidate of candidateSnapshot.candidateEntities || []) {
  if (!candidate.entityId) errors.push(`${candidate.id} missing entityId`);
  if (!candidate.name) errors.push(`${candidate.id} missing name`);
  if (!candidate.type) errors.push(`${candidate.id} missing type`);
  if (!layerIds.has(candidate.layer)) errors.push(`${candidate.id} references unknown layer: ${candidate.layer}`);
  if (!candidate.evidenceUrl) errors.push(`${candidate.id} missing evidenceUrl`);
  if (!isConfidence(candidate.confidence)) errors.push(`${candidate.id} has invalid confidence`);
  if (!candidate.payload?.qid && candidate.extractionMethod === "wikidata_profile_snapshot") {
    errors.push(`${candidate.id} missing Wikidata qid payload`);
  }
  if (candidate.extractionMethod === "openalex_work_snapshot") {
    if (!candidate.payload?.openAlexWorkId) errors.push(`${candidate.id} missing OpenAlex work id payload`);
    if (!candidate.payload?.normalizedOpenAlexWorkId) errors.push(`${candidate.id} missing normalizedOpenAlexWorkId`);
    if (!candidate.payload?.normalizedTitleKey) errors.push(`${candidate.id} missing normalizedTitleKey`);
    if (!payloadArray(candidate, "dedupKeys").length) errors.push(`${candidate.id} missing paper dedupKeys`);
  }
  if (candidate.extractionMethod === "openalex_institution_snapshot" && !candidate.payload?.workIds?.length) {
    errors.push(`${candidate.id} missing OpenAlex institution work ids payload`);
  }
  if (candidate.extractionMethod === "openalex_author_snapshot") {
    if (!candidate.payload?.authorName || !candidate.payload?.workIds?.length) errors.push(`${candidate.id} missing OpenAlex author payload`);
    if (!validAuthorName(candidate.name) || !validAuthorName(candidate.payload?.authorName)) errors.push(`${candidate.id} has invalid OpenAlex author name`);
    if (!candidate.payload?.normalizedAuthorName) errors.push(`${candidate.id} missing normalizedAuthorName`);
    if (!payloadArray(candidate, "dedupKeys").length) errors.push(`${candidate.id} missing author dedupKeys`);
  }
  if (
    candidate.extractionMethod === "openalex_referenced_work_snapshot" &&
    (!candidate.payload?.openAlexWorkId || !candidate.payload?.referencedByWorkIds?.length || !payloadArray(candidate, "referencedByWorkDetails").length)
  ) {
    errors.push(`${candidate.id} missing OpenAlex referenced work payload`);
  }
  if (candidate.extractionMethod === "arxiv_paper_snapshot") {
    if (!candidate.payload?.arxivPaperId) errors.push(`${candidate.id} missing arXiv paper id payload`);
    if (!candidate.payload?.normalizedArxivPaperId) errors.push(`${candidate.id} missing normalizedArxivPaperId`);
    if (!candidate.payload?.normalizedTitleKey) errors.push(`${candidate.id} missing normalizedTitleKey`);
    if (!payloadArray(candidate, "dedupKeys").length) errors.push(`${candidate.id} missing paper dedupKeys`);
  }
  for (const key of payloadArray(candidate, "dedupKeys")) {
    if (key.startsWith("arxiv:") && !validArxivId(key.slice("arxiv:".length))) {
      errors.push(`${candidate.id} has invalid arXiv dedup key: ${key}`);
    }
  }
  if (candidate.extractionMethod === "arxiv_author_snapshot") {
    if (!candidate.payload?.authorName || !candidate.payload?.paperIds?.length) errors.push(`${candidate.id} missing arXiv author payload`);
    if (!validAuthorName(candidate.name) || !validAuthorName(candidate.payload?.authorName)) errors.push(`${candidate.id} has invalid arXiv author name`);
    if (!candidate.payload?.normalizedAuthorName) errors.push(`${candidate.id} missing normalizedAuthorName`);
    if (!payloadArray(candidate, "dedupKeys").length) errors.push(`${candidate.id} missing author dedupKeys`);
  }
}

for (const result of openAlexWorksSnapshot.results || []) {
  if (!entityIds.has(result.entityId)) errors.push(`${result.id} references unknown entityId: ${result.entityId}`);
  if (!result.query) errors.push(`${result.id} missing query`);
  if (!Array.isArray(result.works)) errors.push(`${result.id} works must be an array`);
  for (const work of result.works || []) {
    if (!work.id) errors.push(`${result.id} has work missing id`);
    if (!work.openAlexUrl) errors.push(`${result.id}/${work.id} missing OpenAlex URL`);
    if (typeof work.citedByCount !== "number") errors.push(`${result.id}/${work.id} citedByCount must be numeric`);
  }
}

for (const result of arxivPapersSnapshot.results || []) {
  if (!entityIds.has(result.entityId)) errors.push(`${result.id} references unknown entityId: ${result.entityId}`);
  if (!result.query) errors.push(`${result.id} missing query`);
  if (!Array.isArray(result.papers)) errors.push(`${result.id} papers must be an array`);
  for (const paper of result.papers || []) {
    if (!paper.id) errors.push(`${result.id} has paper missing id`);
    if (!paper.arxivUrl || !/^https:\/\/arxiv\.org\/abs\//.test(paper.arxivUrl)) {
      errors.push(`${result.id}/${paper.id} missing arXiv abs URL`);
    }
    if (!paper.title) errors.push(`${result.id}/${paper.id} missing title`);
    if (!Array.isArray(paper.authors)) errors.push(`${result.id}/${paper.id} authors must be an array`);
    if (!Array.isArray(paper.categories)) errors.push(`${result.id}/${paper.id} categories must be an array`);
  }
}

const counts = graphSnapshot.counts || {};
const expectedCounts = {
  entities: seed.entities.length,
  relationships: seed.relationships.length,
  sources: seed.sources.length,
  approvedMetricGroups: metricBundle.metrics?.length || 0,
  metricFailures: metricBundle.rejectedOrFailed?.length || 0,
  candidateRelationships: candidateSnapshot.candidateRelationships?.length || 0,
  candidateEntities: candidateSnapshot.candidateEntities?.length || 0,
  candidateMetrics: candidateSnapshot.candidateMetrics?.length || 0,
  wikidataProfiles: wikidataSnapshot.results?.length || 0,
  openAlexWorkSets: openAlexWorksSnapshot.results?.length || 0,
  openAlexWorks: (openAlexWorksSnapshot.results || []).reduce((total, result) => total + (result.works?.length || 0), 0),
  arxivPaperSets: arxivPapersSnapshot.results?.length || 0,
  arxivPapers: (arxivPapersSnapshot.results || []).reduce((total, result) => total + (result.papers?.length || 0), 0),
  retryBacklog: candidateSnapshot.retryBacklog?.length || 0,
  candidateSnapshotArchives: candidateSnapshotManifest.archives?.length || 0,
  rawDocuments: rawDocumentBundle.documents?.length || 0,
  parsedDocuments: parsedDocumentBundle.documents?.length || 0,
  structuredParsedDocuments: parsedDocumentBundle.summary?.parsedDocuments || 0,
  parsedFacts: parsedDocumentBundle.summary?.totalFacts || 0,
  extractionRecords: extractionBundle.records?.length || 0,
  extractedDocuments: extractionBundle.summary?.extractedDocuments || 0,
  llmExtractionRecords: llmBundle.records?.length || 0,
  llmCompletedRecords: llmBundle.summary?.completedRecords || 0
};

const latestArchive = (candidateSnapshotManifest.archives || []).find(
  (archive) => archive.id === candidateSnapshotManifest.latestArchiveId
);
if (!latestArchive) {
  errors.push(`candidate snapshot manifest latestArchiveId not found: ${candidateSnapshotManifest.latestArchiveId}`);
} else {
  const archivePath = new URL(`data/research/${latestArchive.file}`, root);
  let archiveBundle = null;
  try {
    archiveBundle = JSON.parse(await fs.readFile(archivePath, "utf8"));
  } catch (error) {
    errors.push(`candidate snapshot archive missing or unreadable: ${latestArchive.file}`);
  }
  if (archiveBundle) {
    if (archiveBundle.contentHash !== latestArchive.contentHash) {
      errors.push(`${latestArchive.id} manifest contentHash does not match archive file`);
    }
    const archiveSnapshot = archiveBundle.snapshot || {};
    const archiveCounts = {
      candidateRelationships: archiveSnapshot.candidateRelationships?.length || 0,
      candidateEntities: archiveSnapshot.candidateEntities?.length || 0,
      candidateMetrics: archiveSnapshot.candidateMetrics?.length || 0,
      retryBacklog: archiveSnapshot.retryBacklog?.length || 0
    };
    for (const [key, expected] of Object.entries(latestArchive.counts || {})) {
      if (archiveCounts[key] !== expected) {
        errors.push(`${latestArchive.id} ${key} expected ${expected}, got ${archiveCounts[key]}`);
      }
    }
  }
}

for (const [key, expected] of Object.entries(expectedCounts)) {
  if (counts[key] !== expected) {
    errors.push(`graphSnapshot.counts.${key} expected ${expected}, got ${counts[key]}`);
  }
}

const extractionTimelineCount = (timeline.events || []).filter((event) => event.type === "extraction_record").length;
if (extractionTimelineCount !== (extractionBundle.records || []).length) {
  errors.push(`timeline extraction_record count expected ${extractionBundle.records?.length || 0}, got ${extractionTimelineCount}`);
}

const parsedTimelineCount = (timeline.events || []).filter((event) => event.type === "parsed_document").length;
if (parsedTimelineCount !== (parsedDocumentBundle.documents || []).length) {
  errors.push(`timeline parsed_document count expected ${parsedDocumentBundle.documents?.length || 0}, got ${parsedTimelineCount}`);
}

const llmTimelineCount = (timeline.events || []).filter((event) => event.type === "llm_extraction").length;
if (llmTimelineCount !== (llmBundle.records || []).length) {
  errors.push(`timeline llm_extraction count expected ${llmBundle.records?.length || 0}, got ${llmTimelineCount}`);
}

for (const [type, expected] of [
  ["candidate_relationship", candidateSnapshot.candidateRelationships?.length || 0],
  ["candidate_entity", candidateSnapshot.candidateEntities?.length || 0],
  ["candidate_metric", candidateSnapshot.candidateMetrics?.length || 0]
]) {
  const candidateEvents = (timeline.events || []).filter((event) => event.type === type);
  if (candidateEvents.length !== expected) {
    errors.push(`timeline ${type} count expected ${expected}, got ${candidateEvents.length}`);
  }
  for (const event of candidateEvents) {
    if (!event.status) errors.push(`${event.id} timeline candidate event missing status`);
    if (!isConfidence(event.confidence)) errors.push(`${event.id} timeline candidate event has invalid confidence`);
  }
}

for (const record of extractionBundle.records || []) {
  if (record.status === "extracted" && !extractionByRawDocumentId.has(record.rawDocumentId)) {
    errors.push(`${record.id} is not indexed by rawDocumentId`);
  }
}

for (const exportFile of [
  "entities.csv",
  "relationships.csv",
  "metrics.csv",
  "raw-documents.csv",
  "parsed-documents.csv",
  "extraction-records.csv",
  "llm-extractions.csv",
  "candidate-relationships.csv",
  "candidate-entities.csv",
  "candidate-metrics.csv",
  "wikidata-profiles.csv",
  "openalex-works.csv",
  "arxiv-papers.csv",
  "candidate-snapshot-archives.csv",
  "snapshot-summary.csv"
]) {
  try {
    const stat = await fs.stat(new URL(`data/exports/${exportFile}`, root));
    if (!stat.isFile() || stat.size === 0) errors.push(`data/exports/${exportFile} is empty or not a file`);
  } catch {
    errors.push(`data/exports/${exportFile} missing`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `Research artifacts valid: ${rawDocumentBundle.documents?.length || 0} raw documents, ${
    parsedDocumentBundle.documents?.length || 0
  } parsed documents, ${extractionBundle.records?.length || 0} extraction records, ${
    llmBundle.records?.length || 0
  } LLM extraction records, ${
  candidateSnapshot.candidateRelationships?.length || 0
  } candidate relationships, ${candidateSnapshot.candidateEntities?.length || 0} candidate entities, ${
    candidateSnapshot.candidateMetrics?.length || 0
  } candidate metrics, ${wikidataSnapshot.results?.length || 0} Wikidata profiles, ${
    (openAlexWorksSnapshot.results || []).reduce((total, result) => total + (result.works?.length || 0), 0)
  } OpenAlex works, ${
    (arxivPapersSnapshot.results || []).reduce((total, result) => total + (result.papers?.length || 0), 0)
  } arXiv papers.`
);
