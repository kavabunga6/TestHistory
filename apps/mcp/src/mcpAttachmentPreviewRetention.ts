import { createHash } from "node:crypto";

import { fetchApiValue } from "./mcpApiClient.js";
import { sanitizeArchiveText } from "./mcpArchiveText.js";
import { normalizePageMetadata, pageMetadata } from "./mcpPagination.js";
import type { ResourceReadOptions } from "./mcpReadOptions.js";
import { sanitizeAuditText } from "./mcpSanitizeText.js";
import {
  attachmentPreviewRetentionAccess,
  attachmentPreviewRetentionHeaders,
  attachmentPreviewRetentionScope,
  optionalPreviewRetentionStatus,
  sanitizeAttachmentPreviewRetentionStatus
} from "./mcpAttachmentPreviewRetentionShared.js";
import {
  arrayField,
  cursorOffset,
  getRequiredString,
  integerField,
  isApiStatusPayload,
  isRecord,
  optionalPositiveInteger,
  optionalString,
  pickDefined,
  stringField,
  withQuery
} from "./mcpValueUtils.js";

export async function attachmentPreviewRetentionRead(
  argumentsValue: Record<string, unknown>
): Promise<unknown | string> {
  const launchId = getRequiredString(argumentsValue, "launchId");
  if (launchId.error !== undefined) {
    return "launchId is required for attachment preview retention reads";
  }

  const projectId = getRequiredString(argumentsValue, "projectId");
  if (projectId.error !== undefined) {
    return "projectId is required for attachment preview retention reads";
  }

  const options: ResourceReadOptions = {
    includeDetails: false,
    includeRaw: false,
    limit: optionalPositiveInteger(argumentsValue.limit, 25, 100),
    cursor: optionalString(argumentsValue.cursor),
    offset: cursorOffset(optionalString(argumentsValue.cursor))
  };
  const actorId = optionalString(argumentsValue.actorId);
  const query = {
    status: optionalPreviewRetentionStatus(argumentsValue.status),
    limit: String(options.limit),
    cursor: options.cursor
  };

  return summarizeAttachmentPreviewRetentionRead(
    await fetchApiValue(
      argumentsValue.apiUrl,
      withQuery(
        `/api/v1/launches/${encodeURIComponent(
          launchId.value
        )}/attachment-previews/retention/preview`,
        query
      ),
      {
        headers: attachmentPreviewRetentionHeaders(projectId.value, actorId)
      }
    ),
    options,
    {
      launchId: launchId.value,
      projectId: projectId.value,
      actorId,
      status: query.status,
      batchSize: optionalPositiveInteger(argumentsValue.batchSize, 100, 500)
    }
  );
}

function summarizeAttachmentPreviewRetentionRead(
  value: unknown,
  options: ResourceReadOptions,
  scope: {
    launchId: string;
    projectId: string;
    actorId: string | undefined;
    status: string | undefined;
    batchSize: number;
  }
): unknown {
  if (isApiStatusPayload(value)) {
    return {
      ...sanitizeAttachmentPreviewRetentionStatus(value),
      scope: attachmentPreviewRetentionScope(scope),
      policy: attachmentPreviewRetentionPolicy()
    };
  }

  if (!isRecord(value)) {
    return value;
  }

  const items = arrayField(value, "items");
  const page = isRecord(value.page)
    ? normalizePageMetadata(value.page, options, items.length)
    : pageMetadata(items.length, 0, items.length, options.limit);
  const sanitizedItems = items.map((item) => sanitizeAttachmentPreviewRetentionItem(item, scope));
  const dryRunPlan = buildAttachmentPreviewRetentionDryRunPlan(sanitizedItems, scope.batchSize);

  return {
    kind: "attachment-preview-retention-dry-run-preview",
    scope: attachmentPreviewRetentionScope(scope),
    launch: sanitizeAttachmentPreviewRetentionLaunch(value.launch, scope),
    access: attachmentPreviewRetentionAccess(scope.actorId),
    query: pickDefined(
      {
        status: scope.status,
        limit: options.limit,
        cursor: options.cursor ?? null,
        batchSize: scope.batchSize
      },
      ["status", "limit", "cursor", "batchSize"]
    ),
    boundary: attachmentPreviewRetentionBoundary(value.boundary),
    execution: attachmentPreviewRetentionExecution(),
    page,
    summary: sanitizeAttachmentPreviewRetentionSummary(value.summary),
    items: sanitizedItems,
    dryRunPlan,
    policy: attachmentPreviewRetentionPolicy()
  };
}

