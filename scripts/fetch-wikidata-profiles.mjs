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
const outputPath = new URL("data/wikidata-profiles.snapshot.json", root);

const args = new Set(process.argv.slice(2));
const shouldFetch = args.has("--fetch");
const dryRun = args.has("--dry-run") || !shouldFetch;
const timeoutMs = Number(process.argv.find((arg) => arg.startsWith("--timeout-ms="))?.split("=")[1] || 10000);

const entityById = new Map(seed.entities.map((entity) => [entity.id, entity]));
const connectors = JSON.parse(await fs.readFile(connectorsPath, "utf8"));
const wikidataItems = connectors.wikidata || [];

function stableId(...parts) {
  return parts
    .filter((part) => part !== undefined && part !== null && part !== "")
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function firstClaimValue(entity, propertyId) {
  const claim = entity.claims?.[propertyId]?.[0];
  const value = claim?.mainsnak?.datavalue?.value;
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value.id) return value.id;
  if (value.time) return value.time;
  return null;
}

function normalizeInception(value) {
  if (!value) return undefined;
  const match = String(value).match(/[+-](\d{4})-\d{2}-\d{2}/);
  return match?.[1];
}

function uniqueStrings(values, limit = 8) {
  const seen = new Set();
  const rows = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    rows.push(text);
    if (rows.length >= limit) break;
  }
  return rows;
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
          "User-Agent": "AI Capital Map Wikidata connector contact@example.com"
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
        "User-Agent: AI Capital Map Wikidata connector contact@example.com",
        String(url)
      ]);
      if (!stdout) {
        throw fetchError;
      }
      return JSON.parse(stdout);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function searchQid(search) {
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("search", search);
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  const data = await fetchJson(url);
  return data.search?.[0]?.id || null;
}

async function fetchEntities(ids) {
  if (ids.length === 0) return {};
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("ids", ids.join("|"));
  url.searchParams.set("props", "labels|descriptions|aliases|claims");
  url.searchParams.set("languages", "en");
  url.searchParams.set("format", "json");
  const data = await fetchJson(url);
  return data.entities || {};
}

function validateItems(items) {
  const errors = [];
  items.forEach((item, index) => {
    if (!item.entityId) errors.push(`wikidata[${index}] missing entityId`);
    if (!entityById.has(item.entityId)) errors.push(`wikidata[${index}] references unknown entityId: ${item.entityId}`);
    if (!item.qid && !item.search) errors.push(`wikidata[${index}] needs qid or search`);
  });
  if (errors.length > 0) throw new Error(errors.join("\n"));
}

async function buildResult(item, generatedAt) {
  const qid = item.qid || (await searchQid(item.search));
  if (!qid) {
    return {
      error: {
        id: stableId("wikidata_error", item.entityId),
        entityId: item.entityId,
        search: item.search,
        message: "No Wikidata entity found",
        createdAt: generatedAt
      }
    };
  }

  const entities = await fetchEntities([qid]);
  const entity = entities[qid];
  if (!entity || entity.missing) {
    return {
      error: {
        id: stableId("wikidata_error", item.entityId, qid),
        entityId: item.entityId,
        qid,
        message: "Wikidata entity response missing",
        createdAt: generatedAt
      }
    };
  }

  const countryId = firstClaimValue(entity, "P17");
  const countryEntities = countryId ? await fetchEntities([countryId]) : {};
  const seedEntity = entityById.get(item.entityId);
  const label = entity.labels?.en?.value || seedEntity.name;
  const description = entity.descriptions?.en?.value || seedEntity.description;
  const aliases = uniqueStrings([label, ...(entity.aliases?.en || []).map((alias) => alias.value), ...(seedEntity.aliases || [])]);
  const officialWebsite = firstClaimValue(entity, "P856") || seedEntity.website_url;
  const country = countryId ? countryEntities[countryId]?.labels?.en?.value : seedEntity.country;
  const inceptionYear = normalizeInception(firstClaimValue(entity, "P571"));
  const confidence = Number((item.qid ? 0.84 : 0.74).toFixed(3));

  return {
    result: {
      id: stableId("wikidata_profile", item.entityId, qid),
      entityId: item.entityId,
      entityName: seedEntity.name,
      qid,
      label,
      description,
      aliases,
      officialWebsite,
      country,
      inceptionYear,
      wikidataUrl: `https://www.wikidata.org/wiki/${qid}`,
      search: item.search,
      confidence,
      sourceId: "src_wikidata",
      asOf: generatedAt.slice(0, 10),
      fetchedAt: generatedAt
    }
  };
}

