import {
  createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors,
  readArtifactPreviewDescriptor,
  type AttachmentPreviewRetentionDryRunArtifactScheduleDescriptor,
  type ArtifactDescriptor,
  type ArtifactKind,
  type ArtifactPreviewDescriptorReadModel
} from "@testhistory/artifacts";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import type { Launch } from "../store.js";

const defaultPreviewRetentionLimit = 25;
const maxPreviewRetentionLimit = 100;
const defaultPreviewRetentionBatchSize = 100;
const maxPreviewRetentionBatchSize = 100;
const defaultArtifactListLimit = 100;
const maxArtifactListLimit = 500;
const scheduleDigestPattern = "^[a-f0-9]{24}$";

type AttachmentPreviewRetentionQuery = {
  batchSize?: number | string;
  limit?: number | string;
  cursor?: string;
  status?: AttachmentPreviewRetentionStatus;
};

type AttachmentPreviewRetentionScheduleQuery = {
  limit?: number | string;
  cursor?: string;
  scheduleDigest?: string;
  scheduleSize?: number | string;
};

type ArtifactListQuery = {
  launchId?: string;
  projectId?: string;
  kind?: ArtifactKind;
  limit?: number | string;
  cursor?: string;
  offset?: number | string;
};

type AttachmentPreviewRetentionStatus = "cleanup_eligible" | "retained" | "preserved";

type AttachmentPreviewRetentionSource = ArtifactDescriptor & {
  previewDescriptorRecord?: unknown;
  previewDescriptorSerialized?: string;
  previewDescriptorObservedAt?: string;
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

export function parsePositiveIntegerOption(
  value: number | string | undefined,
  fallback: number,
  max: number,
  name: string
): number | string {
  if (typeof value === "string" && !/^(0|[1-9]\d*)$/.test(value)) {
    return `${name} must be an integer between 1 and ${max}`;
  }
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    return `${name} must be an integer between 1 and ${max}`;
  }

  return parsed;
}

export function parsePreviewRetentionPagination(query: AttachmentPreviewRetentionQuery):
  | {
      limit: number;
      offset: number;
      batchSize: number;
    }
  | string {
  const limit = parsePositiveIntegerOption(
    query.limit,
    defaultPreviewRetentionLimit,
    maxPreviewRetentionLimit,
    "limit"
  );
  if (typeof limit === "string") {
    return limit;
  }

  const batchSize = parsePositiveIntegerOption(
    query.batchSize,
    defaultPreviewRetentionBatchSize,
    maxPreviewRetentionBatchSize,
    "batchSize"
  );
  if (typeof batchSize === "string") {
    return batchSize;
  }

  const offset = parseCursorOffset(query.cursor);
  if (typeof offset === "string") {
    return offset;
  }

  return { limit, offset, batchSize };
}

export function parseArtifactListPagination(
  query: ArtifactListQuery
): { limit: number; offset: number } | string {
  const limit = parsePositiveIntegerOption(
    query.limit,
    defaultArtifactListLimit,
    maxArtifactListLimit,
    "limit"
  );
  if (typeof limit === "string") {
    return limit;
  }

  const offsetCandidate = query.cursor ?? query.offset;
  if (offsetCandidate === undefined) {
    return { limit, offset: 0 };
  }

  if (String(offsetCandidate).trim() === "") {
    return "cursor/offset must be a non-negative integer offset";
  }

  const offset =
    typeof offsetCandidate === "number" ? offsetCandidate : parseCursorOffset(offsetCandidate);
  if (typeof offset === "string") {
    return offset.replace("cursor", "cursor/offset");
  }
  if (!Number.isInteger(offset) || offset < 0) {
    return "cursor/offset must be a non-negative integer offset";
  }

  return { limit, offset };
}

function parseCursorOffset(cursor: string | undefined): number | string {
  if (cursor === undefined) {
    return 0;
  }
  if (!/^(0|[1-9]\d*)$/.test(cursor)) {
    return "cursor must be a non-negative integer offset";
  }

  const offset = Number(cursor);
  if (!Number.isSafeInteger(offset)) {
    return "cursor must be a non-negative integer offset";
  }

  return offset;
}

