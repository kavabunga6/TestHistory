import { expectPolicySecretPlaceholdersOnly } from "./k8s-manifest-readiness.mjs";
import { expectOperationsWorkflowCoverage } from "./k8s-policy-readiness.mjs";

export function expectEnterpriseAuthAuditOperations(manifests, docs, workflows) {
  const runtimeConfig = manifests.get("runtime-config.yaml") ?? "";
  for (const snippet of [
    'AUTH_MODE: "oidc-placeholder"',
    'AUTH_AUDIT_ENABLED: "true"',
    'AUTH_AUDIT_SINK: "stdout-json"',
    'AUTH_AUDIT_REDACTION: "strict"',
    'AUTH_PROBE_MODE: "anonymous-health-only"',
    'SECURITY_AUDIT_ENABLED: "true"',
    'SECURITY_AUDIT_SINK: "stdout-json"',
    'SECURITY_AUDIT_STREAM: "security-audit"',
    'SECURITY_AUDIT_REDACTION: "strict"',
    'SECURITY_AUDIT_RETENTION_DAYS: "365"',
    'SECURITY_AUDIT_PROBE_EVENT: "security.audit.probe"',
    'OIDC_ISSUER_URL: "replace-with-private-oidc-issuer-url"',
    'OIDC_JWKS_URL: "replace-with-private-oidc-jwks-url"',
    'PRIVATE_NPM_REGISTRY: "replace-with-private-npm-registry-url"',
    'MIGRATION_STRATEGY: "pre-rollout-job"',
    'MIGRATION_LOCK_NAME: "testhistory-db-migrate"',
    'OIDC_CLIENT_ID: "replace-with-oidc-client-id"',
    'OIDC_CLIENT_SECRET: "replace-with-oidc-client-secret"',
    'AUTH_SESSION_SIGNING_KEY: "replace-with-auth-session-signing-key"',
    'AUTH_PROBE_TOKEN: "replace-with-auth-probe-token"',
    'SECURITY_AUDIT_SIGNING_KEY: "replace-with-security-audit-signing-key"',
    'SECURITY_AUDIT_SINK_TOKEN: "replace-with-security-audit-sink-token"'
  ]) {
    if (!runtimeConfig.includes(snippet)) {
      throw new Error(`runtime-config.yaml is missing enterprise auth/audit snippet: ${snippet}`);
    }
  }

  const authSensitiveManifests = new Map([
    [
      "api-deployment.yaml",
      [
        'testhistory.io/auth-boundary: "oidc-placeholder"',
        'testhistory.io/auth-probe-credential: "none-health-only"',
        'testhistory.io/audit-redaction: "strict"',
        'testhistory.io/security-audit-sink: "stdout-json"',
        'testhistory.io/security-audit-events: "security.audit.read,security.audit.denied,auth.probe.accepted,auth.probe.denied"',
        'testhistory.io/probe-classification: "security.audit.probe"',
        "name: X-TestHistory-Probe",
        "key: OIDC_CLIENT_SECRET",
        "key: AUTH_SESSION_SIGNING_KEY",
        "key: SECURITY_AUDIT_SIGNING_KEY",
        "key: SECURITY_AUDIT_SINK_TOKEN"
      ]
    ],
    [
      "worker-deployment.yaml",
      [
        'testhistory.io/auth-boundary: "service-audit-only"',
        'testhistory.io/audit-redaction: "strict"',
        'testhistory.io/security-audit-sink: "stdout-json"',
        'testhistory.io/security-audit-events: "security.audit.worker,security.audit.cleanup,security.audit.retention"',
        'testhistory.io/probe-classification: "worker.health.synthetic"',
        "key: SECURITY_AUDIT_SIGNING_KEY",
        "key: SECURITY_AUDIT_SINK_TOKEN"
      ]
    ],
    [
      "mcp-deployment.yaml",
      [
        'testhistory.io/auth-boundary: "read-only-mcp"',
        'testhistory.io/auth-probe-credential: "synthetic-stdin-only"',
        'testhistory.io/audit-redaction: "strict"',
        'testhistory.io/security-audit-sink: "stdout-json"',
        'testhistory.io/security-audit-events: "security.audit.mcp.read,security.audit.mcp.denied"',
        'testhistory.io/probe-classification: "mcp.health.synthetic-json-rpc"',
        "key: AUTH_PROBE_TOKEN",
        "key: SECURITY_AUDIT_SIGNING_KEY",
        "key: SECURITY_AUDIT_SINK_TOKEN"
      ]
    ],
    [
      "web-deployment.yaml",
      [
        'testhistory.io/auth-boundary: "browser-session-shell"',
        'testhistory.io/auth-probe-credential: "none-health-only"',
        'testhistory.io/audit-redaction: "strict"',
        'testhistory.io/probe-classification: "web.health.static-shell"',
        "name: X-TestHistory-Probe"
      ]
    ],
    [
      "db-migration-job.yaml",
      [
        'testhistory.io/hook-phase: "pre-rollout"',
        'testhistory.io/hook-blocks: "testhistory-api,testhistory-worker"',
        'testhistory.io/audit-event: "testhistory.migration.complete"',
        'testhistory.io/security-audit-sink: "stdout-json"',
        'testhistory.io/probe-classification: "migration.one-shot"'
      ]
    ]
  ]);

  for (const [file, snippets] of authSensitiveManifests) {
    const manifest = manifests.get(file) ?? "";
    for (const snippet of snippets) {
      if (!manifest.includes(snippet)) {
        throw new Error(`${file} is missing enterprise auth/audit snippet: ${snippet}`);
      }
    }
  }

  const operations = docs.get("docs/operations.md") ?? "";
  for (const snippet of [
    "Enterprise Auth And Audit",
    "AUTH_PROBE_MODE=anonymous-health-only",
    "OIDC_CLIENT_SECRET",
    "AUTH_SESSION_SIGNING_KEY",
    "SECURITY_AUDIT_SIGNING_KEY",
    "SECURITY_AUDIT_SINK_TOKEN",
    "SECURITY_AUDIT_PROBE_EVENT=security.audit.probe",
    "security.audit.read",
    "TESTHISTORY_NPM_TOKEN",
    "No production JWTs, cookies, API keys, or OIDC client secrets belong in git"
  ]) {
    if (!operations.includes(snippet)) {
      throw new Error(`docs/operations.md is missing enterprise auth/audit reference: ${snippet}`);
    }
  }

  const ci = workflows.get(".github/workflows/ci.yml") ?? "";
  for (const snippet of [
    "operations-contract:",
    "TESTHISTORY_PRIVATE_NPM_REGISTRY",
    "TESTHISTORY_NPM_TOKEN",
    "npx prettier --check docs/api.md docs/kubernetes-deployment.md docs/local-development.md docs/operations.md docs/screenshots/README.md .github/workflows infra/k8s scripts",
    "Kubernetes operations readiness smoke",
    "azure/setup-kubectl@v4",
    "TESTHISTORY_K8S_REQUIRE_KUBECTL",
    "npm run k8s:validate",
    "npm run guard:sensitive"
  ]) {
    if (!ci.includes(snippet)) {
      throw new Error(
        `.github/workflows/ci.yml is missing operations contract snippet: ${snippet}`
      );
    }
  }

  const docker = workflows.get(".github/workflows/docker.yml") ?? "";
  for (const snippet of [
    "TESTHISTORY_PRIVATE_NPM_REGISTRY",
    "build-args:",
    "secrets:",
    "npm_token=${{ secrets.TESTHISTORY_NPM_TOKEN }}"
  ]) {
    if (!docker.includes(snippet)) {
      throw new Error(
        `.github/workflows/docker.yml is missing private dependency snippet: ${snippet}`
      );
    }
  }
}

