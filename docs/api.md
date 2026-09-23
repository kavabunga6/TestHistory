# API Documentation

TestHistory serves live Swagger documentation from the API process and keeps a committed OpenAPI
spec for review and CI parity.

## Entry Points

- Swagger UI: `http://127.0.0.1:18080/docs`
- OpenAPI JSON: `http://127.0.0.1:18080/docs/json`
- Web docs proxy: `http://127.0.0.1:5173/docs`
- Committed spec: `docs/openapi/openapi.yaml`
- Endpoint catalog generator: `npm run api:docs:catalog`
- Parity check: `npm run openapi:check`

The committed OpenAPI document lists the host-facing local server (`127.0.0.1:18080`) first for
Swagger/client generation, and the container or in-cluster server (`localhost:8080`) second for
internal runs.

`npm run openapi:check` is bidirectional: runtime routes must be documented, and static-only paths
fail unless they are explicitly allowlisted docs endpoints (`/docs`, `/docs/json`).

The API uses JSON request and response bodies unless an endpoint explicitly documents another
format. Error responses use HTTP status codes plus a JSON body with a machine-readable message.

## Authentication

The UI and local smoke tests use session tokens:

| Method | Path                            | Purpose                              |
| ------ | ------------------------------- | ------------------------------------ |
| POST   | `/api/v1/auth/login`            | Create a session token.              |
| POST   | `/api/v1/auth/register`         | Create a user and session.           |
| GET    | `/api/v1/auth/me`               | Read the current authenticated user. |
| GET    | `/api/v1/auth/tokens`           | List personal API tokens.            |
| POST   | `/api/v1/auth/tokens`           | Create a personal API token.         |
| DELETE | `/api/v1/auth/tokens/{tokenId}` | Revoke a personal API token.         |

Use bearer authentication:

```text
Authorization: Bearer <session-or-personal-token>
```

The OpenAPI contract declares `bearerAuth` globally. Public system/auth bootstrap operations
(`health`, Swagger, capabilities, registration, login, and query validation) explicitly opt out with
`security: []`; all other operations inherit bearer protection.

Default local test credentials are available for local development only:

- `admin` / `admin`
- `user` / `user`

## Project Scope

Project settings and scoped reads should carry explicit project/actor metadata when the token does
not already encode it:

```text
x-testhistory-project-scope: <project-id>
x-testhistory-actor-id: <user-or-service-subject>
x-testhistory-scopes: settings:read
```

The actor header is audit metadata for local/dev and synthetic smoke flows. In production, bearer
tokens and project membership determine access; do not treat `x-testhistory-actor-id` as proof of
identity.

## Scopes And Permissions

API tokens are intentionally narrow. The UI hides actions the current user cannot perform, and the
API enforces the same boundary.

| Scope            | Typical use                                            |
| ---------------- | ------------------------------------------------------ |
| `profile:read`   | Read the current user and personal token metadata.     |
| `tokens:read`    | List personal API token metadata.                      |
| `tokens:write`   | Create or revoke personal API tokens.                  |
| `settings:read`  | Read project access, visibility, integration settings. |
| `settings:write` | Update project settings and project API tokens.        |
| `launches:read`  | Read launches and result summaries.                    |
| `launches:write` | Create/update launch lifecycle data.                   |
| `results:read`   | Read test result detail surfaces.                      |
| `results:write`  | Upload/import result data.                             |
| `uploads:write`  | Create upload sessions and submit Allure result files. |
| `artifacts:read` | Read redacted artifact descriptors and previews.       |
| `defects:read`   | Read defect and quarantine projections.                |
| `analytics:read` | Read full project or launch result analytics.          |

Project owners and admins can manage destructive project actions. Maintainers can manage operational
project data. Editors can upload and update test data. Observers are read-only. CI/service tokens
should receive only upload/read scopes needed by the pipeline.

## Pagination

List endpoints return either a legacy array or a paginated envelope when the endpoint supports a
read-model page. Prefer paginated reads for UI and automation:

```json
{
  "items": [],
  "page": {
    "limit": 10,
    "offset": 0,
    "returned": 0,
    "total": 0,
    "hasMore": false,
    "nextCursor": null,
    "cursor": null
  }
}
```

Use `limit` values that match the UI page-size controls (`10`, `20`, `50`) unless the endpoint
documents a stricter bound.

## THQL Search

THQL is the query language used by the test-case search UI and analytics preview API. The same
string can be validated before execution:

```json
{
  "query": {
    "entity": "results",
    "projectId": "project-id",
    "thql": "status in [\"failed\", \"broken\"] and durationMs >= 1000",
    "limit": 20
  }
}
```

