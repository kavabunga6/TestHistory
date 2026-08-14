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

export async function loadApiState(): Promise<ApiState> {
  try {
    const capabilities = await getJson<Capabilities>("/api/v1/capabilities");
    const archiveDiagnosticReplayFixtures = await loadArchiveDiagnosticReplayFixtureState();
    const archiveUploadStatus = await loadArchiveUploadStatusState();
    const defectMuteProjection = await loadDefectMuteProjectionState();
    const defectMuteReplayInvariants = await loadDefectMuteReplayInvariantState();
    const attachmentPreviewRetention = await loadAttachmentPreviewRetentionState();
    const attachmentPreviewRetentionSchedule =
      await loadAttachmentPreviewRetentionDryRunScheduleState();
    const securityAuditExportLifecycleInvariants =
      await loadSecurityAuditExportLifecycleInvariantState();

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