export function parsePreviewRetentionSchedulePagination(
  query: AttachmentPreviewRetentionScheduleQuery
):
  | {
      limit: number;
      offset: number;
      scheduleSize: number;
    }
  | string {
  const limit = parsePositiveIntegerOption(
    query.limit,
    defaultPreviewRetentionLimit,
    maxPreviewRetentionLimit,
    "limit"
  );
  if (typeof limit === "string") {
    return limit;
  }

  const scheduleSize = parsePositiveIntegerOption(
    query.scheduleSize,
    defaultPreviewRetentionBatchSize,
    maxPreviewRetentionBatchSize,
    "scheduleSize"
  );
  if (typeof scheduleSize === "string") {
    return scheduleSize;
  }

  const offset = parseCursorOffset(query.cursor);
  if (typeof offset === "string") {
    return offset;
  }

  return { limit, offset, scheduleSize };
}

export function sanitizeScheduleDigest(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return new RegExp(scheduleDigestPattern).test(value) ? value : undefined;
}

export function previewRetentionValidationErrorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (error.validation !== undefined) {
    return reply
      .code(400)
      .send({ message: previewRetentionValidationMessage(error), redacted: true });
  }

  return reply.send(error);
}

function previewRetentionValidationMessage(error: FastifyError): string {
  const validationText = JSON.stringify(error.validation ?? []);
  if (validationText.includes("batchSize")) {
    return `batchSize must be an integer between 1 and ${maxPreviewRetentionBatchSize}`;
  }
  if (validationText.includes("scheduleSize")) {
    return `scheduleSize must be an integer between 1 and ${maxPreviewRetentionBatchSize}`;
  }
  if (validationText.includes("scheduleDigest")) {
    return "scheduleDigest must be a 24 character lowercase hexadecimal digest";
  }
  if (validationText.includes("limit")) {
    return `limit must be an integer between 1 and ${maxPreviewRetentionLimit}`;
  }
  if (validationText.includes("cursor")) {
    return "cursor must be a non-negative integer offset";
  }

  return "Invalid attachment preview retention query";
}

export function readPreviewRetentionRecord(
  artifact: ArtifactDescriptor,
  now: Date
):
  | {
      preview: ArtifactPreviewDescriptorReadModel;
      observedAt: string;
      cleanupEligibleAt: string | null;
      status: AttachmentPreviewRetentionStatus;
    }
  | "invalid"
  | undefined {
  const source = artifact as AttachmentPreviewRetentionSource;
  const serialized =
    typeof source.previewDescriptorSerialized === "string"
      ? source.previewDescriptorSerialized
      : serializePreviewDescriptorRecord(source.previewDescriptorRecord);
  if (serialized === undefined) {
    return undefined;
  }

  try {
    const preview = readArtifactPreviewDescriptor({ serialized });
    const observedAt = safeIsoDate(source.previewDescriptorObservedAt) ?? artifact.createdAt;
    const retention = preview.descriptorRetention;
    const cleanupEligibleAt = retention.cleanupEligibility.eligible
      ? addDays(observedAt, retention.retentionHorizonDays)
      : null;
    const cleanupEligible =
      cleanupEligibleAt !== null && Date.parse(cleanupEligibleAt) <= now.getTime();
    const status: AttachmentPreviewRetentionStatus = cleanupEligible
      ? "cleanup_eligible"
      : retention.policyClass === "legal-hold-placeholder"
        ? "preserved"
        : "retained";

    return {
      preview,
      observedAt,
      cleanupEligibleAt,
      status
    };
  } catch {
    return "invalid";
  }
}

