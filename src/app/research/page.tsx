import { exportDatasetAsJson, readGraphSnapshot, readTimeline } from "@/lib/research-artifacts";
import { ResearchTimelineClient } from "./ResearchTimelineClient";

export const dynamic = "force-dynamic";

type CountMap = Record<string, number | undefined>;

type LayerCount = {
  layerId: string;
  layerName: string;
  entities: number;
  relationshipsOut: number;
  relationshipsIn: number;
};

type RelationshipTypeCount = {
  type: string;
  label: string;
  count: number;
};

type TopEntity = {
  entityId: string;
  name: string;
  layer: string;
  inDegree: number;
  outDegree: number;
  totalDegree: number;
};

type Archive = {
  id: string;
  archivedAt: string;
  snapshotGeneratedAt: string;
  counts: {
    candidateRelationships?: number;
    candidateEntities?: number;
    candidateMetrics?: number;
    retryBacklog?: number;
  };
};

const exportDatasets = [
  ["relationships", "关系 CSV"],
  ["metrics", "指标 CSV"],
  ["candidate-relationships", "候选关系 CSV"],
  ["candidate-entities", "候选实体 CSV"],
  ["candidate-metrics", "候选指标 CSV"],
  ["parsed-documents", "解析文档 JSON", "json"],
  ["extraction-records", "抽取记录 CSV"],
  ["llm-extractions", "LLM 记录 JSON", "json"],
  ["candidate-snapshot-latest", "最新候选快照 JSON", "json"]
] as const;

function formatNumber(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString("en-US") : "0";
}

function formatDate(value: string | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

export default async function ResearchPage() {
  const [snapshot, timeline, archives] = await Promise.all([
    readGraphSnapshot(),
    readTimeline(),
    exportDatasetAsJson("candidate-snapshot-archives") as Promise<Archive[]>
  ]);

  const counts = (snapshot.counts || {}) as CountMap;
  const layerCounts = ((snapshot.layerCounts || []) as LayerCount[]).slice(0, 8);
  const relationshipTypeCounts = ((snapshot.relationshipTypeCounts || []) as RelationshipTypeCount[]).slice(0, 8);
  const topEntities = ((snapshot.topEntitiesByDegree || []) as TopEntity[]).slice(0, 8);
  const events = timeline.events || [];
  const recentArchives = [...archives].reverse().slice(0, 8);

  const summaryItems = [
    ["候选关系", counts.candidateRelationships],
    ["候选实体", counts.candidateEntities],
    ["候选指标", counts.candidateMetrics],
    ["证据待补", counts.evidenceBacklog],
    ["Raw documents", counts.rawDocuments],
    ["Parsed documents", counts.parsedDocuments],
    ["Extraction records", counts.extractionRecords],
    ["Timeline events", events.length]
  ];

  return (
    <main className="app-shell research-shell">
      <header className="topbar">
        <div>
          <strong>AI Capital Map</strong>
          <span>P3 research console</span>
          <span className="data-source-pill">research artifacts</span>
        </div>
        <nav>
          <a href="/">图谱</a>
          <a href="/research">研究</a>
          <a href="/admin">审核</a>
        </nav>
      </header>

      <section className="stats-grid">
        <div>
          <strong>{formatNumber(counts.entities)}</strong>
          <span>主图谱实体</span>
        </div>
        <div>
          <strong>{formatNumber(counts.relationships)}</strong>
          <span>主图谱关系</span>
        </div>
        <div>
          <strong>{formatNumber(counts.candidateSnapshotArchives)}</strong>
          <span>候选快照</span>
        </div>
        <div>
          <strong>{formatDate(snapshot.generatedAt)}</strong>
          <span>快照日期</span>
        </div>
      </section>

      <section className="research-grid">
        <div className="panel research-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Pipeline</span>
              <h1>采集与候选队列</h1>
            </div>
          </div>
          <div className="research-stat-grid">
            {summaryItems.map(([label, value]) => (
              <div className="info-item" key={label}>
                <strong>{formatNumber(value as number | undefined)}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel research-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Exports</span>
              <h2>数据导出</h2>
            </div>
          </div>
          <div className="export-grid">
            {exportDatasets.map(([dataset, label, format]) => (
              <a
                className="source-link"
                href={`/api/research/export?dataset=${dataset}&format=${format || "csv"}`}
                key={dataset}
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="research-grid wide">
        <div className="panel research-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Graph</span>
              <h2>产业层级</h2>
            </div>
          </div>
          <div className="research-table">
            <div className="research-row head">
              <span>层级</span>
              <span>实体</span>
              <span>出边</span>
              <span>入边</span>
            </div>
            {layerCounts.map((layer) => (
              <div className="research-row" key={layer.layerId}>
                <strong>{layer.layerName}</strong>
                <span>{formatNumber(layer.entities)}</span>
                <span>{formatNumber(layer.relationshipsOut)}</span>
                <span>{formatNumber(layer.relationshipsIn)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel research-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Relations</span>
              <h2>关系类型</h2>
            </div>
          </div>
          <div className="research-list">
            {relationshipTypeCounts.map((entry) => (
              <div className="relation-item" key={entry.type}>
                <strong>{entry.label}</strong>
                <span>
                  {entry.type} · {formatNumber(entry.count)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel research-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Degree</span>
              <h2>高连接实体</h2>
            </div>
          </div>
          <div className="research-list">
            {topEntities.map((entity) => (
              <a className="relation-item" href={`/?entity=${encodeURIComponent(entity.entityId)}`} key={entity.entityId}>
                <strong>{entity.name}</strong>
                <span>
                  {entity.layer} · {formatNumber(entity.totalDegree)} total · {formatNumber(entity.inDegree)} in ·{" "}
                  {formatNumber(entity.outDegree)} out
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="research-grid timeline-layout">
        <div className="panel research-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Timeline</span>
              <h2>最新研究事件</h2>
            </div>
            <a className="text-button" href="/api/research/timeline?limit=100">
              JSON
            </a>
          </div>
          <ResearchTimelineClient events={events} />
        </div>

        <div className="panel research-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Archives</span>
              <h2>候选快照历史</h2>
            </div>
            <a className="text-button" href="/api/research/export?dataset=candidate-snapshot-archives&format=json">
              JSON
            </a>
          </div>
          <div className="research-table archive-table">
            <div className="research-row head">
              <span>日期</span>
              <span>关系</span>
              <span>实体</span>
              <span>指标</span>
            </div>
            {recentArchives.map((archive) => (
              <div className="research-row" key={archive.id}>
                <strong>{formatDate(archive.archivedAt || archive.snapshotGeneratedAt)}</strong>
                <span>{formatNumber(archive.counts?.candidateRelationships)}</span>
                <span>{formatNumber(archive.counts?.candidateEntities)}</span>
                <span>{formatNumber(archive.counts?.candidateMetrics)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
