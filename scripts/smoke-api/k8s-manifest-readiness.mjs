import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export function readK8sManifests(k8sDir) {
  const manifests = new Map();
  for (const file of readdirSync(k8sDir)) {
    if (file.endsWith(".yaml") || file.endsWith(".yml")) {
      manifests.set(file, readFileSync(path.join(k8sDir, file), "utf8"));
    }
  }
  return manifests;
}

export function expectManifestContains(manifests, file, snippets) {
  const manifest = manifests.get(file);
  if (!manifest) {
    throw new Error(`Missing ${file}`);
  }

  for (const snippet of snippets) {
    if (!manifest.includes(snippet)) {
      throw new Error(`${file} is missing readiness smoke snippet: ${snippet}`);
    }
  }
}

export function expectKubernetesOverlays(repoRoot, packageJson, docs) {
  const overlayFiles = new Map();
  for (const overlay of ["local", "prod"]) {
    const overlayDir = path.join(repoRoot, "infra", "k8s", "overlays", overlay);
    const files = ["kustomization.yaml", `ingress-${overlay}.yaml`, `storage-${overlay}.yaml`];
    if (overlay === "prod") {
      files.push(
        "autoscaling-prod.yaml",
        "availability-prod.yaml",
        "network-prod.yaml",
        "service-accounts-prod.yaml",
        "workload-prod.yaml"
      );
    }
    for (const file of files) {
      overlayFiles.set(`${overlay}/${file}`, readFileSync(path.join(overlayDir, file), "utf8"));
    }
  }

  for (const [file, snippets] of [
    [
      "local/kustomization.yaml",
      [
        "resources:",
        "- ../../base",
        "newName: testhistory-api",
        "newTag: local",
        "ingress-local.yaml",
        "storage-local.yaml"
      ]
    ],
    [
      "prod/kustomization.yaml",
      [
        "resources:",
        "- ../../base",
        "autoscaling-prod.yaml",
        "availability-prod.yaml",
        "network-prod.yaml",
        "service-accounts-prod.yaml",
        "replace-prod-immutable-tag",
        "ingress-prod.yaml",
        "storage-prod.yaml",
        "workload-prod.yaml"
      ]
    ],
    ["local/ingress-local.yaml", ["testhistory.local", "ingressClassName: nginx"]],
    [
      "prod/ingress-prod.yaml",
      ["replace-with-production-testhistory-hostname", "replace-with-production-ingress-class"]
    ],
    ["local/storage-local.yaml", ["storageClassName: standard", "storage: 5Gi"]],
    ["prod/storage-prod.yaml", ["replace-with-production-storage-class", "storage: 20Gi"]],
    [
      "prod/autoscaling-prod.yaml",
      [
        "kind: HorizontalPodAutoscaler",
        "name: testhistory-worker",
        "name: testhistory-web",
        "minReplicas: 2",
        "maxReplicas: 8",
        "maxReplicas: 10",
        "averageUtilization: 70"
      ]
    ],
    [
      "prod/availability-prod.yaml",
      [
        "kind: PodDisruptionBudget",
        "name: testhistory-worker",
        "name: testhistory-web",
        "minAvailable: 1",
        "minAvailable: 2"
      ]
    ],
    [
      "prod/network-prod.yaml",
      [
        "kind: NetworkPolicy",
        "name: testhistory-default-deny",
        "policyTypes:",
        "- Ingress",
        "- Egress",
        "name: testhistory-web-ingress",
        "name: testhistory-api-private-egress",
        "name: testhistory-worker-private-egress"
      ]
    ],
    [
      "prod/service-accounts-prod.yaml",
      [
        "kind: ServiceAccount",
        "name: testhistory-api",
        "name: testhistory-worker",
        "name: testhistory-web",
        "automountServiceAccountToken: false",
        "kind: Role",
        "kind: RoleBinding"
      ]
    ],
    [
      "prod/workload-prod.yaml",
      [
        "serviceAccountName: testhistory-api",
        "serviceAccountName: testhistory-worker",
        "serviceAccountName: testhistory-web",
        "replicas: 1",
        "replicas: 2",
        "replicas: 3"
      ]
    ]
  ]) {
    const source = overlayFiles.get(file);
    if (source === undefined) {
      throw new Error(`Missing Kubernetes overlay file ${file}`);
    }
    for (const snippet of snippets) {
      if (!source.includes(snippet)) {
        throw new Error(`Kubernetes overlay ${file} is missing snippet: ${snippet}`);
      }
    }
  }

  expectSingleApiReplicaTopology(repoRoot, overlayFiles);

  for (const snippet of [
    "k8s:validate:local",
    "k8s:deploy:local",
    "k8s:undeploy:local",
    "k8s:validate:prod",
    "k8s:deploy:prod",
    "k8s:undeploy:prod"
  ]) {
    if (!packageJson.includes(snippet)) {
      throw new Error(`package.json is missing Kubernetes overlay script: ${snippet}`);
    }
  }

  const kubernetesDocs = docs.get("docs/kubernetes-deployment.md") ?? "";
  for (const snippet of [
    "infra/k8s/overlays/local",
    "infra/k8s/overlays/prod",
    "npm run k8s:help",
    "npm run k8s:validate:local",
    "npm run k8s:deploy:prod",
    "npm run k8s:undeploy:prod",
    ".\\scripts\\k8s.ps1 validate-all -RequireKubectl",
    ".\\scripts\\k8s.ps1 deploy -KustomizePath infra/k8s/overlays/prod",
    ".\\scripts\\k8s.ps1 undeploy -KustomizePath infra/k8s/overlays/prod",
    "TESTHISTORY_K8S_SMOKE_URL",
    "TESTHISTORY_K8S_WEB_URL",
    "--web-url",
    "/health",
    "/docs",
    "HPA for worker and web workloads",
    "PDB for worker and web workloads",
    "exactly one API replica",
    "default-deny NetworkPolicy",
    "workload-specific service accounts"
  ]) {
    if (!kubernetesDocs.includes(snippet)) {
      throw new Error(`docs/kubernetes-deployment.md is missing overlay snippet: ${snippet}`);
    }
  }
}

