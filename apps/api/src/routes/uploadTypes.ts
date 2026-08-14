import type { ArtifactResultStatus } from "@testhistory/artifacts";
import type { ProjectRole } from "@testhistory/contracts";
import type { UploadJob } from "../store.js";

export type UploadFile = {
  path: string;
  content: Buffer | string;
  resultStatus?: ArtifactResultStatus;
};

export type AllureCtlLaunchRequest = {
  projectId?: string | number;
  name?: string;
  launchName?: string;
  branch?: string;
  commitSha?: string;
  buildNumber?: string;
  tags?: string[];
};

export type AllureCtlUploadRequest = {
  launchId?: string;
  projectId?: string | number;
  launchName?: string;
  closeLaunch?: boolean;
  files?: Array<{
    path?: string;
    name?: string;
    fileName?: string;
    content?: string;
    contentEncoding?: ChunkEncoding;
  }>;
  path?: string;
  name?: string;
  fileName?: string;
  content?: string;
  contentEncoding?: ChunkEncoding;
};

export type AllureCtlSessionRequest = AllureCtlLaunchRequest & {
  launchId?: string;
};

export type AllureCtlQuery = {
  projectId?: string;
  launchId?: string;
  launchName?: string;
  name?: string;
  path?: string;
  fileName?: string;
  closeLaunch?: string;
};

export type CompatibilityFileImport = {
  path: string;
  kind:
    "result" | "container" | "environment" | "executor" | "categories" | "history" | "unsupported";
  status: "imported" | "duplicate" | "diagnostic";
  uuid?: string;
  warnings: string[];
  errors: string[];
};

export type ChunkedUploadFileInput = {
  path: string;
  totalChunks: number;
  totalBytes?: number;
};

export type ChunkEncoding = "utf8" | "base64";

export type ArchiveManifestUploadRequest = {
  archiveName?: string;
  entries: unknown[];
  advertisedCompressedBytes?: number;
};

export type ArchiveManifestDiagnostic = {
  scope: "archive" | "entry";
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  index?: number;
  path?: string;
  kind?: string;
};

export type ArchiveStatusQuery = {
  limit?: number | string;
  cursor?: string;
  status?: UploadJob["status"];
  diagnosticsLimit?: number | string;
  diagnosticsCursor?: string;
};

export type ArchiveDiagnosticsQuery = {
  limit?: number | string;
  cursor?: string;
};

export type UploadJobQueueQuery = {
  status?: UploadJob["status"];
  source?: "chunked-session";
  limit?: number | string;
  cursor?: string;
};

export type UploadJobClaimRequest = {
  source?: "chunked-session";
  limit?: number;
  workerId?: string;
  leaseMs?: number;
};

export type UploadJobProcessRequest = {
  claimToken?: string;
};

export type ArchiveDiagnosticReplayQuery = ArchiveDiagnosticsQuery & {
  archiveRef?: string;
};

export type ArchiveDiagnosticReplayFixtureQuery = {
  actorId?: string;
  digest?: string;
  limit?: number | string;
  cursor?: string;
  name?: ArchiveDiagnosticReplayFixtureName;
};

