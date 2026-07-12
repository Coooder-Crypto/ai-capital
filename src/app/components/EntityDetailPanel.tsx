"use client";

import { type FormEvent, useState } from "react";
import { CorrectionForm, MetricPanel, RecentResearchEventsSection, RelationSection, ResearchSection, SourceList } from "@/app/components/EntityDetailSections";
import { submitCorrection } from "@/lib/api-client";
import { formatEvidenceStrength } from "@/lib/ui-formatters";
import type { Entity, EntityDetailData, Layer, MetricBundle, Relationship, Source } from "@/lib/types";

type LoadStatus = "idle" | "loading" | "error";

export function Info({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="info-item">
      <span>{label}</span>
      <strong>{value || "N/A"}</strong>
    </div>
  );
}

export function SourceModal({
  source,
  linkedRelationshipCount,
  onClose
}: {
  source: Source;
  linkedRelationshipCount: number;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="source-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-heading">
          <h2 id="source-modal-title">{source.title}</h2>
          <button className="text-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="source-modal-grid" id="sources">
          <Info label="Publisher" value={source.publisher} />
          <Info label="Date" value={source.date} />
          <Info label="Evidence" value={formatEvidenceStrength(source)} />
          <Info label="Source type" value={source.sourceType || "unknown"} />
          <Info label="Linked relationships" value={linkedRelationshipCount} />
          <Info label="Source ID" value={source.id} />
        </div>
        <p>{source.note}</p>
        {source.licenseNote ? <p>{source.licenseNote}</p> : null}
        <a className="source-link" href={source.url} target="_blank" rel="noreferrer">
          打开来源链接
        </a>
      </section>
    </div>
  );
}

export function EntityDetailPanel({
  entity,
  layer,
  incoming,
  outgoing,
  entityById,
  relationLabels,
  metrics,
  failures,
  recentResearchEvents,
  sources,
  allRelationships,
  status,
  error,
  redirectNotice,
  onSelectEntity,
  onOpenSource
}: {
  entity: Entity;
  layer: Layer;
  incoming: Relationship[];
  outgoing: Relationship[];
  entityById: Map<string, Entity>;
  relationLabels: Record<string, string>;
  metrics: MetricBundle["metrics"];
  failures: NonNullable<MetricBundle["rejectedOrFailed"]>;
  recentResearchEvents?: NonNullable<EntityDetailData["recentResearchEvents"]>;
  sources: Source[];
  allRelationships: Relationship[];
  status: LoadStatus;
  error: string | null;
  redirectNotice: { from: string; to: string } | null;
  onSelectEntity: (id: string) => void;
  onOpenSource: (id: string) => void;
}) {
  const [correctionIssueType, setCorrectionIssueType] = useState("missing_relationship");
  const [correctionTargetId, setCorrectionTargetId] = useState("");
  const [correctionRelationType, setCorrectionRelationType] = useState(Object.keys(relationLabels)[0] || "integrates_with");
  const [correctionEvidenceUrl, setCorrectionEvidenceUrl] = useState("");
  const [correctionNote, setCorrectionNote] = useState("");
  const [correctionContact, setCorrectionContact] = useState("");
  const [correctionStatus, setCorrectionStatus] = useState<"idle" | "submitting" | "submitted" | "error">("idle");
  const [correctionMessage, setCorrectionMessage] = useState<string | null>(null);
  const selectableEntities = [...entityById.values()].sort((a, b) => a.name.localeCompare(b.name));
  const relationOptions = Object.keys(relationLabels).sort();
  const identityMetrics = [
    ["官网", entity.website_url],
    ["国家/地区", entity.country],
    ["交易所", entity.exchange],
    ["别名", (entity.aliases || []).slice(0, 4).join(", ")]
  ].filter((item): item is [string, string] => Boolean(item[1]));

  async function handleCorrectionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCorrectionStatus("submitting");
    setCorrectionMessage(null);

    try {
      const result = await submitCorrection({
        subjectEntityId: entity.id,
        targetEntityId: correctionTargetId || undefined,
        relationType: correctionRelationType,
        issueType: correctionIssueType as "missing_relationship" | "wrong_relationship" | "metric_issue" | "entity_issue" | "other",
        evidenceUrl: correctionEvidenceUrl || undefined,
        note: correctionNote,
        contact: correctionContact || undefined
      });
      setCorrectionStatus("submitted");
      setCorrectionMessage(`已进入审核队列：${result.data.id}`);
      setCorrectionEvidenceUrl("");
      setCorrectionNote("");
      setCorrectionContact("");
    } catch (error) {
      setCorrectionStatus("error");
      setCorrectionMessage(error instanceof Error ? error.message : "提交失败");
    }
  }

  return (
    <aside className="detail-panel panel" id="detail">
      <span className="detail-kicker" style={{ color: layer.color }}>
        {layer.name}
      </span>
      <h2>{entity.name}</h2>
      {redirectNotice ? (
        <div className="redirect-notice">
          旧实体 ID {redirectNotice.from} 已合并到 {entity.name}。
        </div>
      ) : null}
      <p>{entity.description}</p>
      {status === "loading" ? <div className="list-note">正在从 API 更新详情...</div> : null}
      {error ? <div className="list-note warning">{error}</div> : null}

      <div className="metric-grid">
        <Info label="估值口径" value={entity.valuation} />
        {identityMetrics.map(([label, value]) => (
          <Info key={label} label={label} value={value} />
        ))}
        {Object.entries(entity.metrics).map(([label, value]) => (
          <Info key={label} label={label} value={value} />
        ))}
      </div>

      <RelationSection
        title="上游 / 输入"
        relations={incoming}
        incoming
        entityById={entityById}
        relationLabels={relationLabels}
        onSelectEntity={onSelectEntity}
      />
      <RelationSection
        title="下游 / 输出"
        relations={outgoing}
        incoming={false}
        entityById={entityById}
        relationLabels={relationLabels}
        onSelectEntity={onSelectEntity}
      />
      <ResearchSection
        entity={entity}
        relationships={[...incoming, ...outgoing]}
        entityById={entityById}
        relationLabels={relationLabels}
        onSelectEntity={onSelectEntity}
      />
      <RecentResearchEventsSection events={recentResearchEvents || []} entityId={entity.id} />

      <MetricPanel metrics={metrics} failures={failures} />
      <SourceList sources={sources} allRelationships={allRelationships} onOpenSource={onOpenSource} />
      <CorrectionForm
        issueType={correctionIssueType}
        targetId={correctionTargetId}
        relationType={correctionRelationType}
        evidenceUrl={correctionEvidenceUrl}
        note={correctionNote}
        contact={correctionContact}
        status={correctionStatus}
        message={correctionMessage}
        selectableEntities={selectableEntities}
        relationOptions={relationOptions}
        relationLabels={relationLabels}
        subjectEntityId={entity.id}
        onIssueTypeChange={setCorrectionIssueType}
        onTargetIdChange={setCorrectionTargetId}
        onRelationTypeChange={setCorrectionRelationType}
        onEvidenceUrlChange={setCorrectionEvidenceUrl}
        onNoteChange={setCorrectionNote}
        onContactChange={setCorrectionContact}
        onSubmit={handleCorrectionSubmit}
      />
    </aside>
  );
}
