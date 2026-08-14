import { execFileSync, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";

const args = process.argv.slice(2);

const apiPort = process.env.API_PORT ?? "18080";
const configuredBaseUrl = process.env.LOAD_SOAK_API_URL ?? process.env.TESTHISTORY_API_URL;
const baseUrl = (configuredBaseUrl ?? `http://127.0.0.1:${apiPort}`).replace(/\/$/, "");
const shouldSpawnServer = configuredBaseUrl === undefined;

const resultCount = numberOption("results", Number(process.env.LOAD_SOAK_RESULTS ?? "1000"));
const uploaders = numberOption("uploaders", Number(process.env.LOAD_SOAK_UPLOADERS ?? "4"));
const batchSize = numberOption("batch-size", Number(process.env.LOAD_SOAK_BATCH_SIZE ?? "100"));
const claimLimit = numberOption("claim-limit", Number(process.env.LOAD_SOAK_CLAIM_LIMIT ?? "10"));
const outputPath = option(
  "output",
  process.env.LOAD_SOAK_OUTPUT ?? ".tmp/performance/load-soak-evidence.json"
);
const workerId = option("worker-id", `load-soak-${process.pid}`);

const server = shouldSpawnServer
  ? spawn(process.execPath, ["apps/api/dist/server.js"], {
      env: { ...process.env, API_PORT: apiPort },
      stdio: ["ignore", "pipe", "pipe"]
    })
  : undefined;

let serverOutput = "";
server?.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server?.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForEndpoint(`${baseUrl}/health`);
  const evidence = await runLoadSoakEvidence();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(
    [
      "Load/soak ingestion evidence passed",
      `results=${evidence.profile.results}`,
      `uploaders=${evidence.profile.uploaders}`,
      `sessions=${evidence.upload.sessions}`,
      `imported=${evidence.drain.importedResults}`,
      `acceptance_p95_ms=${evidence.timings.acceptanceMs.p95}`,
      `drain_seconds=${evidence.timings.drainSeconds}`,
      `evidence=${outputPath}`
    ].join(" ")
  );
} finally {
  server?.kill();
}

async function runLoadSoakEvidence() {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const gitSha = getGitSha();
  const beforeReadiness = await getJson(`${baseUrl}/api/v1/ingestion/readiness`);

  const project = await postJson(`${baseUrl}/api/v1/projects`, {
    key: `LOAD-SOAK-${Date.now()}`,
    name: "Load soak evidence project"
  });
  const launch = await postJson(`${baseUrl}/api/v1/projects/${project.id}/launches`, {
    name: `Load soak evidence ${resultCount} results`,
    branch: "load/soak",
    commitSha: gitSha.slice(0, 12),
    buildNumber: String(Date.now())
  });

  const batches = buildBatches(resultCount, batchSize);
  const acceptanceLatencies = [];
  const uploadStarted = performance.now();
  await runPool(batches, uploaders, async (batch) => {
    const files = batch.map((index) => buildUploadFile(index, startedAt));
    const sessionStart = performance.now();
    const session = await postJson(`${baseUrl}/api/v1/launches/${launch.id}/uploads/chunked`, {
      files: files.map((file) => ({
        path: file.path,
        totalChunks: 1,
        totalBytes: Buffer.byteLength(file.content, "utf8")
      }))
    });
    acceptanceLatencies.push(performance.now() - sessionStart);

    await Promise.all(
      files.map((file) =>
        putJson(`${baseUrl}/api/v1/uploads/${session.id}/chunks/0`, {
          path: file.path,
          content: file.content,
          contentEncoding: "utf8"
        })
      )
    );

    const completeStart = performance.now();
    await postJson(`${baseUrl}/api/v1/uploads/${session.id}/complete`, {});
    acceptanceLatencies.push(performance.now() - completeStart);
  });
  const uploadFinished = performance.now();

  const queuedReadiness = await getJson(`${baseUrl}/api/v1/ingestion/readiness`);
  const drainStarted = performance.now();
  const processedJobs = await drainUploadQueue();
  const drainFinished = performance.now();

  const launchIngestion = await getJson(`${baseUrl}/api/v1/launches/${launch.id}/ingestion/status`);
  const closedLaunch = await postJson(`${baseUrl}/api/v1/launches/${launch.id}/close`, {});
  const qualityGate = await getJson(`${baseUrl}/api/v1/launches/${launch.id}/quality-gate`);
  const afterReadiness = await getJson(`${baseUrl}/api/v1/ingestion/readiness`);
  const endedAt = new Date().toISOString();

  const importedResults = launchIngestion.totals?.importedResults ?? 0;
  const failedJobs = launchIngestion.totals?.failedJobs ?? 0;
  const processingJobs = launchIngestion.totals?.processingJobs ?? 0;
  if (importedResults !== resultCount || failedJobs !== 0 || processingJobs !== 0) {
    throw new Error(
      `Load/soak drain mismatch: imported=${importedResults}, failed=${failedJobs}, processing=${processingJobs}, expected=${resultCount}`
    );
  }
  if (closedLaunch.status !== "closed") {
    throw new Error(`Launch close returned ${closedLaunch.status}`);
  }

  return {
    kind: "testhistory-load-soak-ingestion-evidence",
    generatedAt: endedAt,
    gitSha,
    api: {
      baseUrl,
      spawnedLocalServer: shouldSpawnServer
    },
    profile: {
      results: resultCount,
      uploaders,
      batchSize,
      claimLimit,
      uploadMode: "chunked-session",
      payloadStorage: "metadata-only-evidence-json"
    },
    project: {
      id: project.id,
      key: project.key
    },
    launch: {
      id: launch.id,
      status: closedLaunch.status,
      processedTestCases: closedLaunch.processedTestCases,
      qualityGate: qualityGate.status
    },
    upload: {
      sessions: batches.length,
      files: resultCount,
      queuedJobs: queuedReadiness.totals?.queuedJobs ?? null,
      completedJobs: launchIngestion.totals?.completedJobs ?? null
    },
    drain: {
      processedJobs,
      importedResults,
      storedArtifacts: launchIngestion.totals?.storedArtifacts ?? null,
      duplicateResults: launchIngestion.totals?.duplicateResults ?? null,
      failedJobs,
      processingJobs
    },
    readiness: {
      before: summarizeReadiness(beforeReadiness),
      queued: summarizeReadiness(queuedReadiness),
      after: summarizeReadiness(afterReadiness)
    },
    timings: {
      startedAt,
      endedAt,
      totalSeconds: roundSeconds(performance.now() - started),
      uploadSeconds: roundSeconds(uploadFinished - uploadStarted),
      drainSeconds: roundSeconds(drainFinished - drainStarted),
      acceptanceMs: summarizeLatencies(acceptanceLatencies)
    },
    assertions: {
      importedAllResults: importedResults === resultCount,
      noFailedJobs: failedJobs === 0,
      queueDrained: processingJobs === 0,
      launchClosed: closedLaunch.status === "closed",
      rawPayloadsPersistedInEvidence: false
    }
  };
}

