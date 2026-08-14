import { workerJobNames } from "./workerConstants.js";
import {
  isArchiveDiagnosticReplayCode,
  isArchiveDiagnosticReplaySource
} from "./workerArchiveDiagnosticPredicates.js";
import { isNonEmptyString, isRecord } from "./workerValueUtils.js";
import type {
  EnqueueWorkerJob,
  WorkerJobEnvelopeValidationResult,
  WorkerJobName,
  WorkerJobPayloadMap
} from "./workerTypes.js";

export function validateWorkerJobEnvelope(input: unknown): WorkerJobEnvelopeValidationResult {
  const issues: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, issues: ["envelope must be an object"] };
  }

  if (!isNonEmptyString(input.id)) {
    issues.push("id must be a non-empty string");
  }

  if (!isWorkerJobName(input.name)) {
    issues.push("name must be a known worker job name");
  }

  if (!isRecord(input.payload)) {
    issues.push("payload must be an object");
  }

  if (input.traceId !== undefined && typeof input.traceId !== "string") {
    issues.push("traceId must be a string when provided");
  }

  if (isWorkerJobName(input.name) && isRecord(input.payload)) {
    issues.push(...validatePayload(input.name, input.payload));
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const job: EnqueueWorkerJob = {
    id: input.id as string,
    name: input.name as WorkerJobName,
    payload: input.payload as WorkerJobPayloadMap[WorkerJobName]
  };

  if (input.traceId !== undefined) {
    job.traceId = input.traceId as string;
  }

  return { ok: true, job };
}

function validatePayload(name: WorkerJobName, payload: Record<string, unknown>): string[] {
  switch (name) {
    case "ingestion.parse":
      return validateIngestionParsePayload(payload);
    case "launch.close":
      return validateRequiredStringPayload(payload, ["projectId", "launchId"]);
    case "testcase.sync":
      return [
        ...validateRequiredStringPayload(payload, ["projectId", "launchId"]),
        ...validateOptionalStringArray(payload, "testCaseIds")
      ];
    case "analytics.materialize":
      return [
        ...validateRequiredStringPayload(payload, ["projectId"]),
        ...validateOptionalString(payload, "launchId"),
        ...validateOptionalWindow(payload)
      ];
    case "defect.mute.project":
      return validateDefectMuteProjectionPayload(payload);
    case "archive.diagnostics.replay":
      return validateArchiveDiagnosticReplayPayload(payload);
    case "artifact.cleanup":
      return [
        ...validateOptionalString(payload, "projectId"),
        ...validateRequiredStringPayload(payload, ["before"]),
        ...validateOptionalPositiveNumber(payload, "batchSize"),
        ...validateOptionalBoolean(payload, "dryRun")
      ];
  }
}

function validateIngestionParsePayload(payload: Record<string, unknown>): string[] {
  const issues = [
    ...validateRequiredStringPayload(payload, ["projectId", "launchId"]),
    ...validateOptionalString(payload, "importId"),
    ...validateOptionalString(payload, "idempotencyKey"),
    ...validateOptionalString(payload, "requestedBy")
  ];

  if (!isRecord(payload.source)) {
    issues.push("payload.source must be an object");
    return issues;
  }

  if (payload.source.format !== "allure-results" && payload.source.format !== "junit-xml") {
    issues.push("payload.source.format must be allure-results or junit-xml");
  }

  if (!isNonEmptyString(payload.source.uri)) {
    issues.push("payload.source.uri must be a non-empty string");
  }

  return issues;
}

