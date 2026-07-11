import type { CandidateRelationshipReviewItem, DataSource, Entity, EntityDetailData, GraphData, UserCorrectionSubmission } from "./types";

type ApiMeta = {
  dataSource: DataSource;
};

type EntitySearchResponse = {
  data: Entity[];
  count: number;
  total: number;
  limit: number;
  meta: ApiMeta;
};

type GraphResponse = {
  data: GraphData;
  meta: ApiMeta & {
    selectedId: string;
    depth: string;
    minConfidence: number;
    relationType: string;
    capped: boolean;
    redirectedFrom?: string;
    redirectedTo?: string;
  };
};

type EntityDetailResponse = {
  data: EntityDetailData;
  meta: ApiMeta & {
    redirectedFrom?: string;
    redirectedTo?: string;
  };
};

type CorrectionResponse = {
  data: CandidateRelationshipReviewItem;
  meta: ApiMeta & {
    queued: boolean;
  };
};

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchEntitySearch(query: string, signal: AbortSignal) {
  const params = new URLSearchParams();
  if (query.trim()) params.set("query", query.trim());
  params.set("limit", "80");
  return fetchJson<EntitySearchResponse>(`/api/entities?${params.toString()}`, signal);
}

export async function fetchGraphData(
  options: {
    entity: string;
    depth: string;
    minConfidence: number;
    relationType: string;
  },
  signal: AbortSignal
) {
  const params = new URLSearchParams({
    entity: options.entity,
    depth: options.depth,
    minConfidence: options.minConfidence.toFixed(2),
    relationType: options.relationType
  });
  return fetchJson<GraphResponse>(`/api/graph?${params.toString()}`, signal);
}

export async function fetchEntityDetail(id: string, signal: AbortSignal) {
  return fetchJson<EntityDetailResponse>(`/api/entities/${encodeURIComponent(id)}`, signal);
}

export async function submitCorrection(payload: UserCorrectionSubmission) {
  const response = await fetch("/api/corrections", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Request failed: ${response.status}`);
  }
  return (await response.json()) as CorrectionResponse;
}
