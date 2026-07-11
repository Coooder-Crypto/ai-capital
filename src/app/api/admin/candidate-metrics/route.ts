import { listCandidateMetrics } from "@/lib/repository";
import type { CandidateMetric } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedStatus = searchParams.get("status") || "candidate";
  const status: CandidateMetric["status"] | "all" = ["candidate", "approved", "rejected", "all"].includes(
    requestedStatus
  )
    ? (requestedStatus as CandidateMetric["status"] | "all")
    : "candidate";
  const result = await listCandidateMetrics(status);

  return Response.json({
    data: result.data,
    auditLog: result.auditLog,
    meta: {
      dataSource: result.dataSource,
      status
    }
  });
}
