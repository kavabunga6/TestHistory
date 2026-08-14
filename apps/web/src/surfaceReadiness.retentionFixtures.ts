import type {
  ApiState,
  AttachmentPreviewRetentionDryRunScheduleRead,
  AttachmentPreviewRetentionPreviewRead
} from "./api.js";
import { onlineApiState } from "./surfaceReadiness.archiveFixtures.js";
export const readyAttachmentPreviewRetention: AttachmentPreviewRetentionPreviewRead = {
  kind: "attachment-preview-retention-preview",
  launch: {
    id: "closed-launch-retention",
    projectId: "project-1",
    status: "closed",
    closedAt: "2026-05-30T00:00:00.000Z"
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
    returned: 3,
    total: 3,
    nextCursor: null,
    hasMore: false
  },
  summary: {
    descriptorCount: 3,
    cleanupEligibleDescriptorCount: 1,
    retainedDescriptorCount: 1,
    preservedDescriptorCount: 1,
    evidenceDescriptorCount: 1,
    legalHoldPlaceholderCount: 1,
    invalidDescriptorCount: 0
  },
  items: [
    {
      id: "eligible-preview-artifact:preview-eligible",
      launchId: "closed-launch-retention",
      projectId: "project-1",
      artifactId: "eligible-preview-artifact",
      previewDescriptorId: "preview-eligible",
      status: "cleanup_eligible",
      observedAt: "2026-05-01T00:00:00.000Z",
      evaluatedAt: "2026-05-30T00:00:00.000Z",
      cleanupEligibleAt: "2026-05-08T00:00:00.000Z",
      descriptor: {
        kind: "text",
        flavor: "log",
        support: "inline",
        status: "ready",
        reason: "eligible",
        contentType: "text/plain",
        originalBytes: 18000,
        previewBytes: 512,
        maxPreviewBytes: 4096
      },
      retention: {
        retentionClass: "passed-short",
        policyClass: "short-lived-preview",
        auditReason: "passed-result-preview",
        retentionHorizonDays: 7,
        cleanupEligibility: {
          eligible: true,
          reason: "preview-retention-horizon-applies"
        },
        horizon: "7d"
      },
      evidencePreserved: false,
      legalHoldPlaceholder: false,
      deletion: {
        planned: false,
        executed: false,
        providerAction: false
      }
    },
    {
      id: "evidence-preview-artifact:preview-evidence",
      launchId: "closed-launch-retention",
      projectId: "project-1",
      artifactId: "evidence-preview-artifact",
      previewDescriptorId: "preview-evidence",
      status: "retained",
      observedAt: "2026-05-20T00:00:00.000Z",
      evaluatedAt: "2026-05-30T00:00:00.000Z",
      cleanupEligibleAt: null,
      descriptor: {
        kind: "json",
        flavor: "json",
        support: "metadata-only",
        status: "metadata-only",
        reason: "content-unavailable",
        contentType: "application/json",
        originalBytes: 6400,
        previewBytes: 0,
        maxPreviewBytes: 4096
      },
      retention: {
        retentionClass: "failed-evidence",
        policyClass: "evidence-retained",
        auditReason: "failed-result-preview",
        retentionHorizonDays: 30,
        cleanupEligibility: {
          eligible: false,
          reason: "failure-evidence-retained"
        },
        horizon: "30d"
      },
      evidencePreserved: true,
      legalHoldPlaceholder: false,
      deletion: {
        planned: false,
        executed: false,
        providerAction: false
      }
    },
    {
      id: "held-preview-artifact:preview-held",
      launchId: "closed-launch-retention",
      projectId: "project-1",
      artifactId: "held-preview-artifact",
      previewDescriptorId: "preview-held",
      status: "preserved",
      observedAt: "2026-01-01T00:00:00.000Z",
      evaluatedAt: "2026-05-30T00:00:00.000Z",
      cleanupEligibleAt: null,
      descriptor: {
        kind: "image",
        flavor: "image",
        support: "metadata-only",
        status: "metadata-only",
        reason: "image-metadata-only",
        contentType: "image/png",
        originalBytes: 120000,
        previewBytes: 0,
        maxPreviewBytes: 4096
      },
      retention: {
        retentionClass: "legal-hold",
        policyClass: "legal-hold-placeholder",
        auditReason: "legal-hold-preview",
        retentionHorizonDays: 3650,
        cleanupEligibility: {
          eligible: false,
          reason: "legal-hold-placeholder"
        },
        horizon: "3650d"
      },
      evidencePreserved: false,
      legalHoldPlaceholder: true,
      deletion: {
        planned: false,
        executed: false,
        providerAction: false
      }
    }
  ]
};

