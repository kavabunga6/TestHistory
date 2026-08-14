import { fetchApiValue } from "./mcpApiClient.js";
import { paginateItems } from "./mcpPagination.js";
import {
  attachmentBlobFieldNames,
  compactFailureStatuses,
  maxMcpPreviewBodyBytes
} from "./mcpPreviewConstants.js";
import { defaultResultLimit, type ResourceReadOptions } from "./mcpReadOptions.js";
import {
  countLines,
  safeAttachmentText,
  sanitizePreviewText,
  truncateUtf8
} from "./mcpTextBounds.js";
import {
  arrayField,
  cursorOffset,
  integerField,
  isApiStatusPayload,
  isRecord,
  omitKeys,
  optionalPositiveInteger,
  optionalString,
  pickDefined,
  stringField,
  toMcpSafeValue
} from "./mcpValueUtils.js";

export async function recentFailures(argumentsValue: Record<string, unknown>): Promise<unknown> {
  const apiUrl = argumentsValue.apiUrl;
  const limit = optionalPositiveInteger(argumentsValue.limit, defaultResultLimit, 100);
  const cursor = optionalString(argumentsValue.cursor);
  const options: ResourceReadOptions = {
    includeDetails: argumentsValue.includeDetails === true,
    includeRaw: argumentsValue.includeRaw === true,
    limit,
    cursor,
    offset: cursorOffset(cursor)
  };
  const failures: unknown[] = [];
  const collectLimit = options.offset + limit + 1;
  const launchId = optionalString(argumentsValue.launchId);

  if (launchId !== undefined) {
    const launch = await fetchApiValue(apiUrl, `/api/v1/launches/${encodeURIComponent(launchId)}`);
    if (isApiStatusPayload(launch)) {
      return launch;
    }
    collectFailuresFromLaunch(launch, failures, options, Number.POSITIVE_INFINITY);
    return recentFailuresPayload(failures, options, { launchId });
  }

  const launchSummaries = await findLaunchSummaries(
    apiUrl,
    optionalString(argumentsValue.projectId)
  );
  if (isApiStatusPayload(launchSummaries)) {
    return launchSummaries;
  }
  if (!Array.isArray(launchSummaries)) {
    return launchSummaries;
  }

  for (const launchSummary of launchSummaries) {
    if (failures.length >= collectLimit) {
      break;
    }
    const currentLaunchId = stringField(launchSummary, "id");
    if (currentLaunchId.length === 0) {
      continue;
    }
    const launch = await fetchApiValue(
      apiUrl,
      `/api/v1/launches/${encodeURIComponent(currentLaunchId)}`
    );
    if (isApiStatusPayload(launch)) {
      return launch;
    }
    collectFailuresFromLaunch(launch, failures, options, collectLimit);
  }

  return recentFailuresPayload(failures, options, {
    projectId: optionalString(argumentsValue.projectId)
  });
}

async function findLaunchSummaries(
  apiUrl: unknown,
  projectId: string | undefined
): Promise<unknown> {
  if (projectId !== undefined) {
    return await fetchApiValue(
      apiUrl,
      `/api/v1/projects/${encodeURIComponent(projectId)}/launches`
    );
  }

  const projects = await fetchApiValue(apiUrl, "/api/v1/projects");
  if (isApiStatusPayload(projects) || !Array.isArray(projects)) {
    return projects;
  }

  const launches: unknown[] = [];
  for (const project of projects) {
    const currentProjectId = stringField(project, "id");
    if (currentProjectId.length === 0) {
      continue;
    }
    const projectLaunches = await fetchApiValue(
      apiUrl,
      `/api/v1/projects/${encodeURIComponent(currentProjectId)}/launches`
    );
    if (isApiStatusPayload(projectLaunches)) {
      return projectLaunches;
    }
    if (Array.isArray(projectLaunches)) {
      launches.push(...projectLaunches);
    }
  }

  return launches.sort((left, right) =>
    stringField(right, "createdAt").localeCompare(stringField(left, "createdAt"))
  );
}

