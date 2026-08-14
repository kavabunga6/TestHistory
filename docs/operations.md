# Operations Runbook

This runbook captures the first production operations foundation for TestHistory. It is intentionally conservative: all Kubernetes examples use placeholder images, placeholder secrets, and private dependency endpoints.

## Runtime Persistence Safety

The API has three runtime store modes: an in-memory development store, an explicit file-backed
transitional store, and PostgreSQL. Production startup refuses an ephemeral memory store and
requires either `TESTHISTORY_DATABASE_URL`/`DATABASE_URL` or `TESTHISTORY_STORE_FILE`.

PostgreSQL is the supported Kubernetes persistence mode. Startup migrates and hydrates the durable
repositories, but the running API still maintains a process-local read model. The base manifest and
production overlay therefore pin `Deployment/testhistory-api` to exactly one replica and omit an API
HPA and API PDB. Worker and web workloads may scale independently.

Do not raise the API replica count until repository-first reads or explicit cross-replica cache
invalidation and a multi-replica consistency test are implemented. Do not mount one JSON store file
read-write into multiple API replicas; the file adapter remains a single-instance transitional mode.

## Deployment Commands

Local production-like smoke:

```bash
npm run docker:up
npm run docker:smoke
npm run docker:down
```

Kubernetes validate/deploy/undeploy:

```bash
npm run k8s:validate
npm run k8s:deploy
npm run k8s:status
npm run k8s:undeploy
```

`npm run k8s:deploy` recreates and waits for the migration Job as part of the normal rollout. Run
`npm run k8s:migrate` only when you intentionally need to recreate and wait for the migration Job
outside the normal deploy wrapper. See `docs/kubernetes-deployment.md` for the environment checklist.

## Migrations

Database migrations are applied by the one-shot Kubernetes Job `testhistory-db-migrate` in `infra/k8s/base/db-migration-job.yaml`. The Job uses the API image so the migration code and application code are deployed from the same build artifact.

Preflight:

```bash
npm run k8s:validate
```

Windows PowerShell:

```powershell
npm run k8s:validate
```

Cluster execution outline:

```bash
kubectl delete job/testhistory-db-migrate -n testhistory --ignore-not-found
kubectl apply -k infra/k8s
kubectl wait --for=condition=complete job/testhistory-db-migrate -n testhistory --timeout=180s
kubectl logs job/testhistory-db-migrate -n testhistory
```

Operational rules:

- Replace `DATABASE_URL` through an overlay, sealed secret, external secret, or deployment-time secret injection. Never commit real credentials.
- Keep PostgreSQL reachable through private DNS, ClusterIP, VPC endpoint, or an equivalent private network path.
- Run the migration Job before rolling the API instance to a new release. The deploy wrapper does
  this automatically.
- Delete the previous completed migration Job before re-applying a changed image or command;
  Kubernetes Job pod templates are immutable. The deploy and migrate wrappers do this automatically.
- Check the Job log for `testhistory.migration.complete` and a redacted database URL.
- Delete or let `ttlSecondsAfterFinished` clean up completed Jobs after evidence is collected.
- Keep the API and worker Deployment annotations pointing at `testhistory-db-migrate` and this runbook so rollout reviews can verify the migration dependency before scaling application pods.
- Keep dependency endpoint config private-only. The Kubernetes scaffold uses `replace-with-private-*` placeholders for object storage, ClickHouse, and OpenSearch until a cluster overlay supplies internal DNS, ClusterIP, VPC endpoint, or equivalent private network values.
- Treat `testhistory.io/hook-phase=pre-rollout` and `testhistory.io/hook-blocks=testhistory-api,testhistory-worker` as the deployment contract for release tooling: the migration Job must complete before API or worker pods are scaled to the new image.

Local Docker drill:

```bash
docker compose --profile operations run --rm api-migrate
```

Windows PowerShell:

```powershell
docker compose --profile operations run --rm api-migrate
```

## Enterprise Auth And Audit

M5-C keeps enterprise authentication operationally visible without committing real identity-provider details. M5-F extends that envelope to the security audit stream, still with placeholders only. The base Kubernetes manifest defines:

