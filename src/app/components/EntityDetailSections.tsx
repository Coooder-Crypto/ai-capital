"use client";

import { formatEvidenceStrength, formatMetricLabel, formatNumber } from "@/lib/ui-formatters";
import type { Entity, MetricBundle, Relationship, ResearchTimelineEvent, Source } from "@/lib/types";

const researchRelationTypes = new Set(["related_to", "published_by", "authored_by", "cites"]);
const researchEntityTypes = new Set(["paper", "research_org", "research_author"]);

function formatResearchEntityType(type: string) {
  const labels: Record<string, string> = {
    paper: "论文",
    research_org: "研究机构",
    research_author: "作者"
  };
  return labels[type] || type;
}

function formatResearchEventType(type: string) {
  const labels: Record<string, string> = {
    candidate_relationship: "候选关系",
    candidate_entity: "候选实体",
    candidate_metric: "候选指标",
    connector_run: "采集运行",
    raw_document: "原始文档",
    parsed_document: "解析文档",
    extraction_record: "抽取记录",
    llm_extraction: "LLM 记录",
    metric: "公开指标",
    source: "来源",
    evidence_backlog: "证据待补"
  };
  return labels[type] || type.replaceAll("_", " ");
}

function formatResearchEventDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

function formatResearchDirection(relationship: Relationship, entityId: string, label: string) {
  if (relationship.type === "cites") {
    return relationship.source === entityId ? "引用了" : "被引用";
  }
  return label;
}

function isResearchRelationship(relationship: Relationship, entityById: Map<string, Entity>) {
  const source = entityById.get(relationship.source);
  const target = entityById.get(relationship.target);
  return (
    researchRelationTypes.has(relationship.type) ||
    Boolean(source && researchEntityTypes.has(source.type)) ||
    Boolean(target && researchEntityTypes.has(target.type))
  );
}

