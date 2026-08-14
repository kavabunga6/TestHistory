# Performance Architecture

## Executable Load/Soak Evidence

Use `npm run load:soak` to collect runtime ingestion evidence instead of relying only on static
performance contracts.

Default local profile:

```bash
npm run load:soak
```

10k review profile:

```bash
npm run load:soak -- --results=10000 --uploaders=10 --batch-size=250 --claim-limit=20
```

The command builds the API, starts a local API process unless `TESTHISTORY_API_URL` or
`LOAD_SOAK_API_URL` is set, creates a synthetic project and launch, uploads result files through
chunked sessions, claims and processes queued upload jobs, closes the launch, and writes
`.tmp/performance/load-soak-evidence.json`.

Evidence shape:

- `profile`: result count, uploaders, batch size, claim limit, upload mode.
- `upload`: session count, file count, queued/completed jobs.
- `drain`: processed jobs, imported results, stored artifacts, failed jobs, processing jobs.
- `readiness`: before/queued/after snapshots from `/api/v1/ingestion/readiness`.
- `timings`: upload seconds, drain seconds, total seconds, acceptance p50/p95/max.
- `assertions`: imported all results, no failed jobs, queue drained, launch closed, no raw payloads
  persisted in the evidence JSON.

The 10k local evidence captured on 2026-06-03 imported 10,000 results through 40 chunked sessions
with 10 uploaders, 0 failed jobs, queue drained, launch closed, upload 4.1s, drain 1.74s, total
5.97s, and acceptance p95 304.47ms on the in-memory API profile.

Этот документ фиксирует отдельный перфоманс-контракт TestHistory. Его цель:
сервис должен принимать сотни тысяч результатов тестов в день, выдерживать
параллельные CI-заливки с большим количеством артефактов и не превращать UI в
ожидание на десятки секунд.

## Целевые SLA

### UI

- Первичный экран проекта, запусков, кейсов, дефектов и дашбордов показывает
  skeleton/loading state не позднее 300 ms после перехода.
- Первый полезный контент для обычного списка: p95 до 2 s.
- Любой пользовательский запрос, который может длиться больше 1 s, обязан иметь
  loader, progress или partial state.
- UI не должен ждать один огромный ответ дольше 10 s. Если данные не готовы,
  API возвращает job/query id и состояние `queued | running | partial | ready |
failed`.
- Таблицы результатов, кейсов, запусков и дефектов используют серверную
  пагинацию, курсоры и виртуализацию. Нельзя рендерить десятки тысяч строк в DOM.
- Дашборды не считают тяжелую аналитику на клиенте. Клиент получает готовый
  read model или query result page.

### API

- List endpoints: p95 до 1.5 s при прогретых индексах.
- Detail endpoints: p95 до 1 s для обычного результата, до 3 s для результата с
  большим trace/steps при постраничной выдаче вложений.
- Dashboard/THQL queries: p95 до 3 s для готовых read models; тяжелые запросы
  уходят в async query с progressive polling.
- Upload acceptance: ограничивается передачей файла, валидацией metadata и
  записью upload/session records. Полный parse/analytics не выполняется в HTTP
  request path.

### Ingestion And Workers

- Upload API должен быстро принять payload и поставить работу в очередь.
- Parse, normalize, link, analytics materialization, preview generation и cleanup
  выполняются воркерами.
- Все worker jobs idempotent и retry-safe.
- Worker backlog, lag, retry count, dead-letter count и throughput видны в
  метриках.

### Storage

- PostgreSQL хранит transactional/read models.
- ClickHouse или совместимый column store хранит большие аналитические факты.
- OpenSearch или совместимый search store обслуживает полнотекстовый поиск.
- S3-compatible object storage хранит raw files, attachments, videos, screenshots,
  previews и exports отдельно от диска БД.

## Frontend Strategy

### UI Loading Rules

Каждый API-driven экран обязан иметь четыре состояния:

- `loading`: skeleton вместо пустого белого поля.
- `partial`: часть данных уже доступна, фоновые блоки догружаются.
- `empty`: данных реально нет.
- `error`: retry action + trace/request id для поддержки.

### List Rendering

- Launches: cursor pagination по `projectId`, `createdAt`, `launchId`.
- Launch results: server-side filter by status, suite, tag, owner, muted, defect,
  duration bucket.
- Test cases: server-side search + filters, virtualized visible rows.
- Defects: server-side pagination and selected-detail fetch.
- Dashboards: widget query result is paginated where the widget is table-like.

### Client-Side Limits

- Максимум 200 строк в одном синхронном render batch.
- Большие JSON payload не передаются через props целиком в глубокие компоненты.
- AbortController используется при смене вкладки/фильтра.
- Debounce для поиска: 250-400 ms.
- Client cache keyed by route + query + cursor; stale data can be shown while
  refresh runs.
