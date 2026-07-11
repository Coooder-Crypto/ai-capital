"use client";

import { useEffect, useMemo, useState } from "react";
import type { ResearchTimelineEvent } from "@/lib/types";

type TimelineMode = "recent" | "candidate" | "evidence" | "pipeline" | "approved" | "all";
type TimelineStatus = "all" | string;

type FilterConfig = {
  id: TimelineMode;
  label: string;
  types?: string[];
};

const filters: FilterConfig[] = [
  { id: "recent", label: "本周新增" },
  { id: "candidate", label: "候选", types: ["candidate_relationship", "candidate_entity", "candidate_metric"] },
  { id: "evidence", label: "证据待补", types: ["evidence_backlog"] },
  {
    id: "pipeline",
    label: "采集链路",
    types: ["connector_run", "raw_document", "parsed_document", "extraction_record", "llm_extraction"]
  },
  { id: "approved", label: "已入图/指标", types: ["relationship", "metric", "source"] },
  { id: "all", label: "全部" }
];
const filterIds = new Set(filters.map((filter) => filter.id));
const statusLabels: Record<string, string> = {
  all: "全部状态",
  candidate: "候选",
  approved: "已批准",
  rejected: "已拒绝",
  pending: "待处理",
  needs_review: "待审核",
  failed: "失败",
  extracted: "已抽取",
  parsed: "已解析"
};

const eventLabels: Record<string, string> = {
  candidate_relationship: "候选关系",
  candidate_entity: "候选实体",
  candidate_metric: "候选指标",
  connector_run: "采集运行",
  raw_document: "原始文档",
  parsed_document: "解析文档",
  extraction_record: "抽取记录",
  llm_extraction: "LLM 记录",
  relationship: "已入图关系",
  metric: "公开指标",
  source: "来源",
  retry: "重试",
  evidence_backlog: "证据待补"
};

function formatDate(value: string | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function eventLabel(type: string) {
  return eventLabels[type] || type.replaceAll("_", " ");
}

function eventText(event: ResearchTimelineEvent) {
  return [
    event.title,
    event.type,
    event.entityId || "",
    event.entityName || "",
    event.sourceId,
    event.status || "",
    event.description,
    event.url
  ]
    .join(" ")
    .toLowerCase();
}

function getLatestEventTime(events: ResearchTimelineEvent[]) {
  return events.reduce((latest, event) => {
    const time = new Date(event.date).getTime();
    return Number.isFinite(time) && time > latest ? time : latest;
  }, 0);
}

function isRecentEvent(event: ResearchTimelineEvent, latestTime: number) {
  if (!latestTime) return true;
  const time = new Date(event.date).getTime();
  if (!Number.isFinite(time)) return false;
  return latestTime - time <= 7 * 24 * 60 * 60 * 1000;
}

function matchesFilter(event: ResearchTimelineEvent, mode: TimelineMode, latestTime: number) {
  if (mode === "all") return true;
  if (mode === "recent") return isRecentEvent(event, latestTime);
  const filter = filters.find((entry) => entry.id === mode);
  return Boolean(filter?.types?.includes(event.type));
}

function matchesEntity(event: ResearchTimelineEvent, entityId: string) {
  return entityId ? event.entityId === entityId : true;
}

function matchesStatus(event: ResearchTimelineEvent, status: TimelineStatus) {
  return status === "all" ? true : event.status === status;
}

function statusLabel(status: string) {
  return statusLabels[status] || status.replaceAll("_", " ");
}

function readTimelineState() {
  if (typeof window === "undefined") return { mode: "recent" as TimelineMode, query: "", entityId: "", status: "all" };
  const params = new URLSearchParams(window.location.search);
  const modeParam = params.get("view") || "recent";
  const status = params.get("status") || "all";
  return {
    mode: filterIds.has(modeParam as TimelineMode) ? (modeParam as TimelineMode) : "recent",
    query: params.get("q") || "",
    entityId: params.get("entity") || "",
    status
  };
}

function writeTimelineState(mode: TimelineMode, query: string, entityId: string, status: TimelineStatus) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (mode === "recent") {
    params.delete("view");
  } else {
    params.set("view", mode);
  }
  if (query.trim()) {
    params.set("q", query.trim());
  } else {
    params.delete("q");
  }
  if (entityId.trim()) {
    params.set("entity", entityId.trim());
  } else {
    params.delete("entity");
  }
  if (status !== "all") {
    params.set("status", status);
  } else {
    params.delete("status");
  }
  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) {
    window.history.replaceState(null, "", nextUrl);
  }
}

