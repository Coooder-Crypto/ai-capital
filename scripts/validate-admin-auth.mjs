import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const mutationRoutes = [
  "src/app/api/admin/candidates/[id]/route.ts",
  "src/app/api/admin/candidates/[id]/approve/route.ts",
  "src/app/api/admin/candidates/[id]/reject/route.ts",
  "src/app/api/admin/candidate-entities/[id]/approve/route.ts",
  "src/app/api/admin/candidate-entities/[id]/reject/route.ts",
  "src/app/api/admin/candidate-entities/[id]/merge/route.ts",
  "src/app/api/admin/candidate-metrics/[id]/route.ts",
  "src/app/api/admin/candidate-metrics/[id]/approve/route.ts",
  "src/app/api/admin/candidate-metrics/[id]/reject/route.ts"
];
const sessionRoute = "src/app/api/admin/session/route.ts";

for (const routePath of mutationRoutes) {
  const source = await readFile(new URL(routePath, root), "utf8");
  assert.match(source, /requireAdminReview/, `${routePath} must enforce admin review auth`);
  assert.match(source, /isAdminReviewResponse/, `${routePath} must distinguish auth context from auth response`);
  assert.match(source, /auth\.actor/, `${routePath} must pass the authenticated actor to repository mutations`);
}

for (const routePath of [
  "src/app/api/admin/candidates/[id]/route.ts",
  "src/app/api/admin/candidate-entities/[id]/merge/route.ts",
  "src/app/api/admin/candidate-metrics/[id]/route.ts"
]) {
  const source = await readFile(new URL(routePath, root), "utf8");
  assert.match(source, /roles: \["admin"\]/, `${routePath} must restrict edit/merge mutations to admin`);
}

const sessionRouteSource = await readFile(new URL(sessionRoute, root), "utf8");
assert.match(sessionRouteSource, /createAdminReviewSessionCookie/, "admin session route must create signed session cookies");
assert.match(sessionRouteSource, /clearAdminReviewSessionCookie/, "admin session route must clear session cookies");
assert.match(sessionRouteSource, /authenticateAdminReviewCredentials/, "admin session route must authenticate username/password credentials");
assert.match(sessionRouteSource, /HttpOnly|Set-Cookie/, "admin session route must return HttpOnly session cookies");

for (const routePath of [
  "src/app/api/admin/candidates/[id]/approve/route.ts",
  "src/app/api/admin/candidates/[id]/reject/route.ts",
  "src/app/api/admin/candidate-entities/[id]/approve/route.ts",
  "src/app/api/admin/candidate-entities/[id]/reject/route.ts",
  "src/app/api/admin/candidate-metrics/[id]/approve/route.ts",
  "src/app/api/admin/candidate-metrics/[id]/reject/route.ts"
]) {
  const source = await readFile(new URL(routePath, root), "utf8");
  assert.match(source, /roles: \["admin", "reviewer"\]/, `${routePath} must allow reviewer approval decisions`);
}

