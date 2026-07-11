"use client";

import { useEffect, useMemo, useState } from "react";
import { ControlPanel, GraphPanel, LayerGrid, StatsGrid } from "@/app/components/CapitalMapPanels";
import { EntityDetailPanel, SourceModal } from "@/app/components/EntityDetailPanel";
import { fetchEntityDetail, fetchEntitySearch, fetchGraphData } from "@/lib/api-client";
import { buildVisibleGraph } from "@/lib/graph";
import { formatDataSource } from "@/lib/ui-formatters";
import type {
  DataSource,
  Entity,
  EntityDetailData,
  GraphData,
  Layer,
  MetricBundle,
  SeedData,
  Source
} from "@/lib/types";

type GraphNode = Entity & { x: number; y: number };

const DEFAULT_DEPTH = "1";
const DEFAULT_CONFIDENCE = 0.6;
const DEFAULT_RELATION_TYPE = "all";

type QueryState = {
  selectedId: string;
  search: string;
  depth: string;
  minConfidence: number;
  relationType: string;
};

type LoadStatus = "idle" | "loading" | "error";

function readQueryState(
  search: string,
  relationTypes: Set<string>,
  defaultSelectedId: string
): QueryState {
  const params = new URLSearchParams(search);
  const entityParam = params.get("entity") || defaultSelectedId;
  const depthParam = params.get("depth") || DEFAULT_DEPTH;
  const confidenceParam = Number(params.get("minConfidence"));
  const relationTypeParam = params.get("relationType") || DEFAULT_RELATION_TYPE;

  return {
    selectedId: entityParam.trim() || defaultSelectedId,
    search: params.get("q") || "",
    depth: ["1", "2", "all"].includes(depthParam) ? depthParam : DEFAULT_DEPTH,
    minConfidence:
      Number.isFinite(confidenceParam) && confidenceParam >= 0.3 && confidenceParam <= 1
        ? Number(confidenceParam.toFixed(2))
        : DEFAULT_CONFIDENCE,
    relationType:
      relationTypeParam === DEFAULT_RELATION_TYPE || relationTypes.has(relationTypeParam)
        ? relationTypeParam
        : DEFAULT_RELATION_TYPE
  };
}

function getInitialQueryState(relationTypes: Set<string>, defaultSelectedId: string) {
  if (typeof window === "undefined") {
    return {
      selectedId: defaultSelectedId,
      search: "",
      depth: DEFAULT_DEPTH,
      minConfidence: DEFAULT_CONFIDENCE,
      relationType: DEFAULT_RELATION_TYPE
    };
  }

  return readQueryState(window.location.search, relationTypes, defaultSelectedId);
}

function buildQueryString(state: QueryState, defaultSelectedId: string) {
  const params = new URLSearchParams();
  if (state.selectedId !== defaultSelectedId) params.set("entity", state.selectedId);
  if (state.search.trim()) params.set("q", state.search.trim());
  if (state.depth !== DEFAULT_DEPTH) params.set("depth", state.depth);
  if (state.minConfidence !== DEFAULT_CONFIDENCE) params.set("minConfidence", state.minConfidence.toFixed(2));
  if (state.relationType !== DEFAULT_RELATION_TYPE) params.set("relationType", state.relationType);
  return params.toString();
}

function withPositions(nodes: Entity[], layers: Layer[]) {
  const grouped = new Map<string, Entity[]>();
  nodes.forEach((entity) => {
    const existing = grouped.get(entity.layer) || [];
    existing.push(entity);
    grouped.set(entity.layer, existing);
  });

  const activeLayers = layers.filter((layer) => grouped.has(layer.id));
  const layerCount = Math.max(activeLayers.length, 1);
  const width = 1120;
  const height = 620;
  const left = 90;
  const right = width - 90;
  const positioned = new Map<string, GraphNode>();

  activeLayers.forEach((layer, layerIndex) => {
    const layerEntities = [...(grouped.get(layer.id) || [])].sort((a, b) => a.name.localeCompare(b.name));
    const x = layerCount === 1 ? width / 2 : left + ((right - left) * layerIndex) / (layerCount - 1);
    const gap = height / (layerEntities.length + 1);
    layerEntities.forEach((entity, entityIndex) => {
      positioned.set(entity.id, {
        ...entity,
        x,
        y: Math.max(68, Math.min(height - 62, gap * (entityIndex + 1)))
      });
    });
  });

  return positioned;
}