function expectSingleApiReplicaTopology(repoRoot, overlayFiles) {
  const baseApi = readFileSync(
    path.join(repoRoot, "infra", "k8s", "base", "api-deployment.yaml"),
    "utf8"
  );
  const productionWorkloads = overlayFiles.get("prod/workload-prod.yaml") ?? "";
  const productionAutoscaling = overlayFiles.get("prod/autoscaling-prod.yaml") ?? "";
  const productionAvailability = overlayFiles.get("prod/availability-prod.yaml") ?? "";

  expectResourceReplicaCount(baseApi, "Deployment", "testhistory-api", 1, "base API deployment");
  expectResourceReplicaCount(
    productionWorkloads,
    "Deployment",
    "testhistory-api",
    1,
    "production API deployment patch"
  );

  if (findResourceDocument(productionAutoscaling, "HorizontalPodAutoscaler", "testhistory-api")) {
    throw new Error(
      "Production API must not define an HPA while the hydrated read model is process-local"
    );
  }

  if (findResourceDocument(productionAvailability, "PodDisruptionBudget", "testhistory-api")) {
    throw new Error(
      "Production API must not define a multi-replica PDB while only one API replica is supported"
    );
  }
}

function expectResourceReplicaCount(source, kind, name, expected, label) {
  const resource = findResourceDocument(source, kind, name);
  if (!resource) {
    throw new Error(`${label} is missing ${kind}/${name}`);
  }

  const match = resource.match(/^\s{2}replicas:\s*(\d+)\s*$/m);
  if (!match || Number(match[1]) !== expected) {
    throw new Error(
      `${label} must declare exactly ${expected} replica, got ${match?.[1] ?? "none"}`
    );
  }
}

