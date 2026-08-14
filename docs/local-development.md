# Local Development

## Fast local UI loop (no Docker)

For normal UI development and manual checks, start API, worker, and Vite together:

```powershell
cmd /c npm run local:dev
```

The command waits until both HTTP endpoints are ready and prints their addresses. Open
`http://127.0.0.1:5173` and sign in with `admin` / `admin`; these demo credentials exist only when
`NODE_ENV=development`. On the first run the command creates one starter project (`WS / Web
Sandbox`) if the local store is empty. Local data is preserved in `.testhistory/local-store.json`.
Stop the whole process tree with `Ctrl+C`.

The launcher runs API, worker, and Vite directly and records only their managed process IDs in
`.testhistory/local-dev-processes.json`. A second live launcher exits without starting duplicates.
The API dev process watches only `apps/api/src`, and the server handles termination signals
gracefully, so running `npm run check` in a second terminal cannot race dependency hot reloads or
interrupt the file-backed workspace snapshot.
If the terminal or IDE terminates the manager abruptly, the next `local:dev` or `local:demo` run
cleans its recorded stale process tree before starting; unrelated Node processes are not selected.
For a stack started in the background, stop the recorded launcher and its process tree with
`cmd /c npm run local:dev:stop`.

To start the same stack and idempotently import the checked local Android evidence archives as
closed launches before opening the UI, use:

```powershell
cmd /c npm run local:demo
```

The importer discovers `.tmp/testhistory-evidence-*.tar.gz`, adds each archive as a separate launch
to the first `WS` project, and skips launches that were already imported. The current evidence set
contains real Allure results, screenshots, logcat attachments, and an MP4 recording. Development
mode exposes bounded inline previews for small images only; text, JSON, and XML previews up to
3 MiB are loaded on demand. Larger files remain download-only and are rejected before their bodies
are read from artifact storage. Production never embeds attachment
payloads in result responses.

If an older local snapshot contains attachment descriptors but its file object store is missing,
restore matching objects from the retained `.tmp/testhistory-evidence-*` directories without
overwriting existing objects:

```powershell
cmd /c npm run rehydrate:local:artifacts
```

To work only on API and UI without queue polling:

```powershell
cmd /c npm run local:dev -- --no-worker
```

Use the Docker workflow below when validating deployment dependencies and migrations. The fast
local loop intentionally keeps the file-backed store so UI navigation and actions do not require
PostgreSQL, Redis, RabbitMQ, or Docker Desktop.

With `local:dev` still running, use a second terminal for the repeatable browser smoke:

```powershell
cmd /c npm run smoke:ui:local
```

It signs in, opens imported launch `#114`, opens a result and a real inline screenshot preview, then
checks test-case navigation, THQL search, project settings, browser errors, and that navigation did
not create extra projects. The script prefers the installed Google Chrome channel, so a separate
Playwright browser download is not required on the documented Windows development machine.

You can also import or refresh the evidence separately while `local:dev` is running:

```powershell
cmd /c npm run seed:local:evidence
```

To add an idempotent UI fixture with three results, five nested step levels, attachments on levels
three and four, and passed/failed/broken branches, run:

```powershell
cmd /c npm run seed:local:nested-steps
```

The fixture is added to the first local project as the closed launch `Nested steps UI fixture v3`.
Its level-three JSON and level-four text/XML attachments receive bounded, redacted on-demand previews.
Rerunning the command reuses that launch instead of creating duplicates.

With `local:demo` running, the same browser check also has a shorter alias:

```powershell
cmd /c npm run local:check-ui
```

This repository is a Node.js 24 / npm 11 workspace for the TestHistory API, worker, web app, MCP server, and shared packages.

## Prerequisites

- Node.js 24+
- npm 11+
- Docker Desktop, when you want local infrastructure or container parity
- kubectl, when you want to validate the Kubernetes scaffold locally
- Google Chrome or Playwright Chromium, when you want local browser UI guards or screenshot evidence

## First Setup

```bash
npm install
```

Install the browser used by UI evidence commands when you want local parity with the CI screenshot
job:

```bash
npx playwright install chromium
```

Create a local environment file when you need to override defaults:

```bash
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

The default development API port is `18080`. Swagger UI is available at `http://127.0.0.1:18080/docs` after the API starts.

Choose one local runtime mode and do not run both on the same ports:

| Mode                  | Command              | Persistence                       | Intended use                         |
| --------------------- | -------------------- | --------------------------------- | ------------------------------------ |
| Fast development      | `npm run local:dev`  | `.testhistory/local-store.json`   | UI/API iteration and browser checks  |
| Seeded UI development | `npm run local:demo` | File store plus imported evidence | Manual UI, attachments, and actions  |
| Docker parity         | `npm run local:up`   | PostgreSQL and container volumes  | Migrations and dependency validation |

Use `npm run local:dev:stop` for the fast stack and `npm run local:down` for the Docker stack.

## Run Locally

Start the production-like local stack with one command:

```bash
npm run local:doctor
npm run local:up
```

