export type ArchiveUploadStatusApiState =
  | {
      state: "loading";
    }
  | {
      data: ArchiveUploadStatusListRead;
      state: "ready" | "empty" | "partial";
    }
  | {
      message: string;
      state: "error" | "denied";
    };

export type ArchiveDiagnosticReplayFixtureApiState =
  | {
      state: "loading";
    }
  | {
      data: ArchiveDiagnosticReplayFixtureListRead;
      state: "ready" | "empty" | "partial";
    }
  | {
      message: string;
      state: "error" | "denied";
    };

export type ArchiveUploadDiagnostic = {
  scope: "archive" | "entry" | string;
  severity: "info" | "warning" | "error" | string;
  code: string;
  message: string;
  index?: number;
  path?: string;
  kind?: string;
};

export type ArchiveUploadPageMetadata = {
  limit: number;
  cursor: string | null;
  offset: number;
  returned: number;
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export type ArchiveUploadStatusRead = {
  kind: "archive-upload-status";
  id: string;
  launchId: string;
  projectId?: string;
  status: "queued" | "processing" | "completed" | "completed_with_errors" | "failed" | string;
  phase: "queued" | "processing" | "completed" | "partial_success" | "failed" | string;
  progress: number;
  access: ArchiveUploadStatusAccess;
  archive: {
    name?: string;
    format: string;
    totalEntries: number;
    supportedFiles: number;
    attachmentFiles: number;
    ignoredFiles: number;
    totalUncompressedBytes: number;
    totalCompressedBytes: number;
    storesArchivePayload: boolean;
    payloadsAcceptedOnThisEndpoint: boolean;
  };
  worker: {
    queue: string;
    boundary: string;
    retryable: boolean;
    persistence: string;
    payloadsAvailable: boolean;
  };
  diagnostics: {
    page: ArchiveUploadPageMetadata;
    items: ArchiveUploadDiagnostic[];
  };
  links: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type ArchiveUploadStatusAccess = {
  scope: string;
  requiredScopes: string[];
  projectScoped: boolean;
  actorScoped: boolean;
  mutation: boolean;
  redacted: boolean;
};

export type ArchiveUploadStatusListRead = {
  kind: "archive-upload-status-list";
  launch: {
    id: string;
    projectId: string;
    status: string;
  };
  access: ArchiveUploadStatusAccess;
  processing: {
    mode: string;
    workerBoundary: string;
    storesArchivePayload: boolean;
    payloadsAcceptedOnThisEndpoint: boolean;
    bounded: {
      maxDiagnostics: number;
    };
  };
  page: ArchiveUploadPageMetadata;
  summary: {
    total: number;
    queued: number;
    processing: number;
    completed: number;
    completedWithErrors: number;
    failed: number;
    acceptedEntries: number;
    ignoredEntries: number;
    importedResults: number;
    storedArtifacts: number;
    diagnostics: number;
    warnings: number;
    errors: number;
  };
  diagnostics: {
    page: ArchiveUploadPageMetadata;
    items: ArchiveUploadDiagnostic[];
  };
  items: ArchiveUploadStatusRead[];
};

export type ArchiveDiagnosticReplayFixtureName =
  "corrupt" | "empty" | "denied" | "partial" | "duplicate" | "retry" | string;

export type ArchiveDiagnosticReplayFixtureContract = {
  kind: "archive-diagnostic-replay-fixture-materialized";
  projectId: string;
  fixtureRef: string;
  materializedRef: string;
  name: ArchiveDiagnosticReplayFixtureName;
  scenario: string;
  materializedAt: string;
  sourceDigest: string;
  recordDigest: string;
  status: "ready" | "partial" | "denied" | string;
  evidence: {
    deterministic: boolean;
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
    closedArchiveStatusReadCompatible: boolean;
    closedArchiveDiagnosticsReadCompatible: boolean;
    redactionPassed: boolean;
  };
  materialization: {
    adapterKind: string;
    boundary: string;
    consistency: string;
    source: string;
    readOnly: boolean;
    rawArchivePayloadsIncluded: boolean;
    manifestEntriesIncluded: boolean;
    resultFilesIncluded: boolean;
    localPathsIncluded: boolean;
    storageRefsIncluded: boolean;
    signedUrlsIncluded: boolean;
    tokensIncluded: boolean;
    mutationBoundary: string;
  };
  execution: {
    replayStarted: boolean;
    workerJobEnqueued: boolean;
    archivePayloadOpened: boolean;
    mutation: boolean;
    deletionStarted: boolean;
    providerIntegration: boolean;
  };
};

export type ArchiveDiagnosticReplayFixtureListRead = {
  kind: "archive-diagnostic-replay-fixture-materialized-list";
  project: {
    id: string;
    scoped: boolean;
  };
  actor: {
    id: string;
    scoped: boolean;
  };
  access: {
    scope: "uploads:read" | string;
    projectScoped: boolean;
    actorScoped: boolean;
    mutation: boolean;
    redacted: boolean;
  };
  query?: {
    projectId: string;
    limit: number;
    cursor: string | null;
  };
  materialization?: {
    adapterKind: string;
    boundary: string;
    consistency: string;
    source: string;
    readOnly: boolean;
    mutation: boolean;
    rawArchivePayloadsIncluded: boolean;
    manifestEntriesIncluded: boolean;
    resultFilesIncluded: boolean;
    localPathsIncluded: boolean;
    storageRefsIncluded: boolean;
    signedUrlsIncluded: boolean;
    tokensIncluded: boolean;
    materializedAt: string;
    materializedRecordCount: number;
    materializationDigest: string;
    mutationBoundary: string;
  };
  page: ArchiveUploadPageMetadata;
  summary: {
    projectId: string;
    materializedRecordCount: number;
    fixtureNames: string[];
    supportedFiles: number;
    attachmentFiles: number;
    ignoredFiles: number;
    warningCount: number;
    parseErrors: number;
    attemptGroups: number;
    retryAwareCount: number;
    duplicateAwareCount: number;
    deniedFixtureCount: number;
    deterministic: boolean;
    projectScoped: boolean;
    readOnly: boolean;
    mutation: boolean;
    rawArchivePayloadsIncluded: boolean;
    manifestEntriesIncluded: boolean;
    resultFilesIncluded: boolean;
    localPathsIncluded: boolean;
    storageRefsIncluded: boolean;
    signedUrlsIncluded: boolean;
    tokensIncluded: boolean;
    redactionPassed: boolean;
    materializationDigest: string;
    mutationBoundary: string;
    plannedOperations: string[];
  };
  items: ArchiveDiagnosticReplayFixtureContract[];
  links: Record<string, string>;
};
