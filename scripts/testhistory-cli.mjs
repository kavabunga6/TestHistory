#!/usr/bin/env node
import {
  closeSync,
  constants,
  fsyncSync,
  ftruncateSync,
  lstatSync,
  openSync,
  realpathSync,
  writeSync
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CliError,
  MAX_BATCH,
  MAX_FILES,
  STATUSES,
  attachmentProjection,
  attachmentsOf,
  equal,
  identifier,
  loadCatalog,
  requireTrue,
  sha256,
  stepProjection,
  text
} from "./testhistory-cli-input.mjs";
export { CliError, loadCatalog, safeRelativePath, validatePng } from "./testhistory-cli-input.mjs";
function endpoint(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new CliError("INVALID_ENDPOINT");
  }
  requireTrue(
    ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/*$/.test(url.pathname),
    "INVALID_ENDPOINT"
  );
  return url.origin;
}
export function createClient(env, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const base = endpoint(env.TESTHISTORY_BASE_URL);
  requireTrue(env.NODE_TLS_REJECT_UNAUTHORIZED !== "0", "TLS_VERIFICATION_REQUIRED");
  const token = env.TESTHISTORY_TOKEN;
  const request = async (method, path, payload, binary = false, authenticated = true) => {
    requireTrue(path.startsWith("/api/v1/") || path === "/health", "INVALID_API_PATH");
    if (authenticated)
      requireTrue(
        typeof token === "string" &&
          token.trim() === token &&
          token.length > 0 &&
          token.length <= 4096 &&
          !/[\x00-\x20\x7f]/.test(token),
        "TOKEN_REQUIRED"
      );
    let response;
    try {
      response = await fetchImpl(base + path, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          ...(authenticated ? { authorization: `Bearer ${token}` } : {}),
          ...(payload !== undefined ? { "content-type": "application/json" } : {})
        },
        ...(payload !== undefined ? { body: JSON.stringify(payload) } : {})
      });
    } catch {
      throw new CliError("TRANSPORT_FAILED");
    }
    requireTrue(
      response.status >= 200 && response.status < 300 && response.status !== 207,
      "HTTP_" + response.status
    );
    const declared = Number(response.headers.get("content-length"));
    requireTrue(!Number.isFinite(declared) || declared <= MAX_BATCH, "RESPONSE_TOO_LARGE");
    const chunks = [];
    let length = 0;
    try {
      for await (const chunk of response.body ?? []) {
        length += chunk.length;
        requireTrue(length <= MAX_BATCH, "RESPONSE_TOO_LARGE");
        chunks.push(Buffer.from(chunk));
      }
    } catch (error) {
      throw error instanceof CliError ? error : new CliError("RESPONSE_READ_FAILED");
    }
    const bytes = Buffer.concat(chunks);
    if (binary) return bytes;
    try {
      return JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new CliError("INVALID_API_JSON");
    }
  };
  return { base, request };
}
function labels(result) {
  return result.labels.reduce((all, item) => {
    (all[item.name] ??= []).push(item.value);
    return all;
  }, Object.create(null));
}
async function verifyLaunch(client, projectId, launchId, catalog) {
  const seen = new Map();
  let offset = 0;
  while (seen.size < catalog.results.length) {
    const page = await client.request(
      "GET",
      `/api/v1/launches/${encodeURIComponent(launchId)}/results?limit=100&offset=${offset}`
    );
    requireTrue(
      page.launchId === launchId &&
        page.projectId === projectId &&
        Array.isArray(page.items) &&
        page.page?.total === catalog.results.length &&
        page.page.offset === offset &&
        page.items.length > 0,
      "REMOTE_RESULT_COUNT_MISMATCH"
    );
    for (const item of page.items) {
      requireTrue(identifier(item.uuid) && !seen.has(item.uuid), "REMOTE_RESULT_IDENTITY_MISMATCH");
      seen.set(item.uuid, item);
    }
    offset += page.items.length;
    requireTrue(offset <= catalog.results.length, "REMOTE_RESULT_COUNT_MISMATCH");
  }
  const verifiedArtifacts = new Set();
  for (const { result, timing } of catalog.results) {
    const summary = seen.get(result.uuid);
    for (const key of ["uuid", "name", "status", "historyId", "testCaseId", "fullName"])
      requireTrue(summary?.[key] === result[key], "REMOTE_RESULT_METADATA_MISMATCH");
    const detail = await client.request(
      "GET",
      `/api/v1/launches/${encodeURIComponent(launchId)}/results/${encodeURIComponent(result.uuid)}`
    );
    requireTrue(
      detail.launchId === launchId && detail.projectId === projectId,
      "REMOTE_RESULT_IDENTITY_MISMATCH"
    );
    for (const key of ["uuid", "name", "status", "historyId", "testCaseId", "fullName"])
      requireTrue(detail[key] === result[key], "REMOTE_RESULT_METADATA_MISMATCH");
    requireTrue(
      summary.durationMs === timing.milliseconds &&
        detail.durationMs === timing.milliseconds &&
        detail.raw?.start === result.start &&
        detail.raw?.stop === result.stop,
      "REMOTE_RESULT_TIMING_MISMATCH"
    );
    requireTrue(
      equal(detail.labels, labels(result)) &&
        equal(detail.description, result.description) &&
        equal(detail.statusDetails, result.statusDetails) &&
        equal(detail.links ?? [], result.links ?? []) &&
        equal(detail.parameters ?? [], result.parameters ?? []) &&
        equal(stepProjection(detail.steps), stepProjection(result.steps)),
      "REMOTE_RESULT_METADATA_MISMATCH"
    );
    const wanted = attachmentsOf(result).map(attachmentProjection);
    requireTrue(
      Array.isArray(detail.attachments) &&
        equal(detail.attachments.map(attachmentProjection), wanted) &&
        Array.isArray(detail.artifacts),
      "REMOTE_ATTACHMENT_METADATA_MISMATCH"
    );
    for (const attachment of wanted) {
      const input = catalog.referenced.get(attachment.source);
      const artifact = detail.artifacts.find((item) => item.path === attachment.source);
      requireTrue(
        artifact &&
          identifier(artifact.id) &&
          artifact.launchId === launchId &&
          artifact.projectId === projectId &&
          artifact.sha256 === input.sha256 &&
          artifact.originalBytes === input.bytes.length &&
          artifact.contentType === attachment.type,
        "REMOTE_ATTACHMENT_METADATA_MISMATCH"
      );
      if (!verifiedArtifacts.has(artifact.id)) {
        const bytes = await client.request(
          "GET",
          `/api/v1/artifacts/${encodeURIComponent(artifact.id)}/content`,
          undefined,
          true
        );
        requireTrue(
          bytes.length === input.bytes.length && sha256(bytes) === input.sha256,
          "REMOTE_ATTACHMENT_BYTES_MISMATCH"
        );
        verifiedArtifacts.add(artifact.id);
      }
    }
  }
  return verifiedArtifacts.size;
}
function receiptWriter(path) {
  if (!path) return { save() {}, close() {} };
  const resolved = resolve(path),
    parent = realpathSync(dirname(resolved));
  requireTrue(
    parent === dirname(resolved) && !lstatSync(parent).isSymbolicLink(),
    "UNSAFE_RECEIPT_PATH"
  );
  const fd = openSync(
    resolved,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
    0o600
  );
  return {
    save(value) {
      const bytes = Buffer.from(JSON.stringify(value, null, 2) + "\n");
      ftruncateSync(fd, 0);
      let offset = 0;
      while (offset < bytes.length) {
        const written = writeSync(fd, bytes, offset, bytes.length - offset, offset);
        requireTrue(written > 0, "RECEIPT_WRITE_FAILED");
        offset += written;
      }
      fsyncSync(fd);
    },
    close() {
      closeSync(fd);
    }
  };
}
export async function upload(options, { env = process.env, fetchImpl = fetch } = {}) {
  let receipt = { schemaVersion: 1, operation: "upload", status: "FAILED", stage: "preflight" },
    writer;
  try {
    const catalog = loadCatalog(options.resultsDir, options);
    requireTrue(
      options.plannedResults === undefined ||
        (Number.isInteger(options.plannedResults) &&
          options.plannedResults >= catalog.results.length &&
          options.plannedResults <= MAX_FILES),
      "INVALID_PLANNED_RESULTS"
    );
    const projectId = env.TESTHISTORY_PROJECT_ID;
    requireTrue(
      identifier(projectId) && text(options.launchName, 160),
      "PROJECT_AND_LAUNCH_REQUIRED"
    );
    for (const key of ["branch", "commit", "buildNumber"])
      requireTrue(options[key] === undefined || text(options[key], 200), "INVALID_LAUNCH_METADATA");
    const client = createClient(env, { fetchImpl, timeoutMs: options.timeoutMs });
    requireTrue(
      typeof env.TESTHISTORY_TOKEN === "string" && env.TESTHISTORY_TOKEN.length > 0,
      "TOKEN_REQUIRED"
    );
    const webBase = endpoint(env.TESTHISTORY_WEB_URL ?? env.TESTHISTORY_BASE_URL);
    writer = receiptWriter(options.output);
    receipt = {
      ...receipt,
      projectId,
      expectedResults: catalog.results.length,
      plannedResults: options.plannedResults ?? catalog.results.length,
      allowIncomplete: options.allowIncomplete === true,
      incompleteResults: catalog.results.filter((item) => item.timing.incomplete).length,
      unknownTimingResults: catalog.results.filter((item) => !item.timing.known).length,
      nonpositiveTimingResults: catalog.results.filter(
        (item) => item.timing.known && !item.timing.positive
      ).length,
      screenshotCount: catalog.pngCount,
      batchCount: catalog.batches.length,
      stage: "create_launch"
    };
    writer.save(receipt);
    const created = await client.request(
      "POST",
      `/api/v1/projects/${encodeURIComponent(projectId)}/launches`,
      {
        name: options.launchName,
        ...(options.branch !== undefined ? { branch: options.branch } : {}),
        ...(options.commit !== undefined ? { commitSha: options.commit } : {}),
        ...(options.buildNumber !== undefined ? { buildNumber: options.buildNumber } : {})
      }
    );
    requireTrue(
      identifier(created.id) && created.projectId === projectId && created.status === "open",
      "INVALID_CREATED_LAUNCH"
    );
    const launchId = created.id;
    receipt = {
      ...receipt,
      launchId,
      launchUrl: webBase + "/#launch/" + encodeURIComponent(launchId),
      stage: "upload",
      importedResults: 0
    };
    writer.save(receipt);
    for (const files of catalog.batches) {
      const imported = await client.request(
        "POST",
        `/api/v1/launches/${encodeURIComponent(launchId)}/results/json`,
        { files }
      );
      requireTrue(
        imported.job?.status === "completed" &&
          Array.isArray(imported.job.errors) &&
          imported.job.errors.length === 0 &&
          Number.isInteger(imported.job.importedResults) &&
          imported.job.duplicateResults === 0,
        "IMPORT_INCOMPLETE"
      );
      receipt.importedResults += imported.job.importedResults;
      writer.save(receipt);
    }
    requireTrue(receipt.importedResults === catalog.results.length, "IMPORT_COUNT_MISMATCH");
    receipt.stage = "verify";
    writer.save(receipt);
    const artifactsVerified = await verifyLaunch(client, projectId, launchId, catalog);
    receipt.stage = "close";
    writer.save(receipt);
    const closed = await client.request(
      "POST",
      `/api/v1/launches/${encodeURIComponent(launchId)}/close`,
      {}
    );
    requireTrue(
      closed.id === launchId &&
        closed.projectId === projectId &&
        closed.status === "closed" &&
        Array.isArray(closed.errors) &&
        closed.errors.length === 0 &&
        closed.closePipeline?.status === "closed",
      "LAUNCH_CLOSE_INCOMPLETE"
    );
    const confirmed = await client.request(
      "GET",
      `/api/v1/launches/${encodeURIComponent(launchId)}`
    );
    requireTrue(
      confirmed.id === launchId &&
        confirmed.projectId === projectId &&
        confirmed.status === "closed",
      "LAUNCH_CLOSE_INCOMPLETE"
    );
    const statusCounts = Object.fromEntries(
      STATUSES.map((status) => [
        status,
        catalog.results.filter((item) => item.result.status === status).length
      ])
    );
    receipt = {
      ...receipt,
      status: "UPLOADED_AND_VERIFIED",
      stage: "completed",
      verifiedResults: catalog.results.length,
      verifiedAttachments: artifactsVerified,
      verifiedTiming: catalog.results.every((item) => item.timing.known),
      allTimingKnown: catalog.results.every((item) => item.timing.known),
      allTimingPositive: catalog.results.every((item) => item.timing.positive),
      verifiedMetadata: true,
      verifiedAttachmentBytes: true,
      closed: true,
      testStatusCounts: statusCounts,
      testRunPassed:
        statusCounts.passed === catalog.results.length &&
        catalog.results.every((item) => item.timing.positive) &&
        (options.plannedResults === undefined || options.plannedResults === catalog.results.length),
      checkedAt: new Date().toISOString()
    };
    writer.save(receipt);
    return receipt;
  } catch (error) {
    const failure = error instanceof CliError ? error.code : "LOCAL_IO_OR_VALIDATION_FAILED";
    receipt = { ...receipt, status: "FAILED", error: failure, closed: false };
    try {
      writer?.save(receipt);
    } catch {
      receipt.receiptWriteFailed = true;
    }
    const wrapped = new CliError(failure);
    wrapped.receipt = receipt;
    throw wrapped;
  } finally {
    try {
      writer?.close();
    } catch {
      /* Written checkpoints and the original upload outcome remain authoritative. */
    }
  }
}
export async function runCli(argv, { env = process.env, fetchImpl = fetch } = {}) {
  const [command, ...args] = argv;
  if (command === "--help" || command === "help")
    return {
      usage:
        "testhistory-cli.mjs upload --results-dir DIR --launch-name NAME --expected-results N [--min-screenshots N] [--planned-results N] [--allow-incomplete] [--branch NAME] [--commit SHA] [--build-number N] [--output FILE] | status --launch-id ID | check",
      environment: [
        "TESTHISTORY_BASE_URL",
        "TESTHISTORY_PROJECT_ID",
        "TESTHISTORY_TOKEN",
        "TESTHISTORY_WEB_URL (optional)"
      ]
    };
  requireTrue(["upload", "status", "check"].includes(command), "INVALID_COMMAND");
  const names = {
    "--results-dir": "resultsDir",
    "--launch-name": "launchName",
    "--expected-results": "expectedResults",
    "--min-screenshots": "minScreenshots",
    "--batch-bytes": "batchBytes",
    "--branch": "branch",
    "--commit": "commit",
    "--build-number": "buildNumber",
    "--output": "output",
    "--launch-id": "launchId",
    "--timeout-ms": "timeoutMs",
    "--planned-results": "plannedResults"
  };
  const allowed =
    command === "upload"
      ? Object.keys(names).filter((name) => name !== "--launch-id")
      : command === "status"
        ? ["--launch-id", "--timeout-ms"]
        : ["--timeout-ms"];
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (args[index] === "--allow-incomplete") {
      requireTrue(
        command === "upload" && options.allowIncomplete === undefined,
        "INVALID_ARGUMENTS"
      );
      options.allowIncomplete = true;
      index--;
      continue;
    }
    requireTrue(
      allowed.includes(args[index]) &&
        typeof args[index + 1] === "string" &&
        args[index + 1].length > 0 &&
        options[names[args[index]]] === undefined,
      "INVALID_ARGUMENTS"
    );
    options[names[args[index]]] = args[index + 1];
  }
  for (const key of [
    "expectedResults",
    "minScreenshots",
    "batchBytes",
    "timeoutMs",
    "plannedResults"
  ])
    if (options[key] !== undefined) {
      requireTrue(/^\d+$/.test(options[key]), "INVALID_LIMIT");
      options[key] = Number(options[key]);
    }
  if (options.timeoutMs !== undefined)
    requireTrue(options.timeoutMs >= 1000 && options.timeoutMs <= 60000, "INVALID_LIMIT");
  if (command === "upload") return upload(options, { env, fetchImpl });
  const client = createClient(env, { fetchImpl, timeoutMs: options.timeoutMs });
  if (command === "check") {
    const health = await client.request("GET", "/health", undefined, false, false);
    requireTrue(
      health.status === "ok" &&
        health.service === "testhistory-api" &&
        health.persistence?.writable === true &&
        health.persistence?.migrated === true &&
        ["file", "postgres"].includes(health.persistence.driver),
      "HEALTH_INCOMPLETE"
    );
    return {
      status: "HEALTHY",
      persistence: { driver: health.persistence.driver, writable: true, migrated: true },
      scope: "Metadata health only; uploads and attachment bytes require upload verification"
    };
  }
  requireTrue(identifier(options.launchId), "LAUNCH_ID_REQUIRED");
  const launch = await client.request(
    "GET",
    `/api/v1/launches/${encodeURIComponent(options.launchId)}`
  );
  requireTrue(
    launch.id === options.launchId &&
      identifier(launch.projectId) &&
      ["open", "processing", "closed", "failed", "archived"].includes(launch.status) &&
      Number.isInteger(launch.resultsPage?.total),
    "INVALID_LAUNCH_STATUS"
  );
  return {
    status: launch.status,
    launchId: launch.id,
    projectId: launch.projectId,
    resultCount: launch.resultsPage.total,
    scope: "Read-only launch status; full input/evidence matching is performed by upload"
  };
}
function isEntryPoint() {
  try {
    return (
      process.argv[1] !== undefined &&
      realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}
if (isEntryPoint()) {
  runCli(process.argv.slice(2))
    .then((receipt) => console.log(JSON.stringify(receipt, null, 2)))
    .catch((error) => {
      console.error(
        JSON.stringify(
          error.receipt ?? {
            status: "FAILED",
            error: error instanceof CliError ? error.code : "LOCAL_IO_OR_VALIDATION_FAILED"
          }
        )
      );
      process.exitCode = 1;
    });
}
