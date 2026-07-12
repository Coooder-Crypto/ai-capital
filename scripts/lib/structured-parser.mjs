export function stableId(...parts) {
  return parts
    .filter((part) => part !== undefined && part !== null && part !== "")
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

export function compactText(value, maxLength = 8000) {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function detectFormat(document) {
  const contentType = String(document.contentType || "").toLowerCase();
  const url = String(document.url || "").toLowerCase();
  if (contentType.includes("rss") || contentType.includes("atom") || url.endsWith(".rss") || url.endsWith(".xml")) return "rss";
  if (contentType.includes("xml") && /<rss|<feed|<item|<entry/i.test(rawMarkup(document))) return "rss";
  if (contentType.includes("json") || url.includes("api.openalex.org")) return "json";
  if (contentType.includes("pdf") || url.endsWith(".pdf")) return "pdf";
  if (contentType.includes("html") || /<\/?[a-z][\s\S]*>/i.test(rawMarkup(document))) return "html";
  return "text";
}

export function rawMarkup(document) {
  const payload = document.payload || {};
  return String(payload.contentExcerpt || payload.body || payload.raw || payload.textPreview || "");
}

export function payloadText(document) {
  const payload = document.payload || {};
  const hintText = (payload.extractionHints || [])
    .map((hint) => [hint.relationType, hint.metricType, hint.targetEntityId, hint.note].filter(Boolean).join(" "))
    .join(" ");
  return compactText([payload.title, rawMarkup(document), hintText].filter(Boolean).join(" "));
}

function textFromHtml(html) {
  return compactText(html);
}

function firstTagValue(markup, tagNames) {
  for (const tagName of tagNames) {
    const match = markup.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
    if (match) return compactText(match[1], 500);
  }
  return "";
}

function firstLinkValue(markup) {
  const href = markup.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i)?.[1];
  if (href) return href;
  return firstTagValue(markup, ["link", "guid", "id"]);
}

function resolveUrl(value, baseUrl) {
  if (!value) return "";
  try {
    return new URL(decodeHtml(value), baseUrl || undefined).href;
  } catch {
    return decodeHtml(value);
  }
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractLinks(markup, baseUrl) {
  const links = [];
  for (const match of markup.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    links.push({
      url: resolveUrl(match[1], baseUrl),
      text: compactText(match[2], 240),
      source: "html_anchor"
    });
  }
  for (const match of markup.matchAll(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/gi)) {
    links.push({
      url: resolveUrl(match[1], baseUrl),
      text: "feed link",
      source: "xml_link"
    });
  }
  return uniqueBy(links, (link) => link.url).slice(0, 80);
}

export function parseRssItems(markup, baseUrl) {
  const items = [];
  for (const match of markup.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const itemMarkup = match[2];
    const title = firstTagValue(itemMarkup, ["title"]) || "Feed item";
    const link = resolveUrl(firstLinkValue(itemMarkup), baseUrl);
    const publishedAt = firstTagValue(itemMarkup, ["pubDate", "published", "updated"]);
    const summary = firstTagValue(itemMarkup, ["description", "summary", "content"]);
    items.push({
      title,
      link,
      publishedAt,
      summary
    });
  }
  return uniqueBy(items, (item) => `${item.title}:${item.link}`).slice(0, 60);
}

export function parseHtmlSections(document) {
  const markup = rawMarkup(document);
  const text = payloadText(document);
  const headingMatches = [...markup.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];

  if (headingMatches.length === 0) {
    return [
      {
        heading: document.title || document.payload?.title || "Document",
        text
      }
    ].filter((section) => section.text);
  }

  const sections = [];
  for (let index = 0; index < headingMatches.length; index += 1) {
    const match = headingMatches[index];
    const heading = compactText(match[2], 240);
    const start = (match.index || 0) + match[0].length;
    const end = headingMatches[index + 1]?.index ?? markup.length;
    const sectionText = compactText(markup.slice(start, end), 1600);
    if (heading || sectionText) {
      sections.push({
        heading: heading || `Section ${index + 1}`,
        text: sectionText
      });
    }
  }

  return sections.slice(0, 30);
}

export function parseRssSections(document) {
  return parseRssItems(rawMarkup(document), document.url).map((item) => ({
    heading: item.title,
    text: [item.publishedAt, item.summary, item.link].filter(Boolean).join(" / ")
  }));
}

export function parseTableRows(markup) {
  const rows = [];
  for (const match of markup.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => compactText(cell[1], 240))
      .filter(Boolean);
    if (cells.length > 0) rows.push(cells.join(" | "));
  }
  return rows.slice(0, 40);
}

export function parseJsonPayload(document) {
  const text = rawMarkup(document) || document.payload?.textPreview || "";
  let parsed = null;
  if (typeof text === "string" && /^[\s\n\r]*[\[{]/.test(text)) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  return {
    resultCount: parsed?.meta?.count ?? parsed?.results?.length ?? (Array.isArray(parsed) ? parsed.length : null),
    keys: parsed && typeof parsed === "object" ? Object.keys(parsed).slice(0, 20) : []
  };
}

function uniqueFacts(facts) {
  const seen = new Set();
  return facts.filter((fact) => {
    const key = String(fact.type || "").startsWith("financial_")
      ? `${fact.type}:${fact.metricType || ""}:${fact.value}`
      : `${fact.type}:${fact.value}:${fact.context}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function contextAround(text, index, length) {
  return text.slice(Math.max(0, index - 60), Math.min(text.length, index + length + 60)).trim();
}

const moneyValueRegex = /(?:\bUS\$|\$)\s?\d+(?:\.\d+)?\s?(?:billion|million|bn|m)?\b/i;
const percentageValueRegex = /\b\d+(?:\.\d+)?%/;

const financialFactPatterns = [
  { type: "financial_revenue", metricType: "revenue", label: /\b(revenue|net sales|sales)\b/i, value: moneyValueRegex },
  {
    type: "financial_operating_income",
    metricType: "operating_income",
    label: /\b(operating income|income from operations)\b/i,
    value: moneyValueRegex
  },
  { type: "financial_net_income", metricType: "net_income", label: /\b(net income|net earnings)\b/i, value: moneyValueRegex },
  {
    type: "financial_capex",
    metricType: "capital_expenditure",
    label: /\b(capex|capital expenditures?|capital expenditure)\b/i,
    value: moneyValueRegex
  },
  {
    type: "financial_research_and_development",
    metricType: "research_and_development",
    label: /\b(research and development|r&d)\b/i,
    value: moneyValueRegex
  },
  { type: "financial_gross_margin", metricType: "gross_margin", label: /\bgross margin\b/i, value: percentageValueRegex },
  {
    type: "financial_operating_margin",
    metricType: "operating_margin",
    label: /\boperating margin\b/i,
    value: percentageValueRegex
  }
];

function proseSegments(text) {
  return String(text || "")
    .split(/[\n;!?]+/)
    .map((segment) => compactText(segment, 360))
    .filter((segment) => segment.length > 0);
}

function extractFinancialFacts(text, markup) {
  const rowSegments = parseTableRows(markup).map((row) => ({ text: row, context: "html_table" }));
  const textSegments = proseSegments(text).map((segment) => ({ text: segment, context: segment }));
  const facts = [];

  for (const segment of [...textSegments, ...rowSegments]) {
    for (const pattern of financialFactPatterns) {
      const labelMatch = segment.text.match(pattern.label);
      if (!labelMatch) continue;
      const labelIndex = labelMatch.index || 0;
      const afterLabel = segment.text.slice(labelIndex + labelMatch[0].length);
      const beforeLabel = segment.text.slice(0, labelIndex);
      const value = afterLabel.match(pattern.value)?.[0] || beforeLabel.match(pattern.value)?.[0];
      if (!value) continue;
      facts.push({
        type: pattern.type,
        metricType: pattern.metricType,
        value,
        context: segment.context
      });
    }
  }

  return facts;
}

export function extractFacts(text, markup = "") {
  const facts = [];
  const patterns = [
    { type: "date", regex: /\b(20\d{2}|19\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/g },
    { type: "fiscal_year", regex: /\bFY\s?20\d{2}\b/gi },
    { type: "money", regex: /(?:\bUS\$|\$)\s?\d+(?:\.\d+)?\s?(?:billion|million|bn|m)?\b/gi },
    { type: "percentage", regex: /\b\d+(?:\.\d+)?%/g },
    { type: "ticker", regex: /\b[A-Z]{1,5}:(?:[A-Z]{1,6})\b/g }
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.regex)) {
      facts.push({
        type: pattern.type,
        value: match[0],
        context: contextAround(text, match.index || 0, match[0].length)
      });
    }
  }

  facts.push(...extractFinancialFacts(text, markup));

  for (const row of parseTableRows(markup)) {
    facts.push({
      type: "table_row",
      value: row.slice(0, 240),
      context: "html_table"
    });
  }

  return uniqueFacts(facts).slice(0, 80);
}

function metadataFacts(document, rssItems) {
  const facts = [];
  const fetchedDate = String(document.fetchedAt || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (fetchedDate) {
    facts.push({
      type: "fetched_date",
      value: fetchedDate,
      context: "raw_document.fetchedAt"
    });
  }
  for (const item of rssItems || []) {
    facts.push({
      type: "rss_item",
      value: item.title,
      context: [item.publishedAt, item.link].filter(Boolean).join(" / ")
    });
  }
  return facts;
}

export function parseDocument(document, watchlistItem, generatedAt) {
  const format = detectFormat(document);
  const sourceParsed = document.parseStatus === "parsed";
  const markup = rawMarkup(document);
  const text = payloadText(document);
  const extractionHints = sourceParsed ? watchlistItem?.extractionHints || document.payload?.extractionHints || [] : [];
  const parserStatus = sourceParsed && text ? "parsed" : sourceParsed ? "empty" : "skipped";
  const rssItems = parserStatus === "parsed" && format === "rss" ? parseRssItems(markup, document.url) : [];
  const sections =
    parserStatus !== "parsed" ? [] : format === "rss" ? parseRssSections(document) : format === "html" ? parseHtmlSections(document) : [
      {
        heading: document.title || document.payload?.title || `${format.toUpperCase()} document`,
        text
      }
    ];
  const links = parserStatus === "parsed" ? extractLinks(markup, document.url) : [];
  const jsonSummary = format === "json" && parserStatus === "parsed" ? parseJsonPayload(document) : null;
  const facts = parserStatus === "parsed" ? uniqueFacts([...extractFacts(text, markup), ...metadataFacts(document, rssItems)]) : [];
  const tableRows = parserStatus === "parsed" ? parseTableRows(markup) : [];
  const financialFacts = facts.filter((fact) => String(fact.type || "").startsWith("financial_"));

  return {
    id: stableId("parsed", document.id),
    rawDocumentId: document.id,
    watchlistId: watchlistItem?.id || document.payload?.watchlistId || null,
    entityId: document.entityId,
    connector: document.connector,
    parser: "built_in_structured_parser",
    parserStatus,
    parsedAt: generatedAt,
    format,
    contentHash: document.contentHash,
    title: document.title || document.payload?.title || "",
    canonicalUrl: document.url,
    publisher: document.publisher || watchlistItem?.publisher || "",
    text,
    sections,
    links,
    facts,
    extractionHints,
    jsonSummary,
    quality: {
      sourceParsed,
      hasText: Boolean(text),
      textLength: text.length,
      sectionCount: sections.length,
      linkCount: links.length,
      factCount: facts.length,
      financialFactCount: financialFacts.length,
      hintCount: extractionHints.length,
      rssItemCount: rssItems.length,
      tableRowCount: tableRows.length,
      requiresPdfParser: format === "pdf",
      requiresHumanReview: extractionHints.length > 0
    }
  };
}
