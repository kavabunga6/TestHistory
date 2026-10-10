# TestHistory CLI

The Node.js CLI uploads existing Allure JSON results to an existing project. It uses project-scoped
API tokens and the public launch, JSON import, result and artifact endpoints. It does not provision
users or projects, run workers, or provide compatibility with another vendor's upload executable.
Node.js 24 or later is required; the CLI has no runtime package dependencies.

## Configuration

Provide these environment variables through the CI credential mechanism:

| Variable                 | Purpose                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| `TESTHISTORY_BASE_URL`   | API origin, for example `https://testhistory.example.com`            |
| `TESTHISTORY_PROJECT_ID` | Existing project identifier; required for upload                     |
| `TESTHISTORY_TOKEN`      | Project API token; never pass it as an argument                      |
| `TESTHISTORY_WEB_URL`    | Optional web origin for the receipt link; defaults to the API origin |

The upload needs `launches:write`, `uploads:write`, `launches:read`, `results:read` and
`artifacts:read` in that project. `check` reads anonymous health metadata; `status` needs
`launches:read`. URLs must be origins without credentials, query strings or an API path.
Redirects are refused. HTTPS uses Node's certificate verification; disabling it is refused.
HTTP is supported for a separately protected private deployment and does not encrypt the token.

## Upload and verification

```sh
node scripts/testhistory-cli.mjs upload \
  --results-dir build/allure-results \
  --launch-name "Android UI" \
  --expected-results 50 \
  --planned-results 50 \
  --min-screenshots 1 \
  --branch main \
  --commit "$APP_COMMIT" \
  --build-number "$BUILD_NUMBER" \
  --output build/testhistory-receipt.json
```

The input must contain actual `*-result.json` files with unique `uuid`, `name`, `fullName`,
`historyId`, `testCaseId`, status and nonempty labels. The default mode requires real positive
timing. Completed results keep their original `start` and `stop`; an optional
`elapsedRealtimeNanos` parameter must agree with the millisecond interval. A real positive
submillisecond measurement can remain zero milliseconds with its exact nanosecond parameter.
No timestamps or duration are invented. Failed and broken statuses remain unchanged.

Every referenced top-level or nested-step attachment must exist beneath the results directory.
Absolute paths, traversal, encoded path aliases, symbolic links, empty attachments and oversized
files are rejected before creating a launch. PNGs must pass structural, CRC and decompression
checks. A result and all its referenced attachments stay in the same JSON batch; the same source
referenced by multiple steps is deduplicated within a batch. Recognized container and environment,
executor and category metadata files are also uploaded. Unreferenced attachments are not uploaded.

Serialized batches are limited to 8 MiB, including base64 and JSON overhead; `--batch-bytes` can
lower the limit to at least 1024 bytes. A single result group must fit. Input limits are 10,000 files,
8 MiB per file and 256 MiB in total. API responses are bounded to 8 MiB. Each request has a
15-second timeout; `--timeout-ms` accepts 1000 through 60000. The deployment must permit these
request sizes. There are no automatic upload retries that could duplicate results.

After import, the CLI checks the exact result count, identities, statuses, raw timing, labels,
parameters, descriptions, links, steps and attachment descriptors. It downloads referenced
artifact content and compares bytes and SHA256. Only then does it close the launch and confirm
closure. The receipt includes `launchUrl`, result and evidence counts, timing completeness,
`testStatusCounts`, verification fields and `testRunPassed`. Upload verification can succeed for a
failed test run; `testRunPassed` remains false.

## Interrupted and ignored tests

For a failed or interrupted job, explicitly add `--allow-incomplete` and set `--expected-results`
to the number of actual native result files, including unfinished cases. Keep `--planned-results`
at the planned suite size. An unfinished `unknown` / `running` result must have its actual start
and no stop or elapsed duration. An ignored `skipped` / `finished` result can omit both times.
Measured zero duration is also retained only in this mode. The receipt reports incomplete,
unknown-time and nonpositive-time counts. It cannot claim a complete passing suite for these cases.
No file is silently skipped, and zero native results are rejected. Use `--min-screenshots 0` only
when the actual failed-run evidence has no screenshots.

## Recovery and read checks

`--output` creates a new receipt file with restrictive permissions; its parent must already exist.
An existing file is refused, preserving prior evidence. Checkpoints record the current stage and,
when known, the created launch ID. On failure the command exits nonzero with a safe error code,
without printing bearer values, API response bodies or local artifact paths. A failure does not
delete the launch. `closed: false` in a failure receipt means closure was not confirmed; a timeout
can leave the remote operation's outcome uncertain. Reconcile before retrying:

```sh
node scripts/testhistory-cli.mjs status --launch-id "$LAUNCH_ID"
node scripts/testhistory-cli.mjs check
```

`status` reports launch state and count, without re-verifying local input. `check` verifies reported
persistence health metadata; it is not an end-to-end ingestion or artifact-read check.

## Standalone CI artifact and tests

```sh
npm run build:cli
node scripts/dist/testhistory-cli.mjs help
npm run test:cli
```

The deterministic, dependency-free builder combines the CLI source modules into one standalone
file in ignored `scripts/dist`. `testhistory-cli-build.json` records its SHA256 and source/builder
hashes. Copy and verify both files through the deployment's existing trusted path; run the copied
CLI by its verified immutable path. No build or download is required in the CI agent.

Offline tests use temporary synthetic fixtures and injected HTTP contracts. A repository build
also enables a production API test with a real scoped token, file-backed persistence, result
verification and attachment bytes, without opening a listening port. An isolated worktree can
point `TESTHISTORY_TEST_API_MODULE` at an existing compiled `apps/api/dist/app.js` for that test.
