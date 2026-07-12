import assert from "node:assert/strict";
import fs from "node:fs/promises";

globalThis.window = {};
await import("../data/seed.js");
await import("../data/p1-extension.js");

const seed = globalThis.window.AI_CAPITAL_SEED;
if (!seed) throw new Error("AI_CAPITAL_SEED was not loaded");

const root = new URL("../", import.meta.url);
const snapshot = JSON.parse(await fs.readFile(new URL("data/candidate-snapshot.json", root), "utf8"));
const candidates = snapshot.candidateEntities || [];
const relationships = snapshot.candidateRelationships || [];
const seedEntityIds = new Set(seed.entities.map((entity) => entity.id));

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function payloadString(candidate, key) {
  const value = candidate.payload?.[key];
  return typeof value === "string" ? value : "";
}

function payloadArray(candidate, key) {
  const value = candidate.payload?.[key];
  return Array.isArray(value) ? value : [];
}

function validAuthorName(value) {
  const normalized = normalize(value);
  if (!normalized || normalized.length < 2) return false;
  if (["and", "et al", "anonymous", "unknown", "none", "na", "n a"].includes(normalized)) return false;
  return /[a-z]/.test(normalized);
}

function validArxivId(value) {
  return /^\d{4}\.\d{4,5}$/.test(value) || /^[a-z-]+(?:\.[a-z-]+)?\/\d{7}$/.test(value);
}

function matchKeys(candidate) {
  const keys = [];
  const name = normalize(candidate.name);
  if (candidate.entityId) keys.push(`entity:${candidate.entityId}`);
  if (name) keys.push(`name:${candidate.type}:${name}`);
  for (const alias of candidate.aliases || []) {
    const normalizedAlias = normalize(alias);
    if (normalizedAlias.length >= 8) keys.push(`alias:${candidate.type}:${normalizedAlias}`);
  }
  for (const key of ["qid", "doi", "openAlexWorkId", "arxivPaperId", "authorId", "ror"]) {
    const value = normalize(payloadString(candidate, key));
    if (value) keys.push(`payload:${key}:${value}`);
  }
  for (const key of payloadArray(candidate, "dedupKeys")) {
    const value = normalize(key);
    if (value) keys.push(`dedup:${value}`);
  }
  return keys;
}

assert.ok(candidates.length >= 100, `expected candidate entity volume for dedup review, got ${candidates.length}`);

const mainGraphMatches = candidates.filter((candidate) => seedEntityIds.has(candidate.entityId));
assert.ok(mainGraphMatches.length >= 5, `expected Wikidata/profile candidates to match existing graph entities, got ${mainGraphMatches.length}`);

const keyToCandidates = new Map();
for (const candidate of candidates) {
  for (const key of matchKeys(candidate)) {
    const rows = keyToCandidates.get(key) || [];
    rows.push(candidate.id);
    keyToCandidates.set(key, rows);
  }
}

const duplicateCandidateSignals = [...keyToCandidates.values()].filter((rows) => new Set(rows).size > 1);
assert.ok(
  duplicateCandidateSignals.length >= 1,
  "expected at least one candidate-to-candidate duplicate signal for merge/dedup review"
);

const generatedAuthorCandidates = candidates.filter((candidate) =>
  ["openalex_author_snapshot", "arxiv_author_snapshot"].includes(candidate.extractionMethod)
);
const invalidAuthorCandidates = generatedAuthorCandidates.filter(
  (candidate) => !validAuthorName(candidate.name) || !validAuthorName(candidate.payload?.authorName)
);
assert.equal(
  invalidAuthorCandidates.length,
  0,
  `expected generated author candidates to have valid names, got ${invalidAuthorCandidates.map((candidate) => `${candidate.id}:${candidate.name}`).join(", ")}`
);

for (const candidate of generatedAuthorCandidates) {
  assert.ok(candidate.payload?.normalizedAuthorName, `${candidate.id} missing normalizedAuthorName`);
  assert.ok(payloadArray(candidate, "dedupKeys").some((key) => key.startsWith("author_name:")), `${candidate.id} missing author dedup key`);
}

const generatedPaperCandidates = candidates.filter((candidate) =>
  ["openalex_work_snapshot", "arxiv_paper_snapshot"].includes(candidate.extractionMethod)
);
assert.ok(generatedPaperCandidates.length >= 20, `expected generated paper candidates, got ${generatedPaperCandidates.length}`);
for (const candidate of generatedPaperCandidates) {
  assert.ok(payloadArray(candidate, "dedupKeys").length > 0, `${candidate.id} missing paper dedupKeys`);
  assert.ok(candidate.payload?.normalizedTitleKey, `${candidate.id} missing normalizedTitleKey`);
  if (candidate.extractionMethod === "openalex_work_snapshot") {
    assert.ok(candidate.payload?.normalizedOpenAlexWorkId, `${candidate.id} missing normalizedOpenAlexWorkId`);
  }
  if (candidate.extractionMethod === "arxiv_paper_snapshot") {
    assert.ok(candidate.payload?.normalizedArxivPaperId, `${candidate.id} missing normalizedArxivPaperId`);
  }
  for (const key of payloadArray(candidate, "dedupKeys")) {
    if (key.startsWith("arxiv:")) {
      assert.ok(validArxivId(key.slice("arxiv:".length)), `${candidate.id} has invalid arXiv dedup key: ${key}`);
    }
  }
}

const referencedWorkCandidates = candidates.filter((candidate) => candidate.extractionMethod === "openalex_referenced_work_snapshot");
assert.ok(referencedWorkCandidates.length >= 50, `expected OpenAlex referenced work candidates, got ${referencedWorkCandidates.length}`);
for (const candidate of referencedWorkCandidates) {
  assert.ok(payloadArray(candidate, "referencedByWorkDetails").length > 0, `${candidate.id} missing referencedByWorkDetails`);
}

const citationRelationships = relationships.filter((relationship) => relationship.extractionMethod === "openalex_citation_relationship_snapshot");
assert.ok(citationRelationships.length >= 50, `expected OpenAlex citation relationships, got ${citationRelationships.length}`);
for (const relationship of citationRelationships) {
  assert.ok(relationship.payload?.sourceOpenAlexWorkId, `${relationship.id} missing sourceOpenAlexWorkId`);
  assert.ok(relationship.payload?.referencedOpenAlexWorkId, `${relationship.id} missing referencedOpenAlexWorkId`);
  assert.ok(relationship.payload?.referencedOpenAlexUrl, `${relationship.id} missing referencedOpenAlexUrl`);
  assert.equal(relationship.payload?.citationDirection, "outgoing_reference", `${relationship.id} missing citationDirection`);
  assert.ok(payloadArray(relationship, "sourcePaperDedupKeys").length > 0, `${relationship.id} missing sourcePaperDedupKeys`);
}

console.log(
  `Candidate dedup signals valid: ${mainGraphMatches.length} main-graph matches, ${duplicateCandidateSignals.length} duplicate key groups, ${generatedPaperCandidates.length} paper candidates, ${generatedAuthorCandidates.length} author candidates.`
);