export const readyAttachmentPreviewRetentionSchedule: AttachmentPreviewRetentionDryRunScheduleRead =
  {
    kind: "attachment-preview-retention-dry-run-schedule",
    scope: {
      projectId: "project-1",
      launchId: "closed-launch-retention",
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
      scheduleDigest: "schedule-digest-safe",
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
      returned: 2,
      total: 2,
      nextCursor: null,
      hasMore: false
    },
    summary: {
      sourceDescriptorCount: 5,
      closedLaunchDescriptorCount: 4,
      skippedOpenLaunchDescriptorCount: 1,
      missingLaunchScopeDescriptorCount: 0,
      cleanupEligibleDescriptorCount: 3,
      scheduledDescriptorCount: 3,
      retainedDescriptorCount: 1,
      invalidDescriptorCount: 0,
      duplicateDescriptorCount: 1,
      omittedDiagnosticCount: 0,
      scheduleDigest: "schedule-digest-safe",
      projectionDigest: "projection-digest-safe",
      plannedOperations: [
        "artifact.preview.retention.classify",
        "artifact.preview.retention.dry-run.schedule"
      ],
      deleteRequestedCount: 0
    },
    transitions: [
      { state: "preview_retention_schedule_requested", at: "2026-05-30T00:00:00.000Z" },
      { state: "preview_retention_dry_run_batches_scheduled", at: "2026-05-30T00:00:00.000Z" }
    ],
    batches: [
      {
        index: 0,
        descriptorCount: 2,
        scheduledAfterMinutes: 0,
        maxCount: 250,
        descriptorRefs: ["preview-retention-descriptor:one", "preview-retention-descriptor:two"],
        omittedDescriptorRefCount: 0,
        batchDigest: "batch-digest-one",
        deletionExecution: false,
        deleteRequestedCount: 0
      },
      {
        index: 1,
        descriptorCount: 1,
        scheduledAfterMinutes: 5,
        maxCount: 250,
        descriptorRefs: ["preview-retention-descriptor:three"],
        omittedDescriptorRefCount: 0,
        batchDigest: "batch-digest-two",
        deletionExecution: false,
        deleteRequestedCount: 0
      }
    ],
    diagnostics: [
      {
        code: "open-launch-descriptor-skipped",
        severity: "info",
        retryable: false,
        descriptorRef: "preview-retention-descriptor:open",
        message: "Preview descriptor was not scheduled because launch is not closed."
      }
    ],
    policy: {
      equalOrNarrowerThanRest: true,
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

export const retentionReadyApiState: ApiState = {
  ...onlineApiState,
  attachmentPreviewRetention: {
    data: readyAttachmentPreviewRetention,
    state: "ready"
  },
  attachmentPreviewRetentionSchedule: {
    data: readyAttachmentPreviewRetentionSchedule,
    state: "ready"
  }
};

export const retentionEmptyApiState: ApiState = {
  ...onlineApiState,
  attachmentPreviewRetention: {
    data: {
      ...readyAttachmentPreviewRetention,
      page: {
        ...readyAttachmentPreviewRetention.page,
        returned: 0,
        total: 0
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
    },
    state: "empty"
  },
  attachmentPreviewRetentionSchedule: {
    data: {
      ...readyAttachmentPreviewRetentionSchedule,
      page: {
        ...readyAttachmentPreviewRetentionSchedule.page,
        returned: 0,
        total: 0
      },
      summary: {
        ...readyAttachmentPreviewRetentionSchedule.summary,
        scheduledDescriptorCount: 0,
        cleanupEligibleDescriptorCount: 0,
        deleteRequestedCount: 0
      },
      batches: [],
      diagnostics: []
    },
    state: "empty"
  }
};
