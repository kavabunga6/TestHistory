import type {
  ArchiveDiagnosticReplayFixtureApiState,
  ArchiveDiagnosticReplayFixtureListRead,
  ArchiveUploadPageMetadata,
  ArchiveUploadStatusApiState,
  ArchiveUploadStatusListRead
} from "./apiTypes.js";
import type { ApiLaunchRetentionReadModel, ApiProjectReadModel } from "./apiStateModels.js";
import { getJson } from "./apiHttp.js";
import { PermissionDeniedHttpError, getSafeDeniedMessage } from "./apiPermissions.js";

export async function loadArchiveDiagnosticReplayFixtureState(
  projectId?: string
): Promise<ArchiveDiagnosticReplayFixtureApiState> {
  try {
    const project =
      projectId !== undefined
        ? { id: projectId }
        : (await getJson<ApiProjectReadModel[]>("/api/v1/projects"))[0];
    if (project === undefined) {
      return {
        data: emptyArchiveDiagnosticReplayFixtures("no-api-project"),
        state: "empty"
      };
    }

    const data = await getJson<ArchiveDiagnosticReplayFixtureListRead>(
      `/api/v1/projects/${encodeURIComponent(
        project.id
      )}/archive/diagnostics/replay/fixtures/materialized?limit=3`,
      {
        headers: {
          "x-testhistory-scopes": "uploads:read launches:read",
          "x-testhistory-project-scope": project.id,
          "x-testhistory-actor-id": "archive-fixture-ui"
        }
      }
    );

    return {
      data,
      state:
        data.summary.materializedRecordCount === 0 || data.items.length === 0
          ? "empty"
          : data.page.hasMore
            ? "partial"
            : "ready"
    };
  } catch (error) {
    if (error instanceof PermissionDeniedHttpError) {
      return {
        message: getSafeDeniedMessage(error.denied),
        state: "denied"
      };
    }

    return {
      message: error instanceof Error ? error.message : String(error),
      state: "error"
    };
  }
}

export async function loadArchiveUploadStatusState(
  projectId?: string
): Promise<ArchiveUploadStatusApiState> {
  try {
    const project =
      projectId !== undefined
        ? { id: projectId }
        : (await getJson<ApiProjectReadModel[]>("/api/v1/projects"))[0];
    if (project === undefined) {
      return {
        data: emptyArchiveUploadStatus("no-api-project", "no-api-launch"),
        state: "empty"
      };
    }

    const launchesPayload = await getJson<
      ApiLaunchRetentionReadModel[] | { items: ApiLaunchRetentionReadModel[] }
    >(`/api/v1/projects/${encodeURIComponent(project.id)}/launches`);
    const launches = Array.isArray(launchesPayload) ? launchesPayload : launchesPayload.items;
    const launch = launches[0];
    if (launch === undefined) {
      return {
        data: emptyArchiveUploadStatus(project.id, "no-api-launch"),
        state: "empty"
      };
    }

    const data = await getJson<ArchiveUploadStatusListRead>(
      `/api/v1/launches/${encodeURIComponent(
        launch.id
      )}/uploads/archive/status?limit=3&diagnosticsLimit=5`,
      {
        headers: {
          "x-testhistory-scopes": "uploads:read launches:read",
          "x-testhistory-project-scope": project.id,
          "x-testhistory-actor-id": "archive-status-ui"
        }
      }
    );

    return {
      data,
      state:
        data.summary.total === 0 && data.items.length === 0 && data.diagnostics.items.length === 0
          ? "empty"
          : data.page.hasMore ||
              data.diagnostics.page.hasMore ||
              data.items.some((item) => item.diagnostics.page.hasMore) ||
              data.summary.completedWithErrors > 0
            ? "partial"
            : "ready"
    };
  } catch (error) {
    if (error instanceof PermissionDeniedHttpError) {
      return {
        message: getSafeDeniedMessage(error.denied),
        state: "denied"
      };
    }

    return {
      message: error instanceof Error ? error.message : String(error),
      state: "error"
    };
  }
}

function emptyArchiveUploadStatus(
  projectId: string,
  launchId: string
): ArchiveUploadStatusListRead {
  const emptyPage: ArchiveUploadPageMetadata = {
    limit: 3,
    cursor: null,
    offset: 0,
    returned: 0,
    total: 0,
    nextCursor: null,
    hasMore: false
  };

  return {
    kind: "archive-upload-status-list",
    launch: {
      id: launchId,
      projectId,
      status: "unavailable"
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
        maxDiagnostics: 0
      }
    },
    page: emptyPage,
    summary: {
      total: 0,
      queued: 0,
      processing: 0,
      completed: 0,
      completedWithErrors: 0,
      failed: 0,
      acceptedEntries: 0,
      ignoredEntries: 0,
      importedResults: 0,
      storedArtifacts: 0,
      diagnostics: 0,
      warnings: 0,
      errors: 0
    },
    diagnostics: {
      page: emptyPage,
      items: []
    },
    items: []
  };
}

function emptyArchiveDiagnosticReplayFixtures(
  projectId: string
): ArchiveDiagnosticReplayFixtureListRead {
  const emptyPage: ArchiveUploadPageMetadata = {
    limit: 3,
    cursor: null,
    offset: 0,
    returned: 0,
    total: 0,
    nextCursor: null,
    hasMore: false
  };

  return {
    kind: "archive-diagnostic-replay-fixture-materialized-list",
    project: {
      id: projectId,
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
      projectId,
      limit: 3,
      cursor: null
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
      materializedAt: "1970-01-01T00:00:00.000Z",
      materializedRecordCount: 0,
      materializationDigest: "empty",
      mutationBoundary: "rest-materialized-read-only-no-archive-or-worker-mutation"
    },
    page: emptyPage,
    summary: {
      projectId,
      materializedRecordCount: 0,
      fixtureNames: [],
      supportedFiles: 0,
      attachmentFiles: 0,
      ignoredFiles: 0,
      warningCount: 0,
      parseErrors: 0,
      attemptGroups: 0,
      retryAwareCount: 0,
      duplicateAwareCount: 0,
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
      materializationDigest: "empty",
      mutationBoundary: "api-materialized-fixture-read-only-no-rest-or-worker-mutation",
      plannedOperations: ["archive_diagnostic.replay_fixture.materialized_read"]
    },
    items: [],
    links: {}
  };
}