`local:*` scripts are the human-facing aliases for the same Docker-backed stack wrapper. The
`docker:*` names remain available for CI and existing automation:

```bash
npm run docker:up
```

The wrapper validates Compose, builds and starts API/worker/web with dependencies, runs the
database migration job, and executes API/web/docs smoke checks. It also checks required local
commands before starting so missing Docker or npm prerequisites fail with an actionable message.
Use `local:doctor` when you want to verify Docker/npm prerequisites and Compose topology without
starting or mutating containers.
Use these lifecycle commands for the same stack:

```bash
npm run local:help
npm run local:doctor
npm run local:status
npm run local:restart
npm run local:smoke
npm run local:migrate
npm run local:down
npm run local:reset
```

On Windows PowerShell the equivalent one-script entry point is:

```powershell
.\scripts\local-stack.ps1 up
.\scripts\local-stack.ps1 up -Mcp
.\scripts\local-stack.ps1 up -NoBuild
.\scripts\local-stack.ps1 doctor
.\scripts\local-stack.ps1 help
```

The PowerShell wrapper prints the same local endpoints and supports the same MCP/no-build lifecycle
options as `node scripts/local-stack.mjs`.

Start the API in watch mode:

```bash
npm run dev
```

Start the web app in watch mode:

```bash
npm run dev -w @testhistory/web
```

Start infrastructure services only:

```bash
docker compose up -d postgres redis rabbitmq minio minio-init clickhouse opensearch
```

Manual equivalent for the full Docker stack:

```bash
docker compose up --build --wait api worker web
```

Validate the Compose topology without starting containers:

```bash
docker compose config --quiet
```

Run the API smoke test against the Compose API container:

```bash
SMOKE_API_BASE_URL=http://127.0.0.1:18080 npm run smoke:api
```

On Windows 10 with Docker Desktop and PowerShell, prefer the wrapper above. The manual equivalent is:

```powershell
docker compose config --quiet
docker compose up --build --wait api worker web
$env:SMOKE_API_BASE_URL = "http://127.0.0.1:18080"
npm run smoke:api
Remove-Item Env:SMOKE_API_BASE_URL
```

The Docker stack exposes:

- API: `http://127.0.0.1:18080`
- Swagger through web: `http://127.0.0.1:5173/docs`
- Web: `http://127.0.0.1:5173`
- MinIO API: `http://127.0.0.1:9000`
- MinIO console: `http://127.0.0.1:9001`

PostgreSQL, Redis, RabbitMQ, MinIO, ClickHouse, and OpenSearch are bound to `127.0.0.1` in Compose for local diagnostics only. They are private dependency endpoints, not public end-user endpoints; the only browser-facing local endpoints are the web app and API/docs URLs above.

By default, Compose also binds the API and web entrypoints to `127.0.0.1`. If a
GitLab runner or another machine must upload results into the local
TestHistory instance, put this in an untracked `.env` file before starting the
stack:

```bash
TESTHISTORY_HOST_BIND=0.0.0.0
```

Then use the host name reachable from the runner in CI variables, for example
`TESTHISTORY_BASE_URL=http://testhistory.internal.example:18080`. The direct API port is enough
for uploads; nginx in the web container is only needed when you want to expose
the browser UI and its `/api`, `/docs`, and `/health` proxy routes through
`http://<host-ip>:5173`.

Compose waits for PostgreSQL, Redis, RabbitMQ, MinIO bucket init, ClickHouse, and OpenSearch health before starting the API. The worker then waits for the API health endpoint and polls its upload queue through `TESTHISTORY_API_URL`; API and worker authenticate that internal path with the shared `TESTHISTORY_WORKER_TOKEN`. The web container proxies `/api`, `/docs`, and `/health` through nginx; set `TESTHISTORY_API_UPSTREAM` when the API is not reachable as `http://api:8080`.

For a fresh Compose store, set `TESTHISTORY_BOOTSTRAP_ADMIN_EMAIL` and a random
`TESTHISTORY_BOOTSTRAP_ADMIN_PASSWORD` of at least 12 characters in an untracked `.env` file before
the first start. Production-mode containers do not seed the development `admin/admin` and
`user/user` accounts.

The worker is a background process rather than an HTTP service. Its Docker and Kubernetes readiness checks validate the required dependency configuration and make a live request to the API health endpoint; the running worker emits `worker.heartbeat` structured log events at that interval with queue depth, completed job count, dead letter count, and configured dependency count.

## Kubernetes Scaffold

Kubernetes manifests live in `infra/k8s` and are intended as placeholders for cluster-specific overlays:

