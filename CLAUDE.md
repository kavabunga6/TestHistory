# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TestHistory is an Allure-compatible Test Intelligence Platform. It accepts existing `allure-results`, stores raw artifacts, normalizes test data, and builds test history, identity resolution, defects, and analytics on top. It is an npm workspaces monorepo (Node.js 24+, npm 11+, ESM-only, TypeScript strict).

## Commands

```bash
npm install              # bootstrap workspace
npm run dev              # API in watch mode (tsx) on port 18080; Swagger at /docs
npm run dev -w @testhistory/web   # web app (Vite) in watch mode

npm run build            # builds all workspaces IN DEPENDENCY ORDER (see below)
npm run lint             # eslint . (typescript-eslint, no type info)
npm run format           # prettier --check . ; format:write to fix
npm run test             # guard:sensitive + per-workspace vitest
npm run check            # build + test (the main gate)
npm run typecheck        # alias for build (tsc emits + declarations)
```

Build order is hand-wired in the root `build` script and matters: `contracts → artifacts → allure-parser → domain → api → worker → mcp → web`. A workspace consumes the **built `dist/`** of its dependencies, not their source. If you change a package and a downstream workspace sees stale types, run `npm run build` from the root rather than building a single workspace.

### Running a single test

Tests are vitest, run per-workspace. Target one workspace and pass a file/name filter:

```bash
npm run test -w @testhistory/domain -- history-compare        # by file name
npm run test -w @testhistory/api -- -t "closes a launch"      # by test name
npx vitest run packages/domain/src/history-compare.test.ts    # direct
```

`@testhistory/contracts` has no tests (types only). Web tests use `vitest.config.ts` with jsdom.

### Smoke tests (also CI gates — run before pushing)

```bash
npm run smoke:quality-gate   # in-memory domain quality-gate scenario; asserts exit 1 on failure fixture. No Docker/API.
npm run smoke:api            # builds, boots dist/server.js, checks /health /docs /api/v1/capabilities, exits
npm run smoke:k8s            # validates infra/k8s probes, placeholder-only secrets, ingress isolation
```

### Containerized checks (host parity)

Use when host Node/permissions are unreliable. Mounts the workspace, caches `node_modules` in a Docker volume, runs `npm ci` only when the lockfile changes:

```bash
npm run docker:check          # full check inside the checks container
npm run docker:check:web      # web tests only
docker compose --profile checks run --rm checks <any command>
```

## Architecture

Four processes (a modular monolith split into deployables) over five shared packages.

**Processes (`apps/`):**

- `api` — Fastify 5 REST API + Swagger. `app.ts` builds the app and registers route modules from `routes/index.ts`; `server.ts` is the entrypoint. Routes are thin; they call into `store.ts`, which adapts the `domain` repositories to HTTP. **The default store is in-memory (`createAppStore()` → `driver: "memory"`).** Postgres persistence exists in `src/persistence/` (pool, migrations, repository implementations) but is the production path, not the default wired into the running API.
- `worker` — background process (no HTTP server). Drives ingestion/close/sync/analytics/cleanup queues. Readiness validates dependency env vars + `WORKER_HEARTBEAT_MS`; health is reported via `worker.heartbeat` structured logs, not an HTTP probe.
- `web` — React 19 + Vite. UI is currently built as static "reference screens" under `src/referenceScreens/` that mirror TestOps-like layouts; `api.ts` is the API client.
- `mcp` — JSON-RPC over stdio MCP server (`server.ts`) exposing safe discovery + API-backed tools to AI agents. Its k8s liveness is an exec probe calling `testhistory.health`.

**Shared packages (`packages/`), in dependency order:**

- `contracts` — pure types only, no runtime, no tests. The Allure wire format (`AllureResult`, `AllureStatus`, steps/labels/links/parameters) and shared status enums. Everything depends on this.
- `artifacts` — artifact storage policy/descriptors (chunk sizing, retention). Used by API body limits and upload handling.
- `allure-parser` — parses Allure result/container/environment/executor files and archive manifests into normalized form.
- `domain` — the core. Pure functions + repository interfaces: test-case identity resolution (`getTestCaseIdentity`, confidence levels), history (`getTestCaseHistory`, `buildTestCaseSummaries`), quality gates (`evaluateQualityGate`, default rules/thresholds), defects, defect mutes, security/identity audit, audit export, history compare, archive diagnostics. The `persistence.ts` module defines the `TestHistoryPersistence` / repository contracts that `apps/api/src/persistence` implements against Postgres.

**Domain boundary that matters:** business logic lives in `packages/domain` as pure, testable functions and repository **interfaces**. Storage (in-memory store, Postgres) implements those interfaces. When adding behavior, prefer extending `domain` and keeping routes/store as adapters.

**Intended runtime topology** (see `docs/product-architecture.md`): the close-launch command is the finalization boundary that reconciles uploads, normalizes results, syncs test cases, materializes analytics, indexes search, and schedules cleanup. Stateful deps (PostgreSQL, RabbitMQ, S3/MinIO, Redis, ClickHouse, OpenSearch) are private — never user/agent reachable, never routed through Ingress.

## CI gates

CI (`.github/workflows/ci.yml`) runs on every push/PR: `Lint`, `Build and test` (`npm run check`), then `API smoke`, `Quality gate smoke`, `Kubernetes readiness smoke`, and an `Operations contract` job. Reproduce locally before pushing:

```bash
npm ci && npm run lint && npm run check && npm run smoke:quality-gate && npm run smoke:api && npm run smoke:k8s
```

`Docker` workflow builds the four app images; it only pushes to GHCR on `v*` tags.

## Conventions / gotchas

- **UI routing rule.** Every tab, subtab, and lower detail level must have its own URL/hash segment. Refreshing the browser must keep the user on the same screen and reload the data for that screen. Do not add tab state that exists only in React component state.
- **UI language rule.** Product UI text must be Russian. English is allowed only for project names, user logins, technical identifiers, API scopes, URLs, and provider/product names that are normally written in English.
- **ESM + NodeNext everywhere.** Relative imports in `.ts` must use the `.js` extension (e.g. `import { x } from "./store.js"`). tsconfig is strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` — indexed access is `T | undefined` and optional props can't be set to `undefined` explicitly.
- **Never commit real Allure artifacts.** `npm run guard:sensitive` runs first in `test` and in CI; it blocks `allure-results/` dirs and `*-result.json` / `*-container.json` / `*-attachment.*` UUID files (allowlist in `scripts/guard-sensitive-artifacts.mjs`).
- **Don't commit secrets in `infra/k8s`.** Manifests use `replace-with-*` placeholders; `smoke:k8s` fails if real values appear.
- **Branch workflow** (`docs/branch-push-workflow.md`): multiple agents may edit concurrently. Keep branches small, prefer the `codex/` prefix, leave unrelated modified files alone, and read a file before editing if it already has uncommitted changes.

## Key docs

`docs/product-architecture.md` (topology), `docs/local-development.md` (setup/Compose/k8s), `docs/ci-gates.md`, `docs/upload-modes.md` (JSON batch vs resumable chunked uploads), `docs/operations.md`, `docs/ui-reference.md`. `ALLURE_COMPATIBLE_PLATFORM_PLAN.md` at the root is the full product plan.
