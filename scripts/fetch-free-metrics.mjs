import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const connectorsPath = path.join(rootDir, "data", "connectors.json");
const outputPath = path.join(rootDir, "data", "free-metrics.snapshot.json");
const dryRun = process.argv.includes("--dry-run");
const defaultTimeoutMs = Number(process.env.FREE_METRICS_TIMEOUT_MS || 15000);

const connectors = JSON.parse(await fs.readFile(connectorsPath, "utf8"));

function endpointList() {
  return [
    ...(connectors.github || []).map((item) => ({
      source: "github",
      entityId: item.entityId,
      url: `https://api.github.com/repos/${item.repo}`
    })),
    ...(connectors.huggingFace || []).map((item) => ({
      source: "huggingFace",
      entityId: item.entityId,
      url: `https://huggingface.co/api/models/${item.model}`
    })),
    ...(connectors.sec || []).map((item) => ({
      source: "sec",
      entityId: item.entityId,
      url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${item.cik.padStart(10, "0")}.json`
    })),
    ...(connectors.openAlex || []).map((item) => ({
      source: "openAlex",
      entityId: item.entityId,
      url: `https://api.openalex.org/works?search=${encodeURIComponent(item.query)}&per-page=5&mailto=research@example.com`
    }))
  ];
}

function formatFetchError(error, url, attempts) {
  const code = error.cause?.code || error.code || null;
  const causeMessage = error.cause?.message || "";
  if (code === "ENOTFOUND") {
    return {
      message: `DNS lookup failed for ${new URL(url).hostname}`,
      code,
      url,
      attempts,
      detail: causeMessage || error.message
    };
  }
  if (code === "ECONNRESET") {
    return {
      message: `Connection reset while fetching ${new URL(url).hostname}`,
      code,
      url,
      attempts,
      detail: causeMessage || error.message
    };
  }
  if (error.name === "AbortError") {
    return {
      message: `Request timed out after ${defaultTimeoutMs}ms for ${url}`,
      code: "TIMEOUT",
      url,
      attempts,
      detail: error.message
    };
  }
  return {
    message: error.message,
    code,
    url,
    attempts,
    detail: causeMessage || undefined
  };
}

async function fetchJson(url, headers = {}, attempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), defaultTimeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "AI Capital Map research contact@example.com",
          ...headers
        },
        signal: controller.signal
      });

      if (!response.ok) {
        const responseText = await response.text().catch(() => "");
        const excerpt = responseText ? `: ${responseText.slice(0, 200)}` : "";
        throw new Error(`${response.status} ${response.statusText} for ${url}${excerpt}`);
      }

      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  const formatted = formatFetchError(lastError, url, attempts);
  const wrapped = new Error(formatted.message);
  wrapped.meta = formatted;
  throw wrapped;
}

function latestUsdFact(companyFacts, concept, unitName = "USD") {
  const units = companyFacts?.facts?.["us-gaap"]?.[concept]?.units;
  const usdFacts = units?.[unitName] || [];
  const sorted = [...usdFacts]
    .filter((fact) => fact.fy && fact.fp && fact.val !== undefined)
    .sort((a, b) => String(b.end || "").localeCompare(String(a.end || "")));
  return sorted[0] || null;
}

function latestFactAcrossConcepts(companyFacts, concepts, unitName = "USD") {
  const facts = concepts.map((concept) => latestUsdFact(companyFacts, concept, unitName)).filter(Boolean);
  return facts.sort((a, b) => String(b.end || "").localeCompare(String(a.end || "")))[0] || null;
}

async function fetchGithubMetric(item) {
  const data = await fetchJson(`https://api.github.com/repos/${item.repo}`);
  return {
    entityId: item.entityId,
    source: "github",
    repo: item.repo,
    asOf: new Date().toISOString(),
    metrics: {
      stars: data.stargazers_count,
      forks: data.forks_count,
      openIssues: data.open_issues_count,
      watchers: data.subscribers_count,
      repoUpdatedAt: data.updated_at
    }
  };
}