Endpoints:

| Method | Path                              | Purpose                                         |
| ------ | --------------------------------- | ----------------------------------------------- |
| POST   | `/api/v1/query/validate`          | Parse THQL and return supported-field errors.   |
| POST   | `/api/v1/query/preview`           | Return a bounded read-model preview.            |
| POST   | `/api/v1/analytics/run`           | Run aggregate analytics over filtered rows.     |
| GET    | `/api/v1/analytics/results`       | Read full-scope result metrics and signal rows. |
| GET    | `/api/v1/thql/filters`            | List saved THQL filters visible to the actor.   |
| POST   | `/api/v1/thql/filters`            | Create a saved THQL filter.                     |
| DELETE | `/api/v1/thql/filters/{filterId}` | Delete a user-created saved THQL filter.        |

Supported operators: `=`, `!=`, `~=`, `>`, `>=`, `<`, `<=`, `in`, `and`, `or`, `not`,
parentheses, quoted strings, numbers, and booleans.

Common examples:

```text
status in ["failed", "broken"]
name ~= "checkout" and durationMs > 3000
tag = "smoke" or tags in ["regression", "release"]
customFields["Priority"] = "P0"
```

Saved filters have Jira-like visibility scopes:

| Scope    | Visibility                                |
| -------- | ----------------------------------------- |
| Global   | Available to every user.                  |
| Project  | Available only inside the owning project. |
| Personal | Available only to the owner.              |

Each user can hide any saved filter from their own filter row without deleting it for other users.
Personal filters require an authenticated actor. Project filters require `settings:read` to list
inside a project and `settings:write` plus project owner rights to create/delete. Global filters
can be created or deleted only by a global admin bearer session.
See `docs/thql.md` for the full field catalog and UI behavior.

## Main Resource Groups

| Group                  | Representative paths                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| Capabilities           | `GET /api/v1/capabilities`                                                                      |
| Projects               | `GET /api/v1/projects`, `POST /api/v1/projects`                                                 |
| Launches               | `GET /api/v1/projects/{projectId}/launches`, `GET /api/v1/launches/{launchId}`                  |
| Results                | `GET /api/v1/launches/{launchId}/results`, `GET /api/v1/launches/{launchId}/results/{resultId}` |
| Uploads                | JSON batch, chunked upload sessions, archive status reads                                       |
| Test cases             | history, comparison, permission-audit reads                                                     |
| Defects and quarantine | defect mute projection, mutation and replay read models                                         |
| Project settings       | access, tokens, visibility, integrations, artifact retention, custom fields                     |
| Operations evidence    | health, cleanup, retention schedule and security audit read models                              |

## Project Settings API

Project settings are split so high-risk secrets and mutable access data stay explicit:

| Method | Path                                                            | Purpose                                                                                                |
| ------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| GET    | `/api/v1/projects/{projectId}/settings/access`                  | Read memberships, roles, visibility, integrations, custom fields, and redacted project token metadata. |
| PATCH  | `/api/v1/projects/{projectId}/settings/access`                  | Update memberships, visibility policies, integration providers, and custom field mappings.             |
| POST   | `/api/v1/projects/{projectId}/settings/access/tokens`           | Create a project API token; the raw secret is returned only once.                                      |
| DELETE | `/api/v1/projects/{projectId}/settings/access/tokens/{tokenId}` | Revoke a project API token and return redacted metadata.                                               |
| GET    | `/api/v1/projects/{projectId}/settings/artifacts`               | Read artifact retention settings.                                                                      |
| PATCH  | `/api/v1/projects/{projectId}/settings/artifacts`               | Update global and per-artifact retention rules.                                                        |

Integration providers map imported result metadata to external URLs. The complete setup and
extension walkthrough is in the [integration guide](integrations.md). For example, configure Jira
issue keys with:

```json
{
  "id": "jira-issues",
  "name": "Jira",
  "preset": "jira",
  "source": { "kind": "issue", "name": "issue", "matchMode": "all" },
  "baseUrl": "https://jira.example.com/browse/",
  "suffixTemplate": "{value}",
  "encodeSuffix": true,
  "enabled": true
}
```

The API stores only the template and mapping metadata. Result imports provide the label value.

Artifact retention settings have global cleanup switches plus per-artifact rows:

```json
{
  "attachmentRetentionDays": 14,
  "cleanupGraceDays": 7,
  "compressRetainedTextArtifacts": true,
  "deleteBinaryArtifactsAfterRetention": true,
  "retentionPolicies": [
    {
      "id": "screenshots",
      "artifact": "screenshots",
      "passedDays": 14,
      "failedDays": 90,
      "quarantinedDays": 120,
      "maxSizeMb": 25
    }
  ]
}
```

