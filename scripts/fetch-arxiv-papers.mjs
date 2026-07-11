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
const outputPath = new URL("data/arxiv-papers.snapshot.json", root);

const args = new Set(process.argv.slice(2));
const shouldFetch = args.has("--fetch");
const dryRun = args.has("--dry-run") || !shouldFetch;
const maxResults = Number(process.argv.find((arg) => arg.startsWith("--max-results="))?.split("=")[1] || 3);
const timeoutMs = Number(process.argv.find((arg) => arg.startsWith("--timeout-ms="))?.split("=")[1] || 15000);

const connectors = JSON.parse(await fs.readFile(connectorsPath, "utf8"));
const entityById = new Map(seed.entities.map((entity) => [entity.id, entity]));
const arxivItems = connectors.arxiv || [];

function stableId(...parts) {
  return parts
    .filter((part) => part !== undefined && part !== null && part !== "")
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function decodeXml(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(text, pattern) {
  return decodeXml(text.match(pattern)?.[1] || "");
}

function allMatches(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => decodeXml(match[1])).filter(Boolean);
}

function arxivPaperId(value) {
  return String(value || "").replace(/^https?:\/\/arxiv\.org\/abs\//, "").replace(/v\d+$/, "");
}

function buildArxivUrl(item) {
  const url = new URL("https://export.arxiv.org/api/query");
  url.searchParams.set("search_query", item.query);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(maxResults));
  url.searchParams.set("sortBy", item.sortBy || "relevance");
  url.searchParams.set("sortOrder", item.sortOrder || "descending");
  return url;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "Accept": "application/atom+xml, application/xml, text/xml",
          "User-Agent": "AI Capital Map arXiv connector contact@example.com"
        }
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 160)}`);
      }
      return text;
    } catch (fetchError) {
      const { stdout } = await execFileAsync("curl", [
        "-sS",
        "-L",
        "--max-time",
        String(Math.max(1, Math.ceil(timeoutMs / 1000))),
        "-H",
        "Accept: application/atom+xml, application/xml, text/xml",
        "-H",
        "User-Agent: AI Capital Map arXiv connector contact@example.com",
        String(url)
      ]);
      if (!stdout) throw fetchError;
      return stdout;
    }
  } finally {
    clearTimeout(timeout);
  }
}

function validateItems(items) {
  const errors = [];
  items.forEach((item, index) => {
    if (!item.entityId) errors.push(`arxiv[${index}] missing entityId`);
    if (!entityById.has(item.entityId)) errors.push(`arxiv[${index}] references unknown entityId: ${item.entityId}`);
    if (!item.query) errors.push(`arxiv[${index}] missing query`);
  });
  if (errors.length > 0) throw new Error(errors.join("\n"));
}

function normalizePaper(entryXml) {
  const idUrl = firstMatch(entryXml, /<id>([\s\S]*?)<\/id>/);
  const paperId = arxivPaperId(idUrl);
  const links = [...entryXml.matchAll(/<link\s+([^>]+?)\/>/g)].map((match) => match[1]);
  const pdfLink = links
    .map((attributes) => attributes.match(/href="([^"]+)"/)?.[1])
    .find((href) => href && href.includes("/pdf/"));
  const arxivUrl = (idUrl || (paperId ? `https://arxiv.org/abs/${paperId}` : "")).replace(/^http:\/\//, "https://");
  const pdfUrl = (pdfLink || (paperId ? `https://arxiv.org/pdf/${paperId}` : "")).replace(/^http:\/\//, "https://");

  return {
    id: paperId,
    arxivUrl: arxivUrl || null,
    pdfUrl: pdfUrl || null,
    title: firstMatch(entryXml, /<title>([\s\S]*?)<\/title>/).slice(0, 500),
    summary: firstMatch(entryXml, /<summary>([\s\S]*?)<\/summary>/).slice(0, 800),
    published: firstMatch(entryXml, /<published>([\s\S]*?)<\/published>/),
    updated: firstMatch(entryXml, /<updated>([\s\S]*?)<\/updated>/),
    authors: allMatches(entryXml, /<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/g).slice(0, 12),
    categories: [...entryXml.matchAll(/<category\s+term="([^"]+)"/g)].map((match) => decodeXml(match[1])).slice(0, 12)
  };
}

function parseArxivFeed(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => normalizePaper(match[1]));
}

validateItems(arxivItems);

const generatedAt = new Date().toISOString();
const planned = arxivItems.map((item) => ({
  entityId: item.entityId,
  entityName: entityById.get(item.entityId)?.name || item.entityId,
  query: item.query,
  url: String(buildArxivUrl(item))
}));

if (!shouldFetch) {
  console.log(JSON.stringify({ source: "arxiv", mode: "dry-run", plannedRequestCount: planned.length, planned }, null, 2));
  console.log("Dry run only; pass --fetch to call arXiv and write data/arxiv-papers.snapshot.json.");
  process.exit(0);
}

const results = [];
const errors = [];
for (const item of arxivItems) {
  const url = buildArxivUrl(item);
  try {
    const xml = await fetchText(url);
    const papers = parseArxivFeed(xml);
    results.push({
      id: stableId("arxiv_papers", item.entityId),
      entityId: item.entityId,
      entityName: entityById.get(item.entityId)?.name || item.entityId,
      query: item.query,
      requestedUrl: String(url),
      fetchedAt: generatedAt,
      papersCount: papers.length,
      papers
    });
  } catch (error) {
    errors.push({
      id: stableId("arxiv_error", item.entityId),
      entityId: item.entityId,
      query: item.query,
      requestedUrl: String(url),
      message: error instanceof Error ? error.message : "arXiv fetch failed",
      createdAt: generatedAt
    });
  }
}

const snapshot = {
  generatedAt,
  source: "arxiv",
  plannedRequestCount: planned.length,
  results,
  errors,
  summary: {
    planned: planned.length,
    resultSets: results.length,
    papers: results.reduce((total, result) => total + (result.papers?.length || 0), 0),
    errors: errors.length
  }
};

if (!dryRun) {
  await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
}

console.log(JSON.stringify(snapshot.summary, null, 2));
if (!dryRun) {
  console.log("Wrote data/arxiv-papers.snapshot.json.");
}