async function fetchHuggingFaceMetric(item) {
  const data = await fetchJson(`https://huggingface.co/api/models/${item.model}`);
  return {
    entityId: item.entityId,
    source: "huggingFace",
    model: item.model,
    asOf: new Date().toISOString(),
    metrics: {
      downloads: data.downloads,
      likes: data.likes,
      pipelineTag: data.pipeline_tag,
      lastModified: data.lastModified
    }
  };
}

async function fetchSecMetric(item) {
  const userAgent = process.env.SEC_USER_AGENT || "AI Capital Map research contact@example.com";
  const data = await fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${item.cik.padStart(10, "0")}.json`, {
    "User-Agent": userAgent
  });
  const revenue = latestFactAcrossConcepts(data, [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet"
  ]);
  const assets = latestFactAcrossConcepts(data, ["Assets"]);
  const shares = latestFactAcrossConcepts(data, ["EntityCommonStockSharesOutstanding"], "shares");

  return {
    entityId: item.entityId,
    source: "sec",
    cik: item.cik,
    asOf: new Date().toISOString(),
    companyName: data.entityName,
    metrics: {
      revenue: revenue?.val ?? null,
      revenuePeriodEnd: revenue?.end ?? null,
      assets: assets?.val ?? null,
      assetsPeriodEnd: assets?.end ?? null,
      sharesOrEquity: shares?.val ?? null,
      sharesOrEquityPeriodEnd: shares?.end ?? null
    }
  };
}

async function fetchOpenAlexMetric(item) {
  const data = await fetchJson(`https://api.openalex.org/works?search=${encodeURIComponent(item.query)}&per-page=5&mailto=research@example.com`, {
    "User-Agent": "AI Capital Map research contact@example.com"
  }, 3);
  const topWork = [...(data.results || [])].sort((a, b) => (b.cited_by_count || 0) - (a.cited_by_count || 0))[0];
  return {
    entityId: item.entityId,
    source: "openAlex",
    query: item.query,
    asOf: new Date().toISOString(),
    metrics: {
      worksCount: data.meta?.count ?? null,
      topWorkTitle: topWork?.title ?? null,
      topWorkCitations: topWork?.cited_by_count ?? null,
      topWorkYear: topWork?.publication_year ?? null,
      topWorkUrl: topWork?.id ?? null
    }
  };
}

if (dryRun) {
  console.log(JSON.stringify({ plannedRequests: endpointList() }, null, 2));
  process.exit(0);
}

const results = [];
const errors = [];

for (const item of connectors.github || []) {
  try {
    results.push(await fetchGithubMetric(item));
  } catch (error) {
    errors.push({ source: "github", entityId: item.entityId, ...(error.meta || { message: error.message }) });
  }
}

for (const item of connectors.huggingFace || []) {
  try {
    results.push(await fetchHuggingFaceMetric(item));
  } catch (error) {
    errors.push({ source: "huggingFace", entityId: item.entityId, ...(error.meta || { message: error.message }) });
  }
}

for (const item of connectors.sec || []) {
  try {
    results.push(await fetchSecMetric(item));
  } catch (error) {
    errors.push({ source: "sec", entityId: item.entityId, ...(error.meta || { message: error.message }) });
  }
}

for (const item of connectors.openAlex || []) {
  try {
    results.push(await fetchOpenAlexMetric(item));
  } catch (error) {
    errors.push({ source: "openAlex", entityId: item.entityId, ...(error.meta || { message: error.message }) });
  }
}

const snapshot = {
  generatedAt: new Date().toISOString(),
  results,
  errors
};

await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Wrote ${results.length} metric groups to ${path.relative(rootDir, outputPath)}.`);
if (errors.length > 0) {
  console.warn(`${errors.length} requests failed. Inspect the errors array in the snapshot.`);
}
