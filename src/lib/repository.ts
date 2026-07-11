import pg from "pg";
import candidateEntityJson from "../generated/candidate-entities.json";
import candidateMetricJson from "../generated/candidate-metrics.json";
import candidateJson from "../generated/candidate-relationships.json";
import { metricBundle, seed } from "./data";
import { readTimeline } from "./research-artifacts";
import type {
  AuditLogEntry,
  CandidateEntity,
  CandidateEntityDuplicateHint,
  CandidateMetric,
  CandidateMetricPatch,
  CandidateMetricReviewItem,
  CandidateRelationship,
  CandidateRelationshipPatch,
  CandidateRelationshipReviewItem,
  DataSource,
  Entity,
  MetricBundle,
  Relationship,
  SeedData,
  Source,
  UserCorrectionSubmission
} from "./types";

type DbEntityRow = {
  id: string;
  type: string;
  name: string;
  layer: string;
  description: string;
  website_url: string | null;
  country: string | null;
  status: string;
  valuation: string | null;
  ticker: string | null;
  exchange: string | null;
  aliases: string[] | null;
};

type DbRelationshipRow = {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relation_type: string;
  confidence: string | number;
  note: string | null;
  source_id: string | null;
  evidence_title: string | null;
  evidence_url: string | null;
  evidence_date: string | null;
  evidence_notes: string | null;
};

type DbSourceRow = {
  id: string;
  source_type: string | null;
  title: string;
  publisher: string;
  published_at: string | null;
  url: string;
  fetched_at: string | Date | null;
  license_note: string | null;
  content_hash: string | null;
  note: string | null;
};

type DbMetricRow = {
  entity_id: string;
  metric_type: string;
  value_number: string | number | null;
  value_text: string | null;
  as_of_date: string;
  source_id: string | null;
  source_ref: string | null;
};

type DbCandidateRelationshipRow = {
  id: string;
  source_entity_id: string | null;
  target_entity_id: string | null;
  relation_type: string;
  confidence: string | number;
  evidence_url: string | null;
  extraction_method: string;
  status: "candidate" | "approved" | "rejected";
  payload: Record<string, unknown>;
  created_at: string;
  reviewed_at: string | null;
};

type DbCandidateEntityRow = {
  id: string;
  entity_id: string | null;
  type: string;
  name: string;
  layer: string;
  description: string;
  website_url: string | null;
  country: string | null;
  status_text: string;
  valuation: string | null;
  aliases: string[] | null;
  confidence: string | number;
  evidence_url: string | null;
  extraction_method: string;
  status: "candidate" | "approved" | "rejected";
  payload: Record<string, unknown>;
  created_at: string;
  reviewed_at: string | null;
};

type DbCandidateMetricRow = {
  id: string;
  entity_id: string | null;
  metric_type: string;
  value_number: string | number | null;
  value_text: string | null;
  as_of_date: string;
  source_id: string | null;
  source_ref: string | null;
  confidence: string | number;
  evidence_url: string | null;
  extraction_method: string;
  status: "candidate" | "approved" | "rejected";
  payload: Record<string, unknown>;
  created_at: string;
  reviewed_at: string | null;
};

type EntitySearchOptions = {
  query: string;
  type: string;
  layer: string;
  limit: number;
};

let pool: pg.Pool | null = null;

type FallbackReviewStore = {
  candidateState: Map<string, CandidateRelationship["status"]>;
  candidatePatch: Map<string, CandidateRelationshipPatch>;
  candidateEntityState: Map<string, CandidateEntity["status"]>;
  candidateEntityMergeTarget: Map<string, string>;
  candidateEntityRedirect: Map<string, string>;
  candidateMetricState: Map<string, CandidateMetric["status"]>;
  candidateMetricPatch: Map<string, CandidateMetricPatch>;
  userCandidateRelationships: CandidateRelationship[];
  reviewedAt: Map<string, string>;
  auditLog: AuditLogEntry[];
};

function fallbackReviewStore() {
  const globalStore = globalThis as typeof globalThis & {
    __AI_CAPITAL_REVIEW_STORE__?: FallbackReviewStore;
  };
  globalStore.__AI_CAPITAL_REVIEW_STORE__ ||= {
    candidateState: new Map<string, CandidateRelationship["status"]>(),
    candidatePatch: new Map<string, CandidateRelationshipPatch>(),
    candidateEntityState: new Map<string, CandidateEntity["status"]>(),
    candidateEntityMergeTarget: new Map<string, string>(),
    candidateEntityRedirect: new Map<string, string>(),
    candidateMetricState: new Map<string, CandidateMetric["status"]>(),
    candidateMetricPatch: new Map<string, CandidateMetricPatch>(),
    userCandidateRelationships: [],
    reviewedAt: new Map<string, string>(),
    auditLog: []
  };
  globalStore.__AI_CAPITAL_REVIEW_STORE__.userCandidateRelationships ||= [];
  globalStore.__AI_CAPITAL_REVIEW_STORE__.candidateEntityMergeTarget ||= new Map<string, string>();
  globalStore.__AI_CAPITAL_REVIEW_STORE__.candidateEntityRedirect ||= new Map<string, string>();
  globalStore.__AI_CAPITAL_REVIEW_STORE__.candidateMetricPatch ||= new Map<string, CandidateMetricPatch>();
  return globalStore.__AI_CAPITAL_REVIEW_STORE__;
}

function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

function nowIso() {
  return new Date().toISOString();
}

function reviewId(prefix: string, id: string) {
  return `${prefix}_${id}_${Date.now()}`;
}

function slugPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  pool ||= new pg.Pool({
    connectionString: process.env.DATABASE_URL
  });
  return pool;
}

function mapEntity(row: DbEntityRow): Entity {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    layer: row.layer,
    status: row.status,
    ticker: row.ticker || undefined,
    valuation: row.valuation || "Unknown",
    website_url: row.website_url || undefined,
    country: row.country || undefined,
    exchange: row.exchange || undefined,
    aliases: row.aliases || [],
    metrics: {},
    description: row.description
  };
}

function mapRelationship(row: DbRelationshipRow): Relationship {
  return {
    id: row.id,
    source: row.source_entity_id,
    target: row.target_entity_id,
    type: row.relation_type,
    confidence: Number(row.confidence),
    sourceId: row.source_id || "src_manual",
    note: row.note || "",
    evidenceTitle: row.evidence_title || undefined,
    evidenceUrl: row.evidence_url || undefined,
    evidenceDate: row.evidence_date || undefined,
    evidenceNote: row.evidence_notes || undefined
  };
}

function mapSource(row: DbSourceRow): Source {
  return {
    id: row.id,
    title: row.title,
    publisher: row.publisher,
    date: row.published_at || "",
    url: row.url,
    note: row.note || "",
    sourceType: row.source_type || undefined,
    evidenceStrength: sourceTypeToEvidenceStrength(row.source_type),
    licenseNote: row.license_note || undefined,
    fetchedAt: row.fetched_at instanceof Date ? row.fetched_at.toISOString() : row.fetched_at || undefined,
    contentHash: row.content_hash || undefined
  };
}

function sourceTypeToEvidenceStrength(sourceType: string | null): Source["evidenceStrength"] {
  if (!sourceType) return undefined;
  if (sourceType === "official_api") return "official_api";
  if (["official_docs", "official_filings", "public_portfolio"].includes(sourceType)) return "official_docs";
  if (["scholarly_index", "third_party_index"].includes(sourceType)) return "third_party_index";
  if (sourceType === "manual_seed") return "manual_seed";
  return "derived";
}

async function recentResearchEventsForEntity(entityId: string) {
  try {
    const timeline = await readTimeline();
    return (timeline.events || []).filter((event) => event.entityId === entityId).slice(0, 8);
  } catch {
    return [];
  }
}

function mapCandidateRow(row: DbCandidateRelationshipRow): CandidateRelationship {
  const payload = row.payload || {};
  return {
    id: row.id,
    sourceEntityId: row.source_entity_id || undefined,
    targetEntityId: row.target_entity_id || undefined,
    sourceCandidateEntityId: typeof payload.sourceCandidateEntityId === "string" ? payload.sourceCandidateEntityId : undefined,
    targetCandidateEntityId: typeof payload.targetCandidateEntityId === "string" ? payload.targetCandidateEntityId : undefined,
    sourceCandidateName: typeof payload.sourceCandidateName === "string" ? payload.sourceCandidateName : undefined,
    targetCandidateName: typeof payload.targetCandidateName === "string" ? payload.targetCandidateName : undefined,
    relationType: row.relation_type,
    confidence: Number(row.confidence),
    evidenceUrl: row.evidence_url || undefined,
    extractionMethod: row.extraction_method,
    status: row.status,
    payload,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at || undefined
  };
}

function mapCandidateEntityRow(row: DbCandidateEntityRow): CandidateEntity {
  return {
    id: row.id,
    entityId: row.entity_id || row.id,
    type: row.type,
    name: row.name,
    layer: row.layer,
    description: row.description,
    websiteUrl: row.website_url || undefined,
    country: row.country || undefined,
    statusText: row.status_text,
    valuation: row.valuation || undefined,
    aliases: row.aliases || [],
    confidence: Number(row.confidence),
    evidenceUrl: row.evidence_url || undefined,
    extractionMethod: row.extraction_method,
    status: row.status,
    payload: row.payload || {},
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at || undefined
  };
}

function mapCandidateMetricRow(row: DbCandidateMetricRow): CandidateMetric {
  return {
    id: row.id,
    entityId: row.entity_id || "",
    metricType: row.metric_type,
    valueNumber: row.value_number === null || row.value_number === undefined ? null : Number(row.value_number),
    valueText: row.value_text,
    asOfDate: row.as_of_date,
    sourceId: row.source_id || undefined,
    sourceRef: row.source_ref || undefined,
    confidence: Number(row.confidence),
    evidenceUrl: row.evidence_url || undefined,
    extractionMethod: row.extraction_method,
    status: row.status,
    payload: row.payload || {},
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at || undefined
  };
}

function fallbackCandidates() {
  const store = fallbackReviewStore();
  return [...(candidateJson as CandidateRelationship[]), ...store.userCandidateRelationships].map((candidate) => {
    const patch = store.candidatePatch.get(candidate.id);
    return {
      ...candidate,
      confidence: patch?.confidence ?? candidate.confidence,
      evidenceUrl: patch?.evidenceUrl ?? candidate.evidenceUrl,
      payload: {
        ...candidate.payload,
        ...(patch?.note !== undefined ? { note: patch.note } : {}),
        ...(patch?.sourceId !== undefined ? { sourceId: patch.sourceId } : {})
      },
      status: store.candidateState.get(candidate.id) || candidate.status,
      reviewedAt: store.reviewedAt.get(candidate.id) || candidate.reviewedAt
    };
  });
}

function fallbackCandidateEntities() {
  const store = fallbackReviewStore();
  return (candidateEntityJson as CandidateEntity[]).map((candidate) => ({
    ...candidate,
    payload: {
      ...candidate.payload,
      ...(store.candidateEntityMergeTarget.has(candidate.id)
        ? {
            mergeTargetEntityId: store.candidateEntityMergeTarget.get(candidate.id),
            mergeAction: "merged_into_existing_entity"
          }
        : {})
    },
    status: store.candidateEntityState.get(candidate.id) || candidate.status,
    reviewedAt: store.reviewedAt.get(candidate.id) || candidate.reviewedAt
  }));
}

