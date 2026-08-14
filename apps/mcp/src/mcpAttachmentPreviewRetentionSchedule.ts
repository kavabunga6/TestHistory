import { fetchApiValue } from "./mcpApiClient.js";
import { sanitizeArchiveText } from "./mcpArchiveText.js";
import { normalizePageMetadata, paginateItems } from "./mcpPagination.js";
import type { ResourceReadOptions } from "./mcpReadOptions.js";
import { maxMcpPreviewBodyBytes } from "./mcpPreviewConstants.js";
import { truncateUtf8 } from "./mcpTextBounds.js";
import {
  attachmentPreviewRetentionAccess,
  attachmentPreviewRetentionHeaders,
  attachmentPreviewRetentionScope,
  sanitizeAttachmentPreviewRetentionStatus,
  sanitizeOptionalDigest
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
  withQuery
} from "./mcpValueUtils.js";

export async function attachmentPreviewRetentionScheduleRead(
  argumentsValue: Record<string, unknown>
): Promise<unknown | string> {
  const launchId = getRequiredString(argumentsValue, "launchId");
  if (launchId.error !== undefined) {
    return "launchId is required for attachment preview retention schedule reads";
  }

  const projectId = getRequiredString(argumentsValue, "projectId");
  if (projectId.error !== undefined) {
    return "projectId is required for attachment preview retention schedule reads";
  }

  const options: ResourceReadOptions = {
    includeDetails: false,
    includeRaw: false,
    limit: optionalPositiveInteger(argumentsValue.limit, 25, 100),
    cursor: optionalString(argumentsValue.cursor),
    offset: cursorOffset(optionalString(argumentsValue.cursor))
  };
  const actorId = optionalString(argumentsValue.actorId);
  const scheduleDigest = optionalString(argumentsValue.scheduleDigest);

  return summarizeAttachmentPreviewRetentionScheduleRead(
    await fetchApiValue(
      argumentsValue.apiUrl,
      withQuery(
        `/api/v1/launches/${encodeURIComponent(
          launchId.value
        )}/attachment-previews/retention/dry-run/schedule`,
        {
          scheduleDigest,
          limit: String(options.limit),
          cursor: options.cursor
        }
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
      scheduleDigest
    }
  );
}

function summarizeAttachmentPreviewRetentionScheduleRead(
  value: unknown,
  options: ResourceReadOptions,
  scope: {
    launchId: string;
    projectId: string;
    actorId: string | undefined;
    scheduleDigest: string | undefined;
  }
): unknown {
  if (isApiStatusPayload(value)) {
    return {
      ...sanitizeAttachmentPreviewRetentionStatus(value),
      scope: attachmentPreviewRetentionScope(scope),
      policy: attachmentPreviewRetentionSchedulePolicy()
    };
  }

  if (!isRecord(value)) {
    return value;
  }

  const scheduleBatches = attachmentPreviewRetentionScheduleBatches(value);
  const paginated =
    isRecord(value.page) || isRecord(value.pagination)
      ? {
          items: scheduleBatches,
          metadata: normalizePageMetadata(
            isRecord(value.page) ? value.page : (value.pagination as Record<string, unknown>),
            options,
            scheduleBatches.length
          )
        }
      : paginateItems(scheduleBatches, options);
  const sanitizedBatches = paginated.items.map((batch) =>
    sanitizeAttachmentPreviewRetentionScheduleBatch(batch)
  );

  return {
    kind: "attachment-preview-retention-dry-run-schedule",
    scope: attachmentPreviewRetentionScope(scope),
    access: attachmentPreviewRetentionAccess(scope.actorId),
    query: pickDefined(
      {
        scheduleDigest: sanitizeOptionalDigest(scope.scheduleDigest),
        limit: options.limit,
        cursor: options.cursor ?? null
      },
      ["scheduleDigest", "limit", "cursor"]
    ),
    boundary: attachmentPreviewRetentionScheduleBoundary(value.boundary),
    execution: attachmentPreviewRetentionScheduleExecution(),
    page: paginated.metadata,
    summary: sanitizeAttachmentPreviewRetentionScheduleSummary(value.summary),
    transitions: arrayField(value, "transitions").map(sanitizeAttachmentPreviewRetentionTransition),
    batches: sanitizedBatches,
    diagnostics: arrayField(value, "diagnostics").map(
      sanitizeAttachmentPreviewRetentionScheduleDiagnostic
    ),
    policy: attachmentPreviewRetentionSchedulePolicy()
  };
}

function attachmentPreviewRetentionScheduleBatches(value: Record<string, unknown>): unknown[] {
  const batches = arrayField(value, "batches");
  if (batches.length > 0) {
    return batches;
  }
  return arrayField(value, "items");
}

function sanitizeAttachmentPreviewRetentionScheduleSummary(
  value: unknown
): Record<string, unknown> {
  if (!isRecord(value)) {
    return { deleteRequestedCount: 0 };
  }

  return pickDefined(
    {
      sourceDescriptorCount: integerField(value, "sourceDescriptorCount"),
      closedLaunchDescriptorCount: integerField(value, "closedLaunchDescriptorCount"),
      skippedOpenLaunchDescriptorCount: integerField(value, "skippedOpenLaunchDescriptorCount"),
      missingLaunchScopeDescriptorCount: integerField(value, "missingLaunchScopeDescriptorCount"),
      cleanupEligibleDescriptorCount: integerField(value, "cleanupEligibleDescriptorCount"),
      scheduledDescriptorCount: integerField(value, "scheduledDescriptorCount"),
      retainedDescriptorCount: integerField(value, "retainedDescriptorCount"),
      invalidDescriptorCount: integerField(value, "invalidDescriptorCount"),
      duplicateDescriptorCount: integerField(value, "duplicateDescriptorCount"),
      omittedDiagnosticCount: integerField(value, "omittedDiagnosticCount"),
      scheduleDigest: sanitizeOptionalDigest(value.scheduleDigest),
      projectionDigest: sanitizeOptionalDigest(value.projectionDigest),
      plannedOperations: sanitizeAttachmentPreviewRetentionOperations(value.plannedOperations),
      deleteRequestedCount: 0
    },
    [
      "sourceDescriptorCount",
      "closedLaunchDescriptorCount",
      "skippedOpenLaunchDescriptorCount",
      "missingLaunchScopeDescriptorCount",
      "cleanupEligibleDescriptorCount",
      "scheduledDescriptorCount",
      "retainedDescriptorCount",
      "invalidDescriptorCount",
      "duplicateDescriptorCount",
      "omittedDiagnosticCount",
      "scheduleDigest",
      "projectionDigest",
      "plannedOperations",
      "deleteRequestedCount"
    ]
  );
}

function sanitizeAttachmentPreviewRetentionOperations(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .filter((item) =>
      [
        "artifact.preview.retention.classify",
        "artifact.preview.retention.dry-run.schedule"
      ].includes(item)
    );
}

function sanitizeAttachmentPreviewRetentionTransition(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      state: optionalString(value.state),
      at: optionalString(value.at)
    },
    ["state", "at"]
  );
}

