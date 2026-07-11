import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const tempDir = await mkdtemp(path.join(process.cwd(), ".tmp-interactions-"));

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

function childrenOf(element) {
  const children = element?.props?.children;
  if (children === undefined || children === null) return [];
  return Array.isArray(children) ? children : [children];
}

function flattenElements(element) {
  if (Array.isArray(element)) return element.flatMap(flattenElements);
  if (!element || typeof element !== "object") return [];
  return [element, ...childrenOf(element).flatMap(flattenElements)];
}

function findElement(element, predicate, label) {
  const match = flattenElements(element).find(predicate);
  assert.ok(match, `Missing interactive element: ${label}`);
  return match;
}

function textContent(element) {
  if (element === undefined || element === null || typeof element === "boolean") return "";
  if (typeof element === "string" || typeof element === "number") return String(element);
  if (Array.isArray(element)) return element.map(textContent).join("");
  if (typeof element === "object") return childrenOf(element).map(textContent).join("");
  return "";
}

try {
  const uiFormattersUrl = await transpileModule("src/lib/ui-formatters.ts", "ui-formatters.mjs");
  const panelsUrl = await transpileModule("src/app/components/CapitalMapPanels.tsx", "CapitalMapPanels.mjs", {
    '"@/lib/ui-formatters"': `"${uiFormattersUrl}"`
  });
  const { ControlPanel, GraphPanel } = await import(panelsUrl);

  const layers = [
    { id: "models", name: "模型层", color: "#1e6674", description: "Foundation models" },
    { id: "chips", name: "芯片层", color: "#a23b2a", description: "Compute suppliers" }
  ];
  const layerById = new Map(layers.map((layer) => [layer.id, layer]));
  const openai = {
    id: "openai",
    name: "OpenAI",
    type: "company",
    layer: "models",
    status: "private",
    ticker: "",
    valuation: "private disclosed",
    website_url: "https://openai.com",
    country: "US",
    aliases: ["ChatGPT"],
    metrics: {},
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
    aliases: ["NVDA"],
    metrics: {},
    description: "GPU supplier."
  };
  const relationship = {
    id: "rel_nvidia_openai",
    source: "nvidia",
    target: "openai",
    type: "supplies_to",
    confidence: 0.92,
    sourceId: "source_nvidia_openai",
    note: "OpenAI uses NVIDIA GPUs."
  };

  const events = [];
  const controlPanel = ControlPanel({
    search: "open",
    depth: "1",
    minConfidence: 0.6,
    relationType: "all",
    relationOptions: ["supplies_to", "integrates_with"],
    relationLabels: { supplies_to: "供应", integrates_with: "集成" },
    filteredEntities: [openai, nvidia],
    selectedEntity: openai,
    layerById,
    entitySearchStatus: "idle",
    entitySearchError: null,
    entitySearchCount: 2,
    entitySearchTotal: 2,
    seedEntityCount: 2,
    metricsByEntityId: new Map(),
    onSearchChange: (value) => events.push(["search", value]),
    onDepthChange: (value) => events.push(["depth", value]),
    onMinConfidenceChange: (value) => events.push(["confidence", value]),
    onRelationTypeChange: (value) => events.push(["relationType", value]),
    onReset: () => events.push(["reset"]),
    onSelectEntity: (id) => events.push(["select", id])
  });

  findElement(controlPanel, (element) => element.type === "input" && element.props?.placeholder, "search input").props.onChange({
    target: { value: "nvidia" }
  });
  findElement(controlPanel, (element) => element.type === "button" && textContent(element) === "2 层", "depth button").props.onClick();
  findElement(controlPanel, (element) => element.type === "input" && element.props?.type === "range", "confidence slider").props.onChange({
    target: { value: "0.85" }
  });
  findElement(controlPanel, (element) => element.type === "select", "relation select").props.onChange({
    target: { value: "supplies_to" }
  });
  findElement(controlPanel, (element) => element.type === "button" && textContent(element).includes("NVIDIA"), "entity button").props.onClick();
  findElement(controlPanel, (element) => element.type === "button" && textContent(element) === "Reset", "reset button").props.onClick();

  assert.deepEqual(events, [
    ["search", "nvidia"],
    ["depth", "2"],
    ["confidence", 0.85],
    ["relationType", "supplies_to"],
    ["select", "nvidia"],
    ["reset"]
  ]);

  const graphEvents = [];
  const graphPanel = GraphPanel({
    title: "OpenAI",
    visibleGraph: { nodes: [openai, nvidia], edges: [relationship] },
    layers,
    layerById,
    positionedNodes: new Map([
      [openai.id, { ...openai, x: 800, y: 260 }],
      [nvidia.id, { ...nvidia, x: 240, y: 260 }]
    ]),
    selectedEntityId: openai.id,
    highlightedRelationId: null,
    graphStatus: "idle",
    graphError: null,
    onSelectEntity: (id) => graphEvents.push(["select", id]),
    onHighlightRelation: (id) => graphEvents.push(["highlight", id])
  });

  findElement(graphPanel, (element) => element.type === "path" && element.props?.className === "edge-hit", "graph edge hit").props.onClick();
  findElement(
    graphPanel,
    (element) => element.type === "g" && String(element.props?.className || "").includes("node-group") && element.props?.transform?.includes("240"),
    "graph node"
  ).props.onClick();

  assert.deepEqual(graphEvents, [
    ["highlight", "rel_nvidia_openai"],
    ["select", "openai"],
    ["select", "nvidia"]
  ]);

  console.log("Interactive component callbacks valid: ControlPanel search/filter/reset/select and GraphPanel edge/node clicks.");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
