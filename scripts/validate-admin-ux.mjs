import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const adminClient = await readFile(new URL("src/app/admin/AdminReviewClient.tsx", root), "utf8");
const types = await readFile(new URL("src/lib/types.ts", root), "utf8");
const repository = await readFile(new URL("src/lib/repository.ts", root), "utf8");
const entitiesRoute = await readFile(new URL("src/app/api/entities/route.ts", root), "utf8");
const mergeRoute = await readFile(new URL("src/app/api/admin/candidate-entities/[id]/merge/route.ts", root), "utf8");
const styles = await readFile(new URL("src/app/styles.css", root), "utf8");

assert.match(adminClient, /function CandidateManualMergeForm\b/, "admin entity queue must expose a manual merge form");
assert.match(adminClient, /function AdminSessionPanel\b/, "admin review page must expose a session login panel");
assert.match(adminClient, /fetchAdminSession\b/, "admin review page must load current session state");
assert.match(adminClient, /loginAdminSession\b/, "admin review page must support username/password session login");
assert.match(adminClient, /logoutAdminSession\b/, "admin review page must support session logout");
assert.match(adminClient, /审核会话/, "admin review page must expose session login copy");
assert.match(adminClient, /可选兼容入口/, "admin review page must keep token fallback copy");
assert.match(adminClient, /<CandidateManualMergeForm[\s\S]*entity=\{entity\}/, "entity candidate cards must render the manual merge form");
assert.match(adminClient, /function CandidateMergeImpactPreview\b/, "manual merge form must expose an impact preview");
assert.match(adminClient, /<CandidateMergeImpactPreview entity=\{entity\}/, "manual merge form must render the impact preview");
assert.match(adminClient, /function mergeTargetOptionsForEntity\b/, "manual merge form must build searchable target options");
assert.match(adminClient, /function CandidateMergeFieldDiff\b/, "manual merge form must expose a field diff summary");
assert.match(adminClient, /function CandidateMergeMetricImpact\b/, "manual merge form must expose a metric impact summary");
assert.match(adminClient, /<CandidateManualMergeForm[\s\S]*entityCandidates=\{entityCandidates\}/, "entity candidate cards must pass queue candidates into merge UX");
assert.match(adminClient, /<CandidateManualMergeForm[\s\S]*graphEntities=\{graphEntities\}/, "entity candidate cards must pass graph entities into merge UX");
assert.match(adminClient, /fetchGraphEntities\b/, "admin entity queue must load graph entities for merge target search");
assert.match(adminClient, /\/api\/entities\?limit=500/, "admin merge UX must request enough graph entities for full target search");
assert.match(adminClient, /可搜索主图谱实体、候选实体和重复提示/, "manual merge form must expose full target search copy");
assert.match(adminClient, /source: "graph_entity"/, "manual merge search options must include graph entity targets");
assert.match(adminClient, /name="targetType"/, "manual merge form must allow choosing target type");
assert.match(adminClient, /name="targetId"/, "manual merge form must accept an explicit target id");
assert.match(adminClient, /name="confirmed" type="checkbox" required/, "manual merge form must require explicit confirmation");
assert.match(adminClient, /targetCandidateEntityId: submittedTargetId/, "manual merge form must support candidate-to-candidate targets");
assert.match(adminClient, /targetEntityId: submittedTargetId/, "manual merge form must support existing graph entity targets");
assert.match(adminClient, /redirect\/audit log/, "manual merge copy must tell reviewers the operation writes redirect and audit log");
assert.match(adminClient, /candidateRelationshipEndpointCount/, "impact preview must show candidate relationship endpoint count");
assert.match(adminClient, /字段差异摘要/, "impact preview must include field diff copy");
assert.match(adminClient, /指标影响预览/, "impact preview must include metric impact copy");
assert.match(adminClient, /metricKeys: Object\.keys\(graphEntity\.metrics \|\| \{\}\)/, "graph entity merge targets must expose metric keys");
assert.match(adminClient, /fieldPolicy\.\$\{row\.label\}/, "field diff summary must submit per-field merge policy");
for (const fieldLabel of ["description", "websiteUrl", "status", "valuation", "aliases"]) {
  assert.match(adminClient, new RegExp(`label: "${fieldLabel}"`), `field diff summary must expose ${fieldLabel} policy`);
}
assert.match(adminClient, /保留目标值/, "field policy must let reviewers keep target values");
assert.match(adminClient, /使用候选值/, "field policy must let reviewers use candidate values");
assert.match(adminClient, /手动值/, "field policy must let reviewers provide manual values");

assert.match(styles, /\.candidate-merge\b/, "manual merge form must have a stable CSS hook");
assert.match(styles, /\.admin-session-card\b/, "admin session panel must have a stable CSS hook");
assert.match(styles, /@media \(max-width: 820px\)[\s\S]*\.admin-session-card[\s\S]*grid-template-columns: 1fr/, "admin session form must collapse to one column on mobile");
assert.match(styles, /\.candidate-merge label\.confirm\b/, "manual merge confirmation row must have stable layout styles");
assert.match(styles, /\.merge-search\b/, "target search must have a stable CSS hook");
assert.match(styles, /\.merge-preview\b/, "merge impact preview must have a stable CSS hook");
assert.match(styles, /\.merge-metrics\b/, "metric impact summary must have a stable CSS hook");
assert.match(styles, /\.merge-diff\b/, "field diff summary must have a stable CSS hook");
assert.match(styles, /\.merge-diff dd\.field-policy\b/, "field merge policy controls must have stable layout styles");
assert.match(styles, /@media \(max-width: 820px\)[\s\S]*\.candidate-merge[\s\S]*grid-template-columns: 1fr/, "manual merge form must collapse to one column on mobile");

assert.match(types, /candidateRelationshipEndpointCount\?: number/, "candidate entity type must expose merge impact counts");
assert.match(repository, /function candidateRelationshipEndpointCounts\b/, "repository must compute merge impact counts");
assert.match(repository, /candidateRelationshipEndpointCount:/, "repository must attach merge impact counts to candidate entities");
assert.match(repository, /function normalizeMergeFieldPolicy\b/, "repository must normalize merge field policies");
assert.match(repository, /mergeFieldPolicy/, "repository must persist merge field policies in merge payloads");
assert.match(repository, /function mergePolicyValue\b/, "repository must apply per-field merge policies");
assert.match(repository, /UPDATE entity[\s\S]*website_url[\s\S]*valuation[\s\S]*updated_at = now\(\)/, "repository must apply merge policies to existing entities");
assert.match(repository, /UPDATE candidate_entity[\s\S]*status_text[\s\S]*aliases = \$10::jsonb/, "repository must apply merge policies to target candidate entities");
assert.match(entitiesRoute, /Number\(searchParams\.get\("limit"\) \|\| 50\), 1\), 500\)/, "entities API must allow full graph target search");
assert.match(mergeRoute, /fieldPolicy/, "merge route must accept field policy payloads");

console.log("Admin UX validation passed");