function sanitizeAttachmentPreviewRetentionScheduleBatch(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      index: integerField(value, "index"),
      descriptorCount: integerField(value, "descriptorCount"),
      scheduledAfterMinutes: integerField(value, "scheduledAfterMinutes"),
      maxCount: integerField(value, "maxCount"),
      descriptorRefs: sanitizeAttachmentPreviewRetentionDescriptorRefs(value.descriptorRefs),
      omittedDescriptorRefCount: integerField(value, "omittedDescriptorRefCount"),
      batchDigest: sanitizeOptionalDigest(value.batchDigest),
      deletionExecution: false,
      deleteRequestedCount: 0
    },
    [
      "index",
      "descriptorCount",
      "scheduledAfterMinutes",
      "maxCount",
      "descriptorRefs",
      "omittedDescriptorRefCount",
      "batchDigest",
      "deletionExecution",
      "deleteRequestedCount"
    ]
  );
}

function sanitizeAttachmentPreviewRetentionDescriptorRefs(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => sanitizeArchiveText(item))
    .filter((item) => !item.startsWith("["))
    .slice(0, 20);
}

function sanitizeAttachmentPreviewRetentionScheduleDiagnostic(
  value: unknown
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      code: optionalString(value.code),
      severity: optionalString(value.severity),
      retryable: typeof value.retryable === "boolean" ? value.retryable : undefined,
      descriptorRef:
        typeof value.descriptorRef === "string"
          ? sanitizeArchiveText(value.descriptorRef)
          : undefined,
      message:
        typeof value.message === "string"
          ? truncateUtf8(sanitizeArchiveText(value.message), maxMcpPreviewBodyBytes).value
          : undefined
    },
    ["code", "severity", "retryable", "descriptorRef", "message"]
  );
}

function attachmentPreviewRetentionScheduleBoundary(value: unknown): Record<string, unknown> {
  return {
    scope: "closed-launch",
    workerScheduled: false,
    closedLaunchScoped: true,
    descriptorSource: "artifact-schedule-descriptor-read-model",
    rawMaterialReturned: isRecord(value) && value.rawMaterialReturned === true ? false : false
  };
}

function attachmentPreviewRetentionScheduleExecution(): Record<string, unknown> {
  return {
    dryRun: true,
    readOnly: true,
    workerExecutionAllowed: false,
    deletionMutation: false,
    deletionExecution: false,
    providerActions: false,
    objectStorageTouched: false,
    deleteRequestedCount: 0
  };
}

function attachmentPreviewRetentionSchedulePolicy(): Record<string, unknown> {
  return {
    restParity: {
      method: "GET",
      path: "/api/v1/launches/{launchId}/attachment-previews/retention/dry-run/schedule"
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
    descriptorOnly: true,
    mutationAllowed: false,
    refreshAllowed: false,
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
      "Worker schedule reads are closed-launch scoped and remain descriptor-only.",
      "MCP returns schedule evidence only; it does not refresh schedules, execute deletion, or touch object storage.",
      "Raw payload, path, storage key, signed URL, token, cookie, password, authorization, provider, and deletion handle fields are omitted or redacted."
    ]
  };
}
