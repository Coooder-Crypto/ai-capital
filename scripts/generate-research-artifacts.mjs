import fs from "node:fs/promises";
import { applyEvidenceOverrides } from "./evidence-overrides.mjs";

globalThis.window = {};
await import("../data/seed.js");
await import("../data/p1-extension.js");
await import("../data/metrics.js");

const seed = globalThis.window.AI_CAPITAL_SEED;
const metricBundle = globalThis.window.AI_CAPITAL_METRICS || { metrics: [] };

if (!seed) {
  throw new Error("AI_CAPITAL_SEED was not loaded");
}
applyEvidenceOverrides(seed);

const root = new URL("../", import.meta.url);
const candidateSnapshotPath = new URL("data/candidate-snapshot.json", root);
const candidateSnapshotManifestPath = new URL("data/research/candidate-snapshot-manifest.json", root);
const evidenceBacklogPath = new URL("data/evidence-backlog.json", root);
const workerRunPath = new URL("data/worker-run.json", root);
const rawDocumentsPath = new URL("data/raw-documents.json", root);
const parsedDocumentsPath = new URL("data/parsed-documents.json", root);
const extractionCandidatesPath = new URL("data/extraction-candidates.json", root);
const llmExtractionsPath = new URL("data/llm-extractions.json", root);
const wikidataProfilesPath = new URL("data/wikidata-profiles.snapshot.json", root);
const openAlexWorksPath = new URL("data/openalex-works.snapshot.json", root);
const arxivPapersPath = new URL("data/arxiv-papers.snapshot.json", root);
const researchDir = new URL("data/research/", root);
const exportDir = new URL("data/exports/", root);

async function readJsonIfExists(pathUrl, fallback) {
  try {
    return JSON.parse(await fs.readFile(pathUrl, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows, columns) {
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))
  ].join("\n");
}

