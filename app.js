(() => {
const seed = window.AI_CAPITAL_SEED;
window.AI_CAPITAL_BOOT = window.AI_CAPITAL_BOOT || {};
window.AI_CAPITAL_BOOT.appStarted = true;

if (!seed) {
  throw new Error("AI_CAPITAL_SEED is missing. Load data/seed.js before app.js.");
}

const { layers, entities, sources, relationships, relationLabels } = seed;
const metricBundle = window.AI_CAPITAL_METRICS || { metrics: [] };
const MAX_RENDERED_EDGES = 320;

const entityById = new Map(entities.map((entity) => [entity.id, entity]));
const layerById = new Map(layers.map((layer) => [layer.id, layer]));
const sourceById = new Map(sources.map((source) => [source.id, source]));
const metricsByEntityId = new Map();
metricBundle.metrics.forEach((entry) => {
  if (!metricsByEntityId.has(entry.entityId)) metricsByEntityId.set(entry.entityId, []);
  metricsByEntityId.get(entry.entityId).push(entry);
});
const metricFailuresByEntityId = new Map();
(metricBundle.rejectedOrFailed || []).forEach((entry) => {
  if (!metricFailuresByEntityId.has(entry.entityId)) metricFailuresByEntityId.set(entry.entityId, []);
  metricFailuresByEntityId.get(entry.entityId).push(entry);
});

function formatEvidenceStrength(source) {
  const labels = {
    official_api: "官方 API",
    official_docs: "官方/公开文档",
    third_party_index: "第三方索引",
    manual_seed: "人工种子",
    derived: "派生"
  };
  return labels[source.evidenceStrength] || source.sourceType || "未分级";
}

const state = {
  selectedId: "openai",
  search: "",
  depth: "1",
  minConfidence: 0.6,
  relationType: "all",
  highlightedRelationId: null
};

const elements = {
  entityList: document.getElementById("entity-list"),
  graphSvg: document.getElementById("graph-svg"),
  detailContent: document.getElementById("detail-content"),
  searchInput: document.getElementById("search-input"),
  clearSearch: document.getElementById("clear-search"),
  confidenceRange: document.getElementById("confidence-range"),
  confidenceLabel: document.getElementById("confidence-label"),
  relationFilter: document.getElementById("relation-filter"),
  resetView: document.getElementById("reset-view"),
  layerGrid: document.getElementById("layer-grid"),
  legend: document.getElementById("legend"),
  sourceModal: document.getElementById("source-modal"),
  sourceModalBody: document.getElementById("source-modal-body"),
  sourceModalClose: document.getElementById("source-modal-close")
};

function init() {
  document.getElementById("stat-entities").textContent = entities.length;
  document.getElementById("stat-relations").textContent = relationships.length;
  document.getElementById("stat-sources").textContent = sources.length;
  renderLegend();
  renderLayerGrid();
  bindEvents();
  render();
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderEntityList();
  });

  elements.clearSearch.addEventListener("click", () => {
    state.search = "";
    elements.searchInput.value = "";
    renderEntityList();
  });

  document.querySelectorAll("[data-depth]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-depth]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.depth = button.dataset.depth;
      render();
    });
  });

  elements.confidenceRange.addEventListener("input", (event) => {
    state.minConfidence = Number(event.target.value);
    elements.confidenceLabel.textContent = state.minConfidence.toFixed(2).replace(/0$/, "");
    render();
  });

  elements.relationFilter.addEventListener("change", (event) => {
    state.relationType = event.target.value;
    render();
  });

  elements.resetView.addEventListener("click", () => {
    state.selectedId = "openai";
    state.depth = "1";
    state.minConfidence = 0.6;
    state.relationType = "all";
    state.highlightedRelationId = null;
    elements.confidenceRange.value = "0.6";
    elements.confidenceLabel.textContent = "0.6";
    elements.relationFilter.value = "all";
    document.querySelectorAll("[data-depth]").forEach((item) => {
      item.classList.toggle("active", item.dataset.depth === "1");
    });
    render();
  });

  elements.sourceModalClose.addEventListener("click", closeSourceModal);
  elements.sourceModal.addEventListener("click", (event) => {
    if (event.target === elements.sourceModal) closeSourceModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.sourceModal.hidden) closeSourceModal();
  });
}

function render() {
  renderEntityList();
  renderGraph();
  renderDetail();
}

function renderLegend() {
  elements.legend.innerHTML = layers
    .map(
      (layer) => `
        <span class="legend-item">
          <span class="legend-dot" style="background:${layer.color}"></span>
          ${layer.name}
        </span>
      `
    )
    .join("");
}

