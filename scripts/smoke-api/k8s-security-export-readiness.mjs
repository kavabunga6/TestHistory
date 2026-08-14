import {
  expectNoRealExportEndpointsCredentialsOrSignedUrls,
  expectOperationsWorkflowCoverage,
  expectWorkerExportSecretRefs,
  markdownSection,
  parsePolicyConfigMap,
  parsePolicySecret
} from "./k8s-policy-readiness.mjs";

export function expectSecurityAuditExportOperationalConstraints(manifests, docs, workflows) {
  const policy = manifests.get("security-audit-policy.yaml") ?? "";
  const operations = docs.get("docs/operations.md") ?? "";
  const exportSection = markdownSection(
    operations,
    "Security Audit Retention And Export Policy",
    "Backup And Restore Drill"
  );

  const config = parsePolicyConfigMap(policy);
  const secret = parsePolicySecret(policy);
  const requiredSecretKeys = [
    "SECURITY_AUDIT_EXPORT_ENDPOINT",
    "SECURITY_AUDIT_EXPORT_CLIENT_ID",
    "SECURITY_AUDIT_EXPORT_CLIENT_SECRET",
    "SECURITY_AUDIT_EXPORT_TOKEN",
    "SECURITY_AUDIT_EXPORT_ENCRYPTION_KEY"
  ];

  if (config.get("SECURITY_AUDIT_EXPORT_ENABLED") !== "false") {
    throw new Error("security-audit-policy.yaml must keep audit export disabled by default");
  }

  if (config.get("SECURITY_AUDIT_EXPORT_SECRET_REF") !== secret.name) {
    throw new Error(
      `SECURITY_AUDIT_EXPORT_SECRET_REF must match Secret name ${secret.name}, got ${
        config.get("SECURITY_AUDIT_EXPORT_SECRET_REF") ?? "missing"
      }`
    );
  }

  expectSecurityAuditExportLifecyclePlaceholders(config, manifests, exportSection);
  expectSecurityAuditExportLifecycleReplayProbes(config, manifests, exportSection, workflows);
  expectSecurityAuditExportLifecycleInvariantProbes(config, manifests, exportSection, workflows);
  expectSecurityAuditExportMaterializedInvariantDeployment(
    config,
    manifests,
    exportSection,
    workflows
  );

  for (const key of requiredSecretKeys) {
    const value = secret.stringData.get(key);
    if (value === undefined) {
      throw new Error(`security-audit-policy.yaml Secret is missing ${key}`);
    }
    if (value !== `replace-with-${key.toLowerCase().replaceAll("_", "-")}`) {
      throw new Error(`${key} must use a deterministic replace-with-* placeholder`);
    }
  }

  expectWorkerExportSecretRefs(manifests.get("worker-deployment.yaml") ?? "", secret.name, [
    ...requiredSecretKeys
  ]);

  for (const [key, value] of config) {
    if (!key.startsWith("SECURITY_AUDIT_EXPORT_")) {
      continue;
    }
    if (/^https?:\/\//i.test(value)) {
      throw new Error(`${key} must not contain a real export endpoint URL`);
    }
    if (key.includes("PROVIDER") || key.includes("DESTINATION")) {
      if (!value.startsWith("replace-with-")) {
        throw new Error(`${key} must stay provider-neutral with a replace-with-* placeholder`);
      }
    }
  }

  expectNoRealExportEndpointsCredentialsOrSignedUrls(
    "infra/k8s/base/security-audit-policy.yaml",
    policy
  );
  expectNoRealExportEndpointsCredentialsOrSignedUrls(
    "docs/operations.md#security-audit-retention-and-export-policy",
    exportSection
  );

  for (const snippet of [
    "provider-neutral",
    "lifecycle placeholders",
    "placeholder-state-only",
    "provider-neutral redacted metadata",
    "no export-provider runtime action",
    "placeholder and secret-reference validation only",
    "not prove that any export provider",
    "must not include signed URLs",
    "deterministic, read-only, project-scoped, actor-scoped, and provider-neutral",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_ROUTE=/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants",
    "bounded read-only HTTP contract checks",
    "must not refresh replay state",
    "npm run k8s:validate",
    "npm run guard:sensitive",
    "npx prettier --check docs/api.md docs/kubernetes-deployment.md docs/local-development.md docs/operations.md docs/screenshots/README.md .github/workflows infra/k8s scripts",
    "git diff --check -- infra/k8s .github/workflows docs/operations.md docs/screenshots/README.md scripts"
  ]) {
    if (!exportSection.includes(snippet)) {
      throw new Error(`docs/operations.md is missing export operations wording: ${snippet}`);
    }
  }

  expectOperationsWorkflowCoverage(workflows, "export smoke");
}

