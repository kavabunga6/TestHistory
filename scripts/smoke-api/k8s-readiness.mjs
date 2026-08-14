import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expectAttachmentPreviewRetentionDescriptorPolicy } from "./k8s-attachment-readiness.mjs";
import {
  expectApiDocumentation,
  expectKubernetesWrappers,
  expectReleaseEvidenceSummary,
  expectScreenshotEvidence
} from "./k8s-doc-readiness.mjs";
import {
  commandExists,
  expectBackupRestoreEvidencePlaceholders,
  expectDeploymentProbes,
  expectIngressHostPlaceholders,
  expectKubernetesOverlays,
  expectManifestContains,
  expectMigrationJob,
  expectNoDependencyIngress,
  expectNoHardcodedOperationsValues,
  expectPrivateDependencyEndpoints,
  expectRolloutReferences,
  expectSecretPlaceholdersOnly,
  expectWorkloadResources,
  readK8sManifests
} from "./k8s-manifest-readiness.mjs";
import {
  expectEnterpriseAuthAuditOperations,
  expectSecurityAuditRetentionExportPolicy
} from "./k8s-security-baseline-readiness.mjs";
import {
  expectSecurityAuditExportOperationalConstraints,
  expectSecurityAuditExportLifecycleInvariantProbes,
  expectSecurityAuditExportLifecyclePlaceholders,
  expectSecurityAuditExportLifecycleReplayProbes,
  expectSecurityAuditExportMaterializedInvariantDeployment
} from "./k8s-security-export-readiness.mjs";

export function smokeK8sReadiness() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const k8sDir = path.join(repoRoot, "infra", "k8s", "base");
  const manifests = readK8sManifests(k8sDir);
  const docs = new Map([
    ["docs/api.md", readFileSync(path.join(repoRoot, "docs", "api.md"), "utf8")],
    ["docs/operations.md", readFileSync(path.join(repoRoot, "docs", "operations.md"), "utf8")],
    [
      "docs/local-development.md",
      readFileSync(path.join(repoRoot, "docs", "local-development.md"), "utf8")
    ],
    [
      "docs/kubernetes-deployment.md",
      readFileSync(path.join(repoRoot, "docs", "kubernetes-deployment.md"), "utf8")
    ],
    [
      "docs/release-evidence.md",
      readFileSync(path.join(repoRoot, "docs", "release-evidence.md"), "utf8")
    ],
    [
      "docs/screenshots/README.md",
      readFileSync(path.join(repoRoot, "docs", "screenshots", "README.md"), "utf8")
    ]
  ]);
  const packageJson = readFileSync(path.join(repoRoot, "package.json"), "utf8");
  const k8sPowerShell = readFileSync(path.join(repoRoot, "scripts", "k8s.ps1"), "utf8");
  const k8sWrapper = readFileSync(path.join(repoRoot, "scripts", "k8s.mjs"), "utf8");
  const localStackWrapper = readFileSync(path.join(repoRoot, "scripts", "local-stack.mjs"), "utf8");
  const localStackPowerShell = readFileSync(
    path.join(repoRoot, "scripts", "local-stack.ps1"),
    "utf8"
  );
  const screenshotScript = readFileSync(
    path.join(repoRoot, "scripts", "capture-ui-screenshots.mjs"),
    "utf8"
  );
  const workflows = new Map([
    [
      ".github/workflows/ci.yml",
      readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8")
    ],
    [
      ".github/workflows/docker.yml",
      readFileSync(path.join(repoRoot, ".github", "workflows", "docker.yml"), "utf8")
    ]
  ]);

  expectManifestContains(manifests, "api-deployment.yaml", [
    "startupProbe:",
    "readinessProbe:",
    "livenessProbe:",
    "path: /health"
  ]);
  expectManifestContains(manifests, "worker-deployment.yaml", [
    "startupProbe:",
    "readinessProbe:",
    "livenessProbe:",
    'test -n "$DATABASE_URL"',
    'test -n "$REDIS_URL"',
    'test -n "$RABBITMQ_URL"',
    'test -n "$S3_ENDPOINT"',
    'test -n "$S3_BUCKET"',
    'test "$WORKER_HEARTBEAT_MS" -gt 0'
  ]);
  expectManifestContains(manifests, "mcp-deployment.yaml", [
    "startupProbe:",
    "readinessProbe:",
    "testhistory.health"
  ]);
  expectManifestContains(manifests, "web-deployment.yaml", [
    "startupProbe:",
    "readinessProbe:",
    "path: /"
  ]);
  expectManifestContains(manifests, "rabbitmq-deployment.yaml", [
    "startupProbe:",
    "readinessProbe:",
    "rabbitmq-diagnostics"
  ]);
  expectMigrationJob(manifests, "db-migration-job.yaml");
  expectSecretPlaceholdersOnly(manifests.get("runtime-config.yaml"));
  expectPrivateDependencyEndpoints(manifests.get("runtime-config.yaml"));
  expectNoDependencyIngress(manifests.get("ingress.yaml"));
  expectIngressHostPlaceholders(manifests.get("ingress.yaml"));
  expectKubernetesOverlays(repoRoot, packageJson, docs);
  expectApiDocumentation(docs, packageJson);
  expectReleaseEvidenceSummary(docs);
  expectScreenshotEvidence(docs, workflows, screenshotScript);
  expectKubernetesWrappers(packageJson, k8sPowerShell, localStackPowerShell, {
    k8sWrapper,
    localStackWrapper
  });
  expectNoHardcodedOperationsValues(manifests);
  expectWorkloadResources(manifests);
  expectDeploymentProbes(manifests);
  expectRolloutReferences(manifests, docs);
  expectEnterpriseAuthAuditOperations(manifests, docs, workflows);
  expectSecurityAuditRetentionExportPolicy(manifests, docs, workflows);
  expectSecurityAuditExportOperationalConstraints(manifests, docs, workflows);
  expectAttachmentPreviewRetentionDescriptorPolicy(manifests, docs, workflows);
  expectBackupRestoreEvidencePlaceholders(docs);

  if (commandExists("kubectl")) {
    execFileSync("kubectl", ["kustomize", k8sDir], {
      stdio: "inherit"
    });
  } else {
    console.warn("kubectl not found; skipped kubectl kustomize infra/k8s/base");
  }

  console.log("Kubernetes readiness smoke passed");
}