## OpenAPI Rules

- Every runtime route must be represented in `docs/openapi/openapi.yaml`.
- Operation IDs must remain stable and unique.
- Every operation must include a useful human description, at least one 2xx success response, and
  descriptions for every documented response.
- Every documented `application/json` response must include a schema so Swagger, clients, and tests
  can validate payload shape instead of relying on prose.
- Regenerate the endpoint catalog with `npm run api:docs:catalog` after changing paths, tags, or
  operation IDs.
- Sensitive values, signed URLs, storage keys, local paths, bearer tokens, and raw artifact payloads
  must not appear in examples.
- Run `npm run openapi:check` after route changes.

## Local Smoke

For the full local API + web + worker stack, use the one-command wrapper:

```bash
npm run local:up
```

After it finishes, open:

- Web UI: `http://127.0.0.1:5173`
- Swagger UI: `http://127.0.0.1:18080/docs`
- OpenAPI JSON: `http://127.0.0.1:18080/docs/json`
- Web docs proxy: `http://127.0.0.1:5173/docs`

Run the post-start smoke when you need a quick local confidence check:

```bash
npm run local:smoke
```

Restart the already running API, worker, and web containers without rebuilding when you only need to
refresh runtime state:

```bash
npm run local:restart
```

The Docker aliases run the same stack lifecycle and are kept for CI and existing automation:

```bash
npm run docker:up
npm run docker:smoke
```

The smoke test checks API health, the API documentation route, and the web container docs proxy.

## Examples

Login and keep the session token:

```bash
curl -s http://127.0.0.1:18080/api/v1/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"admin","password":"admin"}'
```

Read current user:

```bash
curl -s http://127.0.0.1:18080/api/v1/auth/me \
  -H "authorization: Bearer <session-token>"
```

Create a personal token for local CLI use:

```bash
curl -s http://127.0.0.1:18080/api/v1/auth/tokens \
  -H "authorization: Bearer <session-token>" \
  -H "content-type: application/json" \
  -d '{"name":"Локальная консоль","scopes":["profile:read","tokens:read","tokens:write"]}'
```

Revoke a personal token:

```bash
curl -s -X DELETE http://127.0.0.1:18080/api/v1/auth/tokens/<token-id> \
  -H "authorization: Bearer <session-token>"
```

Create a project-scoped API token:

```bash
curl -s http://127.0.0.1:18080/api/v1/projects/<project-id>/settings/access/tokens \
  -H "authorization: Bearer <session-token>" \
  -H "x-testhistory-actor-id: admin" \
  -H "x-testhistory-project-scope: <project-id>" \
  -H "x-testhistory-scopes: settings:write" \
  -H "content-type: application/json" \
  -d '{"name":"CI upload","ownerSubject":"ci-regression","scopes":["launches:write","results:write"],"expiresAt":"2026-09-03T10:00:00.000Z"}'
```

Read project access settings:

```bash
curl -s http://127.0.0.1:18080/api/v1/projects/<project-id>/settings/access \
  -H "authorization: Bearer <session-token>" \
  -H "x-testhistory-actor-id: admin" \
  -H "x-testhistory-project-scope: <project-id>" \
  -H "x-testhistory-scopes: settings:read"
```

Update artifact retention settings:

```bash
curl -s -X PATCH http://127.0.0.1:18080/api/v1/projects/<project-id>/settings/artifacts \
  -H "authorization: Bearer <session-token>" \
  -H "x-testhistory-actor-id: admin" \
  -H "x-testhistory-project-scope: <project-id>" \
  -H "x-testhistory-scopes: settings:write" \
  -H "content-type: application/json" \
  -d '{"attachmentRetentionDays":21,"cleanupGraceDays":7,"compressRetainedTextArtifacts":true,"deleteBinaryArtifactsAfterRetention":true}'
```

Upload a small Allure JSON batch into an existing launch:

```bash
curl -s http://127.0.0.1:18080/api/v1/launches/<launch-id>/results/json \
  -H "content-type: application/json" \
  -H "x-testhistory-actor-id: admin" \
  -H "x-testhistory-project-scope: <project-id>" \
  -H "x-testhistory-scopes: uploads:write" \
  -d '{"files":[{"path":"sample-result.json","content":"{\"uuid\":\"sample\",\"name\":\"Sample\",\"status\":\"passed\"}"}]}'
```