function fallbackCandidateMetrics() {
  const store = fallbackReviewStore();
  return (candidateMetricJson as CandidateMetric[]).map((candidate) => {
    const patch = store.candidateMetricPatch.get(candidate.id);
    return {
      ...candidate,
      metricType: patch?.metricType ?? candidate.metricType,
      valueNumber: patch?.valueNumber !== undefined ? patch.valueNumber : candidate.valueNumber,
      valueText: patch?.valueText !== undefined ? patch.valueText : candidate.valueText,
      asOfDate: patch?.asOfDate ?? candidate.asOfDate,
      sourceId: patch?.sourceId !== undefined ? patch.sourceId : candidate.sourceId,
      sourceRef: patch?.sourceRef !== undefined ? patch.sourceRef : candidate.sourceRef,
      confidence: patch?.confidence ?? candidate.confidence,
      evidenceUrl: patch?.evidenceUrl !== undefined ? patch.evidenceUrl : candidate.evidenceUrl,
      payload: {
        ...candidate.payload,
        ...(patch?.note !== undefined ? { note: patch.note } : {})
      },
      status: store.candidateMetricState.get(candidate.id) || candidate.status,
      reviewedAt: store.reviewedAt.get(candidate.id) || candidate.reviewedAt
    };
  });
}

function candidateToRelationship(candidate: CandidateRelationship): Relationship | null {
  const store = fallbackReviewStore();
  const approvedCandidateEntityIds = new Set(approvedFallbackCandidateEntities().map((entity) => entity.id));
  const existingEntityIds = new Set(seed.entities.map((entity) => entity.id));
  function resolveCandidateEntityId(candidateEntityId: string | undefined) {
    if (!candidateEntityId) return undefined;
    let current = candidateEntityId;
    const seen = new Set<string>();
    for (let i = 0; i < 8; i += 1) {
      if (seen.has(current)) break;
      seen.add(current);
      const next = store.candidateEntityRedirect.get(current);
      if (!next || next === current) break;
      current = next;
    }
    if (existingEntityIds.has(current) || approvedCandidateEntityIds.has(current)) return current;
    return undefined;
  }
  const sourceEntityId = candidate.sourceEntityId || resolveCandidateEntityId(candidate.sourceCandidateEntityId);
  const targetEntityId = candidate.targetEntityId || resolveCandidateEntityId(candidate.targetCandidateEntityId);
  if (!sourceEntityId || !targetEntityId) return null;
  return {
    id: `approved_${candidate.id}`,
    source: sourceEntityId,
    target: targetEntityId,
    type: candidate.relationType,
    confidence: candidate.confidence,
    sourceId: typeof candidate.payload.sourceId === "string" ? candidate.payload.sourceId : "src_ecosystem_mapping",
    note:
      typeof candidate.payload.note === "string"
        ? candidate.payload.note
        : `Approved candidate relationship from ${candidate.extractionMethod}.`
  };
}

function candidateEntityToEntity(candidate: CandidateEntity): Entity {
  return {
    id: candidate.entityId,
    name: candidate.name,
    type: candidate.type,
    layer: candidate.layer,
    status: candidate.statusText,
    valuation: candidate.valuation || "Unknown",
    website_url: candidate.websiteUrl,
    country: candidate.country,
    aliases: candidate.aliases,
    metrics: {},
    description: candidate.description
  };
}

function candidateMetricToMetricGroup(candidate: CandidateMetric): MetricBundle["metrics"][number] {
  return {
    entityId: candidate.entityId,
    source: candidate.sourceId || "candidate",
    sourceRef: candidate.sourceRef,
    asOf: candidate.asOfDate,
    metrics: {
      [candidate.metricType]: candidate.valueNumber ?? candidate.valueText ?? null
    }
  };
}

function approvedFallbackCandidateRelationships() {
  return fallbackCandidates()
    .filter((candidate) => candidate.status === "approved")
    .map(candidateToRelationship)
    .filter((relationship): relationship is Relationship => Boolean(relationship));
}

function approvedFallbackCandidateEntities() {
  return fallbackCandidateEntities()
    .filter((candidate) => candidate.status === "approved" && !candidate.payload.mergeAction)
    .map(candidateEntityToEntity);
}

function seedEntitiesWithApprovedCandidates() {
  return [
    ...new Map([...seed.entities, ...approvedFallbackCandidateEntities()].map((entity) => [entity.id, entity])).values()
  ];
}

function approvedFallbackCandidateMetrics() {
  return fallbackCandidateMetrics()
    .filter((candidate) => candidate.status === "approved")
    .map(candidateMetricToMetricGroup);
}

function enrichCandidates(candidates: CandidateRelationship[]): CandidateRelationshipReviewItem[] {
  const entityById = new Map(seed.entities.map((entity) => [entity.id, entity]));
  const candidateEntityById = new Map(fallbackCandidateEntities().map((entity) => [entity.entityId, entity]));
  return candidates.map((candidate) => ({
    ...candidate,
    sourceEntity: candidate.sourceEntityId ? entityById.get(candidate.sourceEntityId) : undefined,
    targetEntity: candidate.targetEntityId ? entityById.get(candidate.targetEntityId) : undefined,
    sourceCandidateName:
      candidate.sourceCandidateName ||
      (candidate.sourceCandidateEntityId ? candidateEntityById.get(candidate.sourceCandidateEntityId)?.name : undefined),
    targetCandidateName:
      candidate.targetCandidateName ||
      (candidate.targetCandidateEntityId ? candidateEntityById.get(candidate.targetCandidateEntityId)?.name : undefined)
  }));
}

function enrichCandidateMetrics(candidates: CandidateMetric[]): CandidateMetricReviewItem[] {
  const entityById = new Map(seed.entities.map((entity) => [entity.id, entity]));
  return candidates.map((candidate) => ({
    ...candidate,
    entity: entityById.get(candidate.entityId)
  }));
}

function normalizeMatchValue(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function domainFromUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const domain = url.hostname.replace(/^www\./, "").toLowerCase();
    if (["arxiv.org", "openalex.org", "wikidata.org", "doi.org", "dx.doi.org"].includes(domain)) return "";
    return domain;
  } catch {
    return "";
  }
}

function payloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

function candidateEntityMatchKeys(candidate: CandidateEntity) {
  const keys: Array<{ key: string; reason: string }> = [];
  const name = normalizeMatchValue(candidate.name);
  const domain = domainFromUrl(candidate.websiteUrl);
  if (candidate.entityId) keys.push({ key: `entity:${candidate.entityId}`, reason: "同一 entityId" });
  if (name) keys.push({ key: `name:${candidate.type}:${name}`, reason: "同类型名称相同" });
  for (const alias of candidate.aliases || []) {
    const normalizedAlias = normalizeMatchValue(alias);
    if (normalizedAlias && normalizedAlias.length >= 8) {
      keys.push({ key: `alias:${candidate.type}:${normalizedAlias}`, reason: "同类型别名相同" });
    }
  }
  if (domain) keys.push({ key: `domain:${domain}`, reason: "官网或证据域名相同" });

  for (const [key, reason] of [
    ["qid", "Wikidata QID 相同"],
    ["doi", "DOI 相同"],
    ["openAlexWorkId", "OpenAlex work ID 相同"],
    ["arxivPaperId", "arXiv paper ID 相同"],
    ["authorId", "OpenAlex author ID 相同"],
    ["ror", "ROR ID 相同"]
  ] as const) {
    const value = normalizeMatchValue(payloadString(candidate.payload, key));
    if (value) keys.push({ key: `payload:${key}:${value}`, reason });
  }

  return keys;
}

function entityMatchKeys(entity: Entity) {
  const keys: Array<{ key: string; reason: string }> = [];
  const name = normalizeMatchValue(entity.name);
  const domain = domainFromUrl(entity.website_url);
  if (entity.id) keys.push({ key: `entity:${entity.id}`, reason: "同一 entityId 已存在于主图谱" });
  if (name) keys.push({ key: `name:${entity.type}:${name}`, reason: "与主图谱实体名称相同" });
  for (const alias of entity.aliases || []) {
    const normalizedAlias = normalizeMatchValue(alias);
    if (normalizedAlias && normalizedAlias.length >= 8) {
      keys.push({ key: `alias:${entity.type}:${normalizedAlias}`, reason: "与主图谱实体别名相同" });
    }
  }
  if (domain) keys.push({ key: `domain:${domain}`, reason: "与主图谱实体官网域名相同" });
  return keys;
}

function pushMatchIndex(
  index: Map<string, CandidateEntityDuplicateHint[]>,
  key: string,
  hint: CandidateEntityDuplicateHint
) {
  const rows = index.get(key) || [];
  if (!rows.some((row) => row.id === hint.id && row.source === hint.source)) rows.push(hint);
  index.set(key, rows);
}

function buildEntityMatchIndex(allCandidates: CandidateEntity[]) {
  const index = new Map<string, CandidateEntityDuplicateHint[]>();

  for (const entity of seed.entities) {
    const hint: CandidateEntityDuplicateHint = {
      id: entity.id,
      entityId: entity.id,
      name: entity.name,
      type: entity.type,
      source: "existing_entity",
      status: entity.status,
      reason: "主图谱已有实体"
    };
    for (const match of entityMatchKeys(entity)) pushMatchIndex(index, match.key, { ...hint, reason: match.reason });
  }

  for (const candidate of allCandidates) {
    const hint: CandidateEntityDuplicateHint = {
      id: candidate.id,
      entityId: candidate.entityId,
      name: candidate.name,
      type: candidate.type,
      source: "candidate_entity",
      status: candidate.status,
      reason: "候选实体可能重复",
      evidenceUrl: candidate.evidenceUrl,
      confidence: candidate.confidence,
      extractionMethod: candidate.extractionMethod
    };
    for (const match of candidateEntityMatchKeys(candidate)) pushMatchIndex(index, match.key, { ...hint, reason: match.reason });
  }

  return index;
}

function candidateRelationshipEndpointCounts(relationships: CandidateRelationship[]) {
  const counts = new Map<string, number>();
  for (const relationship of relationships) {
    const endpointIds = new Set(
      [
        relationship.sourceCandidateEntityId,
        relationship.targetCandidateEntityId,
        typeof relationship.payload.sourceCandidateEntityId === "string" ? relationship.payload.sourceCandidateEntityId : undefined,
        typeof relationship.payload.targetCandidateEntityId === "string" ? relationship.payload.targetCandidateEntityId : undefined
      ].filter((value): value is string => Boolean(value))
    );
    for (const endpointId of endpointIds) {
      counts.set(endpointId, (counts.get(endpointId) || 0) + 1);
    }
  }
  return counts;
}

