import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const args = process.argv.slice(2);

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
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid --${name}: expected positive number`);
  }
  return value;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

const resultCount = numberOption(
  "results",
  Number(process.env.TESTHISTORY_ENTERPRISE_RESULTS ?? "100000")
);
const users = numberOption("users", Number(process.env.TESTHISTORY_ENTERPRISE_USERS ?? "1000"));
const durationHours = numberOption(
  "hours",
  Number(process.env.TESTHISTORY_ENTERPRISE_HOURS ?? "6")
);
const outputDir = option("output", ".tmp/testhistory-enterprise-fixture");
const writeFiles = hasFlag("write-files");
const summaryOnly = hasFlag("summary-only");
const jsonOutput = hasFlag("json");

const statusMix = [
  { status: "passed", ratio: 0.86 },
  { status: "failed", ratio: 0.06 },
  { status: "broken", ratio: 0.035 },
  { status: "skipped", ratio: 0.025 },
  { status: "muted", ratio: 0.02 }
];

function buildStatusCounters(count) {
  const counters = Object.fromEntries(statusMix.map((entry) => [entry.status, 0]));
  let assigned = 0;
  for (let index = 0; index < statusMix.length; index += 1) {
    const entry = statusMix[index];
    const value =
      index === statusMix.length - 1 ? count - assigned : Math.floor(count * entry.ratio);
    counters[entry.status] = value;
    assigned += value;
  }
  return counters;
}

function resultStatus(index) {
  const bucket = index % 200;
  if (bucket < 172) return "passed";
  if (bucket < 184) return "failed";
  if (bucket < 191) return "broken";
  if (bucket < 196) return "skipped";
  return "passed";
}

function resultPayload(index, startedAt) {
  const status = resultStatus(index);
  const durationMs = 180 + (index % 37) * 17 + (status === "passed" ? 0 : 340);
  const historyId = `TH-HISTORY-${String(index % 25000).padStart(5, "0")}`;
  const attachmentUuid = `enterprise-attachment-${String(index).padStart(6, "0")}`;
  return {
    uuid: `enterprise-result-${String(index).padStart(6, "0")}`,
    historyId,
    name: `Enterprise checkout scenario ${index % 25000}`,
    fullName: `enterprise.checkout.Spec.${historyId}`,
    status,
    stage: "finished",
    start: startedAt + index * 128,
    stop: startedAt + index * 128 + durationMs,
    labels: [
      { name: "suite", value: `suite-${index % 40}` },
      { name: "feature", value: index % 5 === 0 ? "payments" : "auth" },
      { name: "tag", value: index % 3 === 0 ? "nightly" : "regression" },
      { name: "tag", value: `shard-${index % 32}` },
      { name: "owner", value: `team-${index % 20}` }
    ],
    parameters: [
      { name: "browser", value: index % 2 === 0 ? "Chrome 126" : "Firefox 126" },
      { name: "environment", value: index % 4 === 0 ? "staging" : "preprod" },
      { name: "branch", value: index % 7 === 0 ? "release" : "develop" }
    ],
    steps: [
      {
        name: "Open application",
        status: "passed",
        start: startedAt + index * 128,
        stop: startedAt + index * 128 + 45
      },
      {
        name: "Submit checkout flow",
        status,
        start: startedAt + index * 128 + 46,
        stop: startedAt + index * 128 + durationMs,
        steps: [
          { name: "Fill credentials", status: "passed" },
          { name: "Confirm payment", status }
        ]
      }
    ],
    attachments:
      index % 4 === 0
        ? [
            { name: "screenshot", source: `${attachmentUuid}.png`, type: "image/png" },
            { name: "browser log", source: `${attachmentUuid}.txt`, type: "text/plain" }
          ]
        : []
  };
}

async function writeFixtureFiles(count, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const startedAt = Date.UTC(2026, 4, 30, 2, 0, 0);
  for (let index = 0; index < count; index += 1) {
    const shard = String(index % 100).padStart(2, "0");
    const shardDir = join(targetDir, `shard-${shard}`);
    await mkdir(shardDir, { recursive: true });
    const payload = resultPayload(index, startedAt);
    await writeFile(
      join(shardDir, `${payload.uuid}-result.json`),
      `${JSON.stringify(payload, null, 2)}\n`,
      "utf8"
    );
    if (payload.attachments.length > 0) {
      await writeFile(join(shardDir, payload.attachments[0].source), "PNG_PLACEHOLDER\n", "utf8");
      await writeFile(
        join(shardDir, payload.attachments[1].source),
        "Synthetic enterprise log without secrets\n",
        "utf8"
      );
    }
  }
}

const statusCounters = buildStatusCounters(resultCount);
const attachmentCount = Math.floor(resultCount / 4) * 2;
const resultBytesEstimate = resultCount * 1850;
const attachmentBytesEstimate = attachmentCount * 220_000;
const resultsPerHour = resultCount / durationHours;
const resultsPerMinute = resultsPerHour / 60;
const resultsPerSecond = resultsPerMinute / 60;

const manifest = {
  kind: "testhistory-enterprise-allure-fixture",
  generatedAt: new Date().toISOString(),
  scenario: {
    users,
    resultCount,
    durationHours,
    resultsPerHour: Number(resultsPerHour.toFixed(2)),
    resultsPerMinute: Number(resultsPerMinute.toFixed(2)),
    resultsPerSecond: Number(resultsPerSecond.toFixed(2)),
    statusCounters,
    attachmentCount,
    estimatedBytes: {
      results: resultBytesEstimate,
      attachments: attachmentBytesEstimate,
      total: resultBytesEstimate + attachmentBytesEstimate
    }
  },
  uploadPlan: {
    recommendedMode: "chunked-or-archive",
    rejectedModeForEnterprise: "json-batch",
    recommendedBatchSize: 1000,
    maxSynchronousJsonBatchFiles: 5000,
    maxSynchronousJsonBatchBytes: 25 * 1024 * 1024,
    targetParallelUploadWorkers: 32,
    parserWorkerConcurrency: 8,
    artifactWorkerConcurrency: 16,
    workerPolling: {
      enabled: true,
      endpoint: "/api/v1/uploads/jobs",
      claimEndpoint: "/api/v1/uploads/jobs/claim",
      claimBeforeProcess: true,
      defaultLeaseMs: 300000,
      maxLeaseMs: 900000,
      maxJobsPerPoll: 100,
      processBoundary: "/api/v1/uploads/{uploadId}/process",
      manualProcessRequired: false
    },
    backpressure: {
      enabled: true,
      responseCode: 413,
      retryAfterMs: 5000,
      queueDepthWatermark: 50000
    }
  },
  frontendBudget: {
    firstDataMs: 1500,
    maxInteractionMs: 100,
    maxEndpointSeconds: 10,
    defaultPageSize: 100,
    maxPageSize: 500,
    virtualizedRowsRequiredAbove: 500,
    boundedRenderWindows: {
      launchRows: 24,
      resultRows: 50,
      defectRows: 50,
      testCaseRows: 50
    }
  },
  readPath: {
    launchDetail: {
      endpoint: "/api/v1/launches/{launchId}",
      maxEmbeddedResults: 100,
      maxEmbeddedArtifacts: 100,
      bulkResultsEndpoint: "/api/v1/launches/{launchId}/results",
      exposesPageMetadata: true
    },
    artifactList: {
      endpoint: "/api/v1/artifacts",
      paginatedWhenLimitIsProvided: true,
      defaultPageSize: 100,
      maxPageSize: 500
    }
  },
  retention: {
    defaultAttachmentRetentionDays: 14,
    cleanupMode: "project-policy-driven",
    cleanupExecution: {
      endpoint: "/api/v1/artifacts/retention/execute",
      dryRunFirst: true,
      closedLaunchOnly: true,
      defaultBatchSize: 100,
      maxBatchSize: 500,
      maxBatchBytes: 512 * 1024 * 1024,
      rawTargetsReturned: false,
      storageKeysReturned: false,
      signedUrlsReturned: false
    },
    compressRetainedTextArtifacts: true,
    deleteBinaryArtifactsAfterRetention: true
  },
  output: {
    outputDir,
    filesWritten: writeFiles && !summaryOnly,
    summaryOnly
  }
};

if (!summaryOnly) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}

if (writeFiles && !summaryOnly) {
  await writeFixtureFiles(resultCount, join(outputDir, "allure-results"));
}

if (jsonOutput) {
  console.log(JSON.stringify(manifest, null, 2));
} else {
  console.log(
    [
      `Enterprise fixture: ${resultCount} results / ${users} users / ${durationHours}h`,
      `Throughput: ${manifest.scenario.resultsPerHour}/h, ${manifest.scenario.resultsPerSecond}/s`,
      `Upload mode: ${manifest.uploadPlan.recommendedMode}`,
      `Retention: ${manifest.retention.defaultAttachmentRetentionDays} days`,
      summaryOnly
        ? "Summary only: no files written"
        : `Manifest: ${join(outputDir, "manifest.json")}`
    ].join("\n")
  );
}
