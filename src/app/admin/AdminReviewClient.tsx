"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import type {
  AuditLogEntry,
  CandidateEntity,
  CandidateMetricPatch,
  CandidateMetricReviewItem,
  CandidateRelationship,
  CandidateRelationshipPatch,
  CandidateRelationshipReviewItem,
  DataSource,
  Entity
} from "@/lib/types";

type CandidateStatus = CandidateRelationship["status"] | "all";
type LoadStatus = "idle" | "loading" | "error";
type ReviewQueue = "relationships" | "entities" | "metrics";
type ReviewItem = CandidateRelationshipReviewItem | CandidateEntity | CandidateMetricReviewItem;
type MergeTargetType = "existing" | "candidate";
type MergeFieldPolicyChoice = "target" | "candidate" | "manual";
type AdminSessionContext = {
  actor: string;
  role: "admin" | "reviewer";
  tokenSource: string;
};
type AdminSessionResponse = {
  authEnabled: boolean;
  sessionConfigured: boolean;
  sessionReady: boolean;
  authenticated: boolean;
  context: AdminSessionContext | null;
  error?: string;
};
type MergeFieldPolicy = Record<
  string,
  {
    choice: MergeFieldPolicyChoice;
    manualValue?: string;
    candidateValue: string;
    targetValue: string;
  }
>;

type CandidateResponse = {
  data: ReviewItem[];
  auditLog: AuditLogEntry[];
  meta: {
    dataSource: DataSource;
    status: CandidateStatus;
  };
};

type EntityResponse = {
  data: Entity[];
  count: number;
  total: number;
  limit: number;
  meta: {
    dataSource: DataSource;
  };
};

type ReviewResponse = {
  data: ReviewItem;
  auditLogEntry: AuditLogEntry;
  meta: {
    dataSource: DataSource;
    action: "approve" | "reject" | "update" | "merge";
  };
};

const adminTokenStorageKey = "ai-capital-admin-review-token";

const sourceOptions = [
  "src_manual",
  "src_ecosystem_mapping",
  "src_company_sites",
  "src_public_portfolio",
  "src_github",
  "src_hf",
  "src_openalex",
  "src_arxiv",
  "src_sec"
];

const statusLabels: Record<CandidateStatus, string> = {
  candidate: "待审核",
  approved: "已通过",
  rejected: "已拒绝",
  all: "全部"
};

const queueLabels: Record<ReviewQueue, string> = {
  relationships: "关系",
  entities: "实体",
  metrics: "指标"
};

function formatDataSource(dataSource: DataSource | null) {
  if (!dataSource) return "Loading";
  return dataSource === "postgres" ? "PostgreSQL" : "JSON fallback";
}

function endpointForQueue(queue: ReviewQueue) {
  if (queue === "entities") return "/api/admin/candidate-entities";
  if (queue === "metrics") return "/api/admin/candidate-metrics";
  return "/api/admin/candidates";
}

async function fetchCandidates(queue: ReviewQueue, status: CandidateStatus, signal?: AbortSignal) {
  const response = await fetch(`${endpointForQueue(queue)}?status=${status}`, { signal });
  if (!response.ok) throw new Error(`Failed to load candidates: ${response.status}`);
  return (await response.json()) as CandidateResponse;
}

async function fetchGraphEntities(signal?: AbortSignal) {
  const response = await fetch("/api/entities?limit=500", { signal });
  if (!response.ok) throw new Error(`Failed to load graph entities: ${response.status}`);
  return (await response.json()) as EntityResponse;
}

async function fetchAdminSession(signal?: AbortSignal) {
  const response = await fetch("/api/admin/session", { signal });
  if (!response.ok) throw new Error(`Failed to load admin session: ${response.status}`);
  return (await response.json()) as AdminSessionResponse;
}

async function loginAdminSession(username: string, password: string) {
  const response = await fetch("/api/admin/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const body = (await response.json().catch(() => ({}))) as AdminSessionResponse;
  if (!response.ok) throw new Error(body.error || `Failed to login: ${response.status}`);
  return body;
}

async function logoutAdminSession() {
  const response = await fetch("/api/admin/session", { method: "DELETE" });
  if (!response.ok) throw new Error(`Failed to logout: ${response.status}`);
  return (await response.json()) as AdminSessionResponse;
}

function adminHeaders(adminToken: string, json = false) {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(adminToken.trim() ? { Authorization: `Bearer ${adminToken.trim()}` } : {})
  };
}