export type ArchivePageMetadata = {
  limit: number;
  cursor: string | null;
  offset: number;
  returned: number;
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export const maxArchiveManifestEntries = 10_000;
export const maxArchiveDiagnostics = 100;
export const uploadWriteRoles: readonly ProjectRole[] = ["owner", "maintainer", "editor", "ci"];
export const defaultArchiveStatusLimit = 25;
export const maxArchiveStatusLimit = 100;
export const defaultArchiveDiagnosticLimit = 25;
export const maxArchiveDiagnosticLimit = 100;
export const defaultArchiveDiagnosticFixtureLimit = 25;
export const maxArchiveDiagnosticFixtureLimit = 100;
export const defaultUploadJobQueueLimit = 25;
export const maxUploadJobQueueLimit = 100;
export const defaultUploadJobLeaseMs = 5 * 60 * 1000;
export const maxUploadJobLeaseMs = 15 * 60 * 1000;
export const jsonBatchSyncFileLimit = 5_000;
export const jsonBatchSyncByteLimit = 25 * 1024 * 1024;
export const enterpriseTargetUsers = 1_000;
export const enterpriseTargetResults = 100_000;
export const enterpriseTargetWindowHours = 6;
export const enterpriseQueueDepthWatermark = 50_000;
export const enterpriseInFlightWatermark = 2_000;
export const enterpriseBackpressureRetryAfterMs = 5_000;
export const enterpriseParserWorkerConcurrency = 8;
export const enterpriseArtifactWorkerConcurrency = 16;
export const enterpriseEstimatedResultsPerWorkerHour = 2_500;
export const archiveStatusReadScopes = ["uploads:read", "launches:read"] as const;
export const archiveDiagnosticReplaySources = [
  "archive.status.read",
  "archive.diagnostics.read",
  "archive.cleanup.preview"
] as const;
export const archiveDiagnosticReplaySeverities = ["info", "warn", "error"] as const;

export type ArchiveDiagnosticReplaySource = (typeof archiveDiagnosticReplaySources)[number];
export type ArchiveDiagnosticReplaySeverity = (typeof archiveDiagnosticReplaySeverities)[number];

export type ArchiveDiagnosticReplayRecord = {
  eventRef: string;
  projectId: string;
  launchId: string;
  archiveRef: string;
  source: ArchiveDiagnosticReplaySource;
  code:
    | "archive-status-read"
    | "duplicate-entry"
    | "unsafe-entry-path"
    | "unsupported-entry"
    | "entry-processing-error"
    | "parser-diagnostic"
    | "diagnostic-limit-reached";
  severity: ArchiveDiagnosticReplaySeverity;
  retryable: boolean;
  occurredAt: string;
  entryRef?: string;
  chunkRef?: string;
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
  severityCounts: Record<ArchiveDiagnosticReplaySeverity, number>;
  sourceCounts: Record<ArchiveDiagnosticReplaySource, number>;
  replayDigest: string;
  closedArchiveStatusReadCompatible: true;
  closedArchiveDiagnosticsReadCompatible: true;
  mutationBoundary: "worker-replay-only-no-rest-or-ui-claims";
};

export type ArchiveDiagnosticReplayProjection = {
  kind: "archive-diagnostic-replay-summary";
  projectId: string;
  launchId: string;
  archiveRef: string;
  uploadId: string;
  status: UploadJob["status"];
  phase: "queued" | "processing" | "completed" | "partial_success" | "failed";
  worker: {
    queue: "archive.diagnostics.replay";
    boundary: "worker-local-archive-diagnostics-replay";
    adapterKind: "in-memory-archive-diagnostics-replay-wip";
    consistency: "append-only-idempotent-replay";
    payloadsAvailable: false;
  };
  execution: {
    readOnly: true;
    mutation: false;
    deletionStarted: false;
    deleteRequestedCount: 0;
    rawMaterialReturned: false;
  };
  summary: ArchiveDiagnosticReplaySummary;
  records: ArchiveDiagnosticReplayRecord[];
};

function archiveDiagnosticReplayFixtureReplayContract(
  name: ArchiveDiagnosticReplayFixtureName
): ArchiveDiagnosticReplayFixtureContract["replay"] {
  return {
    deterministic: true,
    compatibleSources: archiveDiagnosticReplaySources,
    retryAware: name === "retry",
    duplicateAware: name === "duplicate",
    deniedFixture: name === "denied",
    closedArchiveStatusReadCompatible: true,
    closedArchiveDiagnosticsReadCompatible: true,
    mutationBoundary: "fixture-read-only-no-replay-mutation"
  };
}

function archiveDiagnosticReplayFixturePayloadContract(): ArchiveDiagnosticReplayFixtureContract["payload"] {
  return {
    archivePayloadAvailable: false,
    manifestEntriesReturned: false,
    resultFilesReturned: false,
    resultContentReturned: false,
    rawPathsReturned: false,
    payloadBytesReturned: 0,
    redacted: true
  };
}

export type ArchiveDiagnosticReplayFixtureName =
  "corrupt" | "empty" | "denied" | "partial" | "duplicate" | "retry";

export type ArchiveDiagnosticReplayFixtureContract = {
  kind: "archive-diagnostic-replay-fixture";
  projectId: string;
  fixtureRef: string;
  name: ArchiveDiagnosticReplayFixtureName;
  scenario:
    | "corrupt-result-json"
    | "empty-archive"
    | "denied-unsafe-entries"
    | "partial-success"
    | "duplicate-basename"
    | "retry-history";
  expected: {
    supportedFiles: number;
    attachmentFiles: number;
    ignoredFiles: number;
    warningCount: number;
    parseErrors: number;
    attemptGroups: number;
    latestStatuses: string[];
  };
  replay: {
    deterministic: true;
    compatibleSources: readonly ArchiveDiagnosticReplaySource[];
    retryAware: boolean;
    duplicateAware: boolean;
    deniedFixture: boolean;
    closedArchiveStatusReadCompatible: true;
    closedArchiveDiagnosticsReadCompatible: true;
    mutationBoundary: "fixture-read-only-no-replay-mutation";
  };
  payload: {
    archivePayloadAvailable: false;
    manifestEntriesReturned: false;
    resultFilesReturned: false;
    resultContentReturned: false;
    rawPathsReturned: false;
    payloadBytesReturned: 0;
    redacted: true;
  };
  digest: string;
};

export type JsonBatchBackpressureResponse = {
  kind: "upload-backpressure";
  code: "upload.backpressure.batch_too_large";
  accepted: false;
  retryable: true;
  redacted: true;
  limits: {
    files: number;
    bytes: number;
  };
  observed: {
    files: number;
    bytes: number;
  };
  recommendation: string;
};

export type ArchiveDiagnosticReplayMaterializedFixtureRecord = {
  kind: "archive-diagnostic-replay-fixture-materialized";
  projectId: string;
  fixtureRef: string;
  materializedRef: string;
  name: ArchiveDiagnosticReplayFixtureName;
  scenario: ArchiveDiagnosticReplayFixtureContract["scenario"];
  materializedAt: string;
  sourceDigest: string;
  recordDigest: string;
  status: "ready" | "partial" | "denied";
  evidence: {
    deterministic: true;
    retryAware: boolean;
    duplicateAware: boolean;
    deniedFixture: boolean;
    supportedFiles: number;
    attachmentFiles: number;
    ignoredFiles: number;
    warningCount: number;
    parseErrors: number;
    attemptGroups: number;
    latestStatusCount: number;
    compatibleSourceCount: number;
    closedArchiveStatusReadCompatible: true;
    closedArchiveDiagnosticsReadCompatible: true;
    redactionPassed: true;
  };
  materialization: {
    adapterKind: "api-read-model-archive-diagnostic-replay-fixture-materialized-wip";
    boundary: "worker-compatible-archive-diagnostic-replay-fixture-materialized-read";
    consistency: "synthetic-fixture-contracts-idempotent";
    source: "synthetic-archive-diagnostic-replay-fixture-contract";
    readOnly: true;
    rawArchivePayloadsIncluded: false;
    manifestEntriesIncluded: false;
    resultFilesIncluded: false;
    localPathsIncluded: false;
    storageRefsIncluded: false;
    signedUrlsIncluded: false;
    tokensIncluded: false;
    mutationBoundary: "rest-materialized-read-only-no-archive-or-worker-mutation";
  };
  execution: {
    replayStarted: false;
    workerJobEnqueued: false;
    archivePayloadOpened: false;
    mutation: false;
    deletionStarted: false;
    providerIntegration: false;
  };
};

export const syntheticArchiveDiagnosticReplayFixtureContracts: ReadonlyArray<
  Omit<ArchiveDiagnosticReplayFixtureContract, "projectId" | "fixtureRef" | "digest">
> = [
  {
    kind: "archive-diagnostic-replay-fixture",
    name: "corrupt",
    scenario: "corrupt-result-json",
    expected: {
      supportedFiles: 2,
      attachmentFiles: 1,
      ignoredFiles: 0,
      warningCount: 0,
      parseErrors: 1,
      attemptGroups: 0,
      latestStatuses: []
    },
    replay: archiveDiagnosticReplayFixtureReplayContract("corrupt"),
    payload: archiveDiagnosticReplayFixturePayloadContract()
  },
  {
    kind: "archive-diagnostic-replay-fixture",
    name: "empty",
    scenario: "empty-archive",
    expected: {
      supportedFiles: 0,
      attachmentFiles: 0,
      ignoredFiles: 0,
      warningCount: 0,
      parseErrors: 0,
      attemptGroups: 0,
      latestStatuses: []
    },
    replay: archiveDiagnosticReplayFixtureReplayContract("empty"),
    payload: archiveDiagnosticReplayFixturePayloadContract()
  },
  {
    kind: "archive-diagnostic-replay-fixture",
    name: "denied",
    scenario: "denied-unsafe-entries",
    expected: {
      supportedFiles: 0,
      attachmentFiles: 0,
      ignoredFiles: 0,
      warningCount: 4,
      parseErrors: 0,
      attemptGroups: 0,
      latestStatuses: []
    },
    replay: archiveDiagnosticReplayFixtureReplayContract("denied"),
    payload: archiveDiagnosticReplayFixturePayloadContract()
  },
  {
    kind: "archive-diagnostic-replay-fixture",
    name: "partial",
    scenario: "partial-success",
    expected: {
      supportedFiles: 3,
      attachmentFiles: 1,
      ignoredFiles: 1,
      warningCount: 1,
      parseErrors: 0,
      attemptGroups: 1,
      latestStatuses: ["failed"]
    },
    replay: archiveDiagnosticReplayFixtureReplayContract("partial"),
    payload: archiveDiagnosticReplayFixturePayloadContract()
  },
  {
    kind: "archive-diagnostic-replay-fixture",
    name: "duplicate",
    scenario: "duplicate-basename",
    expected: {
      supportedFiles: 3,
      attachmentFiles: 1,
      ignoredFiles: 0,
      warningCount: 1,
      parseErrors: 0,
      attemptGroups: 2,
      latestStatuses: ["passed", "broken"]
    },
    replay: archiveDiagnosticReplayFixtureReplayContract("duplicate"),
    payload: archiveDiagnosticReplayFixturePayloadContract()
  },
  {
    kind: "archive-diagnostic-replay-fixture",
    name: "retry",
    scenario: "retry-history",
    expected: {
      supportedFiles: 2,
      attachmentFiles: 0,
      ignoredFiles: 0,
      warningCount: 0,
      parseErrors: 0,
      attemptGroups: 1,
      latestStatuses: ["passed"]
    },
    replay: archiveDiagnosticReplayFixtureReplayContract("retry"),
    payload: archiveDiagnosticReplayFixturePayloadContract()
  }
];