function enrichCandidateEntities(
  candidates: CandidateEntity[],
  allCandidates = candidates,
  candidateRelationships: CandidateRelationship[] = []
): CandidateEntity[] {
  const index = buildEntityMatchIndex(allCandidates);
  const relationshipEndpointCounts = candidateRelationshipEndpointCounts(candidateRelationships);
  return candidates.map((candidate) => {
    const hints = new Map<string, CandidateEntityDuplicateHint>();
    for (const match of candidateEntityMatchKeys(candidate)) {
      for (const hint of index.get(match.key) || []) {
        if (hint.source === "candidate_entity" && hint.id === candidate.id) continue;
        const key = `${hint.source}:${hint.id}`;
        if (!hints.has(key)) hints.set(key, { ...hint, reason: hint.reason || match.reason });
      }
    }
    const duplicateHints = [...hints.values()]
      .sort((a, b) => {
        if (a.source !== b.source) return a.source === "existing_entity" ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 5);
    return {
      ...candidate,
      duplicateHintCount: hints.size,
      duplicateHints,
      candidateRelationshipEndpointCount:
        (relationshipEndpointCounts.get(candidate.entityId) || 0) +
        (candidate.id === candidate.entityId ? 0 : relationshipEndpointCounts.get(candidate.id) || 0)
    };
  });
}

function mergedTargetFromCandidate(candidate: CandidateEntity) {
  return typeof candidate.payload.mergeTargetEntityId === "string" ? candidate.payload.mergeTargetEntityId : undefined;
}

type MergeFieldPolicyEntry = {
  choice: "target" | "candidate" | "manual";
  manualValue?: string;
  candidateValue?: string;
  targetValue?: string;
};

type MergeFieldPolicy = Record<string, MergeFieldPolicyEntry>;

type MergeCandidateEntityTarget = {
  targetEntityId?: string;
  targetCandidateEntityId?: string;
  fieldPolicy?: Record<string, unknown>;
};

function normalizeMergeFieldPolicy(value: unknown): MergeFieldPolicy | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const allowedFields = new Set([
    "name",
    "type",
    "layer",
    "description",
    "websiteUrl",
    "country",
    "status",
    "statusText",
    "valuation",
    "aliases"
  ]);
  const policy: MergeFieldPolicy = {};
  for (const [field, rawEntry] of Object.entries(value as Record<string, unknown>)) {
    if (!allowedFields.has(field) || !rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;
    const entry = rawEntry as Record<string, unknown>;
    const rawChoice = typeof entry.choice === "string" ? entry.choice : "target";
    const choice: MergeFieldPolicyEntry["choice"] =
      rawChoice === "candidate" || rawChoice === "manual" || rawChoice === "target" ? rawChoice : "target";
    policy[field] = {
      choice,
      ...(typeof entry.manualValue === "string" && entry.manualValue.trim() ? { manualValue: entry.manualValue.trim() } : {}),
      ...(typeof entry.candidateValue === "string" ? { candidateValue: entry.candidateValue } : {}),
      ...(typeof entry.targetValue === "string" ? { targetValue: entry.targetValue } : {})
    };
  }
  return Object.keys(policy).length ? policy : undefined;
}

function candidateMergePayload(
  candidate: CandidateEntity,
  targetEntityId: string,
  reviewedAt: string,
  mergeFieldPolicy?: MergeFieldPolicy
) {
  return {
    ...candidate.payload,
    mergeAction: "merged_into_existing_entity",
    mergeTargetEntityId: targetEntityId,
    mergedAt: reviewedAt,
    ...(mergeFieldPolicy ? { mergeFieldPolicy } : {})
  };
}

function candidateToCandidateMergePayload(
  candidate: CandidateEntity,
  targetCandidateEntityId: string,
  reviewedAt: string,
  mergeFieldPolicy?: MergeFieldPolicy
) {
  return {
    ...candidate.payload,
    mergeAction: "merged_into_candidate_entity",
    mergeTargetCandidateEntityId: targetCandidateEntityId,
    mergedAt: reviewedAt,
    ...(mergeFieldPolicy ? { mergeFieldPolicy } : {})
  };
}

function candidateAliasesForMerge(candidate: CandidateEntity) {
  return [candidate.name, ...(candidate.aliases || [])]
    .filter(Boolean)
    .filter((alias, index, rows) => rows.findIndex((item) => item.toLowerCase() === alias.toLowerCase()) === index);
}

function splitAliasValue(value: string | undefined) {
  return String(value || "")
    .split(",")
    .map((alias) => alias.trim())
    .filter(Boolean)
    .filter((alias, index, rows) => rows.findIndex((item) => item.toLowerCase() === alias.toLowerCase()) === index);
}

function nonEmptyFieldValue(value: string | undefined) {
  const trimmed = String(value || "").trim();
  return trimmed && trimmed !== "N/A" ? trimmed : undefined;
}

function mergePolicyValue(
  policy: MergeFieldPolicy | undefined,
  field: string,
  targetValue: string | undefined,
  candidateValue: string | undefined
) {
  const entry = policy?.[field];
  if (!entry) return targetValue;
  if (entry.choice === "candidate") return nonEmptyFieldValue(candidateValue) ?? targetValue;
  if (entry.choice === "manual") return nonEmptyFieldValue(entry.manualValue) ?? targetValue;
  return targetValue;
}

function existingEntityAliasInsertions(candidate: CandidateEntity, mergeFieldPolicy: MergeFieldPolicy | undefined) {
  const aliasPolicy = mergeFieldPolicy?.aliases;
  if (!aliasPolicy) return candidateAliasesForMerge(candidate);
  if (aliasPolicy.choice === "target") return [];
  if (aliasPolicy.choice === "manual") return splitAliasValue(aliasPolicy.manualValue);
  return candidateAliasesForMerge(candidate);
}

function mergedCandidateAliases(
  targetCandidate: CandidateEntity,
  candidate: CandidateEntity,
  mergeFieldPolicy: MergeFieldPolicy | undefined
) {
  const aliasPolicy = mergeFieldPolicy?.aliases;
  if (aliasPolicy?.choice === "target") return candidateAliasesForMerge(targetCandidate);
  if (aliasPolicy?.choice === "candidate") return candidateAliasesForMerge(candidate);
  if (aliasPolicy?.choice === "manual") return splitAliasValue(aliasPolicy.manualValue);
  return [...candidateAliasesForMerge(targetCandidate), ...candidateAliasesForMerge(candidate)].filter(
    (alias, index, rows) => rows.findIndex((item) => item.toLowerCase() === alias.toLowerCase()) === index
  );
}

async function resolveRedirectedEntityId(client: pg.PoolClient, entityId: string) {
  let current = entityId;
  const seen = new Set<string>();
  for (let i = 0; i < 8; i += 1) {
    if (seen.has(current)) break;
    seen.add(current);
    const result = await client.query<{ target_entity_id: string }>(
      "SELECT target_entity_id FROM entity_redirect WHERE old_entity_id = $1",
      [current]
    );
    const next = result.rows[0]?.target_entity_id;
    if (!next || next === current) return current;
    current = next;
  }
  return current;
}

function metricProviderFromSource(sourceId: string | null) {
  if (sourceId === "src_sec") return "sec";
  if (sourceId === "src_github") return "github";
  if (sourceId === "src_hf" || sourceId === "src_huggingface") return "huggingface";
  if (sourceId === "src_openalex") return "openAlex";
  return sourceId || "unknown";
}

function mapMetricRows(rows: DbMetricRow[]): MetricBundle["metrics"] {
  const grouped = new Map<string, MetricBundle["metrics"][number]>();

  rows.forEach((row) => {
    const key = `${row.entity_id}:${row.source_id || "unknown"}:${row.source_ref || ""}:${row.as_of_date}`;
    const existing =
      grouped.get(key) ||
      ({
        entityId: row.entity_id,
        source: metricProviderFromSource(row.source_id),
        sourceRef: row.source_ref || undefined,
        asOf: row.as_of_date,
        metrics: {}
      } satisfies MetricBundle["metrics"][number]);

    existing.metrics[row.metric_type] =
      row.value_number !== null && row.value_number !== undefined ? Number(row.value_number) : row.value_text;
    grouped.set(key, existing);
  });

  return [...grouped.values()];
}

function jsonMetricRefsByEntityId() {
  const refs = new Map<string, string[]>();
  metricBundle.metrics.forEach((entry) => {
    const existing = refs.get(entry.entityId) || [];
    if (entry.sourceRef) existing.push(entry.sourceRef);
    refs.set(entry.entityId, existing);
  });
  return refs;
}

export async function searchEntities(options: EntitySearchOptions) {
  if (!hasDatabase()) {
    const refs = jsonMetricRefsByEntityId();
    const entities = seedEntitiesWithApprovedCandidates();
    const results = entities
      .filter((entity) => {
        if (options.type && entity.type !== options.type) return false;
        if (options.layer && entity.layer !== options.layer) return false;
        if (!options.query) return true;

        const haystack = [
          entity.id,
          entity.name,
          entity.ticker || "",
          entity.exchange || "",
          entity.country || "",
          entity.website_url || "",
          entity.layer,
          entity.type,
          ...(entity.aliases || []),
          ...(refs.get(entity.id) || [])
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(options.query);
      })
      .sort((a, b) => a.layer.localeCompare(b.layer) || a.name.localeCompare(b.name));

      return {
      data: results.slice(0, options.limit),
      count: results.length,
      total: entities.length,
      dataSource: "json-fallback" as DataSource
    };
  }

  const queryPattern = `%${options.query}%`;
  const db = getPool();
  const [result, totalResult] = await Promise.all([
    db.query<DbEntityRow & { total_count: string }>(
    `
      WITH filtered AS (
        SELECT
          e.id,
          e.type,
          e.name,
          e.layer,
          e.description,
          e.website_url,
          e.country,
          e.status,
          e.valuation,
          cp.ticker,
          cp.exchange,
          COALESCE(array_agg(DISTINCT ea.alias) FILTER (WHERE ea.alias IS NOT NULL), '{}') AS aliases
        FROM entity e
        LEFT JOIN company_profile cp ON cp.entity_id = e.id
        LEFT JOIN entity_alias ea ON ea.entity_id = e.id
        LEFT JOIN metric m ON m.entity_id = e.id
        WHERE ($1::text = '' OR e.type = $1)
          AND ($2::text = '' OR e.layer = $2)
          AND (
            $3::text = ''
            OR e.id ILIKE $4
            OR e.name ILIKE $4
            OR e.website_url ILIKE $4
            OR e.country ILIKE $4
            OR e.layer ILIKE $4
            OR e.type ILIKE $4
            OR cp.ticker ILIKE $4
            OR cp.exchange ILIKE $4
            OR ea.alias ILIKE $4
            OR m.source_ref ILIKE $4
          )
        GROUP BY e.id, cp.ticker, cp.exchange
      )
      SELECT *, count(*) OVER() AS total_count
      FROM filtered
      ORDER BY layer, name
      LIMIT $5
    `,
    [options.type, options.layer, options.query, queryPattern, options.limit]
    ),
    db.query<{ count: string }>("SELECT count(*) AS count FROM entity")
  ]);

  return {
    data: result.rows.map(mapEntity),
    count: result.rows.length > 0 ? Number(result.rows[0].total_count) : 0,
    total: Number(totalResult.rows[0].count),
    dataSource: "postgres" as DataSource
  };
}

export async function resolvePublicEntityId(id: string) {
  if (!id) return id;
  if (!hasDatabase()) {
    const store = fallbackReviewStore();
    let current = id;
    const seen = new Set<string>();
    for (let i = 0; i < 8; i += 1) {
      if (seen.has(current)) break;
      seen.add(current);
      const next = store.candidateEntityRedirect.get(current);
      if (!next || next === current) return current;
      current = next;
    }
    return current;
  }

  const client = await getPool().connect();
  try {
    return await resolveRedirectedEntityId(client, id);
  } finally {
    client.release();
  }
}

export async function getEntityDetail(id: string) {
  const resolvedId = await resolvePublicEntityId(id);
  const recentResearchEvents = await recentResearchEventsForEntity(resolvedId);
  if (!hasDatabase()) {
    const entities = seedEntitiesWithApprovedCandidates();
    const entity = entities.find((item) => item.id === resolvedId);
    if (!entity) return null;
    const relationships = [...seed.relationships, ...approvedFallbackCandidateRelationships()]
      .filter((relationship) => relationship.source === entity.id || relationship.target === entity.id)
      .sort((a, b) => b.confidence - a.confidence);
    const relatedIds = new Set(relationships.flatMap((relationship) => [relationship.source, relationship.target]));

    return {
      dataSource: "json-fallback" as DataSource,
      redirectedFrom: resolvedId !== id ? id : undefined,
      redirectedTo: resolvedId !== id ? resolvedId : undefined,
      entity,
      layer: seed.layers.find((layer) => layer.id === entity.layer),
      metrics: [...metricBundle.metrics, ...approvedFallbackCandidateMetrics()].filter((entry) => entry.entityId === entity.id),
      metricFailures: (metricBundle.rejectedOrFailed || []).filter((entry) => entry.entityId === entity.id),
      relationships,
      relatedEntities: entities.filter((item) => relatedIds.has(item.id)),
      recentResearchEvents,
      sources: [
        ...new Map(
          relationships
            .map((relationship) => seed.sources.find((source) => source.id === relationship.sourceId))
            .filter(Boolean)
            .map((source) => [source?.id, source])
        ).values()
      ]
    };
  }

  const entityResult = await getPool().query<DbEntityRow>(
    `
      SELECT
        e.id,
        e.type,
        e.name,
        e.layer,
        e.description,
        e.website_url,
        e.country,
        e.status,
        e.valuation,
        cp.ticker,
        cp.exchange,
        COALESCE(array_agg(DISTINCT ea.alias) FILTER (WHERE ea.alias IS NOT NULL), '{}') AS aliases
      FROM entity e
      LEFT JOIN company_profile cp ON cp.entity_id = e.id
      LEFT JOIN entity_alias ea ON ea.entity_id = e.id
      WHERE e.id = $1
      GROUP BY e.id, cp.ticker, cp.exchange
    `,
    [resolvedId]
  );
  const entity = entityResult.rows[0] ? mapEntity(entityResult.rows[0]) : null;
  if (!entity) return null;

  const relationshipsResult = await getPool().query<DbRelationshipRow>(
    `
      SELECT
        r.id,
        r.source_entity_id,
        r.target_entity_id,
        r.relation_type,
        r.confidence,
        r.note,
        re.source_id,
        re.evidence_title,
        re.evidence_url,
        re.evidence_date,
        re.notes AS evidence_notes
      FROM relationship r
      LEFT JOIN relationship_evidence re ON re.relationship_id = r.id
      WHERE r.source_entity_id = $1 OR r.target_entity_id = $1
      ORDER BY r.confidence DESC
    `,
    [resolvedId]
  );
  const relationships = relationshipsResult.rows.map(mapRelationship);
  const relatedIds = [...new Set(relationships.flatMap((relationship) => [relationship.source, relationship.target]))];
  const metricResult = await getPool().query<DbMetricRow>("SELECT * FROM metric WHERE entity_id = $1 ORDER BY as_of_date DESC", [
    resolvedId
  ]);
  const relatedEntityResult =
    relatedIds.length > 0
      ? await getPool().query<DbEntityRow>(
          `
            SELECT
              e.id,
              e.type,
              e.name,
              e.layer,
              e.description,
              e.website_url,
              e.country,
              e.status,
              e.valuation,
              cp.ticker,
              cp.exchange,
              COALESCE(array_agg(DISTINCT ea.alias) FILTER (WHERE ea.alias IS NOT NULL), '{}') AS aliases
            FROM entity e
            LEFT JOIN company_profile cp ON cp.entity_id = e.id
            LEFT JOIN entity_alias ea ON ea.entity_id = e.id
            WHERE e.id = ANY($1::text[])
            GROUP BY e.id, cp.ticker, cp.exchange
            ORDER BY e.layer, e.name
          `,
          [relatedIds]
        )
      : { rows: [] };
  const sourceResult = await getPool().query<DbSourceRow>(
    `
      SELECT DISTINCT s.id, s.source_type, s.title, s.publisher, s.published_at, s.url, s.fetched_at, s.license_note, s.content_hash, s.note
      FROM source s
      JOIN relationship_evidence re ON re.source_id = s.id
      JOIN relationship r ON r.id = re.relationship_id
      WHERE r.source_entity_id = $1 OR r.target_entity_id = $1
      ORDER BY s.title
    `,
    [resolvedId]
  );

  return {
    dataSource: "postgres" as DataSource,
    redirectedFrom: resolvedId !== id ? id : undefined,
    redirectedTo: resolvedId !== id ? resolvedId : undefined,
    entity,
    layer: seed.layers.find((layer) => layer.id === entity.layer),
    metrics: mapMetricRows(metricResult.rows),
    metricFailures: [],
    relationships,
    relatedEntities: relatedEntityResult.rows.map(mapEntity),
    recentResearchEvents,
    sources: sourceResult.rows.map(mapSource)
  };
}

export async function getGraphSeedData() {
  if (!hasDatabase()) {
    const approvedEntities = seedEntitiesWithApprovedCandidates();
    return {
      dataSource: "json-fallback" as DataSource,
      seed: {
        ...seed,
        entities: approvedEntities,
        relationships: [...seed.relationships, ...approvedFallbackCandidateRelationships()]
      }
    };
  }

  const [entitiesResult, relationshipsResult, sourcesResult] = await Promise.all([
    getPool().query<DbEntityRow>(
      `
        SELECT
          e.id,
          e.type,
          e.name,
          e.layer,
          e.description,
          e.website_url,
          e.country,
          e.status,
          e.valuation,
          cp.ticker,
          cp.exchange,
          COALESCE(array_agg(DISTINCT ea.alias) FILTER (WHERE ea.alias IS NOT NULL), '{}') AS aliases
        FROM entity e
        LEFT JOIN company_profile cp ON cp.entity_id = e.id
        LEFT JOIN entity_alias ea ON ea.entity_id = e.id
        GROUP BY e.id, cp.ticker, cp.exchange
        ORDER BY e.layer, e.name
      `
    ),
    getPool().query<DbRelationshipRow>(
      `
        SELECT
          r.id,
          r.source_entity_id,
          r.target_entity_id,
          r.relation_type,
          r.confidence,
          r.note,
          re.source_id,
          re.evidence_title,
          re.evidence_url,
          re.evidence_date,
          re.notes AS evidence_notes
        FROM relationship r
        LEFT JOIN relationship_evidence re ON re.relationship_id = r.id
        WHERE r.status = 'approved'
        ORDER BY r.id
      `
    ),
    getPool().query<DbSourceRow>(
      "SELECT id, source_type, title, publisher, published_at, url, fetched_at, license_note, content_hash, note FROM source ORDER BY id"
    )
  ]);

  return {
    dataSource: "postgres" as DataSource,
    seed: {
      layers: seed.layers,
      entities: entitiesResult.rows.map(mapEntity),
      sources: sourcesResult.rows.map(mapSource),
      relationships: relationshipsResult.rows.map(mapRelationship),
      relationLabels: seed.relationLabels
    } satisfies SeedData
  };
}

export async function getMetricBundleData() {
  if (!hasDatabase()) {
    return {
      dataSource: "json-fallback" as DataSource,
      metricBundle: {
        ...metricBundle,
        metrics: [...metricBundle.metrics, ...approvedFallbackCandidateMetrics()]
      }
    };
  }

  const result = await getPool().query<DbMetricRow>("SELECT * FROM metric ORDER BY entity_id, as_of_date DESC, source_id");

  return {
    dataSource: "postgres" as DataSource,
    metricBundle: {
      generatedAt: metricBundle.generatedAt,
      approvedAt: metricBundle.approvedAt,
      metrics: mapMetricRows(result.rows),
      rejectedOrFailed: []
    } satisfies MetricBundle
  };
}

export async function listCandidateRelationships(status: CandidateRelationship["status"] | "all" = "candidate") {
  if (!hasDatabase()) {
    const candidates = fallbackCandidates().filter((candidate) => status === "all" || candidate.status === status);
    const store = fallbackReviewStore();
    return {
      dataSource: "json-fallback" as DataSource,
      data: enrichCandidates(candidates),
      auditLog: store.auditLog
    };
  }

  const result = await getPool().query<DbCandidateRelationshipRow>(
    `
      SELECT
        id,
        source_entity_id,
        target_entity_id,
        relation_type,
        confidence,
        evidence_url,
        extraction_method,
        status,
        payload,
        created_at,
        reviewed_at
      FROM candidate_relationship
      WHERE ($1::text = 'all' OR status = $1)
      ORDER BY created_at DESC, id
    `,
    [status]
  );

  return {
    dataSource: "postgres" as DataSource,
    data: enrichCandidates(result.rows.map(mapCandidateRow)),
    auditLog: [] as AuditLogEntry[]
  };
}

function normalizeUserCorrection(input: UserCorrectionSubmission) {
  const subjectEntityId = input.subjectEntityId.trim();
  const targetEntityId = input.targetEntityId?.trim() || undefined;
  const relationType = input.relationType?.trim() || "related_to";
  const note = input.note.trim();
  const evidenceUrl = input.evidenceUrl?.trim() || undefined;
  const contact = input.contact?.trim() || undefined;
  const allowedIssueTypes = new Set<UserCorrectionSubmission["issueType"]>([
    "missing_relationship",
    "wrong_relationship",
    "metric_issue",
    "entity_issue",
    "other"
  ]);
  const issueType = allowedIssueTypes.has(input.issueType) ? input.issueType : "other";

  if (!subjectEntityId) throw new Error("subjectEntityId is required");
  if (!seed.entities.some((entity) => entity.id === subjectEntityId)) {
    throw new Error("subjectEntityId must reference an existing entity");
  }
  if (targetEntityId && !seed.entities.some((entity) => entity.id === targetEntityId)) {
    throw new Error("targetEntityId must reference an existing entity");
  }
  if (!note || note.length < 8) throw new Error("note must be at least 8 characters");
  if (note.length > 1200) throw new Error("note must be 1200 characters or fewer");
  if (evidenceUrl && !/^https?:\/\//i.test(evidenceUrl)) {
    throw new Error("evidenceUrl must start with http:// or https://");
  }
  if (contact && contact.length > 160) throw new Error("contact must be 160 characters or fewer");

  return {
    subjectEntityId,
    targetEntityId,
    relationType,
    issueType,
    note,
    evidenceUrl,
    contact
  } satisfies UserCorrectionSubmission;
}

function correctionToCandidate(input: UserCorrectionSubmission) {
  const normalized = normalizeUserCorrection(input);
  const createdAt = nowIso();
  const id = [
    "user_correction",
    slugPart(normalized.subjectEntityId),
    slugPart(normalized.targetEntityId || "unknown_target"),
    slugPart(normalized.relationType || "related_to"),
    Date.now()
  ].join("_");

  return {
    id,
    sourceEntityId: normalized.subjectEntityId,
    targetEntityId: normalized.targetEntityId,
    relationType: normalized.relationType || "related_to",
    confidence: 0.4,
    evidenceUrl: normalized.evidenceUrl,
    extractionMethod: "user_correction",
    status: "candidate",
    payload: {
      note: normalized.note,
      issueType: normalized.issueType,
      contact: normalized.contact,
      sourceId: "src_manual"
    },
    createdAt
  } satisfies CandidateRelationship;
}

export async function submitUserCorrection(input: UserCorrectionSubmission, actor = "public-user") {
  const candidate = correctionToCandidate(input);

  if (!hasDatabase()) {
    const store = fallbackReviewStore();
    store.userCandidateRelationships.unshift(candidate);
    const auditEntry = {
      id: reviewId("audit", candidate.id),
      actor,
      action: "user_correction.submit",
      targetType: "candidate_relationship",
      targetId: candidate.id,
      afterPayload: candidate,
      createdAt: candidate.createdAt
    } satisfies AuditLogEntry;
    store.auditLog.unshift(auditEntry);

    return {
      dataSource: "json-fallback" as DataSource,
      data: enrichCandidates([candidate])[0],
      auditLogEntry: auditEntry
    };
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO candidate_relationship (
          id,
          source_entity_id,
          target_entity_id,
          relation_type,
          confidence,
          evidence_url,
          extraction_method,
          status,
          payload,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'candidate', $8::jsonb, $9)
      `,
      [
        candidate.id,
        candidate.sourceEntityId || null,
        candidate.targetEntityId || null,
        candidate.relationType,
        candidate.confidence,
        candidate.evidenceUrl || null,
        candidate.extractionMethod,
        JSON.stringify(candidate.payload),
        candidate.createdAt
      ]
    );

    const auditEntry = {
      id: reviewId("audit", candidate.id),
      actor,
      action: "user_correction.submit",
      target_type: "candidate_relationship",
      target_id: candidate.id,
      after_payload: candidate
    };
    await client.query(
      `
        INSERT INTO audit_log (id, actor, action, target_type, target_id, after_payload)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        auditEntry.id,
        actor,
        auditEntry.action,
        auditEntry.target_type,
        auditEntry.target_id,
        JSON.stringify(auditEntry.after_payload)
      ]
    );
    await client.query("COMMIT");

    return {
      dataSource: "postgres" as DataSource,
      data: enrichCandidates([candidate])[0],
      auditLogEntry: {
        id: auditEntry.id,
        actor,
        action: auditEntry.action,
        targetType: auditEntry.target_type,
        targetId: auditEntry.target_id,
        afterPayload: auditEntry.after_payload,
        createdAt: candidate.createdAt
      } satisfies AuditLogEntry
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function normalizeCandidatePatch(patch: CandidateRelationshipPatch) {
  const normalized: CandidateRelationshipPatch = {};
  if (patch.confidence !== undefined) {
    const confidence = Number(patch.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error("confidence must be between 0 and 1");
    }
    normalized.confidence = Number(confidence.toFixed(3));
  }
  if (patch.note !== undefined) normalized.note = patch.note.trim();
  if (patch.sourceId !== undefined) normalized.sourceId = patch.sourceId.trim();
  if (patch.evidenceUrl !== undefined) normalized.evidenceUrl = patch.evidenceUrl.trim();
  return normalized;
}

function patchCandidate(candidate: CandidateRelationship, patch: CandidateRelationshipPatch) {
  return {
    ...candidate,
    confidence: patch.confidence ?? candidate.confidence,
    evidenceUrl: patch.evidenceUrl ?? candidate.evidenceUrl,
    payload: {
      ...candidate.payload,
      ...(patch.note !== undefined ? { note: patch.note } : {}),
      ...(patch.sourceId !== undefined ? { sourceId: patch.sourceId } : {})
    }
  } satisfies CandidateRelationship;
}

function normalizeCandidateMetricPatch(patch: CandidateMetricPatch) {
  const normalized: CandidateMetricPatch = {};
  if (patch.metricType !== undefined) {
    const metricType = patch.metricType.trim();
    if (!metricType) throw new Error("metricType is required");
    normalized.metricType = metricType;
  }
  if (patch.valueNumber !== undefined) {
    const valueNumber = patch.valueNumber === null ? null : Number(patch.valueNumber);
    if (valueNumber !== null && !Number.isFinite(valueNumber)) throw new Error("valueNumber must be numeric");
    normalized.valueNumber = valueNumber;
  }
  if (patch.valueText !== undefined) normalized.valueText = patch.valueText?.trim() || null;
  if (patch.asOfDate !== undefined) {
    const asOfDate = patch.asOfDate.trim();
    if (!asOfDate) throw new Error("asOfDate is required");
    normalized.asOfDate = asOfDate;
  }
  if (patch.sourceId !== undefined) normalized.sourceId = patch.sourceId.trim() || undefined;
  if (patch.sourceRef !== undefined) normalized.sourceRef = patch.sourceRef.trim() || undefined;
  if (patch.confidence !== undefined) {
    const confidence = Number(patch.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error("confidence must be between 0 and 1");
    }
    normalized.confidence = Number(confidence.toFixed(3));
  }
  if (patch.evidenceUrl !== undefined) normalized.evidenceUrl = patch.evidenceUrl.trim() || undefined;
  if (patch.note !== undefined) normalized.note = patch.note.trim();
  return normalized;
}

function patchCandidateMetric(candidate: CandidateMetric, patch: CandidateMetricPatch) {
  return {
    ...candidate,
    metricType: patch.metricType ?? candidate.metricType,
    valueNumber: patch.valueNumber !== undefined ? patch.valueNumber : candidate.valueNumber,
    valueText: patch.valueText !== undefined ? patch.valueText : candidate.valueText,
    asOfDate: patch.asOfDate ?? candidate.asOfDate,
    sourceId: patch.sourceId !== undefined ? patch.sourceId : candidate.sourceId,
    sourceRef: patch.sourceRef !== undefined ? patch.sourceRef : candidate.sourceRef,
    confidence: patch.confidence ?? candidate.confidence,
    evidenceUrl: patch.evidenceUrl !== undefined ? patch.evidenceUrl : candidate.evidenceUrl,
    payload: {
      ...candidate.payload,
      ...(patch.note !== undefined ? { note: patch.note } : {})
    }
  } satisfies CandidateMetric;
}

async function resolveApprovedRelationshipEntityIds(
  client: pg.PoolClient,
  candidate: CandidateRelationship
): Promise<{ sourceEntityId: string; targetEntityId: string }> {
  const sourceCandidateEntityId =
    candidate.sourceCandidateEntityId ||
    (typeof candidate.payload.sourceCandidateEntityId === "string" ? candidate.payload.sourceCandidateEntityId : undefined);
  const targetCandidateEntityId =
    candidate.targetCandidateEntityId ||
    (typeof candidate.payload.targetCandidateEntityId === "string" ? candidate.payload.targetCandidateEntityId : undefined);
  async function resolveEndpoint(entityId: string | undefined, candidateEntityId: string | undefined) {
    if (entityId) return resolveRedirectedEntityId(client, entityId);
    if (!candidateEntityId) return undefined;
    const redirectedCandidateEntityId = await resolveRedirectedEntityId(client, candidateEntityId);
    const candidateResult = await client.query<{ entity_id: string | null; payload: Record<string, unknown> }>(
      `
        SELECT entity_id, payload
        FROM candidate_entity
        WHERE entity_id = $1
          AND status = 'approved'
        LIMIT 1
      `,
      [redirectedCandidateEntityId]
    );
    const candidateEntity = candidateResult.rows[0];
    const mergeTargetEntityId =
      candidateEntity && typeof candidateEntity.payload?.mergeTargetEntityId === "string"
        ? candidateEntity.payload.mergeTargetEntityId
        : undefined;
    return mergeTargetEntityId || candidateEntity?.entity_id || redirectedCandidateEntityId;
  }

  const sourceEntityId = await resolveEndpoint(candidate.sourceEntityId, sourceCandidateEntityId);
  const targetEntityId = await resolveEndpoint(candidate.targetEntityId, targetCandidateEntityId);

  if (!sourceEntityId || !targetEntityId) {
    throw new Error("candidate relationship must have source and target entity ids before approval");
  }

  const result = await client.query<{ id: string }>(
    "SELECT id FROM entity WHERE id = ANY($1::text[])",
    [[sourceEntityId, targetEntityId]]
  );
  const existingEntityIds = new Set(result.rows.map((row) => row.id));
  const missing = [sourceEntityId, targetEntityId].filter((entityId) => !existingEntityIds.has(entityId));
  if (missing.length > 0) {
    throw new Error(`approve candidate entities first: ${missing.join(", ")}`);
  }

  return { sourceEntityId, targetEntityId };
}

export async function updateCandidateRelationship(
  id: string,
  patch: CandidateRelationshipPatch,
  actor = "local-admin"
) {
  const normalized = normalizeCandidatePatch(patch);

  if (!hasDatabase()) {
    const candidate = fallbackCandidates().find((item) => item.id === id);
    if (!candidate) return null;
    const store = fallbackReviewStore();
    const beforePayload = { ...candidate };
    const existingPatch = store.candidatePatch.get(id) || {};
    store.candidatePatch.set(id, {
      ...existingPatch,
      ...normalized
    });
    const updatedCandidate = patchCandidate(candidate, normalized);
    const auditEntry = {
      id: reviewId("audit", id),
      actor,
      action: "candidate_relationship.update",
      targetType: "candidate_relationship",
      targetId: id,
      beforePayload,
      afterPayload: updatedCandidate,
      createdAt: nowIso()
    } satisfies AuditLogEntry;
    store.auditLog.unshift(auditEntry);

    return {
      dataSource: "json-fallback" as DataSource,
      data: enrichCandidates([updatedCandidate])[0],
      auditLogEntry: auditEntry
    };
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const candidateResult = await client.query<DbCandidateRelationshipRow>(
      `
        SELECT
          id,
          source_entity_id,
          target_entity_id,
          relation_type,
          confidence,
          evidence_url,
          extraction_method,
          status,
          payload,
          created_at,
          reviewed_at
        FROM candidate_relationship
        WHERE id = $1
        FOR UPDATE
      `,
      [id]
    );
    const candidate = candidateResult.rows[0] ? mapCandidateRow(candidateResult.rows[0]) : null;
    if (!candidate) {
      await client.query("ROLLBACK");
      return null;
    }

    const updatedCandidate = patchCandidate(candidate, normalized);
    const payload = {
      ...candidate.payload,
      ...(normalized.note !== undefined ? { note: normalized.note } : {}),
      ...(normalized.sourceId !== undefined ? { sourceId: normalized.sourceId } : {})
    };

    await client.query(
      `
        UPDATE candidate_relationship
        SET
          confidence = $2,
          evidence_url = $3,
          payload = $4::jsonb
        WHERE id = $1
      `,
      [id, updatedCandidate.confidence, updatedCandidate.evidenceUrl || null, JSON.stringify(payload)]
    );

    const auditEntry = {
      id: reviewId("audit", id),
      actor,
      action: "candidate_relationship.update",
      target_type: "candidate_relationship",
      target_id: id,
      before_payload: candidate,
      after_payload: updatedCandidate
    };
    await client.query(
      `
        INSERT INTO audit_log (
          id,
          actor,
          action,
          target_type,
          target_id,
          before_payload,
          after_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
      `,
      [
        auditEntry.id,
        auditEntry.actor,
        auditEntry.action,
        auditEntry.target_type,
        auditEntry.target_id,
        JSON.stringify(auditEntry.before_payload),
        JSON.stringify(auditEntry.after_payload)
      ]
    );
    await client.query("COMMIT");

    return {
      dataSource: "postgres" as DataSource,
      data: enrichCandidates([updatedCandidate])[0],
      auditLogEntry: {
        id: auditEntry.id,
        actor,
        action: auditEntry.action,
        targetType: auditEntry.target_type,
        targetId: auditEntry.target_id,
        beforePayload: candidate,
        afterPayload: updatedCandidate,
        createdAt: nowIso()
      } satisfies AuditLogEntry
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function reviewCandidateRelationship(
  id: string,
  action: "approve" | "reject",
  actor = "local-admin"
) {
  const nextStatus = action === "approve" ? "approved" : "rejected";

  if (!hasDatabase()) {
    const candidate = fallbackCandidates().find((item) => item.id === id);
    if (!candidate) return null;
    const store = fallbackReviewStore();
    const beforePayload = { ...candidate };
    const reviewedAt = nowIso();
    store.candidateState.set(id, nextStatus);
    store.reviewedAt.set(id, reviewedAt);
    const afterCandidate = {
      ...candidate,
      status: nextStatus,
      reviewedAt
    } satisfies CandidateRelationship;
    const auditEntry = {
      id: reviewId("audit", id),
      actor,
      action: `candidate_relationship.${action}`,
      targetType: "candidate_relationship",
      targetId: id,
      beforePayload,
      afterPayload: afterCandidate,
      createdAt: reviewedAt
    } satisfies AuditLogEntry;
    store.auditLog.unshift(auditEntry);

    return {
      dataSource: "json-fallback" as DataSource,
      data: enrichCandidates([afterCandidate])[0],
      auditLogEntry: auditEntry
    };
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const candidateResult = await client.query<DbCandidateRelationshipRow>(
      `
        SELECT
          id,
          source_entity_id,
          target_entity_id,
          relation_type,
          confidence,
          evidence_url,
          extraction_method,
          status,
          payload,
          created_at,
          reviewed_at
        FROM candidate_relationship
        WHERE id = $1
        FOR UPDATE
      `,
      [id]
    );
    const candidate = candidateResult.rows[0] ? mapCandidateRow(candidateResult.rows[0]) : null;
    if (!candidate) {
      await client.query("ROLLBACK");
      return null;
    }

    const reviewedAt = nowIso();
    await client.query(
      "UPDATE candidate_relationship SET status = $2, reviewed_at = $3 WHERE id = $1",
      [id, nextStatus, reviewedAt]
    );

    if (action === "approve") {
      const resolved = await resolveApprovedRelationshipEntityIds(client, candidate);
      await client.query(
        `
          INSERT INTO relationship (
            id,
            source_entity_id,
            target_entity_id,
            relation_type,
            confidence,
            is_inferred,
            extraction_method,
            status,
            note
          )
          VALUES ($1, $2, $3, $4, $5, TRUE, $6, 'approved', $7)
          ON CONFLICT (id) DO UPDATE SET
            confidence = EXCLUDED.confidence,
            status = 'approved',
            note = EXCLUDED.note,
            updated_at = now()
        `,
        [
          `approved_${candidate.id}`,
          resolved.sourceEntityId,
          resolved.targetEntityId,
          candidate.relationType,
          candidate.confidence,
          candidate.extractionMethod,
          typeof candidate.payload.note === "string"
            ? candidate.payload.note
            : `Approved candidate relationship from ${candidate.extractionMethod}.`
        ]
      );
    }

    const auditEntry = {
      id: reviewId("audit", id),
      actor,
      action: `candidate_relationship.${action}`,
      target_type: "candidate_relationship",
      target_id: id,
      before_payload: candidate,
      after_payload: {
        ...candidate,
        status: nextStatus,
        reviewedAt
      }
    };
    await client.query(
      `
        INSERT INTO audit_log (
          id,
          actor,
          action,
          target_type,
          target_id,
          before_payload,
          after_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
      `,
      [
        auditEntry.id,
        auditEntry.actor,
        auditEntry.action,
        auditEntry.target_type,
        auditEntry.target_id,
        JSON.stringify(auditEntry.before_payload),
        JSON.stringify(auditEntry.after_payload)
      ]
    );
    await client.query("COMMIT");

    return {
      dataSource: "postgres" as DataSource,
      data: enrichCandidates([
        {
          ...candidate,
          status: nextStatus,
          reviewedAt
        }
      ])[0],
      auditLogEntry: {
        id: auditEntry.id,
        actor,
        action: auditEntry.action,
        targetType: auditEntry.target_type,
        targetId: auditEntry.target_id,
        beforePayload: candidate,
        afterPayload: auditEntry.after_payload,
        createdAt: reviewedAt
      } satisfies AuditLogEntry
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listCandidateEntities(status: CandidateEntity["status"] | "all" = "candidate") {
  if (!hasDatabase()) {
    const store = fallbackReviewStore();
    const allCandidates = fallbackCandidateEntities();
    const candidateRelationships = fallbackCandidates();
    return {
      dataSource: "json-fallback" as DataSource,
      data: enrichCandidateEntities(
        allCandidates.filter((candidate) => status === "all" || candidate.status === status),
        allCandidates,
        candidateRelationships
      ),
      auditLog: store.auditLog
    };
  }

  const result = await getPool().query<DbCandidateEntityRow>(
    `
      SELECT
        id,
        entity_id,
        type,
        name,
        layer,
        description,
        website_url,
        country,
        status_text,
        valuation,
        aliases,
        confidence,
        evidence_url,
        extraction_method,
        status,
        payload,
        created_at,
        reviewed_at
      FROM candidate_entity
      WHERE ($1::text = 'all' OR status = $1)
      ORDER BY created_at DESC, id
    `,
    [status]
  );
  const allResult = await getPool().query<DbCandidateEntityRow>(
    `
      SELECT
        id,
        entity_id,
        type,
        name,
        layer,
        description,
        website_url,
        country,
        status_text,
        valuation,
        aliases,
        confidence,
        evidence_url,
        extraction_method,
        status,
        payload,
        created_at,
        reviewed_at
      FROM candidate_entity
      ORDER BY created_at DESC, id
    `
  );
  const allCandidates = allResult.rows.map(mapCandidateEntityRow);
  const relationshipResult = await getPool().query<DbCandidateRelationshipRow>(
    `
      SELECT
        id,
        source_entity_id,
        target_entity_id,
        relation_type,
        confidence,
        evidence_url,
        extraction_method,
        status,
        payload,
        created_at,
        reviewed_at
      FROM candidate_relationship
      ORDER BY created_at DESC, id
    `
  );

  return {
    dataSource: "postgres" as DataSource,
    data: enrichCandidateEntities(result.rows.map(mapCandidateEntityRow), allCandidates, relationshipResult.rows.map(mapCandidateRow)),
    auditLog: [] as AuditLogEntry[]
  };
}

export async function listCandidateMetrics(status: CandidateMetric["status"] | "all" = "candidate") {
  if (!hasDatabase()) {
    const store = fallbackReviewStore();
    return {
      dataSource: "json-fallback" as DataSource,
      data: enrichCandidateMetrics(fallbackCandidateMetrics().filter((candidate) => status === "all" || candidate.status === status)),
      auditLog: store.auditLog
    };
  }

  const result = await getPool().query<DbCandidateMetricRow>(
    `
      SELECT
        id,
        entity_id,
        metric_type,
        value_number,
        value_text,
        as_of_date,
        source_id,
        source_ref,
        confidence,
        evidence_url,
        extraction_method,
        status,
        payload,
        created_at,
        reviewed_at
      FROM candidate_metric
      WHERE ($1::text = 'all' OR status = $1)
      ORDER BY created_at DESC, id
    `,
    [status]
  );

  return {
    dataSource: "postgres" as DataSource,
    data: enrichCandidateMetrics(result.rows.map(mapCandidateMetricRow)),
    auditLog: [] as AuditLogEntry[]
  };
}

export async function reviewCandidateEntity(
  id: string,
  action: "approve" | "reject",
  actor = "local-admin"
) {
  const nextStatus = action === "approve" ? "approved" : "rejected";

  if (!hasDatabase()) {
    const candidate = fallbackCandidateEntities().find((item) => item.id === id);
    if (!candidate) return null;
    const store = fallbackReviewStore();
    const reviewedAt = nowIso();
    store.candidateEntityState.set(id, nextStatus);
    store.reviewedAt.set(id, reviewedAt);
    const afterCandidate = { ...candidate, status: nextStatus, reviewedAt } satisfies CandidateEntity;
    const auditEntry = {
      id: reviewId("audit", id),
      actor,
      action: `candidate_entity.${action}`,
      targetType: "candidate_entity",
      targetId: id,
      beforePayload: candidate,
      afterPayload: afterCandidate,
      createdAt: reviewedAt
    } satisfies AuditLogEntry;
    store.auditLog.unshift(auditEntry);
    return {
      dataSource: "json-fallback" as DataSource,
      data: enrichCandidateEntities([afterCandidate], fallbackCandidateEntities())[0],
      auditLogEntry: auditEntry
    };
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<DbCandidateEntityRow>(
      `
        SELECT
          id,
          entity_id,
          type,
          name,
          layer,
          description,
          website_url,
          country,
          status_text,
          valuation,
          aliases,
          confidence,
          evidence_url,
          extraction_method,
          status,
          payload,
          created_at,
          reviewed_at
        FROM candidate_entity
        WHERE id = $1
        FOR UPDATE
      `,
      [id]
    );
    const candidate = result.rows[0] ? mapCandidateEntityRow(result.rows[0]) : null;
    if (!candidate) {
      await client.query("ROLLBACK");
      return null;
    }

    const reviewedAt = nowIso();
    await client.query("UPDATE candidate_entity SET status = $2, reviewed_at = $3 WHERE id = $1", [id, nextStatus, reviewedAt]);

    if (action === "approve") {
      await client.query(
        `
          INSERT INTO entity (
            id,
            type,
            name,
            slug,
            layer,
            description,
            website_url,
            country,
            status,
            valuation
          )
          VALUES ($1, $2, $3, $1, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
            type = EXCLUDED.type,
            name = EXCLUDED.name,
            layer = EXCLUDED.layer,
            description = EXCLUDED.description,
            website_url = EXCLUDED.website_url,
            country = EXCLUDED.country,
            status = EXCLUDED.status,
            valuation = EXCLUDED.valuation,
            updated_at = now()
        `,
        [
          candidate.entityId,
          candidate.type,
          candidate.name,
          candidate.layer,
          candidate.description,
          candidate.websiteUrl || null,
          candidate.country || null,
          candidate.statusText,
          candidate.valuation || null
        ]
      );
      for (const alias of candidate.aliases) {
        await client.query(
          `
            INSERT INTO entity_alias (id, entity_id, alias, alias_type, source_id)
            VALUES ($1, $2, $3, 'name', NULL)
            ON CONFLICT (id) DO NOTHING
          `,
          [`alias_${candidate.entityId}_${alias.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, candidate.entityId, alias]
        );
      }
    }

    const afterCandidate = { ...candidate, status: nextStatus, reviewedAt } satisfies CandidateEntity;
    const auditId = reviewId("audit", id);
    await client.query(
      `
        INSERT INTO audit_log (id, actor, action, target_type, target_id, before_payload, after_payload)
        VALUES ($1, $2, $3, 'candidate_entity', $4, $5::jsonb, $6::jsonb)
      `,
      [auditId, actor, `candidate_entity.${action}`, id, JSON.stringify(candidate), JSON.stringify(afterCandidate)]
    );
    await client.query("COMMIT");
    return {
      dataSource: "postgres" as DataSource,
      data: enrichCandidateEntities([afterCandidate], [afterCandidate])[0],
      auditLogEntry: {
        id: auditId,
        actor,
        action: `candidate_entity.${action}`,
        targetType: "candidate_entity",
        targetId: id,
        beforePayload: candidate,
        afterPayload: afterCandidate,
        createdAt: reviewedAt
      } satisfies AuditLogEntry
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function mergeCandidateEntity(
  id: string,
  target: MergeCandidateEntityTarget | string,
  actor = "local-admin"
) {
  const targetEntityId = typeof target === "string" ? target : target.targetEntityId;
  const targetCandidateEntityId = typeof target === "string" ? undefined : target.targetCandidateEntityId;
  const mergeFieldPolicy = typeof target === "string" ? undefined : normalizeMergeFieldPolicy(target.fieldPolicy);
  if (!targetEntityId && !targetCandidateEntityId) throw new Error("targetEntityId or targetCandidateEntityId is required");

  if (!hasDatabase()) {
    const candidate = fallbackCandidateEntities().find((item) => item.id === id);
    if (!candidate) return null;
    const store = fallbackReviewStore();
    const reviewedAt = nowIso();
    store.candidateEntityState.set(id, "approved");
    const targetCandidate = targetCandidateEntityId
      ? fallbackCandidateEntities().find((item) => item.entityId === targetCandidateEntityId || item.id === targetCandidateEntityId)
      : undefined;
    const targetEntity = targetEntityId ? seedEntitiesWithApprovedCandidates().find((entity) => entity.id === targetEntityId) : undefined;
    if (targetEntityId && !targetEntity) throw new Error(`target entity not found: ${targetEntityId}`);
    if (targetCandidateEntityId && !targetCandidate) throw new Error(`target candidate entity not found: ${targetCandidateEntityId}`);
    const resolvedTargetId = targetEntity?.id || targetCandidate?.entityId || "";
    if (targetEntity) store.candidateEntityMergeTarget.set(id, targetEntity.id);
    store.candidateEntityRedirect.set(candidate.entityId, resolvedTargetId);
    store.reviewedAt.set(id, reviewedAt);
    const afterCandidate = {
      ...candidate,
      status: "approved",
      reviewedAt,
      payload: targetEntity
        ? candidateMergePayload(candidate, targetEntity.id, reviewedAt, mergeFieldPolicy)
        : candidateToCandidateMergePayload(candidate, resolvedTargetId, reviewedAt, mergeFieldPolicy)
    } satisfies CandidateEntity;
    const auditEntry = {
      id: reviewId("audit", id),
      actor,
      action: targetEntity ? "candidate_entity.merge" : "candidate_entity.merge_candidate",
      targetType: "candidate_entity",
      targetId: id,
      beforePayload: candidate,
      afterPayload: {
        ...afterCandidate,
        mergeTargetEntity: targetEntity,
        mergeTargetCandidateEntity: targetCandidate,
        mergeFieldPolicy
      },
      createdAt: reviewedAt
    } satisfies AuditLogEntry;
    store.auditLog.unshift(auditEntry);
    return {
      dataSource: "json-fallback" as DataSource,
      data: enrichCandidateEntities([afterCandidate], fallbackCandidateEntities())[0],
      auditLogEntry: auditEntry
    };
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const candidateResult = await client.query<DbCandidateEntityRow>(
      `
        SELECT
          id,
          entity_id,
          type,
          name,
          layer,
          description,
          website_url,
          country,
          status_text,
          valuation,
          aliases,
          confidence,
          evidence_url,
          extraction_method,
          status,
          payload,
          created_at,
          reviewed_at
        FROM candidate_entity
        WHERE id = $1
        FOR UPDATE
      `,
      [id]
    );
    const candidate = candidateResult.rows[0] ? mapCandidateEntityRow(candidateResult.rows[0]) : null;
    if (!candidate) {
      await client.query("ROLLBACK");
      return null;
    }

    const targetResult = targetEntityId
      ? await client.query<{
          id: string;
          type: string;
          name: string;
          layer: string;
          description: string;
          website_url: string | null;
          country: string | null;
          status: string;
          valuation: string | null;
        }>(
          `
            SELECT id, type, name, layer, description, website_url, country, status, valuation
            FROM entity
            WHERE id = $1
          `,
          [targetEntityId]
        )
      : { rows: [] };
    const targetEntity = targetResult.rows[0];
    if (targetEntityId && !targetEntity) throw new Error(`target entity not found: ${targetEntityId}`);

    const targetCandidateResult = targetCandidateEntityId
      ? await client.query<DbCandidateEntityRow>(
          `
            SELECT
              id,
              entity_id,
              type,
              name,
              layer,
              description,
              website_url,
              country,
              status_text,
              valuation,
              aliases,
              confidence,
              evidence_url,
              extraction_method,
              status,
              payload,
              created_at,
              reviewed_at
            FROM candidate_entity
            WHERE (entity_id = $1 OR id = $1)
              AND id <> $2
            LIMIT 1
            FOR UPDATE
          `,
          [targetCandidateEntityId, id]
        )
      : { rows: [] };
    const targetCandidate = targetCandidateResult.rows[0] ? mapCandidateEntityRow(targetCandidateResult.rows[0]) : null;
    if (targetCandidateEntityId && !targetCandidate) throw new Error(`target candidate entity not found: ${targetCandidateEntityId}`);
    const resolvedTargetId = targetEntity?.id || targetCandidate?.entityId || "";

    const reviewedAt = nowIso();
    const afterCandidate = {
      ...candidate,
      status: "approved",
      reviewedAt,
      payload: targetEntity
        ? candidateMergePayload(candidate, targetEntity.id, reviewedAt, mergeFieldPolicy)
        : candidateToCandidateMergePayload(candidate, resolvedTargetId, reviewedAt, mergeFieldPolicy)
    } satisfies CandidateEntity;

    await client.query(
      "UPDATE candidate_entity SET status = 'approved', reviewed_at = $2, payload = $3::jsonb WHERE id = $1",
      [id, reviewedAt, JSON.stringify(afterCandidate.payload)]
    );

    let rehangCount = 0;
    if (targetEntity) {
      const nextEntityFields = {
        name: mergePolicyValue(mergeFieldPolicy, "name", targetEntity.name, candidate.name) || targetEntity.name,
        type: mergePolicyValue(mergeFieldPolicy, "type", targetEntity.type, candidate.type) || targetEntity.type,
        layer: mergePolicyValue(mergeFieldPolicy, "layer", targetEntity.layer, candidate.layer) || targetEntity.layer,
        description:
          mergePolicyValue(mergeFieldPolicy, "description", targetEntity.description, candidate.description) ||
          targetEntity.description,
        websiteUrl:
          mergePolicyValue(mergeFieldPolicy, "websiteUrl", targetEntity.website_url || undefined, candidate.websiteUrl) ||
          targetEntity.website_url ||
          null,
        country:
          mergePolicyValue(mergeFieldPolicy, "country", targetEntity.country || undefined, candidate.country) ||
          targetEntity.country ||
          null,
        status:
          mergePolicyValue(mergeFieldPolicy, "status", targetEntity.status, candidate.statusText) || targetEntity.status,
        valuation:
          mergePolicyValue(mergeFieldPolicy, "valuation", targetEntity.valuation || undefined, candidate.valuation) ||
          targetEntity.valuation ||
          null
      };
      if (mergeFieldPolicy) {
        await client.query(
          `
            UPDATE entity
            SET
              name = $2,
              type = $3,
              layer = $4,
              description = $5,
              website_url = $6,
              country = $7,
              status = $8,
              valuation = $9,
              updated_at = now()
            WHERE id = $1
          `,
          [
            targetEntity.id,
            nextEntityFields.name,
            nextEntityFields.type,
            nextEntityFields.layer,
            nextEntityFields.description,
            nextEntityFields.websiteUrl,
            nextEntityFields.country,
            nextEntityFields.status,
            nextEntityFields.valuation
          ]
        );
      }
      for (const alias of existingEntityAliasInsertions(candidate, mergeFieldPolicy)) {
        await client.query(
          `
            INSERT INTO entity_alias (id, entity_id, alias, alias_type, source_id)
            VALUES ($1, $2, $3, 'candidate_merge', NULL)
            ON CONFLICT DO NOTHING
          `,
          [`alias_${targetEntity.id}_${slugPart(alias)}`, targetEntity.id, alias]
        );
      }
    } else if (targetCandidate) {
      const mergedAliases = mergedCandidateAliases(targetCandidate, candidate, mergeFieldPolicy);
      const mergedPayload = {
        ...targetCandidate.payload,
        mergedCandidateEntityIds: [
          ...new Set([
            ...((Array.isArray(targetCandidate.payload.mergedCandidateEntityIds)
              ? targetCandidate.payload.mergedCandidateEntityIds.filter((item): item is string => typeof item === "string")
              : []) as string[]),
            candidate.entityId
          ])
        ],
        ...(mergeFieldPolicy ? { mergeFieldPolicyAppliedFromCandidateId: candidate.entityId } : {})
      };
      const nextTargetCandidateFields = {
        name: mergePolicyValue(mergeFieldPolicy, "name", targetCandidate.name, candidate.name) || targetCandidate.name,
        type: mergePolicyValue(mergeFieldPolicy, "type", targetCandidate.type, candidate.type) || targetCandidate.type,
        layer: mergePolicyValue(mergeFieldPolicy, "layer", targetCandidate.layer, candidate.layer) || targetCandidate.layer,
        description:
          mergePolicyValue(mergeFieldPolicy, "description", targetCandidate.description, candidate.description) ||
          targetCandidate.description,
        websiteUrl:
          mergePolicyValue(mergeFieldPolicy, "websiteUrl", targetCandidate.websiteUrl, candidate.websiteUrl) ||
          targetCandidate.websiteUrl ||
          null,
        country:
          mergePolicyValue(mergeFieldPolicy, "country", targetCandidate.country, candidate.country) ||
          targetCandidate.country ||
          null,
        statusText:
          mergePolicyValue(mergeFieldPolicy, "status", targetCandidate.statusText, candidate.statusText) ||
          targetCandidate.statusText,
        valuation:
          mergePolicyValue(mergeFieldPolicy, "valuation", targetCandidate.valuation, candidate.valuation) ||
          targetCandidate.valuation ||
          null
      };
      await client.query(
        `
          UPDATE candidate_entity
          SET
            name = $2,
            type = $3,
            layer = $4,
            description = $5,
            website_url = $6,
            country = $7,
            status_text = $8,
            valuation = $9,
            aliases = $10::jsonb,
            payload = $11::jsonb
          WHERE id = $1
        `,
        [
          targetCandidate.id,
          nextTargetCandidateFields.name,
          nextTargetCandidateFields.type,
          nextTargetCandidateFields.layer,
          nextTargetCandidateFields.description,
          nextTargetCandidateFields.websiteUrl,
          nextTargetCandidateFields.country,
          nextTargetCandidateFields.statusText,
          nextTargetCandidateFields.valuation,
          JSON.stringify(mergedAliases),
          JSON.stringify(mergedPayload)
        ]
      );
      const relationshipResult = await client.query<DbCandidateRelationshipRow>(
        `
          SELECT
            id,
            source_entity_id,
            target_entity_id,
            relation_type,
            confidence,
            evidence_url,
            extraction_method,
            status,
            payload,
            created_at,
            reviewed_at
          FROM candidate_relationship
          WHERE payload ? 'sourceCandidateEntityId'
             OR payload ? 'targetCandidateEntityId'
          FOR UPDATE
        `
      );
      for (const row of relationshipResult.rows) {
        const payload = { ...(row.payload || {}) };
        let changed = false;
        if (payload.sourceCandidateEntityId === candidate.entityId) {
          payload.sourceCandidateEntityId = targetCandidate.entityId;
          payload.sourceCandidateName = targetCandidate.name;
          changed = true;
        }
        if (payload.targetCandidateEntityId === candidate.entityId) {
          payload.targetCandidateEntityId = targetCandidate.entityId;
          payload.targetCandidateName = targetCandidate.name;
          changed = true;
        }
        if (changed) {
          payload.redirectedCandidateEntityIds = [
            ...new Set([
              ...((Array.isArray(payload.redirectedCandidateEntityIds)
                ? payload.redirectedCandidateEntityIds.filter((item): item is string => typeof item === "string")
                : []) as string[]),
              candidate.entityId
            ])
          ];
          await client.query("UPDATE candidate_relationship SET payload = $2::jsonb WHERE id = $1", [
            row.id,
            JSON.stringify(payload)
          ]);
          rehangCount += 1;
        }
      }
    }

    await client.query(
      `
        INSERT INTO entity_redirect (old_entity_id, target_entity_id, redirect_type, source_type)
        VALUES ($1, $2, 'merge', 'candidate_entity')
        ON CONFLICT (old_entity_id) DO UPDATE SET
          target_entity_id = EXCLUDED.target_entity_id,
          redirect_type = EXCLUDED.redirect_type,
          source_type = EXCLUDED.source_type
      `,
      [candidate.entityId, resolvedTargetId]
    );

    const auditId = reviewId("audit", id);
    const action = targetEntity ? "candidate_entity.merge" : "candidate_entity.merge_candidate";
    await client.query(
      `
        INSERT INTO audit_log (id, actor, action, target_type, target_id, before_payload, after_payload)
        VALUES ($1, $2, $3, 'candidate_entity', $4, $5::jsonb, $6::jsonb)
      `,
      [
        auditId,
        actor,
        action,
        id,
        JSON.stringify(candidate),
        JSON.stringify({
          ...afterCandidate,
          mergeTargetEntity: targetEntity,
          mergeTargetCandidateEntity: targetCandidate,
          rehangCount,
          mergeFieldPolicy
        })
      ]
    );
    await client.query("COMMIT");
    return {
      dataSource: "postgres" as DataSource,
      data: enrichCandidateEntities([afterCandidate], [afterCandidate])[0],
      auditLogEntry: {
        id: auditId,
        actor,
        action,
        targetType: "candidate_entity",
        targetId: id,
        beforePayload: candidate,
        afterPayload: {
          ...afterCandidate,
          mergeTargetEntity: targetEntity,
          mergeTargetCandidateEntity: targetCandidate,
          rehangCount,
          mergeFieldPolicy
        },
        createdAt: reviewedAt
      } satisfies AuditLogEntry
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateCandidateMetric(
  id: string,
  patch: CandidateMetricPatch,
  actor = "local-admin"
) {
  const normalized = normalizeCandidateMetricPatch(patch);

  if (!hasDatabase()) {
    const candidate = fallbackCandidateMetrics().find((item) => item.id === id);
    if (!candidate) return null;
    const store = fallbackReviewStore();
    const beforePayload = { ...candidate };
    const existingPatch = store.candidateMetricPatch.get(id) || {};
    store.candidateMetricPatch.set(id, {
      ...existingPatch,
      ...normalized
    });
    const updatedCandidate = patchCandidateMetric(candidate, normalized);
    const auditEntry = {
      id: reviewId("audit", id),
      actor,
      action: "candidate_metric.update",
      targetType: "candidate_metric",
      targetId: id,
      beforePayload,
      afterPayload: updatedCandidate,
      createdAt: nowIso()
    } satisfies AuditLogEntry;
    store.auditLog.unshift(auditEntry);

    return {
      dataSource: "json-fallback" as DataSource,
      data: enrichCandidateMetrics([updatedCandidate])[0],
      auditLogEntry: auditEntry
    };
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<DbCandidateMetricRow>(
      `
        SELECT
          id,
          entity_id,
          metric_type,
          value_number,
          value_text,
          as_of_date,
          source_id,
          source_ref,
          confidence,
          evidence_url,
          extraction_method,
          status,
          payload,
          created_at,
          reviewed_at
        FROM candidate_metric
        WHERE id = $1
        FOR UPDATE
      `,
      [id]
    );
    const candidate = result.rows[0] ? mapCandidateMetricRow(result.rows[0]) : null;
    if (!candidate) {
      await client.query("ROLLBACK");
      return null;
    }

    const updatedCandidate = patchCandidateMetric(candidate, normalized);
    await client.query(
      `
        UPDATE candidate_metric
        SET
          metric_type = $2,
          value_number = $3,
          value_text = $4,
          as_of_date = $5,
          source_id = $6,
          source_ref = $7,
          confidence = $8,
          evidence_url = $9,
          payload = $10::jsonb
        WHERE id = $1
      `,
      [
        id,
        updatedCandidate.metricType,
        updatedCandidate.valueNumber ?? null,
        updatedCandidate.valueText ?? null,
        updatedCandidate.asOfDate,
        updatedCandidate.sourceId || null,
        updatedCandidate.sourceRef || null,
        updatedCandidate.confidence,
        updatedCandidate.evidenceUrl || null,
        JSON.stringify(updatedCandidate.payload)
      ]
    );

    const auditId = reviewId("audit", id);
    const createdAt = nowIso();
    await client.query(
      `
        INSERT INTO audit_log (id, actor, action, target_type, target_id, before_payload, after_payload)
        VALUES ($1, $2, 'candidate_metric.update', 'candidate_metric', $3, $4::jsonb, $5::jsonb)
      `,
      [auditId, actor, id, JSON.stringify(candidate), JSON.stringify(updatedCandidate)]
    );
    await client.query("COMMIT");

    return {
      dataSource: "postgres" as DataSource,
      data: enrichCandidateMetrics([updatedCandidate])[0],
      auditLogEntry: {
        id: auditId,
        actor,
        action: "candidate_metric.update",
        targetType: "candidate_metric",
        targetId: id,
        beforePayload: candidate,
        afterPayload: updatedCandidate,
        createdAt
      } satisfies AuditLogEntry
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function reviewCandidateMetric(
  id: string,
  action: "approve" | "reject",
  actor = "local-admin"
) {
  const nextStatus = action === "approve" ? "approved" : "rejected";

  if (!hasDatabase()) {
    const candidate = fallbackCandidateMetrics().find((item) => item.id === id);
    if (!candidate) return null;
    const store = fallbackReviewStore();
    const reviewedAt = nowIso();
    store.candidateMetricState.set(id, nextStatus);
    store.reviewedAt.set(id, reviewedAt);
    const afterCandidate = { ...candidate, status: nextStatus, reviewedAt } satisfies CandidateMetric;
    const auditEntry = {
      id: reviewId("audit", id),
      actor,
      action: `candidate_metric.${action}`,
      targetType: "candidate_metric",
      targetId: id,
      beforePayload: candidate,
      afterPayload: afterCandidate,
      createdAt: reviewedAt
    } satisfies AuditLogEntry;
    store.auditLog.unshift(auditEntry);
    return {
      dataSource: "json-fallback" as DataSource,
      data: enrichCandidateMetrics([afterCandidate])[0],
      auditLogEntry: auditEntry
    };
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<DbCandidateMetricRow>(
      `
        SELECT
          id,
          entity_id,
          metric_type,
          value_number,
          value_text,
          as_of_date,
          source_id,
          source_ref,
          confidence,
          evidence_url,
          extraction_method,
          status,
          payload,
          created_at,
          reviewed_at
        FROM candidate_metric
        WHERE id = $1
        FOR UPDATE
      `,
      [id]
    );
    const candidate = result.rows[0] ? mapCandidateMetricRow(result.rows[0]) : null;
    if (!candidate) {
      await client.query("ROLLBACK");
      return null;
    }
    const reviewedAt = nowIso();
    await client.query("UPDATE candidate_metric SET status = $2, reviewed_at = $3 WHERE id = $1", [id, nextStatus, reviewedAt]);

    if (action === "approve") {
      await client.query(
        `
          INSERT INTO metric (
            id,
            entity_id,
            metric_type,
            value_number,
            value_text,
            as_of_date,
            source_id,
            source_ref,
            confidence,
            is_estimated
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
          ON CONFLICT (id) DO UPDATE SET
            metric_type = EXCLUDED.metric_type,
            value_number = EXCLUDED.value_number,
            value_text = EXCLUDED.value_text,
            as_of_date = EXCLUDED.as_of_date,
            source_id = EXCLUDED.source_id,
            source_ref = EXCLUDED.source_ref,
            confidence = EXCLUDED.confidence
        `,
        [
          `approved_${candidate.id}`,
          candidate.entityId,
          candidate.metricType,
          candidate.valueNumber ?? null,
          candidate.valueText ?? null,
          candidate.asOfDate,
          candidate.sourceId || null,
          candidate.sourceRef || null,
          candidate.confidence
        ]
      );
    }

    const afterCandidate = { ...candidate, status: nextStatus, reviewedAt } satisfies CandidateMetric;
    const auditId = reviewId("audit", id);
    await client.query(
      `
        INSERT INTO audit_log (id, actor, action, target_type, target_id, before_payload, after_payload)
        VALUES ($1, $2, $3, 'candidate_metric', $4, $5::jsonb, $6::jsonb)
      `,
      [auditId, actor, `candidate_metric.${action}`, id, JSON.stringify(candidate), JSON.stringify(afterCandidate)]
    );
    await client.query("COMMIT");
    return {
      dataSource: "postgres" as DataSource,
      data: enrichCandidateMetrics([afterCandidate])[0],
      auditLogEntry: {
        id: auditId,
        actor,
        action: `candidate_metric.${action}`,
        targetType: "candidate_metric",
        targetId: id,
        beforePayload: candidate,
        afterPayload: afterCandidate,
        createdAt: reviewedAt
      } satisfies AuditLogEntry
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
