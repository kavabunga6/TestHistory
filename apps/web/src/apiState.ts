import type { ApiState, Capabilities } from "./apiTypes.js";
import {
  loadArchiveDiagnosticReplayFixtureState,
  loadArchiveUploadStatusState
} from "./apiArchiveState.js";
import {
  loadAttachmentPreviewRetentionDryRunScheduleState,
  loadAttachmentPreviewRetentionState
} from "./apiRetentionState.js";
import {
  loadDefectMuteProjectionState,
  loadDefectMuteReplayInvariantState
} from "./apiDefectMuteState.js";
import { getJson } from "./apiHttp.js";
import { PermissionDeniedHttpError } from "./apiPermissions.js";
import { loadSecurityAuditExportLifecycleInvariantState } from "./apiSecurityAuditState.js";

export async function loadApiState(projectId?: string): Promise<ApiState> {
  try {
    const capabilities = await getJson<Capabilities>("/api/v1/capabilities");
    const archiveDiagnosticReplayFixtures =
      await loadArchiveDiagnosticReplayFixtureState(projectId);
    const archiveUploadStatus = await loadArchiveUploadStatusState(projectId);
    const defectMuteProjection = await loadDefectMuteProjectionState(projectId);
    const defectMuteReplayInvariants = await loadDefectMuteReplayInvariantState(projectId);
    const attachmentPreviewRetention = await loadAttachmentPreviewRetentionState(projectId);
    const attachmentPreviewRetentionSchedule =
      await loadAttachmentPreviewRetentionDryRunScheduleState(projectId);
    const securityAuditExportLifecycleInvariants =
      await loadSecurityAuditExportLifecycleInvariantState(projectId);

    return {
      archiveDiagnosticReplayFixtures,
      archiveUploadStatus,
      attachmentPreviewRetention,
      attachmentPreviewRetentionSchedule,
      capabilities,
      defectMuteReplayInvariants,
      defectMuteProjection,
      securityAuditExportLifecycleInvariants,
      loading: false
    };
  } catch (error) {
    if (error instanceof PermissionDeniedHttpError) {
      return {
        loading: false,
        denied: error.denied
      };
    }

    return {
      loading: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