- `AUTH_MODE=oidc-placeholder` records that production overlays must supply the final mode.
- `OIDC_ISSUER_URL` and `OIDC_JWKS_URL` must resolve to private identity infrastructure or a private network path.
- `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `AUTH_SESSION_SIGNING_KEY`, and `AUTH_PROBE_TOKEN` are Secret keys with `replace-with-*` values in git.
- `AUTH_AUDIT_ENABLED=true`, `AUTH_AUDIT_SINK=stdout-json`, and `AUTH_AUDIT_REDACTION=strict` define the default audit posture for API, worker, and MCP rollout reviews.
- `AUTH_PROBE_MODE=anonymous-health-only` means Kubernetes HTTP probes must never use production user credentials, cookies, bearer tokens, or API keys.
- `SECURITY_AUDIT_ENABLED=true`, `SECURITY_AUDIT_SINK=stdout-json`, `SECURITY_AUDIT_STREAM=security-audit`, and `SECURITY_AUDIT_REDACTION=strict` define the default security audit envelope for API, worker, and MCP.
- `SECURITY_AUDIT_RETENTION_DAYS=365` is a placeholder default; production overlays must align retention with legal and incident-response policy.
- `SECURITY_AUDIT_SIGNING_KEY` and `SECURITY_AUDIT_SINK_TOKEN` are Secret keys with `replace-with-*` values in git. They are wired for future signed audit batches or external audit sinks, but no real secret values are committed.
- `SECURITY_AUDIT_PROBE_EVENT=security.audit.probe` classifies health probes separately from user, service, and MCP security events.

Auth-sensitive probe rules:

- API and web probes add `X-TestHistory-Probe` headers for log classification, but no secret value.
- MCP readiness uses synthetic JSON-RPC stdin against the local process and references `AUTH_PROBE_TOKEN` only as a placeholder secret for future protected probes.
- Worker probes verify dependency and heartbeat configuration only; they do not impersonate a user.
- `/health` remains the only ingress-exposed health endpoint in the base manifest. Do not expose identity providers, databases, queues, object storage, ClickHouse, or OpenSearch through the public ingress.

Security audit classification:

- API pods advertise `security.audit.read`, `security.audit.denied`, `auth.probe.accepted`, and `auth.probe.denied` as expected security-audit event classes.
- Worker pods advertise service-only event classes for cleanup, retention, and background processing boundaries.
- MCP pods advertise read and denied event classes only; MCP mutations remain out of the base operations envelope.
- Web pods advertise a static-shell probe classification and do not receive audit sink secrets.
- Migration Jobs advertise `testhistory.migration.complete` and emit redacted migration evidence only.

Audit review checklist:

- Confirm auth audit logs redact tokens, cookies, passwords, secret keys, OIDC codes, and local artifact paths before production traffic.
- Confirm denied requests produce actor, project, route, decision, and reason fields without storing credential material.
- Confirm security audit output contains event class, project scope, actor boundary, decision, trace id, and redaction marker, but never payloads, cookies, bearer tokens, signed URLs, local paths, or raw Allure artifacts.
- Confirm probe events use `security.audit.probe` or the workload-specific `testhistory.io/probe-classification` value so health checks are separable from user actions.
- Confirm migration logs include `testhistory.migration.complete` with redacted database information only.
- Confirm support bundles and incident exports omit real Allure artifacts unless a separate approved secure transfer path is used.
- No production JWTs, cookies, API keys, or OIDC client secrets belong in git, CI logs, screenshots, or committed test fixtures.

## Attachment Preview Retention Descriptor Policy

M4-AF keeps attachment preview retention evidence as materialized descriptor dry-run metadata only. The base manifest `infra/k8s/base/attachment-preview-retention-policy.yaml` is a provider-neutral ConfigMap contract for operations smoke checks; it does not configure object-storage credentials, delete workers, download links, or a storage provider.

Descriptor policy:

- `ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_MODE=materialized-descriptor-dry-run-only` marks the surface as a read-only operations descriptor, not a retention executor.
- `ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_SURFACE=existing-read-model-descriptor-only` limits the base deployment to existing read-model evidence and does not introduce a new runtime endpoint.
- `ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_PAYLOAD_CLASS=metadata-only-redacted` requires sanitized metadata summaries only, never raw attachment bodies, screenshots, XML, text logs, result files, or local artifact paths.
- `ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_SCOPE=project-and-actor-placeholder`, `ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_STATES=eligible,retained,expired,previewed,skipped`, and `ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_SAMPLE_LIMIT=25` keep preview samples bounded and scoped for validation.
- `ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_DELETE_MODE=preview-before-delete` and `ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_EXECUTION=none-dry-run` require reviewable candidates without deletion execution.
- `ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_PROVIDER_ENDPOINTS=none`, `ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_SECRET_MOUNTS=none`, `ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_STORAGE_REFS=none`, `ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_SIGNED_URLS=none`, `ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_TOKENS=none`, and `ATTACHMENT_PREVIEW_RETENTION_DESCRIPTOR_RAW_ATTACHMENTS=none` pin the descriptor surface as provider-neutral, secret-free, storage-reference-free, signed-URL-free, token-free, and raw-attachment-free.
- API and MCP deployments advertise descriptor reads with `testhistory.io/attachment-preview-retention-descriptor=dry-run-redacted`, `testhistory.io/attachment-preview-retention-secret-mount=none`, and `testhistory.io/attachment-preview-retention-provider-endpoints=none`.
- Worker deployment advertises `testhistory.io/attachment-preview-retention-descriptor=dry-run-redacted` and `testhistory.io/attachment-preview-retention-execution=none-dry-run`; the base manifest must not claim deletion execution.
- Local smoke coverage is descriptor contract validation only. It does not prove that a retention provider, storage bucket, deletion worker, credential exchange, signed URL flow, or artifact cleanup job exists.

Runbook checks before enabling an environment overlay:

- Confirm overlays replace only environment-specific policy values through reviewed manifests and never commit credentials.
- Confirm descriptor samples contain project scope, actor boundary, attachment count, retention state, redaction marker, candidate age, and preview decision only.
- Confirm descriptor samples omit raw attachment bodies, screenshots, XML, text logs, Allure result JSON, storage references, signed URLs, bearer tokens, cookies, object-storage keys, provider endpoints, and local filesystem paths.
- Confirm deletion remains a separate reviewed operation after preview evidence is approved; descriptor smoke must never execute deletion, resolve credentials, fetch attachment bodies, or contact a storage provider.

Local validation:

```bash
npm run k8s:validate
npm run guard:sensitive
npx prettier --check docs/api.md docs/kubernetes-deployment.md docs/local-development.md docs/operations.md docs/screenshots/README.md .github/workflows infra/k8s scripts
git diff --check -- infra/k8s .github/workflows docs/operations.md docs/screenshots/README.md scripts
```

## Security Audit Retention And Export Policy

M5-L keeps the static operations policy for audit retention and export disabled without enabling a real export provider. The base manifest `infra/k8s/base/security-audit-policy.yaml` is a placeholder contract only: it defines bounded retention, export defaults, and future Secret references that production overlays may replace through external secrets or sealed secrets.

Retention policy:

- `SECURITY_AUDIT_RETENTION_POLICY=bounded-placeholder` marks the base policy as non-production until an environment overlay confirms the legal and incident-response window.
- `SECURITY_AUDIT_RETENTION_MIN_DAYS=90`, `SECURITY_AUDIT_RETENTION_DAYS=365`, and `SECURITY_AUDIT_RETENTION_MAX_DAYS=2555` define the allowed placeholder range.
- `SECURITY_AUDIT_RETENTION_DELETE_MODE=preview-before-delete` requires a reviewable candidate set before destructive audit cleanup.
- Retention execution must preserve immutable event summaries needed for incident response, authorization investigations, and release evidence.

Export policy:

- `SECURITY_AUDIT_EXPORT_ENABLED=false` keeps export disabled in the base Kubernetes manifest.
- `SECURITY_AUDIT_EXPORT_PROVIDER=replace-with-audit-export-provider` and `SECURITY_AUDIT_EXPORT_DESTINATION=replace-with-audit-export-destination` are placeholders only; the base repo makes no real provider endpoint claim.
- `SECURITY_AUDIT_EXPORT_SECRET_REF=testhistory-security-audit-export` points to placeholder Secret keys for endpoint, client id, client secret, token, and export encryption key.
- `SECURITY_AUDIT_EXPORT_FORMAT=jsonl-redacted` and `SECURITY_AUDIT_EXPORT_PAYLOAD_CLASS=metadata-only-redacted` require redacted metadata exports, not raw payloads, local artifact paths, signed URLs, credentials, or Allure result files.
- `SECURITY_AUDIT_EXPORT_APPROVAL=manual-approved` and `SECURITY_AUDIT_EXPORT_SIGNING=required-when-enabled` document the future approval and signing boundary without committing a real signing key.
- `SECURITY_AUDIT_EXPORT_LIFECYCLE_STATES=requested,evaluated,approved,denied,cancelled,expired` records lifecycle placeholders for request review only.
- `SECURITY_AUDIT_EXPORT_LIFECYCLE_MODE=placeholder-state-only`, `SECURITY_AUDIT_EXPORT_LIFECYCLE_METADATA=provider-neutral-redacted`, and `SECURITY_AUDIT_EXPORT_LIFECYCLE_RUNTIME_ACTION=none-placeholder-only` require provider-neutral redacted metadata and no export-provider runtime action.
- `SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_PROBES=requested,evaluated,approved,denied,cancelled,expired` keeps local replay smoke evidence aligned with the modeled lifecycle states.
- `SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_MODE=deterministic-read-only-placeholder`, `SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_SCOPE=project-and-actor-placeholder`, `SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_SAMPLE_ACTOR_ID=replace-with-audit-export-actor-id`, and `SECURITY_AUDIT_EXPORT_LIFECYCLE_REPLAY_SAMPLE_PROJECT_ID=replace-with-audit-export-project-id` document replay probes as scoped placeholder reads only.
- `SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_PROBES=deterministic,recomputable,append-only,project-scope,actor-scope,provider-neutral,secret-free,read-only` keeps operations validation aligned with the lifecycle invariant read model.
- `SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_MODE=read-model-contract-only`, `SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_ROUTE=/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants`, `SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_SAMPLE_LIMIT=10`, and `SECURITY_AUDIT_EXPORT_LIFECYCLE_INVARIANT_SAMPLE_CURSOR=replace-with-audit-export-invariant-cursor` document invariant probes as bounded read-only HTTP contract checks, not replay execution.
- `SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_MODE=materialized-read-model-contract-only`, `SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_ROUTE=/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized`, `SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_MARKER=security-audit-export-lifecycle-replay-invariant-materialized-read`, `SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_BOUNDARY=worker-compatible-security-audit-export-lifecycle-replay-invariant-materialized-read`, and `SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_MUTATION_BOUNDARY=api-materialized-read-only-no-export-provider-mutation` pin the existing materialized read surface as provider-neutral, secret-free, and read-only deployment evidence without creating a new runtime endpoint.
- `SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_SURFACE=existing-api-mcp-read-model-only`, `SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_EXECUTABLE_ENDPOINTS=none-executable-provider-endpoints`, `SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_SECRET_MOUNTS=api-mcp-none-worker-placeholder-only`, and `SECURITY_AUDIT_EXPORT_LIFECYCLE_MATERIALIZED_INVARIANT_SIGNED_URLS=none` guard the operations wording: API and MCP materialized reads do not mount the audit export Secret, do not claim provider-side action, and do not issue or expose signed URLs.
- Local smoke coverage is provider-neutral placeholder and secret-reference validation only. It does not prove that any export provider, credential exchange, object-storage bucket, signing flow, or scheduled export job exists.
- Export probes and samples must not include signed URLs, bearer tokens, client secrets, provider-specific endpoints, artifact download links, local filesystem paths, or executable export-provider claims.

Runbook checks before enabling an environment overlay:

- Confirm the overlay replaces only Secret values through the environment secret system and never commits credentials.
- Confirm the destination is private, approved for audit data, and separate from raw artifact storage.
- Confirm lifecycle placeholders remain `requested`, `evaluated`, `approved`, `denied`, `cancelled`, and `expired` snapshots only; they must not include runtime action ids, upload ids, download links, signed URLs, or execution results.
- Confirm lifecycle replay probes are deterministic, read-only, project-scoped, actor-scoped, and provider-neutral; they must compare placeholder state snapshots without contacting an export provider or reading raw audit payloads.
- Confirm lifecycle invariant probes are bounded read-only contract checks for deterministic, recomputable, append-only, project-scope, actor-scope, provider-neutral, secret-free, and read-only evidence; they must not refresh replay state, mutate lifecycle state, resolve destination secrets, contact provider endpoints, expose signed URLs, or read raw lifecycle events and request payloads.
- Confirm materialized lifecycle invariant reads keep API and MCP free of the audit export Secret, keep worker wiring limited to placeholder Secret refs, and do not advertise provider endpoints, signed URLs, destination resolution, export execution, or new runtime endpoints.
- Confirm materialized lifecycle invariant operations stay `existing-api-mcp-read-model-only`: no API or MCP Secret mount, no executable provider endpoint, no signed URL claim, and no provider-specific destination wording in the base runbook or CI guard.
- Confirm export samples contain event id, project scope, actor boundary, decision, trace id, event class, retention class, redaction marker, and export batch id only.
- Confirm the export job cannot read raw Allure archives, attachment bodies, screenshots, signed URLs, cookies, bearer tokens, OIDC codes, database URLs, object-storage keys, or local filesystem paths.
- Confirm retention preview output is reviewed and stored as sanitized evidence before any delete execution.

Local validation:

```bash
npm run k8s:validate
npm run guard:sensitive
npx prettier --check docs/api.md docs/kubernetes-deployment.md docs/local-development.md docs/operations.md docs/screenshots/README.md .github/workflows infra/k8s scripts
git diff --check -- infra/k8s .github/workflows docs/operations.md docs/screenshots/README.md scripts
```

Private dependency configuration:

- GitHub Actions supports an optional `TESTHISTORY_NPM_TOKEN` repository or environment secret. If it is absent, CI uses the public dependency path and prints a non-secret notice.
- The Docker workflow passes `TESTHISTORY_PRIVATE_NPM_REGISTRY` as a build argument and `npm_token` as a BuildKit secret. Dockerfiles must consume that secret only through BuildKit secret mounts when private packages are introduced.
- Production overlays should source private registry, OIDC, database, object storage, queue, analytics, and search credentials through external secrets or sealed secrets. The base manifests intentionally keep only placeholders.

Validation:

```bash
npm run k8s:validate
npx prettier --check docs/api.md docs/kubernetes-deployment.md docs/local-development.md docs/operations.md docs/screenshots/README.md .github/workflows infra/k8s scripts
npm run guard:sensitive
git diff --check -- infra/k8s .github/workflows docs/operations.md docs/screenshots/README.md scripts
```

Windows PowerShell:

```bash
npm run k8s:validate
npx prettier --check docs/api.md docs/kubernetes-deployment.md docs/local-development.md docs/operations.md docs/screenshots/README.md .github/workflows infra/k8s scripts
npm run guard:sensitive
git diff --check -- infra/k8s .github/workflows docs/operations.md docs/screenshots/README.md scripts
```

## Backup And Restore Drill

The current repository only contains placeholders for production backup policy. Before enabling production traffic, define and test:

- PostgreSQL base backup and point-in-time recovery target.
- Object storage backup or versioning policy for artifacts.
- ClickHouse and OpenSearch snapshot locations if analytics stores are enabled.
- Restore rehearsal into an isolated namespace or staging environment.
- Evidence capture: backup id, restore start/end time, migration version, smoke result, and operator.

Minimum restore rehearsal outline:

```bash
kubectl create namespace testhistory-restore-drill
# Restore database and object store into isolated dependencies.
# Deploy TestHistory with restored private dependency endpoints.
npm run k8s:validate
# Run API smoke against the restored API endpoint when exposed internally.
```

Restore Evidence Placeholder:

```text
backup_id=replace-with-backup-id
restore_started_at=replace-with-restore-start-time
restore_completed_at=replace-with-restore-end-time
migration_version=replace-with-migration-version
smoke_result=replace-with-smoke-result
operator=replace-with-operator
notes=replace-with-restore-notes
```

Do not commit real backup identifiers, artifact paths, database snapshots, or operator credentials. Store production restore evidence in the approved operations system for the environment, then reference only the sanitized result in release notes.

### Production evidence gate

Static repository checks do not prove that a restore or real provider drill ran. Before production
traffic, export a sanitized JSON attestation from the approved environment operations system to a
temporary file **outside this repository**, then run:

```bash
TESTHISTORY_PRODUCTION_EVIDENCE_FILE=/secure-temporary-path/readiness.json \
TESTHISTORY_PRODUCTION_ENVIRONMENT=production-eu \
TESTHISTORY_RELEASE_ID=sha-0123456789abcdef \
TESTHISTORY_ENABLED_OUTBOUND_PROVIDERS=notification:pachca,issue:jira \
TESTHISTORY_IDENTITY_DRILL_MODE=oidc-scim \
npm run production:evidence:check
```

PowerShell:

```powershell
$env:TESTHISTORY_PRODUCTION_EVIDENCE_FILE = Join-Path $env:TEMP 'testhistory-readiness.json'
$env:TESTHISTORY_PRODUCTION_ENVIRONMENT = 'production-eu'
$env:TESTHISTORY_RELEASE_ID = 'sha-0123456789abcdef'
$env:TESTHISTORY_ENABLED_OUTBOUND_PROVIDERS = 'notification:pachca,issue:jira'
$env:TESTHISTORY_IDENTITY_DRILL_MODE = 'oidc-scim'
npm run production:evidence:check
```

Set the outbound provider list explicitly to `none` when no outbound provider is enabled. Supported
values are `notification:generic`, `notification:slack`, `notification:teams`,
`notification:pachca`, `issue:jira`, `issue:youtrack`, `issue:github`, and `issue:generic`.
Identity mode must be `disabled`, `oidc`, or `oidc-scim`; disabled identity is an explicit deployment
decision, not an omitted check. Evidence is accepted for at most seven days by default; use
`TESTHISTORY_EVIDENCE_MAX_AGE_HOURS` (1-720) only when the environment release policy defines a
different window.

The gate is fail-closed. It checks the requested environment and release, independent performer and
approver roles, expiry, restore into isolation, PostgreSQL base/PITR recovery, artifact recovery,
migration and API smoke, S3 write/read/delete and retention, credential rotation, every explicitly
enabled outbound provider, and enabled OIDC/SCIM lifecycles. Provider drills must also attest endpoint
allowlists, secret-manager references, retry/dead-letter alerting, and credential rotation.

The JSON must contain references (`https:` without query/fragment or `urn:`) to evidence held by the
approved operations system, not secrets or raw logs. Secret-like fields, common credential material,
placeholder values, stale evidence, files inside the repository, symlinks, and files larger than
256 KiB are rejected. The command prints only a bounded pass/fail summary and never echoes the JSON.
The repository deliberately contains no passing production evidence fixture: unit tests construct
synthetic objects in the operating-system temporary directory and do not satisfy this gate.

Required top-level fields are `schemaVersion: 1`, `environment`, `releaseId`, `generatedAt`,
`validUntil`, `attestation`, `backupRestore`, `objectStorage`, `outboundProviders`, and `identity`.
Every executed drill has `status: "passed"`, an ISO `completedAt`, and an `evidenceRef`. The detailed
boolean assertions are named exactly as the checks above; use `npm run production:evidence:test` and
the validator source as the executable schema. Do not copy its synthetic test object into an
environment attestation. Produce the document from completed change-management records and provider
drill output, then have a different role approve it.

## Rollback And Canary Notes

Rollback should be release-aware and migration-aware:

- Prefer forward-compatible migrations: additive schema first, application rollout second, cleanup later.
- Treat destructive migrations as a separately approved operation with a tested restore point.
- For canary rollout, run one API replica on the new image after `testhistory-db-migrate` completes, then watch `/health`, upload ingestion status, worker heartbeat logs, and quality-gate endpoints.
- Keep worker and API image versions aligned while ingestion and cleanup queues are evolving.
- If canary fails before schema changes are used, scale the canary down and redeploy the previous image tag.
- If migration failure occurs, stop rollout, collect Job logs, keep API on the previous known-good image, and start the restore drill only after confirming rollback cannot safely continue.

## Readiness Evidence

Every operations change should keep these local checks green:

```bash
npm run k8s:validate
npm run guard:sensitive
git diff --check -- .github infra docker-compose.yml docs scripts
```

If Docker Desktop or `kubectl` is unavailable, record the skipped command and run the repository smoke checks that do not require the missing binary. `npm run k8s:validate` automatically skips the offline `kubectl kustomize` render step when `kubectl` is not installed.
