import { listCandidateRelationships } from "@/lib/repository";
import type { CandidateRelationship } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedStatus = searchParams.get("status") || "candidate";
  const status: CandidateRelationship["status"] | "all" = ["candidate", "approved", "rejected", "all"].includes(
    requestedStatus
  )
    ? (requestedStatus as CandidateRelationship["status"] | "all")
    : "candidate";
  const result = await listCandidateRelationships(status);

  return Response.json({
    data: result.data,
    auditLog: result.auditLog,
    meta: {
      dataSource: result.dataSource,
      status
    }
  });
}
