import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildProductionReleaseChecklist } from "./lib/production-release-checklist.mjs";

const rootDir = new URL("../", import.meta.url).pathname;
const artifactDirArg = process.argv.find((arg) => arg.startsWith("--dir="))?.split("=")[1];
const artifactDir = artifactDirArg
  ? path.resolve(rootDir, artifactDirArg)
  : path.resolve(rootDir, "data/research/p0-p3-production-readiness-report-artifact");
const evidenceFileName = "p0-p3-production-readiness-report.json";
const matrixFileName = "p0-p3-completion-matrix.json";
const checklistFileName = "p0-p3-production-release-checklist.json";
const optionalMetadataFileName = "run-metadata.json";
const allowedArtifactFileNames = new Set([evidenceFileName, matrixFileName, checklistFileName, optionalMetadataFileName]);
const errors = [];
const warnings = [];

function findFilesNamed(dir, fileName) {
  const matches = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      matches.push(...findFilesNamed(fullPath, fileName));
    } else if (entry.isFile() && entry.name === fileName) {
      matches.push(fullPath);
    }
  }
  return matches;
}

function findAllFiles(dir) {
  const matches = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      matches.push(...findAllFiles(fullPath));
    } else if (entry.isFile()) {
      matches.push(fullPath);
    }
  }
  return matches;
}

function readJsonFile(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    errors.push(`production artifact ${label} must be valid JSON`);
    return null;
  }
}

