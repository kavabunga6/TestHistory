import type {
  ApiState,
  ArchiveDiagnosticReplayFixtureListRead,
  ArchiveUploadStatusListRead
} from "./api.js";
export const onlineApiState: ApiState = {
  loading: false,
  capabilities: {
    apiVersion: "v1",
    swagger: "/docs",
    openapiJson: "/docs/json",
    ingestion: {
      modes: ["json-batch", "chunked-json"],
      policy: {
        compressionMinBytes: 1024,
        retentionDays: 14,
        maxUploadConcurrency: 4,
        chunkBytes: 524288
      }
    },
    modules: ["launches", "results", "test-cases", "artifacts", "defects", "quality-gates"]
  }
};

export const apiStates: Record<string, ApiState> = {
  demo: onlineApiState,
  loading: { loading: true },
  error: { loading: false, error: "/api/v1/capabilities returned 500" },
  offline: { loading: false, error: "Failed to fetch" }
};

export const archiveReadyApiState: ApiState = {
  ...onlineApiState,
  capabilities: {
    ...onlineApiState.capabilities!,
    ingestion: {
      ...onlineApiState.capabilities!.ingestion,
      modes: [...onlineApiState.capabilities!.ingestion.modes, "archive-planned"]
    }
  }
};

export const readyArchiveUploadStatus: ArchiveUploadStatusListRead = {
  kind: "archive-upload-status-list",
  launch: {
    id: "launch-archive-status",
    projectId: "project-1",
    status: "processing"
  },
  access: {
    scope: "uploads:read",
    requiredScopes: ["uploads:read", "launches:read"],
    projectScoped: true,
    actorScoped: true,
    mutation: false,
    redacted: true
  },
  processing: {
    mode: "archive-manifest-intake",
    workerBoundary: "archive-unpack-planned",
    storesArchivePayload: false,
    payloadsAcceptedOnThisEndpoint: false,
    bounded: {
      maxDiagnostics: 100
    }
  },
  page: {
    limit: 3,
    cursor: null,
    offset: 0,
    returned: 2,
    total: 2,
    nextCursor: null,
    hasMore: false
  },
  summary: {
    total: 2,
    queued: 0,
    processing: 1,
    completed: 1,
    completedWithErrors: 0,
    failed: 0,
    acceptedEntries: 9,
    ignoredEntries: 1,
    importedResults: 7,
    storedArtifacts: 2,
    diagnostics: 3,
    warnings: 1,
    errors: 0
  },
  diagnostics: {
    page: {
      limit: 5,
      cursor: null,
      offset: 0,
      returned: 3,
      total: 3,
      nextCursor: null,
      hasMore: false
    },
    items: [
      {
        scope: "archive",
        severity: "info",
        code: "archive.worker.completed",
        message: "Archive worker job completed"
      },
      {
        scope: "archive",
        severity: "info",
        code: "archive.worker.in_progress",
        message: "Archive worker job is processing"
      },
      {
        scope: "entry",
        severity: "warning",
        code: "archive.entry.warning",
        message: "Unsupported attachment entry was ignored"
      }
    ]
  },
  items: [
    {
      kind: "archive-upload-status",
      id: "archive-upload-1",
      launchId: "launch-archive-status",
      projectId: "project-1",
      status: "completed",
      phase: "completed",
      progress: 100,
      access: {
        scope: "uploads:read",
        requiredScopes: ["uploads:read", "launches:read"],
        projectScoped: true,
        actorScoped: true,
        mutation: false,
        redacted: true
      },
      archive: {
        name: "nightly-allure.zip",
        format: "allure-results-archive-manifest",
        totalEntries: 6,
        supportedFiles: 6,
        attachmentFiles: 2,
        ignoredFiles: 0,
        totalUncompressedBytes: 4096,
        totalCompressedBytes: 2048,
        storesArchivePayload: false,
        payloadsAcceptedOnThisEndpoint: false
      },
      worker: {
        queue: "ingestion.parse",
        boundary: "archive-unpack-planned",
        retryable: false,
        persistence: "synthetic-in-memory-read-model",
        payloadsAvailable: false
      },
      diagnostics: {
        page: {
          limit: 5,
          cursor: null,
          offset: 0,
          returned: 1,
          total: 1,
          nextCursor: null,
          hasMore: false
        },
        items: [
          {
            scope: "archive",
            severity: "info",
            code: "archive.worker.completed",
            message: "Archive worker job completed"
          }
        ]
      },
      links: {
        self: "/api/v1/uploads/archive-upload-1/archive/status",
        uploadStatus: "/api/v1/uploads/archive-upload-1/status",
        launch: "/api/v1/launches/launch-archive-status"
      },
      createdAt: "2026-05-30T00:00:00.000Z",
      updatedAt: "2026-05-30T00:01:00.000Z"
    },
    {
      kind: "archive-upload-status",
      id: "archive-upload-2",
      launchId: "launch-archive-status",
      projectId: "project-1",
      status: "processing",
      phase: "processing",
      progress: 45,
      access: {
        scope: "uploads:read",
        requiredScopes: ["uploads:read", "launches:read"],
        projectScoped: true,
        actorScoped: true,
        mutation: false,
        redacted: true
      },
      archive: {
        name: "retry-pack.zip",
        format: "allure-results-archive-manifest",
        totalEntries: 4,
        supportedFiles: 3,
        attachmentFiles: 0,
        ignoredFiles: 1,
        totalUncompressedBytes: 2048,
        totalCompressedBytes: 1024,
        storesArchivePayload: false,
        payloadsAcceptedOnThisEndpoint: false
      },
      worker: {
        queue: "ingestion.parse",
        boundary: "archive-unpack-planned",
        retryable: true,
        persistence: "synthetic-in-memory-read-model",
        payloadsAvailable: false
      },
      diagnostics: {
        page: {
          limit: 5,
          cursor: null,
          offset: 0,
          returned: 2,
          total: 2,
          nextCursor: null,
          hasMore: false
        },
        items: [
          {
            scope: "archive",
            severity: "info",
            code: "archive.worker.in_progress",
            message: "Archive worker job is processing"
          },
          {
            scope: "entry",
            severity: "warning",
            code: "archive.entry.warning",
            message: "Unsupported attachment entry was ignored"
          }
        ]
      },
      links: {
        self: "/api/v1/uploads/archive-upload-2/archive/status",
        uploadStatus: "/api/v1/uploads/archive-upload-2/status",
        launch: "/api/v1/launches/launch-archive-status"
      },
      createdAt: "2026-05-30T00:02:00.000Z",
      updatedAt: "2026-05-30T00:03:00.000Z"
    }
  ]
};