export function expectSecurityAuditRetentionExportPolicy(manifests, docs, workflows) {
  const policy = manifests.get("security-audit-policy.yaml") ?? "";
  if (!policy) {
    throw new Error("Missing security-audit-policy.yaml");
  }

  for (const snippet of [
    "kind: ConfigMap",
    "name: testhistory-security-audit-policy",
    'testhistory.io/runbook: "docs/operations.md#security-audit-retention-and-export-policy"',
    'testhistory.io/audit-policy-state: "placeholder-only"',
    'SECURITY_AUDIT_RETENTION_POLICY: "bounded-placeholder"',
    'SECURITY_AUDIT_RETENTION_MIN_DAYS: "90"',
    'SECURITY_AUDIT_RETENTION_DAYS: "365"',
    'SECURITY_AUDIT_RETENTION_MAX_DAYS: "2555"',
    'SECURITY_AUDIT_RETENTION_DELETE_MODE: "preview-before-delete"',
    'SECURITY_AUDIT_EXPORT_ENABLED: "false"',
    'SECURITY_AUDIT_EXPORT_PROVIDER: "replace-with-audit-export-provider"',
    'SECURITY_AUDIT_EXPORT_DESTINATION: "replace-with-audit-export-destination"',
    'SECURITY_AUDIT_EXPORT_PREFIX: "security-audit/replace-with-environment"',
    'SECURITY_AUDIT_EXPORT_FORMAT: "jsonl-redacted"',
    'SECURITY_AUDIT_EXPORT_APPROVAL: "manual-approved"',
    'SECURITY_AUDIT_EXPORT_SECRET_REF: "testhistory-security-audit-export"',
    'SECURITY_AUDIT_EXPORT_SIGNING: "required-when-enabled"',
    'SECURITY_AUDIT_EXPORT_PAYLOAD_CLASS: "metadata-only-redacted"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_STATES: "requested,evaluated,approved,denied,cancelled,expired"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_MODE: "placeholder-state-only"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_METADATA: "provider-neutral-redacted"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_RUNTIME_ACTION: "none-placeholder-only"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_SAMPLE_REQUEST_ID: "replace-with-audit-export-request-id"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_PROBES: "requested,evaluated,approved,denied,cancelled,expired"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_MODE: "deterministic-read-only-placeholder"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_SCOPE: "project-and-actor-placeholder"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_SAMPLE_ACTOR_ID: "replace-with-audit-export-actor-id"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_SAMPLE_PROJECT_ID: "replace-with-audit-export-project-id"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_PROBES: "deterministic,recomputable,append-only,project-scope,actor-scope,provider-neutral,secret-free,read-only"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_MODE: "read-model-contract-only"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_ROUTE: "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_SAMPLE_LIMIT: "10"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_SAMPLE_CURSOR: "replace-with-audit-export-invariant-cursor"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_MODE: "materialized-read-model-contract-only"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_ROUTE: "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_MARKER: "security-audit-export-lifecycle-replay-invariant-materialized-read"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_BOUNDARY: "worker-compatible-security-audit-export-lifecycle-replay-invariant-materialized-read"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_MUTATION_BOUNDARY: "api-materialized-read-only-no-export-provider-mutation"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_SURFACE: "existing-api-mcp-read-model-only"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_EXECUTABLE_ENDPOINTS: "none-executable-provider-endpoints"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_SECRET_MOUNTS: "api-mcp-none-worker-placeholder-only"',
    'SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_SIGNED_URLS: "none"',
    "kind: Secret",
    "name: testhistory-security-audit-export",
    'SECURITY_AUDIT_EXPORT_ENDPOINT: "replace-with-security-audit-export-endpoint"',
    'SECURITY_AUDIT_EXPORT_CLIENT_ID: "replace-with-security-audit-export-client-id"',
    'SECURITY_AUDIT_EXPORT_CLIENT_SECRET: "replace-with-security-audit-export-client-secret"',
    'SECURITY_AUDIT_EXPORT_TOKEN: "replace-with-security-audit-export-token"',
    'SECURITY_AUDIT_EXPORT_ENCRYPTION_KEY: "replace-with-security-audit-export-encryption-key"'
  ]) {
    if (!policy.includes(snippet)) {
      throw new Error(`security-audit-policy.yaml is missing policy snippet: ${snippet}`);
    }
  }

  expectPolicySecretPlaceholdersOnly("security-audit-policy.yaml", policy);

  const kustomization = manifests.get("kustomization.yaml") ?? "";
  if (!kustomization.includes("security-audit-policy.yaml")) {
    throw new Error("kustomization.yaml must include security-audit-policy.yaml");
  }

  for (const file of ["api-deployment.yaml", "worker-deployment.yaml", "mcp-deployment.yaml"]) {
    const manifest = manifests.get(file) ?? "";
    if (!manifest.includes("name: testhistory-security-audit-policy")) {
      throw new Error(`${file} must consume testhistory-security-audit-policy ConfigMap`);
    }
  }

  const worker = manifests.get("worker-deployment.yaml") ?? "";
  for (const snippet of [
    'testhistory.io/security-audit-retention-policy: "bounded-placeholder"',
    'testhistory.io/security-audit-export-policy: "redacted-manual-placeholder"',
    'testhistory.io/security-audit-export-lifecycle: "placeholder-state-only"',
    'testhistory.io/security-audit-export-replay-probe: "read-only-provider-neutral"',
    'testhistory.io/security-audit-export-invariant-probe: "read-only-provider-neutral"',
    'testhistory.io/security-audit-export-materialized-invariant-read: "provider-neutral-secret-free"',
    'testhistory.io/security-audit-export-secret-ref: "testhistory-security-audit-export"',
    "name: testhistory-security-audit-export",
    "key: SECURITY_AUDIT_EXPORT_ENDPOINT",
    "key: SECURITY_AUDIT_EXPORT_CLIENT_ID",
    "key: SECURITY_AUDIT_EXPORT_CLIENT_SECRET",
    "key: SECURITY_AUDIT_EXPORT_TOKEN",
    "key: SECURITY_AUDIT_EXPORT_ENCRYPTION_KEY"
  ]) {
    if (!worker.includes(snippet)) {
      throw new Error(`worker-deployment.yaml is missing retention/export secretRef: ${snippet}`);
    }
  }

  const web = manifests.get("web-deployment.yaml") ?? "";
  if (web.includes("testhistory-security-audit-export") || web.includes("SECURITY_AUDIT_EXPORT_")) {
    throw new Error("web-deployment.yaml must not receive audit export secret references");
  }

  const operations = docs.get("docs/operations.md") ?? "";
  for (const snippet of [
    "Security Audit Retention And Export Policy",
    "bounded retention",
    "SECURITY_AUDIT_RETENTION_MIN_DAYS=90",
    "SECURITY_AUDIT_RETENTION_MAX_DAYS=2555",
    "SECURITY_AUDIT_EXPORT_ENABLED=false",
    "SECURITY_AUDIT_EXPORT_SECRET_REF=testhistory-security-audit-export",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_STATES=requested,evaluated,approved,denied,cancelled,expired",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_RUNTIME_ACTION=none-placeholder-only",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_PROBES=requested,evaluated,approved,denied,cancelled,expired",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_MODE=deterministic-read-only-placeholder",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_PROBES=deterministic,recomputable,append-only,project-scope,actor-scope,provider-neutral,secret-free,read-only",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_MODE=read-model-contract-only",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_ROUTE=/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_EXECUTABLE_ENDPOINTS=none-executable-provider-endpoints",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_SECRET_MOUNTS=api-mcp-none-worker-placeholder-only",
    "SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_SIGNED_URLS=none",
    "security-audit-export-lifecycle-replay-invariant-materialized-read",
    "metadata-only-redacted",
    "npm run k8s:validate",
    "no real provider endpoint"
  ]) {
    if (!operations.includes(snippet)) {
      throw new Error(`docs/operations.md is missing retention/export reference: ${snippet}`);
    }
  }

  expectOperationsWorkflowCoverage(workflows, "retention/export policy");
}
