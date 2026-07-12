import { listCandidateEntities } from "@/lib/repository";
import type { CandidateEntity } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedStatus = searchParams.get("status") || "candidate";
  const status: CandidateEntity["status"] | "all" = ["candidate", "approved", "rejected", "all"].includes(
    requestedStatus
  )
    ? (requestedStatus as CandidateEntity["status"] | "all")
    : "candidate";
  const result = await listCandidateEntities(status);

  return Response.json({
    data: result.data,
    auditLog: result.auditLog,
    meta: {
      dataSource: result.dataSource,
      status
    }
  });
}
