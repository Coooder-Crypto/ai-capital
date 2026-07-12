import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const sourcePath = new URL("../src/lib/ui-formatters.ts", import.meta.url);
const source = await readFile(sourcePath, "utf8");
const { outputText, diagnostics } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove
  },
  fileName: "ui-formatters.ts",
  reportDiagnostics: true
});

assert.equal(diagnostics?.length || 0, 0, diagnostics?.map((diagnostic) => diagnostic.messageText).join("\n"));

const moduleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(outputText)}`;
const { formatDataSource, formatEvidenceStrength, formatMetricLabel, formatNumber, shorten } = await import(moduleUrl);

assert.equal(formatDataSource("postgres"), "PostgreSQL");
assert.equal(formatDataSource("json-fallback"), "JSON fallback");

assert.equal(formatEvidenceStrength({ evidenceStrength: "official_api" }), "官方 API");
assert.equal(formatEvidenceStrength({ evidenceStrength: "official_docs" }), "官方/公开文档");
assert.equal(formatEvidenceStrength({ evidenceStrength: "official_product_overlap" }), "官方产品重叠");
assert.equal(formatEvidenceStrength({ evidenceStrength: "credible_report" }), "可信报道");
assert.equal(formatEvidenceStrength({ evidenceStrength: "third_party_index" }), "第三方索引");
assert.equal(formatEvidenceStrength({ evidenceStrength: "manual_seed" }), "人工种子");
assert.equal(formatEvidenceStrength({ evidenceStrength: "derived" }), "派生");
assert.equal(formatEvidenceStrength({ sourceType: "press_release" }), "press_release");
assert.equal(formatEvidenceStrength({}), "未分级");

assert.equal(formatMetricLabel("marketCapUsd"), "Market Cap Usd");
assert.equal(formatMetricLabel("githubStars"), "Github Stars");

assert.equal(formatNumber(null), "N/A");
assert.equal(formatNumber("unknown"), "unknown");
assert.equal(formatNumber(1234), "1,234");
assert.equal(formatNumber(1_234_567), "1.2M");

assert.equal(shorten("OpenAI", 17), "OpenAI");
assert.equal(shorten("VeryLongArtificialIntelligenceCompanyName", 12), "VeryLongArt...");

const root = new URL("../", import.meta.url);
const capitalMapClient = await readFile(new URL("src/app/CapitalMapClient.tsx", root), "utf8");
const panelComponents = await readFile(new URL("src/app/components/CapitalMapPanels.tsx", root), "utf8");
const detailComponents = await readFile(new URL("src/app/components/EntityDetailPanel.tsx", root), "utf8");
const detailSections = await readFile(new URL("src/app/components/EntityDetailSections.tsx", root), "utf8");
const researchPage = await readFile(new URL("src/app/research/page.tsx", root), "utf8");
const researchTimelineClient = await readFile(new URL("src/app/research/ResearchTimelineClient.tsx", root), "utf8");

for (const exportName of ["StatsGrid", "ControlPanel", "GraphPanel", "LayerGrid"]) {
  assert.match(panelComponents, new RegExp(`export function ${exportName}\\b`), `${exportName} must remain exported from CapitalMapPanels`);
  assert.match(capitalMapClient, new RegExp(`<${exportName}\\b`), `CapitalMapClient must render ${exportName}`);
}

for (const exportName of ["EntityDetailPanel", "SourceModal"]) {
  assert.match(detailComponents, new RegExp(`export function ${exportName}\\b`), `${exportName} must remain exported from EntityDetailPanel`);
  assert.match(capitalMapClient, new RegExp(`<${exportName}\\b`), `CapitalMapClient must render ${exportName}`);
}

for (const exportName of [
  "RelationSection",
  "ResearchSection",
  "RecentResearchEventsSection",
  "MetricPanel",
  "SourceList",
  "CorrectionForm"
]) {
  assert.match(detailSections, new RegExp(`export function ${exportName}\\b`), `${exportName} must remain exported from EntityDetailSections`);
  assert.match(detailComponents, new RegExp(`<${exportName}\\b`), `EntityDetailPanel must render ${exportName}`);
}

for (const className of ["sidebar panel", "graph-panel panel", "layer-grid"]) {
  assert.doesNotMatch(capitalMapClient, new RegExp(`className="${className}"`), `${className} markup should stay in panel components`);
}

assert.ok(capitalMapClient.split("\n").length <= 520, "CapitalMapClient should stay focused on orchestration, not page markup");
assert.ok(detailComponents.split("\n").length <= 220, "EntityDetailPanel should stay focused on detail orchestration, not section markup");
assert.match(researchPage, /<ResearchTimelineClient\b/, "Research page must render the timeline filter client");
for (const label of ["本周新增", "候选", "证据待补", "采集链路", "已入图/指标", "全部"]) {
  assert.match(researchTimelineClient, new RegExp(label), `Research timeline filter must include ${label}`);
}
for (const stateFragment of ["URLSearchParams", "history.replaceState", "popstate", "view", "q", "entity", "status", "matchesEntity", "matchesStatus"]) {
  assert.match(researchTimelineClient, new RegExp(stateFragment), `Research timeline URL state must include ${stateFragment}`);
}
assert.match(researchTimelineClient, /<select\b/, "Research timeline must include a status selector");

console.log("UI formatter and component structure validation passed");
