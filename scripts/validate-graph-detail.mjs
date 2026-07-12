import { createRequire } from "node:module";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const seed = JSON.parse(fs.readFileSync(new URL("src/generated/seed.json", root), "utf8"));
const metricBundle = JSON.parse(fs.readFileSync(new URL("src/generated/metrics.json", root), "utf8"));

function loadGraphModule() {
  const source = fs.readFileSync(new URL("src/lib/graph.ts", root), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports,
    module,
    require,
    console
  });
  return module.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertUniqueIds(rows, label) {
  const seen = new Set();
  const duplicates = new Set();
  for (const row of rows) {
    if (seen.has(row.id)) duplicates.add(row.id);
    seen.add(row.id);
  }
  assert(duplicates.size === 0, `${label} has duplicate ids: ${[...duplicates].join(", ")}`);
}

function buildFallbackDetail(entityId) {
  const entity = seed.entities.find((item) => item.id === entityId);
  assert(entity, `Missing fixture entity: ${entityId}`);
  const relationships = seed.relationships
    .filter((relationship) => relationship.source === entity.id || relationship.target === entity.id)
    .sort((a, b) => b.confidence - a.confidence);
  const relatedIds = new Set(relationships.flatMap((relationship) => [relationship.source, relationship.target]));
  const sources = [
    ...new Map(
      relationships
        .map((relationship) => seed.sources.find((source) => source.id === relationship.sourceId))
        .filter(Boolean)
        .map((source) => [source.id, source])
    ).values()
  ];

  return {
    entity,
    layer: seed.layers.find((layer) => layer.id === entity.layer),
    metrics: metricBundle.metrics.filter((entry) => entry.entityId === entity.id),
    metricFailures: (metricBundle.rejectedOrFailed || []).filter((entry) => entry.entityId === entity.id),
    relationships,
    relatedEntities: seed.entities.filter((item) => relatedIds.has(item.id)),
    sources
  };
}

const { MAX_RENDERED_EDGES, buildVisibleGraph, capRenderedEdges } = loadGraphModule();

assert(seed.entities.length >= 100, "P2 generated seed should expose 100+ entities.");
assert(seed.relationships.length >= 300, "P2 generated seed should expose 300+ relationships.");
assertUniqueIds(seed.entities, "entities");
assertUniqueIds(seed.relationships, "relationships");
assertUniqueIds(seed.sources, "sources");
assert(
  seed.sources.every((source) => source.sourceType && source.evidenceStrength && source.licenseNote),
  "Every source should expose sourceType, evidenceStrength and licenseNote for evidence quality display."
);
const directEvidenceRelationships = seed.relationships.filter((relationship) => relationship.evidenceUrl);
assert(directEvidenceRelationships.length >= 5, "At least 5 relationships should have direct evidence URL overrides.");
assert(
  directEvidenceRelationships.every((relationship) => relationship.evidenceTitle && relationship.evidenceStrength),
  "Direct evidence relationships should include title and evidence strength."
);

const allGraph = buildVisibleGraph(seed, {
  selectedId: "openai",
  depth: "all",
  minConfidence: 0,
  relationType: "all"
});
assert(allGraph.nodes.length === seed.entities.length, "all-depth graph should include every entity.");
assert(allGraph.edges.length === MAX_RENDERED_EDGES, `all-depth graph should cap edges at ${MAX_RENDERED_EDGES}.`);
const expectedTopEdges = [...seed.relationships].sort((a, b) => b.confidence - a.confidence).slice(0, MAX_RENDERED_EDGES);
assert(
  allGraph.edges.every((edge, index) => edge.id === expectedTopEdges[index].id),
  "all-depth graph should cap to highest-confidence edges in order."
);

const openAiDepthOne = buildVisibleGraph(seed, {
  selectedId: "openai",
  depth: "1",
  minConfidence: 0.6,
  relationType: "all"
});
const depthOneIds = new Set(openAiDepthOne.nodes.map((node) => node.id));
assert(depthOneIds.has("openai"), "depth 1 graph should retain selected entity.");
assert(openAiDepthOne.edges.length > 0, "OpenAI depth 1 graph should expose at least one relationship.");
assert(
  openAiDepthOne.edges.every(
    (edge) => edge.confidence >= 0.6 && depthOneIds.has(edge.source) && depthOneIds.has(edge.target)
  ),
  "depth 1 graph edges should respect confidence filter and visible node set."
);

