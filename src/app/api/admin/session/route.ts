import {
  adminReviewAuthEnabled,
  adminReviewSessionConfigured,
  adminReviewSessionReady,
  authenticateAdminReviewCredentials,
  clearAdminReviewSessionCookie,
  createAdminReviewSessionCookie,
  getAdminReviewContext,
  publicAdminReviewContext
} from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = getAdminReviewContext(request);
  return Response.json({
    authEnabled: adminReviewAuthEnabled(),
    sessionConfigured: adminReviewSessionConfigured(),
    sessionReady: adminReviewSessionReady(),
    authenticated: Boolean(context),
    context: publicAdminReviewContext(context)
  });
}

export async function POST(request: Request) {
  if (!adminReviewSessionConfigured()) {
    return Response.json({ error: "Admin review session users are not configured" }, { status: 503 });
  }
  if (!adminReviewSessionReady()) {
    return Response.json({ error: "ADMIN_REVIEW_SESSION_SECRET is required" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
  const context = authenticateAdminReviewCredentials(body.username || "", body.password || "");
  if (!context) {
    return Response.json({ error: "Invalid admin review username or password" }, { status: 401 });
  }

  return Response.json(
    {
      authenticated: true,
      context: publicAdminReviewContext(context)
    },
    {
      headers: {
        "Set-Cookie": createAdminReviewSessionCookie(context)
      }
    }
  );
}

export async function DELETE() {
  return Response.json(
    {
      authenticated: false,
      context: null
    },
    {
      headers: {
        "Set-Cookie": clearAdminReviewSessionCookie()
      }
    }
  );
}