function findResourceDocument(source, kind, name) {
  return source.split(/^---\s*$/m).find((document) => {
    const resourceKind = document.match(/^kind:\s*(\S+)\s*$/m)?.[1];
    const resourceName = document.match(/^metadata:\s*$[\s\S]*?^\s{2}name:\s*(\S+)\s*$/m)?.[1];
    return resourceKind === kind && resourceName === name;
  });
}

export function expectSecretPlaceholdersOnly(runtimeConfig) {
  if (!runtimeConfig) {
    throw new Error("Missing runtime-config.yaml");
  }

  const secretSection = runtimeConfig.split("stringData:")[1] ?? "";
  const entries = [...secretSection.matchAll(/^  ([A-Z0-9_]+):\s+"([^"]*)"$/gm)];
  if (entries.length === 0) {
    throw new Error("runtime-config.yaml Secret stringData is empty or not parseable");
  }

  for (const [, key, value] of entries) {
    if (!value.startsWith("replace-with-")) {
      throw new Error(`Secret ${key} must use a replace-with-* placeholder`);
    }
  }
}

export function expectPrivateDependencyEndpoints(runtimeConfig) {
  if (!runtimeConfig) {
    throw new Error("Missing runtime-config.yaml");
  }

  const config = parseRuntimeConfigMap(runtimeConfig);
  const privateEndpointKeys = ["S3_ENDPOINT", "CLICKHOUSE_URL", "OPENSEARCH_URL"];
  for (const key of privateEndpointKeys) {
    const value = config.get(key);
    if (!value) {
      throw new Error(`runtime-config.yaml is missing ${key}`);
    }
    if (!isPrivateEndpointPlaceholder(value) && !isPrivateClusterEndpoint(value)) {
      throw new Error(
        `${key} must be a private endpoint placeholder or internal cluster endpoint, got ${value}`
      );
    }
  }
}

export function expectNoDependencyIngress(ingress) {
  if (!ingress) {
    throw new Error("Missing ingress.yaml");
  }

  const dependencyPorts = ["5432", "6379", "5672", "9000", "8123", "9200"];
  for (const port of dependencyPorts) {
    if (ingress.includes(`number: ${port}`)) {
      throw new Error(`Dependency port ${port} must not be exposed through ingress`);
    }
  }
}

export function expectIngressHostPlaceholders(ingress) {
  if (!ingress) {
    throw new Error("Missing ingress.yaml");
  }

  for (const [, hostname] of ingress.matchAll(/^\s*host:\s+"?([^"\s]+)"?\s*$/gm)) {
    if (!hostname.startsWith("replace-with-")) {
      throw new Error(`Ingress host must be a placeholder, got ${hostname}`);
    }
  }

  let inHosts = false;
  for (const line of ingress.split(/\r?\n/)) {
    if (/^\s*hosts:\s*$/.test(line)) {
      inHosts = true;
      continue;
    }
    if (inHosts && /^\s*[A-Za-z]/.test(line)) {
      inHosts = false;
    }
    const hostMatch = line.match(/^\s*-\s+([A-Za-z0-9.-]+)\s*$/);
    if (inHosts && hostMatch && !hostMatch[1].startsWith("replace-with-")) {
      throw new Error(`Ingress TLS host must be a placeholder, got ${hostMatch[1]}`);
    }
  }
}

