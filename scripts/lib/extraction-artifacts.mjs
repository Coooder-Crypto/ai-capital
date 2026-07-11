import { stableId } from "./structured-parser.mjs";

function compactText(value, maxLength = 1800) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function documentText(document, parsedDocument) {
  if (parsedDocument?.text) return compactText(parsedDocument.text);
  const payload = document.payload || {};
  return compactText([payload.title, payload.textPreview, payload.body, payload.note].filter(Boolean).join(" "));
}

function structuredContext(parsedDocument) {
  if (!parsedDocument) return "";
  const sections = (parsedDocument.sections || [])
    .slice(0, 5)
    .map((section) => `${section.heading}: ${compactText(section.text, 360)}`)
    .join("\n");
  const links = (parsedDocument.links || [])
    .slice(0, 8)
    .map((link) => `${link.text || "link"} -> ${link.url}`)
    .join("\n");
  const facts = (parsedDocument.facts || [])
    .slice(0, 12)
    .map((fact) => `${fact.type}: ${fact.value} (${compactText(fact.context, 160)})`)
    .join("\n");
  return [
    sections ? `Structured sections:\n${sections}` : "",
    links ? `Evidence links:\n${links}` : "",
    facts ? `Extracted facts:\n${facts}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function sourceIdForDocument(document) {
  const byConnector = {
    openalex: "src_openalex",
    github: "src_github",
    huggingface: "src_hf",
    sec: "src_sec"
  };
  return byConnector[String(document.connector || "").toLowerCase()] || document.sourceId || "src_manual";
}

function financialFactMetrics(document, parsedDocument, generatedAt) {
  return (parsedDocument?.facts || [])
    .filter((fact) => String(fact.type || "").startsWith("financial_") && fact.metricType && fact.value)
    .map((fact) => ({
      entityId: document.entityId,
      metricType: fact.metricType,
      valueNumber: null,
      valueText: String(fact.value),
      asOfDate: String(document.fetchedAt || generatedAt).slice(0, 10),
      sourceId: sourceIdForDocument(document),
      sourceRef: document.url,
      confidence: 0.62,
      evidenceUrl: document.url,
      note: `Parsed ${fact.metricType} from ${parsedDocument?.format || "document"} evidence: ${compactText(fact.context, 180)}`
    }));
}

function uniqueMetricsByType(metrics) {
  const byType = new Map();
  for (const metric of metrics || []) {
    if (!metric?.metricType) continue;
    const existing = byType.get(metric.metricType);
    const hasConcreteValue = metric.valueNumber !== null && metric.valueNumber !== undefined || Boolean(metric.valueText && metric.valueText !== "review_required");
    const existingHasConcreteValue =
      existing && (existing.valueNumber !== null && existing.valueNumber !== undefined || Boolean(existing.valueText && existing.valueText !== "review_required"));
    if (!existing || (hasConcreteValue && !existingHasConcreteValue)) {
      byType.set(metric.metricType, metric);
    }
  }
  return [...byType.values()];
}

export function mergeById(existing, incoming) {
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

export function replaceWorkerGeneratedForWatchlists(existing, incoming, watchlistIds, idPrefix) {
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

export function llmPrompt(document, parsedDocument, watchlistItem) {
  return [
    "Extract only AI industry-chain entities, relationships, and metrics that are directly supported by the evidence.",
    "Return JSON with keys: relationships[], metrics[], entities[].",
    "Each relationship must include sourceEntityId, targetEntityId, relationType, confidence, evidenceUrl, and note.",
    "Each metric must include entityId, metricType, valueNumber or valueText, asOfDate, sourceRef, confidence, evidenceUrl, and note.",
    "Do not infer beyond the document. If evidence is weak, lower confidence or return no item.",
    "",
    `Known source entity: ${watchlistItem?.entityId || document.entityId}`,
    `Document title: ${document.title}`,
    `Document URL: ${document.url}`,
    `Content hash: ${document.contentHash}`,
    `Parsed format: ${parsedDocument?.format || "raw"}`,
    `Parser status: ${parsedDocument?.parserStatus || document.parseStatus}`,
    `Text preview: ${documentText(document, parsedDocument)}`,
    structuredContext(parsedDocument)
  ].join("\n");
}

export function validateExtractionInputs(documents, watchlist, seed) {
  const entityIds = new Set(seed.entities.map((entity) => entity.id));
  const relationTypes = new Set(Object.keys(seed.relationLabels));
  const errors = [];
  const watchlistById = new Map(watchlist.map((item) => [item.id, item]));

  for (const document of documents) {
    if (!document.id) errors.push("raw document missing id");
    if (document.entityId && !entityIds.has(document.entityId)) {
      errors.push(`${document.id} references unknown entityId: ${document.entityId}`);
    }

    const watchlistItem = watchlistById.get(document.payload?.watchlistId);
    if (!watchlistItem) {
      errors.push(`${document.id} references unknown watchlistId: ${document.payload?.watchlistId || "missing"}`);
      continue;
    }

    for (const hint of watchlistItem.extractionHints || []) {
      if (hint.targetEntityId && !entityIds.has(hint.targetEntityId)) {
        errors.push(`${watchlistItem.id} references unknown targetEntityId: ${hint.targetEntityId}`);
      }
      if (hint.relationType && !relationTypes.has(hint.relationType)) {
        errors.push(`${watchlistItem.id} has unknown relationType: ${hint.relationType}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
}

export function buildExtractionRecords(
  documents,
  parsedDocuments,
  watchlist,
  generatedAt,
  extractionMethod = "raw_document_heuristic"
) {
  const watchlistById = new Map(watchlist.map((item) => [item.id, item]));
  const parsedByRawDocumentId = new Map((parsedDocuments || []).map((document) => [document.rawDocumentId, document]));

  return documents.map((document) => {
    const watchlistItem = watchlistById.get(document.payload?.watchlistId);
    const parsedDocument = parsedByRawDocumentId.get(document.id);
    const parsed = document.parseStatus === "parsed" && (!parsedDocument || parsedDocument.parserStatus === "parsed");
    const extractionHints = parsed ? parsedDocument?.extractionHints || watchlistItem?.extractionHints || [] : [];
    const relationships = extractionHints
      .filter((hint) => hint.targetEntityId && hint.relationType)
      .map((hint) => ({
        sourceEntityId: document.entityId,
        targetEntityId: hint.targetEntityId,
        relationType: hint.relationType,
        confidence: Number((hint.confidence ?? 0.5).toFixed(3)),
        evidenceUrl: document.url,
        note: hint.note || `Candidate extracted from ${document.title}`
      }));
    const hintMetrics = extractionHints
      .filter((hint) => hint.metricType)
      .map((hint) => ({
        entityId: document.entityId,
        metricType: hint.metricType,
        valueNumber: null,
        valueText: "review_required",
        asOfDate: generatedAt.slice(0, 10),
        sourceId: sourceIdForDocument(document),
        sourceRef: document.url,
        confidence: Number((hint.confidence ?? 0.5).toFixed(3)),
        evidenceUrl: document.url,
        note: hint.note || `Candidate metric extracted from ${document.title}`
      }));
    const metrics = uniqueMetricsByType([...financialFactMetrics(document, parsedDocument, generatedAt), ...hintMetrics]);

    return {
      id: stableId("extract", document.id),
      rawDocumentId: document.id,
      watchlistId: watchlistItem?.id || document.payload?.watchlistId || null,
      entityId: document.entityId,
      connector: document.connector,
      status: parsed ? "extracted" : "skipped",
      extractionMethod,
      extractedAt: generatedAt,
      contentHash: document.contentHash,
      parsedDocumentId: parsedDocument?.id || null,
      parserStatus: parsedDocument?.parserStatus || document.parseStatus,
      parsedFormat: parsedDocument?.format || null,
      evidenceUrl: document.url,
      prompt: llmPrompt(document, parsedDocument, watchlistItem),
      relationships,
      metrics,
      entities: [],
      quality: {
        hasEvidenceUrl: Boolean(document.url),
        sourceParsed: parsed,
        parsedTextLength: parsedDocument?.quality?.textLength || documentText(document, parsedDocument).length,
        parsedSectionCount: parsedDocument?.quality?.sectionCount || 0,
        parsedLinkCount: parsedDocument?.quality?.linkCount || 0,
        parsedFactCount: parsedDocument?.quality?.factCount || 0,
        rssItemCount: parsedDocument?.quality?.rssItemCount || 0,
        tableRowCount: parsedDocument?.quality?.tableRowCount || 0,
        relationshipCount: relationships.length,
        metricCount: metrics.length,
        requiresHumanReview: relationships.length + metrics.length > 0
      }
    };
  });
}

export function buildCandidateRelationships(
  records,
  watchlistById,
  generatedAt,
  extractionMethod = "raw_document_heuristic"
) {
  return records.flatMap((record) => {
    const watchlistItem = watchlistById.get(record.watchlistId);
    if (record.status !== "extracted") return [];

    return record.relationships.map((relationship) => ({
      id: stableId(
        "worker_candidate",
        record.watchlistId,
        relationship.sourceEntityId,
        relationship.targetEntityId,
        relationship.relationType
      ),
      sourceEntityId: relationship.sourceEntityId,
      targetEntityId: relationship.targetEntityId,
      relationType: relationship.relationType,
      confidence: relationship.confidence,
      evidenceUrl: relationship.evidenceUrl,
      extractionMethod,
      status: "candidate",
      payload: {
        note: relationship.note,
        sourceId: watchlistItem?.sourceId || "src_manual",
        watchlistId: record.watchlistId,
        rawDocumentId: record.rawDocumentId,
        extractionRecordId: record.id,
        parsedDocumentId: record.parsedDocumentId,
        rawDocumentContentHash: record.contentHash,
        sourceType: watchlistItem?.sourceType,
        title: watchlistItem?.title,
        cadence: watchlistItem?.cadence
      },
      createdAt: generatedAt
    }));
  });
}

export function buildCandidateMetrics(records, watchlistById, generatedAt, extractionMethod = "raw_document_heuristic") {
  return records.flatMap((record) => {
    const watchlistItem = watchlistById.get(record.watchlistId);
    if (record.status !== "extracted") return [];

    return record.metrics.map((metric) => ({
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
      extractionMethod,
      status: "candidate",
      payload: {
        note: metric.note,
        watchlistId: record.watchlistId,
        rawDocumentId: record.rawDocumentId,
        extractionRecordId: record.id,
        parsedDocumentId: record.parsedDocumentId,
        rawDocumentContentHash: record.contentHash,
        sourceType: watchlistItem?.sourceType,
        title: watchlistItem?.title
      },
      createdAt: generatedAt
    }));
  });
}
