export type Layer = {
  id: string;
  name: string;
  color: string;
  description: string;
};

export type Entity = {
  id: string;
  name: string;
  type: string;
  layer: string;
  status: string;
  ticker?: string;
  valuation: string;
  website_url?: string;
  country?: string;
  exchange?: string;
  aliases?: string[];
  metrics: Record<string, string>;
  description: string;
};

export type Relationship = {
  id: string;
  source: string;
  target: string;
  type: string;
  confidence: number;
  sourceId: string;
  note: string;
  evidenceTitle?: string;
  evidenceUrl?: string;
  evidencePublisher?: string;
  evidenceDate?: string;
  evidenceStrength?: Source["evidenceStrength"];
  evidenceNote?: string;
  reviewStatus?: "reviewed_evidence_backed" | "inferred_ecosystem_mapping" | "needs_direct_evidence";
  reviewNote?: string;
};

export type Source = {
  id: string;
  title: string;
  publisher: string;
  date: string;
  url: string;
  note: string;
  sourceType?: string;
  evidenceStrength?:
    | "official_api"
    | "official_docs"
    | "official_product_overlap"
    | "credible_report"
    | "third_party_index"
    | "manual_seed"
    | "derived";
  licenseNote?: string;
  fetchedAt?: string;
  contentHash?: string;
};

export type SeedData = {
  layers: Layer[];
  entities: Entity[];
  sources: Source[];
  relationships: Relationship[];
  relationLabels: Record<string, string>;
};

export type MetricGroup = {
  entityId: string;
  source: string;
  sourceRef?: string;
  asOf: string;
  metrics: Record<string, string | number | null>;
  evidenceUrl?: string;
  evidenceStrength?: Source["evidenceStrength"];
  collectionMethod?: string;
  reviewNote?: string;
};

export type MetricBundle = {
  generatedAt?: string;
  approvedAt?: string;
  metrics: MetricGroup[];
  rejectedOrFailed?: Array<{
    source: string;
    entityId: string;
    message: string;
    code?: string | null;
    url?: string;
    attempts?: number;
    detail?: string;
  }>;
};

export type DataSource = "postgres" | "json-fallback";

export type GraphData = {
  nodes: Entity[];
  edges: Relationship[];
};

export type EntityDetailData = {
  entity: Entity;
  layer?: Layer;
  metrics: MetricGroup[];
  metricFailures: NonNullable<MetricBundle["rejectedOrFailed"]>;
  relationships: Relationship[];
  relatedEntities: Entity[];
  sources: Source[];
  recentResearchEvents?: ResearchTimelineEvent[];
};

export type ResearchTimelineEvent = {
  id: string;
  date: string;
  type: string;
  title: string;
  entityId: string | null;
  entityName: string | null;
  sourceId: string;
  url: string;
  description: string;
  status?: string;
  confidence?: number;
};

export type CandidateRelationship = {
  id: string;
  sourceEntityId?: string;
  targetEntityId?: string;
  sourceCandidateEntityId?: string;
  targetCandidateEntityId?: string;
  sourceCandidateName?: string;
  targetCandidateName?: string;
  relationType: string;
  confidence: number;
  evidenceUrl?: string;
  extractionMethod: string;
  status: "candidate" | "approved" | "rejected";
  payload: Record<string, unknown>;
  createdAt: string;
  reviewedAt?: string;
};

export type CandidateRelationshipReviewItem = CandidateRelationship & {
  sourceEntity?: Entity;
  targetEntity?: Entity;
};

export type CandidateRelationshipPatch = {
  confidence?: number;
  note?: string;
  sourceId?: string;
  evidenceUrl?: string;
};

export type UserCorrectionSubmission = {
  subjectEntityId: string;
  targetEntityId?: string;
  relationType?: string;
  issueType: "missing_relationship" | "wrong_relationship" | "metric_issue" | "entity_issue" | "other";
  evidenceUrl?: string;
  note: string;
  contact?: string;
};

export type CandidateEntity = {
  id: string;
  entityId: string;
  type: string;
  name: string;
  layer: string;
  description: string;
  websiteUrl?: string;
  country?: string;
  statusText: string;
  valuation?: string;
  aliases: string[];
  confidence: number;
  evidenceUrl?: string;
  extractionMethod: string;
  status: "candidate" | "approved" | "rejected";
  payload: Record<string, unknown>;
  createdAt: string;
  reviewedAt?: string;
  duplicateHintCount?: number;
  duplicateHints?: CandidateEntityDuplicateHint[];
  candidateRelationshipEndpointCount?: number;
};

export type CandidateEntityDuplicateHint = {
  id: string;
  entityId: string;
  name: string;
  type: string;
  source: "existing_entity" | "candidate_entity";
  status?: string;
  reason: string;
  evidenceUrl?: string;
  confidence?: number;
  extractionMethod?: string;
};

export type CandidateMetric = {
  id: string;
  entityId: string;
  metricType: string;
  valueNumber?: number | null;
  valueText?: string | null;
  asOfDate: string;
  sourceId?: string;
  sourceRef?: string;
  confidence: number;
  evidenceUrl?: string;
  extractionMethod: string;
  status: "candidate" | "approved" | "rejected";
  payload: Record<string, unknown>;
  createdAt: string;
  reviewedAt?: string;
};

export type CandidateMetricReviewItem = CandidateMetric & {
  entity?: Entity;
};

export type CandidateMetricPatch = {
  metricType?: string;
  valueNumber?: number | null;
  valueText?: string | null;
  asOfDate?: string;
  sourceId?: string;
  sourceRef?: string;
  confidence?: number;
  evidenceUrl?: string;
  note?: string;
};

export type AuditLogEntry = {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  beforePayload?: Record<string, unknown>;
  afterPayload?: Record<string, unknown>;
  createdAt: string;
};
