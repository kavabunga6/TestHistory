import { sanitizeExportText } from "./mcpExportSanitizers.js";
import { attachmentBlobFieldNames } from "./mcpPreviewConstants.js";
import type { ResourceReadOptions } from "./mcpReadOptions.js";
import {
  integerField,
  integerStringField,
  isRecord,
  isSensitiveKey,
  pickDefined
} from "./mcpValueUtils.js";

export function defectMuteProjectionInvariantQuery(
  options: ResourceReadOptions,
  actorId: string | undefined
): Record<string, string | undefined> {
  return {
    actorId,
    limit: String(options.limit),
    cursor: options.cursor
  };
}

export function defectMuteProjectionHeaders(
  projectId: string,
  actorId: string | undefined
): Record<string, string> {
  return {
    "X-TestHistory-Scopes": "defects:read",
    "X-TestHistory-Project-Scope": projectId,
    ...(actorId !== undefined ? { "X-TestHistory-Actor-Id": actorId } : {})
  };
}

export function sanitizeDefectMuteProjectionAccess(
  value: unknown,
  actorId: string | undefined
): Record<string, unknown> {
  const actorScoped =
    isRecord(value) && typeof value.actorScoped === "boolean"
      ? value.actorScoped
      : actorId !== undefined;

  return {
    scope: "defects:read",
    projectScoped: true,
    actorScoped,
    mutation: false,
    redacted: true
  };
}

export function defectMuteProjectionInvariantScope(
  projectId: string,
  actorId: string | undefined
): Record<string, unknown> {
  return pickDefined(
    {
      projectId: sanitizeProjectionText(projectId),
      actorId: actorId !== undefined ? sanitizeProjectionText(actorId) : undefined
    },
    ["projectId", "actorId"]
  );
}

export function defectMuteProjectionInvariantQueryMetadata(
  query: Record<string, string | undefined>,
  projectId: string,
  options: ResourceReadOptions
): Record<string, unknown> {
  return pickDefined(
    {
      projectId: sanitizeProjectionText(projectId),
      actorId: query.actorId !== undefined ? sanitizeProjectionText(query.actorId) : undefined,
      limit: integerStringField(query.limit) ?? options.limit,
      cursor: query.cursor ?? null
    },
    ["projectId", "actorId", "limit", "cursor"]
  );
}

export function sanitizeDefectMuteProjectionRawEffectiveSeparation(
  value: unknown
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      effectiveStateExcludesRawFailureHistory: false,
      rawFailureHistoryPreserved: false,
      rawFailureHistoryNotMutatedByUnmute: false,
      rawFailureOccurrenceCount: 0,
      effectiveRecordCount: 0
    };
  }

  return pickDefined(
    {
      effectiveStateExcludesRawFailureHistory:
        typeof value.effectiveStateExcludesRawFailureHistory === "boolean"
          ? value.effectiveStateExcludesRawFailureHistory
          : false,
      rawFailureHistoryPreserved:
        typeof value.rawFailureHistoryPreserved === "boolean"
          ? value.rawFailureHistoryPreserved
          : false,
      rawFailureHistoryNotMutatedByUnmute:
        typeof value.rawFailureHistoryNotMutatedByUnmute === "boolean"
          ? value.rawFailureHistoryNotMutatedByUnmute
          : false,
      rawFailureOccurrenceCount: integerField(value, "rawFailureOccurrenceCount") ?? 0,
      effectiveRecordCount: integerField(value, "effectiveRecordCount") ?? 0,
      documentation:
        typeof value.documentation === "string"
          ? sanitizeProjectionText(value.documentation)
          : undefined
    },
    [
      "effectiveStateExcludesRawFailureHistory",
      "rawFailureHistoryPreserved",
      "rawFailureHistoryNotMutatedByUnmute",
      "rawFailureOccurrenceCount",
      "effectiveRecordCount",
      "documentation"
    ]
  );
}

export function sanitizeProjectionDenied(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeProjectionDenied(item));
  }
  if (typeof value === "string") {
    return sanitizeProjectionText(value);
  }
  if (!isRecord(value)) {
    return value;
  }

  const safe: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (isUnsafeProjectionFieldKey(key)) {
      continue;
    }
    safe[key] = sanitizeProjectionDenied(fieldValue);
  }
  return safe;
}

export function sanitizeProjectionText(value: string): string {
  return sanitizeExportText(value);
}

export function isUnsafeProjectionFieldKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    attachmentBlobFieldNames.has(key) ||
    normalized.includes("raw") ||
    normalized.includes("failure") ||
    normalized.includes("payload") ||
    normalized.includes("trace") ||
    normalized.includes("storage") ||
    normalized.endsWith("path") ||
    normalized.includes("url") ||
    isSensitiveKey(key)
  );
}

export function sanitizeProjectionStringList(value: unknown[]): string[] {
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => sanitizeProjectionText(item));
}

export function sanitizeNumericRecord(
  value: unknown,
  sanitizeKey: (key: string) => string = (key) => key
): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }

  const safe: Record<string, number> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (typeof fieldValue === "number" && Number.isFinite(fieldValue)) {
      safe[sanitizeKey(key)] = fieldValue;
    }
  }
  return safe;
}
