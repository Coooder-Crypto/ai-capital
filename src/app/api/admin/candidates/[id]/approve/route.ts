import { isAdminReviewResponse, requireAdminReview } from "@/lib/admin-auth";
import { reviewCandidateRelationship } from "@/lib/repository";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdminReview(request, { roles: ["admin", "reviewer"] });
  if (isAdminReviewResponse(auth)) return auth;

  const { id } = await params;
  const result = await reviewCandidateRelationship(id, "approve", auth.actor);

  if (!result) {
    return Response.json({ error: "Candidate not found" }, { status: 404 });
  }

  return Response.json({
    data: result.data,
    auditLogEntry: result.auditLogEntry,
    meta: {
      dataSource: result.dataSource,
      action: "approve"
    }
  });
}
