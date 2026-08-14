import type {
  AnalyticsMaterializeJobPayload,
  ArtifactCleanupJobPayload,
  IngestionParseJobPayload,
  TestCaseSyncJobPayload
} from "@testhistory/contracts";
import type {
  AttachmentPreviewRetentionDryRunArtifactScheduleDescriptors,
  ArtifactDescriptor
} from "@testhistory/artifacts";
import type {
  HistoryComparePermissionAuditDecision,
  HistoryComparePermissionAuditEvent,
  HistoryComparePermissionAuditReplayDiagnostic
} from "@testhistory/domain";

import type {
  WorkerJob,
  PipelineStatusTransition,
  RetrySafePipelineSummary,
  LaunchClosePipelinePlan,
  TestCaseSyncPipelinePlan,
  AnalyticsMaterializePipelinePlan,
  AnalyticsProjectionResult,
  SearchIndexProjectionAdapter
} from "./workerTypesPart01.js";
import type {
  DefectMuteProjectionAdapter,
  ArtifactPreviewGenerationSource,
  ArtifactPreviewDescriptorStoreAdapter,
  ArtifactPreviewRetentionDescriptorSource
} from "./workerTypesPart02.js";

export type AttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationRecord = {
  scheduleRef: string;
  scheduleDigest: string;
  index: number;
  descriptorCount: number;
  scheduledAfterMinutes: number;
  maxDescriptors: number;
  totalPreviewBytes: number;
  descriptorRefs: string[];
  descriptorDigests: string[];
  omittedDescriptorRefCount: number;
  dryRun: true;
  executionMode: "dry-run";
  mutationAllowed: false;
  deletionExecution: false;
  deleteRequestedCount: 0;
  safety: {
    bounded: true;
    descriptorOnly: true;
    closedLaunchScope: true;
    pathIncluded: false;
    storageKeyIncluded: false;
    objectTargetIncluded: false;
    rawPayloadIncluded: false;
    blobIncluded: false;
    signedUrlIncluded: false;
    credentialIncluded: false;
    mutationAllowed: false;
  };
};

export type AttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationPlan = {
  boundary: "worker-local-attachment-preview-retention-dry-run-schedule-materialization";
  consistency: "retry-safe-idempotent-descriptor-schedule-materialization";
  scope: "closed-launches";
  dryRun: true;
  readOnly: true;
  executionMode: "dry-run";
  mutationAllowed: false;
  deletionExecution: false;
  deleteRequestedCount: 0;
  transitions: PipelineStatusTransition[];
  records: AttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationRecord[];
  summary: RetrySafePipelineSummary & {
    schema: AttachmentPreviewRetentionDryRunArtifactScheduleDescriptors["schema"];
    sourceScheduleDigest: string;
    scannedArtifactCount: number;
    stagedCandidateCount: number;
    descriptorCount: number;
    materializedDescriptorCount: number;
    scheduleDescriptorCount: number;
    skippedOpenLaunchRecords: number;
    skippedNonAttachmentRecords: number;
    retainedRecordCount: number;
    totalDescriptorPreviewBytes: number;
    scheduleDigest: string;
    plannedOperations: readonly [
      "artifact.preview.retention.dry-run.schedule.describe",
      "artifact.preview.retention.dry-run.schedule.materialize"
    ];
  };
};

export type ArchiveIntakeManifestEntryKind =
  "result" | "container" | "metadata" | "attachment" | "directory" | "unsupported";

export type ArchiveIntakeManifestEntry = {
  path: string;
  kind?: ArchiveIntakeManifestEntryKind;
  sizeBytes?: number;
  compressedBytes?: number;
  contentType?: string;
  sha256?: string;
  processingError?: {
    code?: string;
    retryable?: boolean;
  };
};

export type ArchiveIntakeManifest = {
  format: "allure-archive-manifest";
  archiveId?: string;
  chunkSize?: number;
  parserDiagnostics?: readonly string[];
  entries: readonly ArchiveIntakeManifestEntry[];
};

export type ArchiveManifestIngestionPayload = IngestionParseJobPayload & {
  archiveManifest?: ArchiveIntakeManifest;
};