function validateDefectMuteProjectionPayload(payload: Record<string, unknown>): string[] {
  const issues = validateRequiredStringPayload(payload, ["projectId"]);
  if (!Array.isArray(payload.events)) {
    issues.push("payload.events must be an array");
    return issues;
  }

  for (const [index, event] of payload.events.entries()) {
    if (!isRecord(event)) {
      issues.push(`payload.events[${index}] must be an object`);
      continue;
    }

    issues.push(
      ...validateRequiredStringPayload(event, ["id", "muteId", "projectId", "occurredAt"]).map(
        (issue) => issue.replace("payload.", `payload.events[${index}].`)
      )
    );

    if (event.projectId !== payload.projectId) {
      issues.push(`payload.events[${index}].projectId must match payload.projectId`);
    }
    if (event.type !== "defect.muted" && event.type !== "defect.unmuted") {
      issues.push(`payload.events[${index}].type must be defect.muted or defect.unmuted`);
    }
    if (!isRecord(event.origin)) {
      issues.push(`payload.events[${index}].origin must be an object`);
    }
    if (!isRecord(event.scope)) {
      issues.push(`payload.events[${index}].scope must be an object`);
    }
    if (!Array.isArray(event.affectedSignatureHashes)) {
      issues.push(`payload.events[${index}].affectedSignatureHashes must be an array`);
    }
    if (!Array.isArray(event.affectedTestIds)) {
      issues.push(`payload.events[${index}].affectedTestIds must be an array`);
    }
    if (!Array.isArray(event.rawFailureHistory)) {
      issues.push(`payload.events[${index}].rawFailureHistory must be an array`);
    }
  }

  return issues;
}

function validateArchiveDiagnosticReplayPayload(payload: Record<string, unknown>): string[] {
  const issues = validateRequiredStringPayload(payload, ["projectId", "launchId", "archiveRef"]);
  if (!Array.isArray(payload.events)) {
    issues.push("payload.events must be an array");
    return issues;
  }

  for (const [index, event] of payload.events.entries()) {
    if (!isRecord(event)) {
      issues.push(`payload.events[${index}] must be an object`);
      continue;
    }

    issues.push(
      ...validateRequiredStringPayload(event, [
        "id",
        "projectId",
        "launchId",
        "archiveRef",
        "occurredAt"
      ]).map((issue) => issue.replace("payload.", `payload.events[${index}].`))
    );

    if (event.projectId !== payload.projectId) {
      issues.push(`payload.events[${index}].projectId must match payload.projectId`);
    }
    if (event.launchId !== payload.launchId) {
      issues.push(`payload.events[${index}].launchId must match payload.launchId`);
    }
    if (event.archiveRef !== payload.archiveRef) {
      issues.push(`payload.events[${index}].archiveRef must match payload.archiveRef`);
    }
    if (!isArchiveDiagnosticReplaySource(event.source)) {
      issues.push(`payload.events[${index}].source must be a supported archive read source`);
    }
    if (event.launchState !== "closed" && event.launchState !== "open") {
      issues.push(`payload.events[${index}].launchState must be closed or open`);
    }
    if (!isArchiveDiagnosticReplayCode(event.code)) {
      issues.push(`payload.events[${index}].code must be a supported archive diagnostic code`);
    }
    if (event.severity !== "info" && event.severity !== "warn" && event.severity !== "error") {
      issues.push(`payload.events[${index}].severity must be info, warn, or error`);
    }
    if (typeof event.retryable !== "boolean") {
      issues.push(`payload.events[${index}].retryable must be a boolean`);
    }
  }

  return issues;
}

function validateRequiredStringPayload(
  payload: Record<string, unknown>,
  keys: readonly string[]
): string[] {
  return keys
    .filter((key) => !isNonEmptyString(payload[key]))
    .map((key) => `payload.${key} must be a non-empty string`);
}

function validateOptionalString(payload: Record<string, unknown>, key: string): string[] {
  return payload[key] === undefined || typeof payload[key] === "string"
    ? []
    : [`payload.${key} must be a string when provided`];
}

function validateOptionalStringArray(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? []
    : [`payload.${key} must be an array of strings when provided`];
}

function validateOptionalPositiveNumber(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  if (value === undefined) {
    return [];
  }

  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? []
    : [`payload.${key} must be a positive integer when provided`];
}

function validateOptionalBoolean(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  if (value === undefined) {
    return [];
  }

  return typeof value === "boolean" ? [] : [`payload.${key} must be a boolean when provided`];
}

function validateOptionalWindow(payload: Record<string, unknown>): string[] {
  if (payload.window === undefined) {
    return [];
  }

  if (!isRecord(payload.window)) {
    return ["payload.window must be an object when provided"];
  }

  return validateRequiredStringPayload(payload.window, ["from", "to"]);
}

function isWorkerJobName(value: unknown): value is WorkerJobName {
  return typeof value === "string" && workerJobNames.includes(value as WorkerJobName);
}
