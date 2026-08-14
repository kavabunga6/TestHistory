import { attachmentPreviewRetentionRead } from "./mcpAttachmentPreviewRetention.js";
import { attachmentPreviewRetentionScheduleRead } from "./mcpAttachmentPreviewRetentionSchedule.js";
import { archiveStatusRead } from "./mcpArchiveStatus.js";
import { archiveDiagnosticsReplayRead } from "./mcpArchiveDiagnosticsReplay.js";
import { archiveDiagnosticReplayFixturesRead } from "./mcpArchiveDiagnosticReplayFixtures.js";
import { archiveDiagnosticReplayMaterializedFixturesRead } from "./mcpArchiveDiagnosticReplayMaterializedFixtures.js";
import { fetchApiValue } from "./mcpApiClient.js";
import { historyCompareRead } from "./mcpHistoryCompare.js";
import { identityCorrectionAuditRead } from "./mcpIdentityCorrectionAudit.js";
import { securityAuditRead } from "./mcpSecurityAudit.js";
import {
  jsonSearchParam,
  securityAuditExportEvaluateRead,
  securityAuditExportRequestFromSearch
} from "./mcpSecurityAuditExportEvaluation.js";
import { securityAuditExportLifecycleReplayInvariantRead } from "./mcpSecurityAuditExportLifecycle.js";
import {
  summarizeAttachmentPreviewsRead,
  summarizeHistoryRead,
  summarizeLaunchRead,
  summarizeLaunchResultsRead,
  summarizeResultDetailRead,
  summarizeTestCaseRead
} from "./mcpLaunchResourceSummaries.js";
import {
  summarizeDefectMuteStatusRead,
  summarizeQualityGateMuteEffectsRead
} from "./mcpDefectMuteStatus.js";
import { defectMuteProjectionRead } from "./mcpDefectMuteProjection.js";
import { defectMuteProjectionInvariantRead } from "./mcpDefectMuteProjectionInvariant.js";
import { defectMuteProjectionInvariantMaterializedRead } from "./mcpDefectMuteProjectionMaterialized.js";
import { historyComparePermissionAuditRead } from "./mcpPermissionAudit.js";
import { historyComparePermissionAuditInvariantRead } from "./mcpPermissionAuditInvariant.js";
import { parseTestHistoryUri, resourceTextResult } from "./mcpResponses.js";
import type { JsonRpcResponse } from "./mcpTypes.js";
import { invalidParams } from "./mcpRpcUtils.js";
import {
  numberSearchParam,
  optionalBooleanString,
  optionalString,
  withQuery,
  isRecord
} from "./mcpValueUtils.js";

