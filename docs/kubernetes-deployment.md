# Kubernetes Deployment

`infra/k8s` is the base deployment scaffold for TestHistory. It contains no real secrets and uses
placeholder images by design. Environment-specific values belong in overlays, external secrets, or
deployment-time patches.

## Commands

Validate the base manifests:

```bash
npm run k8s:help
npm run k8s:validate
```

Validate the local and production overlays:

```bash
npm run k8s:validate:all
npm run k8s:validate:local
npm run k8s:validate:prod
```

`k8s:validate:all` is the preferred pre-PR command because it runs the Kubernetes readiness smoke
once and validates the base scaffold plus both committed overlays. When `kubectl` is installed, each
path also receives a client-side dry-run. CI and release baselines run the same command with
`TESTHISTORY_K8S_REQUIRE_KUBECTL=1`, so missing `kubectl` fails instead of silently skipping the
dry-run evidence.

Deploy the base scaffold:

```bash
npm run k8s:deploy
```

Deploy an overlay:

```bash
npm run k8s:deploy:local
npm run k8s:deploy:prod
```

Run live HTTP smoke after rollout by setting the public API/docs base URL and, when the UI is exposed
on a separate host, the public web URL:

```bash
TESTHISTORY_K8S_SMOKE_URL=https://api.testhistory.example.test \
TESTHISTORY_K8S_WEB_URL=https://testhistory.example.test \
npm run k8s:deploy:prod
```

The same live smoke targets can be passed as wrapper flags:

```bash
node scripts/k8s.mjs deploy --path infra/k8s/overlays/prod \
  --smoke-url https://api.testhistory.example.test \
  --web-url https://testhistory.example.test
```

Windows PowerShell operators can use the parity wrapper with the same lifecycle:

```powershell
.\scripts\k8s.ps1 help
.\scripts\k8s.ps1 validate-all -RequireKubectl
.\scripts\k8s.ps1 deploy -KustomizePath infra/k8s/overlays/prod -Namespace testhistory -SmokeUrl https://api.testhistory.example.test -WebUrl https://testhistory.example.test
.\scripts\k8s.ps1 undeploy -KustomizePath infra/k8s/overlays/prod -Namespace testhistory
```

The deploy wrapper checks API `/health`, Swagger `/docs`, and the web root after migration and
rollout waits when smoke URLs are configured. Without them, deploy still validates manifests and
waits for Kubernetes rollout, then prints explicit skip messages for the missing live smoke targets.
Commands that require a cluster check `kubectl` before mutating anything and fail early with a
prerequisite message when the tool is not available.

Deploy and migration commands also refuse unresolved `replace-with-*` and `replace-prod-*` values in
the selected kustomize path before calling `kubectl`. Use overlays or deployment-time patches to
replace those values. `--allow-placeholders` exists only for isolated non-production labs where the
operator intentionally wants to apply placeholder manifests.

Deploy recreates `job/testhistory-db-migrate` before applying the selected kustomize path. This
prevents a repeated deploy from passing because Kubernetes still has an old completed migration Job.

Check rollout status:

```bash
npm run k8s:status
```

Run the migration job again:

```bash
npm run k8s:migrate
```

Remove the deployment:

```bash
npm run k8s:undeploy
```

Remove an overlay deployment:

```bash
npm run k8s:undeploy:local
npm run k8s:undeploy:prod
```

## Pre-Deploy Checklist

- Replace image placeholders in `infra/k8s/kustomization.yaml` with a real registry and tag.
- For environment deploys, prefer an overlay in `infra/k8s/overlays/*` instead of editing the base.
- Replace `replace-with-*` secret placeholders through a safe secret mechanism.
- Set ingress host, ingress class, and TLS secret.
- Set storage class and capacity for artifact storage.
- Confirm PostgreSQL, Redis, RabbitMQ, S3-compatible storage, ClickHouse, and OpenSearch endpoints
  are private.
- Run `npm run openapi:check`, `npm run test`, and `npm run k8s:validate:all`.

## Configuration Ownership

Do not edit the base manifests with environment values. Keep configuration in these boundaries:

| Value                               | Production source                                           |
| ----------------------------------- | ----------------------------------------------------------- |
| API, worker, MCP, and web image     | Immutable registry tag or digest in the environment overlay |
| Database, queue, and S3 credentials | External Secret, sealed Secret, or deployment secret system |
| OIDC and bootstrap credentials      | Secret manager; never ConfigMap or committed patch          |
| Private dependency endpoints        | Environment overlay or private service discovery            |
| Public hostname and TLS             | Ingress overlay and cluster-managed TLS Secret              |
| Storage class and capacity          | Cluster-specific storage overlay                            |
| Retention and upload limits         | Reviewed ConfigMap patch                                    |

Render the final overlay and review resource names, namespace, images, public routes, private
egress, and Secret references before apply. The deployment wrapper refuses committed placeholder
values, but it cannot judge whether a real endpoint, storage class, or credential belongs to the
target environment.

## Recommended Production Sequence

1. Build and publish API, worker, MCP, and web images with one immutable release identifier.
2. Patch the production overlay with those image tags or digests and the target cluster values.
3. Inject Secrets through the approved environment mechanism; do not materialize them in the
   repository or shell history.
4. Validate the exact overlay with `npm run k8s:validate:prod` and the complete repository contract
   with `TESTHISTORY_K8S_REQUIRE_KUBECTL=1 npm run k8s:validate:all`.
