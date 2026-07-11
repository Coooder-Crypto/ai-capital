import { isAdminReviewResponse, requireAdminReview } from "@/lib/admin-auth";
import { mergeCandidateEntity } from "@/lib/repository";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdminReview(request, { roles: ["admin"] });
  if (isAdminReviewResponse(auth)) return auth;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const targetEntityId = typeof body.targetEntityId === "string" ? body.targetEntityId : "";
  const targetCandidateEntityId = typeof body.targetCandidateEntityId === "string" ? body.targetCandidateEntityId : "";
  const fieldPolicy =
    body.fieldPolicy && typeof body.fieldPolicy === "object" && !Array.isArray(body.fieldPolicy)
      ? (body.fieldPolicy as Record<string, unknown>)
      : undefined;
  if (!targetEntityId && !targetCandidateEntityId) {
    return Response.json({ error: "targetEntityId or targetCandidateEntityId is required" }, { status: 400 });
  }

  const result = await mergeCandidateEntity(id, { targetEntityId, targetCandidateEntityId, fieldPolicy }, auth.actor);

  if (!result) {
    return Response.json({ error: "Candidate entity not found" }, { status: 404 });
  }

  return Response.json({
    data: result.data,
    auditLogEntry: result.auditLogEntry,
    meta: {
      dataSource: result.dataSource,
      action: "merge"
    }
  });
}