The response includes `results: [{ path, resultId, resultUrl, status }]`. Use `resultId` in
`GET /api/v1/launches/{launchId}/results/{resultId}`, or request `resultUrl` directly. For an
idempotent retry, `status` is `duplicate` and the same result ID is returned. The older
`imported[].uuid` field remains available.

The launch result list accepts one `status` or a comma-separated union. For example,
`GET /api/v1/launches/{launchId}/results?status=broken,unknown&limit=25` returns both statuses,
with `page.total` and `page.nextCursor` calculated after filtering. A single `status=broken`
matches only broken results. Invalid status names return HTTP 400.

Always prefer generated Swagger for exact request and response schemas; these examples show the
auth/scoping headers expected by protected endpoints.

## Workflow Recipes

Use the recipes below as operator-level flows. They intentionally use placeholders and minimal
payloads; Swagger remains the source of truth for the full schema of every request and response.

### Chunked Allure Upload

1. Create a chunked upload session with
   `POST /api/v1/launches/{launchId}/uploads/chunked`.
2. Upload every chunk with `PUT /api/v1/uploads/{uploadId}/chunks/{index}`.
3. Read upload session state with `GET /api/v1/uploads/{uploadId}/session` when a client needs to
   resume or verify missing chunks.
4. Complete the upload with `POST /api/v1/uploads/{uploadId}/complete`.
5. Poll `GET /api/v1/uploads/{uploadId}/status` or `GET /api/v1/launches/{launchId}/ingestion/status`
   until processing is finished.

The complete response returns `job.id` immediately. Result IDs are available in `job.results` and
the upload status `results` after parsing finishes; the queued response has an empty array.

Required scopes are usually `uploads:write` for mutation calls and `uploads:read,launches:read` for
status reads.

### Allure-Compatible Uploads

Allure-compatible producers can use the `/api/rs/*` and `/api/allurectl/upload` routes:

1. Create or resolve a launch with `POST /api/rs/launch`.
2. Create a session with `POST /api/rs/session`.
3. Upload files with `POST /api/rs/session/{sessionId}/file`.
4. Close the session with `POST /api/rs/session/{sessionId}/close`.
5. Close the launch with `POST /api/rs/launch/{launchId}/close`.

For one-shot CLI uploads, use `POST /api/allurectl/upload`. Project id based compatibility imports
use `POST /api/rs/import/{projectId}`. These compatibility routes normalize Allure payloads into the
same ingestion pipeline as the native upload endpoints.

### Retention Cleanup

Retention cleanup is intentionally staged:

1. Preview candidates with `POST /api/v1/artifacts/retention/preview`.
2. Review redacted candidate counts and cleanup windows.
3. Execute with `POST /api/v1/artifacts/retention/execute` only after the preview is acceptable.
4. For launch attachment preview descriptors, use
   `GET /api/v1/launches/{launchId}/attachment-previews/retention/preview` and
   `GET /api/v1/launches/{launchId}/attachment-previews/retention/dry-run/schedule`.

Retention responses must stay descriptor-only: no raw blobs, storage keys, signed URLs, local paths,
or bearer tokens.

### Defects And Quarantine Reads

Defect and quarantine state is exposed as read models:

- `GET /api/v1/defects?projectId={projectId}&limit=50` lists bounded defect clusters visible to
  the caller. The response is a redacted `defect-list` read model with pagination metadata,
  lifecycle status, failure signature summary, affected test ids, and lightweight result
  occurrences only; raw result payloads, local paths, storage keys, tokens, and signed URLs are not
  returned.
- `GET /api/v1/projects/{projectId}/defect-mutes/projection` reads active/inactive defect mute
  projection state for a project.
- Replay invariant routes under
  `/api/v1/projects/{projectId}/defect-mutes/projection/replay/invariants` prove the worker-produced
  projection is deterministic and redacted.

Use `defects:read` for these reads. Mutation controls should stay behind role checks in the API and
hidden in the UI when the user lacks rights.

### Security Audit Export Policy

Security audit export is policy-evaluated before any external delivery:

1. List audit events with `GET /api/v1/security/audit`.
2. Evaluate a candidate export with `POST /api/v1/security/audit/export/evaluate`.
3. Use project-scoped replay invariant reads under
   `/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants` to verify the
   lifecycle policy without exposing provider credentials.

Export policy responses must remain redacted and provider-neutral; raw destinations, tokens,
credentials, signed URLs, and storage paths are never valid response data.

## Settings API Walkthrough

Project settings are edited through two surfaces: access settings and artifact settings. The UI
uses the same calls below; operators can reproduce them from Swagger, curl, or a CI bootstrap job.

