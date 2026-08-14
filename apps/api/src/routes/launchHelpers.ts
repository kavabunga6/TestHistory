import { type Launch as DomainLaunch } from "@testhistory/domain";
import type { AllureStatus } from "@testhistory/contracts";
import {
  summarizeStoredLaunch,
  type AppStore,
  type Launch,
  type LaunchClosePendingUpload,
  type LaunchClosePipeline,
  type LaunchCloseProcessingSummary
} from "../store.js";

export type ListQuery = {
  limit?: number | string;
  cursor?: string;
  offset?: number | string;
  q?: string;
  search?: string;
  sort?: string;
  order?: string;
};

export type LaunchListQuery = ListQuery & {
  status?: Launch["status"] | string;
  branch?: string;
};

export type LaunchResultListQuery = ListQuery & {
  status?: AllureStatus | string;
  testCaseId?: string;
  historyId?: string;
};

type PageMetadata = {
  limit: number;
  cursor: string | null;
  offset: number;
  returned: number;
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export type PaginationValidationError = {
  code: "launch.pagination.invalid";
  message: string;
  redacted: true;
};

const defaultListLimit = 100;
export const maxListLimit = 500;
export const launchDetailEmbeddedLimit = 100;
export const launchSortFields = ["createdAt", "name", "status", "branch", "resultCount"] as const;
export const resultSortFields = [
  "createdAt",
  "name",
  "status",
  "durationMs",
  "uuid",
  "testCaseId"
] as const;
export function toApiLaunch(launch: DomainLaunch): Launch;
export function toApiLaunch(launch: DomainLaunch | undefined): Launch | undefined;
export function toApiLaunch(launch: DomainLaunch | undefined): Launch | undefined {
  return launch as Launch | undefined;
}

export function qualityGateThresholdSchema() {
  return {
    type: "object",
    required: ["op", "value", "severity"],
    additionalProperties: false,
    properties: {
      op: { type: "string", enum: ["lte", "gte"] },
      value: { type: "number" },
      severity: { type: "string", enum: ["warn", "fail"] }
    }
  };
}

export function defectMuteRecordSchema() {
  return {
    type: "object",
    required: [
      "id",
      "status",
      "scope",
      "reason",
      "origin",
      "mutedAt",
      "affectedSignatureHashes",
      "affectedTestIds",
      "auditEvents"
    ],
    additionalProperties: false,
    properties: {
      id: { type: "string" },
      status: { type: "string", enum: ["active", "inactive"] },
      scope: defectMuteScopeSchema(),
      reason: { type: "string" },
      origin: defectMuteOriginSchema(),
      mutedAt: { type: "string" },
      affectedSignatureHashes: {
        type: "array",
        items: { type: "string" }
      },
      affectedTestIds: {
        type: "array",
        items: { type: "string" }
      },
      unmutedAt: { type: "string" },
      unmutedBy: defectMuteOriginSchema(),
      unmuteReason: { type: "string" },
      auditEvents: {
        type: "array",
        items: defectMuteAuditEventSchema()
      }
    }
  };
}

function defectMuteAuditEventSchema() {
  return {
    type: "object",
    required: [
      "id",
      "type",
      "muteId",
      "occurredAt",
      "origin",
      "scope",
      "affectedSignatureHashes",
      "affectedTestIds"
    ],
    additionalProperties: false,
    properties: {
      id: { type: "string" },
      type: { type: "string", enum: ["defect.muted", "defect.unmuted"] },
      muteId: { type: "string" },
      occurredAt: { type: "string" },
      origin: defectMuteOriginSchema(),
      scope: defectMuteScopeSchema(),
      reason: { type: "string" },
      affectedSignatureHashes: {
        type: "array",
        items: { type: "string" }
      },
      affectedTestIds: {
        type: "array",
        items: { type: "string" }
      }
    }
  };
}

function defectMuteScopeSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      signatureHashes: {
        type: "array",
        items: { type: "string" }
      },
      testCaseIds: {
        type: "array",
        items: { type: "string" }
      }
    }
  };
}

