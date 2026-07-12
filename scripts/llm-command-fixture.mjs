let input = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  const request = JSON.parse(input || "{}");
  const prompt = String(request.prompt || "");
  const relationMatch = prompt.match(/\b(partners_with|supplies_to|integrates_with)\s+([a-z0-9_]+)/i);
  const metricMatch = prompt.match(/\b(researchWorksMentioningEntity)\b/);
  const relationships = relationMatch
    ? [
        {
          sourceEntityId: request.entityId,
          targetEntityId: relationMatch[2],
          relationType: relationMatch[1],
          confidence: 0.64,
          evidenceUrl: request.evidenceUrl,
          note: "Command fixture extracted relationship from prompt text; requires human review."
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
          confidence: 0.6,
          evidenceUrl: request.evidenceUrl,
          note: "Command fixture extracted metric from prompt text; requires human review."
        }
      ]
    : [];

  process.stdout.write(
    `${JSON.stringify({
      provider: "command_fixture",
      model: "local-command-fixture",
      relationships,
      metrics,
      entities: []
    })}\n`
  );
});
