import { isAdminReviewResponse, requireAdminReview } from "@/lib/admin-auth";
import { updateCandidateRelationship } from "@/lib/repository";
import type { CandidateRelationshipPatch } from "@/lib/types";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdminReview(request, { roles: ["admin"] });
  if (isAdminReviewResponse(auth)) return auth;

  const { id } = await params;
  const body = (await request.json()) as CandidateRelationshipPatch;
  const result = await updateCandidateRelationship(id, body, auth.actor);

  if (!result) {
    return Response.json({ error: "Candidate not found" }, { status: 404 });
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