function collectFailuresFromLaunch(
  launch: unknown,
  failures: unknown[],
  options: ResourceReadOptions,
  limit: number
) {
  if (!isRecord(launch)) {
    return;
  }

  for (const result of arrayField(launch, "results")) {
    if (failures.length >= limit) {
      break;
    }
    if (!compactFailureStatuses.has(stringField(result, "status"))) {
      continue;
    }
    failures.push({
      launch: compactLaunchIdentity(launch),
      result: compactResult(result, options)
    });
  }
}

function recentFailuresPayload(
  failures: unknown[],
  options: ResourceReadOptions,
  scope: Record<string, unknown>
) {
  const page = paginateItems(failures, options);
  return {
    kind: "recent-failures",
    compact: !options.includeRaw,
    scope,
    limit: options.limit,
    count: page.items.length,
    collectedCount: failures.length,
    page: page.metadata,
    failures: page.items
  };
}

export function compactLaunchIdentity(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(value, [
    "id",
    "projectId",
    "name",
    "status",
    "branch",
    "commitSha",
    "buildNumber",
    "createdAt",
    "closedAt",
    "failedAt",
    "archivedAt"
  ]);
}

export function compactResult(
  value: unknown,
  options: ResourceReadOptions
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  const compacted = pickDefined(value, [
    "uuid",
    "id",
    "testCaseId",
    "fullName",
    "name",
    "status",
    "durationMs",
    "labels",
    "parameters",
    "statusDetails"
  ]);

  if (options.includeDetails) {
    Object.assign(compacted, omitKeys(value, ["raw", "steps", "attachments"]));
  }
  const attachments = options.includeDetails ? attachmentArray(value) : [];
  if (attachments.length > 0) {
    const attachmentPage = paginateItems(attachments, options);
    Object.assign(compacted, {
      attachmentPreviews: attachmentPage.items.map((attachment) =>
        compactAttachmentPreview(attachment)
      ),
      attachmentPreviewPage: attachmentPage.metadata,
      omittedAttachmentPreviews: attachmentPage.omittedAfter
    });
  }
  if (options.includeRaw) {
    Object.assign(compacted, rawRedactionMetadata());
  }

  return compacted;
}

export function attachmentArray(value: Record<string, unknown>): unknown[] {
  const attachments = arrayField(value, "attachments");
  if (attachments.length > 0) {
    return attachments;
  }

  return arrayField(value, "attachmentPreviews");
}

export function compactAttachmentPreview(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  const previewSource =
    isRecord(value.preview) || isRecord(value.previewDescriptor)
      ? ((value.preview ?? value.previewDescriptor) as Record<string, unknown>)
      : looksLikePreviewDescriptor(value)
        ? value
        : undefined;
  const preview =
    previewSource !== undefined ? sanitizePreviewDescriptor(previewSource) : undefined;

  return pickDefined(
    {
      id: safeAttachmentText(stringField(value, "id")),
      artifactId: safeAttachmentText(stringField(value, "artifactId")),
      name: safeAttachmentText(stringField(value, "name")),
      title: safeAttachmentText(stringField(value, "title")),
      contentType: optionalString(value.contentType),
      originalBytes: integerField(value, "originalBytes") ?? integerField(value, "size"),
      sha256: safeAttachmentText(stringField(value, "sha256")),
      metadata: sanitizeAttachmentMetadata(value.metadata),
      preview,
      safety: {
        descriptorVersion: 1,
        paged: true,
        rawBlobFieldsIncluded: false,
        pathIncluded: false,
        storageKeyIncluded: false,
        signedUrlIncluded: false
      }
    },
    [
      "id",
      "artifactId",
      "name",
      "title",
      "contentType",
      "originalBytes",
      "sha256",
      "metadata",
      "preview",
      "safety"
    ]
  );
}

export function looksLikePreviewDescriptor(value: Record<string, unknown>): boolean {
  return (
    typeof value.kind === "string" &&
    typeof value.status === "string" &&
    isRecord(value.safety) &&
    isRecord(value.body)
  );
}

