const extractionSystemPrompt = `You extract candidate facts for the AI Capital industry graph.
Return only one JSON object with this shape:
{
  "provider": "openai_compatible",
  "model": "model id",
  "relationships": [{"sourceEntityId":"id","targetEntityId":"id","relationType":"type","confidence":0.0,"evidenceUrl":"url","note":"text"}],
  "metrics": [{"entityId":"id","metricType":"type","valueNumber":null,"valueText":"text","asOfDate":"YYYY-MM-DD","sourceId":"src_manual","sourceRef":"url","confidence":0.0,"evidenceUrl":"url","note":"text"}],
  "entities": []
}
Use only entity IDs, relation types, metric types, evidence URLs, and facts explicitly allowed by the user prompt.
Use empty arrays when evidence is insufficient. Never invent identifiers or facts.`;

export function isOpenAiChatEndpoint(url) {
  try {
    return new URL(url).pathname.replace(/\/+$/, "").endsWith("/chat/completions");
  } catch {
    return false;
  }
}

export function buildOpenAiChatRequest(request) {
  return {
    model: request.model,
    messages: [
      { role: "system", content: extractionSystemPrompt },
      { role: "user", content: request.prompt }
    ],
    response_format: { type: "json_object" },
    stream: false,
    temperature: 0,
    max_tokens: 4096
  };
}

export function parseOpenAiChatResponse(response, fallbackModel) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI-compatible provider response is missing choices[0].message.content.");
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`OpenAI-compatible provider returned invalid JSON content: ${error.message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("OpenAI-compatible provider content must decode to a JSON object.");
  }

  return {
    ...parsed,
    provider: parsed.provider || "openai_compatible",
    model: response.model || parsed.model || fallbackModel
  };
}