export function expectSecurityAuditExportLifecyclePlaceholders(config, manifests, exportSection) {
  const lifecycleStates = ["requested", "evaluated", "approved", "denied", "cancelled", "expired"];
  const configuredStates = config.get("SECURITY_AUDIT_EXPORT_LIFECYCLE_STATES")?.split(",");
  if (configuredStates?.join(",") !== lifecycleStates.join(",")) {
    throw new Error(`SECURITY_AUDIT_EXPORT_LIFECYCLE_STATES must be ${lifecycleStates.join(",")}`);
  }

  for (const [key, expected] of [
    ["SECURITY_AUDIT_EXPORT_LIFECYCLE_MODE", "placeholder-state-only"],
    ["SECURITY_AUDIT_EXPORT_LIFECYCLE_METADATA", "provider-neutral-redacted"],
    ["SECURITY_AUDIT_EXPORT_LIFECYCLE_RUNTIME_ACTION", "none-placeholder-only"],
    ["SECURITY_AUDIT_EXPORT_LIFECYCLE_SAMPLE_REQUEST_ID", "replace-with-audit-export-request-id"]
  ]) {
    if (config.get(key) !== expected) {
      throw new Error(`${key} must be ${expected}`);
    }
  }

  const worker = manifests.get("worker-deployment.yaml") ?? "";
  if (
    !worker.includes('testhistory.io/security-audit-export-lifecycle: "placeholder-state-only"')
  ) {
    throw new Error("worker-deployment.yaml must advertise placeholder export lifecycle state");
  }

  const forbiddenLifecycleClaims = [
    /\bexport\s+(?:started|completed|uploaded|delivered|executed)\b/i,
    /\b(?:provider|adapter)\s+(?:job|run|execution|upload)\b/i,
    /\b(?:job|run|execution|upload|download)(?:Id|Url)\b/
  ];
  for (const [label, text] of [
    [
      "infra/k8s/base/security-audit-policy.yaml",
      [...config].map((entry) => entry.join("=")).join("\n")
    ],
    ["docs/operations.md lifecycle placeholders", exportSection]
  ]) {
    for (const pattern of forbiddenLifecycleClaims) {
      if (pattern.test(text)) {
        throw new Error(`${label} contains an executable export lifecycle claim: ${pattern}`);
      }
    }
  }
}

export function expectSecurityAuditExportLifecycleReplayProbes(
  config,
  manifests,
  exportSection,
  workflows
) {
  const lifecycleStates = ["requested", "evaluated", "approved", "denied", "cancelled", "expired"];
  const replayProbes = config.get("SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_PROBES")?.split(",");
  if (replayProbes?.join(",") !== lifecycleStates.join(",")) {
    throw new Error(
      `SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_PROBES must match ${lifecycleStates.join(",")}`
    );
  }

  for (const [key, expected] of [
    ["SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_MODE", "deterministic-read-only-placeholder"],
    ["SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_SCOPE", "project-and-actor-placeholder"],
    [
      "SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_SAMPLE_ACTOR_ID",
      "replace-with-audit-export-actor-id"
    ],
    [
      "SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_SAMPLE_PROJECT_ID",
      "replace-with-audit-export-project-id"
    ]
  ]) {
    if (config.get(key) !== expected) {
      throw new Error(`${key} must be ${expected}`);
    }
  }

  const worker = manifests.get("worker-deployment.yaml") ?? "";
  if (
    !worker.includes(
      'testhistory.io/security-audit-export-replay-probe: "read-only-provider-neutral"'
    )
  ) {
    throw new Error("worker-deployment.yaml must advertise read-only audit export replay probes");
  }

  for (const snippet of [
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_PROBES=requested,evaluated,approved,denied,cancelled,expired",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_MODE=deterministic-read-only-placeholder",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_SCOPE=project-and-actor-placeholder",
    "replace-with-audit-export-actor-id",
    "replace-with-audit-export-project-id",
    "scoped placeholder reads only",
    "without contacting an export provider or reading raw audit payloads"
  ]) {
    if (!exportSection.includes(snippet)) {
      throw new Error(`docs/operations.md is missing lifecycle replay probe wording: ${snippet}`);
    }
  }

  const sampleReplay = buildSecurityAuditExportReplayProbeSample(config);
  const serialized = JSON.stringify(sampleReplay);
  for (const marker of [
    "https://",
    "http://",
    "X-Amz-Signature",
    "Authorization",
    "Bearer ",
    "C:\\",
    "/Users/",
    "storage://",
    "minio://",
    "blob://"
  ]) {
    if (serialized.includes(marker)) {
      throw new Error(`Lifecycle replay probe sample leaked forbidden marker: ${marker}`);
    }
  }

  expectOperationsWorkflowCoverage(workflows, "lifecycle replay");
}