- Любой локальный расчет поверх более чем 5k rows выносится в Web Worker или
  заменяется серверным read model.

## API Query Strategy

### Endpoint Shape

Списочные endpoints должны возвращать:

```json
{
  "items": [],
  "page": {
    "cursor": "opaque",
    "nextCursor": "opaque-or-null",
    "limit": 100,
    "hasMore": true
  },
  "summary": {
    "totalEstimate": 123456,
    "statusCounters": {}
  },
  "query": {
    "state": "ready",
    "durationMs": 132,
    "cache": "hit"
  }
}
```

Правила:

- Cursor pagination вместо offset на больших таблицах.
- Summary не должен требовать full scan в request path.
- Для тяжелых агрегатов использовать materialized views или async query.
- Query timeout: короткие read endpoints fail fast с понятной ошибкой; тяжелые
  dashboard queries переходят в async.

### THQL/Dashboard Query Execution

THQL не должен становиться произвольным SQL.

Execution pipeline:

1. Parse THQL в AST.
2. Validate allowed fields, functions, grouping, time window, tenant/project scope.
3. Estimate cost: selected time range, project count, expected rows, grouping
   cardinality.
4. Choose path:
   - hot read model;
   - ClickHouse aggregate query;
   - async query job;
   - reject with `query_too_expensive`.
5. Cache result by normalized AST + project + permission scope + data version.

Минимальные ограничения:

- Default time window if absent: 14 days.
- Hard max result rows for interactive table widget: 1k rows per page.
- Hard timeout for sync query: 3 s.
- Heavy query result TTL: 30-300 s depending on dashboard freshness settings.

## Ingestion Strategy

### Upload Paths

Поддерживаем три режима:

- JSON batch: small CI result sets.
- Chunked upload: large files/attachments/unreliable networks.
- Archive upload: zipped `allure-results`.

HTTP request path:

1. Authenticate and authorize upload token.
2. Validate project, launch, path, content length, chunk metadata.
3. Stream data to object storage or temp multipart storage.
4. Write upload session/file records.
5. Enqueue parse job.
6. Return upload/job status.

Запрещено:

- Загружать большие файлы целиком в память API.
- Делать полную распаковку archive в API request.
- Считать analytics/case history во время upload request.

### Worker Pipeline

Очереди:

- `upload.intake`
- `archive.unpack`
- `ingestion.parse`
- `ingestion.normalize`
- `launch.aggregate`
- `testcase.sync`
- `analytics.materialize`
- `search.index`
- `artifact.preview`
- `artifact.cleanup`

Каждая job содержит:

- `projectId`
- `launchId`
- `uploadId`
- `idempotencyKey`
- `attempt`
- `traceId`
- `payloadVersion`

Idempotency keys:

- upload chunk: `projectId + uploadId + chunkIndex + checksum`
- raw file: `projectId + launchId + uploadId + relativePath + checksum`
- test result: `projectId + launchId + resultUuid`
- attachment: `projectId + launchId + resultUuid + source + checksum`
- aggregate: `projectId + launchId + aggregateVersion`

### Backpressure

- Per project upload concurrency limit.
- Per token request rate and bandwidth limit.
- Queue depth threshold switches upload response to `accepted_throttled`.
- Worker autoscaling by queue lag and CPU/memory.
- Dead-letter queue visible in operations UI and metrics.

## Database Strategy

### PostgreSQL Tables

High-volume tables must be partitioned:

- `test_results`: by `project_id` and time/launch close month.
- `test_result_attempts`: by `project_id` and launch/month.
- `result_steps`: by `project_id` and launch/month, or stored as compressed JSON
  read model for detail-only access.
- `artifacts`: by `project_id` and created/retention month.
- `analytics_facts`: preferably ClickHouse; if PostgreSQL MVP, partition by
  project/month and keep strict retention.

### Required Indexes

Launch result list:

- `(project_id, launch_id, status, id)`
- `(project_id, launch_id, suite, id)`
- `(project_id, launch_id, owner, id)`
- `(project_id, launch_id, duration_ms desc, id)`

Test case history:

- `(project_id, history_id, started_at desc)`
- `(project_id, test_case_id, started_at desc)`

Defects:

- `(project_id, state, updated_at desc)`
- `(project_id, external_key)`

Artifacts:

- `(project_id, launch_id, result_id)`
- `(project_id, retention_class, cleanup_eligible_at)`
- `(project_id, storage_key)` unique or strongly constrained.

Search fields:

- names, suites, tags, labels, custom fields should be indexed in OpenSearch or
  a dedicated search table, not scanned from result JSON.

### Deletion And Cleanup

- Large deletes are never performed as one transaction.
- Use staged cleanup table:
  - `candidate_id`
  - `project_id`
  - `artifact_id`
  - `storage_key_hash`
  - `retention_rule_id`
  - `reason`
  - `eligible_at`
  - `collected_at`
  - `state`