export function expectNoHardcodedOperationsValues(manifests) {
  const forbiddenText = [
    /\b(?:[a-z0-9-]+\.)*example\.(?:com|net|org|internal)\b/i,
    /\blocalhost\b/i,
    /\b127\.0\.0\.1\b/,
    /\b0\.0\.0\.0\b/,
    /\bpostgres:\/\/[^"\s$]*:[^@\s$]+@/i,
    /\bamqps?:\/\/[^"\s$]*:[^@\s$]+@/i,
    /\bredis:\/\/[^"\s$]*:[^@\s$]+@/i
  ];

  for (const [file, manifest] of manifests) {
    for (const pattern of forbiddenText) {
      if (pattern.test(manifest)) {
        throw new Error(`${file} contains a hardcoded hostname or credential pattern: ${pattern}`);
      }
    }

    for (const [, host] of manifest.matchAll(/\bhttps?:\/\/([^/"\s]+)/g)) {
      const hostname = host.split(":")[0];
      const allowed =
        hostname.startsWith("replace-with-") ||
        hostname.endsWith(".svc") ||
        hostname.endsWith(".svc.cluster.local") ||
        !hostname.includes(".");
      if (!allowed) {
        throw new Error(`${file} contains non-placeholder URL hostname: ${hostname}`);
      }
    }
  }
}

export function expectWorkloadResources(manifests) {
  for (const [file, manifest] of manifests) {
    if (!/\nkind:\s+(Deployment|Job)\b/.test(`\n${manifest}`)) {
      continue;
    }

    const containers = collectContainerBlocks(manifest);
    if (containers.length === 0) {
      throw new Error(`${file} has no container blocks to validate`);
    }

    for (const container of containers) {
      for (const snippet of ["resources:", "requests:", "limits:", "cpu:", "memory:"]) {
        if (!container.body.includes(snippet)) {
          throw new Error(`${file} container ${container.name} is missing resource ${snippet}`);
        }
      }
    }
  }
}

export function expectDeploymentProbes(manifests) {
  for (const [file, manifest] of manifests) {
    if (!/\nkind:\s+Deployment\b/.test(`\n${manifest}`)) {
      continue;
    }

    for (const container of collectContainerBlocks(manifest)) {
      for (const probe of ["startupProbe:", "readinessProbe:", "livenessProbe:"]) {
        if (!container.body.includes(probe)) {
          throw new Error(`${file} container ${container.name} is missing ${probe}`);
        }
      }
    }
  }
}

export function expectRolloutReferences(manifests, docs) {
  const migration = manifests.get("db-migration-job.yaml");
  if (!migration?.includes('testhistory.io/runbook: "docs/operations.md#migrations"')) {
    throw new Error("db-migration-job.yaml must reference the migration runbook");
  }

  for (const file of ["api-deployment.yaml", "worker-deployment.yaml"]) {
    const manifest = manifests.get(file) ?? "";
    for (const snippet of [
      'testhistory.io/requires-migration-job: "testhistory-db-migrate"',
      'testhistory.io/runbook: "docs/operations.md#migrations"',
      'testhistory.io/dependency-endpoints: "private-only"'
    ]) {
      if (!manifest.includes(snippet)) {
        throw new Error(`${file} is missing rollout reference: ${snippet}`);
      }
    }
  }

  for (const file of ["mcp-deployment.yaml", "web-deployment.yaml"]) {
    const manifest = manifests.get(file) ?? "";
    for (const snippet of [
      'testhistory.io/requires-api-rollout: "testhistory-api"',
      'testhistory.io/runbook: "docs/operations.md#migrations"'
    ]) {
      if (!manifest.includes(snippet)) {
        throw new Error(`${file} is missing rollout reference: ${snippet}`);
      }
    }
  }

  const operations = docs.get("docs/operations.md") ?? "";
  const localDevelopment = docs.get("docs/local-development.md") ?? "";
  for (const snippet of [
    "testhistory-db-migrate",
    "kubectl wait --for=condition=complete",
    "testhistory.migration.complete",
    "private dependency endpoints",
    "Backup And Restore Drill"
  ]) {
    if (!operations.includes(snippet)) {
      throw new Error(`docs/operations.md is missing runbook reference: ${snippet}`);
    }
  }
  if (!localDevelopment.includes("testhistory-db-migrate")) {
    throw new Error("docs/local-development.md must reference the migration Job");
  }
}

export function expectPolicySecretPlaceholdersOnly(file, manifest) {
  const secretSection = manifest.split("stringData:")[1] ?? "";
  const entries = [...secretSection.matchAll(/^  ([A-Z0-9_]+):\s+"([^"]*)"$/gm)];
  if (entries.length === 0) {
    throw new Error(`${file} Secret stringData is empty or not parseable`);
  }

  for (const [, key, value] of entries) {
    if (!value.startsWith("replace-with-")) {
      throw new Error(`${file} Secret ${key} must use a replace-with-* placeholder`);
    }
  }
}

export function expectBackupRestoreEvidencePlaceholders(docs) {
  const operations = docs.get("docs/operations.md") ?? "";
  for (const snippet of [
    "Restore Evidence Placeholder",
    "replace-with-backup-id",
    "replace-with-restore-start-time",
    "replace-with-restore-end-time",
    "replace-with-migration-version",
    "replace-with-smoke-result",
    "replace-with-operator"
  ]) {
    if (!operations.includes(snippet)) {
      throw new Error(`docs/operations.md is missing restore evidence placeholder: ${snippet}`);
    }
  }
}

export function expectMigrationJob(manifests, file) {
  const manifest = manifests.get(file);
  if (!manifest) {
    throw new Error(`Missing ${file}`);
  }

  const requiredSnippets = [
    "kind: Job",
    "name: testhistory-db-migrate",
    "image: testhistory-api:local",
    "restartPolicy: Never",
    "automountServiceAccountToken: false",
    "resolvePostgresPersistenceConfig",
    "createPostgresPersistence",
    "redactPostgresConnectionString",
    "secretKeyRef:",
    "key: DATABASE_URL"
  ];

  for (const snippet of requiredSnippets) {
    if (!manifest.includes(snippet)) {
      throw new Error(`${file} is missing migration job snippet: ${snippet}`);
    }
  }

  const forbiddenSecretLiterals = [
    /DATABASE_URL:\s*postgres/i,
    /postgres:\/\/[^"\s]+/i,
    /password\s*[:=]\s*[^"\s]+/i,
    /S3_SECRET_ACCESS_KEY:\s*[^"\s]+/i
  ];

  for (const pattern of forbiddenSecretLiterals) {
    if (pattern.test(manifest)) {
      throw new Error(`${file} must not contain literal dependency credentials`);
    }
  }
}

function parseRuntimeConfigMap(runtimeConfig) {
  const dataSection = runtimeConfig.split("\n---")[0] ?? "";
  const entries = [...dataSection.matchAll(/^  ([A-Z0-9_]+):\s+"([^"]*)"$/gm)];
  return new Map(entries.map(([, key, value]) => [key, value]));
}

function isPrivateEndpointPlaceholder(value) {
  return value.startsWith("replace-with-private-");
}

function isPrivateClusterEndpoint(value) {
  let hostname;
  try {
    hostname = new URL(value).hostname;
  } catch {
    return false;
  }

  return (
    hostname.endsWith(".svc") ||
    hostname.endsWith(".svc.cluster.local") ||
    (!hostname.includes(".") && hostname !== "localhost")
  );
}

function collectContainerBlocks(manifest) {
  const lines = manifest.split(/\r?\n/);
  const containers = [];
  let containersIndent;
  let current;

  for (const line of lines) {
    const indent = leadingSpaces(line);
    if (/^\s*containers:\s*$/.test(line)) {
      containersIndent = indent;
      current = undefined;
      continue;
    }

    if (containersIndent === undefined) {
      continue;
    }

    if (line.trim() !== "" && indent <= containersIndent) {
      if (current) {
        containers.push(current);
      }
      containersIndent = undefined;
      current = undefined;
      continue;
    }

    const containerMatch = line.match(/^\s*-\s+name:\s+([A-Za-z0-9._-]+)\s*$/);
    if (containerMatch && indent === containersIndent + 2) {
      if (current) {
        containers.push(current);
      }
      current = { name: containerMatch[1], body: `${line}\n` };
      continue;
    }

    if (current) {
      current.body += `${line}\n`;
    }
  }

  if (current) {
    containers.push(current);
  }

  return containers;
}

function leadingSpaces(line) {
  return line.length - line.trimStart().length;
}

export function commandExists(command) {
  try {
    if (process.platform === "win32") {
      execFileSync("where.exe", [command], { stdio: "ignore" });
    } else {
      execFileSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore" });
    }
    return true;
  } catch {
    return false;
  }
}
