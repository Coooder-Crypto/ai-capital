"use client";

import { shorten } from "@/lib/ui-formatters";
import type { Entity, GraphData, Layer, MetricBundle } from "@/lib/types";

type LoadStatus = "idle" | "loading" | "error";
type PositionedEntity = Entity & { x: number; y: number };

export function StatsGrid({
  layerCount,
  entityCount,
  relationshipCount,
  metricCount
}: {
  layerCount: number;
  entityCount: number;
  relationshipCount: number;
  metricCount: number;
}) {
  return (
    <section className="stats-grid" aria-label="Data summary">
      <Stat label="产业层级" value={layerCount} />
      <Stat label="实体" value={entityCount} />
      <Stat label="关系" value={relationshipCount} />
      <Stat label="公开指标" value={metricCount} />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function ControlPanel({
  search,
  depth,
  minConfidence,
  relationType,
  relationOptions,
  relationLabels,
  filteredEntities,
  selectedEntity,
  layerById,
  entitySearchStatus,
  entitySearchError,
  entitySearchCount,
  entitySearchTotal,
  seedEntityCount,
  metricsByEntityId,
  onSearchChange,
  onDepthChange,
  onMinConfidenceChange,
  onRelationTypeChange,
  onReset,
  onSelectEntity
}: {
  search: string;
  depth: string;
  minConfidence: number;
  relationType: string;
  relationOptions: string[];
  relationLabels: Record<string, string>;
  filteredEntities: Entity[];
  selectedEntity: Entity;
  layerById: Map<string, Layer>;
  entitySearchStatus: LoadStatus;
  entitySearchError: string | null;
  entitySearchCount: number;
  entitySearchTotal: number;
  seedEntityCount: number;
  metricsByEntityId: Map<string, MetricBundle["metrics"]>;
  onSearchChange: (value: string) => void;
  onDepthChange: (value: string) => void;
  onMinConfidenceChange: (value: number) => void;
  onRelationTypeChange: (value: string) => void;
  onReset: () => void;
  onSelectEntity: (id: string) => void;
}) {
  return (
    <aside className="sidebar panel">
      <div className="panel-heading">
        <p className="eyebrow">Controls</p>
        <button className="text-button" type="button" onClick={onReset}>
          Reset
        </button>
      </div>

      <label className="field">
        <span>搜索实体、别名、官网、指标来源</span>
        <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="OpenAI, NVDA, qdrant..." />
      </label>

      <div className="field">
        <span>图谱深度</span>
        <div className="segmented">
          {[
            ["1", "1 层"],
            ["2", "2 层"],
            ["all", "全部"]
          ].map(([value, label]) => (
            <button key={value} className={depth === value ? "active" : ""} type="button" onClick={() => onDepthChange(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>最低置信度 {minConfidence.toFixed(2).replace(/0$/, "")}</span>
        <input
          type="range"
          min="0.3"
          max="1"
          step="0.05"
          value={minConfidence}
          onChange={(event) => onMinConfidenceChange(Number(event.target.value))}
        />
      </label>

      <label className="field">
        <span>关系类型</span>
        <select value={relationType} onChange={(event) => onRelationTypeChange(event.target.value)}>
          <option value="all">全部关系</option>
          {relationOptions.map((type) => (
            <option key={type} value={type}>
              {relationLabels[type] || type}
            </option>
          ))}
        </select>
      </label>

      <div className="entity-list">
        {filteredEntities.slice(0, 80).map((entity) => {
          const layer = layerById.get(entity.layer);
          const entityMetrics = metricsByEntityId.get(entity.id) || [];
          return (
            <button
              key={entity.id}
              className={`entity-button${entity.id === selectedEntity.id ? " active" : ""}`}
              style={{ borderLeftColor: layer?.color || "#637070" }}
              type="button"
              onClick={() => onSelectEntity(entity.id)}
              title={entityMetrics.map((entry) => entry.sourceRef || entry.source).filter(Boolean).join(" / ")}
            >
              <strong>{entity.name}</strong>
              <span>
                {layer?.name || entity.layer} / {entity.status}
                {entity.ticker ? ` / ${entity.ticker}` : ""}
              </span>
            </button>
          );
        })}
        {entitySearchStatus === "loading" ? <div className="list-note">正在从 API 更新搜索结果...</div> : null}
        {entitySearchError ? <div className="list-note warning">{entitySearchError}</div> : null}
        {entitySearchCount > filteredEntities.length ? (
          <div className="list-note">还有 {entitySearchCount - filteredEntities.length} 个匹配实体，继续输入可收窄结果。</div>
        ) : null}
        {entitySearchTotal !== seedEntityCount ? <div className="list-note">API 当前实体总数：{entitySearchTotal}</div> : null}
      </div>
    </aside>
  );
}

export function GraphPanel({
  title,
  visibleGraph,
  layers,
  layerById,
  positionedNodes,
  selectedEntityId,
  highlightedRelationId,
  graphStatus,
  graphError,
  onSelectEntity,
  onHighlightRelation
}: {
  title: string;
  visibleGraph: GraphData;
  layers: Layer[];
  layerById: Map<string, Layer>;
  positionedNodes: Map<string, PositionedEntity>;
  selectedEntityId: string;
  highlightedRelationId: string | null;
  graphStatus: LoadStatus;
  graphError: string | null;
  onSelectEntity: (id: string) => void;
  onHighlightRelation: (id: string) => void;
}) {
  return (
    <section className="graph-panel panel" id="graph">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Graph</p>
          <h1>{title}</h1>
        </div>
        <span className="graph-count">
          {visibleGraph.nodes.length} nodes / {visibleGraph.edges.length} edges
        </span>
      </div>
      {graphStatus === "loading" ? <div className="list-note">正在从 API 更新图谱...</div> : null}
      {graphError ? <div className="list-note warning">{graphError}</div> : null}

      <div className="legend">
        {layers.map((layer) => (
          <span key={layer.id} className="legend-item">
            <span className="legend-dot" style={{ background: layer.color }} />
            {layer.name}
          </span>
        ))}
      </div>

      <div className="graph-scroll">
        <svg className="graph-svg" viewBox="0 0 1120 620" role="img" aria-label="AI industry graph">
          <defs>
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
              <path d="M0,0 L0,6 L9,3 z" fill="rgba(31,37,40,0.45)" />
            </marker>
          </defs>
          {visibleGraph.edges.map((relationship) => {
            const source = positionedNodes.get(relationship.source);
            const target = positionedNodes.get(relationship.target);
            if (!source || !target) return null;
            const dx = Math.max(70, Math.abs(target.x - source.x) * 0.42);
            const path = `M ${source.x} ${source.y} C ${source.x + dx} ${source.y}, ${target.x - dx} ${target.y}, ${target.x} ${target.y}`;
            return (
              <g key={relationship.id}>
                <path
                  className={`edge-path${relationship.id === highlightedRelationId ? " highlight" : ""}`}
                  d={path}
                  markerEnd="url(#arrow)"
                />
                <path
                  className="edge-hit"
                  d={path}
                  onClick={() => {
                    onHighlightRelation(relationship.id);
                    onSelectEntity(relationship.target);
                  }}
                />
              </g>
            );
          })}
          {visibleGraph.nodes.map((entity) => {
            const positioned = positionedNodes.get(entity.id);
            const layer = layerById.get(entity.layer);
            if (!positioned) return null;
            return (
              <g
                key={entity.id}
                className={`node-group${entity.id === selectedEntityId ? " active" : ""}`}
                transform={`translate(${positioned.x}, ${positioned.y})`}
                onClick={() => onSelectEntity(entity.id)}
              >
                <circle className="node-circle" r="24" fill={layer?.color || "#087f7a"} />
                <text className="node-label" y="43" textAnchor="middle">
                  {shorten(entity.name, 17)}
                </text>
                <text className="node-meta" y="58" textAnchor="middle">
                  {layer?.name || entity.layer}
                </text>
              </g>
            );
          })}
          {visibleGraph.nodes.length === 0 ? (
            <text x="560" y="310" textAnchor="middle">
              没有符合条件的节点
            </text>
          ) : null}
        </svg>
      </div>
    </section>
  );
}

export function LayerGrid({ layers, entities }: { layers: Layer[]; entities: Entity[] }) {
  return (
    <section className="layer-grid" aria-label="Industry layers">
      {layers.map((layer) => (
        <article key={layer.id} className="layer-tile">
          <h2>{layer.name}</h2>
          <p>{layer.description}</p>
          <span>{entities.filter((entity) => entity.layer === layer.id).length} 个实体</span>
        </article>
      ))}
    </section>
  );
}