function sanitizeAttachmentPreviewRetentionLaunch(
  value: unknown,
  scope: { launchId: string; projectId: string }
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      id: sanitizeAuditText(scope.launchId),
      projectId: sanitizeAuditText(scope.projectId),
      status: "closed"
    };
  }

  return pickDefined(
    {
      id: sanitizeAuditText(stringField(value, "id") || scope.launchId),
      projectId: sanitizeAuditText(stringField(value, "projectId") || scope.projectId),
      status: optionalString(value.status) ?? "closed",
      closedAt: value.closedAt === null ? null : optionalString(value.closedAt)
    },
    ["id", "projectId", "status", "closedAt"]
  );
}

function attachmentPreviewRetentionBoundary(value: unknown): Record<string, unknown> {
  return {
    scope: "closed-launch",
    eligibleLaunchStatus: "closed",
    closedLaunchScoped: true,
    descriptorSource:
      isRecord(value) && value.descriptorSource === "artifact-preview-descriptor-read-model"
        ? "artifact-preview-descriptor-read-model"
        : "artifact-preview-descriptor-read-model",
    rawMaterialReturned: false
  };
}

function attachmentPreviewRetentionExecution(): Record<string, unknown> {
  return {
    dryRun: true,
    executionMode: "dry-run",
    deletionStarted: false,
    deletionMutation: false,
    deletionExecution: false,
    providerActions: false,
    objectStorageTouched: false,
    deleteRequestedCount: 0
  };
}

function sanitizeAttachmentPreviewRetentionSummary(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      descriptorCount: integerField(value, "descriptorCount"),
      cleanupEligibleDescriptorCount: integerField(value, "cleanupEligibleDescriptorCount"),
      retainedDescriptorCount: integerField(value, "retainedDescriptorCount"),
      preservedDescriptorCount: integerField(value, "preservedDescriptorCount"),
      evidenceDescriptorCount: integerField(value, "evidenceDescriptorCount"),
      legalHoldPlaceholderCount: integerField(value, "legalHoldPlaceholderCount"),
      invalidDescriptorCount: integerField(value, "invalidDescriptorCount")
    },
    [
      "descriptorCount",
      "cleanupEligibleDescriptorCount",
      "retainedDescriptorCount",
      "preservedDescriptorCount",
      "evidenceDescriptorCount",
      "legalHoldPlaceholderCount",
      "invalidDescriptorCount"
    ]
  );
}

function sanitizeAttachmentPreviewRetentionItem(
  value: unknown,
  scope: { launchId: string; projectId: string }
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      id: sanitizeArchiveText(stringField(value, "id")),
      launchId: sanitizeAuditText(stringField(value, "launchId") || scope.launchId),
      projectId: sanitizeAuditText(stringField(value, "projectId") || scope.projectId),
      artifactId: sanitizeArchiveText(stringField(value, "artifactId")),
      previewDescriptorId: sanitizeArchiveText(stringField(value, "previewDescriptorId")),
      status: optionalPreviewRetentionStatus(value.status),
      observedAt: optionalString(value.observedAt),
      evaluatedAt: optionalString(value.evaluatedAt),
      cleanupEligibleAt:
        value.cleanupEligibleAt === null ? null : optionalString(value.cleanupEligibleAt),
      descriptor: sanitizeAttachmentPreviewRetentionDescriptor(value.descriptor),
      retention: sanitizeAttachmentPreviewRetentionRetention(value.retention),
      evidencePreserved:
        typeof value.evidencePreserved === "boolean" ? value.evidencePreserved : undefined,
      legalHoldPlaceholder:
        typeof value.legalHoldPlaceholder === "boolean" ? value.legalHoldPlaceholder : undefined,
      deletion: {
        planned: false,
        executed: false,
        providerAction: false
      }
    },
    [
      "id",
      "launchId",
      "projectId",
      "artifactId",
      "previewDescriptorId",
      "status",
      "observedAt",
      "evaluatedAt",
      "cleanupEligibleAt",
      "descriptor",
      "retention",
      "evidencePreserved",
      "legalHoldPlaceholder",
      "deletion"
    ]
  );
}

function sanitizeAttachmentPreviewRetentionDescriptor(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return pickDefined(
    {
      kind: optionalString(value.kind),
      flavor: optionalString(value.flavor),
      support: optionalString(value.support),
      status: optionalString(value.status),
      reason: optionalString(value.reason),
      contentType: optionalString(value.contentType),
      originalBytes: integerField(value, "originalBytes"),
      previewBytes: integerField(value, "previewBytes"),
      maxPreviewBytes: integerField(value, "maxPreviewBytes")
    },
    [
      "kind",
      "flavor",
      "support",
      "status",
      "reason",
      "contentType",
      "originalBytes",
      "previewBytes",
      "maxPreviewBytes"
    ]
  );
}

