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
const connectorsPath = new URL("data/connectors.json", root);
const snapshotPath = new URL("data/free-metrics.snapshot.json", root);
const candidateOutputPath = new URL("data/candidate-snapshot.json", root);
const evidenceBacklogPath = new URL("data/evidence-backlog.json", root);
const wikidataSnapshotPath = new URL("data/wikidata-profiles.snapshot.json", root);
const openAlexWorksSnapshotPath = new URL("data/openalex-works.snapshot.json", root);
const arxivPapersSnapshotPath = new URL("data/arxiv-papers.snapshot.json", root);

const args = new Set(process.argv.slice(2));
const shouldWrite = !args.has("--dry-run");
const limitArg = process.argv.find((arg) => arg.startsWith("--evidence-limit="));
const evidenceLimit = Number(limitArg?.split("=")[1] || 50);

const connectors = JSON.parse(await fs.readFile(connectorsPath, "utf8"));

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

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function normalizeTextKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeDoi(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:\s*/, "")
    .replace(/\s+/g, "");
}

function normalizeOpenAlexWorkId(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/openalex\.org\//i, "")
    .toUpperCase();
}

function normalizeArxivId(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const withoutUrl = raw
    .replace(/^https?:\/\/arxiv\.org\/abs\//, "")
    .replace(/^https?:\/\/arxiv\.org\/pdf\//, "")
    .replace(/\.pdf$/, "")
    .replace(/^arxiv:/, "");
  const doiMatch = withoutUrl.match(/10\.48550\/arxiv\.([^/?#]+)/);
  const id = doiMatch ? doiMatch[1] : withoutUrl.split(/[?#]/)[0];
  const withoutVersion = id.replace(/v\d+$/, "");
  if (/^\d{4}\.\d{4,5}$/.test(withoutVersion)) return withoutVersion;
  if (/^[a-z-]+(?:\.[a-z-]+)?\/\d{7}$/.test(withoutVersion)) return withoutVersion;
  return "";
}

function validAuthorName(value) {
  const normalized = normalizeTextKey(value);
  if (!normalized || normalized.length < 2) return false;
  if (["and", "et al", "anonymous", "unknown", "none", "na", "n a"].includes(normalized)) return false;
  return /[a-z]/.test(normalized);
}

function paperDedupKeys({ source, openAlexWorkId, doi, arxivPaperId, title }) {
  const normalizedOpenAlexWorkId = normalizeOpenAlexWorkId(openAlexWorkId);
  const normalizedDoi = normalizeDoi(doi);
  const normalizedArxivPaperId = normalizeArxivId(arxivPaperId || doi);
  const normalizedTitleKey = normalizeTextKey(title);
  return uniqueStrings([
    normalizedOpenAlexWorkId ? `openalex:${normalizedOpenAlexWorkId.toLowerCase()}` : "",
    normalizedDoi ? `doi:${normalizedDoi}` : "",
    normalizedArxivPaperId ? `arxiv:${normalizedArxivPaperId}` : "",
    normalizedTitleKey ? `title:${normalizedTitleKey}` : "",
    source && normalizedTitleKey ? `source:${source}:title:${normalizedTitleKey}` : ""
  ]);
}

function authorDedupKeys({ source, authorId, authorName }) {
  const normalizedAuthorName = normalizeTextKey(authorName);
  return uniqueStrings([
    authorId ? `openalex_author:${String(authorId).toLowerCase()}` : "",
    normalizedAuthorName ? `author_name:${normalizedAuthorName}` : "",
    source && normalizedAuthorName ? `source:${source}:author_name:${normalizedAuthorName}` : ""
  ]);
}

function metricSourceName(source) {
  if (source === "huggingFace") return "huggingface";
  if (source === "openAlex") return "openalex";
  return source;
}

function sourceIdFor(source) {
  return {
    github: "src_github",
    huggingFace: "src_hf",
    huggingface: "src_hf",
    sec: "src_sec",
    openAlex: "src_openalex",
    openalex: "src_openalex",
    arxiv: "src_arxiv"
  }[source];
}

function sourceNameForSourceId(sourceId) {
  return {
    src_github: "github",
    src_hf: "huggingface",
    src_sec: "sec",
    src_openalex: "openalex",
    src_arxiv: "arxiv",
    src_wikidata: "wikidata"
  }[sourceId] || sourceId;
}

function approvedMetricSourcePairs() {
  return new Set((metricBundle.metrics || []).map((group) => `${group.entityId}|${metricSourceName(group.source)}`));
}

function sourceRefFor(result) {
  return result.repo || result.model || result.cik || result.query || "unknown";
}

function endpointFor(source, itemOrResult) {
  if (source === "github") return `https://api.github.com/repos/${itemOrResult.repo}`;
  if (source === "huggingFace") return `https://huggingface.co/api/models/${itemOrResult.model}`;
  if (source === "sec") {
    return `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(itemOrResult.cik).padStart(10, "0")}.json`;
  }
  if (source === "openAlex") {
    return `https://api.openalex.org/works?search=${encodeURIComponent(itemOrResult.query)}&per-page=5&mailto=research@example.com`;
  }
  if (source === "arxiv") {
    const url = new URL("https://export.arxiv.org/api/query");
    url.searchParams.set("search_query", itemOrResult.query);
    url.searchParams.set("start", "0");
    url.searchParams.set("max_results", "3");
    url.searchParams.set("sortBy", itemOrResult.sortBy || "relevance");
    url.searchParams.set("sortOrder", itemOrResult.sortOrder || "descending");
    return String(url);
  }
  return "";
}

function evidenceUrlFor(result) {
  if (result.repo) return `https://github.com/${result.repo}`;
  if (result.model) return `https://huggingface.co/${result.model}`;
  if (result.cik) return endpointFor("sec", result);
  if (result.metrics?.topWorkUrl) return result.metrics.topWorkUrl;
  if (result.query) return endpointFor("openAlex", result);
  return undefined;
}

function confidenceFor(source) {
  return {
    github: 0.78,
    huggingFace: 0.72,
    sec: 0.88,
    openAlex: 0.68
  }[source] || 0.65;
}

function metricKey(entityId, source, sourceRef, asOf, metricType, value) {
  return [
    entityId,
    metricSourceName(source),
    sourceRef,
    asOf,
    metricType,
    value === null || value === undefined ? "" : String(value)
  ].join("|");
}

function approvedMetricKeys() {
  const keys = new Set();
  for (const group of metricBundle.metrics || []) {
    const sourceRef = group.sourceRef || "unknown";
    for (const [metricType, value] of Object.entries(group.metrics || {})) {
      keys.add(metricKey(group.entityId, group.source, sourceRef, group.asOf, metricType, value));
    }
  }
  return keys;
}

function plannedRequests() {
  return [
    ...(connectors.github || []).map((item) => ({
      source: "github",
      entityId: item.entityId,
      url: endpointFor("github", item)
    })),
    ...(connectors.huggingFace || []).map((item) => ({
      source: "huggingFace",
      entityId: item.entityId,
      url: endpointFor("huggingFace", item)
    })),
    ...(connectors.sec || []).map((item) => ({
      source: "sec",
      entityId: item.entityId,
      url: endpointFor("sec", item)
    })),
    ...(connectors.openAlex || []).map((item) => ({
      source: "openAlex",
      entityId: item.entityId,
      url: endpointFor("openAlex", item)
    })),
    ...(connectors.arxiv || []).map((item) => ({
      source: "arxiv",
      entityId: item.entityId,
      url: endpointFor("arxiv", item)
    }))
  ];
}

function mergeById(existing, incoming) {
  const merged = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    if (!item?.id) continue;
    merged.set(item.id, item);
  }
  return [...merged.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function buildCandidateMetrics(snapshot) {
  const approvedKeys = approvedMetricKeys();
  const candidates = [];

  for (const result of snapshot.results || []) {
    const sourceRef = sourceRefFor(result);
    const evidenceUrl = evidenceUrlFor(result);
    const sourceId = sourceIdFor(result.source);

    for (const [metricType, value] of Object.entries(result.metrics || {})) {
      if (value === null || value === undefined) continue;

      const key = metricKey(result.entityId, result.source, sourceRef, result.asOf, metricType, value);
      if (approvedKeys.has(key)) continue;

      const isNumber = typeof value === "number";
      candidates.push({
        id: stableId("candidate_metric", result.entityId, result.source, sourceRef, result.asOf, metricType),
        entityId: result.entityId,
        metricType,
        valueNumber: isNumber ? value : null,
        valueText: isNumber ? null : String(value),
        asOfDate: String(result.asOf || snapshot.generatedAt || "").slice(0, 10),
        sourceId,
        sourceRef,
        confidence: confidenceFor(result.source),
        evidenceUrl,
        extractionMethod: "free_metrics_snapshot",
        status: "candidate",
        payload: {
          rawSource: result.source,
          snapshotGeneratedAt: snapshot.generatedAt,
          note: "Generated from free metrics snapshot; review source, freshness and metric meaning before approval."
        },
        createdAt: new Date().toISOString()
      });
    }
  }

  return candidates;
}

function buildRetryBacklog(snapshot) {
  const requestBySourceAndEntity = new Map(plannedRequests().map((request) => [`${request.source}:${request.entityId}`, request]));
  const approvedPairs = approvedMetricSourcePairs();

  return (snapshot.errors || [])
    .filter((error) => !approvedPairs.has(`${error.entityId}|${metricSourceName(error.source)}`))
    .map((error) => {
      const request = requestBySourceAndEntity.get(`${error.source}:${error.entityId}`);
      return {
        id: stableId("retry", error.source, error.entityId),
        source: error.source,
        entityId: error.entityId,
        entityName: seed.entities.find((entity) => entity.id === error.entityId)?.name || error.entityId,
        endpoint: request?.url || "",
        message: error.message,
        nextAction: "retry_fetch_then_review_snapshot",
        createdAt: new Date().toISOString()
      };
    });
}

function buildCandidateEntitiesFromWikidata(wikidataSnapshot) {
  return (wikidataSnapshot.results || []).map((result) => {
    const currentEntity = seed.entities.find((entity) => entity.id === result.entityId);
    const mergedAliases = [
      result.label,
      ...(result.aliases || []),
      ...(currentEntity?.aliases || [])
    ]
      .filter(Boolean)
      .filter((alias, index, rows) => rows.findIndex((item) => item.toLowerCase() === alias.toLowerCase()) === index)
      .slice(0, 12);

    return {
      id: stableId("candidate_entity_wikidata", result.entityId),
      entityId: result.entityId,
      type: currentEntity?.type || "company",
      name: currentEntity?.name || result.label,
      layer: currentEntity?.layer || "application",
      description: currentEntity?.description || result.description || `Profile candidate from Wikidata ${result.qid}.`,
      websiteUrl: result.officialWebsite || currentEntity?.website_url,
      country: result.country || currentEntity?.country,
      statusText: currentEntity?.status || "unknown",
      valuation: currentEntity?.valuation || "Unknown",
      aliases: mergedAliases,
      confidence: Number((result.confidence ?? 0.7).toFixed(3)),
      evidenceUrl: result.wikidataUrl,
      extractionMethod: "wikidata_profile_snapshot",
      status: "candidate",
      payload: {
        note: "Wikidata profile enrichment candidate; review aliases, website, country and description before approving entity update.",
        qid: result.qid,
        wikidataUrl: result.wikidataUrl,
        sourceId: result.sourceId || "src_wikidata",
        label: result.label,
        description: result.description,
        inceptionYear: result.inceptionYear,
        snapshotGeneratedAt: wikidataSnapshot.generatedAt
      },
      createdAt: new Date().toISOString()
    };
  });
}

function workEntityId(work) {
  return stableId("paper_openalex", work.id || work.openAlexUrl);
}

function arxivPaperEntityId(paper) {
  return stableId("paper_arxiv", paper.id || paper.arxivUrl);
}

function institutionEntityId(institution) {
  return stableId("research_org_openalex", institution.id || institution.ror || institution.displayName);
}

function openAlexAuthorEntityId(authorship) {
  return stableId("research_author_openalex", authorship.authorId || normalizeTextKey(authorship.authorName));
}

function arxivAuthorEntityId(authorName) {
  return stableId("research_author_arxiv", normalizeTextKey(authorName));
}

function referencedWorkEntityId(workId) {
  return stableId("paper_openalex", workId);
}

function buildCandidateEntitiesFromOpenAlex(openAlexWorksSnapshot) {
  const candidates = [];
  const institutionMap = new Map();
  const authorMap = new Map();
  const referencedWorkMap = new Map();

  for (const result of openAlexWorksSnapshot.results || []) {
    const associatedEntity = seed.entities.find((entity) => entity.id === result.entityId);
    for (const work of result.works || []) {
      if (!work.id && !work.openAlexUrl) continue;
      const evidenceUrl = work.openAlexUrl || work.landingPageUrl;
      const title = work.title || `OpenAlex work ${work.id}`;
      const normalizedOpenAlexWorkId = normalizeOpenAlexWorkId(work.id || work.openAlexUrl);
      const normalizedDoi = normalizeDoi(work.doi);
      const normalizedArxivPaperId = normalizeArxivId(work.doi || work.landingPageUrl);
      const normalizedTitleKey = normalizeTextKey(title);
      const dedupKeys = paperDedupKeys({
        source: "openalex",
        openAlexWorkId: work.id || work.openAlexUrl,
        doi: work.doi,
        arxivPaperId: normalizedArxivPaperId,
        title
      });
      const institutions = [];
      const authors = [];

      for (const authorship of work.authorships || []) {
        if (validAuthorName(authorship.authorName)) {
          const normalizedAuthorName = normalizeTextKey(authorship.authorName);
          const authorKeys = authorDedupKeys({
            source: "openalex",
            authorId: authorship.authorId,
            authorName: authorship.authorName
          });
          authors.push(authorship.authorName);
          const authorEntityId = openAlexAuthorEntityId(authorship);
          const existingAuthor = authorMap.get(authorEntityId) || {
            id: stableId("candidate_entity_openalex_author", authorEntityId),
            entityId: authorEntityId,
            type: "research_author",
            name: authorship.authorName,
            layer: "ai_infra",
            description: `Research author candidate from OpenAlex authorship metadata related to ${associatedEntity?.name || result.entityId}.`,
            websiteUrl: authorship.authorId || undefined,
            country: "",
            statusText: "research_author",
            valuation: "N/A",
            aliases: [authorship.authorName].filter(Boolean),
            confidence: 0.58,
            evidenceUrl: authorship.authorId || evidenceUrl,
            extractionMethod: "openalex_author_snapshot",
            status: "candidate",
            payload: {
              note: "OpenAlex author candidate from authorship metadata; review identity and whether author-level nodes should enter the graph.",
              sourceId: "src_openalex",
              authorId: authorship.authorId || null,
              authorName: authorship.authorName,
              normalizedAuthorName,
              dedupKeys: authorKeys,
              associatedEntityIds: [],
              workIds: [],
              suggestedLayer: "research_author",
              snapshotGeneratedAt: openAlexWorksSnapshot.generatedAt
            },
            createdAt: new Date().toISOString()
          };
          if (!existingAuthor.payload.associatedEntityIds.includes(result.entityId)) existingAuthor.payload.associatedEntityIds.push(result.entityId);
          if (!existingAuthor.payload.workIds.includes(work.id)) existingAuthor.payload.workIds.push(work.id);
          authorMap.set(authorEntityId, existingAuthor);
        }
        for (const institution of authorship.institutions || []) {
          if (!institution.displayName) continue;
          institutions.push(institution);
          const entityId = institutionEntityId(institution);
          const existing = institutionMap.get(entityId) || {
            id: stableId("candidate_entity_openalex_institution", entityId),
            entityId,
            type: "research_org",
            name: institution.displayName,
            layer: "ai_infra",
            description: `Research organization candidate from OpenAlex authorship metadata related to ${associatedEntity?.name || result.entityId}.`,
            websiteUrl: institution.id || institution.ror || undefined,
            country: institution.countryCode || undefined,
            statusText: "research_org",
            valuation: "N/A",
            aliases: [institution.displayName].filter(Boolean),
            confidence: 0.62,
            evidenceUrl: institution.id || evidenceUrl,
            extractionMethod: "openalex_institution_snapshot",
            status: "candidate",
            payload: {
              note: "OpenAlex institution candidate from authorship metadata; review identity, country and whether it should enter the research_org layer.",
              sourceId: "src_openalex",
              associatedEntityIds: [],
              workIds: [],
              ror: institution.ror || null,
              institutionType: institution.type || null,
              suggestedLayer: "research_org",
              snapshotGeneratedAt: openAlexWorksSnapshot.generatedAt
            },
            createdAt: new Date().toISOString()
          };
          if (!existing.payload.associatedEntityIds.includes(result.entityId)) existing.payload.associatedEntityIds.push(result.entityId);
          if (!existing.payload.workIds.includes(work.id)) existing.payload.workIds.push(work.id);
          institutionMap.set(entityId, existing);
        }
      }

      for (const referencedWorkId of work.referencedWorks || []) {
        if (!referencedWorkId || referencedWorkId === work.id) continue;
        const entityId = referencedWorkEntityId(referencedWorkId);
        const existingReferencedWork = referencedWorkMap.get(entityId) || {
          id: stableId("candidate_entity_openalex_referenced_work", referencedWorkId),
          entityId,
          type: "paper",
          name: `OpenAlex referenced work ${referencedWorkId}`,
          layer: "ai_infra",
          description: `Referenced OpenAlex paper candidate cited by research related to ${associatedEntity?.name || result.entityId}.`,
          websiteUrl: `https://openalex.org/${referencedWorkId}`,
          country: "",
          statusText: "research_artifact",
          valuation: "N/A",
          aliases: [referencedWorkId],
          confidence: 0.48,
          evidenceUrl: `https://openalex.org/${referencedWorkId}`,
          extractionMethod: "openalex_referenced_work_snapshot",
          status: "candidate",
          payload: {
            note: "Referenced OpenAlex work discovered from citation metadata; fetch details before approving if the title is needed.",
            sourceId: "src_openalex",
            openAlexWorkId: referencedWorkId,
            openAlexUrl: `https://openalex.org/${referencedWorkId}`,
            associatedEntityIds: [],
            referencedByWorkIds: [],
            referencedByWorkDetails: [],
            suggestedLayer: "paper",
            snapshotGeneratedAt: openAlexWorksSnapshot.generatedAt
          },
          createdAt: new Date().toISOString()
        };
        const referencedByWorkDetails = {
          sourceWorkId: work.id,
          sourceWorkEntityId: workEntityId(work),
          sourceTitle: title,
          sourceOpenAlexUrl: work.openAlexUrl || null,
          sourceDoi: work.doi || null,
          sourceNormalizedDoi: normalizedDoi || null,
          sourcePublicationYear: work.publicationYear || null,
          sourceCitedByCount: work.citedByCount ?? null,
          associatedEntityId: result.entityId,
          associatedEntityName: associatedEntity?.name || result.entityId,
          evidenceUrl,
          citationDirection: "outgoing_reference"
        };
        if (!existingReferencedWork.payload.associatedEntityIds.includes(result.entityId)) {
          existingReferencedWork.payload.associatedEntityIds.push(result.entityId);
        }
        if (!existingReferencedWork.payload.referencedByWorkIds.includes(work.id)) {
          existingReferencedWork.payload.referencedByWorkIds.push(work.id);
        }
        if (!existingReferencedWork.payload.referencedByWorkDetails) {
          existingReferencedWork.payload.referencedByWorkDetails = [];
        }
        if (!existingReferencedWork.payload.referencedByWorkDetails.some((detail) => detail.sourceWorkId === work.id)) {
          existingReferencedWork.payload.referencedByWorkDetails.push(referencedByWorkDetails);
        }
        referencedWorkMap.set(entityId, existingReferencedWork);
      }

      candidates.push({
        id: stableId("candidate_entity_openalex_work", work.id || work.openAlexUrl),
        entityId: workEntityId(work),
        type: "paper",
        name: title,
        layer: "ai_infra",
        description: `OpenAlex paper candidate related to ${associatedEntity?.name || result.entityId}; ${work.citedByCount || 0} citations, ${work.publicationYear || "unknown year"}.`,
        websiteUrl: evidenceUrl,
        country: "",
        statusText: "research_artifact",
        valuation: "N/A",
        aliases: [title, work.doi, work.id].filter(Boolean).slice(0, 6),
        confidence: 0.66,
        evidenceUrl,
        extractionMethod: "openalex_work_snapshot",
        status: "candidate",
        payload: {
          note: "OpenAlex paper candidate; review title, authorship, institution metadata and whether it should become a paper/research artifact entity.",
          sourceId: "src_openalex",
          associatedEntityId: result.entityId,
          associatedEntityName: associatedEntity?.name || result.entityId,
          openAlexWorkId: work.id,
          openAlexUrl: work.openAlexUrl,
          doi: work.doi,
          normalizedOpenAlexWorkId,
          normalizedDoi,
          normalizedArxivPaperId,
          normalizedTitleKey,
          dedupKeys,
          publicationYear: work.publicationYear,
          publicationDate: work.publicationDate,
          citedByCount: work.citedByCount,
          sourceName: work.sourceName,
          authors: authors.slice(0, 8),
          institutions: institutions
            .map((institution) => ({
              id: institution.id,
              displayName: institution.displayName,
              countryCode: institution.countryCode,
              ror: institution.ror,
              type: institution.type
            }))
            .slice(0, 8),
          suggestedLayer: "paper",
          snapshotGeneratedAt: openAlexWorksSnapshot.generatedAt
        },
        createdAt: new Date().toISOString()
      });
    }
  }

  return mergeById(mergeById([...referencedWorkMap.values()], candidates), [...institutionMap.values(), ...authorMap.values()]);
}

function buildCandidateRelationshipsFromOpenAlex(openAlexWorksSnapshot) {
  const relationships = [];

  for (const result of openAlexWorksSnapshot.results || []) {
    const associatedEntity = seed.entities.find((entity) => entity.id === result.entityId);
    for (const work of result.works || []) {
      if (!work.id && !work.openAlexUrl) continue;
      const paperEntityId = workEntityId(work);
      const evidenceUrl = work.openAlexUrl || work.landingPageUrl;
      const title = work.title || `OpenAlex work ${work.id}`;
      const normalizedOpenAlexWorkId = normalizeOpenAlexWorkId(work.id || work.openAlexUrl);
      const normalizedDoi = normalizeDoi(work.doi);
      const normalizedArxivPaperId = normalizeArxivId(work.doi || work.landingPageUrl);
      const normalizedTitleKey = normalizeTextKey(title);
      const dedupKeys = paperDedupKeys({
        source: "openalex",
        openAlexWorkId: work.id || work.openAlexUrl,
        doi: work.doi,
        arxivPaperId: normalizedArxivPaperId,
        title
      });

      relationships.push({
        id: stableId("candidate_relationship_openalex_entity_paper", result.entityId, paperEntityId, "related_to"),
        sourceEntityId: result.entityId,
        targetCandidateEntityId: paperEntityId,
        targetCandidateName: title,
        relationType: "related_to",
        confidence: 0.58,
        evidenceUrl,
        extractionMethod: "openalex_work_relationship_snapshot",
        status: "candidate",
        payload: {
          note: "OpenAlex work matched the associated company/model query; review whether this paper should be linked to the entity.",
          sourceId: "src_openalex",
          sourceEntityId: result.entityId,
          sourceEntityName: associatedEntity?.name || result.entityId,
          targetCandidateEntityId: paperEntityId,
          targetCandidateName: title,
          targetCandidateType: "paper",
          openAlexWorkId: work.id,
          openAlexUrl: work.openAlexUrl,
          normalizedOpenAlexWorkId,
          normalizedDoi,
          normalizedArxivPaperId,
          normalizedTitleKey,
          dedupKeys,
          relationScope: "entity_to_candidate",
          snapshotGeneratedAt: openAlexWorksSnapshot.generatedAt
        },
        createdAt: new Date().toISOString()
      });

      const seenInstitutions = new Set();
      const seenAuthors = new Set();
      for (const authorship of work.authorships || []) {
        if (validAuthorName(authorship.authorName)) {
          const authorEntityId = openAlexAuthorEntityId(authorship);
          if (!seenAuthors.has(authorEntityId)) {
            seenAuthors.add(authorEntityId);
            const normalizedAuthorName = normalizeTextKey(authorship.authorName);
            const authorKeys = authorDedupKeys({
              source: "openalex",
              authorId: authorship.authorId,
              authorName: authorship.authorName
            });
            relationships.push({
              id: stableId("candidate_relationship_openalex_paper_author", paperEntityId, authorEntityId, "authored_by"),
              sourceCandidateEntityId: paperEntityId,
              sourceCandidateName: title,
              targetCandidateEntityId: authorEntityId,
              targetCandidateName: authorship.authorName,
              relationType: "authored_by",
              confidence: 0.55,
              evidenceUrl,
              extractionMethod: "openalex_authorship_relationship_snapshot",
              status: "candidate",
              payload: {
                note: "OpenAlex authorship metadata links this paper to an author; review identity before approving the paper-author relation.",
                sourceId: "src_openalex",
                sourceCandidateEntityId: paperEntityId,
                sourceCandidateName: title,
                sourceCandidateType: "paper",
                targetCandidateEntityId: authorEntityId,
                targetCandidateName: authorship.authorName,
                targetCandidateType: "research_author",
                openAlexWorkId: work.id,
                openAlexAuthorId: authorship.authorId || null,
                normalizedAuthorName,
                dedupKeys: authorKeys,
                relationScope: "candidate_to_candidate",
                snapshotGeneratedAt: openAlexWorksSnapshot.generatedAt
              },
              createdAt: new Date().toISOString()
            });
          }
        }
        for (const institution of authorship.institutions || []) {
          if (!institution.displayName) continue;
          const institutionEntityId = institutionEntityIdFromOpenAlex(institution);
          if (seenInstitutions.has(institutionEntityId)) continue;
          seenInstitutions.add(institutionEntityId);
          relationships.push({
            id: stableId("candidate_relationship_openalex_paper_institution", paperEntityId, institutionEntityId, "published_by"),
            sourceCandidateEntityId: paperEntityId,
            sourceCandidateName: title,
            targetCandidateEntityId: institutionEntityId,
            targetCandidateName: institution.displayName,
            relationType: "published_by",
            confidence: 0.55,
            evidenceUrl,
            extractionMethod: "openalex_authorship_relationship_snapshot",
            status: "candidate",
            payload: {
              note: "OpenAlex authorship metadata links this paper to an institution; review before approving the paper/institution relation.",
              sourceId: "src_openalex",
              sourceCandidateEntityId: paperEntityId,
              sourceCandidateName: title,
              sourceCandidateType: "paper",
              targetCandidateEntityId: institutionEntityId,
              targetCandidateName: institution.displayName,
              targetCandidateType: "research_org",
              openAlexWorkId: work.id,
              openAlexInstitutionId: institution.id || null,
              ror: institution.ror || null,
              relationScope: "candidate_to_candidate",
              snapshotGeneratedAt: openAlexWorksSnapshot.generatedAt
            },
            createdAt: new Date().toISOString()
          });
        }
      }

      for (const referencedWorkId of work.referencedWorks || []) {
        if (!referencedWorkId || referencedWorkId === work.id) continue;
        const targetEntityId = referencedWorkEntityId(referencedWorkId);
        relationships.push({
          id: stableId("candidate_relationship_openalex_paper_cites", paperEntityId, targetEntityId, "cites"),
          sourceCandidateEntityId: paperEntityId,
          sourceCandidateName: title,
          targetCandidateEntityId: targetEntityId,
          targetCandidateName: `OpenAlex referenced work ${referencedWorkId}`,
          relationType: "cites",
          confidence: 0.5,
          evidenceUrl,
          extractionMethod: "openalex_citation_relationship_snapshot",
          status: "candidate",
          payload: {
            note: "OpenAlex citation metadata says this paper references another work; review before promoting citation edges into the graph.",
            sourceId: "src_openalex",
            sourceCandidateEntityId: paperEntityId,
            sourceCandidateName: title,
            sourceCandidateType: "paper",
            targetCandidateEntityId: targetEntityId,
            targetCandidateName: `OpenAlex referenced work ${referencedWorkId}`,
            targetCandidateType: "paper",
            openAlexWorkId: work.id,
            sourceOpenAlexWorkId: work.id,
            sourceOpenAlexUrl: work.openAlexUrl || null,
            sourceDoi: work.doi || null,
            sourceNormalizedDoi: normalizedDoi || null,
            sourcePublicationYear: work.publicationYear || null,
            sourceCitedByCount: work.citedByCount ?? null,
            referencedOpenAlexWorkId: referencedWorkId,
            referencedOpenAlexUrl: `https://openalex.org/${referencedWorkId}`,
            citationDirection: "outgoing_reference",
            sourcePaperDedupKeys: dedupKeys,
            relationScope: "candidate_to_candidate",
            snapshotGeneratedAt: openAlexWorksSnapshot.generatedAt
          },
          createdAt: new Date().toISOString()
        });
      }
    }
  }

  return relationships;
}

function buildCandidateEntitiesFromArxiv(arxivPapersSnapshot) {
  const candidates = [];
  const authorMap = new Map();

  for (const result of arxivPapersSnapshot.results || []) {
    const associatedEntity = seed.entities.find((entity) => entity.id === result.entityId);
    for (const paper of result.papers || []) {
      if (!paper.id && !paper.arxivUrl) continue;
      const evidenceUrl = paper.arxivUrl || (paper.id ? `https://arxiv.org/abs/${paper.id}` : "");
      const title = paper.title || `arXiv paper ${paper.id}`;
      const normalizedArxivPaperId = normalizeArxivId(paper.id || paper.arxivUrl);
      const normalizedTitleKey = normalizeTextKey(title);
      const dedupKeys = paperDedupKeys({
        source: "arxiv",
        arxivPaperId: paper.id || paper.arxivUrl,
        title
      });
      const validAuthors = (paper.authors || []).filter(validAuthorName);
      for (const authorName of paper.authors || []) {
        if (!validAuthorName(authorName)) continue;
        const normalizedAuthorName = normalizeTextKey(authorName);
        const authorKeys = authorDedupKeys({
          source: "arxiv",
          authorName
        });
        const authorEntityId = arxivAuthorEntityId(authorName);
        const existingAuthor = authorMap.get(authorEntityId) || {
          id: stableId("candidate_entity_arxiv_author", authorEntityId),
          entityId: authorEntityId,
          type: "research_author",
          name: authorName,
          layer: "ai_infra",
          description: `Research author candidate from arXiv metadata related to ${associatedEntity?.name || result.entityId}.`,
          websiteUrl: "",
          country: "",
          statusText: "research_author",
          valuation: "N/A",
          aliases: [authorName],
          confidence: 0.52,
          evidenceUrl,
          extractionMethod: "arxiv_author_snapshot",
          status: "candidate",
          payload: {
            note: "arXiv author candidate from paper metadata; review identity before using author-level graph nodes.",
            sourceId: "src_arxiv",
            authorName,
            normalizedAuthorName,
            dedupKeys: authorKeys,
            associatedEntityIds: [],
            paperIds: [],
            suggestedLayer: "research_author",
            snapshotGeneratedAt: arxivPapersSnapshot.generatedAt
          },
          createdAt: new Date().toISOString()
        };
        if (!existingAuthor.payload.associatedEntityIds.includes(result.entityId)) existingAuthor.payload.associatedEntityIds.push(result.entityId);
        if (!existingAuthor.payload.paperIds.includes(paper.id)) existingAuthor.payload.paperIds.push(paper.id);
        authorMap.set(authorEntityId, existingAuthor);
      }
      candidates.push({
        id: stableId("candidate_entity_arxiv_paper", paper.id || paper.arxivUrl),
        entityId: arxivPaperEntityId(paper),
        type: "paper",
        name: title,
        layer: "ai_infra",
        description: `arXiv paper candidate related to ${associatedEntity?.name || result.entityId}; published ${paper.published || "unknown date"}.`,
        websiteUrl: evidenceUrl,
        country: "",
        statusText: "preprint",
        valuation: "N/A",
        aliases: [title, paper.id, ...(paper.categories || [])].filter(Boolean).slice(0, 8),
        confidence: 0.6,
        evidenceUrl,
        extractionMethod: "arxiv_paper_snapshot",
        status: "candidate",
        payload: {
          note: "arXiv paper candidate; review relevance, title, authors and topic categories before approving as a paper/research artifact entity.",
          sourceId: "src_arxiv",
          associatedEntityId: result.entityId,
          associatedEntityName: associatedEntity?.name || result.entityId,
          arxivPaperId: paper.id,
          arxivUrl: paper.arxivUrl,
          pdfUrl: paper.pdfUrl,
          normalizedArxivPaperId,
          normalizedTitleKey,
          dedupKeys,
          published: paper.published,
          updated: paper.updated,
          authors: validAuthors.slice(0, 12),
          categories: (paper.categories || []).slice(0, 12),
          summary: paper.summary,
          suggestedLayer: "paper",
          snapshotGeneratedAt: arxivPapersSnapshot.generatedAt
        },
        createdAt: new Date().toISOString()
      });
    }
  }

  return mergeById(candidates, [...authorMap.values()]);
}

function institutionEntityIdFromOpenAlex(institution) {
  return institutionEntityId(institution);
}

function buildCandidateRelationshipsFromArxiv(arxivPapersSnapshot) {
  const relationships = [];

  for (const result of arxivPapersSnapshot.results || []) {
    const associatedEntity = seed.entities.find((entity) => entity.id === result.entityId);
    for (const paper of result.papers || []) {
      if (!paper.id && !paper.arxivUrl) continue;
      const paperEntityId = arxivPaperEntityId(paper);
      const title = paper.title || `arXiv paper ${paper.id}`;
      const normalizedArxivPaperId = normalizeArxivId(paper.id || paper.arxivUrl);
      const normalizedTitleKey = normalizeTextKey(title);
      const dedupKeys = paperDedupKeys({
        source: "arxiv",
        arxivPaperId: paper.id || paper.arxivUrl,
        title
      });
      relationships.push({
        id: stableId("candidate_relationship_arxiv_entity_paper", result.entityId, paperEntityId, "related_to"),
        sourceEntityId: result.entityId,
        targetCandidateEntityId: paperEntityId,
        targetCandidateName: title,
        relationType: "related_to",
        confidence: 0.52,
        evidenceUrl: paper.arxivUrl,
        extractionMethod: "arxiv_paper_relationship_snapshot",
        status: "candidate",
        payload: {
          note: "arXiv paper matched the associated company/model query; review topical relevance before linking it to the entity.",
          sourceId: "src_arxiv",
          sourceEntityId: result.entityId,
          sourceEntityName: associatedEntity?.name || result.entityId,
          targetCandidateEntityId: paperEntityId,
          targetCandidateName: title,
          targetCandidateType: "paper",
          arxivPaperId: paper.id,
          arxivUrl: paper.arxivUrl,
          normalizedArxivPaperId,
          normalizedTitleKey,
          dedupKeys,
          categories: paper.categories || [],
          relationScope: "entity_to_candidate",
          snapshotGeneratedAt: arxivPapersSnapshot.generatedAt
        },
        createdAt: new Date().toISOString()
      });

      const seenAuthors = new Set();
      for (const authorName of paper.authors || []) {
        if (!validAuthorName(authorName)) continue;
        const authorEntityId = arxivAuthorEntityId(authorName);
        if (seenAuthors.has(authorEntityId)) continue;
        seenAuthors.add(authorEntityId);
        const normalizedAuthorName = normalizeTextKey(authorName);
        const authorKeys = authorDedupKeys({
          source: "arxiv",
          authorName
        });
        relationships.push({
          id: stableId("candidate_relationship_arxiv_paper_author", paperEntityId, authorEntityId, "authored_by"),
          sourceCandidateEntityId: paperEntityId,
          sourceCandidateName: title,
          targetCandidateEntityId: authorEntityId,
          targetCandidateName: authorName,
          relationType: "authored_by",
          confidence: 0.5,
          evidenceUrl: paper.arxivUrl,
          extractionMethod: "arxiv_authorship_relationship_snapshot",
          status: "candidate",
          payload: {
            note: "arXiv author metadata links this paper to an author; review identity before approving the paper-author relation.",
            sourceId: "src_arxiv",
            sourceCandidateEntityId: paperEntityId,
            sourceCandidateName: title,
            sourceCandidateType: "paper",
            targetCandidateEntityId: authorEntityId,
            targetCandidateName: authorName,
            targetCandidateType: "research_author",
            arxivPaperId: paper.id,
            arxivUrl: paper.arxivUrl,
            normalizedAuthorName,
            dedupKeys: authorKeys,
            relationScope: "candidate_to_candidate",
            snapshotGeneratedAt: arxivPapersSnapshot.generatedAt
          },
          createdAt: new Date().toISOString()
        });
      }
    }
  }

  return relationships;
}

function buildEvidenceBacklog() {
  const entityById = new Map(seed.entities.map((entity) => [entity.id, entity]));
  const sourceById = new Map(seed.sources.map((source) => [source.id, source]));

  return seed.relationships
    .filter(
      (relationship) =>
        !relationship.evidenceUrl &&
        (relationship.sourceId === "src_manual" || relationship.sourceId === "src_ecosystem_mapping" || relationship.confidence < 0.65)
    )
    .map((relationship) => {
      const manualSourcePenalty = relationship.sourceId === "src_manual" || relationship.sourceId === "src_ecosystem_mapping" ? 1 : 0;
      const lowConfidencePenalty = Math.max(0, 0.75 - relationship.confidence);
      const priority = Number((manualSourcePenalty + lowConfidencePenalty).toFixed(3));
      return {
        id: stableId("evidence", relationship.id),
        relationshipId: relationship.id,
        sourceEntityId: relationship.source,
        sourceEntityName: entityById.get(relationship.source)?.name || relationship.source,
        targetEntityId: relationship.target,
        targetEntityName: entityById.get(relationship.target)?.name || relationship.target,
        relationType: relationship.type,
        confidence: relationship.confidence,
        currentSourceId: relationship.sourceId,
        currentSourceTitle: sourceById.get(relationship.sourceId)?.title || relationship.sourceId,
        reason: relationship.confidence < 0.65 ? "low_confidence_or_generic_source" : "generic_manual_source",
        reviewStatus: relationship.reviewStatus || "unreviewed",
        reviewNote: relationship.reviewNote || "",
        suggestedEvidence: "official announcement, investor relations page, product documentation, model card, filing, or credible report",
        priority
      };
    })
    .sort((a, b) => b.priority - a.priority || a.relationshipId.localeCompare(b.relationshipId))
    .slice(0, evidenceLimit);
}

const snapshot = await readJsonIfExists(snapshotPath, { generatedAt: null, results: [], errors: [] });
const wikidataSnapshot = await readJsonIfExists(wikidataSnapshotPath, { generatedAt: null, results: [], errors: [] });
const openAlexWorksSnapshot = await readJsonIfExists(openAlexWorksSnapshotPath, { generatedAt: null, results: [], errors: [] });
const arxivPapersSnapshot = await readJsonIfExists(arxivPapersSnapshotPath, { generatedAt: null, results: [], errors: [] });
const existingCandidateSnapshot = await readJsonIfExists(candidateOutputPath, {
  candidateRelationships: [],
  candidateEntities: [],
  candidateMetrics: [],
  retryBacklog: []
});
const candidateMetrics = buildCandidateMetrics(snapshot);
const candidateEntities = mergeById(
  mergeById(buildCandidateEntitiesFromWikidata(wikidataSnapshot), buildCandidateEntitiesFromOpenAlex(openAlexWorksSnapshot)),
  buildCandidateEntitiesFromArxiv(arxivPapersSnapshot)
);
const scholarlyCandidateRelationships = mergeById(
  buildCandidateRelationshipsFromOpenAlex(openAlexWorksSnapshot),
  buildCandidateRelationshipsFromArxiv(arxivPapersSnapshot)
);
const retryBacklog = buildRetryBacklog(snapshot);
const evidenceBacklog = buildEvidenceBacklog();
const generatedAt = new Date().toISOString();
const approvedPairs = approvedMetricSourcePairs();
const replaceableCandidateEntityMethods = new Set([
  "wikidata_profile_snapshot",
  "openalex_work_snapshot",
  "openalex_institution_snapshot",
  "openalex_author_snapshot",
  "openalex_referenced_work_snapshot",
  "arxiv_paper_snapshot",
  "arxiv_author_snapshot"
]);
const replaceableCandidateRelationshipMethods = new Set([
  "openalex_work_relationship_snapshot",
  "openalex_authorship_relationship_snapshot",
  "openalex_citation_relationship_snapshot",
  "arxiv_paper_relationship_snapshot",
  "arxiv_authorship_relationship_snapshot"
]);
const generatedCandidateEntityIds = new Set(candidateEntities.map((candidate) => candidate.id));
const generatedCandidateRelationshipIds = new Set(scholarlyCandidateRelationships.map((candidate) => candidate.id));
const retainedExistingCandidateMetrics = (existingCandidateSnapshot.candidateMetrics || []).filter((candidate) => {
  if (candidate.status && candidate.status !== "candidate") return true;
  const pair = `${candidate.entityId}|${sourceNameForSourceId(candidate.sourceId)}`;
  return !approvedPairs.has(pair);
});
const retainedExistingCandidateRelationships = (existingCandidateSnapshot.candidateRelationships || []).filter((candidate) => {
  if (!replaceableCandidateRelationshipMethods.has(candidate.extractionMethod)) return true;
  if (candidate.status && candidate.status !== "candidate") return true;
  return generatedCandidateRelationshipIds.has(candidate.id);
});
const retainedExistingCandidateEntities = (existingCandidateSnapshot.candidateEntities || []).filter((candidate) => {
  if (!replaceableCandidateEntityMethods.has(candidate.extractionMethod)) return true;
  if (candidate.status && candidate.status !== "candidate") return true;
  return generatedCandidateEntityIds.has(candidate.id);
});
const mergedCandidateRelationships = mergeById(retainedExistingCandidateRelationships, scholarlyCandidateRelationships);
const mergedCandidateEntities = mergeById(retainedExistingCandidateEntities, candidateEntities);
const mergedCandidateMetrics = mergeById(retainedExistingCandidateMetrics, candidateMetrics);

const candidateSnapshot = {
  ...existingCandidateSnapshot,
  generatedAt,
  sourceSnapshotGeneratedAt: snapshot.generatedAt,
  wikidataSnapshotGeneratedAt: wikidataSnapshot.generatedAt,
  openAlexWorksSnapshotGeneratedAt: openAlexWorksSnapshot.generatedAt,
  arxivPapersSnapshotGeneratedAt: arxivPapersSnapshot.generatedAt,
  plannedRequestCount: plannedRequests().length,
  candidateRelationships: mergedCandidateRelationships,
  candidateEntities: mergedCandidateEntities,
  candidateMetrics: mergedCandidateMetrics,
  retryBacklog,
  summary: {
    ...(existingCandidateSnapshot.summary || {}),
    candidateRelationships: mergedCandidateRelationships.length,
    candidateEntities: mergedCandidateEntities.length,
    candidateMetrics: mergedCandidateMetrics.length,
    retryBacklog: retryBacklog.length,
    evidenceBacklog: evidenceBacklog.length
  }
};

if (shouldWrite) {
  await fs.writeFile(candidateOutputPath, `${JSON.stringify(candidateSnapshot, null, 2)}\n`);
  await fs.writeFile(evidenceBacklogPath, `${JSON.stringify({ generatedAt, relationships: evidenceBacklog }, null, 2)}\n`);
}

console.log(JSON.stringify(candidateSnapshot.summary, null, 2));
if (shouldWrite) {
  console.log("Wrote data/candidate-snapshot.json and data/evidence-backlog.json.");
}