export async function readResource(
  id: string | number | null,
  params: unknown
): Promise<JsonRpcResponse> {
  const uri = isRecord(params) && typeof params.uri === "string" ? params.uri : "";
  if (uri.length === 0) {
    return invalidParams(id, "Missing required string parameter: uri");
  }

  const parsed = parseTestHistoryUri(uri);
  if (typeof parsed === "string") {
    return invalidParams(id, parsed);
  }

  const { apiUrl, parts, searchParams, options } = parsed;
  let value: unknown;

  if (parts.length === 1 && parts[0] === "projects") {
    value = await fetchApiValue(apiUrl, "/api/v1/projects");
  } else if (parts.length === 3 && parts[0] === "projects" && parts[2] === "launches") {
    const projectId = parts[1] ?? "";
    value = await fetchApiValue(
      apiUrl,
      withQuery(`/api/v1/projects/${encodeURIComponent(projectId)}/launches`, {
        status: optionalString(searchParams.get("status")),
        branch: optionalString(searchParams.get("branch"))
      })
    );
  } else if (parts.length === 2 && parts[0] === "launches") {
    const launchId = parts[1] ?? "";
    value = summarizeLaunchRead(
      await fetchApiValue(apiUrl, `/api/v1/launches/${encodeURIComponent(launchId)}`),
      options
    );
  } else if (parts.length === 3 && parts[0] === "launches" && parts[2] === "results") {
    const launchId = parts[1] ?? "";
    value = summarizeLaunchResultsRead(
      await fetchApiValue(apiUrl, `/api/v1/launches/${encodeURIComponent(launchId)}`),
      options
    );
  } else if (parts.length === 4 && parts[0] === "launches" && parts[2] === "results") {
    const launchId = parts[1] ?? "";
    const resultUuid = parts[3] ?? "";
    value = summarizeResultDetailRead(
      await fetchApiValue(
        apiUrl,
        `/api/v1/launches/${encodeURIComponent(launchId)}/results/${encodeURIComponent(resultUuid)}`
      ),
      options
    );
  } else if (
    parts.length === 5 &&
    parts[0] === "launches" &&
    parts[2] === "results" &&
    parts[4] === "attachments"
  ) {
    const launchId = parts[1] ?? "";
    const resultUuid = parts[3] ?? "";
    value = summarizeAttachmentPreviewsRead(
      await fetchApiValue(
        apiUrl,
        `/api/v1/launches/${encodeURIComponent(launchId)}/results/${encodeURIComponent(resultUuid)}`
      ),
      options
    );
  } else if (
    parts.length === 4 &&
    parts[0] === "launches" &&
    parts[2] === "quality-gate" &&
    parts[3] === "mute-effects"
  ) {
    const launchId = parts[1] ?? "";
    value = summarizeQualityGateMuteEffectsRead(
      await fetchApiValue(apiUrl, `/api/v1/launches/${encodeURIComponent(launchId)}/quality-gate`),
      options,
      { launchId }
    );
  } else if (parts.length === 3 && parts[0] === "launches" && parts[2] === "quality-gate") {
    const launchId = parts[1] ?? "";
    value = await fetchApiValue(
      apiUrl,
      `/api/v1/launches/${encodeURIComponent(launchId)}/quality-gate`
    );
  } else if (parts.length === 1 && parts[0] === "test-cases") {
    value = await fetchApiValue(
      apiUrl,
      withQuery("/api/v1/test-cases", {
        projectId: optionalString(searchParams.get("projectId"))
      })
    );
  } else if (parts.length === 2 && parts[0] === "test-cases") {
    const testCaseId = parts[1] ?? "";
    value = summarizeTestCaseRead(
      await fetchApiValue(
        apiUrl,
        withQuery(`/api/v1/test-cases/${encodeURIComponent(testCaseId)}`, {
          projectId: optionalString(searchParams.get("projectId"))
        })
      ),
      options
    );
  } else if (parts.length === 3 && parts[0] === "test-cases" && parts[2] === "history") {
    const testCaseId = parts[1] ?? "";
    value = summarizeHistoryRead(
      await fetchApiValue(
        apiUrl,
        withQuery(`/api/v1/test-cases/${encodeURIComponent(testCaseId)}/history`, {
          projectId: optionalString(searchParams.get("projectId")),
          limit: String(options.limit),
          cursor: options.cursor
        })
      ),
      options
    );
  } else if (
    parts.length === 4 &&
    parts[0] === "test-cases" &&
    parts[2] === "history" &&
    parts[3] === "compare"
  ) {
    const payload = await historyCompareRead({
      apiUrl,
      testCaseId: parts[1] ?? "",
      projectId: optionalString(searchParams.get("projectId")),
      baseResultUuid: optionalString(searchParams.get("baseResultUuid")),
      targetResultUuid: optionalString(searchParams.get("targetResultUuid")),
      includeUnchanged: optionalBooleanString(searchParams.get("includeUnchanged")),
      actorId: optionalString(searchParams.get("actorId")),
      limit: options.limit,
      cursor: options.cursor
    });
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    value = payload;
  } else if (
    parts.length === 5 &&
    parts[0] === "test-cases" &&
    parts[2] === "history" &&
    parts[3] === "compare" &&
    parts[4] === "permission-audit"
  ) {
    const payload = await historyComparePermissionAuditRead({
      apiUrl,
      testCaseId: parts[1] ?? "",
      projectId: optionalString(searchParams.get("projectId")),
      baseResultUuid: optionalString(searchParams.get("baseResultUuid")),
      targetResultUuid: optionalString(searchParams.get("targetResultUuid")),
      actorId: optionalString(searchParams.get("actorId")),
      limit: options.limit,
      cursor: options.cursor
    });
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    value = payload;
  } else if (
    parts.length === 7 &&
    parts[0] === "test-cases" &&
    parts[2] === "history" &&
    parts[3] === "compare" &&
    parts[4] === "permission-audit" &&
    parts[5] === "replay" &&
    parts[6] === "invariants"
  ) {
    const payload = await historyComparePermissionAuditInvariantRead({
      apiUrl,
      testCaseId: parts[1] ?? "",
      projectId: optionalString(searchParams.get("projectId")),
      baseResultUuid: optionalString(searchParams.get("baseResultUuid")),
      targetResultUuid: optionalString(searchParams.get("targetResultUuid")),
      actorId: optionalString(searchParams.get("actorId")),
      limit: options.limit,
      cursor: options.cursor
    });
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    value = payload;
  } else if (
    parts.length === 8 &&
    parts[0] === "test-cases" &&
    parts[2] === "history" &&
    parts[3] === "compare" &&
    parts[4] === "permission-audit" &&
    parts[5] === "replay" &&
    parts[6] === "invariants" &&
    parts[7] === "persisted"
  ) {
    const payload = await historyComparePermissionAuditInvariantRead(
      {
        apiUrl,
        testCaseId: parts[1] ?? "",
        projectId: optionalString(searchParams.get("projectId")),
        baseResultUuid: optionalString(searchParams.get("baseResultUuid")),
        targetResultUuid: optionalString(searchParams.get("targetResultUuid")),
        actorId: optionalString(searchParams.get("actorId")),
        limit: options.limit,
        cursor: options.cursor
      },
      "persisted"
    );
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    value = payload;
  } else if (
    parts.length === 4 &&
    parts[0] === "projects" &&
    parts[2] === "identity-corrections" &&
    parts[3] === "audit"
  ) {
    const payload = await identityCorrectionAuditRead({
      apiUrl,
      projectId: parts[1] ?? "",
      actorId: optionalString(searchParams.get("actorId")),
      originType: optionalString(searchParams.get("originType")),
      kind: optionalString(searchParams.get("kind")),
      beforeId: optionalString(searchParams.get("beforeId")),
      afterId: optionalString(searchParams.get("afterId")),
      parameterVariantSignature: optionalString(searchParams.get("parameterVariantSignature")),
      limit: options.limit,
      cursor: options.cursor
    });
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    value = payload;
  } else if (parts.length === 1 && parts[0] === "defect-mutes") {
    const projectId = optionalString(searchParams.get("projectId"));
    if (projectId === undefined) {
      return invalidParams(id, "projectId is required for defect mute status reads");
    }
    value = summarizeDefectMuteStatusRead(
      await fetchApiValue(
        apiUrl,
        withQuery("/api/v1/defects", {
          projectId
        })
      ),
      options,
      { projectId }
    );
  } else if (
    parts.length === 4 &&
    parts[0] === "projects" &&
    parts[2] === "defect-mutes" &&
    parts[3] === "projection"
  ) {
    const payload = await defectMuteProjectionRead({
      apiUrl,
      projectId: parts[1] ?? "",
      actorId: optionalString(searchParams.get("actorId")),
      launchId: optionalString(searchParams.get("launchId")),
      status: optionalString(searchParams.get("status")),
      limit: options.limit,
      cursor: options.cursor
    });
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    value = payload;
  } else if (
    parts.length === 5 &&
    parts[0] === "projects" &&
    parts[2] === "defect-mutes" &&
    parts[3] === "projection" &&
    parts[4] === "replay"
  ) {
    const payload = await defectMuteProjectionRead({
      apiUrl,
      projectId: parts[1] ?? "",
      actorId: optionalString(searchParams.get("actorId")),
      launchId: optionalString(searchParams.get("launchId")),
      status: optionalString(searchParams.get("status")),
      limit: options.limit,
      cursor: options.cursor
    });
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    value = payload;
  } else if (
    parts.length === 6 &&
    parts[0] === "projects" &&
    parts[2] === "defect-mutes" &&
    parts[3] === "projection" &&
    parts[4] === "replay" &&
    parts[5] === "invariants"
  ) {
    const payload = await defectMuteProjectionInvariantRead({
      apiUrl,
      projectId: parts[1] ?? "",
      actorId: optionalString(searchParams.get("actorId")),
      limit: options.limit,
      cursor: options.cursor
    });
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    value = payload;
  } else if (
    parts.length === 7 &&
    parts[0] === "projects" &&
    parts[2] === "defect-mutes" &&
    parts[3] === "projection" &&
    parts[4] === "replay" &&
    parts[5] === "invariants" &&
    parts[6] === "materialized"
  ) {
    const payload = await defectMuteProjectionInvariantMaterializedRead({
      apiUrl,
      projectId: parts[1] ?? "",
      actorId: optionalString(searchParams.get("actorId")),
      limit: options.limit,
      cursor: options.cursor
    });
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    value = payload;
  } else if (parts.length === 2 && parts[0] === "security" && parts[1] === "audit") {
    const payload = await securityAuditRead({
      apiUrl,
      projectId: optionalString(searchParams.get("projectId")),
      type: optionalString(searchParams.get("type")),
      outcome: optionalString(searchParams.get("outcome")),
      severity: optionalString(searchParams.get("severity")),
      limit: options.limit,
      cursor: options.cursor
    });
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    value = payload;
  } else if (
    parts.length === 4 &&
    parts[0] === "security" &&
    parts[1] === "audit" &&
    parts[2] === "export" &&
    parts[3] === "evaluate"
  ) {
    const payload = await securityAuditExportEvaluateRead({
      apiUrl,
      request: securityAuditExportRequestFromSearch(searchParams),
      policy: jsonSearchParam(searchParams, "policy")
    });
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    value = payload;
  } else if (
    parts.length === 8 &&
    parts[0] === "projects" &&
    parts[2] === "security" &&
    parts[3] === "audit" &&
    parts[4] === "export" &&
    parts[5] === "lifecycle" &&
    parts[6] === "replay" &&
    parts[7] === "invariants"
  ) {
    const payload = await securityAuditExportLifecycleReplayInvariantRead({
      apiUrl,
      projectId: parts[1] ?? "",
      actorId: optionalString(searchParams.get("actorId")),
      limit: options.limit,
      cursor: options.cursor
    });
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    value = payload;
  } else if (
    parts.length === 9 &&
    parts[0] === "projects" &&
    parts[2] === "security" &&
    parts[3] === "audit" &&
    parts[4] === "export" &&
    parts[5] === "lifecycle" &&
    parts[6] === "replay" &&
    parts[7] === "invariants" &&
    parts[8] === "materialized"
  ) {
    const payload = await securityAuditExportLifecycleReplayInvariantRead(
      {
        apiUrl,
        projectId: parts[1] ?? "",
        actorId: optionalString(searchParams.get("actorId")),
        limit: options.limit,
        cursor: options.cursor
      },
      "materialized"
    );
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    value = payload;
  } else if (
    parts.length === 5 &&
    parts[0] === "launches" &&
    parts[2] === "uploads" &&
    parts[3] === "archive" &&
    parts[4] === "status"
  ) {
    const payload = await archiveStatusRead({
      apiUrl,
      projectId: optionalString(searchParams.get("projectId")),
      actorId: optionalString(searchParams.get("actorId")),
      launchId: parts[1] ?? "",
      status: optionalString(searchParams.get("status")),
      limit: options.limit,
      cursor: options.cursor,
      diagnosticsLimit: numberSearchParam(searchParams, "diagnosticsLimit"),
      diagnosticsCursor: optionalString(searchParams.get("diagnosticsCursor"))
    });
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    value = payload;
  } else if (
    parts.length === 5 &&
    parts[0] === "launches" &&
    parts[2] === "archive" &&
    parts[3] === "diagnostics" &&
    parts[4] === "replay"
  ) {
    const payload = await archiveDiagnosticsReplayRead({
      apiUrl,
      launchId: parts[1] ?? "",
      projectId: optionalString(searchParams.get("projectId")),
      actorId: optionalString(searchParams.get("actorId")),
      archiveRef: optionalString(searchParams.get("archiveRef")),
      limit: options.limit,
      cursor: options.cursor
    });
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    value = payload;
  } else if (
    parts.length === 6 &&
    parts[0] === "projects" &&
    parts[2] === "archive" &&
    parts[3] === "diagnostics" &&
    parts[4] === "replay" &&
    parts[5] === "fixtures"
  ) {
    const payload = await archiveDiagnosticReplayFixturesRead({
      apiUrl,
      projectId: parts[1] ?? "",
      actorId: optionalString(searchParams.get("actorId")),
      limit: options.limit,
      cursor: options.cursor
    });
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    value = payload;
  } else if (
    parts.length === 7 &&
    parts[0] === "projects" &&
    parts[2] === "archive" &&
    parts[3] === "diagnostics" &&
    parts[4] === "replay" &&
    parts[5] === "fixtures" &&
    parts[6] === "materialized"
  ) {
    const payload = await archiveDiagnosticReplayMaterializedFixturesRead({
      apiUrl,
      projectId: parts[1] ?? "",
      actorId: optionalString(searchParams.get("actorId")),
      limit: options.limit,
      cursor: options.cursor
    });
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    value = payload;
  } else if (
    parts.length === 5 &&
    parts[0] === "launches" &&
    parts[2] === "attachment-previews" &&
    parts[3] === "retention" &&
    parts[4] === "preview"
  ) {
    const payload = await attachmentPreviewRetentionRead({
      apiUrl,
      launchId: parts[1] ?? "",
      projectId: optionalString(searchParams.get("projectId")),
      actorId: optionalString(searchParams.get("actorId")),
      status: optionalString(searchParams.get("status")),
      limit: options.limit,
      cursor: options.cursor,
      batchSize: numberSearchParam(searchParams, "batchSize")
    });
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    value = payload;
  } else if (
    parts.length === 6 &&
    parts[0] === "launches" &&
    parts[2] === "attachment-previews" &&
    parts[3] === "retention" &&
    parts[4] === "dry-run" &&
    parts[5] === "schedule"
  ) {
    const payload = await attachmentPreviewRetentionScheduleRead({
      apiUrl,
      launchId: parts[1] ?? "",
      projectId: optionalString(searchParams.get("projectId")),
      actorId: optionalString(searchParams.get("actorId")),
      scheduleDigest: optionalString(searchParams.get("scheduleDigest")),
      limit: options.limit,
      cursor: options.cursor
    });
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    value = payload;
  } else if (
    parts.length === 4 &&
    parts[0] === "uploads" &&
    parts[2] === "archive" &&
    parts[3] === "status"
  ) {
    const payload = await archiveStatusRead({
      apiUrl,
      projectId: optionalString(searchParams.get("projectId")),
      actorId: optionalString(searchParams.get("actorId")),
      uploadId: parts[1] ?? "",
      limit: options.limit,
      cursor: options.cursor,
      diagnosticsLimit: numberSearchParam(searchParams, "diagnosticsLimit"),
      diagnosticsCursor: optionalString(searchParams.get("diagnosticsCursor"))
    });
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    value = payload;
  } else if (parts.length === 1 && parts[0] === "defects") {
    value = await fetchApiValue(apiUrl, "/api/v1/defects");
  } else {
    return invalidParams(id, `Unsupported TestHistory resource URI: ${uri}`);
  }

  return resourceTextResult(id, uri, value);
}