1. Authenticate as an admin or project owner through `/api/v1/auth/login`.
2. Read `/api/v1/auth/me` to confirm the current user and role before showing protected settings
   tabs.
3. Create personal tokens through `/api/v1/auth/tokens` only for the current user. Personal token
   reads return redacted metadata; the raw secret is returned only once on creation.
4. Read `/api/v1/projects/{projectId}/settings/access` before editing memberships, visibility,
   integrations, custom field mappings, or project API token metadata.
5. Create project API tokens with
   `/api/v1/projects/{projectId}/settings/access/tokens` for CI upload flows. Store the returned
   secret outside TestHistory; subsequent reads show only redacted metadata.
6. Configure external links as label mappings through integration providers. For example, imported issue
   `ANDROID-123` becomes `https://jira.example.com/browse/ANDROID-123` with a Jira issue provider;
   see the [integration guide](integrations.md) for the exact PATCH payload.

   External integrations are label-to-link mappings for imported metadata. A mapping can express
   the same rule as `label JIRA_ISSUE = ANDROID-123` with the URL
   template `https://www.jira.ru/browse/{value}`. Treat the template host as configuration: replace
   it with the HTTPS origin of your Jira installation and keep credentials in environment-backed
   integration settings.

7. Edit artifact retention through `/api/v1/projects/{projectId}/settings/artifacts`. Global fields
   and every `retentionPolicies[]` row are mutable, so screenshots, video/trace, and logs can keep
   different passed/failed/quarantine windows and size limits.
8. Configure enterprise access through `/api/v1/projects/{projectId}/enterprise-access`. OIDC
   provider records contain only an environment-variable reference to the client secret;
   discovery checks use bounded HTTPS requests with SSRF protection. Rotate SCIM bearer tokens
   through the dedicated token endpoint; the raw value is shown once and only its hash is stored.
9. Run `npm run openapi:check` after changing any route, schema, example, or docs claim.

## Production Integration Notes

- Browser clients should authenticate through `/api/v1/auth/login` or `/api/v1/auth/register`, then
  pass the returned bearer token on subsequent requests.
- Personal API tokens are created from the authenticated user context and should be used for local
  CLI or agent workflows only when their scopes are narrower than the owning user.
- Project API tokens are created from project settings and should be used by CI uploads. Keep them
  scoped to `launches:write`, `results:write`, and `uploads:write` unless the pipeline needs read
  operations.
- Link providers map Allure labels and custom fields to safe external URLs. Active issue-tracker
  adapters can also create Jira, YouTrack, GitHub, or generic issues through the durable delivery
  outbox. Tracker tokens are referenced by environment-variable name and are never stored in the
  project record or returned by the API.
- Notification integrations support generic signed webhooks, Slack, Teams, and Pachca. CI terminal states,
  launch closure/failure, and failed quality gates create idempotent outbox records. The worker
  claims deliveries with leases and bounded retries so API restarts do not lose notifications.
- Inbound CI integrations accept the compact TestHistory webhook contract as well as native GitLab
  pipeline and GitHub `workflow_run` payloads. GitHub HMAC verification uses the exact JSON request
  bytes. Set `TESTHISTORY_INTEGRATION_MASTER_KEY` to at least 32 random characters in production;
  provider secrets are encrypted with AES-256-GCM and are only returned once at creation time.
  dispatches bounded batches at `/api/v1/integrations/deliveries/dispatch`; failures use exponential
  retry and eventually move to `dead` without leaking response bodies or credentials.
- Outbound URLs must use HTTPS and cannot contain credentials or token-like query values. Local and
  private destinations require an exact hostname in `TESTHISTORY_OUTBOUND_HOST_ALLOWLIST`.
- Enterprise project access supports redacted OIDC provider configuration and discovery plus a
  project-scoped SCIM 2.0 Users lifecycle. SCIM create, list, patch, and deactivate operations use
  a one-time bearer token, assign bounded project roles, and append security audit events. Keep
  OIDC client secrets in the referenced environment variable or deployment secret manager.
- Launch comparison uses final retries and stable automated-test identities to classify new,
  removed, fixed, regressed, status-changed, and unchanged results. Analytics responses include
  launch series, status counters, pass/failure rate, total/average duration, p50, and p95 values.
- Launch dashboard aggregation evaluates up to 24 widgets across all results of one launch at
  `POST /api/v1/launches/{launchId}/dashboard/aggregate`. Each widget returns complete counts with
  up to 30 groups and 20 table rows, or an explicit unsupported reason. `groupsTruncated` and
  `groupCount` mark large distributions; donut widgets combine remaining groups into "Остальные".
  Muted results are excluded unless a widget filters for
  them; pass rate excludes muted results from its denominator. Retry counts are unavailable because
  the stored result does not carry a reliable attempt total.