export function expectSecurityAuditExportLifecycleInvariantProbes(
  config,
  manifests,
  exportSection,
  workflows
) {
  const invariants = [
    "deterministic",
    "recomputable",
    "append-only",
    "project-scope",
    "actor-scope",
    "provider-neutral",
    "secret-free",
    "read-only"
  ];
  const configuredInvariants = config
    .get("SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_PROBES")
    ?.split(",");
  if (configuredInvariants?.join(",") !== invariants.join(",")) {
    throw new Error(
      `SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_PROBES must be ${invariants.join(",")}`
    );
  }

  for (const [key, expected] of [
    ["SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_MODE", "read-model-contract-only"],
    [
      "SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_ROUTE",
      "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants"
    ],
    ["SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_SAMPLE_LIMIT", "10"],
    [
      "SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_SAMPLE_CURSOR",
      "replace-with-audit-export-invariant-cursor"
    ]
  ]) {
    if (config.get(key) !== expected) {
      throw new Error(`${key} must be ${expected}`);
    }
  }

  const worker = manifests.get("worker-deployment.yaml") ?? "";
  if (
    !worker.includes(
      'testhistory.io/security-audit-export-invariant-probe: "read-only-provider-neutral"'
    )
  ) {
    throw new Error(
      "worker-deployment.yaml must advertise read-only audit export invariant probes"
    );
  }

  for (const snippet of [
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_PROBES=deterministic,recomputable,append-only,project-scope,actor-scope,provider-neutral,secret-free,read-only",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_MODE=read-model-contract-only",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_ROUTE=/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_SAMPLE_LIMIT=10",
    "replace-with-audit-export-invariant-cursor",
    "bounded read-only HTTP contract checks",
    "not replay execution",
    "must not refresh replay state",
    "mutate lifecycle state",
    "resolve destination secrets",
    "contact provider endpoints",
    "read raw lifecycle events and request payloads"
  ]) {
    if (!exportSection.includes(snippet)) {
      throw new Error(
        `docs/operations.md is missing lifecycle invariant probe wording: ${snippet}`
      );
    }
  }

  const sample = buildSecurityAuditExportLifecycleInvariantProbeSample(config);
  if (
    sample.readOnly !== true ||
    sample.providerNeutral !== true ||
    sample.rawLifecycleEventAccess !== false ||
    sample.requestPayloadAccess !== false ||
    sample.secretsResolved !== false ||
    sample.providerContacted !== false ||
    sample.exportProviderAction !== false ||
    sample.lifecycleMutation !== false ||
    sample.replayRefresh !== false
  ) {
    throw new Error(
      `Lifecycle invariant probe sample must be read-only: ${JSON.stringify(sample)}`
    );
  }

  const serialized = JSON.stringify(sample);
  for (const marker of [
    "https://",
    "http://",
    "X-Amz-Signature",
    "Authorization",
    "Bearer ",
    "C:\\",
    "/Users/",
    "storage://",
    "minio://",
    "blob://",
    "signedUrl",
    "secretKey"
  ]) {
    if (serialized.includes(marker)) {
      throw new Error(`Lifecycle invariant probe sample leaked forbidden marker: ${marker}`);
    }
  }

  expectOperationsWorkflowCoverage(workflows, "lifecycle invariant");
}

