import http from "node:http";

const portArg = process.argv.find((arg) => arg.startsWith("--port="))?.split("=")[1];
const requireToken = process.argv.find((arg) => arg.startsWith("--require-token="))?.split("=")[1] || "";
const port = Number.isFinite(Number(portArg)) ? Number(portArg) : 55991;

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body exceeds 1MB fixture limit."));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function extractFixtureResult(request) {
  const prompt = String(request.prompt || "");
  const relationMatch = prompt.match(/\b(partners_with|supplies_to|integrates_with)\s+([a-z0-9_]+)/i);
  const metricMatch = prompt.match(/\b(researchWorksMentioningEntity)\b/);
  const relationships = relationMatch
    ? [
        {
          sourceEntityId: request.entityId,
          targetEntityId: relationMatch[2],
          relationType: relationMatch[1],
          confidence: 0.65,
          evidenceUrl: request.evidenceUrl,
          note: "HTTP fixture extracted relationship from prompt text; requires human review."
        }
      ]
    : [];
  const metrics = metricMatch
    ? [
        {
          entityId: request.entityId,
          metricType: metricMatch[1],
          valueNumber: null,
          valueText: "review_required",
          asOfDate: new Date().toISOString().slice(0, 10),
          sourceId: "src_openalex",
          sourceRef: request.evidenceUrl,
          confidence: 0.61,
          evidenceUrl: request.evidenceUrl,
          note: "HTTP fixture extracted metric from prompt text; requires human review."
        }
      ]
    : [];

  return {
    provider: "http_fixture",
    model: request.model || "local-http-fixture",
    relationships,
    metrics,
    entities: []
  };
}

function openAiFixtureRequest(request) {
  const prompt = request?.messages?.find((message) => message.role === "user")?.content || "";
  return {
    task: "ai_capital_extract_candidates",
    schemaVersion: 1,
    entityId: "openai",
    evidenceUrl: "https://example.com/openai-compatible-fixture",
    prompt,
    model: request.model
  };
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method !== "POST") {
      response.writeHead(405, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "method_not_allowed" }));
      return;
    }
    if (requireToken && request.headers.authorization !== `Bearer ${requireToken}`) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    const body = await readRequestBody(request);
    const parsed = JSON.parse(body || "{}");
    const openAiCompatible = request.url?.replace(/\/+$/, "").endsWith("/v1/chat/completions");
    if (openAiCompatible) {
      const result = extractFixtureResult(openAiFixtureRequest(parsed));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          model: parsed.model,
          choices: [{ message: { role: "assistant", content: JSON.stringify(result) } }]
        })
      );
      return;
    }
    if (parsed.task !== "ai_capital_extract_candidates" || parsed.schemaVersion !== 1) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "invalid_request_schema" }));
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: extractFixtureResult(parsed) }));
  } catch (error) {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`LLM HTTP fixture listening on http://127.0.0.1:${port}`);
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