function renderLayerGrid() {
  elements.layerGrid.innerHTML = layers
    .map((layer) => {
      const count = entities.filter((entity) => entity.layer === layer.id).length;
      return `
        <article class="layer-tile">
          <h3>${layer.name}</h3>
          <p>${layer.description}</p>
          <span class="layer-count">${count} 个实体</span>
        </article>
      `;
    })
    .join("");
}

function renderEntityList() {
  const filtered = entities
    .filter((entity) => {
      if (!state.search) return true;
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
      return haystack.includes(state.search);
    })
    .sort((a, b) => a.layer.localeCompare(b.layer) || a.name.localeCompare(b.name));

  elements.entityList.innerHTML = filtered
    .map((entity) => {
      const layer = layerById.get(entity.layer);
      const active = entity.id === state.selectedId ? " active" : "";
      return `
        <button class="entity-button${active}" type="button" data-entity="${entity.id}" style="border-left-color:${layer.color}">
          <strong>${entity.name}</strong>
          <span>${layer.name} / ${entity.status}${entity.ticker ? ` / ${entity.ticker}` : ""}</span>
        </button>
      `;
    })
    .join("");

  elements.entityList.querySelectorAll("[data-entity]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.entity;
      state.highlightedRelationId = null;
      render();
    });
  });
}

function getVisibleGraph() {
  const filteredRelationships = relationships.filter((relationship) => {
    const confidenceOk = relationship.confidence >= state.minConfidence;
    const typeOk = state.relationType === "all" || relationship.type === state.relationType;
    return confidenceOk && typeOk;
  });

  if (state.depth === "all") {
    return {
      nodes: entities,
      edges: capRenderedEdges(filteredRelationships)
    };
  }

  const visibleIds = new Set([state.selectedId]);
  const maxDepth = Number(state.depth);
  let frontier = new Set([state.selectedId]);

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next = new Set();
    filteredRelationships.forEach((relationship) => {
      if (frontier.has(relationship.source)) {
        next.add(relationship.target);
      }
      if (frontier.has(relationship.target)) {
        next.add(relationship.source);
      }
    });
    next.forEach((id) => visibleIds.add(id));
    frontier = next;
  }

  return {
    nodes: entities.filter((entity) => visibleIds.has(entity.id)),
    edges: capRenderedEdges(
      filteredRelationships.filter(
        (relationship) => visibleIds.has(relationship.source) && visibleIds.has(relationship.target)
      )
    )
  };
}

function capRenderedEdges(edgeList) {
  if (edgeList.length <= MAX_RENDERED_EDGES) return edgeList;
  return [...edgeList].sort((a, b) => b.confidence - a.confidence).slice(0, MAX_RENDERED_EDGES);
}

function renderGraph() {
  const graph = getVisibleGraph();
  const grouped = new Map();
  graph.nodes.forEach((entity) => {
    if (!grouped.has(entity.layer)) grouped.set(entity.layer, []);
    grouped.get(entity.layer).push(entity);
  });

  const positions = new Map();
  const activeLayers = layers.filter((layer) => grouped.has(layer.id));
  const layerCount = Math.max(activeLayers.length, 1);
  const width = 1120;
  const height = 620;
  const left = 90;
  const right = width - 90;

  activeLayers.forEach((layer, layerIndex) => {
    const layerEntities = grouped.get(layer.id).sort((a, b) => a.name.localeCompare(b.name));
    const x = layerCount === 1 ? width / 2 : left + ((right - left) * layerIndex) / (layerCount - 1);
    const gap = height / (layerEntities.length + 1);
    layerEntities.forEach((entity, entityIndex) => {
      positions.set(entity.id, {
        x,
        y: Math.max(68, Math.min(height - 62, gap * (entityIndex + 1)))
      });
    });
  });

  const edgeMarkup = graph.edges
    .map((relationship) => {
      const source = positions.get(relationship.source);
      const target = positions.get(relationship.target);
      if (!source || !target) return "";
      const dx = Math.max(70, Math.abs(target.x - source.x) * 0.42);
      const path = `M ${source.x} ${source.y} C ${source.x + dx} ${source.y}, ${target.x - dx} ${target.y}, ${target.x} ${target.y}`;
      const highlight = relationship.id === state.highlightedRelationId ? " highlight" : "";
      return `
        <g>
          <path class="edge-path${highlight}" d="${path}" marker-end="url(#arrow)" />
          <path class="edge-hit" d="${path}" data-relation="${relationship.id}" />
        </g>
      `;
    })
    .join("");

  const nodeMarkup = graph.nodes
    .map((entity) => {
      const position = positions.get(entity.id);
      const layer = layerById.get(entity.layer);
      const active = entity.id === state.selectedId ? " active" : "";
      return `
        <g class="node-group${active}" data-entity="${entity.id}" transform="translate(${position.x}, ${position.y})">
          <circle class="node-circle" r="24" fill="${layer.color}" />
          <text class="node-label" y="43" text-anchor="middle">${shorten(entity.name, 17)}</text>
          <text class="node-meta" y="58" text-anchor="middle">${layer.name}</text>
        </g>
      `;
    })
    .join("");

  const empty = graph.nodes.length === 0 ? `<text x="560" y="310" text-anchor="middle">没有符合条件的节点</text>` : "";

  elements.graphSvg.innerHTML = `
    <defs>
      <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L9,3 z" fill="rgba(31,37,40,0.45)" />
      </marker>
    </defs>
    ${edgeMarkup}
    ${nodeMarkup}
    ${empty}
  `;

  elements.graphSvg.querySelectorAll("[data-entity]").forEach((node) => {
    node.addEventListener("click", () => {
      state.selectedId = node.dataset.entity;
      state.highlightedRelationId = null;
      render();
    });
  });

  elements.graphSvg.querySelectorAll("[data-relation]").forEach((edge) => {
    edge.addEventListener("click", () => {
      state.highlightedRelationId = edge.dataset.relation;
      const relationship = relationships.find((item) => item.id === state.highlightedRelationId);
      if (relationship) {
        state.selectedId = relationship.target;
      }
      render();
    });
  });
}

