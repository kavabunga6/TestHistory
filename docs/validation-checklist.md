# Validation Checklist

This file is a reusable acceptance template. Unchecked boxes describe checks to perform for an
applicable release or change; they are not a project backlog or an assertion that the capability
is missing.

This checklist turns Allure TestOps-like compatibility into reviewable and automatable gates for TestHistory. It is not a claim that TestHistory must clone Allure TestOps internals or UI; it defines the compatibility behaviors reviewers and CI validators should protect.

## Reference Baseline

Use these Qameta documentation areas as the external behavior baseline when reviewing compatibility:

- [Architecture](https://docs.qameta.io/allure-testops/setup/architecture/): PostgreSQL, RabbitMQ, S3-compatible storage, Redis, and network exposure boundaries.
- [Kubernetes installation](https://docs.qameta.io/allure-testops/install/kubernetes): production deployments should run supporting services separately from the application layer.
- [S3-compatible storage](https://docs.qameta.io/allure-testops/install/s3/): object storage requirements and production separation from database storage.
- [Launches](https://docs.qameta.io/allure-testops/briefly/launches/): launches are `Open` or `Closed`; close-triggered processing updates test cases, dashboards/statistics, and cleanup eligibility.
- [Test results](https://docs.qameta.io/allure-testops/briefly/test-results/): completed result statuses are `passed`, `failed`, `skipped`, `broken`, and `unknown`.
- [Test cases](https://docs.qameta.io/allure-testops/briefly/test-cases/): metadata, workflow state, run history, and version history are first-class review surfaces.
- [Workflow statuses](https://docs.qameta.io/allure-testops/briefly/test-cases/workflows/): workflow state is separate from result execution status.
- [Metadata upload policies](https://docs.qameta.io/allure-testops/briefly/launches/upload_policy/): automated metadata may come `from_result` by default or `from_test_case` for manually governed fields.
- [Cleanup](https://docs.qameta.io/allure-testops/briefly/project/cleanup/): global and project rules, closed-launch-only execution, staged collection, and batch deletion.
- [MCP server](https://docs.qameta.io/allure-testops/howto/mcp/): TestOps MCP exposes tool families for test cases, shared steps, test results, mutes, projects, and issue lookup.
- [Interface overview](https://docs.qameta.io/allure-testops/getstarted/overview/): dense operational shell with list/detail navigation, tabs, filters, bulk actions, and launch/result/test-case workflows.

## How To Use This Checklist

Every checked item must have evidence. Acceptable evidence includes:

- API request and response sample.
- Unit, contract, integration, E2E, smoke, or compatibility test link.
- CI job log.
- UI screenshot or video.
- Kubernetes dry-run, deployment, or health output.
- Reviewer note with exact file, endpoint, or scenario.

Use these labels in PR reviews and CI reports:

| Label     | Meaning                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------- |
| `BLOCKER` | Existing Allure-style upload, launch lifecycle, artifact safety, auth boundary, or CI release gate is broken. |
| `HIGH`    | Compatibility works only for the happy path or lacks protection for known risky inputs.                       |
| `MEDIUM`  | Behavior is usable but missing observability, edge-case coverage, or reviewer evidence.                       |
| `LOW`     | Documentation, naming, or operational polish issue with no immediate behavior risk.                           |

## CI Validator Matrix

These gates should become automated validators over time. Until automated, reviewers must attach manual evidence.

| ID            | Gate                                                             | Required Evidence                                                | Blocking When                                                              |
| ------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `VAL-API-001` | OpenAPI and implemented routes agree.                            | OpenAPI diff plus API smoke output.                              | Documented endpoint shape differs from runtime behavior.                   |
| `VAL-ING-001` | Real `allure-results` fixture uploads without test-code changes. | Compatibility fixture run.                                       | Supported Allure fields are rejected or raw files are lost.                |
| `VAL-LCH-001` | Launch close triggers post-processing.                           | E2E showing open upload, close, history/stat updates.            | Test cases/history/analytics update before close or fail after close.      |
| `VAL-STS-001` | Status mapping preserves five Allure statuses.                   | Fixture with all statuses and API/UI evidence.                   | `failed`/`broken`/`unknown` semantics are collapsed or mislabeled.         |
| `VAL-TC-001`  | Test-case identity and history are stable.                       | Multi-launch fixture with `testCaseId`, `historyId`, parameters. | Unrelated tests merge or same test splits without reason.                  |
| `VAL-UPL-001` | Metadata policy is deterministic.                                | Policy test for `from_result` and `from_test_case`.              | Manual test-case metadata is overwritten when policy says not to.          |
| `VAL-ART-001` | Artifact cleanup is safe and auditable.                          | Cleanup preview/delete test and logs.                            | Open-launch artifacts are deleted or unauthorized artifacts are visible.   |
| `VAL-MCP-001` | MCP mirrors allowed API behavior and redaction.                  | MCP manifest plus tool-call transcript.                          | MCP exposes data or mutations unavailable through authorized API paths.    |
| `VAL-K8S-001` | Production topology is viable.                                   | Docker build plus K8s validation/dry-run.                        | App depends on embedded production stateful services or missing readiness. |
| `VAL-SEC-001` | Secrets and sensitive artifacts are protected.                   | Negative tests and log scan.                                     | Hidden parameters, tokens, storage paths, or signed URLs leak.             |

Minimum local parity commands:

```bash
npm run lint
npm run check
npm run build
npm run smoke:api
docker compose build api worker web mcp
```

## Architecture Components

Review TestHistory against the expected component responsibilities, even when the current MVP uses simplified local substitutes.

| Component             | Compatibility Responsibility                                                                                    | Reviewer Checks                                                                           | CI Validator Checks                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| PostgreSQL            | Durable transactional state for projects, launches, test cases, results, permissions, policies, and audit data. | Confirm launch/test-case/history data is not only in memory for production paths.         | Migration or schema check exists before production readiness is claimed.  |
| RabbitMQ or queue     | Asynchronous processing for ingestion, close-triggered work, cleanup, previews, and analytics.                  | Confirm heavy work is not required to finish inside upload request paths.                 | Worker smoke can process a queued or simulated ingestion job.             |
| S3-compatible storage | Raw result files, attachments, fixtures, previews, and export artifacts.                                        | Confirm raw artifacts are stored with checksum, original path, launch, and project scope. | Upload fixture records artifacts and rejects unsafe paths.                |
| Redis                 | Sessions, cache, rate limits, or ephemeral coordination.                                                        | Confirm Redis data loss does not destroy launch/result/artifact truth.                    | Service starts with Redis unavailable only if documented fallback exists. |
| API service           | Single public application boundary for clients and UI.                                                          | Confirm end users do not need direct DB, queue, Redis, or object-storage access.          | Smoke verifies `/health`, `/docs`, `/api/v1/capabilities`.                |
| Worker service        | Background processors for ingestion, launch close, cleanup, previews, and analytics.                            | Confirm failed work is retryable or terminal with diagnostics.                            | Worker health and one processing scenario are covered.                    |
| Web service           | Dense operational UI for launch, result, test-case, analytics, and admin workflows.                             | Confirm UI does not bypass API authorization or artifact redaction.                       | E2E opens launch/result/test-case views after fixture upload.             |
| MCP service           | Agent-facing tool surface with API parity and stricter redaction.                                               | Confirm MCP cannot become a wider data access path than API/UI.                           | Manifest and representative tool calls are validated.                     |

## Kubernetes Production Readiness

- [ ] API, worker, web, and MCP have deployment manifests or Helm values with ports, env vars, probes, resource requests, and limits.
- [ ] PostgreSQL, RabbitMQ, Redis, and S3-compatible storage are treated as external production dependencies, not as application pods intended for real production data.
- [ ] Local/evaluation bundled dependencies are clearly marked as non-production.
- [ ] Readiness probes fail until required downstream services are reachable or the service is explicitly degraded.
- [ ] Liveness probes do not mask deadlocks in ingestion, cleanup, or upload handling.
- [ ] Secrets are referenced via Kubernetes `Secret` or external secret mechanisms, never hard-coded in manifests.
- [ ] Object storage uses bucket/prefix isolation per environment and project-level authorization in the application layer.
- [ ] Persistent data and artifacts have backup/restore documentation and restore validation.
- [ ] Pod replacement during chunked upload, launch close, or cleanup leaves a resumable, retryable, or auditable state.
- [ ] Network policy or deployment docs state that only the application/reverse-proxy boundary is user-facing.

## Allure Result Compatibility

- [ ] Accept `*-result.json` files from common Allure adapters without requiring TestHistory-specific fields.
- [ ] Accept `*-container.json` and preserve fixture relationships such as setup/teardown.
- [ ] Preserve `environment.properties`, `environment.xml`, `executor.json`, `categories.json`, and `history/*` as raw artifacts.
- [ ] Preserve unknown fields in raw storage for audit and future compatibility.
- [ ] Treat optional fields as optional: `historyId`, `testCaseId`, `fullName`, `description`, `statusDetails`, `stage`, labels, links, parameters, steps, and attachments.
- [ ] Store original relative paths and reject path traversal, absolute paths, control characters, and path aliases that overwrite another artifact.
- [ ] Import malformed files as per-file errors without poisoning the whole launch or worker.
- [ ] Keep unsupported files as artifacts and report them as ignored, unless policy explicitly blocks them.
- [ ] Preserve nested steps, step attachments, parameters, labels, links, status messages, traces, start/stop timestamps, and duration calculations.
- [ ] Validate fixture corpus covers pytest, JUnit 5, TestNG, Playwright, Cypress, Jest/Mocha, retries, parameterized tests, nested steps, missing attachments, malformed files, unknown labels, and hidden/masked parameters.

## Launch Lifecycle

- [ ] Launches expose a clear `Open` or `Closed` state through API and UI.
- [ ] Uploads can target an open launch.
- [ ] Close is explicit through API/UI or documented auto-close policy.
- [ ] Repeated close requests are idempotent or return a clear conflict without duplicate processing.
- [ ] Open launches do not update test-case documentation, durable history, dashboards/statistics, or cleanup eligibility unless explicitly documented as a TestHistory divergence.
- [ ] Closing a launch creates or updates test cases according to identity rules and metadata upload policies.
- [ ] Closing a launch refreshes analytics/history used by dashboards and quality gates.
- [ ] Closing a launch marks unused artifacts for deletion and remaining artifacts for future cleanup according to cleanup rules.
- [ ] Reopening, if supported, has explicit behavior for recalculating defects, cleanup eligibility, and analytics.
- [ ] Launch close failures are visible to reviewers through launch state, job status, logs, and retry controls.

## Test Statuses

- [ ] `passed` means the test finished successfully.
- [ ] `failed` means product behavior did not meet expectations while the test itself remained valid.
- [ ] `broken` means the test execution was interrupted or the test could not check product behavior as intended.
- [ ] `skipped` means the test was part of the planned execution but was skipped.
- [ ] `unknown` means status was not explicitly reported or an in-progress manual result was closed without final status.
- [ ] API, UI, analytics, quality gate, export, and MCP use one shared status vocabulary.
- [ ] Status counters on launch list/detail match result list filters and API aggregates.
- [ ] Step statuses do not incorrectly override the final result status unless a documented rule says they should.
- [ ] Unknown and broken results are visible enough for triage and are not silently treated as skipped or passed.

## Test Cases, Metadata, Workflow, History, Versions

- [ ] Test cases have stable identifiers independent from a single launch result UUID.
- [ ] Automated test cases can be created or updated from closed-launch results.
- [ ] Manual metadata can coexist with automated metadata without uncontrolled overwrites.
- [ ] Workflow status is stored and displayed separately from result execution status.
- [ ] Default workflow behavior is documented for manual and automated cases.
- [ ] Test-case run history includes result status, launch, duration, date, executor/user when known, and parameters.
- [ ] History ordering is deterministic and timezone-safe.
- [ ] Version history, if implemented, saves/restores/compares test-case metadata and scenario content without losing auditability.
- [ ] Identity matching uses `testCaseId`, `historyId`, `fullName`, and label-derived fallback rules conservatively.
- [ ] Parameterized tests do not collapse unrelated cases into one misleading history.
- [ ] Merge/split or identity repair operations are auditable when manual repair exists.

## Metadata Upload Policies

Support policy names:

- `from_result`: uploaded automated results are the source of truth for the selected field.
- `from_test_case`: stored test-case metadata remains the source of truth and uploaded values for that field are ignored for test-case documentation.

Reviewer checks:

- [ ] Policy is configurable per project and per supported metadata field, or documented as not yet implemented.
- [ ] Supported fields include a stated subset of name, test layer, description, expected result, links, tags, issues, members, and custom fields.
- [ ] Default automated behavior is `from_result` unless a project policy overrides it.
- [ ] `from_test_case` prevents launch close from overwriting manually governed fields.
- [ ] Policy decisions are applied at close-triggered processing time, not inconsistently during upload preview.
- [ ] Result details still show result-level metadata where appropriate while test-case documentation follows policy.
- [ ] Policy changes are audited with actor, project, field, old value, new value, and timestamp.

CI validator scenarios:

- [ ] Upload result with description `A`, close launch, assert test-case description is `A` under `from_result`.
- [ ] Manually set test-case description `B`, upload result with description `C`, close launch, assert test-case description remains `B` under `from_test_case`.
- [ ] Change policy back to `from_result`, upload result `D`, close launch, assert deterministic update behavior.

## Artifact Cleanup

Cleanup must be conservative: it may reduce storage, but must not delete artifacts still needed for open launches, audit, or authorized inspection.

- [ ] Global cleanup rules are distinguishable from project-specific cleanup rules.
- [ ] Project-specific rules add to or narrow behavior in a documented way and do not silently disable global safety policy.
- [ ] Cleanup rules apply only to closed launches.
- [ ] Cleanup supports artifact classes such as attachments, fixtures, test scenarios/raw result files, and previews if those classes exist.
- [ ] Cleanup can filter by result status, including successful versus failed/non-successful retention.
- [ ] Cleanup first collects eligible artifacts into a staged cleanup list.
- [ ] Staged cleanup records project, launch, artifact ID/key, artifact class, reason, rule ID, checksum, and collection timestamp.
- [ ] Batch deletion removes bounded groups and records success/failure per artifact.
- [ ] Failed deletions are retryable and visible without blocking unrelated cleanup batches.
- [ ] Retention preview reports what would be deleted without deleting anything.
- [ ] Cleanup never deletes artifacts for open launches, even if age thresholds have passed.
- [ ] Cleanup cannot delete artifacts outside the project/tenant scope of the rule.
- [ ] Cleanup logs do not print signed URLs, secrets, hidden parameters, or full sensitive attachment contents.

CI validator scenarios:

- [ ] Create open launch with aged artifacts, run cleanup, assert nothing is deleted.
- [ ] Close launch, run staged collection, assert eligible artifacts are staged but still retrievable until deletion.
- [ ] Run batch deletion with a small batch limit, assert only staged artifacts are deleted and audit records remain.
- [ ] Verify project cleanup does not affect artifacts in another project.

## API Review Checklist

- [ ] `GET /health` returns service health without requiring auth in local smoke contexts.
- [ ] `GET /docs` serves API documentation matching `docs/openapi/openapi.yaml`.
- [ ] `GET /api/v1/capabilities` describes ingestion policy, limits, launch lifecycle, cleanup, and MCP availability.
- [ ] `POST /api/v1/projects` creates a project and rejects invalid payloads.
- [ ] `POST /api/v1/projects/{projectId}/launches` creates an open launch bound to the requested project.
- [ ] `GET /api/v1/launches/{launchId}` returns launch metadata, counters, state, and ingestion/processing status.
- [ ] `POST /api/v1/launches/{launchId}/close` triggers close processing exactly once.
- [ ] `POST /api/v1/launches/{launchId}/results/json` stores all submitted files as artifacts before importing supported data.
- [ ] JSON batch upload returns `200` for clean import and `207` with per-file errors for partial failures.
- [ ] Chunked upload validates `path`, `totalChunks`, `totalBytes`, and chunk index boundaries.
- [ ] Chunk retry is idempotent and cannot duplicate artifacts or counters.
- [ ] `GET /api/v1/uploads/{uploadId}/session` identifies accepted and missing chunks for resume.
- [ ] `POST /api/v1/uploads/{uploadId}/complete` assembles chunks exactly once and imports supported files.
- [ ] `POST /api/v1/uploads/{uploadId}/abort` prevents later completion and leaves an auditable state.
- [ ] `GET /api/v1/artifacts?launchId=...` is project-scoped and permission-scoped.
- [ ] `POST /api/v1/artifacts/retention/preview` performs no deletion.
- [ ] `GET /api/v1/test-cases` returns stable summaries with metadata and workflow state.
- [ ] `GET /api/v1/test-cases/{testCaseId}/history` returns chronological history with launch context.
- [ ] `POST /api/v1/launches/{launchId}/quality-gate` returns deterministic machine-readable output.
- [ ] Error responses use one shape and do not include secrets, stack traces, filesystem paths, hidden parameters, or signed URLs.

## MCP Parity

MCP should expose agent-safe operations with parity to API permissions, not a privileged side channel.

Tool-family parity targets:

- [ ] Test cases: create, update, find/search, delete or trash, restore where supported.
- [ ] Shared steps: create, update, find/search where supported.
- [ ] Test results: find/search with pagination and field expansion where supported.
- [ ] Mutes: create and delete mute rules where supported.
- [ ] Projects: get project details and safe expansions where supported.
- [ ] Issue integration: fetch linked issue details where supported.

Safety checks:

- [ ] `GET /api/v1/mcp/manifest` lists only implemented tools and supported schemas.
- [ ] MCP tool authorization matches API authorization for the same actor/token.
- [ ] MCP read calls cannot enumerate unauthorized projects, launches, test cases, results, artifacts, or issues.
- [ ] MCP write calls, if implemented, use the same validation, idempotency, metadata policy, and audit behavior as API writes.
- [ ] MCP output redacts hidden parameters, masked values, secrets, environment tokens, signed URLs, and storage paths.
- [ ] MCP errors are structured for agent retries but do not expose stack traces or internal service topology.
- [ ] MCP pagination, filters, and expansion options have limits to prevent accidental large data exfiltration.

CI validator scenarios:

- [ ] Manifest schema validates and contains no unimplemented tool names.
- [ ] Unauthorized token fails to read a project and fails the equivalent MCP call.
- [ ] Authorized test-result search redacts hidden/masked metadata in MCP output.
- [ ] MCP mutation creates the same audit event as API mutation, if mutations are enabled.

## UI Review Checklist

The UI should feel like a dense operational shell, not a marketing or report-only page.

UI contract:

- [ ] Every visible navigation section, tab, toolbar action, bulk action, and CTA has a named owner in the implementation plan, PR evidence, or tracking artifact.
- [ ] Every visible navigation section, tab, toolbar action, bulk action, and CTA is implemented as working content, a read-only evidence/status surface, a permission/lifecycle disabled state, or is hidden.
- [ ] `Ready` entries are clickable, route or open predictably, and show correct content for the current project/user permissions.
- [ ] `Ready` entries have readiness criteria that define required data states, permissions, empty/error/loading behavior, and expected visual result.
- [ ] `Ready` entries have validation evidence through an automated UI test, smoke test, screenshot, or video.
- [ ] No visible entry is labeled `WIP`, placeholder, unfinished, or "not implemented"; unsupported operations are absent or represented as read-only/permission/lifecycle states with a concrete reason.
- [ ] Toolbar actions, bulk actions, and CTAs expose disabled states with clear permission, selection, or lifecycle reasons instead of failing only after click.
- [ ] Hidden or permission-denied features are either absent from the current UI surface or shown as disabled with an intentional product reason.
- [ ] Reviewer evidence includes at least one screenshot or test path for primary navigation, one tabbed detail view, one toolbar action, one bulk action when present, and one CTA.
- [ ] Any visible UI contract gap is recorded with owner, severity, target milestone, workaround, and whether the element should be disabled, hidden, or completed.

Launch workflows:

- [ ] Launch list shows open/closed state, ID/name, creation or close time, metadata, status counters, and action menu.
- [ ] Launch list supports search/filter, status filtering, sorting, and compact display of metadata.
- [ ] Launch detail shows ingestion status, result counters, close/reopen action if supported, and processing failures.
- [ ] Status counters on list and detail filter the result table consistently.
- [ ] Closing a launch from UI shows pending/complete/failure state for close-triggered processing.

Result workflows:

- [ ] Result list is dense, filterable, and stable with long names, suites, labels, traces, and many rows.
- [ ] Result detail uses tabs or equivalent sections for Overview, Steps, Parameters, Labels/Links, Attachments, History, and Raw JSON where available.
- [ ] Result detail shows `failed` versus `broken` semantics clearly enough for triage.
- [ ] Hidden/masked parameters are protected in all tabs, copy actions, exports, and raw views.
- [ ] Missing attachments show a clear missing-reference state without breaking the page.

Test-case workflows:

- [ ] Test-case list/detail expose metadata, workflow status, owner/member, tags, links/issues, and custom fields where supported.
- [ ] History tab shows status, launch, duration, date, executor/user, and parameters.
- [ ] Version history UI, if implemented, supports save, restore, compare, and audit evidence.
- [ ] Metadata upload policy behavior is visible enough that reviewers can understand why a field came from result or test case.

Operational workflows:

- [ ] Cleanup preview and cleanup execution are visible to authorized users with audit-friendly summaries.
- [ ] Quality gate view explains failing conditions and machine-readable CI output.
- [ ] Empty, loading, error, partial-import, unauthorized, and processing states are explicit.
- [ ] Responsive views preserve critical operational controls and do not hide close/upload/error actions.
- [ ] UI actions never require direct access to PostgreSQL, RabbitMQ, Redis, or S3.

## Security And Artifact Safety

- [ ] Upload tokens and user tokens have least-privilege scopes.
- [ ] CI upload token can upload and read only intended project/launch data.
- [ ] Viewer cannot access hidden artifacts or cross-project artifacts through API, UI, direct URL, or MCP.
- [ ] Artifact keys are derived safely and cannot overwrite unrelated objects.
- [ ] Checksums are recorded and used to detect duplicate or corrupted artifacts.
- [ ] Upload size, file count, chunk count, and preview limits are enforced.
- [ ] HTML/SVG/XML/text previews are escaped, sandboxed, or disabled according to risk.
- [ ] Content type is detected defensively and never trusted only from client metadata.
- [ ] Signed URLs are scoped, short-lived, and absent from durable logs.
- [ ] Raw artifacts containing secrets can be restricted, expired, or removed according to policy.
- [ ] Malware scanning or a documented compensating control exists before broad attachment preview/download in shared environments.
- [ ] Backups and restores preserve artifact-to-result links without widening access.

## Performance And Reliability

- [x] 10k-result launch upload is accepted within the current MVP target or has a documented gap.
- [x] 10k-result ingestion completes within the current MVP target or has a documented gap.
- [ ] 100k-result generated fixture can be uploaded through the intended high-volume path or has a documented blocking gap.
- [ ] UI routes show skeleton/loading/partial/error states and never leave the user on a blank waiting screen.
- [ ] No interactive UI request waits more than 10 seconds without progress, partial data, or async query state.
- [ ] Launch result, test-case, defect, and dashboard table views use server-side pagination or virtualization under large data.
- [ ] Result details API remains within target latency for typical failed-test traces.
- [ ] Test-case history query remains within target latency for a heavily repeated test.
- [ ] Dashboard/THQL query has a cost budget, timeout behavior, and async fallback for expensive queries.
- [ ] Concurrent uploads from multiple CI jobs do not corrupt launch counters, upload sessions, or worker queues.
- [ ] Upload request path streams large payloads and does not require full parsing or analytics computation before returning acceptance.
- [ ] Upload backpressure returns a clear throttled/queued state instead of timing out or exhausting API memory.
- [ ] Worker failures leave jobs retryable or terminal with clear diagnostics.
- [ ] Backpressure, request limits, and queue limits fail gracefully under oversized uploads.
- [ ] Cleanup batch size prevents storage/API overload and can resume after partial failure.
- [ ] Project artifact retention defaults to 14 days for attachments after launch close.
- [ ] Cleanup never deletes artifacts from open launches and preserves result metadata, checksum, deletion audit, and expired-attachment UI state.
- [ ] Cleanup supports staged candidate collection, bounded object deletion batches, retry, and compression/preview retention policy.

Current load/soak evidence:

- Command: `npm run load:soak -- --results=10000 --uploaders=10 --batch-size=250 --claim-limit=20`.
- Artifact: `.tmp/performance/load-soak-evidence.json` locally or the manual CI
  `load-soak-evidence` artifact from `workflow_dispatch`.
- Latest local evidence: 10,000 results, 10 uploaders, 40 chunked sessions, 40 processed jobs,
  10,000 imported results, 0 failed jobs, queue drained, launch closed.
- Timing snapshot: upload 4.1s, drain 1.74s, total 5.97s, acceptance p95 304.47ms on the local
  in-memory API profile.
- Remaining scale gap: 100k generated fixture remains manual/nightly evidence, not a required PR
  gate.

## Evidence Package Template

Each compatibility PR or release candidate should attach:

- [ ] Scope statement: API, UI, ingestion, MCP, Docker/K8s, CI, artifact security, cleanup, metadata policies.
- [ ] Fixture manifest: frameworks/adapters, file counts, attachment sizes, statuses, retries, parameters, hidden/masked data.
- [ ] API evidence: project, launch, upload, close, history, quality gate, artifact list, cleanup preview.
- [ ] UI evidence: launch list/detail, result list/detail tabs, test-case history, cleanup/policy views if changed.
- [ ] MCP evidence: manifest and representative allowed/denied calls if MCP is in scope.
- [ ] CI evidence: lint, check, build, smoke, docker image build, compatibility fixture run.
- [ ] Load/soak evidence: attach `.tmp/performance/load-soak-evidence.json` or the
      `load-soak-evidence` CI artifact for 10k+ ingestion claims.
- [ ] K8s evidence: manifest validation, dry-run, or deployed health output if infrastructure changed.
- [ ] Security evidence: redaction checks, permission negative tests, path traversal tests, artifact URL/log scan.
- [ ] Known gaps: owner, severity, target milestone, workaround, and rollback note.

## Release Gate

- [ ] Existing Allure adapters can upload supported `allure-results` without changing tests.
- [ ] Open launch behavior, close-triggered processing, history, dashboards/analytics, cleanup eligibility, and quality gate behavior are internally consistent.
- [ ] Statuses remain compatible across API, UI, analytics, export, and MCP.
- [ ] Test-case metadata policy prevents accidental loss of manually governed fields.
- [ ] Artifact cleanup cannot delete open-launch artifacts or cross-project artifacts.
- [ ] MCP exposes no wider data or mutation surface than API permissions allow.
- [ ] K8s/Docker evidence is sufficient for the claimed environment type: local, evaluation, or production.
- [ ] No known path leaks raw artifacts, hidden parameters, credentials, storage internals, or signed URLs.
- [ ] CI and local parity commands are green, or project owners explicitly accept the remaining failures.
- [ ] All compatibility gaps are documented with severity and a user-visible workaround.
