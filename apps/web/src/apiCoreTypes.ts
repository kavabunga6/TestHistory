import type {
  ArchiveDiagnosticReplayFixtureApiState,
  ArchiveUploadStatusApiState
} from "./apiArchiveTypes.js";
import type {
  AttachmentPreviewRetentionApiState,
  AttachmentPreviewRetentionDryRunScheduleApiState
} from "./apiRetentionTypes.js";
import type {
  DefectMuteProjectionApiState,
  DefectMuteReplayInvariantApiState
} from "./apiDefectMuteTypes.js";
import type { PermissionDeniedError } from "./apiPermissionTypes.js";
import type {
  SecurityAuditExportLifecycleApiState,
  SecurityAuditExportLifecycleInvariantApiState
} from "./apiAuditTypes.js";

export type Capabilities = {
  apiVersion: string;
  swagger: string;
  openapiJson: string;
  ingestion: {
    modes: Array<
      "json-batch" | "chunked-json" | "archive-planned" | "multipart-s3-planned" | string
    >;
    policy: {
      compressionMinBytes: number;
      retentionDays: number;
      maxUploadConcurrency: number;
      chunkBytes: number;
    };
  };
  modules: string[];
};

export type ApiState = {
  archiveDiagnosticReplayFixtures?: ArchiveDiagnosticReplayFixtureApiState;
  archiveUploadStatus?: ArchiveUploadStatusApiState;
  attachmentPreviewRetention?: AttachmentPreviewRetentionApiState;
  attachmentPreviewRetentionSchedule?: AttachmentPreviewRetentionDryRunScheduleApiState;
  securityAuditExportLifecycle?: SecurityAuditExportLifecycleApiState;
  securityAuditExportLifecycleInvariants?: SecurityAuditExportLifecycleInvariantApiState;
  capabilities?: Capabilities;
  defectMuteReplayInvariants?: DefectMuteReplayInvariantApiState;
  defectMuteProjection?: DefectMuteProjectionApiState;
  denied?: PermissionDeniedError;
  error?: string;
  loading: boolean;
};
