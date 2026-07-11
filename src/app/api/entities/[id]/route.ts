import { getEntityDetail } from "@/lib/repository";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getEntityDetail(id);

  if (!detail) {
    return Response.json({ error: "Entity not found" }, { status: 404 });
  }

  return Response.json({
    data: {
      entity: detail.entity,
      layer: detail.layer,
      metrics: detail.metrics,
      metricFailures: detail.metricFailures,
      relationships: detail.relationships,
      relatedEntities: detail.relatedEntities,
      recentResearchEvents: detail.recentResearchEvents,
      sources: detail.sources
    },
    meta: {
      dataSource: detail.dataSource,
      redirectedFrom: detail.redirectedFrom,
      redirectedTo: detail.redirectedTo
    }
  });
}
