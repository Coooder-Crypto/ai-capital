import { readTimeline } from "@/lib/research-artifacts";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "all";
  const status = searchParams.get("status") || "all";
  const entity = (searchParams.get("entity") || "").trim();
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 100), 1), 500);
  const timeline = await readTimeline();
  const events = Array.isArray(timeline.events) ? timeline.events : [];
  const filteredEvents = events
    .filter((event) => (type === "all" ? true : event.type === type))
    .filter((event) => (status === "all" ? true : event.status === status))
    .filter((event) => (entity ? event.entityId === entity : true));

  return Response.json({
    data: filteredEvents.slice(0, limit),
    count: Math.min(filteredEvents.length, limit),
    total: filteredEvents.length,
    meta: {
      generatedAt: timeline.generatedAt,
      type,
      status,
      entity: entity || null,
      limit,
      artifact: "data/research/timeline.json"
    }
  });
}
