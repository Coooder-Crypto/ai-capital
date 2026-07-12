import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

globalThis.window = {};
await import("../data/seed.js");
await import("../data/p1-extension.js");

const seed = globalThis.window.AI_CAPITAL_SEED;

if (!seed) {
  throw new Error("AI_CAPITAL_SEED was not loaded");
}

const root = new URL("../", import.meta.url);
const connectorsPath = new URL("data/connectors.json", root);
const outputPath = new URL("data/openalex-works.snapshot.json", root);

const args = new Set(process.argv.slice(2));
const shouldFetch = args.has("--fetch");
const dryRun = args.has("--dry-run") || !shouldFetch;
const perPage = Number(process.argv.find((arg) => arg.startsWith("--per-page="))?.split("=")[1] || 3);
const timeoutMs = Number(process.argv.find((arg) => arg.startsWith("--timeout-ms="))?.split("=")[1] || 15000);

const connectors = JSON.parse(await fs.readFile(connectorsPath, "utf8"));
const entityById = new Map(seed.entities.map((entity) => [entity.id, entity]));
const openAlexItems = connectors.openAlex || [];

function stableId(...parts) {
  return parts
    .filter((part) => part !== undefined && part !== null && part !== "")
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function openAlexWorkId(value) {
  return String(value || "").split("/").pop() || "";
}

function compactText(value, maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function buildWorksUrl(item) {
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", item.query);
  url.searchParams.set("per-page", String(perPage));
  url.searchParams.set("sort", "cited_by_count:desc");
  url.searchParams.set("mailto", "research@example.com");
  return url;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "Accept": "application/json",
          "User-Agent": "AI Capital Map OpenAlex connector contact@example.com"
        }
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 160)}`);
      }
      return JSON.parse(text);
    } catch (fetchError) {
      const { stdout } = await execFileAsync("curl", [
        "-sS",
        "-L",
        "--max-time",
        String(Math.max(1, Math.ceil(timeoutMs / 1000))),
        "-H",
        "Accept: application/json",
        "-H",
        "User-Agent: AI Capital Map OpenAlex connector contact@example.com",
        String(url)
      ]);
      if (!stdout) throw fetchError;
      return JSON.parse(stdout);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function validateItems(items) {
  const errors = [];
  items.forEach((item, index) => {
    if (!item.entityId) errors.push(`openAlex[${index}] missing entityId`);
    if (!entityById.has(item.entityId)) errors.push(`openAlex[${index}] references unknown entityId: ${item.entityId}`);
    if (!item.query) errors.push(`openAlex[${index}] missing query`);
  });
  if (errors.length > 0) throw new Error(errors.join("\n"));
}

function normalizeWork(work) {
  const authorships = (work.authorships || []).slice(0, 8).map((authorship) => ({
    authorId: authorship.author?.id || null,
    authorName: authorship.author?.display_name || null,
    institutions: (authorship.institutions || []).slice(0, 4).map((institution) => ({
      id: institution.id || null,
      ror: institution.ror || null,
      displayName: institution.display_name || null,
      countryCode: institution.country_code || null,
      type: institution.type || null
    }))
  }));
  const referencedWorks = (work.referenced_works || [])
    .map(openAlexWorkId)
    .filter(Boolean)
    .slice(0, 12);

  return {
    id: openAlexWorkId(work.id),
    openAlexUrl: work.id,
    doi: work.doi || null,
    title: compactText(work.title || work.display_name || openAlexWorkId(work.id), 500),
    publicationYear: work.publication_year || null,
    publicationDate: work.publication_date || null,
    citedByCount: work.cited_by_count || 0,
    type: work.type || null,
    landingPageUrl: work.primary_location?.landing_page_url || null,
    sourceName: work.primary_location?.source?.display_name || null,
    authorships,
    referencedWorks
  };
}

validateItems(openAlexItems);

const generatedAt = new Date().toISOString();
const planned = openAlexItems.map((item) => ({
  entityId: item.entityId,
  entityName: entityById.get(item.entityId)?.name || item.entityId,
  query: item.query,
  url: String(buildWorksUrl(item))
}));

if (!shouldFetch) {
  console.log(JSON.stringify({ source: "openalex", mode: "dry-run", plannedRequestCount: planned.length, planned }, null, 2));
  console.log("Dry run only; pass --fetch to call OpenAlex and write data/openalex-works.snapshot.json.");
  process.exit(0);
}

const results = [];
const errors = [];
for (const item of openAlexItems) {
  const url = buildWorksUrl(item);
  try {
    const data = await fetchJson(url);
    results.push({
      id: stableId("openalex_works", item.entityId),
      entityId: item.entityId,
      entityName: entityById.get(item.entityId)?.name || item.entityId,
      query: item.query,
      requestedUrl: String(url),
      fetchedAt: generatedAt,
      worksCount: data.meta?.count ?? null,
      works: (data.results || []).map(normalizeWork)
    });
  } catch (error) {
    errors.push({
      id: stableId("openalex_error", item.entityId),
      entityId: item.entityId,
      query: item.query,
      requestedUrl: String(url),
      message: error instanceof Error ? error.message : "OpenAlex fetch failed",
      createdAt: generatedAt
    });
  }
}

const snapshot = {
  generatedAt,
  source: "openalex",
  plannedRequestCount: planned.length,
  results,
  errors,
  summary: {
    planned: planned.length,
    resultSets: results.length,
    works: results.reduce((total, result) => total + (result.works?.length || 0), 0),
    errors: errors.length
  }
};

if (!dryRun) {
  await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
}

console.log(JSON.stringify(snapshot.summary, null, 2));
if (!dryRun) {
  console.log("Wrote data/openalex-works.snapshot.json.");
}