export function expectSecurityAuditExportMaterializedInvariantDeployment(
  config,
  manifests,
  exportSection,
  workflows
) {
  const expectedRoute =
    "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized";
  const baseRoute = config.get("SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_ROUTE");

  for (const [key, expected] of [
    [
      "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_MODE",
      "materialized-read-model-contract-only"
    ],
    ["SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_ROUTE", expectedRoute],
    [
      "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_MARKER",
      "security-audit-export-lifecycle-replay-invariant-materialized-read"
    ],
    [
      "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_BOUNDARY",
      "worker-compatible-security-audit-export-lifecycle-replay-invariant-materialized-read"
    ],
    [
      "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_MUTATION_BOUNDARY",
      "api-materialized-read-only-no-export-provider-mutation"
    ],
    [
      "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_SURFACE",
      "existing-api-mcp-read-model-only"
    ],
    [
      "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_EXECUTABLE_ENDPOINTS",
      "none-executable-provider-endpoints"
    ],
    [
      "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_SECRET_MOUNTS",
      "api-mcp-none-worker-placeholder-only"
    ],
    ["SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_SIGNED_URLS", "none"]
  ]) {
    if (config.get(key) !== expected) {
      throw new Error(`${key} must be ${expected}`);
    }
  }

  if (`${baseRoute}/materialized` !== expectedRoute) {
    throw new Error("Materialized invariant route must extend the existing invariant read route");
  }

  const worker = manifests.get("worker-deployment.yaml") ?? "";
  if (
    !worker.includes(
      'testhistory.io/security-audit-export-materialized-invariant-read: "provider-neutral-secret-free"'
    )
  ) {
    throw new Error(
      "worker-deployment.yaml must advertise provider-neutral materialized invariant reads"
    );
  }

  for (const file of ["api-deployment.yaml", "mcp-deployment.yaml"]) {
    const manifest = manifests.get(file) ?? "";
    for (const snippet of [
      'testhistory.io/security-audit-export-materialized-invariant-read: "provider-neutral-secret-free"',
      'testhistory.io/security-audit-export-materialized-secret-mount: "none"',
      'testhistory.io/security-audit-export-provider-endpoints: "none"'
    ]) {
      if (!manifest.includes(snippet)) {
        throw new Error(`${file} is missing materialized export guard annotation: ${snippet}`);
      }
    }
    if (manifest.includes("name: testhistory-security-audit-export")) {
      throw new Error(`${file} must not mount the audit export Secret for materialized reads`);
    }
    for (const key of [
      "SECURITY_AUDIT_EXPORT_ENDPOINT",
      "SECURITY_AUDIT_EXPORT_CLIENT_ID",
      "SECURITY_AUDIT_EXPORT_CLIENT_SECRET",
      "SECURITY_AUDIT_EXPORT_TOKEN",
      "SECURITY_AUDIT_EXPORT_ENCRYPTION_KEY"
    ]) {
      if (manifest.includes(`key: ${key}`)) {
        throw new Error(`${file} must not wire ${key} for materialized reads`);
      }
    }
  }

  for (const snippet of [
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_MODE=materialized-read-model-contract-only",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_ROUTE=/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_MARKER=security-audit-export-lifecycle-replay-invariant-materialized-read",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_BOUNDARY=worker-compatible-security-audit-export-lifecycle-replay-invariant-materialized-read",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_MUTATION_BOUNDARY=api-materialized-read-only-no-export-provider-mutation",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_SURFACE=existing-api-mcp-read-model-only",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_EXECUTABLE_ENDPOINTS=none-executable-provider-endpoints",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_SECRET_MOUNTS=api-mcp-none-worker-placeholder-only",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_SIGNED_URLS=none",
    "provider-neutral, secret-free, and read-only deployment evidence",
    "without creating a new runtime endpoint",
    "API and MCP free of the audit export Secret",
    "do not advertise provider endpoints, signed URLs, destination resolution, export execution, or new runtime endpoints",
    "no API or MCP Secret mount",
    "no executable provider endpoint",
    "no signed URL claim"
  ]) {
    if (!exportSection.includes(snippet)) {
      throw new Error(
        `docs/operations.md is missing materialized invariant deployment wording: ${snippet}`
      );
    }
  }

  const sample = buildSecurityAuditExportMaterializedInvariantDeploymentSample(config);
  if (
    sample.readOnly !== true ||
    sample.providerNeutral !== true ||
    sample.secretFree !== true ||
    sample.providerEndpointsIncluded !== false ||
    sample.signedUrlsIncluded !== false ||
    sample.secretsResolved !== false ||
    sample.destinationResolved !== false ||
    sample.exportProviderAction !== false ||
    sample.runtimeEndpointIntroduced !== false ||
    sample.surface !== "existing-api-mcp-read-model-only" ||
    sample.providerEndpointPolicy !== "none-executable-provider-endpoints" ||
    sample.secretMountPolicy !== "api-mcp-none-worker-placeholder-only" ||
    sample.signedUrlPolicy !== "none"
  ) {
    throw new Error(
      `Materialized invariant deployment sample must stay secret-free: ${JSON.stringify(sample)}`
    );
  }

  const serialized = JSON.stringify(sample);
  for (const marker of [
    "https://",
    "http://",
    "X-Amz-Signature",
    "Authorization",
    "Bearer ",
    "C:\\",
    "/Users/",
    "storage://",
    "minio://",
    "blob://",
    '"signedUrl":',
    "clientSecret"
  ]) {
    if (serialized.includes(marker)) {
      throw new Error(
        `Materialized invariant deployment sample leaked forbidden marker: ${marker}`
      );
    }
  }

  expectOperationsWorkflowCoverage(workflows, "materialized invariant deployment");
}

