import { readFileSync } from "node:fs";
import path from "node:path";

const workspace = process.cwd();

const sources = new Map([
  ["package.json", read("package.json")],
  [".github/workflows/ci.yml", read(".github/workflows/ci.yml")],
  ["docs/api.md", read("docs/api.md")],
  ["docs/ci-gates.md", read("docs/ci-gates.md")],
  ["docs/kubernetes-deployment.md", read("docs/kubernetes-deployment.md")],
  ["docs/local-development.md", read("docs/local-development.md")],
  ["docs/operations.md", read("docs/operations.md")],
  ["docs/release-evidence.md", read("docs/release-evidence.md")],
  ["docs/screenshots/README.md", read("docs/screenshots/README.md")],
  ["docs/ui-design-audit.md", read("docs/ui-design-audit.md")],
  ["scripts/k8s.mjs", read("scripts/k8s.mjs")],
  ["scripts/k8s.ps1", read("scripts/k8s.ps1")]
]);

const releaseEvidence = sources.get("docs/release-evidence.md");
const packageJson = sources.get("package.json");
const ciWorkflow = sources.get(".github/workflows/ci.yml");

expectSnippets("docs/operations.md", sources.get("docs/operations.md"), [
  "## Backup And Restore Drill",
  "### Production evidence gate",
  "TESTHISTORY_PRODUCTION_EVIDENCE_FILE",
  "TESTHISTORY_ENABLED_OUTBOUND_PROVIDERS",
  "TESTHISTORY_IDENTITY_DRILL_MODE",
  "npm run production:evidence:check",
  "outside this repository",
  "The gate is fail-closed"
]);

expectSnippets("docs/release-evidence.md", releaseEvidence, [
  "## Required Links",
  "## Local Baseline Commands",
  "## PR Summary Template",
  "## Acceptance Notes",
  "Green `Lint`, `Build and test`, `API smoke`, `OpenAPI contract`, `UI screenshot evidence`, `Kubernetes readiness smoke`, and `Operations contract` jobs",
  "`ui-screenshot-evidence` artifact with `docs/screenshots/final/manifest.json`",
  "Output from `npm run local:help`, `npm run local:doctor`, `npm run local:up`, and `npm run local:smoke`",
  "Output from `npm run k8s:help`, `npm run k8s:validate:all`, and the selected deploy/undeploy command",
  "`npm run openapi:check`, Swagger UI `/docs`, and OpenAPI JSON `/docs/json`",
  "`load-soak-evidence` artifact or `.tmp/performance/load-soak-evidence.json`",
  "npm run production:evidence:check",
  "environment-specific evidence file outside the repository",
  "npm run guard:button-overflow",
  "npm run guard:ui-design",
  "npm run guard:ui-interactions",
  "npm run screenshots:capture",
  "Residual risks:"
]);

expectSnippets("package.json", packageJson, [
  '"release:evidence:check"',
  '"local:help"',
  '"local:doctor"',
  '"local:up"',
  '"local:smoke"',
  '"docker:help"',
  '"docker:doctor"',
  '"docker:up"',
  '"docker:smoke"',
  '"k8s:help"',
  '"k8s:validate"',
  '"k8s:validate:all"',
  '"k8s:deploy"',
  '"k8s:undeploy"',
  '"openapi:check"',
  '"screenshots:capture"',
  '"guard:ui-design"',
  '"load:soak"',
  '"production:evidence:check"',
  '"production:evidence:test"'
]);

expectSnippets(".github/workflows/ci.yml", ciWorkflow, [
  "UI screenshot evidence",
  "npm run guard:ui-design",
  "name: ui-screenshot-evidence",
  "path: docs/screenshots/final/*",
  "OpenAPI contract",
  "npm run openapi:check",
  "Kubernetes operations readiness smoke",
  "azure/setup-kubectl@v4",
  "TESTHISTORY_K8S_REQUIRE_KUBECTL",
  "npm run k8s:validate",
  "Deployment wrapper help contract",
  "npm run docker:help && npm run k8s:help",
  "Release evidence contract",
  "npm run release:evidence:check",
  "Load soak evidence",
  "name: load-soak-evidence"
]);

expectSnippets("docs/ci-gates.md", sources.get("docs/ci-gates.md"), [
  "[release evidence](release-evidence.md)",
  "`ui-screenshot-evidence` artifact",
  "`load-soak-evidence` artifact",
  "`npm run openapi:check`",
  "`npm run k8s:validate`",
  "`npm run k8s:validate:all`"
]);

expectSnippets("docs/screenshots/README.md", sources.get("docs/screenshots/README.md"), [
  "final/manifest.json",
  "ui-screenshot-evidence",
  "npm run screenshots:capture"
]);

expectSnippets("docs/ui-design-audit.md", sources.get("docs/ui-design-audit.md"), [
  "## Target UI Contract",
  "Keep UI copy Russian",
  "Use the same modal contract everywhere",
  "Use the same tab contract everywhere",
  "## Evidence To Refresh"
]);

expectSnippets("docs/api.md", sources.get("docs/api.md"), [
  "Swagger UI: `http://127.0.0.1:18080/docs`",
  "OpenAPI JSON: `http://127.0.0.1:18080/docs/json`",
  "Every operation must include a useful human description",
  "Every documented `application/json` response must include a schema",
  "npm run openapi:check"
]);

expectSnippets("docs/local-development.md", sources.get("docs/local-development.md"), [
  "npm run local:help",
  "npm run local:doctor",
  "npm run local:up",
  "npm run local:smoke",
  "npm run docker:up",
  "docker:*` names remain available for CI and existing automation",
  ".\\scripts\\local-stack.ps1 up",
  ".\\scripts\\local-stack.ps1 up -Mcp",
  ".\\scripts\\local-stack.ps1 up -NoBuild"
]);

expectSnippets("docs/kubernetes-deployment.md", sources.get("docs/kubernetes-deployment.md"), [
  "npm run k8s:help",
  "npm run k8s:validate",
  "npm run k8s:validate:all",
  "npm run k8s:deploy",
  "npm run k8s:undeploy",
  "TESTHISTORY_K8S_SMOKE_URL",
  "replace-with-*",
  "replace-prod-*",
  "--allow-placeholders"
]);

expectSnippets("scripts/k8s.mjs", sources.get("scripts/k8s.mjs"), [
  "assertNoDeploymentPlaceholders",
  "findPlaceholderFindings",
  "replace-with-",
  "replace-prod-",
  "--allow-placeholders"
]);

expectSnippets("scripts/k8s.ps1", sources.get("scripts/k8s.ps1"), [
  "Assert-NoDeploymentPlaceholders",
  "Select-String",
  "replace-with-",
  "replace-prod-",
  "-AllowPlaceholders"
]);

console.log("Release evidence contract passed");

function read(relativePath) {
  return readFileSync(path.join(workspace, relativePath), "utf8");
}

function expectSnippets(label, source, snippets) {
  for (const snippet of snippets) {
    if (!source.includes(snippet)) {
      throw new Error(`${label} is missing release evidence snippet: ${snippet}`);
    }
  }
}
