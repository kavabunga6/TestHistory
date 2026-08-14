# TestHistory

Test intelligence platform compatible with the `allure-results` data format.

> [!WARNING]
> **Work in progress.** TestHistory is under active development and is not production-ready yet.
> APIs, storage formats, deployment manifests, migrations, and user-facing behavior may change
> without backward compatibility until the first stable release.

TestHistory accepts existing `allure-results`, stores raw artifacts, normalizes test data, and
builds a richer, more convenient test history than a static Allure report.

The product UI is intentionally focused on the core surfaces targeted for the first milestone:

- active screens: Projects, Launches, Test cases, Defects, Dashboard, Analytics;
- removed from the product navigation for now: shared steps, test plans, jobs, capabilities,
  in-app API docs, UI reference, and health/status pages;
- API documentation is served separately through Swagger/OpenAPI instead of as an in-app page;
- Dashboard and Analytics use synthetic workspace metrics, default THQL widgets, saved dashboard
  query contracts, trend summaries, risk signals, and empty/error states that are covered by local
  UI tests and screenshot evidence.

## Community and Security

- Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a change.
- Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) in project spaces.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).
- TestHistory is licensed under the [Apache License 2.0](LICENSE). Third-party attributions and the
  distribution policy are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

TestHistory is an independent project. It is not affiliated with or endorsed by the Allure Report
or Qameta Software teams. Product and company names are used only to describe compatible formats
and integrations; their trademarks belong to their respective owners.

## Quick Start

Requirements:

- Windows 10 or later, Linux, or macOS
- Node.js 24+
- npm 11+
- Docker Desktop for local infrastructure when available

Install dependencies:

```bash
npm install
```

Run checks:

```bash
npm run check
```

Run the same checks inside the Docker checks container:

```bash
npm run docker:check
```

The `checks` container mounts the current workspace, keeps Linux `node_modules` and npm cache in
Docker volumes, runs `npm ci` when the lockfile changes, and then executes the command you pass.
For a faster web-only loop:

```bash
npm run docker:check:web
```

Start the production-like local stack with one command:

```bash
npm run docker:help
npm run docker:up
```

Stop it with:

```bash
npm run docker:down
```

Start API, worker, and web locally without Docker:

```bash
npm run local:dev
```

Start the same local stack and idempotently import the retained UI evidence archives:

```bash
npm run local:demo
```

Open API docs when the API is running:

```text
http://127.0.0.1:18080/docs
```

Start the web UI during local frontend work:

```bash
npm run dev -w @testhistory/web -- --host 127.0.0.1 --port 5173
```

## Workspace

```text
apps/api        HTTP API
apps/worker     background workers
apps/web        frontend
apps/mcp        MCP server
packages/allure-parser
packages/artifacts
packages/contracts
packages/domain
infra/k8s
docs
```

## Current Product Surface

- Launches: compact Russian list with search, tags, environment, job indicators, and status
  distribution bars.
- Test cases: split list/detail view aligned with the reference, with search-only case lookup,
  selected-case overview, result history, attachments, quarantine, and defects tabs.
- Defects: list/detail surface retained for defect linkage and muted failure work.
- Projects: one test project is kept for web validation while project-management scope is still
  being reduced.
- Dashboard and Analytics: functional metric, trend, saved-query, and risk-signal surfaces backed
  by synthetic workspace data and runtime API/query contracts. The default Dashboard evidence
  includes pass-rate, status-distribution, and slow/risk table widgets.
- MCP: kept as an agent-safe surface over supported API reads and schemas.

## Development Docs

- [Local development](docs/local-development.md): setup, services, and common commands.
- [API documentation](docs/api.md): Swagger/OpenAPI entry points, auth, scopes, and route groups.
- [Integration guide](docs/integrations.md): Jira/external links, issue creation, notifications, CI webhooks, OIDC, SCIM, and provider extension examples.
- [Kubernetes deployment](docs/kubernetes-deployment.md): validate, deploy, status, migration, and undeploy commands.
- [Operations runbook](docs/operations.md): persistence boundaries, migrations, backup/restore,
  production evidence, canary, and rollback rules.
- [Release evidence](docs/release-evidence.md): PR-ready links for CI, screenshots, local stack, K8s, API docs, and load/soak.
- [CI gates](docs/ci-gates.md): required checks and local parity commands.
- [Upload modes](docs/upload-modes.md): JSON batch uploads and resumable chunked uploads.
- [Branch and push workflow](docs/branch-push-workflow.md): safe branch flow for parallel work.
- [Product architecture](docs/product-architecture.md): runtime topology, data plane, queues, and network boundaries.
- [UI design book](docs/design-book.md): canonical colors, typography, components, layouts, and screen acceptance rules.
- [UI reference](docs/ui-reference.md): local screenshots and implementation rules for dense
  operational screens.
- [Validation checklist](docs/validation-checklist.md): review gates for compatibility, ingestion, UI, MCP, and runtime safety.
- [Release readiness](docs/release-readiness.md): verified local capabilities, production blockers, and the exact release gate.

## License

Copyright 2026 TestHistory contributors.

Licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for project attribution and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled third-party components. Production web
builds expose the corresponding license texts under `/licenses/`.

## Production Release Boundary

Passing repository checks makes a build a release candidate; it does not by itself authorize
production traffic. The supported Kubernetes topology currently uses exactly one API replica while
worker and web workloads may scale independently. Before rollout, operators must:

1. prepare a cluster-specific overlay with immutable images, private dependency endpoints, TLS,
   storage, and externally managed secrets;
2. run `npm run k8s:validate:all` with `kubectl` available;
3. run the migration-first deployment and live API/web smoke described in
   [Kubernetes deployment](docs/kubernetes-deployment.md);
4. validate sanitized external evidence for restore, object storage, enabled outbound providers,
   and enabled identity integrations with `npm run production:evidence:check`.

Production evidence must stay outside this repository and must never contain credentials, raw
logs, signed URLs, customer artifacts, or database snapshots.

## First Milestone

The first implementation milestone is a compatibility MVP:

1. create project;
2. create launch;
3. upload `allure-results`;
4. parse result/container/environment/executor files;
5. display launch results and result details;
6. build history by `historyId` and `testCaseId`;
7. run quality gate from CI.

Sensitive real `allure-results`, screenshots, traces, tokens, and local user artifacts must not be
committed. Use only synthetic fixtures or scrubbed data.