export type ArchiveParserManifestEntryKind =
  | "result"
  | "container"
  | "environment"
  | "executor"
  | "categories"
  | "history"
  | "attachment"
  | "unsupported";

export type ArchiveParserManifestEntry = {
  path: string;
  kind?: ArchiveParserManifestEntryKind;
  ignored?: boolean;
  reason?: string;
  sizeBytes?: number;
  compressedSizeBytes?: number;
};

export type ArchiveParserManifest = {
  format: "allure-results-archive-manifest";
  entries: readonly ArchiveParserManifestEntry[];
  warnings?: readonly string[];
  diagnostics?: readonly string[];
};

export type ArchiveIntakeEntryStatus =
  "planned" | "skipped" | "rejected" | "retryable-error" | "terminal-error";

export type ArchiveIntakeEntryPlan = {
  entryRef: string;
  pathHash: string;
  extension: string;
  kind: ArchiveIntakeManifestEntryKind;
  status: ArchiveIntakeEntryStatus;
  chunkRef?: string;
  sizeBytes: number | null;
  compressedBytes: number | null;
  contentType: string | null;
  digestAvailable: boolean;
  reason?: string;
};

export type ArchiveIntakeChunkPlan = {
  chunkRef: string;
  index: number;
  entryCount: number;
  totalSizeBytes: number;
  totalCompressedBytes: number;
  status: "planned" | "retryable-error";
  retryableEntryErrorCount: number;
};

export type ArchiveIntakeDiagnostic = {
  code:
    | "duplicate-entry"
    | "unsafe-entry-path"
    | "unsupported-entry"
    | "entry-processing-error"
    | "parser-diagnostic"
    | "diagnostic-limit-reached";
  severity: "info" | "warn" | "error";
  retryable: boolean;
  entryRef?: string;
  chunkRef?: string;
  message: string;
};

export type ArchiveIntakeMetadataSummary = {
  boundary: "wip-archive-manifest-worker-no-unzip";
  entryCount: number;
  plannedEntryCount: number;
  chunkCount: number;
  rejectedEntryCount: number;
  unsupportedEntryCount: number;
  retryableEntryErrorCount: number;
  totalSizeBytes: number;
  totalCompressedBytes: number;
  idempotencyDigest: string;
};

export type ArchiveIntakeExecutionPlan = {
  boundary: "wip-archive-manifest-worker-no-unzip";
  consistency: "retry-safe-idempotent-entry-plan";
  transitions: PipelineStatusTransition[];
  chunks: ArchiveIntakeChunkPlan[];
  entries: ArchiveIntakeEntryPlan[];
  diagnostics: ArchiveIntakeDiagnostic[];
  summary: ArchiveIntakeMetadataSummary & {
    projectId: string;
    launchId: string;
    archiveRef: string;
    sourceFormat: IngestionParseJobPayload["source"]["format"];
    plannedOperations: readonly ["archive.manifest.read", "archive.entries.plan"];
  };
};

export type ArchiveDiagnosticReplaySource =
  "archive.status.read" | "archive.diagnostics.read" | "archive.cleanup.preview";

export type ArchiveDiagnosticReplayEvent = {
  id: string;
  projectId: string;
  launchId: string;
  archiveRef: string;
  occurredAt: string;
  source: ArchiveDiagnosticReplaySource;
  launchState: "closed" | "open";
  code: ArchiveIntakeDiagnostic["code"] | "archive-status-read";
  severity: ArchiveIntakeDiagnostic["severity"];
  retryable: boolean;
  entryRef?: string;
  chunkRef?: string;
  message?: string;
  rawPath?: string;
  storageRef?: string;
  signedUrl?: string;
  token?: string;
};

export type ArchiveDiagnosticReplayRecord = {
  eventRef: string;
  projectId: string;
  launchId: string;
  archiveRef: string;
  source: ArchiveDiagnosticReplaySource;
  code: ArchiveDiagnosticReplayEvent["code"];
  severity: ArchiveDiagnosticReplayEvent["severity"];
  retryable: boolean;
  occurredAt: string;
  entryRef?: string;
  chunkRef?: string;
};

export type ArchiveDiagnosticReplayDiagnostic = {
  code: "duplicate-event" | "open-launch-event" | "out-of-scope-event" | "invalid-event";
  severity: "info" | "warn" | "error";
  retryable: false;
  eventRef?: string;
  message: string;
};