function defectMuteOriginSchema() {
  return {
    type: "object",
    oneOf: [
      {
        type: "object",
        required: ["type", "actorId"],
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: ["actor"] },
          actorId: { type: "string" }
        }
      },
      {
        type: "object",
        required: ["type", "systemId"],
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: ["system"] },
          systemId: { type: "string" }
        }
      }
    ]
  };
}

export function serializeLaunch(launch: Launch) {
  return {
    ...summarizeStoredLaunch(launch),
    ...(launch.branch !== undefined ? { branch: launch.branch } : {}),
    ...(launch.commitSha !== undefined ? { commitSha: launch.commitSha } : {}),
    ...(launch.buildNumber !== undefined ? { buildNumber: launch.buildNumber } : {}),
    createdAt: launch.createdAt,
    ...(launch.closedAt !== undefined ? { closedAt: launch.closedAt } : {}),
    ...(launch.archivedAt !== undefined ? { archivedAt: launch.archivedAt } : {}),
    ...(launch.failedAt !== undefined ? { failedAt: launch.failedAt } : {}),
    ...(launch.closePipeline !== undefined ? { closePipeline: launch.closePipeline } : {})
  };
}

export function serializeLaunchResultSummary(launch: Launch, result: Launch["results"][number]) {
  const source = Array.from(launch.resultSources?.values() ?? []).find(
    (item) => item.uuid === result.uuid
  );
  return {
    uuid: result.uuid,
    resultUuid: result.uuid,
    launchId: launch.id,
    projectId: launch.projectId,
    name: result.name,
    status: result.status,
    ...(result.historyId !== undefined ? { historyId: result.historyId } : {}),
    ...(result.testCaseId !== undefined ? { testCaseId: result.testCaseId } : {}),
    ...(result.fullName !== undefined ? { fullName: result.fullName } : {}),
    ...(result.durationMs !== undefined ? { durationMs: result.durationMs } : {}),
    createdAt: source?.importedAt ?? launch.createdAt,
    updatedAt: source?.importedAt ?? launch.createdAt,
    ...(source !== undefined ? { source } : {})
  };
}

export function closePipelineResponse(launch: Launch) {
  return {
    ...summarizeStoredLaunch(launch),
    ...(launch.closedAt !== undefined ? { closedAt: launch.closedAt } : {}),
    ...(launch.failedAt !== undefined ? { failedAt: launch.failedAt } : {}),
    closePipeline: launch.closePipeline,
    processingSummary: launch.closePipeline?.summary,
    processedTestCases: launch.closePipeline?.processedTestCases ?? 0,
    errors: launch.closePipeline?.errors ?? []
  };
}

export function parseListPagination(
  query: ListQuery,
  allowedSortFields: readonly string[]
):
  | { limit: number; offset: number; sort?: string; order?: "asc" | "desc" }
  | PaginationValidationError {
  if (query.sort !== undefined && !allowedSortFields.includes(query.sort)) {
    return paginationValidationError("sort must be one of the supported list fields");
  }

  if (query.order !== undefined && query.order !== "asc" && query.order !== "desc") {
    return paginationValidationError("order must be asc or desc");
  }

  const limit = query.limit === undefined ? defaultListLimit : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxListLimit) {
    return paginationValidationError(`limit must be an integer between 1 and ${maxListLimit}`);
  }

  const offsetCandidate = query.cursor ?? query.offset;
  if (offsetCandidate === undefined) {
    return paginationValues(query, limit, 0);
  }

  if (String(offsetCandidate).trim() === "") {
    return paginationValidationError("cursor/offset must be a non-negative integer offset");
  }

  const offset = Number(offsetCandidate);
  if (!Number.isInteger(offset) || offset < 0) {
    return paginationValidationError("cursor/offset must be a non-negative integer offset");
  }

  return paginationValues(query, limit, offset);
}

