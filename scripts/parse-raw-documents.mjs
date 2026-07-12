import fs from "node:fs/promises";
import { parseDocument } from "./lib/structured-parser.mjs";

const root = new URL("../", import.meta.url);
const rawDocumentsPath = new URL("data/raw-documents.json", root);
const watchlistPath = new URL("data/research-watchlist.json", root);
const parsedDocumentsPath = new URL("data/parsed-documents.json", root);

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

const rawDocumentBundle = await readJsonIfExists(rawDocumentsPath, { generatedAt: null, documents: [] });
const watchlist = await readJsonIfExists(watchlistPath, []);
const watchlistById = new Map(watchlist.map((item) => [item.id, item]));
const generatedAt = new Date().toISOString();
const documents = (rawDocumentBundle.documents || []).map((document) =>
  parseDocument(document, watchlistById.get(document.payload?.watchlistId), generatedAt)
);

const parsedBundle = {
  generatedAt,
  sourceRawDocumentsGeneratedAt: rawDocumentBundle.generatedAt,
  parser: "built_in_structured_parser",
  documents,
  summary: {
    rawDocuments: rawDocumentBundle.documents?.length || 0,
    parsedDocuments: documents.filter((document) => document.parserStatus === "parsed").length,
    emptyDocuments: documents.filter((document) => document.parserStatus === "empty").length,
    skippedDocuments: documents.filter((document) => document.parserStatus === "skipped").length,
    totalTextLength: documents.reduce((sum, document) => sum + document.quality.textLength, 0),
    totalFacts: documents.reduce((sum, document) => sum + document.quality.factCount, 0),
    totalLinks: documents.reduce((sum, document) => sum + document.quality.linkCount, 0),
    rssItems: documents.reduce((sum, document) => sum + document.quality.rssItemCount, 0),
    tableRows: documents.reduce((sum, document) => sum + document.quality.tableRowCount, 0)
  }
};

if (!dryRun) {
  await fs.writeFile(parsedDocumentsPath, `${JSON.stringify(parsedBundle, null, 2)}\n`);
}

console.log(
  JSON.stringify(
    {
      ...parsedBundle.summary,
      dryRun
    },
    null,
    2
  )
);

if (dryRun) {
  console.log("Dry run only; parsed-documents was not changed.");
}
