import { buildVisibleGraph } from "@/lib/graph";
import { getGraphSeedData, resolvePublicEntityId } from "@/lib/repository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const graphSeed = await getGraphSeedData();
  const seed = graphSeed.seed;
  const requestedEntity = searchParams.get("entity") || "openai";
  const resolvedEntity = await resolvePublicEntityId(requestedEntity);
  const selectedId = seed.entities.some((entity) => entity.id === resolvedEntity) ? resolvedEntity : "openai";
  const redirected = resolvedEntity !== requestedEntity && selectedId === resolvedEntity;
  const requestedDepth = searchParams.get("depth") || "1";
  const depth = ["1", "2", "all"].includes(requestedDepth) ? requestedDepth : "1";
  const requestedConfidence = Number(searchParams.get("minConfidence") || "0.6");
  const minConfidence =
    Number.isFinite(requestedConfidence) && requestedConfidence >= 0 && requestedConfidence <= 1
      ? requestedConfidence
      : 0.6;
  const requestedRelationType = searchParams.get("relationType") || searchParams.get("type") || "all";
  const relationType =
    requestedRelationType === "all" || Object.prototype.hasOwnProperty.call(seed.relationLabels, requestedRelationType)
      ? requestedRelationType
      : "all";

  const graph = buildVisibleGraph(seed, {
    selectedId,
    depth,
    minConfidence,
    relationType
  });

  return Response.json({
    data: graph,
    meta: {
      dataSource: graphSeed.dataSource,
      selectedId,
      redirectedFrom: redirected ? requestedEntity : undefined,
      redirectedTo: redirected ? selectedId : undefined,
      depth,
      minConfidence,
      relationType,
      capped: depth === "all" && graph.edges.length < seed.relationships.length
    }
  });
}
