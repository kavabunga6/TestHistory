# CI Gates

CI runs on every push and pull request branch. The workflows use Node.js 24 and `npm ci`.

## Required Gates

`CI` has these jobs:

- `Lint`: installs dependencies and runs `npm run lint`.
- `Build and test`: installs dependencies and runs `npm run check`.
- `Security audit`: installs dependencies and runs `npm run security:audit`, failing on critical npm advisories.
- `API smoke`: waits for `Build and test`, builds the repository, then runs `npm run smoke:api`.
- `OpenAPI contract`: waits for `Build and test`, builds the API contract surface, then runs `npm run openapi:check` to validate the static spec and compare the runtime `/docs/json` document with `docs/openapi/openapi.yaml`.
- `Upload close UI smoke`: waits for `Build and test`, builds the API contract surface, then runs `npm run smoke:upload-close-ui`.
- `UI screenshot evidence`: waits for `Build and test`, installs Playwright Chromium, runs `npm run guard:ui-design`, runs `npm run guard:button-overflow`, runs `npm run guard:ui-interactions`, and runs `npm run screenshots:capture`. The generated `docs/screenshots/final/manifest.json` and committed screenshots are the required evidence. CI also attempts to upload the same files as the one-day `ui-screenshot-evidence` artifact; that supplemental upload is best effort because repository storage quota is external to the product checks.
- `Enterprise performance smoke`: waits for `Build and test`, then runs `npm run smoke:perf` to prove bounded frontend rendering and enterprise fixture performance guards.
- `Load soak evidence`: manual `workflow_dispatch` job only. It runs `npm run load:soak` with operator-provided result/upload concurrency inputs and uploads `.tmp/performance/load-soak-evidence.json` as the `load-soak-evidence` artifact.
- `Quality gate smoke`: waits for `Build and test`, then runs `npm run smoke:quality-gate` to prove deterministic CI-facing pass/fail explanations and non-zero failure behavior.
- `Kubernetes readiness smoke`: waits for `Build and test`, installs `kubectl`, then runs `npm run k8s:validate:all` with `TESTHISTORY_K8S_REQUIRE_KUBECTL=1` to verify required probes, placeholder-only secrets, ingress isolation for internal dependencies, and client-side dry-run for the base, local overlay, and production overlay.
- `Operations contract`: waits for `Lint`, checks operations docs and infrastructure formatting, runs deployment wrapper help, runs `npm run release:evidence:check`, reruns Kubernetes/operations smoke coverage, runs `npm run guard:sensitive`, and verifies whitespace for operations-owned files.

`guard:sensitive` also rejects workstation-specific absolute paths, private LAN addresses, and
unfinished-work markers in tracked documentation and examples. Use repository-relative paths,
environment variables, and reserved example hostnames instead.

Use [release evidence](release-evidence.md) as the PR summary template for links to CI jobs,
screenshots, local stack output, Kubernetes validation, API docs, and load/soak artifacts.

`npm run smoke:quality-gate` is a CI-facing synthetic gate scenario wired after `Build and test`.
It verifies deterministic quality gate pass/fail explanations and expected non-zero failure
behavior with synthetic in-memory launches.

`npm run load:soak` is an executable evidence collector, not a fast PR gate. It creates a synthetic
project and launch, uploads result files through chunked sessions, claims and processes queued upload
jobs, closes the launch, and writes `.tmp/performance/load-soak-evidence.json`. Use the manual
workflow for 10k+ evidence, and use local CLI flags for smaller debugging profiles.

`npm run openapi:check` validates `docs/openapi/openapi.yaml`, imports the built Fastify API,
reads the runtime Swagger JSON through `/docs/json`, verifies every runtime path and operationId
is present in the static OpenAPI document, and rejects static-only API paths unless they are in the
explicit docs endpoint allowlist (`/docs`, `/docs/json`). This keeps Swagger UI, capabilities, API
implementation, and `docs/openapi/openapi.yaml` from drifting silently in either direction.

`Docker` builds container images for:

- `apps/api/Dockerfile`
- `apps/worker/Dockerfile`
- `apps/web/Dockerfile`
- `apps/mcp/Dockerfile`