export const readyArchiveDiagnosticReplayFixtures: ArchiveDiagnosticReplayFixtureListRead = {
  kind: "archive-diagnostic-replay-fixture-materialized-list",
  project: {
    id: "project-1",
    scoped: true
  },
  actor: {
    id: "archive-fixture-ui",
    scoped: true
  },
  access: {
    scope: "uploads:read",
    projectScoped: true,
    actorScoped: true,
    mutation: false,
    redacted: true
  },
  query: {
    projectId: "project-1",
    limit: 3,
    cursor: null
  },
  page: {
    limit: 3,
    cursor: null,
    offset: 0,
    returned: 3,
    total: 3,
    nextCursor: null,
    hasMore: false
  },
  materialization: {
    adapterKind: "api-read-model-archive-diagnostic-replay-fixture-materialized-wip",
    boundary: "worker-compatible-archive-diagnostic-replay-fixture-materialized-read",
    consistency: "synthetic-fixture-contracts-idempotent",
    source: "synthetic-archive-diagnostic-replay-fixture-contracts",
    readOnly: true,
    mutation: false,
    rawArchivePayloadsIncluded: false,
    manifestEntriesIncluded: false,
    resultFilesIncluded: false,
    localPathsIncluded: false,
    storageRefsIncluded: false,
    signedUrlsIncluded: false,
    tokensIncluded: false,
    materializedAt: "2026-05-30T00:00:00.000Z",
    materializedRecordCount: 3,
    materializationDigest: "sha256:fixture-materialized-list-digest",
    mutationBoundary: "rest-materialized-read-only-no-archive-or-worker-mutation"
  },
  summary: {
    projectId: "project-1",
    materializedRecordCount: 3,
    fixtureNames: ["duplicate", "retry", "corrupt"],
    supportedFiles: 7,
    attachmentFiles: 2,
    ignoredFiles: 1,
    warningCount: 1,
    parseErrors: 2,
    attemptGroups: 4,
    retryAwareCount: 1,
    duplicateAwareCount: 1,
    deniedFixtureCount: 0,
    deterministic: true,
    projectScoped: true,
    readOnly: true,
    mutation: false,
    rawArchivePayloadsIncluded: false,
    manifestEntriesIncluded: false,
    resultFilesIncluded: false,
    localPathsIncluded: false,
    storageRefsIncluded: false,
    signedUrlsIncluded: false,
    tokensIncluded: false,
    redactionPassed: true,
    materializationDigest: "sha256:fixture-materialized-list-digest",
    mutationBoundary: "api-materialized-fixture-read-only-no-rest-or-worker-mutation",
    plannedOperations: [
      "archive_diagnostic.replay_fixture.contract_project",
      "archive_diagnostic.replay_fixture.materialized_read"
    ]
  },
  items: [
    {
      kind: "archive-diagnostic-replay-fixture-materialized",
      projectId: "project-1",
      fixtureRef: "fixture:duplicate",
      materializedRef: "materialized:duplicate",
      name: "duplicate",
      scenario: "Duplicate archive entries collapse into one read summary",
      materializedAt: "2026-05-30T00:00:00.000Z",
      sourceDigest: "sha256:fixture-duplicate-source",
      recordDigest: "sha256:fixture-duplicate-digest",
      status: "ready",
      evidence: {
        deterministic: true,
        retryAware: false,
        duplicateAware: true,
        deniedFixture: false,
        supportedFiles: 3,
        attachmentFiles: 1,
        ignoredFiles: 0,
        warningCount: 1,
        parseErrors: 0,
        attemptGroups: 2,
        latestStatusCount: 1,
        compatibleSourceCount: 2,
        closedArchiveStatusReadCompatible: true,
        closedArchiveDiagnosticsReadCompatible: true,
        redactionPassed: true
      },
      materialization: archiveMaterializedFixturePolicy(),
      execution: archiveMaterializedFixtureExecution()
    },
    {
      kind: "archive-diagnostic-replay-fixture-materialized",
      projectId: "project-1",
      fixtureRef: "fixture:retry",
      materializedRef: "materialized:retry",
      name: "retry",
      scenario: "Retry metadata stays bounded to counters",
      materializedAt: "2026-05-30T00:00:00.000Z",
      sourceDigest: "sha256:fixture-retry-source",
      recordDigest: "sha256:fixture-retry-digest",
      status: "ready",
      evidence: {
        deterministic: true,
        retryAware: true,
        duplicateAware: false,
        deniedFixture: false,
        supportedFiles: 4,
        attachmentFiles: 1,
        ignoredFiles: 1,
        warningCount: 0,
        parseErrors: 0,
        attemptGroups: 2,
        latestStatusCount: 2,
        compatibleSourceCount: 1,
        closedArchiveStatusReadCompatible: true,
        closedArchiveDiagnosticsReadCompatible: true,
        redactionPassed: true
      },
      materialization: archiveMaterializedFixturePolicy(),
      execution: archiveMaterializedFixtureExecution()
    },
    {
      kind: "archive-diagnostic-replay-fixture-materialized",
      projectId: "project-1",
      fixtureRef: "fixture:corrupt",
      materializedRef: "materialized:corrupt",
      name: "corrupt",
      scenario: "Parse failures render as counters only",
      materializedAt: "2026-05-30T00:00:00.000Z",
      sourceDigest: "sha256:fixture-corrupt-source",
      recordDigest: "sha256:fixture-corrupt-digest",
      status: "ready",
      evidence: {
        deterministic: true,
        retryAware: false,
        duplicateAware: false,
        deniedFixture: false,
        supportedFiles: 0,
        attachmentFiles: 0,
        ignoredFiles: 0,
        warningCount: 0,
        parseErrors: 2,
        attemptGroups: 0,
        latestStatusCount: 1,
        compatibleSourceCount: 1,
        closedArchiveStatusReadCompatible: true,
        closedArchiveDiagnosticsReadCompatible: true,
        redactionPassed: true
      },
      materialization: archiveMaterializedFixturePolicy(),
      execution: archiveMaterializedFixtureExecution()
    }
  ],
  links: {
    self: "/api/v1/projects/project-1/archive/diagnostics/replay/fixtures/materialized?limit=3"
  }
};