export function ResearchTimelineClient({ events }: { events: ResearchTimelineEvent[] }) {
  const initialState = readTimelineState();
  const [mode, setMode] = useState<TimelineMode>(initialState.mode);
  const [query, setQuery] = useState(initialState.query);
  const [entityId, setEntityId] = useState(initialState.entityId);
  const [status, setStatus] = useState<TimelineStatus>(initialState.status);
  const latestEventTime = useMemo(() => getLatestEventTime(events), [events]);
  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    writeTimelineState(mode, query, entityId, status);
  }, [entityId, mode, query, status]);

  useEffect(() => {
    function applyBrowserState() {
      const nextState = readTimelineState();
      setMode(nextState.mode);
      setQuery(nextState.query);
      setEntityId(nextState.entityId);
      setStatus(nextState.status);
    }
    window.addEventListener("popstate", applyBrowserState);
    return () => window.removeEventListener("popstate", applyBrowserState);
  }, []);

  const countsByMode = useMemo(() => {
    return Object.fromEntries(
      filters.map((filter) => [
        filter.id,
        events
          .filter((event) => matchesEntity(event, entityId))
          .filter((event) => matchesStatus(event, status))
          .filter((event) => matchesFilter(event, filter.id, latestEventTime)).length
      ])
    ) as Record<TimelineMode, number>;
  }, [entityId, events, latestEventTime, status]);

  const statusOptions = useMemo(() => {
    const statuses = new Set<string>();
    for (const event of events) {
      if (matchesEntity(event, entityId) && matchesFilter(event, mode, latestEventTime) && event.status) {
        statuses.add(event.status);
      }
    }
    if (status !== "all") statuses.add(status);
    return ["all", ...Array.from(statuses).sort()];
  }, [entityId, events, latestEventTime, mode, status]);

  const filteredEvents = useMemo(() => {
    return events
      .filter((event) => matchesEntity(event, entityId))
      .filter((event) => matchesStatus(event, status))
      .filter((event) => matchesFilter(event, mode, latestEventTime))
      .filter((event) => (normalizedQuery ? eventText(event).includes(normalizedQuery) : true));
  }, [entityId, events, latestEventTime, mode, normalizedQuery, status]);

  const visibleEvents = filteredEvents.slice(0, 80);
  const resetFilters = () => {
    setMode("recent");
    setQuery("");
    setEntityId("");
    setStatus("all");
  };

  return (
    <div className="research-timeline">
      <div className="timeline-controls">
        <div className="segmented timeline-segmented">
          {filters.map((filter) => (
            <button
              className={mode === filter.id ? "active" : ""}
              key={filter.id}
              onClick={() => setMode(filter.id)}
              type="button"
            >
              {filter.label}
              <span>{countsByMode[filter.id].toLocaleString("en-US")}</span>
            </button>
          ))}
        </div>
        <label className="timeline-filter">
          <span>状态</span>
          <select onChange={(event) => setStatus(event.target.value)} value={status}>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {statusLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="timeline-search">
          <span>搜索</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="实体、来源、事件"
            value={query}
          />
        </label>
      </div>

      <div className="timeline-summary">
        <strong>{filteredEvents.length.toLocaleString("en-US")}</strong>
        <span>匹配事件</span>
        <span>显示 {visibleEvents.length.toLocaleString("en-US")}</span>
        {entityId ? <span className="timeline-chip">Entity {entityId}</span> : null}
        {status !== "all" ? <span className="timeline-chip">Status {statusLabel(status)}</span> : null}
        {(mode !== "recent" || query.trim() || entityId || status !== "all") && (
          <button className="timeline-reset" onClick={resetFilters} type="button">
            Reset
          </button>
        )}
      </div>

      <div className="timeline-list">
        {visibleEvents.map((event) => (
          <a className="timeline-item" href={event.url || "#"} key={event.id}>
            <span>{formatDate(event.date)}</span>
            <strong>{event.title}</strong>
            <em>{event.status ? `${eventLabel(event.type)} / ${statusLabel(event.status)}` : eventLabel(event.type)}</em>
            <p>{event.description}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