async function drainUploadQueue() {
  let processed = 0;
  for (;;) {
    const claim = await postJson(`${baseUrl}/api/v1/uploads/jobs/claim`, {
      source: "chunked-session",
      limit: claimLimit,
      workerId,
      leaseMs: 300000
    });
    if (!Array.isArray(claim.items) || claim.items.length === 0) {
      return processed;
    }

    for (const item of claim.items) {
      await postJson(`${baseUrl}${item.links.process}`, {
        claimToken: item.claim?.token
      });
      processed += 1;
    }
  }
}

function buildBatches(count, size) {
  const batches = [];
  for (let start = 0; start < count; start += size) {
    const end = Math.min(start + size, count);
    const batch = [];
    for (let index = start; index < end; index += 1) {
      batch.push(index);
    }
    batches.push(batch);
  }
  return batches;
}

function buildUploadFile(index, startedAt) {
  const status = resultStatus(index);
  const payload = {
    uuid: `load-soak-result-${String(index).padStart(7, "0")}`,
    testCaseId: `load-soak-case-${String(index).padStart(7, "0")}`,
    historyId: `load-soak-history-${String(index).padStart(7, "0")}`,
    fullName: `load.soak.Spec.case${String(index).padStart(7, "0")}`,
    name: `load soak case ${index}`,
    status,
    stage: "finished",
    start: Date.parse(startedAt) + index * 100,
    stop: Date.parse(startedAt) + index * 100 + 80 + (index % 31),
    labels: [
      { name: "suite", value: `suite-${index % 20}` },
      { name: "tag", value: "load-soak" },
      { name: "owner", value: `team-${index % 8}` }
    ],
    parameters: [
      { name: "browser", value: index % 2 === 0 ? "chromium" : "firefox" },
      { name: "shard", value: String(index % 32) }
    ]
  };
  return {
    path: `load-soak/shard-${String(index % 32).padStart(2, "0")}/${payload.uuid}-result.json`,
    content: JSON.stringify(payload)
  };
}

function resultStatus(index) {
  const bucket = index % 100;
  if (bucket < 86) return "passed";
  if (bucket < 93) return "failed";
  if (bucket < 97) return "broken";
  return "skipped";
}

async function runPool(items, concurrency, worker) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function waitForEndpoint(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await sleep(300);
    }
  }

  throw new Error(`Timed out waiting for ${url}\n${serverOutput}`);
}

async function getJson(url) {
  const response = await fetch(url);
  return responseJson(response, "GET", url);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  return responseJson(response, "POST", url);
}

async function putJson(url, payload) {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  return responseJson(response, "PUT", url);
}

async function responseJson(response, method, url) {
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    throw new Error(`${method} ${url} returned non-JSON ${response.status}: ${text}`);
  }
  if (!response.ok) {
    throw new Error(`${method} ${url} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function summarizeReadiness(readiness) {
  return {
    status: readiness.status,
    queue: readiness.queue?.backpressure?.reason,
    accepting: readiness.queue?.backpressure?.accepting,
    queuedJobs: readiness.totals?.queuedJobs,
    processingJobs: readiness.totals?.processingJobs,
    failedJobs: readiness.totals?.failedJobs,
    importedResults: readiness.totals?.importedResults,
    storedArtifacts: readiness.totals?.storedArtifacts
  };
}

function summarizeLatencies(values) {
  const sorted = values.toSorted((left, right) => left - right);
  return {
    count: sorted.length,
    min: roundMs(sorted[0] ?? 0),
    p50: roundMs(percentile(sorted, 0.5)),
    p95: roundMs(percentile(sorted, 0.95)),
    max: roundMs(sorted.at(-1) ?? 0)
  };
}

function percentile(sorted, percentileValue) {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1);
  return sorted[index] ?? 0;
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

function roundSeconds(value) {
  return Math.round((value / 1000) * 100) / 100;
}

function option(name, fallback) {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline !== undefined) {
    return inline.slice(prefix.length);
  }
  const index = args.indexOf(`--${name}`);
  if (index >= 0 && args[index + 1] !== undefined && !args[index + 1].startsWith("--")) {
    return args[index + 1];
  }
  return fallback;
}

function numberOption(name, fallback) {
  const value = Number(option(name, String(fallback)));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid --${name}: expected positive integer`);
  }
  return value;
}

function getGitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return process.env.GITHUB_SHA ?? "unknown";
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