- Delete in bounded batches, for example 500-2000 objects per worker batch.
- DB rows are soft-marked first; object deletion is retried; final hard cleanup
  runs only after object delete success or after an explicit tombstone policy.
- VACUUM/autovacuum settings and partition drop strategy must be part of rollout.

## Artifact Retention And Compression

Default policy per project:

- Attachment retention: 14 days after launch close.
- Open launches are never cleaned.
- Failed/broken attachments can override retention per project.
- Raw result JSON, result metadata, scenario steps, history and audit records are
  retained longer than binary attachments.
- Videos/screenshots/logs are cleanup candidates unless pinned.

Retention classes:

- `raw_result`
- `attachment`
- `screenshot`
- `video`
- `log`
- `fixture`
- `preview`
- `export`

Default cleanup after 14 days:

1. Stage eligible attachments for closed launches.
2. Delete original attachments from object storage unless pinned.
3. Keep metadata, checksum, size, media type, result link, and deletion audit.
4. Compress remaining text/log/XML/JSON artifacts when useful.
5. Keep thumbnails/previews only if policy requires visual history.
6. Mark UI attachments as `expired` with audit metadata, not broken links.

Compression:

- Text/log/XML/JSON: gzip or zstd at storage layer.
- Screenshots: keep optional thumbnail/webp preview if project policy wants visual
  history after original deletion.
- Video: do not transcode synchronously during ingestion; optional async preview
  generation with explicit CPU budget.
- Already-compressed files are not recompressed.

## Observability

Metrics:

- `upload_bytes_total`
- `upload_sessions_active`
- `upload_duration_seconds`
- `ingestion_jobs_total`
- `ingestion_job_duration_seconds`
- `ingestion_queue_lag_seconds`
- `worker_retries_total`
- `worker_dead_letters_total`
- `api_request_duration_seconds`
- `dashboard_query_duration_seconds`
- `dashboard_query_rows_scanned`
- `artifact_cleanup_candidates_total`
- `artifact_cleanup_deleted_bytes_total`
- `artifact_cleanup_failures_total`
- `frontend_route_load_duration_ms`

Every upload, job, query and cleanup action carries:

- `traceId`
- `projectId`
- `launchId` when available
- `uploadId` when available
- `jobId` when available
- redaction marker

## Load And Soak Tests

Required fixture sizes:

- 10k results, small attachments.
- 100k results, mixed statuses, retries, nested steps.
- 250k results/day project simulation.
- Attachment-heavy launch with images/logs/videos.
- Concurrent CI uploads: 10, 25, 50 uploaders.
- Cleanup run with 1M staged artifacts.

Acceptance gates:

- Upload acceptance does not block on full parse.
- Worker queue drains under expected daily volume.
- Launch list stays responsive with high launch count.
- Result list queries stay paginated and below SLA.
- Dashboard widgets either return within SLA or become async.
- Cleanup never deletes open-launch artifacts.

## Agent Work Breakdown

### Performance Architect

- Own this document and SLA changes.
- Review cross-cutting changes in API, worker, DB, UI and infra.
- Maintain load-test scenarios and release gates.

### Frontend Performance Agent

- Implement route skeletons/loaders.
- Add virtualized lists for launch results and test cases.
- Add AbortController/debounce/cache for filters and THQL widgets.
- Ensure no route blocks on a >10 s request.

### Backend Query Agent

- Implement cursor pagination, query budgets and async query status.
- Add summary/read-model endpoints.
- Normalize THQL AST and query cost estimation.

### Ingestion Agent

- Make upload streaming/chunked/archive paths bounded and idempotent.
- Add queue status, retry/dead-letter visibility and backpressure responses.
- Add large fixture ingestion tests.

### Database Agent

- Design migrations for partitions, indexes and staged cleanup tables.
- Define autovacuum/partition drop rules.
- Validate query plans with large generated data.

### Artifact Cleanup Agent

- Implement project retention settings, default 14-day attachment cleanup and
  pinned artifact exceptions.
- Add compression/preview retention jobs.
- Add cleanup audit and retry-safe object deletion.

### SRE/Infra Agent

- Add resource requests/limits, HPA by queue lag, probes and dashboards.
- Add object-storage lifecycle policy overlays where applicable.
- Add backup/restore and cleanup rollback drills.

### Validation Agent

- Own load, soak, cleanup and browser performance checks.
- Keep validation evidence in CI artifacts.
- Block releases when performance budgets regress without an accepted exception.

## Executable Performance Gates

The first enterprise-load gate is now executable and intentionally lightweight:

- `npm run perf:fixture -- --summary-only --json` builds a deterministic
  100000-results / 1000-users / 6-hours profile without writing sensitive or
  bulky artifacts.