const openAiDepthTwo = buildVisibleGraph(seed, {
  selectedId: "openai",
  depth: "2",
  minConfidence: 0.6,
  relationType: "all"
});
const depthTwoIds = new Set(openAiDepthTwo.nodes.map((node) => node.id));
assert(
  [...depthOneIds].every((id) => depthTwoIds.has(id)),
  "depth 2 graph should include every depth 1 node."
);
assert(openAiDepthTwo.nodes.length >= openAiDepthOne.nodes.length, "depth 2 graph should not shrink node count.");

const supplierGraph = buildVisibleGraph(seed, {
  selectedId: "nvidia",
  depth: "2",
  minConfidence: 0.65,
  relationType: "supplies_to"
});
assert(supplierGraph.edges.length > 0, "NVIDIA supplies_to graph should expose supplier relationships.");
assert(
  supplierGraph.edges.every((edge) => edge.type === "supplies_to" && edge.confidence >= 0.65),
  "relation type and confidence filters should be applied together."
);

const syntheticEdges = Array.from({ length: MAX_RENDERED_EDGES + 5 }, (_, index) => ({
  id: `edge_${index}`,
  source: "a",
  target: "b",
  type: "integrates_with",
  confidence: index / 1000,
  sourceId: "src_manual",
  note: ""
}));
const cappedSynthetic = capRenderedEdges(syntheticEdges);
assert(cappedSynthetic.length === MAX_RENDERED_EDGES, "capRenderedEdges should enforce edge limit.");
assert(
  cappedSynthetic[0].confidence > cappedSynthetic.at(-1).confidence,
  "capRenderedEdges should keep highest-confidence edges first."
);

const nvidiaDetail = buildFallbackDetail("nvidia");
assert(nvidiaDetail.layer?.id === "chip_design", "NVIDIA detail should include layer metadata.");
assert(nvidiaDetail.relationships.length > 0, "NVIDIA detail should include linked relationships.");
assert(
  nvidiaDetail.relationships.some((relationship) => relationship.id === "rel_4" && relationship.evidenceUrl?.includes("nvidia.com")),
  "NVIDIA detail should include direct evidence URL override for rel_4."
);
assert(
  nvidiaDetail.relationships.every((relationship, index, rows) => index === 0 || rows[index - 1].confidence >= relationship.confidence),
  "Detail relationships should be sorted by confidence descending."
);
assert(nvidiaDetail.relatedEntities.some((entity) => entity.id === "nvidia"), "Related entities should include selected entity.");
assert(nvidiaDetail.sources.length > 0, "Detail should expose evidence sources.");
assert(
  nvidiaDetail.sources.every((source) => source.sourceType && source.evidenceStrength && source.licenseNote),
  "Detail sources should preserve evidence quality metadata."
);
assert(
  nvidiaDetail.relationships.every((relationship) => nvidiaDetail.sources.some((source) => source.id === relationship.sourceId)),
  "Every detail relationship should resolve to an evidence source."
);
assert(nvidiaDetail.metrics.some((entry) => entry.source === "sec"), "NVIDIA detail should expose approved SEC metrics.");
assert(
  nvidiaDetail.metrics.some((entry) => entry.source === "openAlex"),
  "NVIDIA detail should expose approved OpenAlex metrics."
);
const metaDetail = buildFallbackDetail("meta_ai");
assert(
  metaDetail.metrics.some(
    (entry) => entry.source === "huggingFace" && entry.collectionMethod === "manual_review_override"
  ),
  "Meta AI detail should expose approved Hugging Face manual review metrics."
);
assert(
  !metaDetail.metricFailures.some((entry) => entry.source === "huggingFace"),
  "Meta AI detail should not expose Hugging Face retry failures after approved override."
);

console.log("Graph/detail behavior valid:");
console.log(`- all-depth capped edges: ${allGraph.edges.length}`);
console.log(`- OpenAI depth 1 nodes/edges: ${openAiDepthOne.nodes.length}/${openAiDepthOne.edges.length}`);
console.log(`- OpenAI depth 2 nodes/edges: ${openAiDepthTwo.nodes.length}/${openAiDepthTwo.edges.length}`);
console.log(`- NVIDIA supplies_to nodes/edges: ${supplierGraph.nodes.length}/${supplierGraph.edges.length}`);
console.log(`- NVIDIA detail relationships/sources/metrics/failures: ${nvidiaDetail.relationships.length}/${nvidiaDetail.sources.length}/${nvidiaDetail.metrics.length}/${nvidiaDetail.metricFailures.length}`);