- Override images in `infra/k8s/kustomization.yaml` with your registry and tag.
- Replace `replace-with-testhistory-hostname`, `replace-with-ingress-class`, and `replace-with-tls-secret-name` in `infra/k8s/base/ingress.yaml` through an overlay.
- Replace `replace-with-cluster-storage-class` in `infra/k8s/base/storage.yaml` through an overlay.
- Replace all `replace-with-*` Secret values from `infra/k8s/base/runtime-config.yaml` through an overlay, sealed secret, external secret, or deployment-time secret injection; do not commit real secrets.
- Keep dependency URLs private. PostgreSQL, Redis, RabbitMQ, S3/MinIO, ClickHouse, and OpenSearch should use ClusterIP service DNS, private DNS, VPC endpoints, or an equivalent private network path. Do not point them at the public web/API hostname and do not expose dependency ports through Ingress.
- Keep credential-bearing values in the Kubernetes Secret only. The scaffold expects `replace-with-*` Secret placeholders and `replace-with-private-*` dependency endpoint placeholders until an environment overlay injects real values outside the repository.
- The `testhistory-minio-bucket-init` Job is a placeholder for MinIO or S3-compatible bucket creation and uses the configured `S3_ENDPOINT` and `S3_BUCKET`.
- The `testhistory-db-migrate` Job is the production migration/init placeholder. It uses the API image, reads `DATABASE_URL` only from the Kubernetes Secret, and is documented in `docs/operations.md`.

API and web use HTTP startup/readiness/liveness probes. MCP uses an exec probe that calls `testhistory.health` over JSON-RPC. Worker startup/readiness validates required runtime configuration and liveness checks the Node process because worker health is currently reported through heartbeat logs.

Validate the scaffold without applying it:

```bash
npm run k8s:validate
npm run k8s:validate:all
```

Use `k8s:validate:all` before PRs or release evidence capture. It runs the Kubernetes readiness
smoke once, then validates the base scaffold plus the local and production overlays. The script
checks required probes and resource requests/limits on Kubernetes workloads, verifies Kubernetes
Secret values are placeholder-only, rejects hardcoded credentials and hostnames in the scaffold,
confirms dependency ports are not routed through Ingress, checks migration/runbook references, and
runs the kubectl client dry-run for each selected path when `kubectl` is installed.
CI sets `TESTHISTORY_K8S_REQUIRE_KUBECTL=1` for this command, so missing `kubectl` fails the gate.
Use the same strict mode locally with:

```bash
TESTHISTORY_K8S_REQUIRE_KUBECTL=1 npm run k8s:validate:all
```

For a local migration drill with Docker Compose:

```bash
docker compose --profile operations run --rm api-migrate
```

On Windows PowerShell:

```bash
npm run docker:migrate
```

Deploy, inspect, and remove the Kubernetes scaffold:

```bash
npm run k8s:deploy
npm run k8s:status
npm run k8s:undeploy
```

For a local kind/minikube-style overlay:

```bash
npm run k8s:validate:local
npm run k8s:deploy:local
npm run k8s:undeploy:local
```

See [Kubernetes deployment](kubernetes-deployment.md) for the production checklist.

## Common Commands

```bash
npm run lint
npm run build
npm run test
npm run check
```

Browser evidence commands prefer the installed Google Chrome channel and fall back to a local
Playwright Chromium install:

```bash
npm run guard:button-overflow
npm run guard:ui-interactions
npm run screenshots:capture
```

The browser scripts first try Playwright's headless shell and then fall back to the regular
Chromium executable reported by Playwright. If the current user profile cannot write to
`%LOCALAPPDATA%\ms-playwright`, install into a workspace-local cache and run the evidence command
with the same environment variable:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.ms-playwright"
npx playwright install chromium
npm run screenshots:capture
```

When the local machine cannot resolve `cdn.playwright.dev` or otherwise cannot download Chromium,
use the CI `ui-screenshot-evidence` artifact as the visual evidence source.

## Containerized Checks

Use the checks container when Windows permissions, local Node versions, or Codex sandbox paths make
host-side commands unreliable:

```bash
npm run docker:check
```

This runs `docker compose --profile checks run --rm checks`. The service mounts the current
workspace at `/workspace`, keeps Linux `node_modules` in the `checks-node-modules` Docker volume,
keeps npm cache in `checks-npm-cache`, and automatically runs `npm ci` when `package-lock.json`
changes.

Pass any command after the service name for a narrower loop:

```bash
docker compose --profile checks run --rm checks npm run test -w @testhistory/web
docker compose --profile checks run --rm checks npm run lint -- --quiet
```

PowerShell equivalents:

```powershell
npm run docker:check
npm run docker:check:web
docker compose --profile checks run --rm checks npm run build -w @testhistory/web
```

Run the API smoke test after building:

```bash
npm run build
npm run smoke:api
```

PowerShell wrappers are available for a short path:

```powershell
.\scripts\check.ps1
.\scripts\dev.ps1
```

## Troubleshooting

- If ports are busy, stop the old process or override the matching value from `.env.example`.
- If browser evidence commands report that Playwright Chromium is missing, run `npx playwright install chromium` in the same user profile and rerun the command. If that profile is not writable, use `PLAYWRIGHT_BROWSERS_PATH` as shown above. CI installs Chromium before `guard:button-overflow`, `guard:ui-interactions`, and `screenshots:capture`.
- If Docker services behave strangely, restart only the affected service first: `docker compose restart redis`.
- If generated `dist` output looks stale, run `npm run build` from the repository root so workspace build order is respected.
