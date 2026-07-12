import fs from "node:fs";

const args = new Set(process.argv.slice(2));
const requireProduction = args.has("--require-production");
const allowLocalServices = args.has("--allow-local-services");
const root = new URL("../", import.meta.url);
const envExampleText = fs.readFileSync(new URL(".env.example", root), "utf8");

function parseEnvExample(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

function valueFor(key) {
  return process.env[key]?.trim() || "";
}

function exampleValue(key) {
  return exampleValues.get(key)?.trim() || "";
}

function hasAny(keys) {
  return keys.some((key) => Boolean(valueFor(key)));
}

function isPositiveInteger(value) {
  return /^\d+$/.test(value) && Number(value) > 0;
}

function isNonNegativeInteger(value) {
  return /^\d+$/.test(value) && Number(value) >= 0;
}

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function isLocalServiceHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

const exampleValues = parseEnvExample(envExampleText);
const errors = [];
const warnings = [];

const documentedVariables = [
  "DATABASE_URL",
  "AI_CAPITAL_REQUIRE_DB",
  "ADMIN_REVIEW_TOKEN",
  "ADMIN_REVIEW_ACTOR",
  "ADMIN_REVIEW_ADMIN_TOKEN",
  "ADMIN_REVIEW_ADMIN_ACTOR",
  "ADMIN_REVIEW_REVIEWER_TOKEN",
  "ADMIN_REVIEW_REVIEWER_ACTOR",
  "ADMIN_REVIEW_SESSION_SECRET",
  "ADMIN_REVIEW_ADMIN_USERNAME",
  "ADMIN_REVIEW_ADMIN_PASSWORD",
  "ADMIN_REVIEW_REVIEWER_USERNAME",
  "ADMIN_REVIEW_REVIEWER_PASSWORD",
  "LLM_EXTRACT_COMMAND",
  "LLM_EXTRACT_URL",
  "LLM_EXTRACT_API_KEY",
  "LLM_EXTRACT_MODEL",
  "LLM_EXTRACT_RPM",
  "LLM_EXTRACT_MIN_INTERVAL_MS",
  "LLM_EXTRACT_MAX_RETRIES",
  "LLM_EXTRACT_RETRY_BASE_MS",
  "FREE_METRICS_TIMEOUT_MS",
  "SEC_USER_AGENT",
  "METRIC_OVERRIDES_PATH",
  "DB_BOOTSTRAP_TIMEOUT_MS",
  "DB_NATIVE_STATE_DIR",
  "DB_NATIVE_DATA_DIR",
  "DB_NATIVE_LOG_PATH",
  "DB_NATIVE_HOST",
  "DB_NATIVE_PORT",
  "DB_NATIVE_DATABASE",
  "DB_NATIVE_USER",
  "DB_NATIVE_PASSWORD"
];

for (const key of documentedVariables) {
  if (!exampleValues.has(key)) addError(`.env.example missing ${key}`);
}

const booleanValues = new Set(["0", "1"]);
const requireDb = valueFor("AI_CAPITAL_REQUIRE_DB") || exampleValue("AI_CAPITAL_REQUIRE_DB");
if (requireDb && !booleanValues.has(requireDb)) addError("AI_CAPITAL_REQUIRE_DB must be 0 or 1");

for (const key of ["LLM_EXTRACT_RPM", "LLM_EXTRACT_RETRY_BASE_MS", "FREE_METRICS_TIMEOUT_MS", "DB_BOOTSTRAP_TIMEOUT_MS", "DB_NATIVE_PORT"]) {
  const value = valueFor(key) || exampleValue(key);
  if (value && !isPositiveInteger(value)) addError(`${key} must be a positive integer`);
}

for (const key of ["LLM_EXTRACT_MIN_INTERVAL_MS", "LLM_EXTRACT_MAX_RETRIES"]) {
  const value = valueFor(key) || exampleValue(key);
  if (value && !isNonNegativeInteger(value)) addError(`${key} must be a non-negative integer`);
}

const databaseUrl = valueFor("DATABASE_URL") || exampleValue("DATABASE_URL");
let parsedDatabaseUrl = null;
if (databaseUrl) {
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)) {
      addError("DATABASE_URL must use postgres:// or postgresql://");
    }
  } catch {
    addError("DATABASE_URL must be a valid URL");
  }
}