- Artifact retention settings are policy data. They do not delete artifacts by themselves until the
  retention preview or execution endpoint is called by an authorized operator or scheduled worker.

## Endpoint Catalog

The catalog below is generated from the committed OpenAPI tags and should stay in sync with
`docs/openapi/openapi.yaml`.

Regenerate it with `npm run api:docs:catalog` after changing paths, tags, or operation IDs.

### analytics

- `GET /api/v1/analytics/results` - `listAnalyticsResults`
- `POST /api/v1/analytics/run` - `runAnalytics`

### artifacts

- `GET /api/v1/artifacts` - `listArtifacts`
- `GET /api/v1/artifacts/{artifactId}/content` - `getArtifactContent`
- `GET /api/v1/artifacts/{artifactId}/preview` - `getArtifactTextPreview`
- `POST /api/v1/artifacts/retention/execute` - `executeArtifactRetentionCleanup`
- `POST /api/v1/artifacts/retention/preview` - `previewArtifactRetention`
- `GET /api/v1/artifacts/upload-policy` - `getArtifactUploadPolicy`
- `GET /api/v1/launches/{launchId}/attachment-previews/retention/dry-run/schedule` - `readAttachmentPreviewRetentionDryRunScheduleDescriptors`
- `GET /api/v1/launches/{launchId}/attachment-previews/retention/preview` - `previewAttachmentPreviewRetention`

### auth

- `POST /api/v1/auth/login` - `loginUser`
- `GET /api/v1/auth/me` - `getCurrentUser`
- `POST /api/v1/auth/register` - `registerUser`
- `GET /api/v1/auth/tokens` - `listPersonalApiTokens`
- `POST /api/v1/auth/tokens` - `createPersonalApiToken`
- `DELETE /api/v1/auth/tokens/{tokenId}` - `revokePersonalApiToken`

### automation-jobs

- `GET /api/v1/projects/{projectId}/automation-jobs` - `listAutomationJobs`
- `POST /api/v1/projects/{projectId}/automation-jobs` - `createAutomationJob`
- `PATCH /api/v1/projects/{projectId}/automation-jobs/{jobId}` - `updateAutomationJob`

### dashboards

- `GET /api/v1/dashboards` - `listDashboards`
- `POST /api/v1/dashboards` - `createDashboard`
- `DELETE /api/v1/dashboards/{dashboardId}` - `deleteDashboard`
- `GET /api/v1/dashboards/{dashboardId}` - `getDashboard`
- `PATCH /api/v1/dashboards/{dashboardId}` - `updateDashboard`
- `GET /api/v1/dashboards/{dashboardId}/widgets` - `listDashboardWidgets`
- `POST /api/v1/dashboards/{dashboardId}/widgets` - `createDashboardWidget`
- `DELETE /api/v1/dashboards/{dashboardId}/widgets/{widgetId}` - `deleteDashboardWidget`
- `PATCH /api/v1/dashboards/{dashboardId}/widgets/{widgetId}` - `updateDashboardWidget`
- `POST /api/v1/launches/{launchId}/dashboard/aggregate` - `aggregateLaunchDashboard`

### defects

- `GET /api/v1/defects` - `listDefects`
- `POST /api/v1/launches/{launchId}/results/{resultUuid}/quarantine` - `quarantineLaunchResult`
- `DELETE /api/v1/projects/{projectId}/defect-mutes/{muteId}` - `removeDefectMute`
- `GET /api/v1/projects/{projectId}/defect-mutes/projection` - `getDefectMuteProjection`
- `GET /api/v1/projects/{projectId}/defect-mutes/projection/replay/invariants` - `getDefectMuteReplayInvariantEvidence`
- `GET /api/v1/projects/{projectId}/defect-mutes/projection/replay/invariants/materialized` - `getDefectMuteReplayInvariantMaterializedRead`
- `DELETE /api/v1/projects/{projectId}/defects/{defectId}` - `archiveDefect`
- `DELETE /api/v1/projects/{projectId}/defects/{defectId}/results/{resultUuid}` - `unlinkDefectResult`

### integrations