function paginationValues(
  query: ListQuery,
  limit: number,
  offset: number
): { limit: number; offset: number; sort?: string; order?: "asc" | "desc" } {
  return {
    limit,
    offset,
    ...(query.sort !== undefined ? { sort: query.sort } : {}),
    ...(query.order !== undefined ? { order: query.order as "asc" | "desc" } : {})
  };
}

export function paginationValidationError(message: string): PaginationValidationError {
  return {
    code: "launch.pagination.invalid",
    message,
    redacted: true
  };
}

export function isPaginationValidationError(
  value:
    | { limit: number; offset: number; sort?: string; order?: "asc" | "desc" }
    | PaginationValidationError
): value is PaginationValidationError {
  return "redacted" in value;
}

export function paginate<T>(items: T[], limit: number, offset: number) {
  const boundedOffset = Math.min(offset, items.length);
  const pageItems = items.slice(boundedOffset, boundedOffset + limit);
  const nextOffset = boundedOffset + pageItems.length;
  const nextCursor = nextOffset < items.length ? String(nextOffset) : null;
  const metadata: PageMetadata = {
    limit,
    cursor: boundedOffset > 0 ? String(boundedOffset) : null,
    offset: boundedOffset,
    returned: pageItems.length,
    total: items.length,
    nextCursor,
    hasMore: nextCursor !== null
  };

  return { items: pageItems, metadata };
}

export function compareLaunches(sort = "createdAt", order: "asc" | "desc" = "desc") {
  return (left: Launch, right: Launch) => {
    const direction = order === "asc" ? 1 : -1;
    const valueOrder = compareValues(launchSortValue(left, sort), launchSortValue(right, sort));
    return valueOrder !== 0 ? valueOrder * direction : left.id.localeCompare(right.id);
  };
}

function launchSortValue(launch: Launch, sort: string): string | number {
  switch (sort) {
    case "name":
      return launch.name;
    case "status":
      return launch.status;
    case "branch":
      return launch.branch ?? "";
    case "resultCount":
      return launch.results.length;
    case "createdAt":
    default:
      return launch.createdAt;
  }
}

export function compareResults(launch: Launch, sort = "createdAt", order: "asc" | "desc" = "asc") {
  return (left: Launch["results"][number], right: Launch["results"][number]) => {
    const direction = order === "asc" ? 1 : -1;
    const valueOrder = compareValues(
      resultSortValue(launch, left, sort),
      resultSortValue(launch, right, sort)
    );
    return valueOrder !== 0 ? valueOrder * direction : left.uuid.localeCompare(right.uuid);
  };
}

function resultSortValue(
  launch: Launch,
  result: Launch["results"][number],
  sort: string
): string | number {
  switch (sort) {
    case "name":
      return result.name;
    case "status":
      return result.status;
    case "durationMs":
      return result.durationMs ?? -1;
    case "uuid":
      return result.uuid;
    case "testCaseId":
      return result.testCaseId ?? "";
    case "createdAt":
    default:
      return (
        Array.from(launch.resultSources?.values() ?? []).find((item) => item.uuid === result.uuid)
          ?.importedAt ?? launch.createdAt
      );
  }
}

function compareValues(left: string | number, right: string | number): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right));
}

export function matchesLaunchSearch(launch: Launch, query: string | undefined): boolean {
  const needle = query?.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  return [
    launch.id,
    launch.name,
    launch.status,
    launch.branch,
    launch.commitSha,
    launch.buildNumber
  ].some((value) => value?.toLowerCase().includes(needle));
}

export function matchesResultSearch(
  result: Launch["results"][number],
  query: string | undefined
): boolean {
  const needle = query?.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  return [
    result.uuid,
    result.name,
    result.status,
    result.historyId,
    result.testCaseId,
    result.fullName
  ].some((value) => value?.toLowerCase().includes(needle));
}

