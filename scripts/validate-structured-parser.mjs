import assert from "node:assert/strict";
import { parseDocument } from "./lib/structured-parser.mjs";

const generatedAt = "2026-07-05T00:00:00.000Z";
const watchlistItem = {
  id: "fixture_watch",
  publisher: "Fixture Publisher",
  extractionHints: [
    {
      targetEntityId: "openai",
      relationType: "partners_with",
      confidence: 0.7,
      note: "Fixture relationship."
    }
  ]
};

const htmlDocument = parseDocument(
  {
    id: "raw_html_fixture",
    entityId: "microsoft",
    connector: "company_ir",
    parseStatus: "parsed",
    fetchedAt: generatedAt,
    contentType: "text/html",
    contentHash: "hash_html",
    title: "HTML fixture",
    url: "https://example.com/news",
    payload: {
      watchlistId: "fixture_watch",
      title: "HTML fixture",
      contentExcerpt:
        "<html><body><h1>Partnership update</h1><p>On 2026-01-02 the company announced $42 million in AI infrastructure commitments.</p><a href='/evidence'>Evidence</a><h2>Metrics</h2><table><tr><th>Metric</th><th>Value</th></tr><tr><td>GPU capacity</td><td>25%</td></tr><tr><td>Revenue</td><td>$130.5 billion</td></tr><tr><td>Gross margin</td><td>74.1%</td></tr></table></body></html>"
    }
  },
  watchlistItem,
  generatedAt
);

assert.equal(htmlDocument.format, "html");
assert.equal(htmlDocument.parserStatus, "parsed");
assert.ok(htmlDocument.sections.length >= 2, "HTML headings should become sections");
assert.ok(htmlDocument.links.some((link) => link.url === "https://example.com/evidence"), "relative links should resolve");
assert.ok(htmlDocument.facts.some((fact) => fact.type === "money"), "HTML facts should include money values");
assert.ok(htmlDocument.facts.some((fact) => fact.type === "table_row"), "HTML tables should become table_row facts");
assert.ok(htmlDocument.facts.some((fact) => fact.type === "financial_revenue" && fact.metricType === "revenue"));
assert.ok(htmlDocument.facts.some((fact) => fact.type === "financial_gross_margin" && fact.metricType === "gross_margin"));
assert.equal(htmlDocument.quality.tableRowCount, 4);
assert.equal(htmlDocument.quality.financialFactCount, 2);

const rssDocument = parseDocument(
  {
    id: "raw_rss_fixture",
    entityId: "anthropic",
    connector: "news_rss",
    parseStatus: "parsed",
    fetchedAt: generatedAt,
    contentType: "application/rss+xml",
    contentHash: "hash_rss",
    title: "RSS fixture",
    url: "https://example.com/feed.xml",
    payload: {
      watchlistId: "fixture_watch",
      contentExcerpt:
        "<rss><channel><item><title>Model availability update</title><link>https://example.com/item-1</link><pubDate>2026-01-03</pubDate><description>Cloud model availability changed.</description></item><item><title>Partner launch</title><link>https://example.com/item-2</link></item></channel></rss>"
    }
  },
  watchlistItem,
  generatedAt
);

assert.equal(rssDocument.format, "rss");
assert.equal(rssDocument.sections.length, 2);
assert.equal(rssDocument.quality.rssItemCount, 2);
assert.ok(rssDocument.facts.some((fact) => fact.type === "rss_item" && fact.value === "Model availability update"));

const pdfDocument = parseDocument(
  {
    id: "raw_pdf_fixture",
    entityId: "nvidia",
    connector: "company_ir",
    parseStatus: "parsed",
    fetchedAt: generatedAt,
    contentType: "application/pdf",
    contentHash: "hash_pdf",
    title: "PDF fixture",
    url: "https://example.com/report.pdf",
    payload: {
      watchlistId: "fixture_watch",
      textPreview:
        "FY2026 AI infrastructure revenue increased 12%. Revenue was $12.4 billion; operating margin was 31%; capital expenditures were $2.1 billion; R&D was $950 million."
    }
  },
  watchlistItem,
  generatedAt
);

assert.equal(pdfDocument.format, "pdf");
assert.equal(pdfDocument.quality.requiresPdfParser, true);
assert.ok(pdfDocument.facts.some((fact) => fact.type === "fiscal_year"));
assert.ok(pdfDocument.facts.some((fact) => fact.type === "percentage"));
assert.ok(pdfDocument.facts.some((fact) => fact.type === "financial_revenue"));
assert.ok(pdfDocument.facts.some((fact) => fact.type === "financial_operating_margin"));
assert.ok(pdfDocument.facts.some((fact) => fact.type === "financial_capex"));
assert.ok(pdfDocument.facts.some((fact) => fact.type === "financial_research_and_development"));
assert.equal(pdfDocument.quality.financialFactCount, 4);

console.log("Structured parser fixture validation passed");