function buildLocalDetail(
  seed: SeedData,
  metricBundle: MetricBundle,
  selectedEntity: Entity,
  selectedLayer?: Layer
): EntityDetailData {
  const relationships = seed.relationships
    .filter((relationship) => relationship.source === selectedEntity.id || relationship.target === selectedEntity.id)
    .sort((a, b) => b.confidence - a.confidence);
  const relatedIds = new Set(relationships.flatMap((relationship) => [relationship.source, relationship.target]));

  return {
    entity: selectedEntity,
    layer: selectedLayer,
    metrics: metricBundle.metrics.filter((entry) => entry.entityId === selectedEntity.id),
    metricFailures: (metricBundle.rejectedOrFailed || []).filter((entry) => entry.entityId === selectedEntity.id),
    relationships,
    relatedEntities: seed.entities.filter((entity) => relatedIds.has(entity.id)),
    recentResearchEvents: [],
    sources: [
      ...new Map(
        relationships
          .map((relationship) => seed.sources.find((source) => source.id === relationship.sourceId))
          .filter(Boolean)
          .map((source) => [source?.id, source as Source])
      ).values()
    ]
  };
}

function mergeEntities(...groups: Entity[][]) {
  return new Map(groups.flat().map((entity) => [entity.id, entity]));
}