function serializePreviewDescriptorRecord(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

export function serializePreviewRetentionRecord(
  launch: Launch,
  artifact: ArtifactDescriptor,
  record: Exclude<ReturnType<typeof readPreviewRetentionRecord>, "invalid" | undefined>,
  now: Date
) {
  const retention = record.preview.descriptorRetention;
  const descriptor = record.preview.descriptor;
  return {
    id: `${artifact.id}:${descriptor.id}`,
    launchId: launch.id,
    projectId: launch.projectId,
    artifactId: artifact.id,
    previewDescriptorId: descriptor.id,
    status: record.status,
    observedAt: record.observedAt,
    evaluatedAt: now.toISOString(),
    cleanupEligibleAt: record.cleanupEligibleAt,
    descriptor: {
      kind: descriptor.kind,
      flavor: descriptor.flavor,
      support: descriptor.support,
      status: descriptor.status,
      reason: descriptor.reason,
      ...(descriptor.contentType !== undefined ? { contentType: descriptor.contentType } : {}),
      originalBytes: descriptor.originalBytes,
      previewBytes: descriptor.previewBytes,
      maxPreviewBytes: descriptor.maxPreviewBytes
    },
    retention: {
      retentionClass: retention.retentionClass,
      policyClass: retention.policyClass,
      auditReason: retention.auditReason,
      retentionHorizonDays: retention.retentionHorizonDays,
      cleanupEligibility: retention.cleanupEligibility,
      horizon: retention.horizon
    },
    evidencePreserved: retention.policyClass === "evidence-retained",
    legalHoldPlaceholder: retention.policyClass === "legal-hold-placeholder",
    deletion: {
      planned: false,
      executed: false,
      requested: false,
      providerAction: false
    }
  };
}

export function summarizePreviewRetentionRecords(
  records: Array<ReturnType<typeof serializePreviewRetentionRecord>>,
  invalidDescriptorCount: number
) {
  return {
    descriptorCount: records.length,
    cleanupEligibleDescriptorCount: records.filter((record) => record.status === "cleanup_eligible")
      .length,
    retainedDescriptorCount: records.filter((record) => record.status === "retained").length,
    preservedDescriptorCount: records.filter((record) => record.status === "preserved").length,
    evidenceDescriptorCount: records.filter((record) => record.evidencePreserved).length,
    legalHoldPlaceholderCount: records.filter((record) => record.legalHoldPlaceholder).length,
    invalidDescriptorCount
  };
}

export function buildPreviewRetentionDryRunPlan(
  records: Array<ReturnType<typeof serializePreviewRetentionRecord>>,
  batchSize: number
) {
  const candidates = records.filter((record) => record.status === "cleanup_eligible");
  const batches = chunk(candidates, batchSize).map((batch, index) => {
    const candidateRefs = batch.map((item) => previewRetentionCandidateRef(item));
    return {
      index,
      candidateCount: batch.length,
      totalBytes: sumPreviewRetentionBytes(batch),
      candidateRefs,
      batchDigest: stableDigest(["attachment-preview-retention-dry-run-batch", ...candidateRefs]),
      deletionExecution: false
    };
  });
  const planDigest =
    batches.length > 0
      ? stableDigest([
          "attachment-preview-retention-dry-run-plan",
          ...batches.map((batch) => batch.batchDigest)
        ])
      : null;

  return {
    pageScoped: true,
    candidateCount: candidates.length,
    batchSize,
    batchCount: batches.length,
    totalCandidateBytes: sumPreviewRetentionBytes(candidates),
    planDigest,
    deleteRequestedCount: 0,
    batches
  };
}

function previewRetentionCandidateRef(
  record: ReturnType<typeof serializePreviewRetentionRecord>
): string {
  return `preview-retention-candidate:${stableDigest([
    record.launchId,
    record.projectId,
    record.previewDescriptorId,
    record.cleanupEligibleAt ?? "no-cleanup-eligible-at"
  ])}`;
}

function sumPreviewRetentionBytes(
  records: Array<ReturnType<typeof serializePreviewRetentionRecord>>
): number {
  return records.reduce((total, record) => total + record.descriptor.previewBytes, 0);
}

export function previewRetentionReadPolicy() {
  return {
    mutationAllowed: false,
    deletionExecution: false,
    providerActions: false,
    rawPayloadsIncluded: false,
    pathsIncluded: false,
    storageLocationsIncluded: false,
    signedUrlsIncluded: false,
    tokensIncluded: false,
    paginationRequired: true,
    redacted: true
  };
}

export function serializePreviewRetentionScheduleDescriptor(
  schedule: AttachmentPreviewRetentionDryRunArtifactScheduleDescriptor
) {
  return {
    scheduleRef: schedule.scheduleRef,
    index: schedule.index,
    descriptorCount: schedule.descriptorCount,
    scheduledAfterMinutes: schedule.scheduledAfterMinutes,
    maxCount: schedule.maxDescriptors,
    totalPreviewBytes: schedule.totalPreviewBytes,
    descriptorRefs: schedule.descriptorRefs,
    descriptorDigests: schedule.descriptorDigests,
    omittedDescriptorRefCount: 0,
    batchDigest: schedule.scheduleDigest,
    dryRun: true,
    executionMode: "dry-run",
    mutationAllowed: false,
    deletionExecution: false,
    deleteRequestedCount: 0,
    safety: {
      bounded: schedule.safety.bounded,
      descriptorOnly: schedule.safety.descriptorOnly,
      closedLaunchScope: schedule.safety.closedLaunchScope,
      pathIncluded: false,
      storageKeyIncluded: false,
      objectTargetIncluded: false,
      providerMutationHandleIncluded: false,
      rawPayloadIncluded: false,
      blobIncluded: false,
      signedUrlIncluded: false,
      credentialIncluded: false,
      mutationAllowed: false
    }
  };
}

export function summarizePreviewRetentionScheduleDescriptors(
  scheduleDescriptors: ReturnType<
    typeof createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors
  >,
  filteredSchedules: readonly AttachmentPreviewRetentionDryRunArtifactScheduleDescriptor[]
) {
  return {
    sourceDescriptorCount: scheduleDescriptors.scannedArtifactCount,
    closedLaunchDescriptorCount: scheduleDescriptors.descriptorCount,
    skippedOpenLaunchDescriptorCount: scheduleDescriptors.skippedOpenLaunchRecords,
    skippedNonAttachmentDescriptorCount: scheduleDescriptors.skippedNonAttachmentRecords,
    cleanupEligibleDescriptorCount: scheduleDescriptors.stagedCandidateCount,
    scheduledDescriptorCount: filteredSchedules.reduce(
      (total, schedule) => total + schedule.descriptorCount,
      0
    ),
    retainedDescriptorCount: scheduleDescriptors.retainedRecordCount,
    scheduleDescriptorCount: filteredSchedules.length,
    scheduleDigest: scheduleDescriptors.scheduleDigest,
    plannedOperations: [
      "artifact.preview.retention.dry-run.schedule.describe",
      "artifact.preview.retention.dry-run.schedule.read"
    ],
    deleteRequestedCount: 0
  };
}

export function previewRetentionScheduleExecution() {
  return {
    dryRun: true,
    executionMode: "dry-run",
    readOnly: true,
    workerExecutionAllowed: false,
    deletionMutation: false,
    deletionExecution: false,
    providerActions: false,
    providerMutationHandles: false,
    objectStorageTouched: false,
    deleteRequestedCount: 0
  };
}

export function previewRetentionScheduleReadPolicy() {
  return {
    mutationAllowed: false,
    refreshAllowed: false,
    deletionExecution: false,
    providerActions: false,
    providerMutationHandlesIncluded: false,
    rawPayloadsIncluded: false,
    pathsIncluded: false,
    storageLocationsIncluded: false,
    signedUrlsIncluded: false,
    tokensIncluded: false,
    paginationRequired: true,
    redacted: true
  };
}

export function readSingleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function sanitizeOptionalPublicIdentifier(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  if (
    /(?:bearer|token=|secret|x-amz-signature|signedurl|storagekey|[a-z]:\\|\\\\|https?:\/\/)/i.test(
      value
    )
  ) {
    return `redacted:${stableDigest([value]).slice(0, 12)}`;
  }

  return value.slice(0, 128);
}

function stableDigest(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex");
}

function safeIsoDate(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function addDays(value: string, days: number): string {
  const timestamp = Date.parse(value);
  const start = Number.isFinite(timestamp) ? timestamp : 0;
  return new Date(start + days * 24 * 60 * 60 * 1000).toISOString();
}

export function paginate<T>(
  items: T[],
  limit: number,
  offset: number
): { metadata: PageMetadata; items: T[] } {
  const boundedOffset = Math.min(offset, items.length);
  const pageItems = items.slice(boundedOffset, boundedOffset + limit);
  const nextOffset = boundedOffset + pageItems.length;
  const nextCursor = nextOffset < items.length ? String(nextOffset) : null;

  return {
    metadata: {
      limit,
      cursor: boundedOffset > 0 ? String(boundedOffset) : null,
      offset: boundedOffset,
      returned: pageItems.length,
      total: items.length,
      nextCursor,
      hasMore: nextCursor !== null
    },
    items: pageItems
  };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