Docker images are pushed to GHCR only for version tag pushes matching `v*`. Pull requests and ordinary branch pushes build images without pushing them.

## Local Parity

Before pushing, run the same gates locally:

Local Windows GitHub CLI for Actions triage:

```powershell
$gh = (Get-Command gh -ErrorAction Stop).Source
& $gh auth status
& $gh pr checks --watch
```

If `gh` is not on `PATH`, install GitHub CLI or add its installation directory to `PATH`; do not
commit an absolute path from one workstation.

```bash
npm ci
npm run lint
npm run check
npm run security:audit
npm run build
npm run openapi:check
npx playwright install chromium
npm run guard:ui-design
npm run screenshots:capture
npm run guard:button-overflow
npm run guard:ui-interactions
npm run smoke:perf
npm run smoke:quality-gate
npm run smoke:api
npm run k8s:validate:all
npm run smoke:upload-close-ui
npm run load:soak -- --results=10000 --uploaders=10 --batch-size=250
```

For Docker parity:

```bash
docker compose build api worker web mcp
```

## Failure Triage

- Lint failures usually mean formatting or TypeScript-aware ESLint issues.
- `npm run check` runs the full workspace build and package tests; start with the first workspace that fails.
- `npm run security:audit` fails when npm reports a critical dependency advisory.
- `npm run openapi:check` rebuilds the API contract surface and fails when the static spec is malformed, lacks operation IDs/responses, when runtime `/docs/json` exposes a path or operationId missing from `docs/openapi/openapi.yaml`, or when the static spec documents a non-allowlisted path that the runtime does not expose.
- `npm run guard:ui-design` verifies the design audit, required deep screenshot routes, dialog evidence, capture manifest contract, and CI screenshot-evidence wiring before any browser work starts.
- `npm run screenshots:capture` builds the web app, starts a local Vite preview, captures synthetic UI PNGs into `docs/screenshots/final`, and writes `docs/screenshots/final/manifest.json`. The browser helper tries the installed Google Chrome channel first, then Playwright's Chromium and any available Chromium executable in the local cache.
- `npm run guard:button-overflow` builds the web app, starts a local Vite preview, and fails when any `button` or `[role=button]` text/icon content overflows its control bounds across the reference routes. If Chromium is missing locally, it exits quickly with a setup hint instead of leaving the preview process open; the guard uses the same headless-shell-to-regular-Chromium fallback as screenshot capture.
- `npm run guard:ui-interactions` builds the web app, starts a local Vite preview, mocks auth/settings APIs, and verifies key settings dialogs, switches, token controls, and button/switch accessibility contracts. It uses the same local Chromium prerequisite and fallback as screenshot capture.
- `npm run smoke:perf` generates/uses enterprise-scale synthetic fixtures and verifies bounded frontend rendering contracts.
- `npm run load:soak` builds the API, starts a local API when `TESTHISTORY_API_URL`/`LOAD_SOAK_API_URL` is not set, runs chunked upload/drain/close, and writes a compact JSON evidence artifact without raw payloads.
- `npm run smoke:quality-gate` runs pure in-memory domain fixtures and also invokes its own failing fixture to confirm CI receives exit code `1` plus machine-readable reason lines. It does not start Docker, an API server, or write artifacts.
- `npm run smoke:api` starts the built API from `apps/api/dist/server.js`, checks `/health`, `/docs`, and `/api/v1/capabilities`, then stops the process.
- `npm run k8s:validate` runs Kubernetes readiness smoke and runs offline `kubectl kustomize infra/k8s` when `kubectl` is available.
- `npm run k8s:validate:all` is the PR/release baseline. It runs the same smoke once, then validates `infra/k8s`, `infra/k8s/overlays/local`, and `infra/k8s/overlays/prod` with client-side dry-run. CI sets `TESTHISTORY_K8S_REQUIRE_KUBECTL=1`, so a missing `kubectl` fails the job instead of producing a false green skip.
- `npm run smoke:upload-close-ui` exercises the upload-close UI smoke path against the local web bundle and should be used before publishing screenshot evidence.
- Docker failures are often build-context or dependency-lock problems; reproduce with the exact image from the matrix first.