const tempDir = await mkdtemp(path.join(process.cwd(), ".tmp-admin-auth-"));
try {
  const source = await readFile(new URL("src/lib/admin-auth.ts", root), "utf8");
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove
    },
    fileName: "admin-auth.ts",
    reportDiagnostics: true
  });
  assert.equal(diagnostics?.length || 0, 0, diagnostics?.map((diagnostic) => diagnostic.messageText).join("\n"));
  const outputPath = path.join(tempDir, "admin-auth.mjs");
  await writeFile(outputPath, outputText);
  const {
    adminReviewAuthEnabled,
    adminReviewSessionConfigured,
    adminReviewSessionReady,
    authenticateAdminReviewCredentials,
    createAdminReviewSessionCookie,
    getAdminReviewContext,
    isAdminReviewResponse,
    requireAdminReview
  } = await import(pathToFileURL(outputPath).href);

  const previousToken = process.env.ADMIN_REVIEW_TOKEN;
  const previousAdminToken = process.env.ADMIN_REVIEW_ADMIN_TOKEN;
  const previousReviewerToken = process.env.ADMIN_REVIEW_REVIEWER_TOKEN;
  const previousAdminActor = process.env.ADMIN_REVIEW_ADMIN_ACTOR;
  const previousReviewerActor = process.env.ADMIN_REVIEW_REVIEWER_ACTOR;
  const previousAdminUsername = process.env.ADMIN_REVIEW_ADMIN_USERNAME;
  const previousAdminPassword = process.env.ADMIN_REVIEW_ADMIN_PASSWORD;
  const previousReviewerUsername = process.env.ADMIN_REVIEW_REVIEWER_USERNAME;
  const previousReviewerPassword = process.env.ADMIN_REVIEW_REVIEWER_PASSWORD;
  const previousSessionSecret = process.env.ADMIN_REVIEW_SESSION_SECRET;
  delete process.env.ADMIN_REVIEW_TOKEN;
  delete process.env.ADMIN_REVIEW_ADMIN_TOKEN;
  delete process.env.ADMIN_REVIEW_REVIEWER_TOKEN;
  delete process.env.ADMIN_REVIEW_ADMIN_ACTOR;
  delete process.env.ADMIN_REVIEW_REVIEWER_ACTOR;
  delete process.env.ADMIN_REVIEW_ADMIN_USERNAME;
  delete process.env.ADMIN_REVIEW_ADMIN_PASSWORD;
  delete process.env.ADMIN_REVIEW_REVIEWER_USERNAME;
  delete process.env.ADMIN_REVIEW_REVIEWER_PASSWORD;
  delete process.env.ADMIN_REVIEW_SESSION_SECRET;
  assert.equal(adminReviewAuthEnabled(), false);
  assert.equal(adminReviewSessionConfigured(), false);
  assert.equal(adminReviewSessionReady(), false);
  assert.deepEqual(getAdminReviewContext(new Request("http://localhost/admin")), {
    actor: "local-admin",
    role: "admin",
    tokenSource: "disabled"
  });
  assert.deepEqual(requireAdminReview(new Request("http://localhost/admin")), {
    actor: "local-admin",
    role: "admin",
    tokenSource: "disabled"
  });

  process.env.ADMIN_REVIEW_TOKEN = "secret-token";
  assert.equal(adminReviewAuthEnabled(), true);
  const rejected = requireAdminReview(new Request("http://localhost/admin", { method: "POST" }));
  assert.equal(rejected.status, 401);

  const bearerAllowed = requireAdminReview(
    new Request("http://localhost/admin", {
      method: "POST",
      headers: { authorization: "Bearer secret-token" }
    })
  );
  assert.deepEqual(bearerAllowed, {
    actor: "local-admin",
    role: "admin",
    tokenSource: "ADMIN_REVIEW_TOKEN"
  });

  const headerAllowed = requireAdminReview(
    new Request("http://localhost/admin", {
      method: "POST",
      headers: { "x-admin-token": "secret-token" }
    })
  );
  assert.equal(headerAllowed.role, "admin");

  delete process.env.ADMIN_REVIEW_TOKEN;
  process.env.ADMIN_REVIEW_ADMIN_TOKEN = "admin-token";
  process.env.ADMIN_REVIEW_REVIEWER_TOKEN = "reviewer-token";
  process.env.ADMIN_REVIEW_ADMIN_ACTOR = "alice";
  process.env.ADMIN_REVIEW_REVIEWER_ACTOR = "bob";

  const adminAllowed = requireAdminReview(
    new Request("http://localhost/admin", {
      method: "POST",
      headers: { authorization: "Bearer admin-token" }
    }),
    { roles: ["admin"] }
  );
  assert.deepEqual(adminAllowed, {
    actor: "alice",
    role: "admin",
    tokenSource: "ADMIN_REVIEW_ADMIN_TOKEN"
  });

  const reviewerAllowed = requireAdminReview(
    new Request("http://localhost/admin", {
      method: "POST",
      headers: { authorization: "Bearer reviewer-token" }
    }),
    { roles: ["admin", "reviewer"] }
  );
  assert.deepEqual(reviewerAllowed, {
    actor: "bob",
    role: "reviewer",
    tokenSource: "ADMIN_REVIEW_REVIEWER_TOKEN"
  });

  const reviewerDenied = requireAdminReview(
    new Request("http://localhost/admin", {
      method: "POST",
      headers: { authorization: "Bearer reviewer-token" }
    }),
    { roles: ["admin"] }
  );
  assert.equal(isAdminReviewResponse(reviewerDenied), true);
  assert.equal(reviewerDenied.status, 403);

  delete process.env.ADMIN_REVIEW_ADMIN_TOKEN;
  delete process.env.ADMIN_REVIEW_REVIEWER_TOKEN;
  process.env.ADMIN_REVIEW_ADMIN_USERNAME = "alice";
  process.env.ADMIN_REVIEW_ADMIN_PASSWORD = "admin-pass";
  process.env.ADMIN_REVIEW_REVIEWER_USERNAME = "bob";
  process.env.ADMIN_REVIEW_REVIEWER_PASSWORD = "reviewer-pass";
  process.env.ADMIN_REVIEW_SESSION_SECRET = "session-secret";

  assert.equal(adminReviewAuthEnabled(), true);
  assert.equal(adminReviewSessionConfigured(), true);
  assert.equal(adminReviewSessionReady(), true);
  assert.deepEqual(authenticateAdminReviewCredentials("alice", "admin-pass"), {
    actor: "alice",
    role: "admin",
    tokenSource: "ADMIN_REVIEW_ADMIN_SESSION"
  });
  assert.deepEqual(authenticateAdminReviewCredentials("bob", "reviewer-pass"), {
    actor: "bob",
    role: "reviewer",
    tokenSource: "ADMIN_REVIEW_REVIEWER_SESSION"
  });
  assert.equal(authenticateAdminReviewCredentials("alice", "wrong-pass"), null);

  const sessionCookie = createAdminReviewSessionCookie(authenticateAdminReviewCredentials("alice", "admin-pass"));
  assert.match(sessionCookie, /HttpOnly/);
  assert.match(sessionCookie, /SameSite=Lax/);
  const sessionAllowed = requireAdminReview(
    new Request("http://localhost/admin", {
      method: "POST",
      headers: { cookie: sessionCookie }
    }),
    { roles: ["admin"] }
  );
  assert.deepEqual(sessionAllowed, {
    actor: "alice",
    role: "admin",
    tokenSource: "ADMIN_REVIEW_ADMIN_SESSION"
  });

  const reviewerSessionCookie = createAdminReviewSessionCookie(authenticateAdminReviewCredentials("bob", "reviewer-pass"));
  const reviewerSessionDenied = requireAdminReview(
    new Request("http://localhost/admin", {
      method: "POST",
      headers: { cookie: reviewerSessionCookie }
    }),
    { roles: ["admin"] }
  );
  assert.equal(isAdminReviewResponse(reviewerSessionDenied), true);
  assert.equal(reviewerSessionDenied.status, 403);

  if (previousToken === undefined) {
    delete process.env.ADMIN_REVIEW_TOKEN;
  } else {
    process.env.ADMIN_REVIEW_TOKEN = previousToken;
  }
  if (previousAdminToken === undefined) {
    delete process.env.ADMIN_REVIEW_ADMIN_TOKEN;
  } else {
    process.env.ADMIN_REVIEW_ADMIN_TOKEN = previousAdminToken;
  }
  if (previousReviewerToken === undefined) {
    delete process.env.ADMIN_REVIEW_REVIEWER_TOKEN;
  } else {
    process.env.ADMIN_REVIEW_REVIEWER_TOKEN = previousReviewerToken;
  }
  if (previousAdminActor === undefined) {
    delete process.env.ADMIN_REVIEW_ADMIN_ACTOR;
  } else {
    process.env.ADMIN_REVIEW_ADMIN_ACTOR = previousAdminActor;
  }
  if (previousReviewerActor === undefined) {
    delete process.env.ADMIN_REVIEW_REVIEWER_ACTOR;
  } else {
    process.env.ADMIN_REVIEW_REVIEWER_ACTOR = previousReviewerActor;
  }
  if (previousAdminUsername === undefined) {
    delete process.env.ADMIN_REVIEW_ADMIN_USERNAME;
  } else {
    process.env.ADMIN_REVIEW_ADMIN_USERNAME = previousAdminUsername;
  }
  if (previousAdminPassword === undefined) {
    delete process.env.ADMIN_REVIEW_ADMIN_PASSWORD;
  } else {
    process.env.ADMIN_REVIEW_ADMIN_PASSWORD = previousAdminPassword;
  }
  if (previousReviewerUsername === undefined) {
    delete process.env.ADMIN_REVIEW_REVIEWER_USERNAME;
  } else {
    process.env.ADMIN_REVIEW_REVIEWER_USERNAME = previousReviewerUsername;
  }
  if (previousReviewerPassword === undefined) {
    delete process.env.ADMIN_REVIEW_REVIEWER_PASSWORD;
  } else {
    process.env.ADMIN_REVIEW_REVIEWER_PASSWORD = previousReviewerPassword;
  }
  if (previousSessionSecret === undefined) {
    delete process.env.ADMIN_REVIEW_SESSION_SECRET;
  } else {
    process.env.ADMIN_REVIEW_SESSION_SECRET = previousSessionSecret;
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log(`Admin auth valid: ${mutationRoutes.length} mutation routes enforce role-aware review tokens and sessions when configured.`);
