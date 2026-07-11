import crypto from "node:crypto";
import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const snapshotPath = new URL("data/candidate-snapshot.json", root);
const archiveDir = new URL("data/research/candidate-snapshots/", root);
const manifestPath = new URL("data/research/candidate-snapshot-manifest.json", root);

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

async function readJsonIfExists(pathUrl, fallback) {
  try {
    return JSON.parse(await fs.readFile(pathUrl, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function stableSortById(items) {
  return [...(items || [])].sort((a, b) => String(a.id || "").localeCompare(String(b.id || "")));
}

function stableCandidateView(snapshot) {
  return {
    sourceSnapshotGeneratedAt: snapshot.sourceSnapshotGeneratedAt || null,
    plannedRequestCount: snapshot.plannedRequestCount || 0,
    candidateRelationships: stableSortById(snapshot.candidateRelationships),
    candidateEntities: stableSortById(snapshot.candidateEntities),
    candidateMetrics: stableSortById(snapshot.candidateMetrics),
    retryBacklog: stableSortById(snapshot.retryBacklog).map((item) => ({
      id: item.id,
      source: item.source,
      entityId: item.entityId,
      endpoint: item.endpoint,
      message: item.message,
      nextAction: item.nextAction
    })),
    summary: snapshot.summary || {}
  };
}

function contentHash(snapshot) {
  return crypto.createHash("sha256").update(JSON.stringify(stableCandidateView(snapshot))).digest("hex");
}

function archiveIdFor(snapshot, hash) {
  const generatedAt = snapshot.generatedAt || new Date().toISOString();
  const timestamp = generatedAt.replace(/[:.]/g, "-");
  return `${timestamp}-${hash.slice(0, 12)}`;
}

const snapshot = await readJsonIfExists(snapshotPath, null);
if (!snapshot) {
  console.error("data/candidate-snapshot.json is required.");
  process.exit(1);
}

const hash = contentHash(snapshot);
const existingManifest = await readJsonIfExists(manifestPath, {
  generatedAt: null,
  latestArchiveId: null,
  archives: []
});
const existingArchive = (existingManifest.archives || []).find((archive) => archive.contentHash === hash);
const archiveId = existingArchive?.id || archiveIdFor(snapshot, hash);
const archiveFile = `candidate-snapshot-${archiveId}.json`;
const archivePath = new URL(archiveFile, archiveDir);
const archivedAt = new Date().toISOString();
const counts = {
  candidateRelationships: snapshot.candidateRelationships?.length || 0,
  candidateEntities: snapshot.candidateEntities?.length || 0,
  candidateMetrics: snapshot.candidateMetrics?.length || 0,
  retryBacklog: snapshot.retryBacklog?.length || 0
};

const archiveRecord = {
  id: archiveId,
  file: `candidate-snapshots/${archiveFile}`,
  contentHash: hash,
  archivedAt: existingArchive?.archivedAt || archivedAt,
  snapshotGeneratedAt: snapshot.generatedAt || null,
  sourceSnapshotGeneratedAt: snapshot.sourceSnapshotGeneratedAt || null,
  counts
};

const archiveById = new Map((existingManifest.archives || []).map((archive) => [archive.id, archive]));
archiveById.set(archiveId, archiveRecord);
const archives = [...archiveById.values()].sort((a, b) => String(a.archivedAt).localeCompare(String(b.archivedAt)));
const manifest = {
  generatedAt: archivedAt,
  latestArchiveId: archiveId,
  latestContentHash: hash,
  archives
};

if (!dryRun) {
  await fs.mkdir(archiveDir, { recursive: true });
  if (!existingArchive) {
    await fs.writeFile(
      archivePath,
      `${JSON.stringify(
        {
          archivedAt,
          contentHash: hash,
          snapshot
        },
        null,
        2
      )}\n`
    );
  }
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(
  JSON.stringify(
    {
      archiveId,
      contentHash: hash,
      duplicateOfExistingArchive: Boolean(existingArchive),
      counts
    },
    null,
    2
  )
);
if (dryRun) console.log("Dry run only; candidate snapshot archive was not changed.");
