import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const candidateSnapshotPath = new URL("data/candidate-snapshot.json", root);
const generatedRelationshipPath = new URL("src/generated/candidate-relationships.json", root);
const generatedEntityPath = new URL("src/generated/candidate-entities.json", root);
const generatedMetricPath = new URL("src/generated/candidate-metrics.json", root);

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

async function readJson(pathUrl, fallback) {
  try {
    return JSON.parse(await fs.readFile(pathUrl, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function mergeById(existing, incoming) {
  const merged = new Map(existing.map((item) => [item.id, item]));
  let inserted = 0;
  let updated = 0;

  for (const item of incoming) {
    if (!item?.id) continue;
    if (merged.has(item.id)) {
      updated += 1;
    } else {
      inserted += 1;
    }
    merged.set(item.id, item);
  }

  return {
    rows: [...merged.values()].sort((a, b) => String(a.id).localeCompare(String(b.id))),
    inserted,
    updated
  };
}

const replaceableCandidateEntityMethods = new Set([
  "wikidata_profile_snapshot",
  "openalex_work_snapshot",
  "openalex_institution_snapshot",
  "openalex_author_snapshot",
  "openalex_referenced_work_snapshot",
  "arxiv_paper_snapshot",
  "arxiv_author_snapshot"
]);
const replaceableCandidateRelationshipMethods = new Set([
  "openalex_work_relationship_snapshot",
  "openalex_authorship_relationship_snapshot",
  "openalex_citation_relationship_snapshot",
  "arxiv_paper_relationship_snapshot",
  "arxiv_authorship_relationship_snapshot"
]);

function isReplaceableWorkerCandidate(candidate, prefix) {
  return String(candidate?.id || "").startsWith(prefix) && Boolean(candidate?.payload?.watchlistId);
}

async function writeJson(pathUrl, rows) {
  await fs.writeFile(pathUrl, `${JSON.stringify(rows, null, 2)}\n`);
}

const snapshot = await readJson(candidateSnapshotPath, {
  candidateRelationships: [],
  candidateEntities: [],
  candidateMetrics: []
});

const existingRelationships = await readJson(generatedRelationshipPath, []);
const existingEntities = await readJson(generatedEntityPath, []);
const existingMetrics = await readJson(generatedMetricPath, []);

const incomingRelationships = snapshot.candidateRelationships || [];
const incomingEntities = snapshot.candidateEntities || [];
const incomingMetrics = snapshot.candidateMetrics || [];
const incomingRelationshipIds = new Set(incomingRelationships.map((candidate) => candidate.id));
const incomingEntityIds = new Set(incomingEntities.map((candidate) => candidate.id));
const incomingMetricIds = new Set(incomingMetrics.map((candidate) => candidate.id));
const retainedExistingRelationships = existingRelationships.filter((candidate) => {
  if (isReplaceableWorkerCandidate(candidate, "worker_candidate_")) return incomingRelationshipIds.has(candidate.id);
  if (!replaceableCandidateRelationshipMethods.has(candidate.extractionMethod)) return true;
  if (candidate.status && candidate.status !== "candidate") return true;
  return incomingRelationshipIds.has(candidate.id);
});
const retainedExistingEntities = existingEntities.filter((candidate) => {
  if (!replaceableCandidateEntityMethods.has(candidate.extractionMethod)) return true;
  if (candidate.status && candidate.status !== "candidate") return true;
  return incomingEntityIds.has(candidate.id);
});
const retainedExistingMetrics = existingMetrics.filter((candidate) => {
  if (isReplaceableWorkerCandidate(candidate, "worker_metric_")) return incomingMetricIds.has(candidate.id);
  return true;
});

const relationships = mergeById(retainedExistingRelationships, incomingRelationships);
const entities = mergeById(retainedExistingEntities, incomingEntities);
const metrics = mergeById(retainedExistingMetrics, incomingMetrics);

const summary = {
  candidateRelationships: {
    before: existingRelationships.length,
    retainedExisting: retainedExistingRelationships.length,
    incoming: incomingRelationships.length,
    inserted: relationships.inserted,
    updated: relationships.updated,
    after: relationships.rows.length
  },
  candidateEntities: {
    before: existingEntities.length,
    retainedExisting: retainedExistingEntities.length,
    incoming: incomingEntities.length,
    inserted: entities.inserted,
    updated: entities.updated,
    after: entities.rows.length
  },
  candidateMetrics: {
    before: existingMetrics.length,
    retainedExisting: retainedExistingMetrics.length,
    incoming: incomingMetrics.length,
    inserted: metrics.inserted,
    updated: metrics.updated,
    after: metrics.rows.length
  }
};

if (!dryRun) {
  await writeJson(generatedRelationshipPath, relationships.rows);
  await writeJson(generatedEntityPath, entities.rows);
  await writeJson(generatedMetricPath, metrics.rows);
}

console.log(JSON.stringify(summary, null, 2));
if (dryRun) {
  console.log("Dry run only; generated candidate files were not changed.");
}
