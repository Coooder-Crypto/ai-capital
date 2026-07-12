import { spawn } from "node:child_process";
import {
  buildOpenAiChatRequest,
  isOpenAiChatEndpoint,
  parseOpenAiChatResponse
} from "./lib/openai-chat-adapter.mjs";

const providerArg = process.argv.find((arg) => arg.startsWith("--provider="))?.split("=")[1];
const requiredProvider = process.argv.find((arg) => arg.startsWith("--require-provider="))?.split("=")[1];
const timeoutMsArg = process.argv.find((arg) => arg.startsWith("--timeout-ms="))?.split("=")[1];
const timeoutMs = Number.isFinite(Number(timeoutMsArg)) ? Number(timeoutMsArg) : 5000;
const provider =
  providerArg || (process.env.LLM_EXTRACT_URL ? "http" : process.env.LLM_EXTRACT_COMMAND ? "command" : "fixture");

const sampleRequest = {
  task: "ai_capital_extract_candidates",
  schemaVersion: 1,
  recordId: "status_probe",
  entityId: "openai",
  evidenceUrl: "https://example.com/status-probe",
  prompt:
    'Connectivity and schema probe only. Return exactly {"provider":"status_probe","model":"status-probe-model","relationships":[],"metrics":[],"entities":[]}. Do not extract candidates.',
  parsedDocumentId: "parsed_status_probe",
  rawDocumentId: "raw_status_probe",
  model: process.env.LLM_EXTRACT_MODEL || "status-probe-model"
};

function validateResultShape(result) {
  const data = result && typeof result === "object" && result.data ? result.data : result;
  const errors = [];
  if (!data || typeof data !== "object") errors.push("response must be a JSON object");
  if (!Array.isArray(data?.relationships)) errors.push("relationships must be an array");
  if (!Array.isArray(data?.metrics)) errors.push("metrics must be an array");
  if (!Array.isArray(data?.entities)) errors.push("entities must be an array");
  for (const relationship of data?.relationships || []) {
    for (const field of ["sourceEntityId", "targetEntityId", "relationType", "evidenceUrl"]) {
      if (!relationship[field]) errors.push(`relationship missing ${field}`);
    }
  }
  for (const metric of data?.metrics || []) {
    for (const field of ["entityId", "metricType", "evidenceUrl"]) {
      if (!metric[field]) errors.push(`metric missing ${field}`);
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    provider: data?.provider || null,
    model: data?.model || null,
    relationshipCount: data?.relationships?.length || 0,
    metricCount: data?.metrics?.length || 0,
    entityCount: data?.entities?.length || 0
  };
}

function commandProbe(command) {
  return new Promise((resolve) => {
    if (!command) {
      resolve({ ok: false, error: "LLM_EXTRACT_COMMAND is not configured" });
      return;
    }

    const child = spawn(command, {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ ok: false, error: `LLM_EXTRACT_COMMAND timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve({ ok: false, error: stderr || stdout || `command exited ${code}` });
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(validateResultShape(parsed));
      } catch (error) {
        resolve({ ok: false, error: `invalid JSON: ${error.message}` });
      }
    });
    child.stdin.end(`${JSON.stringify(sampleRequest)}\n`);
  });
}

async function httpProbe(url, apiKey) {
  if (!url) return { ok: false, error: "LLM_EXTRACT_URL is not configured" };
  const openAiCompatible = isOpenAiChatEndpoint(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify(openAiCompatible ? buildOpenAiChatRequest(sampleRequest) : sampleRequest),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}: ${text}` };
    try {
      const parsed = JSON.parse(text);
      return validateResultShape(
        openAiCompatible ? parseOpenAiChatResponse(parsed, sampleRequest.model) : parsed
      );
    } catch (error) {
      return { ok: false, error: `invalid JSON: ${error.message}` };
    }
  } catch (error) {
    return { ok: false, error: error.name === "AbortError" ? `timeout after ${timeoutMs}ms` : error.message };
  } finally {
    clearTimeout(timer);
  }
}

let probe;
if (provider === "fixture") {
  probe = {
    ok: true,
    provider: "fixture",
    model: "local-schema-fixture",
    relationshipCount: 1,
    metricCount: 1,
    entityCount: 0
  };
} else if (provider === "command") {
  probe = await commandProbe(process.env.LLM_EXTRACT_COMMAND || "");
} else if (provider === "http") {
  probe = await httpProbe(process.env.LLM_EXTRACT_URL || "", process.env.LLM_EXTRACT_API_KEY || "");
} else {
  probe = { ok: false, error: `Unsupported provider: ${provider}` };
}

const status = {
  provider,
  requiredProvider: requiredProvider || null,
  configured: {
    command: Boolean(process.env.LLM_EXTRACT_COMMAND),
    httpUrl: Boolean(process.env.LLM_EXTRACT_URL),
    httpApiKey: Boolean(process.env.LLM_EXTRACT_API_KEY),
    httpModel: process.env.LLM_EXTRACT_MODEL || "http-extract-model",
    rpm: process.env.LLM_EXTRACT_RPM || null,
    minIntervalMs: process.env.LLM_EXTRACT_MIN_INTERVAL_MS || null,
    maxRetries: process.env.LLM_EXTRACT_MAX_RETRIES || null,
    retryBaseMs: process.env.LLM_EXTRACT_RETRY_BASE_MS || null
  },
  probe
};

console.log(JSON.stringify(status, null, 2));

if (requiredProvider && provider !== requiredProvider) {
  console.error(`Required LLM provider ${requiredProvider} is not active; current provider is ${provider}.`);
  process.exit(1);
}
if (requiredProvider && !probe.ok) {
  console.error(`Required LLM provider ${requiredProvider} is not ready.`);
  process.exit(1);
}