function renderDetail() {
  const entity = entityById.get(state.selectedId);
  if (!entity) {
    elements.detailContent.innerHTML = `<p class="detail-empty">选择一个节点查看公司、指标和证据。</p>`;
    return;
  }

  const layer = layerById.get(entity.layer);
  const related = relationships
    .filter((relationship) => relationship.source === entity.id || relationship.target === entity.id)
    .sort((a, b) => b.confidence - a.confidence);

  const incoming = related.filter((relationship) => relationship.target === entity.id);
  const outgoing = related.filter((relationship) => relationship.source === entity.id);
  const publicMetrics = metricsByEntityId.get(entity.id) || [];
  const metricFailures = metricFailuresByEntityId.get(entity.id) || [];
  const identityMetrics = [
    ["官网", entity.website_url],
    ["国家/地区", entity.country],
    ["交易所", entity.exchange],
    ["别名", (entity.aliases || []).slice(0, 4).join(", ")]
  ].filter(([, value]) => value);
  const metricMarkup = Object.entries(entity.metrics)
    .map(
      ([label, value]) => `
        <div class="metric-item">
          <strong>${value}</strong>
          <span>${label}</span>
        </div>
      `
    )
    .join("");

  elements.detailContent.innerHTML = `
    <span class="detail-kicker" style="color:${layer.color}">${layer.name}</span>
    <h2>${entity.name}</h2>
    <p class="detail-desc">${entity.description}</p>
    <div class="metric-grid">
      <div class="metric-item">
        <strong>${entity.valuation}</strong>
        <span>估值口径</span>
      </div>
      ${identityMetrics
        .map(
          ([label, value]) => `
        <div class="metric-item">
          <strong>${formatMetricValue(label, value)}</strong>
          <span>${label}</span>
        </div>
      `
        )
        .join("")}
      ${metricMarkup}
    </div>
    ${renderRelationSection("上游 / 输入", incoming, true)}
    ${renderRelationSection("下游 / 输出", outgoing, false)}
    ${renderPublicMetrics(publicMetrics, metricFailures)}
    <div class="detail-section">
      <h3>证据来源</h3>
      <div class="source-list">
        ${renderSourceList(related)}
      </div>
    </div>
  `;
}

function renderPublicMetrics(publicMetrics, metricFailures) {
  if (publicMetrics.length === 0 && metricFailures.length === 0) {
    return `
      <div class="detail-section">
        <h3>公开指标</h3>
        <div class="relation-list">
          <div class="relation-item"><span>暂无已审核的自动采集指标。</span></div>
        </div>
      </div>
    `;
  }

  const rows = publicMetrics
    .map((entry) => {
      const metricRows = Object.entries(entry.metrics)
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([key, value]) => `${formatMetricLabel(key)}: ${formatMetricNumber(value)}`)
        .join(" / ");
      return `
        <div class="relation-item">
          <strong>${entry.source} ${entry.sourceRef ? `/${entry.sourceRef}` : ""}</strong>
          <span>${metricRows}</span>
          <span>as of ${entry.asOf}</span>
          ${entry.evidenceUrl ? `<span>证据：<a href="${entry.evidenceUrl}" target="_blank" rel="noreferrer">${entry.collectionMethod || "official_source"}</a></span>` : ""}
          ${entry.reviewNote ? `<span>${entry.reviewNote}</span>` : ""}
        </div>
      `;
    })
    .join("");
  const failureRows = metricFailures
    .map(
      (entry) => `
        <div class="relation-item metric-failure">
          <strong>${entry.source} 采集失败</strong>
          <span>${entry.message}</span>
          ${entry.code || entry.url ? `<span>${[entry.code, entry.url].filter(Boolean).join(" / ")}</span>` : ""}
        </div>
      `
    )
    .join("");

  return `
    <div class="detail-section">
      <h3>公开指标</h3>
      <div class="relation-list">
        ${rows}
        ${failureRows}
      </div>
    </div>
  `;
}