export const archiveStatusReadyApiState: ApiState = {
  ...archiveReadyApiState,
  archiveUploadStatus: {
    data: readyArchiveUploadStatus,
    state: "ready"
  }
};

export const archiveFixtureReadyApiState: ApiState = {
  ...archiveStatusReadyApiState,
  archiveDiagnosticReplayFixtures: {
    data: readyArchiveDiagnosticReplayFixtures,
    state: "ready"
  }
};

export function archiveMaterializedFixturePolicy() {
  return {
    adapterKind: "api-read-model-archive-diagnostic-replay-fixture-materialized-wip",
    boundary: "worker-compatible-archive-diagnostic-replay-fixture-materialized-read",
    consistency: "synthetic-fixture-contracts-idempotent",
    source: "synthetic-archive-diagnostic-replay-fixture-contract",
    readOnly: true,
    rawArchivePayloadsIncluded: false,
    manifestEntriesIncluded: false,
    resultFilesIncluded: false,
    localPathsIncluded: false,
    storageRefsIncluded: false,
    signedUrlsIncluded: false,
    tokensIncluded: false,
    mutationBoundary: "rest-materialized-read-only-no-archive-or-worker-mutation"
  };
}

export function archiveMaterializedFixtureExecution() {
  return {
    replayStarted: false,
    workerJobEnqueued: false,
    archivePayloadOpened: false,
    mutation: false,
    deletionStarted: false,
    providerIntegration: false
  };
}
