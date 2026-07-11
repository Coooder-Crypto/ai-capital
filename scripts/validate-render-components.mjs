import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const tempDir = await mkdtemp(path.join(process.cwd(), ".tmp-render-"));

const compilerOptions = {
  module: ts.ModuleKind.ES2022,
  target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.ReactJSX,
  importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove
};

async function transpileModule(sourcePath, outputName, replacements = {}) {
  const source = await readFile(new URL(sourcePath, root), "utf8");
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions,
    fileName: sourcePath,
    reportDiagnostics: true
  });
  assert.equal(diagnostics?.length || 0, 0, diagnostics?.map((diagnostic) => diagnostic.messageText).join("\n"));

  const outputPath = path.join(tempDir, outputName);
  let rewritten = outputText;
  for (const [from, to] of Object.entries(replacements)) {
    rewritten = rewritten.replaceAll(from, to);
  }
  await writeFile(outputPath, rewritten);
  return pathToFileURL(outputPath).href;
}

try {
  const apiClientPath = path.join(tempDir, "api-client.mjs");
  await writeFile(
    apiClientPath,
    'export async function submitCorrection() { return { data: { id: "candidate_render_test" } }; }\n'
  );

  const uiFormattersUrl = await transpileModule("src/lib/ui-formatters.ts", "ui-formatters.mjs");
  const sectionsUrl = await transpileModule("src/app/components/EntityDetailSections.tsx", "EntityDetailSections.mjs", {
    '"@/lib/ui-formatters"': `"${uiFormattersUrl}"`
  });
  const panelsUrl = await transpileModule("src/app/components/CapitalMapPanels.tsx", "CapitalMapPanels.mjs", {
    '"@/lib/ui-formatters"': `"${uiFormattersUrl}"`
  });
  const detailPanelUrl = await transpileModule("src/app/components/EntityDetailPanel.tsx", "EntityDetailPanel.mjs", {
    '"@/app/components/EntityDetailSections"': `"${sectionsUrl}"`,
    '"@/lib/api-client"': `"${pathToFileURL(apiClientPath).href}"`,
    '"@/lib/ui-formatters"': `"${uiFormattersUrl}"`
  });

  const { StatsGrid, ControlPanel, GraphPanel, LayerGrid } = await import(panelsUrl);
  const { EntityDetailPanel } = await import(detailPanelUrl);

  const layers = [
    { id: "models", name: "模型层", color: "#1e6674", description: "Foundation models" },
    { id: "chips", name: "芯片层", color: "#a23b2a", description: "Compute suppliers" }
  ];
  const openai = {
    id: "openai",
    name: "OpenAI",
    type: "company",
    layer: "models",
    status: "private",
    valuation: "private disclosed",
    website_url: "https://openai.com",
    country: "US",
    aliases: ["ChatGPT"],
    metrics: { users: "large" },
    description: "AI model company."
  };
  const nvidia = {
    id: "nvidia",
    name: "NVIDIA",
    type: "company",
    layer: "chips",
    status: "public",
    ticker: "NVDA",
    valuation: "public market cap",
    website_url: "https://www.nvidia.com",
    country: "US",
    exchange: "NASDAQ",
    aliases: ["NVDA"],
    metrics: {},
    description: "GPU supplier."
  };
  const paper = {
    id: "paper_transformer",
    name: "Attention Is All You Need",
    type: "paper",
    layer: "models",
    status: "approved",
    valuation: "research artifact",
    metrics: { citations: "large" },
    description: "Transformer architecture paper."
  };
  const researchOrg = {
    id: "research_org_google",
    name: "Google Research",
    type: "research_org",
    layer: "models",
    status: "approved",
    valuation: "research organization",
    metrics: {},
    description: "Research institution."
  };
  const author = {
    id: "research_author_vaswani",
    name: "Ashish Vaswani",
    type: "research_author",
    layer: "models",
    status: "approved",
    valuation: "research author",
    metrics: {},
    description: "Research author."
  };
  const relationship = {
    id: "rel_nvidia_openai",
    source: "nvidia",
    target: "openai",
    type: "supplies_to",
    confidence: 0.92,
    sourceId: "source_nvidia_openai",
    note: "OpenAI uses NVIDIA GPUs.",
    evidenceTitle: "Infrastructure note",
    evidenceUrl: "https://example.com/evidence"
  };
  const paperRelationship = {
    id: "rel_openai_paper",
    source: "openai",
    target: "paper_transformer",
    type: "related_to",
    confidence: 0.86,
    sourceId: "source_nvidia_openai",
    note: "Paper is relevant to model infrastructure analysis.",
    evidenceTitle: "Paper evidence",
    evidenceUrl: "https://example.com/paper"
  };
  const orgRelationship = {
    id: "rel_paper_org",
    source: "paper_transformer",
    target: "research_org_google",
    type: "published_by",
    confidence: 0.91,
    sourceId: "source_nvidia_openai",
    note: "Institution affiliation from OpenAlex."
  };
  const authorRelationship = {
    id: "rel_paper_author",
    source: "paper_transformer",
    target: "research_author_vaswani",
    type: "authored_by",
    confidence: 0.94,
    sourceId: "source_nvidia_openai",
    note: "Author metadata from OpenAlex."
  };
  const citationRelationship = {
    id: "rel_paper_cites",
    source: "paper_transformer",
    target: "openai",
    type: "cites",
    confidence: 0.72,
    sourceId: "source_nvidia_openai",
    note: "Citation relationship smoke test."
  };
  const source = {
    id: "source_nvidia_openai",
    title: "Infrastructure note",
    publisher: "Example",
    date: "2026-01-01",
    url: "https://example.com/evidence",
    note: "Render test source.",
    evidenceStrength: "official_docs"
  };
  const relationLabels = {
    supplies_to: "supplies to",
    related_to: "相关",
    published_by: "发表机构",
    authored_by: "作者",
    cites: "引用"
  };
  const entityById = new Map([
    [openai.id, openai],
    [nvidia.id, nvidia],
    [paper.id, paper],
    [researchOrg.id, researchOrg],
    [author.id, author]
  ]);
  const layerById = new Map(layers.map((layer) => [layer.id, layer]));
  const noop = () => {};

  const statsMarkup = renderToStaticMarkup(
    createElement(StatsGrid, { layerCount: 2, entityCount: 2, relationshipCount: 1, metricCount: 1 })
  );
  assert.match(statsMarkup, /产业层级/);
  assert.match(statsMarkup, /公开指标/);

  const controlMarkup = renderToStaticMarkup(
    createElement(ControlPanel, {
      search: "open",
      depth: "1",
      minConfidence: 0.6,
      relationType: "all",
      relationOptions: ["supplies_to"],
      relationLabels,
      filteredEntities: [openai, nvidia],
      selectedEntity: openai,
      layerById,
      entitySearchStatus: "idle",
      entitySearchError: null,
      entitySearchCount: 2,
      entitySearchTotal: 2,
      seedEntityCount: 2,
      metricsByEntityId: new Map([[openai.id, [{ entityId: openai.id, source: "GitHub", asOf: "2026-01-01", metrics: {} }]]]),
      onSearchChange: noop,
      onDepthChange: noop,
      onMinConfidenceChange: noop,
      onRelationTypeChange: noop,
      onReset: noop,
      onSelectEntity: noop
    })
  );
  assert.match(controlMarkup, /OpenAI/);
  assert.match(controlMarkup, /Reset/);

  const graphMarkup = renderToStaticMarkup(
    createElement(GraphPanel, {
      title: "OpenAI",
      visibleGraph: { nodes: [openai, nvidia], edges: [relationship] },
      layers,
      layerById,
      positionedNodes: new Map([
        [openai.id, { ...openai, x: 800, y: 260 }],
        [nvidia.id, { ...nvidia, x: 240, y: 260 }]
      ]),
      selectedEntityId: openai.id,
      highlightedRelationId: relationship.id,
      graphStatus: "idle",
      graphError: null,
      onSelectEntity: noop,
      onHighlightRelation: noop
    })
  );
  assert.match(graphMarkup, /2 nodes \/ 1 edges/);
  assert.match(graphMarkup, /OpenAI/);

  const detailMarkup = renderToStaticMarkup(
    createElement(EntityDetailPanel, {
      entity: openai,
      layer: layers[0],
      incoming: [relationship, citationRelationship],
      outgoing: [],
      entityById,
      relationLabels,
      metrics: [
        {
          entityId: openai.id,
          source: "OpenAlex",
          sourceRef: "works",
          asOf: "2026-01-01",
          metrics: { worksCount: 42 },
          evidenceUrl: "https://example.com/metrics"
        }
      ],
      failures: [],
      recentResearchEvents: [
        {
          id: "event_openai_candidate",
          date: "2026-07-05",
          type: "candidate_relationship",
          title: "OpenAI related_to evaluation paper",
          entityId: openai.id,
          entityName: openai.name,
          sourceId: "arxiv_paper_relationship_snapshot",
          url: "https://example.com/research-event",
          description: "Recent research event render smoke test.",
          status: "candidate",
          confidence: 0.72
        }
      ],
      sources: [source],
      allRelationships: [relationship, paperRelationship, orgRelationship, authorRelationship, citationRelationship],
      status: "idle",
      error: null,
      redirectNotice: { from: "legacy_openai", to: openai.id },
      onSelectEntity: noop,
      onOpenSource: noop
    })
  );
  assert.match(detailMarkup, /旧实体 ID legacy_openai 已合并到 OpenAI/);
  assert.match(detailMarkup, /NVIDIA/);
  assert.match(detailMarkup, /公开指标/);
  assert.match(detailMarkup, /Infrastructure note/);
  assert.match(detailMarkup, /最近研究动态/);
  assert.match(detailMarkup, /OpenAI related_to evaluation paper/);

  const paperDetailMarkup = renderToStaticMarkup(
    createElement(EntityDetailPanel, {
      entity: paper,
      layer: layers[0],
      incoming: [paperRelationship],
      outgoing: [orgRelationship, authorRelationship, citationRelationship],
      entityById,
      relationLabels,
      metrics: [],
      failures: [],
      recentResearchEvents: [],
      sources: [source],
      allRelationships: [paperRelationship, orgRelationship, authorRelationship, citationRelationship],
      status: "idle",
      error: null,
      redirectNotice: null,
      onSelectEntity: noop,
      onOpenSource: noop
    })
  );
  assert.match(paperDetailMarkup, /研究关联/);
  assert.match(paperDetailMarkup, /相关论文与研究对象/);
  assert.match(paperDetailMarkup, /机构与作者/);
  assert.match(paperDetailMarkup, /引用关系/);
  assert.match(paperDetailMarkup, /Google Research/);
  assert.match(paperDetailMarkup, /Ashish Vaswani/);

  const layerMarkup = renderToStaticMarkup(createElement(LayerGrid, { layers, entities: [openai, nvidia] }));
  assert.match(layerMarkup, /模型层/);
  assert.match(layerMarkup, /芯片层/);

  console.log("React component render smoke tests passed");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