- `POST /api/v1/integrations/deliveries/dispatch` - `dispatchIntegrationDeliveries`
- `GET /api/v1/projects/{projectId}/integration-deliveries` - `listIntegrationDeliveries`
- `DELETE /api/v1/projects/{projectId}/integrations/{kind}/{integrationId}` - `deleteOutboundIntegration`
- `PATCH /api/v1/projects/{projectId}/integrations/{kind}/{integrationId}` - `updateOutboundIntegration`
- `GET /api/v1/projects/{projectId}/integrations/ci` - `listCiIntegrations`
- `POST /api/v1/projects/{projectId}/integrations/ci` - `createCiIntegration`
- `GET /api/v1/projects/{projectId}/integrations/issue-trackers` - `listIssueTrackerIntegrations`
- `POST /api/v1/projects/{projectId}/integrations/issue-trackers` - `createIssueTrackerIntegration`
- `GET /api/v1/projects/{projectId}/integrations/notifications` - `listNotificationIntegrations`
- `POST /api/v1/projects/{projectId}/integrations/notifications` - `createNotificationIntegration`
- `POST /api/v1/projects/{projectId}/issues` - `createExternalIssue`
- `POST /api/v1/webhooks/ci/{integrationId}` - `receiveCiWebhook`

### launches

- `DELETE /api/v1/launches/{launchId}` - `deleteLaunch`
- `GET /api/v1/launches/{launchId}` - `getLaunch`
- `POST /api/v1/launches/{launchId}/archive` - `archiveLaunch`
- `POST /api/v1/launches/{launchId}/close` - `closeLaunch`
- `GET /api/v1/launches/{launchId}/results` - `listLaunchResults`
- `GET /api/v1/launches/{launchId}/results/{resultUuid}` - `getLaunchResultDetails`
- `GET /api/v1/projects/{projectId}/launches` - `listProjectLaunches`
- `POST /api/v1/projects/{projectId}/launches` - `createLaunch`
- `GET /api/v1/projects/{projectId}/launches/compare` - `compareProjectLaunches`

### mcp

- `GET /api/v1/mcp/manifest` - `getMcpManifest`

### projects

- `GET /api/v1/projects` - `listProjects`
- `POST /api/v1/projects` - `createProject`
- `GET /api/v1/projects/{projectId}/settings/access` - `getProjectAccessSettings`
- `PATCH /api/v1/projects/{projectId}/settings/access` - `updateProjectAccessSettings`
- `POST /api/v1/projects/{projectId}/settings/access/tokens` - `createProjectApiToken`
- `DELETE /api/v1/projects/{projectId}/settings/access/tokens/{tokenId}` - `revokeProjectApiToken`
- `GET /api/v1/projects/{projectId}/settings/artifacts` - `getProjectArtifactSettings`
- `PATCH /api/v1/projects/{projectId}/settings/artifacts` - `updateProjectArtifactSettings`

### quality-gates

- `GET /api/v1/launches/{launchId}/quality-gate` - `getLaunchQualityGate`
- `POST /api/v1/launches/{launchId}/quality-gate` - `evaluateLaunchQualityGate`

### query

- `POST /api/v1/query/preview` - `previewQuery`
- `POST /api/v1/query/validate` - `validateQuery`
- `GET /api/v1/thql/filters` - `listThqlFilters`
- `POST /api/v1/thql/filters` - `createThqlFilter`
- `DELETE /api/v1/thql/filters/{filterId}` - `deleteThqlFilter`

### security

- `GET /api/scim/v2/projects/{projectId}/Users` - `listProjectScimUsers`
- `POST /api/scim/v2/projects/{projectId}/Users` - `provisionProjectScimUser`
- `DELETE /api/scim/v2/projects/{projectId}/Users/{userId}` - `disableProjectScimUser`
- `PATCH /api/scim/v2/projects/{projectId}/Users/{userId}` - `patchProjectScimUser`
- `GET /api/v1/projects/{projectId}/enterprise-access` - `getProjectEnterpriseAccess`
- `POST /api/v1/projects/{projectId}/enterprise-access/oidc` - `createProjectOidcProvider`
- `DELETE /api/v1/projects/{projectId}/enterprise-access/oidc/{providerId}` - `deleteProjectOidcProvider`
- `PATCH /api/v1/projects/{projectId}/enterprise-access/oidc/{providerId}` - `updateProjectOidcProvider`
- `POST /api/v1/projects/{projectId}/enterprise-access/oidc/{providerId}/discover` - `discoverProjectOidcProvider`
- `POST /api/v1/projects/{projectId}/enterprise-access/scim/token` - `rotateProjectScimToken`
- `GET /api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants` - `readSecurityAuditExportLifecycleReplayInvariants`
- `GET /api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized` - `readSecurityAuditExportLifecycleReplayInvariantMaterialized`
- `GET /api/v1/security/audit` - `listSecurityAuditEvents`
- `POST /api/v1/security/audit/export/evaluate` - `evaluateSecurityAuditExportPolicy`

