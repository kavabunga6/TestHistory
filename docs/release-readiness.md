# Release Readiness

This document separates capabilities that are verified today from interfaces that are intentionally
blocked from a production claim. It must be updated whenever a blocker is removed or a new runtime
dependency is introduced.

## Verified local baseline

- The API and web UI run locally at `127.0.0.1:18080` and `127.0.0.1:5173`.
- The file-backed single-instance store survives process restarts and rejects unsafe snapshot paths,
  oversized snapshots, and symbolic-link indirection.
- Imported artifact bytes are stored outside the JSON snapshot through the filesystem object-store
  adapter. Retention and launch deletion remove physical objects before deleting metadata.
- A production S3-compatible artifact adapter is runtime-selectable, keeps provider keys behind the
  authorized content proxy, supports MinIO path-style endpoints, and has bounded metadata/delete
  contract tests. Docker Compose supplies an isolated bucket and explicit development credentials.
- Launch deletion is API-backed, role/scope checked, refuses active launches, and cascades artifact,
  upload, and history records.
- Test-case deprecation is API-backed and survives UI reloads.
- Project access, API tokens, integration providers, custom fields, and artifact retention settings
  are API-backed and authorization checked.
- Result quarantine and unquarantine are API-backed, role/scope checked, append-only, persisted by
  memory/file/PostgreSQL repositories, and mirrored into the security audit stream.
- Test Plans select automated cases only; CI Jobs, authenticated inbound CI webhooks, and their
  PostgreSQL repositories are API-backed and represented in the Automation UI.
- Native GitLab pipeline events and GitHub `workflow_run` events are normalized into CI Jobs.
  GitLab tokens are compared by hash; GitHub signatures are verified over the exact request bytes
  with AES-256-GCM encrypted webhook secrets under `TESTHISTORY_INTEGRATION_MASTER_KEY`. Normalized
  payload fields and external URLs are bounded before persistence.
- Notification and issue-tracker integrations use a durable PostgreSQL outbox, worker leases,
  bounded exponential retry, response-size/time limits, HTTPS/SSRF checks, HMAC webhook signing,
  and environment-backed credentials which are neither returned nor persisted.
- Jira, YouTrack, GitHub Issues, generic issue HTTP, generic webhook, Slack, Teams, and Pachca request
  adapters are covered by contract tests. Terminal CI jobs, launch closure/failure, and failed
  quality gates enqueue idempotent notification deliveries.
- OIDC provider configuration is redacted and environment-backed; discovery metadata is validated
  through bounded HTTPS/SSRF guards. Project SCIM 2.0 tokens are shown once, hashed at rest, and
  provision, update, list, or disable project memberships with security-audit evidence.
- Launch comparison classifies automated-test changes from stable identities and final retries.
  Analytics exposes per-launch series, status counters, pass/failure rates, duration averages, p50,
  and p95 metrics; both surfaces are wired to the production API rather than fixture-only values.
- Module-size debt is closed: launch lifecycle, launch comparison UI, and in-memory repository
  construction are separated from their former aggregate modules and protected by the size guard.
- The deterministic UI audit covers 25 screens, tabs, empty states, and dialogs under
  `docs/screenshots/final`.

## Production blockers

### Multi-replica PostgreSQL coherence

PostgreSQL startup now migrates and hydrates projects, launches/results, uploads, artifacts, test
cases/history, cleanup and audit state, defect dispositions, Test Plans, CI Jobs, and integration
deliveries. Core mutations write through to repositories and production startup accepts
`TESTHISTORY_DATABASE_URL`/`DATABASE_URL` without a file snapshot.

The runtime still maintains a per-process read model after hydration. A single API replica is the
supported durable topology. Horizontal API scaling requires repository-first reads or explicit cache
invalidation plus a multi-replica consistency test; do not claim active/active support yet.

The base Kubernetes deployment and production overlay enforce that boundary with exactly one API
replica and no API HPA or API PDB. `npm run k8s:validate:all` rejects a topology that reintroduces any
of those conflicting resources. Worker and web workloads remain independently scalable.

### Object-storage provider

The S3-compatible adapter and authorized proxied download boundary are implemented. Production
approval still requires a provider integration drill (write/read/delete and retention), credential
rotation evidence. Chunk payloads use the configured object store, but a real provider drill remains
an operational release requirement.

### External integration drills

Outbound adapters are exercised with deterministic HTTP doubles. Before production, run one
write/read lifecycle against each enabled real provider, verify allowlists and secret-manager
references, rotate one credential, and prove retry/dead-letter alerting. Provider credentials must
remain environment/secret-manager values referenced by project settings.

### Enterprise identity-provider drill

OIDC configuration/discovery and the SCIM Users lifecycle have deterministic contract coverage.
Before enabling a real provider, validate its issuer metadata and client-secret reference in the
target network, rotate the SCIM token, provision and deactivate a non-privileged account, and verify
the resulting project membership and security-audit records. No identity-provider credential may be
committed to project settings, logs, screenshots, or fixtures.

## Release gate

Run these commands from the repository root:

```text
npm run check
npm run lint
npm run openapi:check
npm run security:audit
npm run guard:ui-design
npm run guard:ui-interactions
npm run guard:button-overflow
npm run smoke:api
npm run smoke:ui:local
npm run k8s:validate:all
npm run production:evidence:test
```

Passing these gates proves build, contract, unit/integration, deterministic UI, local runtime, and
static deployment readiness. Before production traffic, additionally run
`npm run production:evidence:check` against the approved environment-specific evidence file outside
the repository. Neither the unit test nor static Kubernetes validation overrides the production
blockers above.
