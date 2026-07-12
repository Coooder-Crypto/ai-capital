import { isAdminReviewResponse, requireAdminReview } from "@/lib/admin-auth";
import { updateCandidateMetric } from "@/lib/repository";
import type { CandidateMetricPatch } from "@/lib/types";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdminReview(request, { roles: ["admin"] });
  if (isAdminReviewResponse(auth)) return auth;

  const { id } = await params;
  const body = (await request.json()) as CandidateMetricPatch;
  const result = await updateCandidateMetric(id, body, auth.actor);

  if (!result) {
    return Response.json({ error: "Candidate metric not found" }, { status: 404 });
  }

  return Response.json({
    data: result.data,
    auditLogEntry: result.auditLogEntry,
    meta: {
      dataSource: result.dataSource,
      action: "update"
    }
  });
}
