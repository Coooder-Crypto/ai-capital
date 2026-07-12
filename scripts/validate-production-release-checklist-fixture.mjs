import { spawnSync } from "node:child_process";
import fs from "node:fs";

const rootDir = new URL("../", import.meta.url).pathname;
const root = new URL("../", import.meta.url);
const checklistPath = new URL("data/research/p0-p3-production-release-checklist.json", root);

function run(args, options = {}) {
  return spawnSync("node", ["scripts/generate-production-release-checklist.mjs", ...args], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    ...options
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function restore(original) {
  if (original !== null) {
    fs.writeFileSync(checklistPath, original);
    return;
  }
  const result = run([]);
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`failed to restore production release checklist with status ${result.status}`);
  }
}

const original = fs.existsSync(checklistPath) ? fs.readFileSync(checklistPath, "utf8") : null;

try {
  const generateResult = run([]);
  if (generateResult.status !== 0) {
    process.stdout.write(generateResult.stdout || "");
    process.stderr.write(generateResult.stderr || "");
    throw new Error(`production release checklist generation fixture failed with status ${generateResult.status}`);
  }

  const validResult = run(["--check"]);
  if (validResult.status !== 0) {
    process.stdout.write(validResult.stdout || "");
    process.stderr.write(validResult.stderr || "");
    throw new Error(`expected valid production release checklist, got status ${validResult.status}`);
  }

  const generatedChecklist = JSON.parse(fs.readFileSync(checklistPath, "utf8"));
  assert(generatedChecklist.schemaVersion === 2, "expected production release checklist schemaVersion 2");
  const missingCommandItems = generatedChecklist.items.filter((item) => !item.command);
  assert(
    missingCommandItems.length === 0,
    `expected every production release checklist item to include a command, missing: ${missingCommandItems.map((item) => item.id).join(", ")}`
  );
  const missingCommandsItems = generatedChecklist.items.filter(
    (item) => !Array.isArray(item.commands) || item.commands.length === 0 || item.commands.some((command) => typeof command !== "string" || command.length === 0)
  );
  assert(
    missingCommandsItems.length === 0,
    `expected every production release checklist item to include executable commands[], missing: ${missingCommandsItems.map((item) => item.id).join(", ")}`
  );
  const completionItem = generatedChecklist.items.find((item) => item.description.includes("validate:production-completion"));
  assert(completionItem, "expected production release checklist to include validate:production-completion item");
  assert(
    completionItem.command?.includes("--dispatch-started-at=DISPATCH_ISO_TIMESTAMP"),
    "expected validate:production-completion checklist command to include --dispatch-started-at"
  );
  assert(
    completionItem.commands?.some((command) => command.includes("--dispatch-started-at=DISPATCH_ISO_TIMESTAMP")),
    "expected validate:production-completion checklist commands[] to include --dispatch-started-at"
  );
  const workflowDispatchItem = generatedChecklist.items.find((item) => item.description.includes("workflow_dispatch"));
  assert(workflowDispatchItem, "expected production release checklist to include workflow_dispatch item");
  assert(
    workflowDispatchItem.command === "npm run production:p0-p3:run -- --repo=OWNER/REPO --ref=refs/heads/main",
    "expected workflow_dispatch checklist item to point to production:p0-p3:run"
  );
  const sourceRevisionItem = generatedChecklist.items.find((item) => item.description.includes("P0_P3_EXPECTED_SOURCE_COMMIT"));
  assert(sourceRevisionItem, "expected production release checklist to include source revision item");
  assert(
    sourceRevisionItem.commands?.includes("export P0_P3_EXPECTED_SOURCE_COMMIT='WORKFLOW_COMMIT_SHA'"),
    "expected source revision commands[] to include a concrete WORKFLOW_COMMIT_SHA export"
  );
  const databaseItem = generatedChecklist.items.find((item) => item.category === "production_database");
  assert(databaseItem, "expected production release checklist to include production database item");
  assert(
    databaseItem.commands?.includes("npm run db:status -- --require-ready") &&
      databaseItem.commands?.includes("npm run db:verify:p3-persistent"),
    "expected production database commands[] to include readiness and P3 persistence verification"
  );
  const adminItem = generatedChecklist.items.find((item) => item.category === "admin_auth");
  assert(adminItem, "expected production release checklist to include admin auth item");
  assert(
    adminItem.commands?.every((command) => command.includes("--env production")),
    "expected admin auth secret commands[] to target the production environment"
  );
  const llmSecretItem = generatedChecklist.items.find((item) => item.description.includes("LLM_EXTRACT_URL/LLM_EXTRACT_API_KEY"));
  assert(llmSecretItem, "expected production release checklist to include LLM secret item");
  assert(
    llmSecretItem.commands?.every((command) => command.includes("--env production")),
    "expected LLM secret commands[] to target the production environment"
  );

  const staleChecklist = JSON.parse(fs.readFileSync(checklistPath, "utf8"));
  staleChecklist.items = staleChecklist.items.slice(1);
  staleChecklist.pendingCount = staleChecklist.items.length;
  fs.writeFileSync(checklistPath, `${JSON.stringify(staleChecklist, null, 2)}\n`);

  const staleResult = run(["--check"]);
  assert(staleResult.status !== 0, "expected stale production release checklist to fail");
  assert(
    `${staleResult.stderr}${staleResult.stdout}`.includes("stale"),
    "expected stale production release checklist failure to mention stale"
  );

  fs.unlinkSync(checklistPath);
  const missingResult = run(["--check"]);
  assert(missingResult.status !== 0, "expected missing production release checklist to fail");
  assert(
    `${missingResult.stderr}${missingResult.stdout}`.includes("missing"),
    "expected missing production release checklist failure to mention missing"
  );
} finally {
  restore(original);
}

console.log("Production release checklist fixture validation passed.");