export default function CapitalMapClient({
  seed,
  metricBundle,
  dataSource
}: {
  seed: SeedData;
  metricBundle: MetricBundle;
  dataSource: DataSource;
}) {
  const entityById = useMemo(() => new Map(seed.entities.map((entity) => [entity.id, entity])), [seed.entities]);
  const layerById = useMemo(() => new Map(seed.layers.map((layer) => [layer.id, layer])), [seed.layers]);
  const relationTypeIds = useMemo(() => new Set(Object.keys(seed.relationLabels)), [seed.relationLabels]);
  const defaultSelectedId = entityById.has("openai") ? "openai" : seed.entities[0]?.id || "";
  const initialQueryState = getInitialQueryState(relationTypeIds, defaultSelectedId);

  const [selectedId, setSelectedId] = useState(initialQueryState.selectedId);
  const [search, setSearch] = useState(initialQueryState.search);
  const [depth, setDepth] = useState(initialQueryState.depth);
  const [minConfidence, setMinConfidence] = useState(initialQueryState.minConfidence);
  const [relationType, setRelationType] = useState(initialQueryState.relationType);
  const [highlightedRelationId, setHighlightedRelationId] = useState<string | null>(null);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [entitySearchResult, setEntitySearchResult] = useState<{
    data: Entity[];
    count: number;
    total: number;
    dataSource: DataSource;
  } | null>(null);
  const [entitySearchStatus, setEntitySearchStatus] = useState<LoadStatus>("idle");
  const [entitySearchError, setEntitySearchError] = useState<string | null>(null);
  const [graphResult, setGraphResult] = useState<{
    data: GraphData;
    dataSource: DataSource;
    selectedId: string;
    redirectedFrom?: string;
    redirectedTo?: string;
  } | null>(null);
  const [graphStatus, setGraphStatus] = useState<LoadStatus>("idle");
  const [graphError, setGraphError] = useState<string | null>(null);
  const [detailResult, setDetailResult] = useState<{
    data: EntityDetailData;
    dataSource: DataSource;
    redirectedFrom?: string;
    redirectedTo?: string;
  } | null>(null);
  const [detailStatus, setDetailStatus] = useState<LoadStatus>("idle");
  const [detailError, setDetailError] = useState<string | null>(null);

  const metricsByEntityId = useMemo(() => {
    const grouped = new Map<string, MetricBundle["metrics"]>();
    metricBundle.metrics.forEach((entry) => {
      const existing = grouped.get(entry.entityId) || [];
      existing.push(entry);
      grouped.set(entry.entityId, existing);
    });
    return grouped;
  }, [metricBundle.metrics]);

  const selectedEntity = entityById.get(selectedId) || detailResult?.data.entity || seed.entities[0];
  const selectedLayer = layerById.get(selectedEntity.layer) || seed.layers[0];
  const relationOptions = Object.keys(seed.relationLabels).sort();

  const localFilteredEntities = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return seed.entities
      .filter((entity) => {
        if (!normalized) return true;
        const haystack = [
          entity.name,
          entity.ticker || "",
          entity.exchange || "",
          entity.country || "",
          entity.website_url || "",
          entity.layer,
          entity.type,
          ...(entity.aliases || []),
          ...(metricsByEntityId.get(entity.id) || []).map((entry) => entry.sourceRef || "")
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalized);
      })
      .sort((a, b) => a.layer.localeCompare(b.layer) || a.name.localeCompare(b.name));
  }, [metricsByEntityId, search, seed.entities]);

  const localVisibleGraph = useMemo(
    () =>
      buildVisibleGraph(seed, {
        selectedId: entityById.has(selectedId) ? selectedId : selectedEntity.id,
        depth,
        minConfidence,
        relationType
      }),
    [depth, entityById, minConfidence, relationType, seed, selectedEntity.id, selectedId]
  );
  const visibleGraph = graphResult?.data || localVisibleGraph;
  const positionedNodes = useMemo(() => withPositions(visibleGraph.nodes, seed.layers), [seed.layers, visibleGraph.nodes]);

  const localDetail = useMemo(
    () => buildLocalDetail(seed, metricBundle, selectedEntity, selectedLayer),
    [metricBundle, seed, selectedEntity, selectedLayer]
  );
  const detail = detailResult?.data || localDetail;
  const detailLayer = detail.layer || selectedLayer;
  const redirectNotice = detailResult?.redirectedFrom && detailResult.redirectedTo
    ? { from: detailResult.redirectedFrom, to: detailResult.redirectedTo }
    : null;
  const incoming = detail.relationships.filter((relationship) => relationship.target === detail.entity.id);
  const outgoing = detail.relationships.filter((relationship) => relationship.source === detail.entity.id);
  const filteredEntities = entitySearchResult?.data || localFilteredEntities;
  const entitySearchCount = entitySearchResult?.count ?? localFilteredEntities.length;
  const entitySearchTotal = entitySearchResult?.total ?? seed.entities.length;
  const combinedEntityById = useMemo(
    () => mergeEntities(seed.entities, visibleGraph.nodes, detail.relatedEntities, [detail.entity]),
    [detail.entity, detail.relatedEntities, seed.entities, visibleGraph.nodes]
  );
  const combinedSourceById = useMemo(
    () => new Map([...seed.sources, ...detail.sources].map((source) => [source.id, source])),
    [detail.sources, seed.sources]
  );
  const activeDataSource =
    graphResult?.dataSource || detailResult?.dataSource || entitySearchResult?.dataSource || dataSource;
  const activeSource = activeSourceId ? combinedSourceById.get(activeSourceId) : null;

  useEffect(() => {
    if (typeof window === "undefined") return;

    function applyQueryState() {
      const next = readQueryState(window.location.search, relationTypeIds, defaultSelectedId);
      setSelectedId((current) => (current === next.selectedId ? current : next.selectedId));
      setSearch((current) => (current === next.search ? current : next.search));
      setDepth((current) => (current === next.depth ? current : next.depth));
      setMinConfidence((current) => (current === next.minConfidence ? current : next.minConfidence));
      setRelationType((current) => (current === next.relationType ? current : next.relationType));
      setHighlightedRelationId(null);
      setActiveSourceId(null);
    }

    applyQueryState();
    window.addEventListener("popstate", applyQueryState);
    return () => window.removeEventListener("popstate", applyQueryState);
  }, [defaultSelectedId, relationTypeIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const nextQuery = buildQueryString(
      {
        selectedId,
        search,
        depth,
        minConfidence,
        relationType
      },
      defaultSelectedId
    );
    const currentQuery = window.location.search.startsWith("?")
      ? window.location.search.slice(1)
      : window.location.search;
    if (nextQuery === currentQuery) return;

    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [defaultSelectedId, depth, minConfidence, relationType, search, selectedId]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setEntitySearchStatus("loading");
      setEntitySearchError(null);

      fetchEntitySearch(search, controller.signal)
        .then((response) => {
          setEntitySearchResult({
            data: response.data,
            count: response.count,
            total: response.total,
            dataSource: response.meta.dataSource
          });
          setEntitySearchStatus("idle");
        })
        .catch((error: Error) => {
          if (error.name === "AbortError") return;
          setEntitySearchResult(null);
          setEntitySearchError("搜索 API 暂不可用，已回退到本地数据。");
          setEntitySearchStatus("error");
        });
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setGraphStatus("loading");
    setGraphError(null);
    setGraphResult(null);

    fetchGraphData(
      {
        entity: selectedId || selectedEntity.id,
        depth,
        minConfidence,
        relationType
      },
      controller.signal
    )
      .then((response) => {
        setGraphResult({
          data: response.data,
          dataSource: response.meta.dataSource,
          selectedId: response.meta.selectedId,
          redirectedFrom: response.meta.redirectedFrom,
          redirectedTo: response.meta.redirectedTo
        });
        setGraphStatus("idle");
      })
      .catch((error: Error) => {
        if (error.name === "AbortError") return;
        setGraphResult(null);
        setGraphError("图谱 API 暂不可用，已回退到本地计算。");
        setGraphStatus("error");
      });

    return () => controller.abort();
  }, [depth, minConfidence, relationType, selectedEntity.id, selectedId]);

  useEffect(() => {
    const controller = new AbortController();
    setDetailStatus("loading");
    setDetailError(null);
    setDetailResult(null);

    fetchEntityDetail(selectedId || selectedEntity.id, controller.signal)
      .then((response) => {
        setDetailResult({
          data: response.data,
          dataSource: response.meta.dataSource,
          redirectedFrom: response.meta.redirectedFrom,
          redirectedTo: response.meta.redirectedTo
        });
        setDetailStatus("idle");
      })
      .catch((error: Error) => {
        if (error.name === "AbortError") return;
        setDetailResult(null);
        setDetailError("详情 API 暂不可用，已回退到本地数据。");
        setDetailStatus("error");
      });

    return () => controller.abort();
  }, [selectedEntity.id, selectedId]);

  function resetView() {
    setSelectedId(defaultSelectedId);
    setSearch("");
    setDepth(DEFAULT_DEPTH);
    setMinConfidence(DEFAULT_CONFIDENCE);
    setRelationType(DEFAULT_RELATION_TYPE);
    setHighlightedRelationId(null);
    setActiveSourceId(null);
  }

  function selectEntity(id: string) {
    setSelectedId(id);
    setHighlightedRelationId(null);
    setActiveSourceId(null);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <strong>AI Capital Map</strong>
          <span>P2 interactive preview</span>
          <span className={`data-source-pill ${activeDataSource}`}>{formatDataSource(activeDataSource)}</span>
        </div>
        <nav>
          <a href="#graph">图谱</a>
          <a href="#detail">详情</a>
          <a href="#sources">来源</a>
          <a href="/research">研究</a>
          <a href="/admin">审核</a>
        </nav>
      </header>

      <StatsGrid
        layerCount={seed.layers.length}
        entityCount={seed.entities.length}
        relationshipCount={seed.relationships.length}
        metricCount={metricBundle.metrics.length}
      />

      <section className="workspace-grid">
        <ControlPanel
          search={search}
          depth={depth}
          minConfidence={minConfidence}
          relationType={relationType}
          relationOptions={relationOptions}
          relationLabels={seed.relationLabels}
          filteredEntities={filteredEntities}
          selectedEntity={selectedEntity}
          layerById={layerById}
          entitySearchStatus={entitySearchStatus}
          entitySearchError={entitySearchError}
          entitySearchCount={entitySearchCount}
          entitySearchTotal={entitySearchTotal}
          seedEntityCount={seed.entities.length}
          metricsByEntityId={metricsByEntityId}
          onSearchChange={setSearch}
          onDepthChange={setDepth}
          onMinConfidenceChange={setMinConfidence}
          onRelationTypeChange={setRelationType}
          onReset={resetView}
          onSelectEntity={selectEntity}
        />

        <GraphPanel
          title={detail.entity.name}
          visibleGraph={visibleGraph}
          layers={seed.layers}
          layerById={layerById}
          positionedNodes={positionedNodes}
          selectedEntityId={graphResult?.selectedId || detail.entity.id}
          highlightedRelationId={highlightedRelationId}
          graphStatus={graphStatus}
          graphError={graphError}
          onSelectEntity={selectEntity}
          onHighlightRelation={setHighlightedRelationId}
        />

        <EntityDetailPanel
          entity={detail.entity}
          layer={detailLayer}
          incoming={incoming}
          outgoing={outgoing}
          entityById={combinedEntityById}
          relationLabels={seed.relationLabels}
          metrics={detail.metrics}
          failures={detail.metricFailures}
          recentResearchEvents={detail.recentResearchEvents}
          sources={detail.sources}
          allRelationships={detail.relationships}
          status={detailStatus}
          error={detailError}
          redirectNotice={redirectNotice}
          onSelectEntity={selectEntity}
          onOpenSource={setActiveSourceId}
        />
      </section>

      <LayerGrid layers={seed.layers} entities={seed.entities} />

      {activeSource ? (
        <SourceModal
          source={activeSource}
          linkedRelationshipCount={detail.relationships.filter((relationship) => relationship.sourceId === activeSource.id).length}
          onClose={() => setActiveSourceId(null)}
        />
      ) : null}
    </main>
  );
}