const configuredAdminAuth =
  hasAny(["ADMIN_REVIEW_TOKEN"]) ||
  (hasAny(["ADMIN_REVIEW_ADMIN_TOKEN"]) && hasAny(["ADMIN_REVIEW_REVIEWER_TOKEN"])) ||
  (hasAny(["ADMIN_REVIEW_SESSION_SECRET"]) &&
    hasAny(["ADMIN_REVIEW_ADMIN_PASSWORD"]) &&
    hasAny(["ADMIN_REVIEW_REVIEWER_PASSWORD"]));
const configuredProductionAdminSessionAuth =
  hasAny(["ADMIN_REVIEW_SESSION_SECRET"]) &&
  hasAny(["ADMIN_REVIEW_ADMIN_PASSWORD"]) &&
  hasAny(["ADMIN_REVIEW_REVIEWER_PASSWORD"]);

const configuredProductionLlm = hasAny(["LLM_EXTRACT_URL"]);
const configuredAnyExternalLlm = configuredProductionLlm || hasAny(["LLM_EXTRACT_COMMAND"]);
let parsedLlmUrl = null;
if (valueFor("LLM_EXTRACT_URL")) {
  try {
    parsedLlmUrl = new URL(valueFor("LLM_EXTRACT_URL"));
  } catch {
    addError("LLM_EXTRACT_URL must be a valid URL");
  }
}
if (valueFor("LLM_EXTRACT_URL") && !valueFor("LLM_EXTRACT_API_KEY")) {
  addWarning("LLM_EXTRACT_URL is set without LLM_EXTRACT_API_KEY; only use this for trusted internal gateways.");
}

if (requireProduction) {
  if (!valueFor("DATABASE_URL")) addError("DATABASE_URL is required for production readiness");
  if (!allowLocalServices && parsedDatabaseUrl && isLocalServiceHost(parsedDatabaseUrl.hostname)) {
    addError("production readiness requires DATABASE_URL to point to a non-localhost PostgreSQL service");
  }
  if (!configuredProductionAdminSessionAuth) {
    addError(
      "production readiness requires ADMIN_REVIEW_SESSION_SECRET, ADMIN_REVIEW_ADMIN_PASSWORD, and ADMIN_REVIEW_REVIEWER_PASSWORD"
    );
  }
  if (!configuredProductionLlm) addError("production readiness requires LLM_EXTRACT_URL");
  if (!allowLocalServices && parsedLlmUrl && isLocalServiceHost(parsedLlmUrl.hostname)) {
    addError("production readiness requires LLM_EXTRACT_URL to point to a non-localhost HTTP gateway");
  }
  if (!valueFor("LLM_EXTRACT_API_KEY")) addError("LLM_EXTRACT_API_KEY is required for production readiness");
} else {
  if (!configuredAdminAuth) addWarning("admin review authentication is not configured in this environment");
  if (!configuredAnyExternalLlm) addWarning("external LLM provider is not configured in this environment");
}

const status = {
  ok: errors.length === 0,
  requireProduction,
  allowLocalServices,
  documentedVariables: documentedVariables.length,
  configured: {
    databaseUrl: Boolean(valueFor("DATABASE_URL")),
    adminAuth: configuredAdminAuth,
    productionAdminSessionAuth: configuredProductionAdminSessionAuth,
    productionLlm: configuredProductionLlm,
    httpLlm: Boolean(valueFor("LLM_EXTRACT_URL")),
    commandLlm: Boolean(valueFor("LLM_EXTRACT_COMMAND"))
  },
  warnings,
  errors
};

console.log(JSON.stringify(status, null, 2));

if (errors.length) process.exit(1);
