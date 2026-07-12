import fs from "node:fs/promises";
import path from "node:path";

import { metricBundle, seed } from "@/lib/data";
import type { ResearchTimelineEvent } from "@/lib/types";

const rootDir = process.cwd();
const researchDir = path.join(rootDir, "data", "research");
const exportDir = path.join(rootDir, "data", "exports");
const dataDir = path.join(rootDir, "data");

export type ResearchDataset =
  | "entities"
  | "relationships"
  | "metrics"
  | "raw-documents"
  | "parsed-documents"
  | "extraction-records"
  | "llm-extractions"
  | "candidate-relationships"
  | "candidate-entities"
  | "candidate-metrics"
  | "wikidata-profiles"
  | "openalex-works"
  | "arxiv-papers"
  | "candidate-snapshot-archives"
  | "candidate-snapshot-latest"
  | "snapshot-summary";
export type ExportFormat = "csv" | "json";
export async function readGraphSnapshot() {
  return JSON.parse(await fs.readFile(path.join(researchDir, "graph-snapshot.json"), "utf8"));
}

export async function readTimeline(): Promise<{ generatedAt?: string; events: ResearchTimelineEvent[] }> {
  return JSON.parse(await fs.readFile(path.join(researchDir, "timeline.json"), "utf8"));
}

export async function readExportCsv(dataset: ResearchDataset) {
  if (dataset === "candidate-snapshot-latest") {
    throw new Error("candidate-snapshot-latest is only available as JSON");
  }
  return fs.readFile(path.join(exportDir, `${dataset}.csv`), "utf8");
}

async function readResearchJsonArtifact<T>(fileName: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path.join(researchDir, fileName), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function readJsonArtifact<T>(fileName: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir, fileName), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function exportDatasetAsJson(dataset: ResearchDataset) {
  const entityById = new Map(seed.entities.map((entity) => [entity.id, entity]));

  if (dataset === "entities") {
    return seed.entities.map((entity) => ({
      id: entity.id,
      name: entity.name,
      type: entity.type,
      layer: entity.layer,
      status: entity.status,
      country: entity.country || "",
      website_url: entity.website_url || "",
      valuation: entity.valuation || ""
    }));
  }

  if (dataset === "relationships") {
    return seed.relationships.map((relationship) => ({
      id: relationship.id,
      source: relationship.source,
      source_name: entityById.get(relationship.source)?.name || relationship.source,
      target: relationship.target,
      target_name: entityById.get(relationship.target)?.name || relationship.target,
      type: relationship.type,
      confidence: relationship.confidence,
      source_id: relationship.sourceId,
      evidence_title: relationship.evidenceTitle || "",
      evidence_url: relationship.evidenceUrl || "",
      evidence_strength: relationship.evidenceStrength || "",
      review_status: relationship.reviewStatus || "",
      review_note: relationship.reviewNote || "",
      note: relationship.note
    }));
  }

  if (dataset === "metrics") {
    return metricBundle.metrics.flatMap((group) =>
      Object.entries(group.metrics || {}).map(([metricType, value]) => ({
        entity_id: group.entityId,
        entity_name: entityById.get(group.entityId)?.name || group.entityId,
        source: group.source,
        source_ref: group.sourceRef || "",
        as_of: group.asOf,
        metric_type: metricType,
        value
      }))
    );
  }

  if (dataset === "raw-documents") {
    const bundle = await readJsonArtifact<{ documents: unknown[] }>("raw-documents.json", { documents: [] });
    return bundle.documents;
  }

  if (dataset === "parsed-documents") {
    const bundle = await readJsonArtifact<{ documents: unknown[] }>("parsed-documents.json", { documents: [] });
    return bundle.documents;
  }

  if (dataset === "extraction-records") {
    const bundle = await readJsonArtifact<{ records: unknown[] }>("extraction-candidates.json", { records: [] });
    return bundle.records;
  }

  if (dataset === "llm-extractions") {
    const bundle = await readJsonArtifact<{ records: unknown[] }>("llm-extractions.json", { records: [] });
    return bundle.records;
  }

  if (dataset === "candidate-relationships") {
    const bundle = await readJsonArtifact<{ candidateRelationships: unknown[] }>("candidate-snapshot.json", {
      candidateRelationships: []
    });
    return bundle.candidateRelationships;
  }

  if (dataset === "candidate-metrics") {
    const bundle = await readJsonArtifact<{ candidateMetrics: unknown[] }>("candidate-snapshot.json", {
      candidateMetrics: []
    });
    return bundle.candidateMetrics;
  }

  if (dataset === "candidate-entities") {
    const bundle = await readJsonArtifact<{ candidateEntities: unknown[] }>("candidate-snapshot.json", {
      candidateEntities: []
    });
    return bundle.candidateEntities;
  }

  if (dataset === "wikidata-profiles") {
    const bundle = await readJsonArtifact<{ results: unknown[] }>("wikidata-profiles.snapshot.json", {
      results: []
    });
    return bundle.results;
  }

  if (dataset === "openalex-works") {
    const bundle = await readJsonArtifact<{ results: Array<{ works?: unknown[] }> }>("openalex-works.snapshot.json", {
      results: []
    });
    return bundle.results.flatMap((result) => result.works || []);
  }

  if (dataset === "arxiv-papers") {
    const bundle = await readJsonArtifact<{ results: Array<{ papers?: unknown[] }> }>("arxiv-papers.snapshot.json", {
      results: []
    });
    return bundle.results.flatMap((result) => result.papers || []);
  }

  if (dataset === "candidate-snapshot-archives") {
    const manifest = await readResearchJsonArtifact<{ archives: unknown[] }>("candidate-snapshot-manifest.json", {
      archives: []
    });
    return manifest.archives;
  }

  if (dataset === "candidate-snapshot-latest") {
    const manifest = await readResearchJsonArtifact<{ latestArchiveId?: string | null; archives: Array<{ id: string; file: string }> }>(
      "candidate-snapshot-manifest.json",
      {
        latestArchiveId: null,
        archives: []
      }
    );
    const latest = manifest.archives.find((archive) => archive.id === manifest.latestArchiveId);
    if (!latest) return null;
    return readResearchJsonArtifact(latest.file, null);
  }

  return [
    {
      generated_at: metricBundle.generatedAt || "",
      entities: seed.entities.length,
      relationships: seed.relationships.length,
      sources: seed.sources.length,
      approved_metric_groups: metricBundle.metrics.length,
      metric_failures: metricBundle.rejectedOrFailed?.length || 0
    }
  ];
}

export function parseDataset(value: string | null): ResearchDataset {
  const datasets: ResearchDataset[] = [
    "entities",
    "relationships",
    "metrics",
    "raw-documents",
    "parsed-documents",
    "extraction-records",
    "llm-extractions",
    "candidate-relationships",
    "candidate-entities",
    "candidate-metrics",
    "wikidata-profiles",
    "openalex-works",
    "arxiv-papers",
    "candidate-snapshot-archives",
    "candidate-snapshot-latest",
    "snapshot-summary"
  ];
  return datasets.includes(value as ResearchDataset) ? (value as ResearchDataset) : "entities";
}

export function parseFormat(value: string | null): ExportFormat {
  return value === "json" ? "json" : "csv";
}