function normalizeDate(value) {
  const text = String(value || "");
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function layerCounts() {
  return seed.layers.map((layer) => ({
    layerId: layer.id,
    layerName: layer.name,
    entities: seed.entities.filter((entity) => entity.layer === layer.id).length,
    relationshipsOut: seed.relationships.filter((relationship) => {
      const source = seed.entities.find((entity) => entity.id === relationship.source);
      return source?.layer === layer.id;
    }).length,
    relationshipsIn: seed.relationships.filter((relationship) => {
      const target = seed.entities.find((entity) => entity.id === relationship.target);
      return target?.layer === layer.id;
    }).length
  }));
}

function relationshipTypeCounts() {
  const counts = new Map();
  for (const relationship of seed.relationships) {
    counts.set(relationship.type, (counts.get(relationship.type) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, label: seed.relationLabels[type] || type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

function topEntitiesByDegree(limit = 20) {
  const degree = new Map(seed.entities.map((entity) => [entity.id, { in: 0, out: 0 }]));
  for (const relationship of seed.relationships) {
    const sourceDegree = degree.get(relationship.source);
    const targetDegree = degree.get(relationship.target);
    if (sourceDegree) sourceDegree.out += 1;
    if (targetDegree) targetDegree.in += 1;
  }

  return seed.entities
    .map((entity) => {
      const item = degree.get(entity.id) || { in: 0, out: 0 };
      return {
        entityId: entity.id,
        name: entity.name,
        type: entity.type,
        layer: entity.layer,
        inDegree: item.in,
        outDegree: item.out,
        totalDegree: item.in + item.out
      };
    })
    .sort((a, b) => b.totalDegree - a.totalDegree || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function confidenceBuckets() {
  const buckets = [
    { id: "high", label: ">= 0.8", min: 0.8, max: 1, count: 0 },
    { id: "medium", label: "0.6 - 0.79", min: 0.6, max: 0.799, count: 0 },
    { id: "low", label: "< 0.6", min: 0, max: 0.599, count: 0 }
  ];

  for (const relationship of seed.relationships) {
    const bucket = buckets.find((item) => relationship.confidence >= item.min && relationship.confidence <= item.max);
    if (bucket) bucket.count += 1;
  }

  return buckets.map(({ id, label, count }) => ({ id, label, count }));
}

function buildGraphSnapshot(
  candidateSnapshot,
  candidateSnapshotManifest,
  evidenceBacklog,
  workerRun,
  rawDocumentBundle,
  parsedDocumentBundle,
  extractionBundle,
  llmBundle,
  wikidataSnapshot,
  openAlexWorksSnapshot,
  arxivPapersSnapshot
) {
  return {
    generatedAt: new Date().toISOString(),
    counts: {
      layers: seed.layers.length,
      entities: seed.entities.length,
      relationships: seed.relationships.length,
      sources: seed.sources.length,
      approvedMetricGroups: metricBundle.metrics?.length || 0,
      metricFailures: metricBundle.rejectedOrFailed?.length || 0,
      candidateRelationships: candidateSnapshot.candidateRelationships?.length || 0,
      candidateEntities: candidateSnapshot.candidateEntities?.length || 0,
      candidateMetrics: candidateSnapshot.candidateMetrics?.length || 0,
      retryBacklog: candidateSnapshot.retryBacklog?.length || 0,
      candidateSnapshotArchives: candidateSnapshotManifest.archives?.length || 0,
      evidenceBacklog: evidenceBacklog.relationships?.length || 0,
      connectorRuns: workerRun.runs?.length || 0,
      rawDocuments: rawDocumentBundle.documents?.length || 0,
      parsedDocuments: parsedDocumentBundle.documents?.length || 0,
      structuredParsedDocuments: parsedDocumentBundle.summary?.parsedDocuments || 0,
      parsedFacts: parsedDocumentBundle.summary?.totalFacts || 0,
      extractionRecords: extractionBundle.records?.length || 0,
      extractedDocuments: extractionBundle.summary?.extractedDocuments || 0,
      llmExtractionRecords: llmBundle.records?.length || 0,
      llmCompletedRecords: llmBundle.summary?.completedRecords || 0,
      wikidataProfiles: wikidataSnapshot.results?.length || 0,
      openAlexWorkSets: openAlexWorksSnapshot.results?.length || 0,
      openAlexWorks: (openAlexWorksSnapshot.results || []).reduce((total, result) => total + (result.works?.length || 0), 0),
      arxivPaperSets: arxivPapersSnapshot.results?.length || 0,
      arxivPapers: (arxivPapersSnapshot.results || []).reduce((total, result) => total + (result.papers?.length || 0), 0)
    },
    layerCounts: layerCounts(),
    relationshipTypeCounts: relationshipTypeCounts(),
    confidenceBuckets: confidenceBuckets(),
    topEntitiesByDegree: topEntitiesByDegree()
  };
}

function buildTimeline(candidateSnapshot, evidenceBacklog, workerRun, rawDocumentBundle, parsedDocumentBundle, extractionBundle, llmBundle) {
  const events = [];
  const entityById = new Map(seed.entities.map((entity) => [entity.id, entity]));
  const candidateEntityById = new Map((candidateSnapshot.candidateEntities || []).map((candidate) => [candidate.entityId, candidate]));

  for (const source of seed.sources) {
    const date = normalizeDate(source.date);
    if (!date) continue;
    events.push({
      id: `source_${source.id}`,
      date,
      type: "source",
      title: source.title,
      entityId: null,
      entityName: null,
      sourceId: source.id,
      url: source.url,
      description: source.note || source.publisher
    });
  }

  for (const metric of metricBundle.metrics || []) {
    events.push({
      id: `metric_${metric.entityId}_${metric.source}_${metric.sourceRef || "unknown"}_${metric.asOf}`,
      date: normalizeDate(metric.asOf),
      type: "metric",
      title: `${metric.entityId} ${metric.source} metrics`,
      entityId: metric.entityId,
      entityName: seed.entities.find((entity) => entity.id === metric.entityId)?.name || metric.entityId,
      sourceId: metric.source,
      url: "",
      description: Object.keys(metric.metrics || {}).join(", ")
    });
  }

  for (const item of candidateSnapshot.retryBacklog || []) {
    events.push({
      id: item.id,
      date: normalizeDate(item.createdAt || candidateSnapshot.generatedAt),
      type: "retry_backlog",
      title: `${item.source} retry needed`,
      entityId: item.entityId,
      entityName: item.entityName,
      sourceId: item.source,
      url: item.endpoint,
      description: item.message
    });
  }

  for (const item of (evidenceBacklog.relationships || []).slice(0, 20)) {
    events.push({
      id: item.id,
      date: normalizeDate(evidenceBacklog.generatedAt),
      type: "evidence_backlog",
      title: `${item.sourceEntityName} ${item.relationType} ${item.targetEntityName}`,
      entityId: item.sourceEntityId,
      entityName: item.sourceEntityName,
      sourceId: item.currentSourceId,
      url: "",
      description: item.reason
    });
  }

  for (const run of workerRun.runs || []) {
    events.push({
      id: run.id,
      date: normalizeDate(run.completedAt || run.startedAt),
      type: "connector_run",
      title: `${run.connectorName} ${run.status}`,
      entityId: null,
      entityName: null,
      sourceId: run.connectorName,
      url: "",
      description: `${run.rawDocuments} raw documents / ${run.candidateRelationships} relationship candidates / ${run.candidateMetrics} metric candidates`
    });
  }

  for (const document of rawDocumentBundle.documents || []) {
    events.push({
      id: document.id,
      date: normalizeDate(document.fetchedAt),
      type: "raw_document",
      title: document.title,
      entityId: document.entityId,
      entityName: seed.entities.find((entity) => entity.id === document.entityId)?.name || document.entityId,
      sourceId: document.connector,
      url: document.url,
      description: `${document.contentType} / ${document.parseStatus}`
    });
  }

  for (const document of parsedDocumentBundle.documents || []) {
    events.push({
      id: document.id,
      date: normalizeDate(document.parsedAt || parsedDocumentBundle.generatedAt),
      type: "parsed_document",
      title: `${document.format} ${document.parserStatus}`,
      entityId: document.entityId,
      entityName: seed.entities.find((entity) => entity.id === document.entityId)?.name || document.entityId,
      sourceId: document.parser,
      url: document.canonicalUrl || "",
      description: `${document.quality?.textLength || 0} chars / ${document.quality?.hintCount || 0} hints`
    });
  }

  for (const record of extractionBundle.records || []) {
    events.push({
      id: record.id,
      date: normalizeDate(record.extractedAt || extractionBundle.generatedAt),
      type: "extraction_record",
      title: `${record.connector || "extractor"} ${record.status}`,
      entityId: record.entityId,
      entityName: seed.entities.find((entity) => entity.id === record.entityId)?.name || record.entityId,
      sourceId: record.extractionMethod,
      url: record.evidenceUrl || "",
      description: `${record.quality?.relationshipCount || 0} relationship candidates / ${record.quality?.metricCount || 0} metric candidates`
    });
  }

  for (const record of llmBundle.records || []) {
    events.push({
      id: record.id,
      date: normalizeDate(record.requestedAt || llmBundle.generatedAt),
      type: "llm_extraction",
      title: `${record.provider || "llm"} ${record.status}`,
      entityId: record.entityId,
      entityName: seed.entities.find((entity) => entity.id === record.entityId)?.name || record.entityId,
      sourceId: record.model || record.provider || "llm",
      url: record.evidenceUrl || "",
      description: `${record.quality?.relationshipCount || 0} relationship candidates / ${record.quality?.metricCount || 0} metric candidates`
    });
  }

  for (const candidate of candidateSnapshot.candidateRelationships || []) {
    const sourceCandidateEntityId = candidate.sourceCandidateEntityId || candidate.payload?.sourceCandidateEntityId;
    const targetCandidateEntityId = candidate.targetCandidateEntityId || candidate.payload?.targetCandidateEntityId;
    const sourceName =
      (candidate.sourceEntityId ? entityById.get(candidate.sourceEntityId)?.name : undefined) ||
      (sourceCandidateEntityId ? candidateEntityById.get(sourceCandidateEntityId)?.name : undefined) ||
      candidate.payload?.sourceCandidateName ||
      candidate.sourceEntityId ||
      sourceCandidateEntityId ||
      "unknown";
    const targetName =
      (candidate.targetEntityId ? entityById.get(candidate.targetEntityId)?.name : undefined) ||
      (targetCandidateEntityId ? candidateEntityById.get(targetCandidateEntityId)?.name : undefined) ||
      candidate.payload?.targetCandidateName ||
      candidate.targetEntityId ||
      targetCandidateEntityId ||
      "unknown";
    events.push({
      id: candidate.id,
      date: normalizeDate(candidate.createdAt),
      type: "candidate_relationship",
      title: `${sourceName} ${candidate.relationType} ${targetName}`,
      entityId: candidate.sourceEntityId || sourceCandidateEntityId || null,
      entityName: sourceName,
      sourceId: candidate.extractionMethod,
      url: candidate.evidenceUrl || "",
      description: typeof candidate.payload?.note === "string" ? candidate.payload.note : candidate.extractionMethod,
      status: candidate.status || "candidate",
      confidence: candidate.confidence
    });
  }

  for (const candidate of candidateSnapshot.candidateEntities || []) {
    events.push({
      id: candidate.id,
      date: normalizeDate(candidate.createdAt),
      type: "candidate_entity",
      title: `Candidate entity: ${candidate.name}`,
      entityId: candidate.entityId || null,
      entityName: candidate.name,
      sourceId: candidate.extractionMethod,
      url: candidate.evidenceUrl || candidate.websiteUrl || "",
      description: typeof candidate.payload?.note === "string" ? candidate.payload.note : `${candidate.type} / ${candidate.layer}`,
      status: candidate.status || "candidate",
      confidence: candidate.confidence
    });
  }

  for (const candidate of candidateSnapshot.candidateMetrics || []) {
    events.push({
      id: candidate.id,
      date: normalizeDate(candidate.createdAt),
      type: "candidate_metric",
      title: `${candidate.entityId} ${candidate.metricType} metric candidate`,
      entityId: candidate.entityId,
      entityName: entityById.get(candidate.entityId)?.name || candidate.entityId,
      sourceId: candidate.sourceId || candidate.extractionMethod,
      url: candidate.evidenceUrl || candidate.sourceRef || "",
      description: `${candidate.valueText || candidate.valueNumber || "value"} / ${candidate.extractionMethod}`,
      status: candidate.status || "candidate",
      confidence: candidate.confidence
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    events: events
      .filter((event) => event.date)
      .sort((a, b) => b.date.localeCompare(a.date) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id))
  };
}

function exportRows(
  snapshot,
  candidateSnapshot,
  candidateSnapshotManifest,
  rawDocumentBundle,
  parsedDocumentBundle,
  extractionBundle,
  llmBundle,
  wikidataSnapshot,
  openAlexWorksSnapshot,
  arxivPapersSnapshot
) {
  const entityById = new Map(seed.entities.map((entity) => [entity.id, entity]));
  const candidateEntityById = new Map((candidateSnapshot.candidateEntities || []).map((candidate) => [candidate.entityId, candidate]));
  const displayEntityName = (entityId, candidateEntityId, fallback) =>
    (entityId ? entityById.get(entityId)?.name : undefined) ||
    (candidateEntityId ? candidateEntityById.get(candidateEntityId)?.name : undefined) ||
    fallback ||
    entityId ||
    candidateEntityId ||
    "";
  return {
    entities: seed.entities.map((entity) => ({
      id: entity.id,
      name: entity.name,
      type: entity.type,
      layer: entity.layer,
      status: entity.status,
      country: entity.country || "",
      website_url: entity.website_url || "",
      valuation: entity.valuation || ""
    })),
    relationships: seed.relationships.map((relationship) => ({
      id: relationship.id,
      source: relationship.source,
      source_name: entityById.get(relationship.source)?.name || relationship.source,
      target: relationship.target,
      target_name: entityById.get(relationship.target)?.name || relationship.target,
      type: relationship.type,
      confidence: relationship.confidence,
      source_id: relationship.sourceId,
      evidence_title: relationship.evidenceTitle || "",
      evidence_url: relationship.evidenceUrl || "",
      evidence_strength: relationship.evidenceStrength || "",
      review_status: relationship.reviewStatus || "",
      review_note: relationship.reviewNote || "",
      note: relationship.note
    })),
    metrics: (metricBundle.metrics || []).flatMap((group) =>
      Object.entries(group.metrics || {}).map(([metricType, value]) => ({
        entity_id: group.entityId,
        entity_name: entityById.get(group.entityId)?.name || group.entityId,
        source: group.source,
        source_ref: group.sourceRef || "",
        as_of: group.asOf,
        metric_type: metricType,
        value
      }))
    ),
    raw_documents: (rawDocumentBundle.documents || []).map((document) => ({
      id: document.id,
      entity_id: document.entityId,
      entity_name: entityById.get(document.entityId)?.name || document.entityId,
      connector: document.connector,
      title: document.title,
      url: document.url,
      content_type: document.contentType,
      parse_status: document.parseStatus,
      content_hash: document.contentHash,
      fetched_at: document.fetchedAt
    })),
    parsed_documents: (parsedDocumentBundle.documents || []).map((document) => ({
      id: document.id,
      raw_document_id: document.rawDocumentId,
      entity_id: document.entityId,
      entity_name: entityById.get(document.entityId)?.name || document.entityId,
      connector: document.connector,
      format: document.format,
      parser_status: document.parserStatus,
      text_length: document.quality?.textLength || 0,
      fact_count: document.quality?.factCount || 0,
      hint_count: document.quality?.hintCount || 0,
      canonical_url: document.canonicalUrl,
      parsed_at: document.parsedAt
    })),
    extraction_records: (extractionBundle.records || []).map((record) => ({
      id: record.id,
      raw_document_id: record.rawDocumentId,
      parsed_document_id: record.parsedDocumentId || "",
      entity_id: record.entityId,
      entity_name: entityById.get(record.entityId)?.name || record.entityId,
      connector: record.connector,
      status: record.status,
      parser_status: record.parserStatus || "",
      parsed_format: record.parsedFormat || "",
      extraction_method: record.extractionMethod,
      relationship_count: record.quality?.relationshipCount || 0,
      metric_count: record.quality?.metricCount || 0,
      evidence_url: record.evidenceUrl,
      extracted_at: record.extractedAt
    })),
    llm_extractions: (llmBundle.records || []).map((record) => ({
      id: record.id,
      extraction_record_id: record.extractionRecordId,
      raw_document_id: record.rawDocumentId,
      parsed_document_id: record.parsedDocumentId || "",
      entity_id: record.entityId,
      entity_name: entityById.get(record.entityId)?.name || record.entityId,
      provider: record.provider,
      model: record.model,
      status: record.status,
      relationship_count: record.quality?.relationshipCount || 0,
      metric_count: record.quality?.metricCount || 0,
      entity_count: record.quality?.entityCount || 0,
      evidence_url: record.evidenceUrl,
      requested_at: record.requestedAt
    })),
    candidate_relationships: (candidateSnapshot.candidateRelationships || []).map((candidate) => ({
      id: candidate.id,
      source_entity_id: candidate.sourceEntityId,
      source_candidate_entity_id: candidate.sourceCandidateEntityId || candidate.payload?.sourceCandidateEntityId || "",
      source_entity_name: displayEntityName(
        candidate.sourceEntityId,
        candidate.sourceCandidateEntityId || candidate.payload?.sourceCandidateEntityId,
        candidate.payload?.sourceCandidateName
      ),
      target_entity_id: candidate.targetEntityId,
      target_candidate_entity_id: candidate.targetCandidateEntityId || candidate.payload?.targetCandidateEntityId || "",
      target_entity_name: displayEntityName(
        candidate.targetEntityId,
        candidate.targetCandidateEntityId || candidate.payload?.targetCandidateEntityId,
        candidate.payload?.targetCandidateName
      ),
      relation_type: candidate.relationType,
      confidence: candidate.confidence,
      evidence_url: candidate.evidenceUrl,
      extraction_method: candidate.extractionMethod,
      status: candidate.status,
      raw_document_id: candidate.payload?.rawDocumentId || "",
      parsed_document_id: candidate.payload?.parsedDocumentId || "",
      extraction_record_id: candidate.payload?.extractionRecordId || "",
      created_at: candidate.createdAt
    })),
    candidate_entities: (candidateSnapshot.candidateEntities || []).map((candidate) => ({
      id: candidate.id,
      entity_id: candidate.entityId,
      entity_name: entityById.get(candidate.entityId)?.name || candidate.name || candidate.entityId,
      type: candidate.type,
      layer: candidate.layer,
      status_text: candidate.statusText,
      country: candidate.country || "",
      website_url: candidate.websiteUrl || "",
      alias_count: candidate.aliases?.length || 0,
      confidence: candidate.confidence,
      evidence_url: candidate.evidenceUrl,
      extraction_method: candidate.extractionMethod,
      status: candidate.status,
      qid: candidate.payload?.qid || "",
      created_at: candidate.createdAt
    })),
    candidate_metrics: (candidateSnapshot.candidateMetrics || []).map((candidate) => ({
      id: candidate.id,
      entity_id: candidate.entityId,
      entity_name: entityById.get(candidate.entityId)?.name || candidate.entityId,
      metric_type: candidate.metricType,
      value_number: candidate.valueNumber ?? "",
      value_text: candidate.valueText ?? "",
      as_of_date: candidate.asOfDate,
      source_id: candidate.sourceId || "",
      source_ref: candidate.sourceRef || "",
      confidence: candidate.confidence,
      evidence_url: candidate.evidenceUrl,
      extraction_method: candidate.extractionMethod,
      status: candidate.status,
      raw_document_id: candidate.payload?.rawDocumentId || "",
      parsed_document_id: candidate.payload?.parsedDocumentId || "",
      extraction_record_id: candidate.payload?.extractionRecordId || "",
      created_at: candidate.createdAt
    })),
    candidate_snapshot_archives: (candidateSnapshotManifest.archives || []).map((archive) => ({
      id: archive.id,
      file: archive.file,
      content_hash: archive.contentHash,
      archived_at: archive.archivedAt,
      snapshot_generated_at: archive.snapshotGeneratedAt,
      source_snapshot_generated_at: archive.sourceSnapshotGeneratedAt,
      candidate_relationships: archive.counts?.candidateRelationships || 0,
      candidate_entities: archive.counts?.candidateEntities || 0,
      candidate_metrics: archive.counts?.candidateMetrics || 0,
      retry_backlog: archive.counts?.retryBacklog || 0
    })),
    wikidata_profiles: (wikidataSnapshot.results || []).map((profile) => ({
      id: profile.id,
      entity_id: profile.entityId,
      entity_name: profile.entityName,
      qid: profile.qid,
      label: profile.label,
      country: profile.country || "",
      official_website: profile.officialWebsite || "",
      alias_count: profile.aliases?.length || 0,
      inception_year: profile.inceptionYear || "",
      confidence: profile.confidence,
      wikidata_url: profile.wikidataUrl,
      fetched_at: profile.fetchedAt
    })),
    openalex_works: (openAlexWorksSnapshot.results || []).flatMap((result) =>
      (result.works || []).map((work) => ({
        result_id: result.id,
        entity_id: result.entityId,
        entity_name: entityById.get(result.entityId)?.name || result.entityId,
        query: result.query,
        work_id: work.id,
        title: work.title,
        publication_year: work.publicationYear || "",
        cited_by_count: work.citedByCount || 0,
        type: work.type || "",
        source_name: work.sourceName || "",
        openalex_url: work.openAlexUrl,
        doi: work.doi || "",
        author_count: work.authorships?.length || 0,
        institution_count: (work.authorships || []).reduce((total, authorship) => total + (authorship.institutions?.length || 0), 0),
        fetched_at: result.fetchedAt
      }))
    ),
    arxiv_papers: (arxivPapersSnapshot.results || []).flatMap((result) =>
      (result.papers || []).map((paper) => ({
        result_id: result.id,
        entity_id: result.entityId,
        entity_name: entityById.get(result.entityId)?.name || result.entityId,
        query: result.query,
        paper_id: paper.id,
        title: paper.title,
        published: paper.published || "",
        updated: paper.updated || "",
        category_count: paper.categories?.length || 0,
        author_count: paper.authors?.length || 0,
        arxiv_url: paper.arxivUrl,
        pdf_url: paper.pdfUrl || "",
        fetched_at: result.fetchedAt
      }))
    ),
    snapshot_summary: [
      {
        generated_at: snapshot.generatedAt,
        entities: snapshot.counts.entities,
        relationships: snapshot.counts.relationships,
        sources: snapshot.counts.sources,
        approved_metric_groups: snapshot.counts.approvedMetricGroups,
        retry_backlog: snapshot.counts.retryBacklog,
        evidence_backlog: snapshot.counts.evidenceBacklog,
        candidate_snapshot_archives: snapshot.counts.candidateSnapshotArchives,
        connector_runs: snapshot.counts.connectorRuns,
        raw_documents: snapshot.counts.rawDocuments,
        parsed_documents: snapshot.counts.parsedDocuments,
        structured_parsed_documents: snapshot.counts.structuredParsedDocuments,
        parsed_facts: snapshot.counts.parsedFacts,
        extraction_records: snapshot.counts.extractionRecords,
        extracted_documents: snapshot.counts.extractedDocuments,
        llm_extraction_records: snapshot.counts.llmExtractionRecords,
        llm_completed_records: snapshot.counts.llmCompletedRecords,
        wikidata_profiles: snapshot.counts.wikidataProfiles,
        openalex_work_sets: snapshot.counts.openAlexWorkSets,
        openalex_works: snapshot.counts.openAlexWorks,
        arxiv_paper_sets: snapshot.counts.arxivPaperSets,
        arxiv_papers: snapshot.counts.arxivPapers,
        candidate_relationships: snapshot.counts.candidateRelationships,
        candidate_entities: snapshot.counts.candidateEntities,
        candidate_metrics: snapshot.counts.candidateMetrics
      }
    ]
  };
}

const candidateSnapshot = await readJsonIfExists(candidateSnapshotPath, {
  generatedAt: null,
  candidateRelationships: [],
  candidateEntities: [],
  candidateMetrics: [],
  retryBacklog: []
});
const candidateSnapshotManifest = await readJsonIfExists(candidateSnapshotManifestPath, {
  generatedAt: null,
  latestArchiveId: null,
  archives: []
});
const evidenceBacklog = await readJsonIfExists(evidenceBacklogPath, { generatedAt: null, relationships: [] });
const workerRun = await readJsonIfExists(workerRunPath, { generatedAt: null, runs: [] });
const rawDocumentBundle = await readJsonIfExists(rawDocumentsPath, { generatedAt: null, documents: [] });
const parsedDocumentBundle = await readJsonIfExists(parsedDocumentsPath, { generatedAt: null, documents: [], summary: {} });
const extractionBundle = await readJsonIfExists(extractionCandidatesPath, {
  generatedAt: null,
  records: [],
  summary: {}
});
const llmBundle = await readJsonIfExists(llmExtractionsPath, {
  generatedAt: null,
  records: [],
  summary: {}
});
const wikidataSnapshot = await readJsonIfExists(wikidataProfilesPath, { generatedAt: null, results: [], errors: [] });
const openAlexWorksSnapshot = await readJsonIfExists(openAlexWorksPath, { generatedAt: null, results: [], errors: [] });
const arxivPapersSnapshot = await readJsonIfExists(arxivPapersPath, { generatedAt: null, results: [], errors: [] });

const graphSnapshot = buildGraphSnapshot(
  candidateSnapshot,
  candidateSnapshotManifest,
  evidenceBacklog,
  workerRun,
  rawDocumentBundle,
  parsedDocumentBundle,
  extractionBundle,
  llmBundle,
  wikidataSnapshot,
  openAlexWorksSnapshot,
  arxivPapersSnapshot
);
const timeline = buildTimeline(candidateSnapshot, evidenceBacklog, workerRun, rawDocumentBundle, parsedDocumentBundle, extractionBundle, llmBundle);
const exports = exportRows(
  graphSnapshot,
  candidateSnapshot,
  candidateSnapshotManifest,
  rawDocumentBundle,
  parsedDocumentBundle,
  extractionBundle,
  llmBundle,
  wikidataSnapshot,
  openAlexWorksSnapshot,
  arxivPapersSnapshot
);

await fs.mkdir(researchDir, { recursive: true });
await fs.mkdir(exportDir, { recursive: true });

await fs.writeFile(new URL("graph-snapshot.json", researchDir), `${JSON.stringify(graphSnapshot, null, 2)}\n`);
await fs.writeFile(new URL("timeline.json", researchDir), `${JSON.stringify(timeline, null, 2)}\n`);
await fs.writeFile(new URL("entities.csv", exportDir), `${toCsv(exports.entities, ["id", "name", "type", "layer", "status", "country", "website_url", "valuation"])}\n`);
await fs.writeFile(
  new URL("relationships.csv", exportDir),
  `${toCsv(exports.relationships, [
    "id",
    "source",
    "source_name",
    "target",
    "target_name",
    "type",
    "confidence",
    "source_id",
    "evidence_title",
    "evidence_url",
    "evidence_strength",
    "review_status",
    "review_note",
    "note"
  ])}\n`
);
await fs.writeFile(new URL("metrics.csv", exportDir), `${toCsv(exports.metrics, ["entity_id", "entity_name", "source", "source_ref", "as_of", "metric_type", "value"])}\n`);
await fs.writeFile(
  new URL("raw-documents.csv", exportDir),
  `${toCsv(exports.raw_documents, ["id", "entity_id", "entity_name", "connector", "title", "url", "content_type", "parse_status", "content_hash", "fetched_at"])}\n`
);
await fs.writeFile(
  new URL("parsed-documents.csv", exportDir),
  `${toCsv(exports.parsed_documents, [
    "id",
    "raw_document_id",
    "entity_id",
    "entity_name",
    "connector",
    "format",
    "parser_status",
    "text_length",
    "fact_count",
    "hint_count",
    "canonical_url",
    "parsed_at"
  ])}\n`
);
await fs.writeFile(
  new URL("extraction-records.csv", exportDir),
  `${toCsv(exports.extraction_records, [
    "id",
    "raw_document_id",
    "parsed_document_id",
    "entity_id",
    "entity_name",
    "connector",
    "status",
    "parser_status",
    "parsed_format",
    "extraction_method",
    "relationship_count",
    "metric_count",
    "evidence_url",
    "extracted_at"
  ])}\n`
);
await fs.writeFile(
  new URL("candidate-relationships.csv", exportDir),
  `${toCsv(exports.candidate_relationships, [
    "id",
    "source_entity_id",
    "source_candidate_entity_id",
    "source_entity_name",
    "target_entity_id",
    "target_candidate_entity_id",
    "target_entity_name",
    "relation_type",
    "confidence",
    "evidence_url",
    "extraction_method",
    "status",
    "raw_document_id",
    "parsed_document_id",
    "extraction_record_id",
    "created_at"
  ])}\n`
);
await fs.writeFile(
  new URL("llm-extractions.csv", exportDir),
  `${toCsv(exports.llm_extractions, [
    "id",
    "extraction_record_id",
    "raw_document_id",
    "parsed_document_id",
    "entity_id",
    "entity_name",
    "provider",
    "model",
    "status",
    "relationship_count",
    "metric_count",
    "entity_count",
    "evidence_url",
    "requested_at"
  ])}\n`
);
await fs.writeFile(
  new URL("candidate-metrics.csv", exportDir),
  `${toCsv(exports.candidate_metrics, [
    "id",
    "entity_id",
    "entity_name",
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
    "raw_document_id",
    "parsed_document_id",
    "extraction_record_id",
    "created_at"
  ])}\n`
);
await fs.writeFile(
  new URL("candidate-entities.csv", exportDir),
  `${toCsv(exports.candidate_entities, [
    "id",
    "entity_id",
    "entity_name",
    "type",
    "layer",
    "status_text",
    "country",
    "website_url",
    "alias_count",
    "confidence",
    "evidence_url",
    "extraction_method",
    "status",
    "qid",
    "created_at"
  ])}\n`
);
await fs.writeFile(
  new URL("wikidata-profiles.csv", exportDir),
  `${toCsv(exports.wikidata_profiles, [
    "id",
    "entity_id",
    "entity_name",
    "qid",
    "label",
    "country",
    "official_website",
    "alias_count",
    "inception_year",
    "confidence",
    "wikidata_url",
    "fetched_at"
  ])}\n`
);
await fs.writeFile(
  new URL("openalex-works.csv", exportDir),
  `${toCsv(exports.openalex_works, [
    "result_id",
    "entity_id",
    "entity_name",
    "query",
    "work_id",
    "title",
    "publication_year",
    "cited_by_count",
    "type",
    "source_name",
    "openalex_url",
    "doi",
    "author_count",
    "institution_count",
    "fetched_at"
  ])}\n`
);
await fs.writeFile(
  new URL("arxiv-papers.csv", exportDir),
  `${toCsv(exports.arxiv_papers, [
    "result_id",
    "entity_id",
    "entity_name",
    "query",
    "paper_id",
    "title",
    "published",
    "updated",
    "category_count",
    "author_count",
    "arxiv_url",
    "pdf_url",
    "fetched_at"
  ])}\n`
);
await fs.writeFile(
  new URL("candidate-snapshot-archives.csv", exportDir),
  `${toCsv(exports.candidate_snapshot_archives, [
    "id",
    "file",
    "content_hash",
    "archived_at",
    "snapshot_generated_at",
    "source_snapshot_generated_at",
    "candidate_relationships",
    "candidate_entities",
    "candidate_metrics",
    "retry_backlog"
  ])}\n`
);
await fs.writeFile(
  new URL("snapshot-summary.csv", exportDir),
  `${toCsv(exports.snapshot_summary, [
    "generated_at",
    "entities",
    "relationships",
    "sources",
    "approved_metric_groups",
    "retry_backlog",
    "evidence_backlog",
    "candidate_snapshot_archives",
    "connector_runs",
    "raw_documents",
    "parsed_documents",
    "structured_parsed_documents",
    "parsed_facts",
    "extraction_records",
    "extracted_documents",
    "llm_extraction_records",
    "llm_completed_records",
    "wikidata_profiles",
    "openalex_work_sets",
    "openalex_works",
    "arxiv_paper_sets",
    "arxiv_papers",
    "candidate_relationships",
    "candidate_entities",
    "candidate_metrics"
  ])}\n`
);

console.log(
  JSON.stringify(
    {
      graphSnapshot: graphSnapshot.counts,
      timelineEvents: timeline.events.length,
      exports: {
        entities: exports.entities.length,
        relationships: exports.relationships.length,
        metrics: exports.metrics.length,
        rawDocuments: exports.raw_documents.length,
        parsedDocuments: exports.parsed_documents.length,
        extractionRecords: exports.extraction_records.length,
        llmExtractions: exports.llm_extractions.length,
        candidateRelationships: exports.candidate_relationships.length,
        candidateEntities: exports.candidate_entities.length,
        candidateMetrics: exports.candidate_metrics.length,
        wikidataProfiles: exports.wikidata_profiles.length,
        openAlexWorks: exports.openalex_works.length,
        arxivPapers: exports.arxiv_papers.length,
        candidateSnapshotArchives: exports.candidate_snapshot_archives.length
      }
    },
    null,
    2
  )
);
