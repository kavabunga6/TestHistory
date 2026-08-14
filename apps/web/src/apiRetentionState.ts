import type {
  AttachmentPreviewRetentionApiState,
  AttachmentPreviewRetentionDryRunScheduleApiState,
  AttachmentPreviewRetentionDryRunScheduleRead,
  AttachmentPreviewRetentionPreviewRead
} from "./apiTypes.js";
import type { ApiLaunchRetentionReadModel, ApiProjectReadModel } from "./apiStateModels.js";
import { getJson } from "./apiHttp.js";
import { PermissionDeniedHttpError, getSafeDeniedMessage } from "./apiPermissions.js";

export async function loadAttachmentPreviewRetentionState(): Promise<AttachmentPreviewRetentionApiState> {
  try {
    const projects = await getJson<ApiProjectReadModel[]>("/api/v1/projects");
    const project = projects[0];
    if (project === undefined) {
      return {
        data: emptyAttachmentPreviewRetention("no-api-project", "no-closed-launch"),
        state: "empty"
      };
    }

    const launchesPayload = await getJson<
      ApiLaunchRetentionReadModel[] | { items: ApiLaunchRetentionReadModel[] }
    >(`/api/v1/projects/${encodeURIComponent(project.id)}/launches`);
    const launches = Array.isArray(launchesPayload) ? launchesPayload : launchesPayload.items;
    const closedLaunch = launches.find((launch) => launch.status === "closed");
    if (closedLaunch === undefined) {
      return {
        data: emptyAttachmentPreviewRetention(project.id, "no-closed-launch"),
        state: "empty"
      };
    }

    const data = await getJson<AttachmentPreviewRetentionPreviewRead>(
      `/api/v1/launches/${encodeURIComponent(
        closedLaunch.id
      )}/attachment-previews/retention/preview?limit=3`,
      {
        headers: {
          "x-testhistory-scopes": "artifacts:read",
          "x-testhistory-project-scope": project.id
        }
      }
    );

    return {
      data,
      state: data.summary.descriptorCount === 0 && data.items.length === 0 ? "empty" : "ready"
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

export async function loadAttachmentPreviewRetentionDryRunScheduleState(): Promise<AttachmentPreviewRetentionDryRunScheduleApiState> {
  try {
    const projects = await getJson<ApiProjectReadModel[]>("/api/v1/projects");
    const project = projects[0];
    if (project === undefined) {
      return {
        data: emptyAttachmentPreviewRetentionDryRunSchedule("no-api-project", "no-closed-launch"),
        state: "empty"
      };
    }

    const launchesPayload = await getJson<
      ApiLaunchRetentionReadModel[] | { items: ApiLaunchRetentionReadModel[] }
    >(`/api/v1/projects/${encodeURIComponent(project.id)}/launches`);
    const launches = Array.isArray(launchesPayload) ? launchesPayload : launchesPayload.items;
    const closedLaunch = launches.find((launch) => launch.status === "closed");
    if (closedLaunch === undefined) {
      return {
        data: emptyAttachmentPreviewRetentionDryRunSchedule(project.id, "no-closed-launch"),
        state: "empty"
      };
    }

    const data = await getJson<AttachmentPreviewRetentionDryRunScheduleRead>(
      `/api/v1/launches/${encodeURIComponent(
        closedLaunch.id
      )}/attachment-previews/retention/dry-run/schedule?limit=3`,
      {
        headers: {
          "x-testhistory-scopes": "artifacts:read",
          "x-testhistory-project-scope": project.id,
          "x-testhistory-actor-id": "retention-schedule-ui"
        }
      }
    );

    return {
      data,
      state:
        data.summary.scheduledDescriptorCount === 0 && data.batches.length === 0
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

function emptyAttachmentPreviewRetention(
  projectId: string,
  launchId: string
): AttachmentPreviewRetentionPreviewRead {
  return {
    kind: "attachment-preview-retention-preview",
    launch: {
      id: launchId,
      projectId,
      status: "closed",
      closedAt: null
    },
    access: {
      scope: "artifacts:read",
      projectScoped: true,
      mutation: false,
      redacted: true
    },
    execution: {
      deletionStarted: false,
      deletionMutation: false,
      providerActions: false,
      objectStorageTouched: false
    },
    boundary: {
      scope: "closed-launch",
      eligibleLaunchStatus: "closed",
      descriptorSource: "artifact-preview-descriptor-read-model",
      rawMaterialReturned: false
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
    summary: {
      descriptorCount: 0,
      cleanupEligibleDescriptorCount: 0,
      retainedDescriptorCount: 0,
      preservedDescriptorCount: 0,
      evidenceDescriptorCount: 0,
      legalHoldPlaceholderCount: 0,
      invalidDescriptorCount: 0
    },
    items: []
  };
}

function emptyAttachmentPreviewRetentionDryRunSchedule(
  projectId: string,
  launchId: string
): AttachmentPreviewRetentionDryRunScheduleRead {
  return {
    kind: "attachment-preview-retention-dry-run-schedule",
    scope: {
      projectId,
      launchId,
      actorId: "retention-schedule-ui"
    },
    access: {
      scope: "artifacts:read",
      projectScoped: true,
      actorScoped: true,
      mutation: false,
      redacted: true
    },
    query: {
      limit: 3,
      cursor: null
    },
    boundary: {
      scope: "closed-launch",
      workerScheduled: true,
      closedLaunchScoped: true,
      descriptorSource: "worker-scheduled-dry-run-evidence",
      rawMaterialReturned: false
    },
    execution: {
      dryRun: true,
      readOnly: true,
      workerExecutionAllowed: false,
      deletionMutation: false,
      deletionExecution: false,
      providerActions: false,
      objectStorageTouched: false,
      deleteRequestedCount: 0
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
    summary: {
      sourceDescriptorCount: 0,
      closedLaunchDescriptorCount: 0,
      cleanupEligibleDescriptorCount: 0,
      scheduledDescriptorCount: 0,
      retainedDescriptorCount: 0,
      invalidDescriptorCount: 0,
      duplicateDescriptorCount: 0,
      omittedDiagnosticCount: 0,
      scheduleDigest: "empty",
      projectionDigest: "empty",
      plannedOperations: [
        "artifact.preview.retention.classify",
        "artifact.preview.retention.dry-run.schedule"
      ],
      deleteRequestedCount: 0
    },
    transitions: [],
    batches: [],
    diagnostics: [],
    policy: {
      mutationAllowed: false,
      refreshAllowed: false,
      deletionExecution: false,
      providerActions: false,
      rawPayloadsIncluded: false,
      pathsIncluded: false,
      storageLocationsIncluded: false,
      signedUrlsIncluded: false,
      tokensIncluded: false,
      paginationRequired: true
    }
  };
}