function countCategories(items) {
  return items.reduce((counts, item) => {
    counts[item.category] = (counts[item.category] || 0) + 1;
    return counts;
  }, {});
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

let evidencePath = null;
let matrixPath = null;
let checklistPath = null;
let metadataPath = null;
if (!fs.existsSync(artifactDir)) {
  errors.push(`production artifact directory does not exist: ${artifactDirArg || "data/research/p0-p3-production-readiness-report-artifact"}`);
} else if (!fs.statSync(artifactDir).isDirectory()) {
  errors.push(`production artifact path must be a directory: ${artifactDirArg || artifactDir}`);
} else {
  const allFiles = findAllFiles(artifactDir);
  const unexpectedFiles = allFiles.filter((filePath) => !allowedArtifactFileNames.has(path.basename(filePath)));
  if (unexpectedFiles.length) {
    errors.push("production artifact contains unexpected files; use a fresh artifact directory with only the readiness artifact JSON files and optional run-metadata.json");
  }
  const metadataMatches = allFiles.filter((filePath) => path.basename(filePath) === optionalMetadataFileName);
  if (metadataMatches.length > 1) {
    errors.push("production artifact contains multiple run-metadata.json files");
  } else if (metadataMatches.length === 1) {
    metadataPath = metadataMatches[0];
    readJsonFile(metadataPath, "run metadata");
  }

  const evidenceMatches = findFilesNamed(artifactDir, evidenceFileName);
  if (evidenceMatches.length === 0) {
    errors.push(`production artifact is missing ${evidenceFileName}`);
  } else if (evidenceMatches.length > 1) {
    errors.push(`production artifact contains multiple ${evidenceFileName} files`);
  } else {
    evidencePath = evidenceMatches[0];
    const result = spawnSync("node", ["scripts/validate-production-evidence.mjs", `--file=${evidencePath}`, "--require"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: "pipe"
    });
    if (result.status !== 0) {
      errors.push("production artifact evidence validation failed");
      if (result.stdout) warnings.push(result.stdout.trim());
      if (result.stderr) warnings.push(result.stderr.trim());
    }
  }

  const matrixMatches = findFilesNamed(artifactDir, matrixFileName);
  if (matrixMatches.length === 0) {
    errors.push(`production artifact is missing ${matrixFileName}`);
  } else if (matrixMatches.length > 1) {
    errors.push(`production artifact contains multiple ${matrixFileName} files`);
  } else {
    matrixPath = matrixMatches[0];
  }

  const checklistMatches = findFilesNamed(artifactDir, checklistFileName);
  if (checklistMatches.length === 0) {
    errors.push(`production artifact is missing ${checklistFileName}`);
  } else if (checklistMatches.length > 1) {
    errors.push(`production artifact contains multiple ${checklistFileName} files`);
  } else {
    checklistPath = checklistMatches[0];
  }

  if (matrixPath && checklistPath) {
    const matrix = readJsonFile(matrixPath, "completion matrix");
    const checklist = readJsonFile(checklistPath, "release checklist");
    if (matrix && checklist) {
      const externalPending = matrix.externalPending || [];
      const checklistItems = checklist.items || [];
      const checklistPending = checklistItems.map((item) => item.description);
      if (matrix.status === "complete") {
        errors.push("production artifact completion matrix must not be complete before validate:production-completion verifies GitHub run metadata");
      }
      if (checklist.schemaVersion !== 2) errors.push("production artifact release checklist schemaVersion must be 2");
      if (checklist.sourceMatrix !== "data/research/p0-p3-completion-matrix.json") {
        errors.push("production artifact release checklist sourceMatrix must reference p0-p3-completion-matrix.json");
      }
      if (checklist.matrixStatus !== matrix.status) {
        errors.push("production artifact release checklist matrixStatus must match completion matrix status");
      }
      if (checklist.sourceMatrixGeneratedAt !== matrix.generatedAt) {
        errors.push("production artifact release checklist sourceMatrixGeneratedAt must match completion matrix generatedAt");
      }
      if (checklist.pendingCount !== externalPending.length) {
        errors.push("production artifact release checklist pendingCount must match completion matrix externalPending length");
      }
      if (!sameJson(checklistPending, externalPending)) {
        errors.push("production artifact release checklist items must match completion matrix externalPending items");
      }
      if (!sameJson(checklist.categories || {}, countCategories(checklistItems))) {
        errors.push("production artifact release checklist categories must match checklist items");
      }
      const malformedItems = checklistItems.filter((item, index) => {
        const expectedId = `p0p3-prod-${String(index + 1).padStart(2, "0")}`;
        return (
          item.id !== expectedId ||
          item.status !== "pending_external" ||
          typeof item.category !== "string" ||
          item.category.length === 0 ||
          typeof item.proof !== "string" ||
          item.proof.length === 0
        );
      });
      if (malformedItems.length) {
        errors.push("production artifact release checklist items must include sequential id, pending_external status, category, and proof");
      }
      const missingCommandItems = checklistItems.filter((item) => !item.command);
      if (missingCommandItems.length) {
        errors.push("production artifact release checklist items must include command");
      }
      const missingCommandsItems = checklistItems.filter(
        (item) =>
          !Array.isArray(item.commands) ||
          item.commands.length === 0 ||
          item.commands.some((command) => typeof command !== "string" || command.length === 0)
      );
      if (missingCommandsItems.length) {
        errors.push("production artifact release checklist items must include executable commands[]");
      }
      const mismatchedCommandItems = checklistItems.filter(
        (item) => Array.isArray(item.commands) && item.commands.length > 0 && item.command !== item.commands[0]
      );
      if (mismatchedCommandItems.length) {
        errors.push("production artifact release checklist item command must match commands[0]");
      }
      if (!Number.isFinite(Date.parse(checklist.generatedAt || ""))) {
        errors.push("production artifact release checklist generatedAt must be an ISO timestamp");
      } else {
        const expectedChecklist = buildProductionReleaseChecklist(matrix, { generatedAt: checklist.generatedAt });
        if (!sameJson(checklist, expectedChecklist)) {
          errors.push("production artifact release checklist must match generated checklist for completion matrix");
        }
      }
    }
  }
}

const status = {
  ok: errors.length === 0,
  artifactDir: artifactDirArg || "data/research/p0-p3-production-readiness-report-artifact",
  evidence: evidencePath ? path.relative(rootDir, evidencePath) : null,
  matrix: matrixPath ? path.relative(rootDir, matrixPath) : null,
  checklist: checklistPath ? path.relative(rootDir, checklistPath) : null,
  runMetadata: metadataPath ? path.relative(rootDir, metadataPath) : null,
  warnings,
  errors
};

console.log(JSON.stringify(status, null, 2));
if (errors.length) process.exit(1);