function sanitizeAttachmentPreviewRetentionRetention(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return pickDefined(
    {
      retentionClass: optionalString(value.retentionClass),
      policyClass: optionalString(value.policyClass),
      auditReason: optionalString(value.auditReason),
      retentionHorizonDays: integerField(value, "retentionHorizonDays"),
      cleanupEligibility: sanitizeAttachmentPreviewRetentionEligibility(value.cleanupEligibility),
      horizon: sanitizeAttachmentPreviewRetentionHorizon(value.horizon)
    },
    [
      "retentionClass",
      "policyClass",
      "auditReason",
      "retentionHorizonDays",
      "cleanupEligibility",
      "horizon"
    ]
  );
}

function sanitizeAttachmentPreviewRetentionEligibility(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return pickDefined(
    {
      eligible: typeof value.eligible === "boolean" ? value.eligible : undefined,
      reason: optionalString(value.reason)
    },
    ["eligible", "reason"]
  );
}

function sanitizeAttachmentPreviewRetentionHorizon(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return pickDefined(
    {
      startsAt: optionalString(value.startsAt),
      endsAt: optionalString(value.endsAt),
      basis: optionalString(value.basis)
    },
    ["startsAt", "endsAt", "basis"]
  );
}

function buildAttachmentPreviewRetentionDryRunPlan(
  items: Record<string, unknown>[],
  batchSize: number
): Record<string, unknown> {
  const candidates = items.filter((item) => item.status === "cleanup_eligible");
  const batches = chunkItems(candidates, batchSize).map((batch, index) => {
    const candidateRefs = batch.map((item) => attachmentPreviewRetentionCandidateRef(item));
    return {
      index,
      candidateCount: batch.length,
      totalBytes: sumAttachmentPreviewRetentionBytes(batch),
      candidateRefs,
      batchDigest: stableDigest(["attachment-preview-retention-dry-run-batch", ...candidateRefs]),
      deletionExecution: false
    };
  });
  const planDigest =
    batches.length > 0
      ? stableDigest([
          "attachment-preview-retention-dry-run-plan",
          ...batches.map((batch) => String(batch.batchDigest))
        ])
      : undefined;

  return pickDefined(
    {
      pageScoped: true,
      candidateCount: candidates.length,
      batchSize,
      batchCount: batches.length,
      totalCandidateBytes: sumAttachmentPreviewRetentionBytes(candidates),
      planDigest,
      deleteRequestedCount: 0,
      batches
    },
    [
      "pageScoped",
      "candidateCount",
      "batchSize",
      "batchCount",
      "totalCandidateBytes",
      "planDigest",
      "deleteRequestedCount",
      "batches"
    ]
  );
}

function attachmentPreviewRetentionCandidateRef(item: Record<string, unknown>): string {
  return `preview-retention-candidate:${stableDigest([
    stringField(item, "launchId"),
    stringField(item, "artifactId"),
    stringField(item, "previewDescriptorId"),
    optionalString(item.cleanupEligibleAt) ?? "no-cleanup-eligible-at"
  ])}`;
}

function sumAttachmentPreviewRetentionBytes(items: Record<string, unknown>[]): number {
  return items.reduce((total, item) => {
    const descriptor = isRecord(item.descriptor) ? item.descriptor : {};
    return total + (integerField(descriptor, "previewBytes") ?? 0);
  }, 0);
}

function attachmentPreviewRetentionPolicy(): Record<string, unknown> {
  return {
    restParity: {
      method: "GET",
      path: "/api/v1/launches/{launchId}/attachment-previews/retention/preview"
    },
    projectIdRequired: true,
    closedLaunchScoped: true,
    actorIdPassThrough: true,
    headersForwarded: [
      "X-TestHistory-Scopes",
      "X-TestHistory-Project-Scope",
      "X-TestHistory-Actor-Id"
    ],
    equalOrNarrowerThanRest: true,
    mutationAllowed: false,
    deletionExecution: false,
    providerActions: false,
    rawPayloadsIncluded: false,
    pathsIncluded: false,
    storageLocationsIncluded: false,
    signedUrlsIncluded: false,
    tokensIncluded: false,
    paginationRequired: true,
    redactionRules: [
      "MCP requires projectId and forwards read scope headers before calling REST.",
      "The REST endpoint rejects non-closed launches; MCP preserves that closed-launch boundary.",
      "Dry-run batches are page-scoped planner metadata only and set deleteRequestedCount to 0.",
      "Raw payload, path, storage key, signed URL, token, cookie, password, and authorization fields are omitted or redacted."
    ]
  };
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function stableDigest(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex");
}
