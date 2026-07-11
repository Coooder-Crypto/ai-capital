import { readGraphSnapshot } from "@/lib/research-artifacts";

export async function GET() {
  const snapshot = await readGraphSnapshot();

  return Response.json({
    data: snapshot,
    meta: {
      artifact: "data/research/graph-snapshot.json"
    }
  });
}