- `npm run perf:fixture -- --write-files` can materialize synthetic
  Allure-compatible result files under `.tmp/testhistory-enterprise-fixture`;
  `.tmp` is ignored and must not be committed.
- `npm run smoke:perf` validates the enterprise profile, the 10-second frontend
  budget, the 14-day default attachment retention rule and the fact that
  high-volume ingestion must use chunked/archive upload instead of JSON batch.
- The same smoke command runs `guard:frontend-perf`, which fails CI if the
  current UI drops bounded render windows for launch, result, defect or
  test-case lists before real API pagination/virtualization replaces the demo
  read model.
- `POST /api/v1/launches/:launchId/results/json` rejects oversized synchronous
  batches with `413 upload.backpressure.batch_too_large`; the route is reserved
  for small CI imports, while enterprise ingestion must go through chunked or
  archive upload.
- `GET /api/v1/ingestion/readiness` reports the enterprise ingestion profile,
  queue depth, in-flight jobs, dead letters, worker-pool concurrency,
  backpressure thresholds, upload-mode limits and the real default attachment
  retention. This endpoint is the runtime contract for autoscaling and load
  validation.
- `POST /api/v1/uploads/:uploadId/complete` is queued-first for chunked uploads:
  it validates completed chunks and creates a queued ingestion job without
  parsing results inside the HTTP request path.
- `POST /api/v1/uploads/:uploadId/process` is the current worker-compatible
  execution boundary for queued chunked-session jobs. It imports results,
  stores artifacts and clears buffered chunks after successful processing.
- Chunked upload payloads are spooled under `.tmp/testhistory-upload-buffer`
  with hashed storage keys. Upload/session read models expose only metadata
  and checksums, while the worker boundary reads chunk references and deletes
  the buffered files after completion or abort. This keeps API memory bounded
  during parallel enterprise uploads and gives us the same contract shape we
  will later back with object storage.
- `GET /api/v1/uploads/jobs?status=queued&source=chunked-session` is the
  bounded, metadata-only polling contract for external workers. It returns at
  most 100 queue entries with process/status links and never exposes buffered
  bytes, local chunk paths, storage keys or signed URLs.
- `POST /api/v1/uploads/jobs/claim` is the preferred worker contract. It
  atomically leases queued or expired chunked-session jobs, marks them
  `processing`, returns a short-lived claim token only to the claiming worker
  and prevents another worker from processing the same upload until the lease
  expires.
- `@testhistory/worker` can poll the API when `TESTHISTORY_API_URL` is set:
  `processApiUploadQueue()` claims queued chunked-session jobs, passes the claim
  token to the worker-compatible process boundary and falls back to the legacy
  metadata polling endpoint only for older API deployments. This removes the
  manual per-job `/process` step and closes the duplicate-worker race while
  keeping the migration path open for a direct queue consumer.
- `GET/PATCH /api/v1/projects/:projectId/settings/artifacts` stores
  project-level artifact retention settings. New artifact descriptors use the
  project override when computing retention and cleanup eligibility; the default
  project policy keeps attachments for `14 days` with a staged cleanup grace
  window.
- `POST /api/v1/artifacts/retention/execute` is the bounded cleanup execution
  contract. It defaults to dry-run, scopes candidates to closed launches only,
  caps work by record count and byte budget, removes descriptor rows only after
  object-store deletion succeeds, and never returns raw storage keys or signed
  URLs to callers.
- `GET /api/v1/launches/:launchId` is now a bounded detail read model: embedded
  `results` and `artifacts` are capped at 100 records and expose `resultsPage`,
  `artifactsPage` and links to the paginated collection endpoints. It must never
  be used as a bulk export endpoint.
- `GET /api/v1/artifacts?limit=...` returns the paginated `artifact-list` read
  model. The legacy array response remains only for callers that omit pagination
  controls while UI and workers migrate to bounded reads.

## Immediate Backlog

P0:

- Replace the HTTP process boundary with a direct queue consumer backed by the
  shared persistence/object-storage layer, reusing the claim/lease semantics for
  worker ownership.
- Add UI loaders/skeleton states to `#launch`, `#case`, `#defects`, `#dashboard`.
- Replace any all-results-in-memory list UI with paginated API contract.
- Replace the in-memory cleanup executor with staged cleanup tables, retry
  state and object-store-backed delete jobs.

P1:

- Add ClickHouse-backed analytics fact path or documented MVP fallback.
- Add THQL cost estimator and async query jobs.
- Add worker queue lag metrics and HPA guidance.
- Add object storage compression/preview policy.
- Add browser performance smoke for 10k visible-result scenario.

P2:

- Add OpenSearch-backed result/test-case search.
- Add partition drop/archival tooling.
- Add project-specific retention UI with preview-before-delete.
- Add dashboard cache invalidation by launch close/materialization version.
