import { searchEntities } from "@/lib/repository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("query") || searchParams.get("q") || "").trim().toLowerCase();
  const type = searchParams.get("type") || "";
  const layer = searchParams.get("layer") || "";
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 50), 1), 500);
  const results = await searchEntities({ query, type, layer, limit });

  return Response.json({
    data: results.data,
    count: results.count,
    total: results.total,
    limit,
    meta: {
      dataSource: results.dataSource
    }
  });
}
