import { attachmentPreviewRetentionRead } from "./mcpAttachmentPreviewRetention.js";
import { attachmentPreviewRetentionScheduleRead } from "./mcpAttachmentPreviewRetentionSchedule.js";
import { archiveStatusRead } from "./mcpArchiveStatus.js";
import { archiveDiagnosticsReplayRead } from "./mcpArchiveDiagnosticsReplay.js";
import { archiveDiagnosticReplayFixturesRead } from "./mcpArchiveDiagnosticReplayFixtures.js";
import { archiveDiagnosticReplayMaterializedFixturesRead } from "./mcpArchiveDiagnosticReplayMaterializedFixtures.js";
import { fetchApiJson, fetchApiValue } from "./mcpApiClient.js";
import { recentFailures } from "./mcpCompactReadModels.js";
import { historyCompareRead } from "./mcpHistoryCompare.js";
import { identityCorrectionAuditRead } from "./mcpIdentityCorrectionAudit.js";
import { securityAuditRead } from "./mcpSecurityAudit.js";
import { securityAuditExportEvaluateRead } from "./mcpSecurityAuditExportEvaluation.js";
import { securityAuditExportLifecycleReplayInvariantRead } from "./mcpSecurityAuditExportLifecycle.js";
import { summarizeHistoryRead, summarizeLaunchRead } from "./mcpLaunchResourceSummaries.js";
import { defectMuteRead } from "./mcpDefectMuteStatus.js";
import { defectMuteProjectionRead } from "./mcpDefectMuteProjection.js";
import { defectMuteProjectionInvariantRead } from "./mcpDefectMuteProjectionInvariant.js";
import { defectMuteProjectionInvariantMaterializedRead } from "./mcpDefectMuteProjectionMaterialized.js";
import { historyComparePermissionAuditRead } from "./mcpPermissionAudit.js";
import { historyComparePermissionAuditInvariantRead } from "./mcpPermissionAuditInvariant.js";
import { compactOptions } from "./mcpReadOptions.js";
import { discoveryCatalog } from "./mcpDiscoveryCatalog.js";
import { qualityGateRules } from "./mcpQualityGateRules.js";
import { jsonTextResult, textResult } from "./mcpResponses.js";
import { schemas, type SchemaName } from "./mcpSchemas.js";
import type { JsonRpcResponse } from "./mcpTypes.js";
import { uploadPolicy } from "./mcpUploadPolicy.js";
import { uploadSessionSchema } from "./mcpUploadSessionSchema.js";
import { invalidParams } from "./mcpRpcUtils.js";
import {
  getRequiredString,
  isRecord,
  optionalString,
  searchQueryArguments,
  withQuery
} from "./mcpValueUtils.js";