export function sanitizePreviewDescriptor(value: Record<string, unknown>): Record<string, unknown> {
  const body = sanitizePreviewBody(value.body);
  const safety = isRecord(value.safety) ? value.safety : {};
  const redactionApplied =
    (isRecord(body) && body.redacted === true) || safety.redactionApplied === true;

  return pickDefined(
    {
      id: safeAttachmentText(stringField(value, "id")),
      artifactId: safeAttachmentText(stringField(value, "artifactId")),
      kind: optionalString(value.kind),
      flavor: optionalString(value.flavor),
      status: optionalString(value.status),
      reason: optionalString(value.reason),
      originalBytes: integerField(value, "originalBytes"),
      previewBytes: integerField(value, "previewBytes"),
      maxPreviewBytes: integerField(value, "maxPreviewBytes"),
      contentType: optionalString(value.contentType),
      sha256: safeAttachmentText(stringField(value, "sha256")),
      body,
      safety: {
        descriptorVersion:
          integerField(safety, "descriptorVersion") === 1
            ? 1
            : integerField(safety, "descriptorVersion"),
        bounded: true,
        pathIncluded: false,
        storageKeyIncluded: false,
        rawPayloadIncluded: false,
        redactionApplied
      }
    },
    [
      "id",
      "artifactId",
      "kind",
      "flavor",
      "status",
      "reason",
      "originalBytes",
      "previewBytes",
      "maxPreviewBytes",
      "contentType",
      "sha256",
      "body",
      "safety"
    ]
  );
}

export function sanitizePreviewBody(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.type === "redacted-text") {
    const text = typeof value.value === "string" ? value.value : "";
    const redacted = sanitizePreviewText(text);
    const bounded = truncateUtf8(redacted.value, maxMcpPreviewBodyBytes);
    return {
      type: "redacted-text",
      encoding: value.encoding === "utf8" ? "utf8" : optionalString(value.encoding),
      value: bounded.value,
      lineCount: countLines(bounded.value),
      truncated: value.truncated === true || bounded.truncated || redacted.redacted,
      redacted: value.redacted === true || redacted.redacted
    };
  }

  if (value.type === "image-metadata") {
    return pickDefined(
      {
        type: "image-metadata",
        mediaType: optionalString(value.mediaType),
        inline: false,
        downloadRequired: true
      },
      ["type", "mediaType", "inline", "downloadRequired"]
    );
  }

  return { type: "metadata-only" };
}

export function sanitizeAttachmentMetadata(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }
  return toMcpSafeValue(removeAttachmentBlobFields(value));
}

export function removeAttachmentBlobFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => removeAttachmentBlobFields(item));
  }
  if (!isRecord(value)) {
    return value;
  }

  const safe: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (attachmentBlobFieldNames.has(key)) {
      continue;
    }
    safe[key] = removeAttachmentBlobFields(fieldValue);
  }
  return safe;
}

export function attachmentPreviewPolicy(): Record<string, unknown> {
  return {
    restParity: {
      method: "GET",
      path: "/api/v1/launches/{launchId}/results/{resultUuid}",
      sourceField: "attachments"
    },
    equalOrNarrowerThanRest: true,
    pageLimited: true,
    maxInlinePreviewBytes: maxMcpPreviewBodyBytes,
    omittedFields: Array.from(attachmentBlobFieldNames).sort(),
    maskedMetadataPreserved: true
  };
}

export function summarizeHistoryArray(history: unknown[], options: ResourceReadOptions) {
  const page = paginateItems(history, options);
  const returned = page.items.map((point) => compactHistoryPoint(point, options));
  return {
    totalPoints: history.length,
    returnedPoints: returned.length,
    omittedPoints: page.omittedAfter,
    page: page.metadata,
    points: returned
  };
}

export function compactHistoryPoint(
  value: unknown,
  options: ResourceReadOptions
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  if (options.includeDetails) {
    return omitKeys(value, ["raw", "attachments", "steps"]);
  }

  return pickDefined(value, [
    "launchId",
    "launchName",
    "resultUuid",
    "uuid",
    "testCaseId",
    "status",
    "durationMs",
    "startedAt",
    "finishedAt",
    "createdAt",
    "closedAt"
  ]);
}

export function rawRedactionMetadata(): Record<string, unknown> {
  return {
    rawRedacted: true,
    rawPolicy:
      "MCP responses omit raw payload fields; use REST read models for full audited access."
  };
}