function ResearchRelationList({
  title,
  relations,
  entity,
  entityById,
  relationLabels,
  onSelectEntity
}: {
  title: string;
  relations: Relationship[];
  entity: Entity;
  entityById: Map<string, Entity>;
  relationLabels: Record<string, string>;
  onSelectEntity: (id: string) => void;
}) {
  if (relations.length === 0) return null;

  return (
    <div className="research-group">
      <div className="research-group-title">
        <strong>{title}</strong>
        <span>{relations.length} 条</span>
      </div>
      <div className="relation-list">
        {relations.slice(0, 12).map((relationship) => {
          const otherId = relationship.source === entity.id ? relationship.target : relationship.source;
          const other = entityById.get(otherId);
          if (!other) return null;
          const label = relationLabels[relationship.type] || formatResearchDirection(relationship, entity.id, relationship.type);
          return (
            <button key={relationship.id} className="relation-item" type="button" onClick={() => onSelectEntity(other.id)}>
              <strong>{other.name}</strong>
              <span>
                {formatResearchEntityType(other.type)} / {formatResearchDirection(relationship, entity.id, label)} / confidence{" "}
                {relationship.confidence.toFixed(2)}
              </span>
              <span>{relationship.note}</span>
              {relationship.evidenceUrl ? <span>证据：{relationship.evidenceTitle || relationship.evidenceUrl}</span> : null}
            </button>
          );
        })}
        {relations.length > 12 ? (
          <div className="relation-item">
            <span>还有 {relations.length - 12} 条研究关系未展开显示。</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ResearchSection({
  entity,
  relationships,
  entityById,
  relationLabels,
  onSelectEntity
}: {
  entity: Entity;
  relationships: Relationship[];
  entityById: Map<string, Entity>;
  relationLabels: Record<string, string>;
  onSelectEntity: (id: string) => void;
}) {
  const researchRelations = relationships.filter((relationship) => isResearchRelationship(relationship, entityById));
  if (researchRelations.length === 0) return null;

  const citationRelations = researchRelations.filter((relationship) => relationship.type === "cites");
  const contributorRelations = researchRelations.filter((relationship) => {
    if (relationship.type === "cites") return false;
    const otherId = relationship.source === entity.id ? relationship.target : relationship.source;
    const other = entityById.get(otherId);
    return relationship.type === "published_by" || relationship.type === "authored_by" || other?.type === "research_org" || other?.type === "research_author";
  });
  const researchObjectRelations = researchRelations.filter((relationship) => {
    if (relationship.type === "cites" || contributorRelations.some((item) => item.id === relationship.id)) return false;
    const source = entityById.get(relationship.source);
    const target = entityById.get(relationship.target);
    return relationship.type === "related_to" || source?.type === "paper" || target?.type === "paper";
  });

  return (
    <section className="detail-section research-section">
      <h3>研究关联</h3>
      <ResearchRelationList
        title="相关论文与研究对象"
        relations={researchObjectRelations}
        entity={entity}
        entityById={entityById}
        relationLabels={relationLabels}
        onSelectEntity={onSelectEntity}
      />
      <ResearchRelationList
        title="机构与作者"
        relations={contributorRelations}
        entity={entity}
        entityById={entityById}
        relationLabels={relationLabels}
        onSelectEntity={onSelectEntity}
      />
      <ResearchRelationList
        title="引用关系"
        relations={citationRelations}
        entity={entity}
        entityById={entityById}
        relationLabels={relationLabels}
        onSelectEntity={onSelectEntity}
      />
    </section>
  );
}

export function RecentResearchEventsSection({
  events,
  entityId
}: {
  events: ResearchTimelineEvent[];
  entityId: string;
}) {
  if (events.length === 0) return null;

  return (
    <section className="detail-section research-section">
      <div className="research-group-title">
        <h3>最近研究动态</h3>
        <a href={`/research?entity=${encodeURIComponent(entityId)}`}>查看全部</a>
      </div>
      <div className="relation-list">
        {events.slice(0, 6).map((event) => (
          <a key={event.id} className="relation-item" href={event.url || `/research?entity=${encodeURIComponent(entityId)}`}>
            <strong>{event.title}</strong>
            <span>
              {formatResearchEventDate(event.date)} / {formatResearchEventType(event.type)} / {event.sourceId}
            </span>
            <span>{event.description}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

export function RelationSection({
  title,
  relations,
  incoming,
  entityById,
  relationLabels,
  onSelectEntity
}: {
  title: string;
  relations: Relationship[];
  incoming: boolean;
  entityById: Map<string, Entity>;
  relationLabels: Record<string, string>;
  onSelectEntity: (id: string) => void;
}) {
  const visibleRelations = relations.slice(0, 40);
  const hiddenCount = Math.max(0, relations.length - visibleRelations.length);

  return (
    <section className="detail-section">
      <h3>{title}</h3>
      <div className="relation-list">
        {visibleRelations.length === 0 ? (
          <div className="relation-item">
            <span>暂无已录入关系。</span>
          </div>
        ) : null}
        {visibleRelations.map((relationship) => {
          const otherId = incoming ? relationship.source : relationship.target;
          const other = entityById.get(otherId);
          if (!other) return null;
          return (
            <button key={relationship.id} className="relation-item" type="button" onClick={() => onSelectEntity(other.id)}>
              <strong>{incoming ? other.name : `${relationLabels[relationship.type] || relationship.type} -> ${other.name}`}</strong>
              <span>
                {relationLabels[relationship.type] || relationship.type} / confidence {relationship.confidence.toFixed(2)}. {relationship.note}
              </span>
              {relationship.evidenceUrl ? <span>具体证据：{relationship.evidenceTitle || relationship.evidenceUrl}</span> : null}
            </button>
          );
        })}
        {hiddenCount ? (
          <div className="relation-item">
            <span>还有 {hiddenCount} 条关系未展开显示。可用置信度和关系类型过滤收窄图谱。</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function MetricPanel({
  metrics,
  failures
}: {
  metrics: MetricBundle["metrics"];
  failures: NonNullable<MetricBundle["rejectedOrFailed"]>;
}) {
  return (
    <section className="detail-section">
      <h3>公开指标</h3>
      <div className="relation-list">
        {metrics.length === 0 && failures.length === 0 ? (
          <div className="relation-item">
            <span>暂无已审核的自动采集指标。</span>
          </div>
        ) : null}
        {metrics.map((entry) => (
          <div key={`${entry.entityId}-${entry.source}-${entry.sourceRef || entry.asOf}`} className="relation-item">
            <strong>
              {entry.source}
              {entry.sourceRef ? ` / ${entry.sourceRef}` : ""}
            </strong>
            <span>
              {Object.entries(entry.metrics)
                .filter(([, value]) => value !== null && value !== undefined)
                .map(([key, value]) => `${formatMetricLabel(key)}: ${formatNumber(value)}`)
                .join(" / ")}
            </span>
            <span>as of {entry.asOf}</span>
            {entry.evidenceUrl ? (
              <span>
                证据：
                <a href={entry.evidenceUrl} target="_blank" rel="noreferrer">
                  {entry.collectionMethod || "official_source"}
                </a>
              </span>
            ) : null}
            {entry.reviewNote ? <span>{entry.reviewNote}</span> : null}
          </div>
        ))}
        {failures.map((entry) => (
          <div key={`${entry.source}-${entry.entityId}-${entry.message}`} className="relation-item metric-failure">
            <strong>{entry.source} 采集失败</strong>
            <span>{entry.message}</span>
            {entry.code || entry.url ? <span>{[entry.code, entry.url].filter(Boolean).join(" / ")}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function SourceList({
  sources,
  allRelationships,
  onOpenSource
}: {
  sources: Source[];
  allRelationships: Relationship[];
  onOpenSource: (id: string) => void;
}) {
  const uniqueSources = [...new Map(sources.map((source) => [source.id, source])).values()];

  return (
    <section className="detail-section">
      <h3>证据来源</h3>
      <div className="source-list">
        {uniqueSources.map((source) => (
          <button key={source.id} className="source-item" type="button" onClick={() => onOpenSource(source.id)}>
            <strong>{source.title}</strong>
            <span>
              {source.publisher} / {source.date} / {formatEvidenceStrength(source)} /{" "}
              {allRelationships.filter((relationship) => relationship.sourceId === source.id).length} 条关系
            </span>
            <span>{source.note}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function CorrectionForm({
  issueType,
  targetId,
  relationType,
  evidenceUrl,
  note,
  contact,
  status,
  message,
  selectableEntities,
  relationOptions,
  relationLabels,
  subjectEntityId,
  onIssueTypeChange,
  onTargetIdChange,
  onRelationTypeChange,
  onEvidenceUrlChange,
  onNoteChange,
  onContactChange,
  onSubmit
}: {
  issueType: string;
  targetId: string;
  relationType: string;
  evidenceUrl: string;
  note: string;
  contact: string;
  status: "idle" | "submitting" | "submitted" | "error";
  message: string | null;
  selectableEntities: Entity[];
  relationOptions: string[];
  relationLabels: Record<string, string>;
  subjectEntityId: string;
  onIssueTypeChange: (value: string) => void;
  onTargetIdChange: (value: string) => void;
  onRelationTypeChange: (value: string) => void;
  onEvidenceUrlChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onContactChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="detail-section correction-section">
      <h3>提交纠错</h3>
      <form className="correction-form" onSubmit={onSubmit}>
        <label>
          <span>问题类型</span>
          <select value={issueType} onChange={(event) => onIssueTypeChange(event.target.value)}>
            <option value="missing_relationship">补充关系</option>
            <option value="wrong_relationship">关系有误</option>
            <option value="metric_issue">指标有误</option>
            <option value="entity_issue">实体信息有误</option>
            <option value="other">其他</option>
          </select>
        </label>
        <label>
          <span>目标实体</span>
          <select value={targetId} onChange={(event) => onTargetIdChange(event.target.value)}>
            <option value="">不指定</option>
            {selectableEntities
              .filter((item) => item.id !== subjectEntityId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span>关系类型</span>
          <select value={relationType} onChange={(event) => onRelationTypeChange(event.target.value)}>
            {relationOptions.map((type) => (
              <option key={type} value={type}>
                {relationLabels[type] || type}
              </option>
            ))}
          </select>
        </label>
        <label className="wide">
          <span>证据 URL</span>
          <input value={evidenceUrl} onChange={(event) => onEvidenceUrlChange(event.target.value)} placeholder="https://..." />
        </label>
        <label className="wide">
          <span>说明</span>
          <textarea
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            minLength={8}
            maxLength={1200}
            rows={4}
            required
            placeholder="说明应该新增、修改或复核的关系/指标，并给出判断依据。"
          />
        </label>
        <label className="wide">
          <span>联系方式</span>
          <input value={contact} onChange={(event) => onContactChange(event.target.value)} maxLength={160} placeholder="可选" />
        </label>
        <div className="correction-actions">
          <button type="submit" disabled={status === "submitting"}>
            {status === "submitting" ? "提交中" : "提交到审核队列"}
          </button>
          {message ? <span className={status === "error" ? "warning" : ""}>{message}</span> : null}
        </div>
      </form>
    </section>
  );
}
