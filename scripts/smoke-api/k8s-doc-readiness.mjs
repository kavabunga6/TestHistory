export function expectScreenshotEvidence(docs, workflows, screenshotScript) {
  const screenshotDocs = docs.get("docs/screenshots/README.md") ?? "";
  const ciWorkflow = workflows.get(".github/workflows/ci.yml") ?? "";

  for (const snippet of [
    "writeScreenshotManifest",
    "manifest.json",
    "statSync(fullPath)",
    "bytes: stats.size",
    'dialog: typeof screen.prepare === "function"',
    "launchChromiumWithFallback",
    "#case/PAY-1042/history",
    "#defects/PAY-337"
  ]) {
    if (!screenshotScript.includes(snippet)) {
      throw new Error(`scripts/capture-ui-screenshots.mjs is missing evidence snippet: ${snippet}`);
    }
  }

  for (const snippet of [
    "final/manifest.json",
    "docs/screenshots/final/*",
    "ui-screenshot-evidence",
    "headless shell",
    "regular Chromium executable",
    "route",
    "byte size"
  ]) {
    if (!screenshotDocs.includes(snippet) && !ciWorkflow.includes(snippet)) {
      throw new Error(`Screenshot evidence docs/workflow are missing snippet: ${snippet}`);
    }
  }

  if (!ciWorkflow.includes("path: docs/screenshots/final/*")) {
    throw new Error("CI screenshot artifact must upload the full docs/screenshots/final directory");
  }
}

export function expectApiDocumentation(docs, packageJson) {
  const apiDocs = docs.get("docs/api.md") ?? "";
  for (const snippet of [
    "Swagger UI: `http://127.0.0.1:18080/docs`",
    "OpenAPI JSON: `http://127.0.0.1:18080/docs/json`",
    "Web docs proxy: `http://127.0.0.1:5173/docs`",
    "Endpoint catalog generator: `npm run api:docs:catalog`",
    "Authorization: Bearer <session-or-personal-token>",
    "## Scopes And Permissions",
    "`settings:read`",
    "`settings:write`",
    "`launches:write`",
    "`results:write`",
    "`uploads:write`",
    "`artifacts:read`",
    "`defects:read`",
    "## Pagination",
    "Use `limit` values that match the UI page-size controls (`10`, `20`, `50`)",
    "## Project Settings API",
    "/api/v1/projects/{projectId}/settings/access",
    "/api/v1/projects/{projectId}/settings/access/tokens",
    "/api/v1/projects/{projectId}/settings/artifacts",
    "label JIRA_ISSUE = ANDROID-123",
    "https://www.jira.ru/browse/{value}",
    "attachmentRetentionDays",
    "compressRetainedTextArtifacts",
    "Regenerate the endpoint catalog with `npm run api:docs:catalog`",
    "npm run openapi:check",
    "For the full local API + web + worker stack, use the one-command wrapper",
    "npm run local:up",
    "npm run local:smoke",
    "npm run local:restart",
    "the web container docs proxy",
    "Production Integration Notes",
    "Browser clients should authenticate through `/api/v1/auth/login`",
    "Project API tokens are created from project settings and should be used by CI uploads",
    "External integrations are label-to-link mappings",
    "Artifact retention settings are policy data",
    "Settings API Walkthrough",
    "Workflow Recipes",
    "Chunked Allure Upload",
    "POST /api/v1/launches/{launchId}/uploads/chunked",
    "PUT /api/v1/uploads/{uploadId}/chunks/{index}",
    "Allure-Compatible Uploads",
    "POST /api/allurectl/upload",
    "Retention Cleanup",
    "POST /api/v1/artifacts/retention/preview",
    "POST /api/v1/artifacts/retention/execute",
    "Defects And Quarantine Reads",
    "GET /api/v1/projects/{projectId}/defect-mutes/projection",
    "Security Audit Export Policy",
    "POST /api/v1/security/audit/export/evaluate",
    "Read `/api/v1/auth/me` to confirm the current user and role",
    "Create personal tokens through `/api/v1/auth/tokens` only for the current user",
    "Create project API tokens with",
    "Configure external links as label mappings",
    "retentionPolicies[]",
    "openapi:check` is bidirectional",
    "explicitly allowlisted docs endpoints (`/docs`, `/docs/json`)",
    "npm run docker:up",
    "npm run docker:smoke"
  ]) {
    if (!apiDocs.includes(snippet)) {
      throw new Error(`docs/api.md is missing API documentation snippet: ${snippet}`);
    }
  }

  for (const snippet of [
    "openapi:check",
    "api:docs:catalog",
    "docker:help",
    "docker:doctor",
    "docker:up",
    "docker:smoke",
    "local:doctor",
    "local:up",
    "local:restart",
    "local:smoke",
    "release:evidence:check"
  ]) {
    if (!packageJson.includes(snippet)) {
      throw new Error(`package.json is missing documented API/deploy script: ${snippet}`);
    }
  }
}

