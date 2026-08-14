import { fetchApiValue } from "./mcpApiClient.js";
import { paginateItems } from "./mcpPagination.js";
import { defaultResultLimit, type ResourceReadOptions } from "./mcpReadOptions.js";
import { sanitizeAuditText, sanitizeStringArray } from "./mcpSanitizeText.js";
import {
  arrayField,
  cursorOffset,
  isApiStatusPayload,
  isRecord,
  numericField,
  optionalPositiveInteger,
  optionalString,
  pickDefined,
  stringField,
  withQuery
} from "./mcpValueUtils.js";

export async function defectMuteRead(
  argumentsValue: Record<string, unknown>
): Promise<unknown | string> {
  const options: ResourceReadOptions = {
    includeDetails: false,
    includeRaw: false,
    limit: optionalPositiveInteger(argumentsValue.limit, defaultResultLimit, 100),
    cursor: optionalString(argumentsValue.cursor),
    offset: cursorOffset(optionalString(argumentsValue.cursor))
  };
  const launchId = optionalString(argumentsValue.launchId);

  if (launchId !== undefined) {
    return summarizeQualityGateMuteEffectsRead(
      await fetchApiValue(
        argumentsValue.apiUrl,
        `/api/v1/launches/${encodeURIComponent(launchId)}/quality-gate`
      ),
      options,
      { launchId }
    );
  }

  const projectId = optionalString(argumentsValue.projectId);
  if (projectId === undefined) {
    return "projectId is required for defect mute status reads";
  }
  return summarizeDefectMuteStatusRead(
    await fetchApiValue(
      argumentsValue.apiUrl,
      withQuery("/api/v1/defects", {
        projectId
      })
    ),
    options,
    { projectId }
  );
}

export function summarizeDefectMuteStatusRead(
  value: unknown,
  options: ResourceReadOptions,
  scope: { projectId: string | undefined }
): unknown {
  if (isApiStatusPayload(value)) {
    return value;
  }

  const defects = readItems(value);
  const page = paginateItems(defects, options);
  return {
    kind: "defect-mute-status",
    compact: true,
    scope: pickDefined({ projectId: scope.projectId }, ["projectId"]),
    totalDefects: defects.length,
    returnedDefects: page.items.length,
    page: page.metadata,
    defects: page.items.map((defect) => compactDefectMuteStatus(defect)),
    policy: defectMuteReadPolicy("/api/v1/defects", "defects")
  };
}

export function summarizeQualityGateMuteEffectsRead(
  value: unknown,
  options: ResourceReadOptions,
  scope: { launchId: string }
): unknown {
  if (isApiStatusPayload(value)) {
    return value;
  }
  if (!isRecord(value)) {
    return value;
  }

  const effects = arrayField(value, "effects")
    .map((effect) => sanitizeDefectMuteEffect(effect))
    .filter((effect) => Object.keys(effect).length > 0);
  const reasonEffects = arrayField(value, "reasons")
    .map((reason) => compactMuteAffectedQualityGateReason(reason))
    .filter((reason) => Array.isArray(reason.effects) && reason.effects.length > 0);
  const page = paginateItems(effects, options);

  return {
    kind: "defect-mute-effects",
    compact: true,
    scope,
    status: optionalString(value.status),
    rawStatus: optionalString(value.rawStatus),
    totalEffects: effects.length,
    returnedEffects: page.items.length,
    page: page.metadata,
    effects: page.items,
    reasons: reasonEffects,
    policy: defectMuteReadPolicy("/api/v1/launches/{launchId}/quality-gate", "quality-gate")
  };
}

function readItems(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (!isRecord(value)) {
    return [];
  }
  const items = arrayField(value, "items");
  return items.length > 0 ? items : arrayField(value, "defects");
}

function compactDefectMuteStatus(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  const mutes = [
    ...arrayField(value, "mutes"),
    ...arrayField(value, "defectMutes"),
    ...arrayField(value, "muteRecords")
  ]
    .map((mute) => sanitizeDefectMuteRecord(mute))
    .filter((mute) => Object.keys(mute).length > 0);
  const activeMuteSource =
    isRecord(value.activeMute) || isRecord(value.defectMute) || isRecord(value.mute)
      ? ((value.activeMute ?? value.defectMute ?? value.mute) as Record<string, unknown>)
      : undefined;
  const activeMute =
    activeMuteSource !== undefined ? sanitizeDefectMuteRecord(activeMuteSource) : undefined;
  const effects = arrayField(value, "effects")
    .map((effect) => sanitizeDefectMuteEffect(effect))
    .filter((effect) => Object.keys(effect).length > 0);

  return pickDefined(
    {
      id: sanitizeAuditText(stringField(value, "id")),
      projectId: sanitizeAuditText(stringField(value, "projectId")),
      launchId: sanitizeAuditText(stringField(value, "launchId")),
      testCaseId:
        stringField(value, "testCaseId").length > 0
          ? sanitizeAuditText(stringField(value, "testCaseId"))
          : undefined,
      signatureHash:
        stringField(value, "signatureHash").length > 0
          ? sanitizeAuditText(stringField(value, "signatureHash"))
          : undefined,
      status: optionalString(value.status),
      muted: typeof value.muted === "boolean" ? value.muted : activeMute !== undefined,
      muteStatus:
        optionalString(value.muteStatus) ??
        (activeMute !== undefined ? optionalString(activeMute.status) : undefined),
      activeMute,
      mutes,
      effects
    },
    [
      "id",
      "projectId",
      "launchId",
      "testCaseId",
      "signatureHash",
      "status",
      "muted",
      "muteStatus",
      "activeMute",
      "mutes",
      "effects"
    ]
  );
}