function buildResultFromEntity(item, qid, entity, countryEntities, generatedAt) {
  if (!qid) {
    return {
      error: {
        id: stableId("wikidata_error", item.entityId),
        entityId: item.entityId,
        search: item.search,
        message: "No Wikidata entity found",
        createdAt: generatedAt
      }
    };
  }

  if (!entity || entity.missing) {
    return {
      error: {
        id: stableId("wikidata_error", item.entityId, qid),
        entityId: item.entityId,
        qid,
        message: "Wikidata entity response missing",
        createdAt: generatedAt
      }
    };
  }

  const countryId = firstClaimValue(entity, "P17");
  const seedEntity = entityById.get(item.entityId);
  const label = entity.labels?.en?.value || seedEntity.name;
  const description = entity.descriptions?.en?.value || seedEntity.description;
  const aliases = uniqueStrings([label, ...(entity.aliases?.en || []).map((alias) => alias.value), ...(seedEntity.aliases || [])]);
  const officialWebsite = firstClaimValue(entity, "P856") || seedEntity.website_url;
  const country = countryId ? countryEntities[countryId]?.labels?.en?.value : seedEntity.country;
  const inceptionYear = normalizeInception(firstClaimValue(entity, "P571"));
  const confidence = Number((item.qid ? 0.84 : 0.74).toFixed(3));

  return {
    result: {
      id: stableId("wikidata_profile", item.entityId, qid),
      entityId: item.entityId,
      entityName: seedEntity.name,
      qid,
      label,
      description,
      aliases,
      officialWebsite,
      country,
      inceptionYear,
      wikidataUrl: `https://www.wikidata.org/wiki/${qid}`,
      search: item.search,
      confidence,
      sourceId: "src_wikidata",
      asOf: generatedAt.slice(0, 10),
      fetchedAt: generatedAt
    }
  };
}

validateItems(wikidataItems);

const generatedAt = new Date().toISOString();
const planned = wikidataItems.map((item) => ({
  entityId: item.entityId,
  entityName: entityById.get(item.entityId)?.name || item.entityId,
  qid: item.qid || null,
  search: item.search || null
}));

if (!shouldFetch) {
  const summary = {
    source: "wikidata",
    mode: "dry-run",
    plannedRequestCount: planned.length,
    planned
  };
  console.log(JSON.stringify(summary, null, 2));
  console.log("Dry run only; pass --fetch to call Wikidata and write data/wikidata-profiles.snapshot.json.");
  process.exit(0);
}

const results = [];
const errors = [];
const qidByEntityId = new Map();
for (const item of wikidataItems) {
  try {
    qidByEntityId.set(item.entityId, item.qid || (await searchQid(item.search)));
  } catch (error) {
    errors.push({
      id: stableId("wikidata_error", item.entityId),
      entityId: item.entityId,
      qid: item.qid,
      search: item.search,
      message: error instanceof Error ? error.message : "Wikidata fetch failed",
      createdAt: generatedAt
    });
  }
}

let wikidataEntities = {};
let countryEntities = {};
try {
  wikidataEntities = await fetchEntities([...new Set([...qidByEntityId.values()].filter(Boolean))]);
  const countryIds = [
    ...new Set(
      Object.values(wikidataEntities)
        .map((entity) => firstClaimValue(entity, "P17"))
        .filter(Boolean)
    )
  ];
  countryEntities = await fetchEntities(countryIds);
} catch (error) {
  errors.push({
    id: "wikidata_error_batch_fetch",
    entityId: "all",
    message: error instanceof Error ? error.message : "Wikidata batch fetch failed",
    createdAt: generatedAt
  });
}

for (const item of wikidataItems) {
  const qid = qidByEntityId.get(item.entityId);
  if (!qid) continue;
  const output = buildResultFromEntity(item, qid, wikidataEntities[qid], countryEntities, generatedAt);
  if (output.result) results.push(output.result);
  if (output.error) errors.push(output.error);
}

const snapshot = {
  generatedAt,
  source: "wikidata",
  plannedRequestCount: planned.length,
  results: results.sort((a, b) => a.entityId.localeCompare(b.entityId)),
  errors: errors.sort((a, b) => a.id.localeCompare(b.id)),
  summary: {
    planned: planned.length,
    results: results.length,
    errors: errors.length
  }
};

if (!dryRun) {
  await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
}

console.log(JSON.stringify(snapshot.summary, null, 2));
if (!dryRun) {
  console.log("Wrote data/wikidata-profiles.snapshot.json.");
}