5. Capture a current restore point and confirm the rollback image identifiers.
6. Deploy with live smoke URLs. The wrapper recreates and waits for the migration Job before
   waiting for API, worker, and web rollouts.
7. Inspect status and logs, then validate the external production evidence file before enabling
   traffic or completing the change record.

Example:

```bash
export TESTHISTORY_K8S_SMOKE_URL=https://api.testhistory.example.test
export TESTHISTORY_K8S_WEB_URL=https://testhistory.example.test
npm run k8s:validate:prod
npm run k8s:deploy:prod
npm run k8s:status
```

PowerShell:

```powershell
$env:TESTHISTORY_K8S_SMOKE_URL = 'https://api.testhistory.example.test'
$env:TESTHISTORY_K8S_WEB_URL = 'https://testhistory.example.test'
npm run k8s:validate:prod
npm run k8s:deploy:prod
npm run k8s:status
```

After the live smoke succeeds, run the fail-closed operations gate from a trusted operator host.
The evidence JSON must be a regular non-symlink file outside the repository:

```bash
TESTHISTORY_PRODUCTION_EVIDENCE_FILE=/secure-temporary-path/readiness.json \
TESTHISTORY_PRODUCTION_ENVIRONMENT=production-eu \
TESTHISTORY_RELEASE_ID=sha-0123456789abcdef \
TESTHISTORY_ENABLED_OUTBOUND_PROVIDERS=none \
TESTHISTORY_IDENTITY_DRILL_MODE=disabled \
npm run production:evidence:check
```

Replace `none` and `disabled` with the integrations actually enabled in the environment. See
[Operations runbook](operations.md#production-evidence-gate) for the supported values and evidence
contract.

## Rollout Contract

`npm run k8s:deploy` and the overlay deploy scripts perform:

1. API readiness smoke for Kubernetes manifest expectations.
2. Placeholder scan for unresolved `replace-with-*` and `replace-prod-*` values.
3. Client-side Kubernetes dry-run.
4. `kubectl delete job/testhistory-db-migrate -n <namespace> --ignore-not-found`.
5. `kubectl apply -k <selected kustomize path>`.
6. Fresh migration job wait.
7. API, worker, and web rollout waits.
8. Optional live HTTP smoke for `/health` and `/docs` when `TESTHISTORY_K8S_SMOKE_URL` or
   `--smoke-url` is provided.
9. Optional live web smoke for the UI root when `TESTHISTORY_K8S_WEB_URL` or `--web-url` is
   provided.

The base manifest exposes only the web/API ingress. Dependency services must stay private.

## Undeploy Contract

`npm run k8s:undeploy` runs:

```bash
kubectl delete -k infra/k8s --ignore-not-found
```

Persistent volumes may remain depending on cluster reclaim policy. Treat volume deletion as a
separate, explicit data-destruction operation.

## Post-Deploy Verification And Rollback

After rollout, verify the API health and docs endpoints, the web root, one authenticated project
read, one bounded synthetic upload/close lifecycle, worker heartbeat freshness, queue depth, dead
letters, and migration Job logs. Do not use customer artifacts for a smoke test.

If verification fails:

1. stop traffic promotion and retain pod, migration, and ingress diagnostics;
2. determine whether the migration is forward-compatible with the previous application image;
3. redeploy the previous immutable image when schema compatibility permits it;
4. if data recovery is required, stop mutating workloads and follow the isolated restore drill in
   [Operations runbook](operations.md#backup-and-restore-drill);
5. rerun live smoke and the production evidence gate before restoring traffic.

Do not delete PVCs, buckets, database schemas, or namespaces as part of an application rollback.
Those are separate destructive operations requiring explicit approval and verified backups.

## Production Overlay Notes

The repository includes two overlay templates:

- `infra/k8s/overlays/local`: local `testhistory.local` ingress, `standard` storage class, and
  `*:local` images for kind/minikube-style clusters.
- `infra/k8s/overlays/prod`: production host/storage/image placeholders plus baseline
  availability, scaling, network isolation, and service-account resources. Deployment tooling must
  still patch the registry, immutable image tag, ingress host, TLS secret, storage class, and secret
  names before applying it to a real cluster.

The production overlay includes:

- HPA for worker and web workloads. The API is intentionally excluded while its hydrated read
  model remains process-local.
- PDB for worker and web workloads. A single-replica API cannot truthfully provide a disruption
  budget without blocking voluntary maintenance.
- default-deny NetworkPolicy with explicit web-to-API and private dependency egress policies.
- workload-specific service accounts with token automount disabled.
- a guarded single API replica plus production replica floor patches for worker and web
  deployments.

The supported production topology currently has exactly one API replica. Do not add an API HPA or
raise its replica count until repository-first reads or explicit cross-replica cache invalidation and
a multi-replica consistency test are implemented. Worker and web replicas remain independently
scalable.

Keep production secrets out of the base and overlays. A safe overlay usually patches:

- image registry and immutable tag;
- secret names or external-secret references;
- ingress host and TLS;
- resource requests/limits for expected load;
- storage class and retention policy;
- worker/web HPA thresholds, worker/web PDB minimums, and NetworkPolicy selectors for the target
  cluster.

Never commit production JWTs, passwords, object-storage keys, API tokens, signed URLs, or backup
identifiers.
