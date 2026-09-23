import type {
  DefectMuteProjectionApiState,
  DefectMuteProjectionRead,
  DefectMuteReplayInvariantApiState,
  DefectMuteReplayInvariantRead
} from "./apiTypes.js";
import type { ApiProjectReadModel } from "./apiStateModels.js";
import { getJson } from "./apiHttp.js";
import { PermissionDeniedHttpError, getSafeDeniedMessage } from "./apiPermissions.js";

export async function loadDefectMuteProjectionState(
  projectId?: string
): Promise<DefectMuteProjectionApiState> {
  try {
    const project =
      projectId !== undefined
        ? { id: projectId }
        : (await getJson<ApiProjectReadModel[]>("/api/v1/projects"))[0];
    if (project === undefined) {
      return {
        data: emptyDefectMuteProjection("no-api-project"),
        state: "empty"
      };
    }

    const data = await getJson<DefectMuteProjectionRead>(
      `/api/v1/projects/${encodeURIComponent(project.id)}/defect-mutes/projection?limit=3`,
      {
        headers: {
          "x-testhistory-scopes": "defects:read",
          "x-testhistory-project-scope": project.id,
          "x-testhistory-actor-id": "qa-api-agent"
        }
      }
    );

    return {
      data,
      state:
        data.projection.eventCount === 0 && data.items.length === 0
          ? "empty"
          : data.access.redacted || data.page.hasMore
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

export async function loadDefectMuteReplayInvariantState(
  projectId?: string
): Promise<DefectMuteReplayInvariantApiState> {
  try {
    const project =
      projectId !== undefined
        ? { id: projectId }
        : (await getJson<ApiProjectReadModel[]>("/api/v1/projects"))[0];
    if (project === undefined) {
      return {
        data: emptyDefectMuteReplayInvariants("no-api-project"),
        state: "empty"
      };
    }

    const actorId = "qa-api-agent";
    const data = await getJson<DefectMuteReplayInvariantRead>(
      `/api/v1/projects/${encodeURIComponent(
        project.id
      )}/defect-mutes/projection/replay/invariants?actorId=${encodeURIComponent(actorId)}&limit=3`,
      {
        headers: {
          "x-testhistory-scopes": "defects:read",
          "x-testhistory-project-scope": project.id,
          "x-testhistory-actor-id": actorId
        }
      }
    );

    return {
      data,
      state:
        data.appendOnly.totalProjectedEventIds === 0 && data.items.length === 0
          ? "empty"
          : data.page.hasMore ||
              data.redaction.leakedMarkers.length > 0 ||
              !data.redaction.passed ||
              !data.appendOnly.uniqueProjectedEventIds ||
              !data.invariant.deterministic ||
              !data.invariant.recomputable ||
              !data.invariant.projectScoped
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

function emptyDefectMuteProjection(projectId: string): DefectMuteProjectionRead {
  return {
    kind: "defect-mute-projection",
    projectId,
    access: {
      scope: "defects:read",
      projectScoped: true,
      actorScoped: false,
      mutation: false,
      redacted: true
    },
    projection: {
      adapterKind: "in-memory-defect-mute-projection-wip",
      boundary: "worker-local-mute-projection",
      consistency: "append-only-replay",
      replayStatus: "replayed",
      projectionDigest: "empty",
      mutationBoundary: "worker-projection-only-no-rest-mutation",
      eventCount: 0,
      mutedEventCount: 0,
      unmutedEventCount: 0,
      activeMuteCount: 0,
      inactiveMuteCount: 0,
      rawFailureOccurrenceCount: 0
    },
    page: {
      limit: 3,
      cursor: null,
      offset: 0,
      returned: 0,
      total: 0,
      nextCursor: null,
      hasMore: false
    },
    rawFailureHistory: {
      totalOccurrences: 0,
      statusCounters: { failed: 0, broken: 0 },
      byTestId: {},
      bySignatureHash: {}
    },
    items: []
  };
}

function emptyDefectMuteReplayInvariants(projectId: string): DefectMuteReplayInvariantRead {
  return {
    kind: "defect-mute-replay-invariant",
    projectId,
    access: {
      scope: "defects:read",
      projectScoped: true,
      actorScoped: false,
      mutation: false,
      redacted: true
    },
    query: {
      projectId,
      limit: 3,
      cursor: null
    },
    invariant: {
      boundary: "read-only-defect-mute-replay-invariant",
      source: "worker-local-mute-projection",
      consistency: "append-only-replay",
      mutationBoundary: "rest-read-only-no-replay-mutation",
      deterministic: true,
      recomputable: true,
      projectScoped: true,
      projectionDigest: "empty",
      recomputedDigest: "empty"
    },
    rawEffectiveSeparation: {
      effectiveStateExcludesRawFailureHistory: true,
      rawFailureHistoryPreserved: true,
      rawFailureHistoryNotMutatedByUnmute: true,
      rawFailureOccurrenceCount: 0,
      effectiveRecordCount: 0,
      documentation:
        "No replay events are available; raw failure history remains represented only by bounded counters."
    },
    appendOnly: {
      uniqueProjectedEventIds: true,
      duplicateEventIds: [],
      totalProjectedEventIds: 0
    },
    redaction: {
      passed: true,
      leakedMarkers: [],
      policy:
        "Исходные данные результата, локальные пути, ссылки хранения, токены и подписанные ссылки не отображаются."
    },
    page: {
      limit: 3,
      cursor: null,
      offset: 0,
      returned: 0,
      total: 0,
      nextCursor: null,
      hasMore: false
    },
    items: []
  };
}