function buildSecurityAuditExportMaterializedInvariantDeploymentSample(config) {
  return {
    kind: config.get("SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_MARKER"),
    mode: config.get("SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_MODE"),
    route: config.get("SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_ROUTE"),
    boundary: config.get("SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_BOUNDARY"),
    mutationBoundary: config.get(
      "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_MUTATION_BOUNDARY"
    ),
    surface: config.get("SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_SURFACE"),
    providerEndpointPolicy: config.get(
      "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_EXECUTABLE_ENDPOINTS"
    ),
    secretMountPolicy: config.get(
      "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_SECRET_MOUNTS"
    ),
    signedUrlPolicy: config.get(
      "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_SIGNED_URLS"
    ),
    readOnly: true,
    providerNeutral: true,
    secretFree: true,
    providerEndpointsIncluded: false,
    signedUrlsIncluded: false,
    secretsResolved: false,
    destinationResolved: false,
    exportProviderAction: false,
    runtimeEndpointIntroduced: false
  };
}

function buildSecurityAuditExportLifecycleInvariantProbeSample(config) {
  return {
    kind: "security-audit-export-lifecycle-invariant-probe",
    mode: config.get("SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_MODE"),
    route: config.get("SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_ROUTE"),
    limit: Number(config.get("SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_SAMPLE_LIMIT")),
    cursor: config.get("SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_SAMPLE_CURSOR"),
    invariants: config.get("SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_PROBES")?.split(",") ?? [],
    readOnly: true,
    providerNeutral: true,
    rawLifecycleEventAccess: false,
    requestPayloadAccess: false,
    secretsResolved: false,
    providerContacted: false,
    exportProviderAction: false,
    lifecycleMutation: false,
    replayRefresh: false
  };
}

function buildSecurityAuditExportReplayProbeSample(config) {
  return {
    kind: "security-audit-export-lifecycle-replay-probe",
    mode: config.get("SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_MODE"),
    scope: config.get("SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_SCOPE"),
    actorId: config.get("SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_SAMPLE_ACTOR_ID"),
    projectId: config.get("SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_SAMPLE_PROJECT_ID"),
    states: config.get("SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_PROBES")?.split(",") ?? [],
    readOnly: true,
    providerNeutral: true,
    rawPayloadAccess: false,
    exportProviderAction: false,
    redaction: config.get("SECURITY_AUDIT_EXPORT_LIFECYCLE_METADATA")
  };
}