export type ArchiveDiagnosticReplaySummary = {
  projectId: string;
  launchId: string;
  archiveRef: string;
  eventCount: number;
  acceptedEventCount: number;
  duplicateEventCount: number;
  rejectedOpenLaunchEventCount: number;
  rejectedOutOfScopeEventCount: number;
  invalidEventCount: number;
  retryableEventCount: number;
  severityCounts: Record<ArchiveDiagnosticReplayEvent["severity"], number>;
  sourceCounts: Record<ArchiveDiagnosticReplaySource, number>;
  replayDigest: string;
  closedArchiveStatusReadCompatible: true;
  closedArchiveDiagnosticsReadCompatible: true;
  mutationBoundary: "worker-replay-only-no-rest-or-ui-claims";
};

export type ArchiveDiagnosticReplayPlan = {
  boundary: "worker-local-archive-diagnostics-replay";
  consistency: "retry-safe-idempotent-synthetic-evidence";
  transitions: PipelineStatusTransition[];
  records: ArchiveDiagnosticReplayRecord[];
  diagnostics: ArchiveDiagnosticReplayDiagnostic[];
  summary: ArchiveDiagnosticReplaySummary;
};

export type ArchiveDiagnosticReplayApplyResult = ArchiveDiagnosticReplaySummary & {
  adapterKind: "in-memory-archive-diagnostics-replay-wip";
  boundary: "worker-local-archive-diagnostics-replay";
  consistency: "append-only-idempotent-replay";
  appliedAt: string;
  idempotencyKeyHash: string;
  receivedEventCount: number;
  appendedEventCount: number;
  unchangedEventCount: number;
  totalStoredEventCount: number;
};

export type ArchiveDiagnosticReplayProjection = {
  projectId: string;
  launchId: string;
  archiveRef: string;
  records: ArchiveDiagnosticReplayRecord[];
  summary: ArchiveDiagnosticReplaySummary;
};

export type ArchiveDiagnosticReplayAdapter = {
  kind: "in-memory-archive-diagnostics-replay-wip";
  applyEvents: (input: {
    projectId: string;
    launchId: string;
    archiveRef: string;
    events: readonly ArchiveDiagnosticReplayEvent[];
    replayDigest: string;
    at: string;
  }) => ArchiveDiagnosticReplayApplyResult;
  getProjection: (input: {
    projectId: string;
    launchId: string;
    archiveRef: string;
  }) => ArchiveDiagnosticReplayProjection;
  snapshot: () => ArchiveDiagnosticReplayProjection[];
};

export type HistoryComparePermissionAuditMaterializationDiagnostic = {
  code:
    | HistoryComparePermissionAuditReplayDiagnostic["code"]
    | "history_compare_permission.test_case_scope_event_ignored";
  severity: "info" | "warn";
  retryable: false;
  eventRef: string;
  compareId: string;
  projectId: string;
  testCaseId: string;
  actorId: string;
  expectedProjectId?: string;
  expectedTestCaseId?: string;
  expectedActorId?: string;
  message: string;
};

export type HistoryComparePermissionAuditSnapshotRecord = {
  snapshotRef: string;
  projectId: string;
  testCaseId: string;
  actorId: string;
  compareId: string;
  decision: HistoryComparePermissionAuditDecision;
  reasonCodes: readonly string[];
  reasonSeverities: readonly string[];
  unavailableFields: readonly string[];
  rawHistory: {
    included: false;
    preserved: true;
    digest?: string;
    itemCount: number;
  };
  eventCount: number;
  firstOccurredAt: string;
  lastOccurredAt: string;
};

export type HistoryComparePermissionAuditMaterializationSummary = {
  projectId: string;
  testCaseId: string;
  actorId?: string;
  receivedEventCount: number;
  scopedEventCount: number;
  materializedRecordCount: number;
  totalScopedRecordCount: number;
  omittedRecordCount: number;
  duplicateEventCount: number;
  actorScopeIgnoredEventCount: number;
  crossProjectIgnoredEventCount: number;
  testCaseScopeIgnoredEventCount: number;
  byDecision: Record<HistoryComparePermissionAuditDecision, number>;
  rawHistory: {
    included: false;
    preserved: true;
    digestCount: number;
    itemCount: number;
  };
  materializationDigest: string;
  selectedCaseHistoryCompareCompatible: true;
  mutationBoundary: "worker-materialization-only-no-rest-or-mcp-or-ui-claims";
  plannedOperations: readonly [
    "history_compare.permission_audit.replay",
    "history_compare.permission_audit.materialize"
  ];
};