### system

- `GET /api/v1/capabilities` - `getCapabilities`
- `GET /docs` - `getSwaggerUi`
- `GET /docs/json` - `getRuntimeOpenApiJson`
- `GET /health` - `getHealth`

### test-cases

- `GET /api/v1/test-cases` - `listTestCases`
- `GET /api/v1/test-cases/{testCaseId}` - `getTestCase`
- `PATCH /api/v1/test-cases/{testCaseId}` - `updateTestCaseMetadata`
- `GET /api/v1/test-cases/{testCaseId}/history` - `getTestCaseHistory`
- `GET /api/v1/test-cases/{testCaseId}/history/compare` - `compareTestCaseHistory`
- `GET /api/v1/test-cases/{testCaseId}/history/compare/permission-audit` - `readTestCaseHistoryComparePermissionAudit`
- `GET /api/v1/test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants` - `readTestCaseHistoryComparePermissionAuditReplayInvariants`
- `GET /api/v1/test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants/persisted` - `readTestCaseHistoryComparePermissionAuditReplayInvariantPersisted`

### test-plans

- `GET /api/v1/projects/{projectId}/test-plans` - `listTestPlans`
- `POST /api/v1/projects/{projectId}/test-plans` - `createTestPlan`
- `DELETE /api/v1/projects/{projectId}/test-plans/{planId}` - `archiveTestPlan`
- `GET /api/v1/projects/{projectId}/test-plans/{planId}` - `getTestPlan`
- `PATCH /api/v1/projects/{projectId}/test-plans/{planId}` - `updateTestPlan`

### uploads

- `POST /api/allurectl/upload` - `uploadAllureCtlCompatibleBatch`
- `POST /api/rs/import/{projectId}` - `importAllureCtlCompatibleProjectFiles`
- `POST /api/rs/launch` - `createAllureCtlCompatibleLaunch`
- `POST /api/rs/launch/{launchId}/close` - `closeAllureCtlCompatibleLaunch`
- `POST /api/rs/session` - `createAllureCtlCompatibleSession`
- `GET /api/rs/session/{sessionId}` - `getAllureCtlCompatibleSession`
- `POST /api/rs/session/{sessionId}/close` - `closeAllureCtlCompatibleSession`
- `POST /api/rs/session/{sessionId}/file` - `uploadAllureCtlCompatibleSessionFile`
- `GET /api/v1/ingestion/readiness` - `getEnterpriseIngestionReadiness`
- `GET /api/v1/launches/{launchId}/archive/diagnostics/replay` - `listArchiveDiagnosticReplaySummaries`
- `GET /api/v1/launches/{launchId}/ingestion/status` - `getLaunchIngestionStatus`
- `POST /api/v1/launches/{launchId}/results/json` - `uploadAllureJsonBatch`
- `POST /api/v1/launches/{launchId}/uploads/archive` - `intakeAllureArchiveManifest`
- `GET /api/v1/launches/{launchId}/uploads/archive/status` - `listArchiveUploadStatuses`
- `POST /api/v1/launches/{launchId}/uploads/chunked` - `createChunkedUploadSession`
- `GET /api/v1/projects/{projectId}/archive/diagnostics/replay/fixtures` - `listArchiveDiagnosticReplayFixtureContracts`
- `GET /api/v1/projects/{projectId}/archive/diagnostics/replay/fixtures/materialized` - `listArchiveDiagnosticReplayMaterializedFixtureReads`
- `GET /api/v1/uploads/{uploadId}` - `getUploadJob`
- `POST /api/v1/uploads/{uploadId}/abort` - `abortChunkedUpload`
- `GET /api/v1/uploads/{uploadId}/archive/status` - `getArchiveUploadStatus`
- `PUT /api/v1/uploads/{uploadId}/chunks/{index}` - `uploadChunk`
- `POST /api/v1/uploads/{uploadId}/complete` - `completeChunkedUpload`
- `POST /api/v1/uploads/{uploadId}/process` - `processQueuedChunkedUploadJob`
- `GET /api/v1/uploads/{uploadId}/session` - `getUploadSession`
- `GET /api/v1/uploads/{uploadId}/status` - `getUploadIngestionStatus`
- `GET /api/v1/uploads/jobs` - `listUploadJobsForWorkerPolling`
- `POST /api/v1/uploads/jobs/claim` - `claimUploadJobsForWorker`