function renderRelationSection(title, relationList, incoming) {
  const visibleRelations = relationList.slice(0, 40);
  const hiddenCount = Math.max(0, relationList.length - visibleRelations.length);
  const rows = visibleRelations
    .map((relationship) => {
      const otherId = incoming ? relationship.source : relationship.target;
      const other = entityById.get(otherId);
      return `
        <button class="relation-item" type="button" onclick="selectEntity('${other.id}')">
          <strong>${incoming ? other.name : relationLabels[relationship.type] + " -> " + other.name}</strong>
          <span>${relationLabels[relationship.type]} / confidence ${relationship.confidence.toFixed(2)}. ${relationship.note}</span>
          ${relationship.evidenceUrl ? `<span>具体证据：${relationship.evidenceTitle || relationship.evidenceUrl}</span>` : ""}
        </button>
      `;
    })
    .join("");

  return `
    <div class="detail-section">
      <h3>${title}</h3>
      <div class="relation-list">
        ${rows || `<div class="relation-item"><span>暂无已录入关系。</span></div>`}
        ${hiddenCount ? `<div class="relation-item"><span>还有 ${hiddenCount} 条关系未展开显示。可用置信度和关系类型过滤收窄图谱。</span></div>` : ""}
      </div>
    </div>
  `;
}

function renderSourceList(relationList) {
  const usedSources = [...new Set(relationList.map((relationship) => relationship.sourceId))]
    .map((id) => sourceById.get(id))
    .filter(Boolean);

  return usedSources
    .map(
      (source) => `
        <div class="source-item">
          <button type="button" class="source-open" onclick="openSourceModal('${source.id}')">${source.title}</button>
          <span>${source.publisher} / ${source.date} / ${formatEvidenceStrength(source)}</span>
          <span>${source.note}</span>
        </div>
      `
    )
    .join("");
}

function openSourceModal(sourceId) {
  const source = sourceById.get(sourceId);
  if (!source) return;

  const relationshipCount = relationships.filter((relationship) => relationship.sourceId === sourceId).length;
  elements.sourceModalBody.innerHTML = `
    <div class="source-modal-grid">
      <div>
        <span>Publisher</span>
        <strong>${source.publisher}</strong>
      </div>
      <div>
        <span>Date</span>
        <strong>${source.date}</strong>
      </div>
      <div>
        <span>Evidence</span>
        <strong>${formatEvidenceStrength(source)}</strong>
      </div>
      <div>
        <span>Source type</span>
        <strong>${source.sourceType || "unknown"}</strong>
      </div>
      <div>
        <span>Linked relationships</span>
        <strong>${relationshipCount}</strong>
      </div>
      <div>
        <span>Source ID</span>
        <strong>${source.id}</strong>
      </div>
    </div>
    <p class="source-modal-note">${source.note}</p>
    ${source.licenseNote ? `<p class="source-modal-note">${source.licenseNote}</p>` : ""}
    <a class="source-modal-link" href="${source.url}" target="_blank" rel="noreferrer">打开来源链接</a>
  `;
  document.getElementById("source-modal-title").textContent = source.title;
  elements.sourceModal.hidden = false;
}

function closeSourceModal() {
  elements.sourceModal.hidden = true;
}

function selectEntity(id) {
  state.selectedId = id;
  state.highlightedRelationId = null;
  render();
}

function shorten(text, maxLength) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function formatMetricValue(label, value) {
  if (label === "官网") {
    return `<a href="${value}" target="_blank" rel="noreferrer">${value.replace(/^https?:\/\//, "")}</a>`;
  }
  return value;
}

function formatMetricLabel(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

function formatMetricNumber(value) {
  if (typeof value !== "number") return value;
  return new Intl.NumberFormat("en", { notation: value >= 1000000 ? "compact" : "standard" }).format(value);
}

window.selectEntity = selectEntity;
window.openSourceModal = openSourceModal;
init();
window.AI_CAPITAL_BOOT.appLoaded = true;
})();