export async function callTool(
  id: string | number | null,
  params: unknown
): Promise<JsonRpcResponse> {
  const toolName = isRecord(params) && typeof params.name === "string" ? params.name : "";
  const argumentsValue = isRecord(params) && isRecord(params.arguments) ? params.arguments : {};

  if (toolName === "testhistory.health") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({ status: "ok", service: "testhistory-mcp" })
          }
        ]
      }
    };
  }

  if (toolName === "testhistory.openapi") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: "docs/openapi/openapi.yaml"
          }
        ]
      }
    };
  }

  if (toolName === "testhistory.discovery") {
    return jsonTextResult(id, discoveryCatalog);
  }

  if (toolName === "testhistory.schemas") {
    const schemaName =
      typeof argumentsValue.schema === "string" ? argumentsValue.schema : undefined;
    if (schemaName !== undefined) {
      if (isSchemaName(schemaName)) {
        return jsonTextResult(id, schemas[schemaName]);
      }
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: `Unknown schema: ${schemaName}` }
      };
    }
    return jsonTextResult(id, schemas);
  }

  if (toolName === "testhistory.capabilities") {
    return textResult(id, await fetchApiJson(argumentsValue.apiUrl, "/api/v1/capabilities"));
  }

  if (toolName === "testhistory.projects.find") {
    return textResult(
      id,
      await fetchApiJson(
        argumentsValue.apiUrl,
        withQuery("/api/v1/projects", searchQueryArguments(argumentsValue))
      )
    );
  }

  if (toolName === "testhistory.launch.get") {
    const launchId = getRequiredString(argumentsValue, "launchId");
    if (launchId.error !== undefined) {
      return invalidParams(id, launchId.error);
    }
    return textResult(
      id,
      await fetchApiJson(
        argumentsValue.apiUrl,
        `/api/v1/launches/${encodeURIComponent(launchId.value)}`
      )
    );
  }

  if (toolName === "testhistory.launch.quality-gate") {
    const launchId = getRequiredString(argumentsValue, "launchId");
    if (launchId.error !== undefined) {
      return invalidParams(id, launchId.error);
    }
    return textResult(
      id,
      await fetchApiJson(
        argumentsValue.apiUrl,
        `/api/v1/launches/${encodeURIComponent(launchId.value)}/quality-gate`,
        {
          method: "POST"
        }
      )
    );
  }

  if (toolName === "testhistory.launch.summarize") {
    const launchId = getRequiredString(argumentsValue, "launchId");
    if (launchId.error !== undefined) {
      return invalidParams(id, launchId.error);
    }
    const value = await fetchApiValue(
      argumentsValue.apiUrl,
      `/api/v1/launches/${encodeURIComponent(launchId.value)}`
    );
    return jsonTextResult(id, summarizeLaunchRead(value, compactOptions(argumentsValue)));
  }

  if (toolName === "testhistory.failures.recent") {
    return jsonTextResult(id, await recentFailures(argumentsValue));
  }

  if (toolName === "testhistory.test-cases.list" || toolName === "testhistory.test-cases.find") {
    return textResult(
      id,
      await fetchApiJson(
        argumentsValue.apiUrl,
        withQuery("/api/v1/test-cases", {
          projectId: optionalString(argumentsValue.projectId),
          ...searchQueryArguments(argumentsValue)
        })
      )
    );
  }

  if (toolName === "testhistory.test-case.history") {
    const testCaseId = getRequiredString(argumentsValue, "testCaseId");
    if (testCaseId.error !== undefined) {
      return invalidParams(id, testCaseId.error);
    }
    const value = await fetchApiValue(
      argumentsValue.apiUrl,
      withQuery(`/api/v1/test-cases/${encodeURIComponent(testCaseId.value)}/history`, {
        projectId: optionalString(argumentsValue.projectId),
        limit: String(compactOptions(argumentsValue).limit),
        cursor: optionalString(argumentsValue.cursor)
      })
    );
    return jsonTextResult(id, summarizeHistoryRead(value, compactOptions(argumentsValue)));
  }

  if (toolName === "testhistory.test-case.history.compare") {
    const payload = await historyCompareRead(argumentsValue);
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    return jsonTextResult(id, payload);
  }

  if (toolName === "testhistory.test-case.history.compare.permission-audit") {
    const payload = await historyComparePermissionAuditRead(argumentsValue);
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    return jsonTextResult(id, payload);
  }

  if (
    toolName === "testhistory.test-case.history.compare.permission-audit.replay.invariants.read"
  ) {
    const payload = await historyComparePermissionAuditInvariantRead(argumentsValue);
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    return jsonTextResult(id, payload);
  }

  if (
    toolName ===
    "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.read"
  ) {
    const payload = await historyComparePermissionAuditInvariantRead(argumentsValue, "persisted");
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    return jsonTextResult(id, payload);
  }

  if (toolName === "testhistory.test-case.get") {
    const testCaseId = getRequiredString(argumentsValue, "testCaseId");
    if (testCaseId.error !== undefined) {
      return invalidParams(id, testCaseId.error);
    }
    return textResult(
      id,
      await fetchApiJson(
        argumentsValue.apiUrl,
        withQuery(`/api/v1/test-cases/${encodeURIComponent(testCaseId.value)}`, {
          projectId: optionalString(argumentsValue.projectId)
        })
      )
    );
  }

  if (toolName === "testhistory.identity-corrections.audit") {
    const payload = await identityCorrectionAuditRead(argumentsValue);
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    return jsonTextResult(id, payload);
  }

  if (toolName === "testhistory.defect-mutes.find") {
    const payload = await defectMuteRead(argumentsValue);
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    return jsonTextResult(id, payload);
  }

  if (
    toolName === "testhistory.defect-mute-projection.read" ||
    toolName === "testhistory.defect-mute-projection.replay.read"
  ) {
    const payload = await defectMuteProjectionRead(argumentsValue);
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    return jsonTextResult(id, payload);
  }

  if (toolName === "testhistory.defect-mute-projection.replay.invariants.read") {
    const payload = await defectMuteProjectionInvariantRead(argumentsValue);
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    return jsonTextResult(id, payload);
  }

  if (toolName === "testhistory.defect-mute-projection.replay.invariants.materialized.read") {
    const payload = await defectMuteProjectionInvariantMaterializedRead(argumentsValue);
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    return jsonTextResult(id, payload);
  }

  if (toolName === "testhistory.security-audit.read") {
    const payload = await securityAuditRead(argumentsValue);
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    return jsonTextResult(id, payload);
  }

  if (toolName === "testhistory.security-audit.export.evaluate") {
    const payload = await securityAuditExportEvaluateRead(argumentsValue);
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    return jsonTextResult(id, payload);
  }

  if (toolName === "testhistory.security-audit.export.lifecycle.replay.invariants.read") {
    const payload = await securityAuditExportLifecycleReplayInvariantRead(argumentsValue);
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    return jsonTextResult(id, payload);
  }

  if (
    toolName === "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.read"
  ) {
    const payload = await securityAuditExportLifecycleReplayInvariantRead(
      argumentsValue,
      "materialized"
    );
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    return jsonTextResult(id, payload);
  }

  if (toolName === "testhistory.archive-status.read") {
    const payload = await archiveStatusRead(argumentsValue);
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    return jsonTextResult(id, payload);
  }

  if (toolName === "testhistory.archive-diagnostics.replay.read") {
    const payload = await archiveDiagnosticsReplayRead(argumentsValue);
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    return jsonTextResult(id, payload);
  }

  if (toolName === "testhistory.archive-diagnostics.replay.fixtures.read") {
    const payload = await archiveDiagnosticReplayFixturesRead(argumentsValue);
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    return jsonTextResult(id, payload);
  }

  if (toolName === "testhistory.archive-diagnostics.replay.fixtures.materialized.read") {
    const payload = await archiveDiagnosticReplayMaterializedFixturesRead(argumentsValue);
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    return jsonTextResult(id, payload);
  }

  if (toolName === "testhistory.attachment-preview-retention.preview") {
    const payload = await attachmentPreviewRetentionRead(argumentsValue);
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    return jsonTextResult(id, payload);
  }

  if (toolName === "testhistory.attachment-preview-retention.dry-run.schedule.read") {
    const payload = await attachmentPreviewRetentionScheduleRead(argumentsValue);
    if (typeof payload === "string") {
      return invalidParams(id, payload);
    }
    return jsonTextResult(id, payload);
  }

  if (toolName === "testhistory.test-results.find") {
    const launchId = getRequiredString(argumentsValue, "launchId");
    if (launchId.error !== undefined) {
      return invalidParams(id, launchId.error);
    }
    return textResult(
      id,
      await fetchApiJson(
        argumentsValue.apiUrl,
        withQuery(
          `/api/v1/launches/${encodeURIComponent(launchId.value)}`,
          searchQueryArguments(argumentsValue)
        )
      )
    );
  }

  if (toolName === "testhistory.test-result.get") {
    const launchId = getRequiredString(argumentsValue, "launchId");
    if (launchId.error !== undefined) {
      return invalidParams(id, launchId.error);
    }
    const resultUuid = getRequiredString(argumentsValue, "resultUuid");
    if (resultUuid.error !== undefined) {
      return invalidParams(id, resultUuid.error);
    }
    return textResult(
      id,
      await fetchApiJson(
        argumentsValue.apiUrl,
        `/api/v1/launches/${encodeURIComponent(launchId.value)}/results/${encodeURIComponent(
          resultUuid.value
        )}`
      )
    );
  }

  if (toolName === "testhistory.upload.policy") {
    return jsonTextResult(id, uploadPolicy);
  }

  if (toolName === "testhistory.upload.session.schema") {
    return jsonTextResult(id, uploadSessionSchema);
  }

  if (toolName === "testhistory.quality-gate.rules") {
    return jsonTextResult(id, qualityGateRules);
  }

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32602, message: `Unknown tool: ${toolName}` }
  };
}

function isSchemaName(value: string): value is SchemaName {
  return Object.hasOwn(schemas, value);
}