async function reviewCandidate(queue: ReviewQueue, id: string, action: "approve" | "reject", adminToken: string) {
  const response = await fetch(`${endpointForQueue(queue)}/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    headers: adminHeaders(adminToken)
  });
  if (!response.ok) throw new Error(`Failed to ${action} candidate: ${response.status}`);
  return (await response.json()) as ReviewResponse;
}

async function updateCandidate(id: string, patch: CandidateRelationshipPatch, adminToken: string) {
  const response = await fetch(`/api/admin/candidates/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: adminHeaders(adminToken, true),
    body: JSON.stringify(patch)
  });
  if (!response.ok) throw new Error(`Failed to update candidate: ${response.status}`);
  return (await response.json()) as ReviewResponse;
}

async function updateCandidateMetric(id: string, patch: CandidateMetricPatch, adminToken: string) {
  const response = await fetch(`/api/admin/candidate-metrics/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: adminHeaders(adminToken, true),
    body: JSON.stringify(patch)
  });
  if (!response.ok) throw new Error(`Failed to update candidate metric: ${response.status}`);
  return (await response.json()) as ReviewResponse;
}

type MergeTarget = {
  targetEntityId?: string;
  targetCandidateEntityId?: string;
  fieldPolicy?: MergeFieldPolicy;
};

async function mergeCandidateEntity(id: string, target: MergeTarget, adminToken: string) {
  const response = await fetch(`/api/admin/candidate-entities/${encodeURIComponent(id)}/merge`, {
    method: "POST",
    headers: adminHeaders(adminToken, true),
    body: JSON.stringify(target)
  });
  if (!response.ok) throw new Error(`Failed to merge candidate entity: ${response.status}`);
  return (await response.json()) as ReviewResponse;
}

export default function AdminReviewClient() {
  const [queue, setQueue] = useState<ReviewQueue>("relationships");
  const [status, setStatus] = useState<CandidateStatus>("candidate");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [dataSource, setDataSource] = useState<DataSource | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState("");
  const [graphEntities, setGraphEntities] = useState<Entity[]>([]);
  const [adminSession, setAdminSession] = useState<AdminSessionResponse | null>(null);
  const [sessionUsername, setSessionUsername] = useState("");
  const [sessionPassword, setSessionPassword] = useState("");
  const [sessionBusy, setSessionBusy] = useState(false);

  useEffect(() => {
    setAdminToken(window.localStorage.getItem(adminTokenStorageKey) || "");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchAdminSession(controller.signal)
      .then(setAdminSession)
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setAdminSession({
            authEnabled: true,
            sessionConfigured: false,
            sessionReady: false,
            authenticated: false,
            context: null,
            error: error.message
          });
        }
      });
    return () => controller.abort();
  }, []);

  function handleAdminTokenChange(value: string) {
    setAdminToken(value);
    if (value.trim()) {
      window.localStorage.setItem(adminTokenStorageKey, value.trim());
    } else {
      window.localStorage.removeItem(adminTokenStorageKey);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoadStatus("loading");
    setMessage(null);

    Promise.all([
      fetchCandidates(queue, status, controller.signal),
      queue === "entities" ? fetchGraphEntities(controller.signal) : Promise.resolve(null)
    ])
      .then(([response, entityResponse]) => {
        setItems(response.data);
        setAuditLog(response.auditLog || []);
        setDataSource(response.meta.dataSource);
        if (entityResponse) setGraphEntities(entityResponse.data);
        setLoadStatus("idle");
      })
      .catch((error: Error) => {
        if (error.name === "AbortError") return;
        setMessage(error.message);
        setLoadStatus("error");
      });

    return () => controller.abort();
  }, [queue, status]);

  async function handleReview(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setMessage(null);
    try {
      const response = await reviewCandidate(queue, id, action, adminToken);
      setDataSource(response.meta.dataSource);
      setAuditLog((current) => [response.auditLogEntry, ...current]);
      setItems((current) =>
        status === "all"
          ? current.map((item) => (item.id === id ? response.data : item))
          : current.filter((item) => item.id !== id)
      );
      setMessage(action === "approve" ? "候选已通过，后续读取会使用审核结果。" : "候选已拒绝，已记录 audit log。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "审核操作失败。");
    } finally {
      setBusyId(null);
    }
  }

  async function handleUpdate(id: string, patch: CandidateRelationshipPatch) {
    setBusyId(id);
    setMessage(null);
    try {
      const response = await updateCandidate(id, patch, adminToken);
      setDataSource(response.meta.dataSource);
      setAuditLog((current) => [response.auditLogEntry, ...current]);
      setItems((current) => current.map((item) => (item.id === id ? response.data : item)));
      setMessage("候选关系已更新，后续 approve 将使用修改后的字段。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新候选关系失败。");
    } finally {
      setBusyId(null);
    }
  }

  async function handleMetricUpdate(id: string, patch: CandidateMetricPatch) {
    setBusyId(id);
    setMessage(null);
    try {
      const response = await updateCandidateMetric(id, patch, adminToken);
      setDataSource(response.meta.dataSource);
      setAuditLog((current) => [response.auditLogEntry, ...current]);
      setItems((current) => current.map((item) => (item.id === id ? response.data : item)));
      setMessage("候选指标已更新，后续 approve 将使用修改后的口径。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新候选指标失败。");
    } finally {
      setBusyId(null);
    }
  }

  async function handleMerge(id: string, target: MergeTarget) {
    setBusyId(id);
    setMessage(null);
    try {
      const response = await mergeCandidateEntity(id, target, adminToken);
      setDataSource(response.meta.dataSource);
      setAuditLog((current) => [response.auditLogEntry, ...current]);
      setItems((current) =>
        status === "all"
          ? current.map((item) => (item.id === id ? response.data : item))
          : current.filter((item) => item.id !== id)
      );
      setMessage("候选实体已合并，redirect、关系端点和 audit log 已记录。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "合并候选实体失败。");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSessionLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSessionBusy(true);
    setMessage(null);
    try {
      const response = await loginAdminSession(sessionUsername, sessionPassword);
      setAdminSession(response);
      setSessionPassword("");
      setMessage(`已登录审核会话：${response.context?.actor || sessionUsername}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录审核会话失败。");
    } finally {
      setSessionBusy(false);
    }
  }

  async function handleSessionLogout() {
    setSessionBusy(true);
    setMessage(null);
    try {
      const response = await logoutAdminSession();
      setAdminSession((current) => ({
        authEnabled: current?.authEnabled ?? true,
        sessionConfigured: current?.sessionConfigured ?? true,
        sessionReady: current?.sessionReady ?? true,
        authenticated: response.authenticated,
        context: response.context
      }));
      setMessage("审核会话已退出。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "退出审核会话失败。");
    } finally {
      setSessionBusy(false);
    }
  }

  return (
    <main className="app-shell admin-shell">
      <header className="topbar">
        <div>
          <strong>AI Capital Map</strong>
          <span>P2.3 review queue</span>
          <span className={`data-source-pill ${dataSource || "json-fallback"}`}>{formatDataSource(dataSource)}</span>
        </div>
        <nav>
          <a href="/">图谱</a>
          <a href="/research">研究</a>
          <a href="/admin">审核</a>
        </nav>
      </header>

      <section className="admin-summary">
        <div>
          <strong>{items.length}</strong>
          <span>{statusLabels[status]}候选</span>
        </div>
        <div>
          <strong>{auditLog.length}</strong>
          <span>本轮 audit log</span>
        </div>
      </section>

      <section className="admin-panel panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Review</p>
            <h1>候选{queueLabels[queue]}审核</h1>
          </div>
          <div className="admin-filters">
            <AdminSessionPanel
              session={adminSession}
              username={sessionUsername}
              password={sessionPassword}
              busy={sessionBusy}
              onUsernameChange={setSessionUsername}
              onPasswordChange={setSessionPassword}
              onLogin={handleSessionLogin}
              onLogout={handleSessionLogout}
            />
            <label className="admin-token-field">
              <span>审核 token</span>
              <input
                value={adminToken}
                onChange={(event) => handleAdminTokenChange(event.target.value)}
                type="password"
                autoComplete="off"
                placeholder="admin 或 reviewer token"
              />
              <small>可选兼容入口：也可以使用上方审核会话；reviewer 可 approve/reject，admin 可 edit/merge。</small>
            </label>
            <div className="segmented compact">
              {(["relationships", "entities", "metrics"] as ReviewQueue[]).map((value) => (
                <button key={value} className={queue === value ? "active" : ""} type="button" onClick={() => setQueue(value)}>
                  {queueLabels[value]}
                </button>
              ))}
            </div>
            <div className="segmented compact">
              {(["candidate", "approved", "rejected", "all"] as CandidateStatus[]).map((value) => (
                <button key={value} className={status === value ? "active" : ""} type="button" onClick={() => setStatus(value)}>
                  {statusLabels[value]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loadStatus === "loading" ? <div className="list-note">正在加载候选队列...</div> : null}
        {message ? <div className={`list-note${loadStatus === "error" ? " warning" : ""}`}>{message}</div> : null}

        <div className="candidate-list">
          {items.length === 0 && loadStatus !== "loading" ? (
            <div className="candidate-card empty">
              <strong>当前没有候选{queueLabels[queue]}</strong>
              <span>自动采集 worker 后续会继续写入 candidate queue。</span>
            </div>
          ) : null}
          {items.map((item) => (
            <ReviewCard
              key={item.id}
              item={item}
              queue={queue}
              entityCandidates={queue === "entities" ? (items as CandidateEntity[]) : []}
              graphEntities={graphEntities}
              busy={busyId === item.id}
              onUpdate={handleUpdate}
              onMetricUpdate={handleMetricUpdate}
              onMerge={handleMerge}
              onReview={handleReview}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function AdminSessionPanel({
  session,
  username,
  password,
  busy,
  onUsernameChange,
  onPasswordChange,
  onLogin,
  onLogout
}: {
  session: AdminSessionResponse | null;
  username: string;
  password: string;
  busy: boolean;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onLogout: () => void;
}) {
  if (session?.authenticated && session.context) {
    return (
      <div className="admin-session-card">
        <div>
          <strong>{session.context.actor}</strong>
          <span>
            {session.context.role} session / {session.context.tokenSource}
          </span>
        </div>
        <button type="button" disabled={busy} onClick={onLogout}>
          退出会话
        </button>
      </div>
    );
  }

  return (
    <form className="admin-session-card" onSubmit={onLogin}>
      <div>
        <strong>审核会话</strong>
        <span>
          {session?.sessionConfigured
            ? session.sessionReady
              ? "使用服务端账号登录，写入 HttpOnly session cookie。"
              : "已配置账号，但缺少 ADMIN_REVIEW_SESSION_SECRET。"
            : "未配置账号时可继续使用审核 token。"}
        </span>
      </div>
      <label>
        <span>用户名</span>
        <input value={username} onChange={(event) => onUsernameChange(event.target.value)} autoComplete="username" />
      </label>
      <label>
        <span>密码</span>
        <input
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          type="password"
          autoComplete="current-password"
        />
      </label>
      <button type="submit" disabled={busy || !session?.sessionReady}>
        登录
      </button>
      {session?.error ? <small className="warning">{session.error}</small> : null}
    </form>
  );
}

function ReviewCard({
  item,
  queue,
  entityCandidates,
  graphEntities,
  busy,
  onUpdate,
  onMetricUpdate,
  onMerge,
  onReview
}: {
  item: ReviewItem;
  queue: ReviewQueue;
  entityCandidates: CandidateEntity[];
  graphEntities: Entity[];
  busy: boolean;
  onUpdate: (id: string, patch: CandidateRelationshipPatch) => void;
  onMetricUpdate: (id: string, patch: CandidateMetricPatch) => void;
  onMerge: (id: string, target: MergeTarget) => void;
  onReview: (id: string, action: "approve" | "reject") => void;
}) {
  if (queue === "relationships") {
    const relationship = item as CandidateRelationshipReviewItem;
    const sourceName = relationship.sourceEntity?.name || relationship.sourceEntityId || relationship.sourceCandidateName || "Unknown";
    const targetName = relationship.targetEntity?.name || relationship.targetEntityId || relationship.targetCandidateName || "Unknown";
    return (
      <article className="candidate-card">
        <div>
          <strong>
            {sourceName}-&gt; {targetName}
          </strong>
          <span>
            {relationship.relationType} / confidence {relationship.confidence.toFixed(2)} / {relationship.extractionMethod}
          </span>
        </div>
        <p>{typeof relationship.payload.note === "string" ? relationship.payload.note : "No note provided."}</p>
        <CandidateMeta item={relationship} />
        {relationship.status === "candidate" ? (
          <>
            <CandidateEditForm item={relationship} busy={busy} onUpdate={onUpdate} />
            <CandidateActions id={relationship.id} busy={busy} onReview={onReview} />
          </>
        ) : null}
      </article>
    );
  }

  if (queue === "entities") {
    const entity = item as CandidateEntity;
    return (
      <article className="candidate-card">
        <div>
          <strong>
            {entity.name} / {entity.layer}
          </strong>
          <span>
            {entity.type} / {entity.statusText} / confidence {entity.confidence.toFixed(2)} / {entity.extractionMethod}
          </span>
        </div>
        <p>{typeof entity.payload.note === "string" ? entity.payload.note : entity.description}</p>
        <div className="metric-grid">
          <InfoLite label="Entity ID" value={entity.entityId} />
          <InfoLite label="Country" value={entity.country || "N/A"} />
          <InfoLite label="Valuation" value={entity.valuation || "N/A"} />
          <InfoLite label="Aliases" value={entity.aliases.join(", ") || "N/A"} />
        </div>
        <CandidateMeta item={entity} />
        <CandidateEntityDuplicateHints entity={entity} busy={busy} onMerge={onMerge} />
        {entity.status === "candidate" ? (
          <>
            <CandidateManualMergeForm
              entity={entity}
              entityCandidates={entityCandidates}
              graphEntities={graphEntities}
              busy={busy}
              onMerge={onMerge}
            />
            <CandidateActions id={entity.id} busy={busy} onReview={onReview} />
          </>
        ) : null}
      </article>
    );
  }

  const metric = item as CandidateMetricReviewItem;
  return (
    <article className="candidate-card">
      <div>
        <strong>
          {metric.entity?.name || metric.entityId} / {metric.metricType}
        </strong>
        <span>
          confidence {metric.confidence.toFixed(2)} / {metric.extractionMethod}
        </span>
      </div>
      <p>{typeof metric.payload.note === "string" ? metric.payload.note : "No note provided."}</p>
      <div className="metric-grid">
        <InfoLite label="Value" value={metric.valueNumber ?? metric.valueText ?? "N/A"} />
        <InfoLite label="As of" value={metric.asOfDate} />
        <InfoLite label="Source" value={metric.sourceId || "N/A"} />
        <InfoLite label="Source ref" value={metric.sourceRef || "N/A"} />
      </div>
      <CandidateMeta item={metric} />
      {metric.status === "candidate" ? (
        <>
          <CandidateMetricEditForm item={metric} busy={busy} onUpdate={onMetricUpdate} />
          <CandidateActions id={metric.id} busy={busy} onReview={onReview} />
        </>
      ) : null}
    </article>
  );
}

function CandidateMeta({ item }: { item: ReviewItem }) {
  return (
    <div className="candidate-meta">
      <span>{statusLabels[item.status]}</span>
      {item.evidenceUrl ? (
        <a href={item.evidenceUrl} target="_blank" rel="noreferrer">
          evidence
        </a>
      ) : (
        <span>no evidence URL</span>
      )}
      <span>{item.id}</span>
    </div>
  );
}

function CandidateEntityDuplicateHints({
  entity,
  busy,
  onMerge
}: {
  entity: CandidateEntity;
  busy: boolean;
  onMerge: (id: string, target: MergeTarget) => void;
}) {
  if (!entity.duplicateHintCount) return null;
  return (
    <div className="duplicate-hints" aria-label="possible duplicate entities">
      <div>
        <strong>可能重复或可合并</strong>
        <span>{entity.duplicateHintCount} 个匹配信号，审核前请确认是否应更新已有实体或合并候选。</span>
      </div>
      <ul>
        {(entity.duplicateHints || []).map((hint) => (
          <li key={`${hint.source}:${hint.id}`}>
            <span>{hint.source === "existing_entity" ? "主图谱" : "候选"}</span>
            <strong>{hint.name}</strong>
            <em>{hint.reason}</em>
            {entity.status === "candidate" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  onMerge(
                    entity.id,
                    hint.source === "existing_entity"
                      ? { targetEntityId: hint.entityId }
                      : { targetCandidateEntityId: hint.entityId }
                  )
                }
              >
                {hint.source === "existing_entity" ? "Merge" : "Merge Candidate"}
              </button>
            ) : (
              <small>{hint.extractionMethod || hint.status || ""}</small>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CandidateManualMergeForm({
  entity,
  entityCandidates,
  graphEntities,
  busy,
  onMerge
}: {
  entity: CandidateEntity;
  entityCandidates: CandidateEntity[];
  graphEntities: Entity[];
  busy: boolean;
  onMerge: (id: string, target: MergeTarget) => void;
}) {
  const targetOptions = useMemo(
    () => mergeTargetOptionsForEntity(entity, entityCandidates, graphEntities),
    [entity, entityCandidates, graphEntities]
  );
  const [targetType, setTargetType] = useState<MergeTargetType>("existing");
  const [targetId, setTargetId] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const selectedTarget = targetOptions.find((option) => option.targetType === targetType && option.targetId === targetId.trim());
  const filteredTargets = targetOptions
    .filter((option) => {
      const query = targetSearch.trim().toLowerCase();
      if (!query) return true;
      return [option.name, option.targetId, option.type, option.reason, option.country, option.valuation, option.aliases.join(" ")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .slice(0, 6);

  function selectTarget(option: MergeTargetOption) {
    setTargetType(option.targetType);
    setTargetId(option.targetId);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const submittedTargetType = String(data.get("targetType") || "existing");
    const submittedTargetId = String(data.get("targetId") || "").trim();
    const confirmed = data.get("confirmed") === "on";
    if (!submittedTargetId || !confirmed) return;
    const fieldPolicy: MergeFieldPolicy = {};
    if (selectedTarget) {
      for (const row of mergeFieldDiffRows(entity, selectedTarget).filter((item) => item.changed)) {
        const choiceRaw = String(data.get(`fieldPolicy.${row.label}`) || "target");
        const choice: MergeFieldPolicyChoice =
          choiceRaw === "candidate" || choiceRaw === "manual" || choiceRaw === "target" ? choiceRaw : "target";
        fieldPolicy[row.label] = {
          choice,
          manualValue: String(data.get(`fieldPolicyManual.${row.label}`) || "").trim() || undefined,
          candidateValue: row.sourceValue,
          targetValue: row.targetValue
        };
      }
    }
    onMerge(
      entity.id,
      submittedTargetType === "candidate"
        ? { targetCandidateEntityId: submittedTargetId, fieldPolicy }
        : { targetEntityId: submittedTargetId, fieldPolicy }
    );
  }

  return (
    <form className="candidate-merge" onSubmit={handleSubmit}>
      <div>
        <strong>手动合并目标</strong>
        <span>可搜索主图谱实体、候选实体和重复提示，也可直接输入目标 ID。</span>
      </div>
      <label>
        <span>target type</span>
        <select
          name="targetType"
          value={targetType}
          onChange={(event) => setTargetType(event.target.value === "candidate" ? "candidate" : "existing")}
        >
          <option value="existing">主图谱实体 ID</option>
          <option value="candidate">候选实体 ID</option>
        </select>
      </label>
      <label>
        <span>target id</span>
        <input name="targetId" value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder="openai 或 candidate_entity_..." />
      </label>
      <div className="merge-search">
        <label>
          <span>search target</span>
          <input value={targetSearch} onChange={(event) => setTargetSearch(event.target.value)} placeholder="按名称、ID、别名或匹配原因搜索" />
        </label>
        <div>
          {filteredTargets.length ? (
            filteredTargets.map((option) => (
              <button
                key={option.key}
                type="button"
                className={selectedTarget?.key === option.key ? "active" : ""}
                onClick={() => selectTarget(option)}
              >
                <strong>{option.name}</strong>
                <span>
                  {option.targetType === "existing" ? "主图谱" : "候选"} / {option.targetId}
                </span>
                <span>{option.metricKeys.length ? `${option.metricKeys.length} 个指标字段` : "暂无指标摘要"}</span>
                <em>{option.reason}</em>
              </button>
            ))
          ) : (
            <span>没有匹配目标，可继续手动输入 ID。</span>
          )}
        </div>
      </div>
      <CandidateMergeImpactPreview entity={entity} targetType={targetType} targetId={targetId} selectedTarget={selectedTarget} />
      <label className="confirm">
        <input name="confirmed" type="checkbox" required />
        <span>确认把 {entity.entityId} 合并到上述目标，并写入 redirect/audit log。</span>
      </label>
      <button type="submit" disabled={busy}>
        Merge Target
      </button>
    </form>
  );
}

function CandidateMergeImpactPreview({
  entity,
  targetType,
  targetId,
  selectedTarget
}: {
  entity: CandidateEntity;
  targetType: MergeTargetType;
  targetId: string;
  selectedTarget?: MergeTargetOption;
}) {
  const cleanTargetId = targetId.trim();
  const endpointCount = entity.candidateRelationshipEndpointCount || 0;
  return (
    <div className="merge-preview" aria-live="polite">
      <strong>合并前影响预览</strong>
      <span>
        {entity.entityId} -&gt; {cleanTargetId || "待输入目标 ID"} / {targetType === "candidate" ? "候选实体" : "主图谱实体"}
      </span>
      <span>
        {endpointCount} 条候选关系端点引用当前实体；合并会写入 redirect/audit log，候选到候选 merge 会同步重挂端点。
      </span>
      {selectedTarget ? (
        <>
          <CandidateMergeMetricImpact target={selectedTarget} />
          <CandidateMergeFieldDiff source={entity} target={selectedTarget} />
        </>
      ) : null}
    </div>
  );
}

function CandidateMergeMetricImpact({ target }: { target: MergeTargetOption }) {
  return (
    <div className="merge-metrics">
      <strong>指标影响预览</strong>
      <span>
        {target.metricKeys.length
          ? `目标实体已有 ${target.metricKeys.length} 个指标字段：${target.metricKeys.join(", ")}`
          : "目标实体暂无公开指标摘要；合并不会自动新增候选指标。"}
      </span>
    </div>
  );
}

type MergeTargetOption = {
  key: string;
  targetType: MergeTargetType;
  targetId: string;
  name: string;
  type: string;
  source: "duplicate_hint" | "candidate_queue" | "graph_entity";
  reason: string;
  layer?: string;
  description?: string;
  websiteUrl?: string;
  statusText?: string;
  country?: string;
  valuation?: string;
  aliases: string[];
  metricKeys: string[];
};

function mergeTargetOptionsForEntity(entity: CandidateEntity, entityCandidates: CandidateEntity[], graphEntities: Entity[]) {
  const options = new Map<string, MergeTargetOption>();

  for (const hint of entity.duplicateHints || []) {
    const targetType: MergeTargetType = hint.source === "existing_entity" ? "existing" : "candidate";
    const key = `${targetType}:${hint.entityId}`;
    options.set(key, {
      key,
      targetType,
      targetId: hint.entityId,
      name: hint.name,
      type: hint.type,
      source: "duplicate_hint",
      reason: hint.reason,
      aliases: [],
      statusText: hint.status,
      country: hint.status,
      valuation: hint.extractionMethod,
      metricKeys: []
    });
  }

  for (const candidate of entityCandidates) {
    if (candidate.id === entity.id || candidate.entityId === entity.entityId) continue;
    const key = `candidate:${candidate.entityId}`;
    if (options.has(key)) continue;
    options.set(key, {
      key,
      targetType: "candidate",
      targetId: candidate.entityId,
      name: candidate.name,
      type: candidate.type,
      source: "candidate_queue",
      reason: "当前实体候选队列",
      layer: candidate.layer,
      description: candidate.description,
      websiteUrl: candidate.websiteUrl,
      statusText: candidate.statusText,
      country: candidate.country,
      valuation: candidate.valuation,
      aliases: candidate.aliases || [],
      metricKeys: []
    });
  }

  for (const graphEntity of graphEntities) {
    if (graphEntity.id === entity.entityId) continue;
    const key = `existing:${graphEntity.id}`;
    if (options.has(key)) continue;
    options.set(key, {
      key,
      targetType: "existing",
      targetId: graphEntity.id,
      name: graphEntity.name,
      type: graphEntity.type,
      source: "graph_entity",
      reason: "主图谱实体",
      layer: graphEntity.layer,
      description: graphEntity.description,
      websiteUrl: graphEntity.website_url,
      statusText: graphEntity.status,
      country: graphEntity.country,
      valuation: graphEntity.valuation,
      aliases: graphEntity.aliases || [],
      metricKeys: Object.keys(graphEntity.metrics || {})
    });
  }

  return [...options.values()].sort((a, b) => {
    const sourceRank = { duplicate_hint: 0, graph_entity: 1, candidate_queue: 2 };
    if (a.source !== b.source) return sourceRank[a.source] - sourceRank[b.source];
    return a.name.localeCompare(b.name);
  });
}

function CandidateMergeFieldDiff({ source, target }: { source: CandidateEntity; target: MergeTargetOption }) {
  const rows = mergeFieldDiffRows(source, target);

  return (
    <div className="merge-diff">
      <strong>字段差异摘要</strong>
      <dl>
        {rows.map((row) => (
          <div key={row.label} className={row.changed ? "changed" : ""}>
            <dt>{row.label}</dt>
            <dd>{row.sourceValue}</dd>
            <dd>{row.targetValue}</dd>
            {row.changed ? (
              <dd className="field-policy">
                <select name={`fieldPolicy.${row.label}`} defaultValue="target" aria-label={`${row.label} merge policy`}>
                  <option value="target">保留目标值</option>
                  <option value="candidate">使用候选值</option>
                  <option value="manual">手动值</option>
                </select>
                <input name={`fieldPolicyManual.${row.label}`} placeholder="可选手动值" />
              </dd>
            ) : (
              <dd className="field-policy">无冲突</dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}

function mergeFieldDiffRows(source: CandidateEntity, target: MergeTargetOption) {
  return [
    { label: "name", sourceValue: source.name, targetValue: target.name },
    { label: "type", sourceValue: source.type, targetValue: target.type },
    { label: "layer", sourceValue: source.layer, targetValue: target.layer || "N/A" },
    { label: "description", sourceValue: source.description || "N/A", targetValue: target.description || "N/A" },
    { label: "websiteUrl", sourceValue: source.websiteUrl || "N/A", targetValue: target.websiteUrl || "N/A" },
    { label: "country", sourceValue: source.country || "N/A", targetValue: target.country || "N/A" },
    { label: "status", sourceValue: source.statusText || "N/A", targetValue: target.statusText || "N/A" },
    { label: "valuation", sourceValue: source.valuation || "N/A", targetValue: target.valuation || "N/A" },
    {
      label: "aliases",
      sourceValue: source.aliases.join(", ") || "N/A",
      targetValue: target.aliases.join(", ") || "N/A"
    }
  ].map((row) => ({ ...row, changed: row.sourceValue !== row.targetValue }));
}

function CandidateActions({
  id,
  busy,
  onReview
}: {
  id: string;
  busy: boolean;
  onReview: (id: string, action: "approve" | "reject") => void;
}) {
  return (
    <div className="candidate-actions">
      <button type="button" disabled={busy} onClick={() => onReview(id, "approve")}>
        Approve
      </button>
      <button type="button" disabled={busy} onClick={() => onReview(id, "reject")}>
        Reject
      </button>
    </div>
  );
}

function InfoLite({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="info-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CandidateEditForm({
  item,
  busy,
  onUpdate
}: {
  item: CandidateRelationshipReviewItem;
  busy: boolean;
  onUpdate: (id: string, patch: CandidateRelationshipPatch) => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    onUpdate(item.id, {
      confidence: Number(data.get("confidence")),
      note: String(data.get("note") || ""),
      sourceId: String(data.get("sourceId") || ""),
      evidenceUrl: String(data.get("evidenceUrl") || "")
    });
  }

  return (
    <form className="candidate-edit" onSubmit={handleSubmit}>
      <label>
        <span>confidence</span>
        <input name="confidence" type="number" min="0" max="1" step="0.01" defaultValue={item.confidence} />
      </label>
      <label>
        <span>source</span>
        <select name="sourceId" defaultValue={typeof item.payload.sourceId === "string" ? item.payload.sourceId : "src_ecosystem_mapping"}>
          {sourceOptions.map((sourceId) => (
            <option key={sourceId} value={sourceId}>
              {sourceId}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>evidence URL</span>
        <input name="evidenceUrl" type="url" defaultValue={item.evidenceUrl || ""} />
      </label>
      <label className="wide">
        <span>note</span>
        <textarea name="note" rows={3} defaultValue={typeof item.payload.note === "string" ? item.payload.note : ""} />
      </label>
      <button type="submit" disabled={busy}>
        Save
      </button>
    </form>
  );
}

function CandidateMetricEditForm({
  item,
  busy,
  onUpdate
}: {
  item: CandidateMetricReviewItem;
  busy: boolean;
  onUpdate: (id: string, patch: CandidateMetricPatch) => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const valueNumberRaw = String(data.get("valueNumber") || "").trim();
    const valueTextRaw = String(data.get("valueText") || "").trim();
    onUpdate(item.id, {
      metricType: String(data.get("metricType") || ""),
      valueNumber: valueNumberRaw ? Number(valueNumberRaw) : null,
      valueText: valueTextRaw || null,
      asOfDate: String(data.get("asOfDate") || ""),
      sourceId: String(data.get("sourceId") || ""),
      sourceRef: String(data.get("sourceRef") || ""),
      confidence: Number(data.get("confidence")),
      evidenceUrl: String(data.get("evidenceUrl") || ""),
      note: String(data.get("note") || "")
    });
  }

  return (
    <form className="candidate-edit" onSubmit={handleSubmit}>
      <label>
        <span>metric type</span>
        <input name="metricType" defaultValue={item.metricType} required />
      </label>
      <label>
        <span>value number</span>
        <input name="valueNumber" type="number" step="any" defaultValue={item.valueNumber ?? ""} />
      </label>
      <label>
        <span>value text</span>
        <input name="valueText" defaultValue={item.valueText || ""} />
      </label>
      <label>
        <span>as of</span>
        <input name="asOfDate" defaultValue={item.asOfDate} required />
      </label>
      <label>
        <span>source</span>
        <select name="sourceId" defaultValue={item.sourceId || "src_openalex"}>
          {sourceOptions.map((sourceId) => (
            <option key={sourceId} value={sourceId}>
              {sourceId}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>source ref</span>
        <input name="sourceRef" defaultValue={item.sourceRef || ""} />
      </label>
      <label>
        <span>confidence</span>
        <input name="confidence" type="number" min="0" max="1" step="0.01" defaultValue={item.confidence} />
      </label>
      <label>
        <span>evidence URL</span>
        <input name="evidenceUrl" type="url" defaultValue={item.evidenceUrl || ""} />
      </label>
      <label className="wide">
        <span>note</span>
        <textarea name="note" rows={3} defaultValue={typeof item.payload.note === "string" ? item.payload.note : ""} />
      </label>
      <button type="submit" disabled={busy}>
        Save metric
      </button>
    </form>
  );
}
