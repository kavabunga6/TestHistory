import { execFileSync } from "node:child_process";

const output = execFileSync(
  process.execPath,
  [
    "scripts/generate-enterprise-allure-fixture.mjs",
    "--summary-only",
    "--json",
    "--results",
    "100000",
    "--users",
    "1000",
    "--hours",
    "6"
  ],
  { encoding: "utf8" }
);

const manifest = JSON.parse(output);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(manifest.kind === "testhistory-enterprise-allure-fixture", "unexpected manifest kind");
assert(manifest.scenario.users === 1000, "enterprise profile must model 1000 users");
assert(manifest.scenario.resultCount === 100000, "enterprise profile must model 100000 results");
assert(manifest.scenario.durationHours === 6, "enterprise profile must model a 6 hour window");
assert(
  manifest.scenario.resultsPerHour >= 16666,
  "enterprise profile throughput is below 100000 results per 6 hours"
);
assert(
  manifest.uploadPlan.recommendedMode === "chunked-or-archive",
  "enterprise uploads must use chunked/archive mode"
);
assert(
  manifest.uploadPlan.rejectedModeForEnterprise === "json-batch",
  "JSON batch mode must not be accepted as enterprise ingestion path"
);
assert(
  manifest.uploadPlan.recommendedBatchSize <= manifest.uploadPlan.maxSynchronousJsonBatchFiles,
  "recommended batch size must stay below sync JSON guard"
);
assert(manifest.uploadPlan.backpressure.enabled === true, "upload backpressure must be enabled");
assert(
  manifest.uploadPlan.workerPolling.enabled === true,
  "enterprise ingestion must expose worker polling"
);
assert(
  manifest.uploadPlan.workerPolling.manualProcessRequired === false,
  "enterprise ingestion must not require manual per-job processing"
);
assert(
  manifest.uploadPlan.workerPolling.claimBeforeProcess === true &&
    manifest.uploadPlan.workerPolling.claimEndpoint === "/api/v1/uploads/jobs/claim",
  "enterprise ingestion workers must claim jobs before processing"
);
assert(
  manifest.uploadPlan.workerPolling.defaultLeaseMs <= 5 * 60 * 1000 &&
    manifest.uploadPlan.workerPolling.maxLeaseMs <= 15 * 60 * 1000,
  "worker upload job leases must stay bounded"
);
assert(manifest.uploadPlan.workerPolling.maxJobsPerPoll <= 100, "worker polling must stay bounded");
assert(
  manifest.frontendBudget.maxEndpointSeconds <= 10,
  "frontend/API endpoint budget must be 10 seconds or less"
);
assert(
  manifest.frontendBudget.virtualizedRowsRequiredAbove <= 500,
  "large frontend lists must switch to virtualization before they become huge"
);
assert(
  manifest.frontendBudget.boundedRenderWindows.launchRows <= 100 &&
    manifest.frontendBudget.boundedRenderWindows.resultRows <= 100 &&
    manifest.frontendBudget.boundedRenderWindows.defectRows <= 100 &&
    manifest.frontendBudget.boundedRenderWindows.testCaseRows <= 100,
  "frontend render windows must stay bounded for enterprise-sized lists"
);
assert(
  manifest.readPath.launchDetail.maxEmbeddedResults <= 100 &&
    manifest.readPath.launchDetail.maxEmbeddedArtifacts <= 100 &&
    manifest.readPath.launchDetail.exposesPageMetadata === true,
  "launch detail must stay bounded and expose page metadata"
);
assert(
  manifest.readPath.artifactList.paginatedWhenLimitIsProvided === true &&
    manifest.readPath.artifactList.defaultPageSize <= 100 &&
    manifest.readPath.artifactList.maxPageSize <= 500,
  "artifact list must provide bounded pagination for enterprise reads"
);
assert(
  manifest.retention.defaultAttachmentRetentionDays === 14,
  "default artifact retention must be 14 days"
);
assert(
  manifest.retention.deleteBinaryArtifactsAfterRetention === true,
  "binary artifacts must be deleted after retention"
);
assert(
  manifest.retention.cleanupExecution.dryRunFirst === true,
  "artifact cleanup execution must be dry-run first"
);
assert(
  manifest.retention.cleanupExecution.closedLaunchOnly === true,
  "artifact cleanup must only delete artifacts from closed launches"
);
assert(
  manifest.retention.cleanupExecution.maxBatchSize <= 500,
  "artifact cleanup execution batches must stay bounded"
);
assert(
  manifest.retention.cleanupExecution.maxBatchBytes <= 1024 * 1024 * 1024,
  "artifact cleanup execution byte budget must stay bounded"
);
assert(
  manifest.retention.cleanupExecution.rawTargetsReturned === false &&
    manifest.retention.cleanupExecution.storageKeysReturned === false &&
    manifest.retention.cleanupExecution.signedUrlsReturned === false,
  "artifact cleanup execution must not expose storage internals"
);

const serialized = JSON.stringify(manifest);
for (const forbidden of [
  "Bearer ",
  "X-Amz-Signature",
  "C:\\Users\\",
  "Downloads",
  "password",
  "secret",
  "token="
]) {
  assert(!serialized.includes(forbidden), `enterprise fixture manifest leaks ${forbidden}`);
}

console.log(
  [
    "Enterprise performance smoke passed",
    `results=${manifest.scenario.resultCount}`,
    `users=${manifest.scenario.users}`,
    `throughput_per_hour=${manifest.scenario.resultsPerHour}`,
    `upload_mode=${manifest.uploadPlan.recommendedMode}`,
    `retention_days=${manifest.retention.defaultAttachmentRetentionDays}`
  ].join("\n")
);