export function expectReleaseEvidenceSummary(docs) {
  const releaseEvidence = docs.get("docs/release-evidence.md") ?? "";
  for (const snippet of [
    "## Required Links",
    "ui-screenshot-evidence",
    "docs/screenshots/final/manifest.json",
    "npm run local:doctor",
    "npm run local:up",
    "npm run local:smoke",
    "npm run k8s:validate",
    "npm run openapi:check",
    "npm run release:evidence:check",
    "Swagger UI `/docs`",
    "OpenAPI JSON `/docs/json`",
    "Web docs proxy",
    "load-soak-evidence",
    "## PR Summary Template",
    "Residual risks"
  ]) {
    if (!releaseEvidence.includes(snippet)) {
      throw new Error(`docs/release-evidence.md is missing release evidence snippet: ${snippet}`);
    }
  }
}

export function expectKubernetesWrappers(
  packageJson,
  k8sPowerShell,
  localStackPowerShell,
  { k8sWrapper, localStackWrapper }
) {
  for (const snippet of [
    "k8s:deploy",
    "k8s:undeploy",
    "k8s:migrate",
    "k8s:help",
    "k8s:validate:local",
    "k8s:deploy:local",
    "k8s:undeploy:local",
    "k8s:validate:prod",
    "k8s:deploy:prod",
    "k8s:undeploy:prod"
  ]) {
    if (!packageJson.includes(snippet)) {
      throw new Error(`package.json is missing Kubernetes wrapper script: ${snippet}`);
    }
  }

  for (const snippet of [
    "printHelp",
    "requireCommands",
    "Missing required command(s)",
    "TESTHISTORY_K8S_REQUIRE_KUBECTL",
    "--require-kubectl",
    "node scripts/k8s.mjs help"
  ]) {
    if (!k8sWrapper.includes(snippet)) {
      throw new Error(`scripts/k8s.mjs is missing wrapper prerequisite snippet: ${snippet}`);
    }
  }

  for (const snippet of [
    "printHelp",
    "requireCommands",
    "Missing required command(s)",
    "node scripts/local-stack.mjs help"
  ]) {
    if (!localStackWrapper.includes(snippet)) {
      throw new Error(
        `scripts/local-stack.mjs is missing wrapper prerequisite snippet: ${snippet}`
      );
    }
  }

  for (const snippet of [
    "$CommandArgs",
    "Show-Help",
    "Assert-Command",
    'Test-Command "kubectl"',
    "$RequireKubectl",
    "-KustomizePath",
    "-Namespace",
    "TESTHISTORY_K8S_REQUIRE_KUBECTL",
    "required Kubernetes manifest render",
    "skipped Kubernetes manifest render",
    "Recreate-MigrationJob",
    'Invoke-Step @("kubectl", "apply", "-k", $KustomizePath)',
    "$SmokeUrl",
    "$WebUrl",
    "-SmokeUrl",
    "-WebUrl",
    "Invoke-LiveSmoke",
    "TESTHISTORY_K8S_SMOKE_URL not set; skipped live Kubernetes HTTP smoke",
    "TESTHISTORY_K8S_WEB_URL not set; skipped live Kubernetes web smoke"
  ]) {
    if (!k8sPowerShell.includes(snippet)) {
      throw new Error(`scripts/k8s.ps1 is missing wrapper parity snippet: ${snippet}`);
    }
  }

  if (!localStackPowerShell.includes("$CommandArgs")) {
    throw new Error("scripts/local-stack.ps1 must use $CommandArgs for Invoke-Step arguments");
  }
  for (const snippet of [
    "Show-Help",
    "Assert-Command",
    "Missing required command(s)",
    "Show-Endpoints",
    "doctor",
    "-Mcp",
    "-NoBuild",
    "Web docs proxy: http://127.0.0.1:5173/docs"
  ]) {
    if (!localStackPowerShell.includes(snippet)) {
      throw new Error(
        `scripts/local-stack.ps1 is missing local stack prerequisite snippet: ${snippet}`
      );
    }
  }
  if (localStackPowerShell.includes("param([string[]]$Args)")) {
    throw new Error("scripts/local-stack.ps1 must not use the ambiguous $Args parameter name");
  }
  if (k8sPowerShell.includes("param([string[]]$Args)")) {
    throw new Error("scripts/k8s.ps1 must not use the ambiguous $Args parameter name");
  }
}
