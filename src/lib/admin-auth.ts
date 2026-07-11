import crypto from "node:crypto";

export type AdminReviewRole = "admin" | "reviewer";

export type AdminReviewContext = {
  actor: string;
  role: AdminReviewRole;
  tokenSource: string;
};

type AdminReviewTokenConfig = AdminReviewContext & {
  token: string;
};

type AdminReviewSessionUserConfig = AdminReviewContext & {
  username: string;
  password: string;
};

const adminReviewSessionCookie = "ai_capital_admin_session";
const adminReviewSessionMaxAgeSeconds = 8 * 60 * 60;

export function adminReviewAuthEnabled() {
  return configuredReviewTokens().length > 0 || configuredSessionUsers().length > 0;
}

function configuredReviewTokens() {
  const tokens: AdminReviewTokenConfig[] = [];
  const legacyToken = process.env.ADMIN_REVIEW_TOKEN?.trim();
  const adminToken = process.env.ADMIN_REVIEW_ADMIN_TOKEN?.trim();
  const reviewerToken = process.env.ADMIN_REVIEW_REVIEWER_TOKEN?.trim();

  if (legacyToken) {
    tokens.push({
      token: legacyToken,
      actor: process.env.ADMIN_REVIEW_ACTOR?.trim() || "local-admin",
      role: "admin",
      tokenSource: "ADMIN_REVIEW_TOKEN"
    });
  }
  if (adminToken) {
    tokens.push({
      token: adminToken,
      actor: process.env.ADMIN_REVIEW_ADMIN_ACTOR?.trim() || "admin-reviewer",
      role: "admin",
      tokenSource: "ADMIN_REVIEW_ADMIN_TOKEN"
    });
  }
  if (reviewerToken) {
    tokens.push({
      token: reviewerToken,
      actor: process.env.ADMIN_REVIEW_REVIEWER_ACTOR?.trim() || "reviewer",
      role: "reviewer",
      tokenSource: "ADMIN_REVIEW_REVIEWER_TOKEN"
    });
  }
  return tokens;
}

function configuredSessionUsers() {
  const users: AdminReviewSessionUserConfig[] = [];
  const adminPassword = process.env.ADMIN_REVIEW_ADMIN_PASSWORD?.trim();
  const reviewerPassword = process.env.ADMIN_REVIEW_REVIEWER_PASSWORD?.trim();

  if (adminPassword) {
    users.push({
      username: process.env.ADMIN_REVIEW_ADMIN_USERNAME?.trim() || "admin",
      password: adminPassword,
      actor: process.env.ADMIN_REVIEW_ADMIN_ACTOR?.trim() || "admin-reviewer",
      role: "admin",
      tokenSource: "ADMIN_REVIEW_ADMIN_SESSION"
    });
  }
  if (reviewerPassword) {
    users.push({
      username: process.env.ADMIN_REVIEW_REVIEWER_USERNAME?.trim() || "reviewer",
      password: reviewerPassword,
      actor: process.env.ADMIN_REVIEW_REVIEWER_ACTOR?.trim() || "reviewer",
      role: "reviewer",
      tokenSource: "ADMIN_REVIEW_REVIEWER_SESSION"
    });
  }
  return users;
}

export function adminReviewSessionConfigured() {
  return configuredSessionUsers().length > 0;
}

export function adminReviewSessionReady() {
  return adminReviewSessionConfigured() && Boolean(process.env.ADMIN_REVIEW_SESSION_SECRET?.trim());
}

function tokenFromRequest(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const bearerToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearerToken || request.headers.get("x-admin-token")?.trim() || "";
}

function cookieFromRequest(request: Request, cookieName: string) {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === cookieName) return valueParts.join("=");
  }
  return "";
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signSessionPayload(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function timingSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionContextFromRequest(request: Request) {
  const secret = process.env.ADMIN_REVIEW_SESSION_SECRET?.trim();
  if (!secret) return null;

  const cookie = cookieFromRequest(request, adminReviewSessionCookie);
  const [encodedPayload, signature] = cookie.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signSessionPayload(encodedPayload, secret);
  if (!timingSafeEqual(signature, expectedSignature)) return null;

  let payload: { actor?: string; role?: AdminReviewRole; tokenSource?: string; expiresAt?: number };
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return null;
  }

  if (!payload.expiresAt || payload.expiresAt < Date.now()) return null;
  if (payload.role !== "admin" && payload.role !== "reviewer") return null;
  if (!payload.actor || !payload.tokenSource) return null;

  return {
    actor: payload.actor,
    role: payload.role,
    tokenSource: payload.tokenSource
  } satisfies AdminReviewContext;
}

export function authenticateAdminReviewCredentials(username: string, password: string) {
  const normalizedUsername = username.trim();
  const normalizedPassword = password.trim();
  const user = configuredSessionUsers().find(
    (entry) => entry.username === normalizedUsername && entry.password === normalizedPassword
  );
  if (!user) return null;

  return {
    actor: user.actor,
    role: user.role,
    tokenSource: user.tokenSource
  } satisfies AdminReviewContext;
}

export function createAdminReviewSessionCookie(context: AdminReviewContext) {
  const secret = process.env.ADMIN_REVIEW_SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("ADMIN_REVIEW_SESSION_SECRET is required for admin review sessions.");
  }
  const expiresAt = Date.now() + adminReviewSessionMaxAgeSeconds * 1000;
  const encodedPayload = base64UrlEncode(
    JSON.stringify({
      actor: context.actor,
      role: context.role,
      tokenSource: context.tokenSource,
      expiresAt
    })
  );
  const signature = signSessionPayload(encodedPayload, secret);
  return [
    `${adminReviewSessionCookie}=${encodedPayload}.${signature}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${adminReviewSessionMaxAgeSeconds}`,
    process.env.NODE_ENV === "production" ? "Secure" : ""
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearAdminReviewSessionCookie() {
  return `${adminReviewSessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function getAdminReviewContext(request: Request) {
  if (!adminReviewAuthEnabled()) {
    return {
      actor: "local-admin",
      role: "admin" as AdminReviewRole,
      tokenSource: "disabled"
    } satisfies AdminReviewContext;
  }

  const tokens = configuredReviewTokens();
  const requestToken = tokenFromRequest(request);
  const match = tokens.find((entry) => entry.token === requestToken);
  if (match) {
    return {
      actor: match.actor,
      role: match.role,
      tokenSource: match.tokenSource
    } satisfies AdminReviewContext;
  }

  const session = sessionContextFromRequest(request);
  if (session) return session;

  return null;
}

export function publicAdminReviewContext(context: AdminReviewContext | null) {
  if (!context) return null;
  return {
    actor: context.actor,
    role: context.role,
    tokenSource: context.tokenSource
  };
}

export function requireAdminReview(request: Request, options: { roles?: AdminReviewRole[] } = {}) {
  const context = getAdminReviewContext(request);
  const allowedRoles = options.roles || ["admin", "reviewer"];

  if (!context) {
    return Response.json(
      { error: "Admin review token or session required" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Bearer realm="ai-capital-admin"'
        }
      }
    );
  }

  if (!allowedRoles.includes(context.role)) {
    return Response.json(
      { error: "Admin review role not allowed", requiredRoles: allowedRoles, role: context.role },
      { status: 403 }
    );
  }

  return context;
}

export function isAdminReviewResponse(value: Response | AdminReviewContext): value is Response {
  return value instanceof Response;
}
