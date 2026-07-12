export function categoryForProductionReleaseItem(text) {
  if (/github-production-preflight|production:p0-p3:run|validate:production-completion|GitHub run metadata/i.test(text)) {
    return "github_workflow";
  }
  if (/artifact|workflow_dispatch|production_llm|production environment/i.test(text)) return "github_evidence";
  if (/LLM|LLM_EXTRACT/i.test(text)) return "llm_gateway";
  if (/DATABASE_URL|schema and data|db:import|worker:import/i.test(text)) return "production_database";
  if (/admin review|ADMIN_REVIEW/i.test(text)) return "admin_auth";
  if (/P0_P3_EXPECTED|workflow commit|workflow repository|refs\/heads/i.test(text)) return "source_revision";
  if (/validate:p0-p3:production|write-evidence|non-localhost/i.test(text)) return "production_gate";
  return "release";
}

export function commandsForProductionReleaseItem(text) {
  const knownCommands = [
    "npm run validate:p0-p3:production -- --provider=http --write-evidence",
    "npm run validate:github-production-preflight -- --repo=OWNER/REPO",
    "npm run production:p0-p3:run -- --repo=OWNER/REPO --ref=refs/heads/main",
    "npm run validate:production-completion -- --commit=WORKFLOW_COMMIT_SHA --repo=OWNER/REPO --ref=refs/heads/main --run-id=GITHUB_RUN_ID --dispatch-started-at=DISPATCH_ISO_TIMESTAMP --download"
  ];
  const commandMatch = knownCommands.find((command) => text.includes(command));
  if (commandMatch) return [commandMatch];
  if (/P0_P3_VERIFIED_GITHUB_RUN_ID|P0_P3_VERIFIED_GITHUB_RUN_ATTEMPT/i.test(text)) {
    return [
      "npm run validate:production-completion -- --commit=WORKFLOW_COMMIT_SHA --repo=OWNER/REPO --ref=refs/heads/main --run-id=GITHUB_RUN_ID --dispatch-started-at=DISPATCH_ISO_TIMESTAMP --download"
    ];
  }
  if (/validate:production-completion|GitHub run metadata/i.test(text)) {
    return [
      "npm run validate:production-completion -- --commit=WORKFLOW_COMMIT_SHA --repo=OWNER/REPO --ref=refs/heads/main --run-id=GITHUB_RUN_ID --dispatch-started-at=DISPATCH_ISO_TIMESTAMP --download"
    ];
  }
  if (/artifact|workflow_dispatch|production_llm|production environment/i.test(text)) {
    return ["npm run production:p0-p3:run -- --repo=OWNER/REPO --ref=refs/heads/main"];
  }
  if (/DATABASE_URL/.test(text)) {
    return [
      "export DATABASE_URL='postgres://USER:PASSWORD@HOST:5432/DB'",
      "npm run db:import",
      "npm run worker:import",
      "npm run db:status -- --require-ready",
      "npm run db:verify",
      "npm run worker:verify",
      "npm run db:verify:p3-persistent"
    ];
  }
  if (/admin review/.test(text)) {
    return [
      "gh secret set ADMIN_REVIEW_SESSION_SECRET --env production",
      "gh secret set ADMIN_REVIEW_ADMIN_PASSWORD --env production",
      "gh secret set ADMIN_REVIEW_REVIEWER_PASSWORD --env production"
    ];
  }
  if (/LLM_EXTRACT/.test(text)) {
    return [
      "gh secret set LLM_EXTRACT_URL --env production",
      "gh secret set LLM_EXTRACT_API_KEY --env production"
    ];
  }
  if (/P0_P3_EXPECTED/.test(text)) {
    return [
      "export P0_P3_EXPECTED_SOURCE_COMMIT='WORKFLOW_COMMIT_SHA'",
      "export P0_P3_EXPECTED_GITHUB_REPOSITORY='OWNER/REPO'",
      "export P0_P3_EXPECTED_GITHUB_REF='refs/heads/main'"
    ];
  }
  return [];
}

export function proofForProductionReleaseItem(text) {
  if (/validate:production-completion/.test(text) || /GitHub run metadata/.test(text)) {
    return "validate:production-completion passes and refreshes completion matrix";
  }
  if (/artifact|workflow_dispatch|production_llm|production environment/i.test(text)) {
    return "validated p0-p3-production-readiness-report artifact with matching sourceRevision";
  }
  if (/DATABASE_URL|schema and data/i.test(text)) {
    return "db:status, db:verify, worker:verify and db:verify:p3-persistent pass against production PostgreSQL";
  }
  if (/admin review/i.test(text)) return "validate:env -- --require-production passes with session auth secrets";
  if (/LLM|LLM_EXTRACT/i.test(text)) return "llm:verify-production passes against the non-localhost HTTP gateway";
  return "completion matrix item no longer appears in externalPending";
}

export function buildProductionReleaseChecklist(matrix, options = {}) {
  const pending = matrix.externalPending || [];
  const items = pending.map((description, index) => {
    const commands = commandsForProductionReleaseItem(description);
    return {
      id: `p0p3-prod-${String(index + 1).padStart(2, "0")}`,
      category: categoryForProductionReleaseItem(description),
      status: "pending_external",
      description,
      command: commands[0] || null,
      commands,
      proof: proofForProductionReleaseItem(description)
    };
  });

  const categories = {};
  for (const item of items) {
    categories[item.category] = (categories[item.category] || 0) + 1;
  }

  return {
    schemaVersion: 2,
    generatedAt: options.generatedAt || new Date().toISOString(),
    sourceMatrix: "data/research/p0-p3-completion-matrix.json",
    sourceMatrixGeneratedAt: matrix.generatedAt,
    matrixStatus: matrix.status,
    productionEvidence: matrix.productionEvidence || null,
    productionGitCommit: matrix.summary?.productionGitCommit || null,
    pendingCount: items.length,
    categories,
    items
  };
}

export function comparableProductionReleaseChecklist(checklist) {
  return {
    ...checklist,
    generatedAt: "<ignored>",
    sourceMatrixGeneratedAt: "<ignored>"
  };
}