export function compactMuteAffectedQualityGateReason(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }
  const effects = arrayField(value, "effects")
    .map((effect) => sanitizeDefectMuteEffect(effect))
    .filter((effect) => Object.keys(effect).length > 0);

  return pickDefined(
    {
      code: sanitizeAuditText(stringField(value, "code")),
      metric: optionalString(value.metric),
      severity: optionalString(value.severity),
      passed: typeof value.passed === "boolean" ? value.passed : undefined,
      effectivePassed:
        typeof value.effectivePassed === "boolean" ? value.effectivePassed : undefined,
      actual: numericField(value, "actual"),
      effectiveActual: numericField(value, "effectiveActual"),
      affectedTestCaseIds: sanitizeStringArray(arrayField(value, "affectedTestCaseIds")),
      affectedResultUuids: sanitizeStringArray(arrayField(value, "affectedResultUuids")),
      effects
    },
    [
      "code",
      "metric",
      "severity",
      "passed",
      "effectivePassed",
      "actual",
      "effectiveActual",
      "affectedTestCaseIds",
      "affectedResultUuids",
      "effects"
    ]
  );
}

function sanitizeDefectMuteRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      id: sanitizeAuditText(stringField(value, "id")),
      status: optionalString(value.status),
      scope: sanitizeDefectMuteScope(value.scope),
      reason: sanitizeAuditText(stringField(value, "reason")),
      origin: sanitizeDefectMuteOrigin(value.origin),
      mutedAt: value.mutedAt,
      affectedSignatureHashes: sanitizeStringArray(arrayField(value, "affectedSignatureHashes")),
      affectedTestIds: sanitizeStringArray(arrayField(value, "affectedTestIds")),
      unmutedAt: value.unmutedAt,
      unmutedBy: sanitizeDefectMuteOrigin(value.unmutedBy),
      unmuteReason:
        typeof value.unmuteReason === "string" ? sanitizeAuditText(value.unmuteReason) : undefined,
      auditEvents: arrayField(value, "auditEvents").map((event) =>
        sanitizeDefectMuteAuditEvent(event)
      )
    },
    [
      "id",
      "status",
      "scope",
      "reason",
      "origin",
      "mutedAt",
      "affectedSignatureHashes",
      "affectedTestIds",
      "unmutedAt",
      "unmutedBy",
      "unmuteReason",
      "auditEvents"
    ]
  );
}

function sanitizeDefectMuteAuditEvent(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return pickDefined(
    {
      id: sanitizeAuditText(stringField(value, "id")),
      type: optionalString(value.type),
      muteId: sanitizeAuditText(stringField(value, "muteId")),
      occurredAt: value.occurredAt,
      origin: sanitizeDefectMuteOrigin(value.origin),
      scope: sanitizeDefectMuteScope(value.scope),
      reason: typeof value.reason === "string" ? sanitizeAuditText(value.reason) : undefined,
      affectedSignatureHashes: sanitizeStringArray(arrayField(value, "affectedSignatureHashes")),
      affectedTestIds: sanitizeStringArray(arrayField(value, "affectedTestIds"))
    },
    [
      "id",
      "type",
      "muteId",
      "occurredAt",
      "origin",
      "scope",
      "reason",
      "affectedSignatureHashes",
      "affectedTestIds"
    ]
  );
}

export function sanitizeDefectMuteScope(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return pickDefined(
    {
      signatureHashes: sanitizeStringArray(arrayField(value, "signatureHashes")),
      testCaseIds: sanitizeStringArray(arrayField(value, "testCaseIds"))
    },
    ["signatureHashes", "testCaseIds"]
  );
}

export function sanitizeDefectMuteOrigin(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.type === "actor") {
    return pickDefined(
      {
        type: "actor",
        actorId: sanitizeAuditText(stringField(value, "actorId"))
      },
      ["type", "actorId"]
    );
  }

  if (value.type === "system") {
    return pickDefined(
      {
        type: "system",
        systemId: sanitizeAuditText(stringField(value, "systemId"))
      },
      ["type", "systemId"]
    );
  }

  return undefined;
}

export function sanitizeDefectMuteEffect(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || value.type !== "defect_mute") {
    return {};
  }

  return pickDefined(
    {
      type: "defect_mute",
      ruleCode: sanitizeAuditText(stringField(value, "ruleCode")),
      reasonCode: sanitizeAuditText(stringField(value, "reasonCode")),
      muteIds: sanitizeStringArray(arrayField(value, "muteIds")),
      affectedTestCaseIds: sanitizeStringArray(arrayField(value, "affectedTestCaseIds")),
      affectedSignatureHashes: sanitizeStringArray(arrayField(value, "affectedSignatureHashes")),
      originalActual: numericField(value, "originalActual"),
      effectiveActual: numericField(value, "effectiveActual"),
      explanation: sanitizeAuditText(stringField(value, "explanation"))
    },
    [
      "type",
      "ruleCode",
      "reasonCode",
      "muteIds",
      "affectedTestCaseIds",
      "affectedSignatureHashes",
      "originalActual",
      "effectiveActual",
      "explanation"
    ]
  );
}

function defectMuteReadPolicy(restPath: string, source: string): Record<string, unknown> {
  return {
    restParity: {
      method: "GET",
      path: restPath,
      source
    },
    equalOrNarrowerThanRest: true,
    mutationAllowed: false,
    rawFailurePayloadsIncluded: false,
    redactionRules: [
      "Only status, scope, audit, and quality-gate effect fields are returned.",
      "Raw failure payloads, traces, attachment blobs, storage paths, and signed URLs are omitted.",
      "Sensitive-looking free text is replaced with [redacted]."
    ]
  };
}