export type HistoryComparePermissionAuditMaterializationPlan = {
  boundary: "worker-local-history-compare-permission-audit-materialization";
  consistency: "retry-safe-idempotent-selected-case-snapshot";
  scope: "project-test-case-actor";
  readOnly: true;
  rawCompareInputsIncluded: false;
  transitions: PipelineStatusTransition[];
  records: HistoryComparePermissionAuditSnapshotRecord[];
  diagnostics: HistoryComparePermissionAuditMaterializationDiagnostic[];
  summary: HistoryComparePermissionAuditMaterializationSummary;
};

export type HistoryComparePermissionAuditSnapshotProjection = {
  projectId: string;
  testCaseId: string;
  actorId?: string;
  records: HistoryComparePermissionAuditSnapshotRecord[];
  summary: HistoryComparePermissionAuditMaterializationSummary;
};

export type HistoryComparePermissionAuditSnapshotApplyResult =
  HistoryComparePermissionAuditMaterializationSummary & {
    adapterKind: "in-memory-history-compare-permission-audit-worker-wip";
    boundary: "worker-local-history-compare-permission-audit-materialization";
    consistency: "retry-safe-idempotent-selected-case-snapshot";
    appliedAt: string;
    idempotencyKeyHash: string;
    upsertedSnapshotCount: number;
    updatedSnapshotCount: number;
    unchangedSnapshotCount: number;
    totalSnapshotCount: number;
  };

export type HistoryComparePermissionAuditSnapshotAdapter = {
  kind: "in-memory-history-compare-permission-audit-worker-wip";
  applyEvents: (input: {
    projectId: string;
    testCaseId: string;
    actorId?: string;
    events: readonly HistoryComparePermissionAuditEvent[];
    materializationDigest: string;
    at: string;
    limit?: number;
  }) => HistoryComparePermissionAuditSnapshotApplyResult;
  getProjection: (input: {
    projectId: string;
    testCaseId: string;
    actorId?: string;
  }) => HistoryComparePermissionAuditSnapshotProjection;
  snapshot: () => HistoryComparePermissionAuditSnapshotProjection[];
};

export type WorkerPipelinePorts = {
  launchClose: {
    planClose: (input: { job: WorkerJob<"launch.close">; at: string }) => LaunchClosePipelinePlan;
  };
  testCases: {
    planSync: (input: { payload: TestCaseSyncJobPayload; at: string }) => TestCaseSyncPipelinePlan;
  };
  analytics: {
    listProjectionResults: (input: {
      payload: AnalyticsMaterializeJobPayload;
    }) => readonly AnalyticsProjectionResult[];
    planMaterialize: (input: {
      payload: AnalyticsMaterializeJobPayload;
      at: string;
      results: readonly AnalyticsProjectionResult[];
    }) => AnalyticsMaterializePipelinePlan;
  };
  artifacts: {
    listRetentionArtifacts: (input: {
      payload: ArtifactCleanupJobPayload;
    }) => readonly ArtifactDescriptor[];
    listClosedLaunchIds: (input: { payload: ArtifactCleanupJobPayload }) => Iterable<string>;
  };
  artifactPreviews: {
    listPreviewSources: (input: {
      payload: IngestionParseJobPayload;
    }) => readonly ArtifactPreviewGenerationSource[];
    listRetentionDescriptors: (input: {
      payload: ArtifactCleanupJobPayload;
    }) => readonly ArtifactPreviewRetentionDescriptorSource[];
    store: ArtifactPreviewDescriptorStoreAdapter;
  };
  searchIndex: SearchIndexProjectionAdapter;
  defectMutes: DefectMuteProjectionAdapter;
  archiveDiagnostics: ArchiveDiagnosticReplayAdapter;
};