export function launchArtifacts(store: AppStore, launchId: string) {
  return Array.from(store.artifacts.values()).filter((artifact) => artifact.launchId === launchId);
}

export function resultArtifacts(
  store: AppStore,
  launch: Launch,
  resultUuid: string,
  details: { attachments: Array<{ source: string }> }
) {
  const paths = new Set(details.attachments.map((attachment) => attachment.source));
  for (const source of launch.resultSources?.values() ?? []) {
    if (source.uuid === resultUuid) {
      paths.add(source.path);
    }
  }

  return launchArtifacts(store, launch.id).filter((artifact) => paths.has(artifact.path));
}

export function reconcilePendingUploads(
  store: AppStore,
  launchId: string
): LaunchClosePendingUpload[] {
  expireLaunchSessions(store, launchId);

  const pendingSessions = Array.from(store.uploadSessions.values())
    .filter(
      (session) =>
        session.launchId === launchId &&
        (session.status === "open" || session.status === "completing")
    )
    .map((session) => ({
      kind: "session" as const,
      id: session.id,
      status: session.status,
      path: session.path,
      receivedChunks: session.receivedChunks,
      totalChunks: session.totalChunks,
      expiresAt: session.expiresAt
    }));

  const pendingJobs = Array.from(store.uploadJobs.values())
    .filter(
      (job) => job.launchId === launchId && (job.status === "queued" || job.status === "processing")
    )
    .map((job) => ({
      kind: "job" as const,
      id: job.id,
      status: job.status,
      receivedFiles: job.receivedFiles
    }));

  return [...pendingSessions, ...pendingJobs];
}

function expireLaunchSessions(store: AppStore, launchId: string) {
  const now = Date.now();
  for (const session of store.uploadSessions.values()) {
    if (session.launchId !== launchId || session.status !== "open") {
      continue;
    }
    if (Date.parse(session.expiresAt) > now) {
      continue;
    }

    session.status = "expired";
    session.closedAt = new Date().toISOString();
    session.updatedAt = session.closedAt;
    for (const file of session.files.values()) {
      file.chunks.clear();
    }
    session.cleanup = {
      chunksClearedAt: session.closedAt,
      reason: "expired"
    };
  }
}

export function buildProcessingSummary(
  store: AppStore,
  launch: Launch,
  processedTestCases: number
): LaunchCloseProcessingSummary {
  const uploadJobs = Array.from(store.uploadJobs.values()).filter(
    (job) => job.launchId === launch.id
  );
  const base = summarizeStoredLaunch(launch);

  return {
    totalResults: launch.results.length,
    counters: base.counters,
    uploadJobs: {
      total: uploadJobs.length,
      queued: uploadJobs.filter((job) => job.status === "queued").length,
      processing: uploadJobs.filter((job) => job.status === "processing").length,
      completed: uploadJobs.filter((job) => job.status === "completed").length,
      completedWithErrors: uploadJobs.filter((job) => job.status === "completed_with_errors")
        .length,
      failed: uploadJobs.filter((job) => job.status === "failed").length,
      receivedFiles: uploadJobs.reduce((total, job) => total + job.receivedFiles, 0),
      importedResults: uploadJobs.reduce((total, job) => total + job.importedResults, 0),
      duplicateResults: uploadJobs.reduce((total, job) => total + job.duplicateResults, 0),
      storedArtifacts: uploadJobs.reduce((total, job) => total + job.storedArtifacts, 0)
    },
    processedTestCases
  };
}

export function collectUploadErrors(
  store: AppStore,
  launchId: string
): LaunchClosePipeline["errors"] {
  return Array.from(store.uploadJobs.values())
    .filter((job) => job.launchId === launchId)
    .flatMap((job) =>
      job.errors.flatMap((error) =>
        error.errors.map((message) => ({
          scope: "upload" as const,
          id: job.id,
          path: error.path,
          message
        }))
      )
    );
}
