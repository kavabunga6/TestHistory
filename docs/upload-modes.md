# Upload Modes

TestHistory accepts Allure-compatible files in two practical modes: JSON batch upload and resumable chunked upload.

## Allurectl Compatibility

TestHistory exposes a compatibility adapter for `allurectl`-style CI producers. The adapter accepts
the usual Allure TestOps launch/session concepts while reusing the normal TestHistory ingestion
pipeline underneath.

For local smoke tests, point producers at the API host and use any stable project id:

```bash
export ALLURE_ENDPOINT=http://127.0.0.1:18080
export ALLURE_TOKEN=local-dev-token
export ALLURE_PROJECT_ID=1
export ALLURE_LAUNCH_NAME="Nightly"
```

Compatibility endpoints:

```text
POST /api/rs/launch
POST /api/rs/session
POST /api/rs/session/{sessionId}/file
POST /api/rs/session/{sessionId}/close
POST /api/rs/import/{projectId}
POST /api/allurectl/upload
```

The adapter accepts JSON file batches with `path` and `content` fields, imports supported
`allure-results` files, stores artifacts, deduplicates repeated result UUIDs, and closes the launch
when requested. Numeric Allure project ids are auto-provisioned as compatibility projects in local
in-memory mode, so CI can use `ALLURE_PROJECT_ID=1` without knowing a TestHistory UUID first.

The public Qameta docs describe `allurectl` configuration and lifecycle, but the exact proprietary
wire endpoints can change. Keep this adapter covered by compatibility smoke tests whenever upgrading
the external `allurectl` binary.

## JSON Batch Upload

Use JSON batch upload for small `allure-results` sets or simple CI integration.

Endpoint:

```text
POST /api/v1/launches/{launchId}/results/json
```

Request shape:

```json
{
  "files": [
    {
      "path": "sample-result.json",
      "content": "{ \"uuid\": \"...\" }"
    }
  ]
}
```

Behavior:

- Stores every submitted file as an artifact.
- Imports `*-result.json` files into launch results.
- Returns `200` when the batch completes cleanly.
- Returns `207` when the batch completes with per-file errors.
- Returns `results[]` with `resultId` and `resultUrl` for each imported result or idempotent
  duplicate. `resultId` is the result UUID used by
  `GET /api/v1/launches/{launchId}/results/{resultId}`; it is distinct from `job.id`.

This mode is easiest when all files fit comfortably in one request and retries can resend the full batch.

## Chunked Upload Flow

Use chunked upload for large result files, large attachments, or unreliable networks. Chunk indexes are zero-based.

1. Create a session.

```text
POST /api/v1/launches/{launchId}/uploads/chunked
```

```json
{
  "path": "attachments/video.mp4",
  "totalChunks": 42,
  "totalBytes": 348127001
}
```

2. Upload each chunk.

```text
PUT /api/v1/uploads/{uploadId}/chunks/{index}
```

```json
{
  "content": "chunk-content"
}
```

Retry by sending the same `PUT` for the same chunk index. A successful retry replaces or confirms that chunk.

3. Inspect session state when resuming.

```text
GET /api/v1/uploads/{uploadId}/session
```

Use the session response to determine which chunks are already accepted before continuing.

4. Complete the upload.

```text
POST /api/v1/uploads/{uploadId}/complete
```

Completion queues parsing and immediately returns `job.id`. Poll the job status to receive
`results[]` with result IDs and detail URLs once processing finishes.

5. Poll the upload job if the client needs status.

```text
GET /api/v1/uploads/{jobId}/status
```

6. Abort when the client will not finish the upload.

```text
POST /api/v1/uploads/{uploadId}/abort
```

## Choosing a Mode

- Use JSON batch for small result directories, smoke tests, and first integrations.
- Use chunked upload for files near request-size limits, attachments, resumable CI agents, or browser uploads.
- Keep `UPLOAD_CHUNK_BYTES` consistent across clients where possible. The default example value is `8388608` bytes.
- Keep the original Allure relative path in `path`; downstream import and artifact lookup depend on it.

## Production Evidence

Use these commands as review evidence for upload and close behavior:

```bash
npm run smoke:upload-close-ui
npm run load:soak -- --results=10000 --uploaders=10 --batch-size=250
```

`smoke:upload-close-ui` proves the JSON upload, close, history, analytics, and quality-gate path.
`load:soak` proves the high-volume chunked path: session creation, chunk upload, queue claim,
worker processing, launch close, readiness snapshots, and drain metrics. The load/soak command
writes `.tmp/performance/load-soak-evidence.json` and does not persist raw result payloads in the
evidence file.
