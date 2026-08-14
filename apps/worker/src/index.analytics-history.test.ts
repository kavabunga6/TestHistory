import { describe, expect, it } from "vitest";

import {
  createArtifactPreviewDescriptor,
  createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors,
  type ArtifactDescriptor
} from "@testhistory/artifacts";
import {
  createSecurityAuditExportLifecycleEvent,
  createHistoryComparePermissionAuditEvent,
  evaluateSecurityAuditExportPolicy,
  replaySecurityAuditExportLifecycleEvents,
  type DefectMuteAuditEvent,
  type HistoryComparePermissionAuditEvent,
  type SecurityAuditExportLifecycleEvent,
  type SecurityAuditExportLifecycleProjection,
  type SecurityAuditExportRequest
} from "@testhistory/domain";

import {
  buildAnalyticsDefectClusterProjections,
  buildAnalyticsMaterializePipelinePlan,
  buildArchiveDiagnosticReplayPlan,
  buildArchiveIntakeExecutionPlan,
  buildArtifactPreviewGenerationPlan,
  buildArtifactPreviewRetentionEligibilityPlan,
  buildAttachmentPreviewRetentionDryRunArtifactScheduleMaterializationPlan,
  buildAttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationPlan,
  buildAttachmentPreviewRetentionDryRunSchedulePlan,
  buildDefectMuteProjectionPlan,
  buildDefectMuteReplayInvariantMaterializationPlan,
  buildHistoryComparePermissionAuditMaterializationPlan,
  buildIngestionParseMetadataSummary,
  createInMemoryArchiveDiagnosticReplayAdapter,
  createInMemoryArtifactPreviewDescriptorStoreAdapter,
  createInMemoryDefectMuteProjectionAdapter,
  createInMemoryDefectMuteReplayInvariantMaterializationAdapter,
  createInMemoryHistoryComparePermissionAuditSnapshotAdapter,
  createInMemorySearchIndexProjectionAdapter,
  createMockRabbitMqAdapter,
  createInMemoryDispatcher,
  mapArchiveParserManifestToWorkerManifest,
  processApiUploadQueue,
  reconcileArchiveParserDiagnostics,
  sanitizeLogValue,
  validateWorkerJobEnvelope,
  WorkerJobValidationError,
  workerJobNames,
  type AnalyticsProjectionResult,
  type ArchiveDiagnosticReplayEvent,
  type ArchiveDiagnosticReplayJobPayload,
  type ArchiveManifestIngestionPayload,
  type EnqueueWorkerJob,
  type WorkerLogger,
  type WorkerPipelinePorts
} from "./index.js";

const ingestionJob = {
  id: "job-1",
  name: "ingestion.parse",
  traceId: "trace-1",
  payload: {
    projectId: "project-1",
    launchId: "launch-1",
    source: {
      format: "allure-results",
      uri: "s3://bucket/allure-results"
    }
  }
} satisfies EnqueueWorkerJob<"ingestion.parse">;

const ingestionJobWithDescriptors = {
  ...ingestionJob,
  id: "job-with-descriptors",
  payload: {
    ...ingestionJob.payload,
    importId: "synthetic-import-secret",
    idempotencyKey: "synthetic-idempotency-secret",
    allure: {
      results: [
        {
          source: "synthetic-result-secret-name.json",
          uuid: "result-1",
          historyId: "history-1",
          testCaseId: "case-1",
          fullName: "Synthetic checkout should hide raw names",
          name: "synthetic test name with secret",
          status: "passed",
          start: 100,
          stop: 175,
          contentDigest: {
            algorithm: "sha256",
            value: "synthetic-result-digest-secret"
          },
          attachmentSources: ["synthetic-screen-secret.png", "synthetic-log-secret.txt"]
        },
        {
          source: "synthetic-failed-result.json",
          status: "failed"
        }
      ],
      attachments: [
        {
          source: "synthetic-screen-secret.png",
          name: "synthetic screenshot secret",
          type: "image/png",
          sizeBytes: 2048,
          contentDigest: {
            algorithm: "sha256",
            value: "synthetic-attachment-digest-secret"
          },
          referencedByResultUuid: "result-1"
        },
        {
          source: "synthetic-log-secret.txt",
          name: "synthetic log secret",
          type: "text/plain; charset=utf-8",
          sizeBytes: 512
        },
        {
          source: "synthetic-unsafe-type.bin",
          type: "text/plain token=synthetic-secret"
        }
      ]
    }
  }
} satisfies EnqueueWorkerJob<"ingestion.parse">;

const quietLogger: WorkerLogger = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

const launchCloseJob = {
  id: "close-job-1",
  name: "launch.close",
  traceId: "trace-close-1",
  payload: {
    projectId: "project-1",
    launchId: "launch-1",
    closedBy: "user-1"
  }
} satisfies EnqueueWorkerJob<"launch.close">;

const retentionExpiredAt = "2026-05-20T00:00:00.000Z";
const cleanupEligibleAt = "2026-05-21T00:00:00.000Z";

function createNoopPipelinePorts(): WorkerPipelinePorts {
  return {
    launchClose: {
      planClose: ({ job, at }) => ({
        transitions: [{ state: "close_requested", at }],
        childJobs: [],
        summary: {
          projectId: job.payload.projectId,
          launchId: job.payload.launchId,
          childJobCount: 0
        }
      })
    },
    testCases: {
      planSync: ({ payload, at }) => ({
        transitions: [{ state: "sync_requested", at }],
        summary: {
          projectId: payload.projectId,
          launchId: payload.launchId
        }
      })
    },
    analytics: {
      listProjectionResults: () => [],
      planMaterialize: ({ payload, at }) => ({
        transitions: [{ state: "materialize_requested", at }],
        facts: [],
        searchIndexDocuments: [],
        defectClusters: [],
        summary: {
          projectId: payload.projectId,
          launchId: payload.launchId ?? "all"
        }
      })
    },
    artifacts: {
      listRetentionArtifacts: () => [],
      listClosedLaunchIds: () => []
    },
    artifactPreviews: {
      listPreviewSources: () => [],
      listRetentionDescriptors: () => [],
      store: createInMemoryArtifactPreviewDescriptorStoreAdapter()
    },
    searchIndex: createInMemorySearchIndexProjectionAdapter(),
    defectMutes: createInMemoryDefectMuteProjectionAdapter(),
    archiveDiagnostics: createInMemoryArchiveDiagnosticReplayAdapter()
  };
}

function artifactDescriptor(input: {
  id: string;
  launchId: string;
  storedBytes: number;
  storageKey: string;
  sha256?: string;
  contentType?: string;
}): ArtifactDescriptor {
  return {
    id: input.id,
    launchId: input.launchId,
    projectId: "project-1",
    path: `[redacted-path]/${input.id}`,
    kind: "attachment",
    contentType: input.contentType ?? "text/plain",
    originalBytes: input.storedBytes,
    storedBytes: input.storedBytes,
    sha256: input.sha256 ?? `${input.id}-sha256`,
    compression: "none",
    compressionMetadata: {
      algorithm: "none",
      originalBytes: input.storedBytes,
      storedBytes: input.storedBytes,
      ratio: 1,
      savedBytes: 0
    },
    storage: {
      backend: "s3-compatible",
      accessTier: "frequent",
      diskIsolation: "separate-from-db",
      kubernetesVolume: "csi",
      key: input.storageKey as ArtifactDescriptor["storageKey"]
    },
    storageKey: input.storageKey as ArtifactDescriptor["storageKey"],
    expiresAt: retentionExpiredAt,
    retention: {
      days: 1,
      expiresAt: retentionExpiredAt,
      cleanupEligibleAt
    },
    cleanup: {
      status: "eligible",
      reason: "retention-expired",
      evaluatedAt: cleanupEligibleAt
    },
    upload: {
      resultStatus: "passed",
      source: "result"
    },
    createdAt: "2026-05-01T00:00:00.000Z"
  };
}

function projectionResult(input: AnalyticsProjectionResult): AnalyticsProjectionResult {
  return input;
}

function defectMuteEvent(input: {
  id: string;
  type?: DefectMuteAuditEvent["type"];
  muteId: string;
  projectId?: string;
  occurredAt: string;
  reason?: string;
  signatureHash?: string;
  testCaseId?: string;
  actorId?: string;
  resultUuid?: string;
  launchId?: string;
  launchName?: string;
  status?: "failed" | "broken";
}): DefectMuteAuditEvent {
  const signatureHash = input.signatureHash ?? "signature-muted";
  const testCaseId = input.testCaseId ?? "case-muted";
  return {
    id: input.id,
    type: input.type ?? "defect.muted",
    muteId: input.muteId,
    projectId: input.projectId ?? "project-1",
    occurredAt: input.occurredAt,
    origin: { type: "actor", actorId: input.actorId ?? "qa-user" },
    scope: { signatureHashes: [signatureHash], testCaseIds: [testCaseId] },
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    affectedSignatureHashes: [signatureHash],
    affectedTestIds: [testCaseId],
    rawFailureHistory: [
      {
        signatureHash,
        launchId: input.launchId ?? "launch-muted",
        launchName: input.launchName ?? "main #100",
        launchCreatedAt: "2026-05-30T09:00:00.000Z",
        resultUuid: input.resultUuid ?? "result-muted",
        testId: testCaseId,
        status: input.status ?? "failed"
      }
    ]
  };
}

function historyComparePermissionAuditEvent(input: {
  projectId?: string;
  actorId?: string;
  testCaseId?: string;
  compareId?: string;
  baseResultUuid?: string;
  targetResultUuid?: string;
  occurredAt: string;
  decision?: "denied" | "partial" | "ready";
  unavailable?: readonly string[];
  reasonCode?: string;
  reasonSeverity?: "info" | "warn" | "deny";
  rawSecret?: string;
}): HistoryComparePermissionAuditEvent {
  const decision = input.decision ?? "ready";
  const severity =
    input.reasonSeverity ??
    (decision === "denied" ? "deny" : decision === "partial" ? "warn" : "info");
  return createHistoryComparePermissionAuditEvent({
    projectId: input.projectId ?? "project-1",
    actorId: input.actorId ?? "actor-1",
    testCaseId: input.testCaseId ?? "case-history",
    ...(input.compareId !== undefined ? { compareId: input.compareId } : {}),
    baseResultUuid: input.baseResultUuid ?? "result-base",
    targetResultUuid: input.targetResultUuid ?? "result-target",
    occurredAt: input.occurredAt,
    decision,
    reasons: [
      {
        code:
          input.reasonCode ??
          (decision === "denied"
            ? "history_compare_permission.project_scope_denied"
            : decision === "partial"
              ? "history_compare_permission.field_hidden"
              : "history_compare_permission.ready"),
        severity,
        explanation:
          decision === "ready"
            ? "Synthetic selected-case compare is available."
            : "Synthetic selected-case compare was narrowed before worker materialization.",
        fields: decision === "ready" ? ["history.summary"] : ["hidden.token", "raw.compare.input"]
      }
    ],
    unavailable:
      input.unavailable ??
      (decision === "partial"
        ? ["rawHistory.items", "compare.inputs"]
        : decision === "denied"
          ? ["historyCompare"]
          : []),
    rawHistory: {
      entries: [
        {
          path: `C:\\ci\\Downloads\\synthetic-results\\${input.rawSecret ?? "history-secret"}.json`,
          storageRef: `storage://bucket/${input.rawSecret ?? "history-secret"}`,
          signedUrl: `https://storage.test/file?X-Amz-Signature=${input.rawSecret ?? "history-secret"}`,
          token: `Bearer ${input.rawSecret ?? "history-secret"}`
        }
      ]
    }
  });
}

function archiveDiagnosticEvent(
  input: Partial<ArchiveDiagnosticReplayEvent> & { id: string }
): ArchiveDiagnosticReplayEvent {
  return {
    id: input.id,
    projectId: input.projectId ?? "project-1",
    launchId: input.launchId ?? "launch-closed",
    archiveRef: input.archiveRef ?? "archive:synthetic-closed",
    occurredAt: input.occurredAt ?? "2026-05-30T12:00:00.000Z",
    source: input.source ?? "archive.diagnostics.read",
    launchState: input.launchState ?? "closed",
    code: input.code ?? "parser-diagnostic",
    severity: input.severity ?? "warn",
    retryable: input.retryable ?? false,
    ...(input.entryRef !== undefined ? { entryRef: input.entryRef } : {}),
    ...(input.chunkRef !== undefined ? { chunkRef: input.chunkRef } : {}),
    ...(input.message !== undefined ? { message: input.message } : {}),
    ...(input.rawPath !== undefined ? { rawPath: input.rawPath } : {}),
    ...(input.storageRef !== undefined ? { storageRef: input.storageRef } : {}),
    ...(input.signedUrl !== undefined ? { signedUrl: input.signedUrl } : {}),
    ...(input.token !== undefined ? { token: input.token } : {})
  };
}

describe("worker queue dispatcher analytics-history", () => {
  it("schedules descriptor-backed attachment preview retention dry-run batches deterministically", () => {
    const closedSources = Array.from({ length: 525 }, (_, index) => ({
      launchId: "launch-closed",
      observedAt: "2026-05-01T00:00:00.000Z",
      retentionClass: "passed-short" as const,
      descriptor: createArtifactPreviewDescriptor({
        artifact: artifactDescriptor({
          id: `closed-preview-${index}`,
          launchId: "launch-closed",
          storedBytes: 64,
          storageKey: `launch-closed/raw/descriptor-retention-token-${index}.txt`,
          sha256: `descriptor-retention-secret-${index}`,
          contentType: "text/plain"
        }),
        content: `preview body token=descriptor-retention-secret-${index}`
      })
    }));
    const openSource = {
      launchId: "launch-open",
      observedAt: "2026-05-01T00:00:00.000Z",
      retentionClass: "passed-short" as const,
      descriptor: createArtifactPreviewDescriptor({
        artifact: artifactDescriptor({
          id: "open-preview",
          launchId: "launch-open",
          storedBytes: 64,
          storageKey: "launch-open/raw/open-descriptor-retention-secret.txt",
          sha256: "open-descriptor-retention-secret",
          contentType: "text/plain"
        }),
        content: "preview body token=open-descriptor-retention-secret"
      })
    };
    const missingScopeSource = {
      observedAt: "2026-05-01T00:00:00.000Z",
      retentionClass: "passed-short" as const,
      descriptor: createArtifactPreviewDescriptor({
        artifact: artifactDescriptor({
          id: "missing-scope-preview",
          launchId: "launch-missing",
          storedBytes: 64,
          storageKey: "launch-missing/raw/missing-descriptor-retention-secret.txt",
          sha256: "missing-descriptor-retention-secret",
          contentType: "text/plain"
        }),
        content: "preview body token=missing-descriptor-retention-secret"
      })
    };
    const sources = [...closedSources, openSource, missingScopeSource];

    const plan = buildAttachmentPreviewRetentionDryRunSchedulePlan({
      sources,
      closedLaunchIds: ["launch-closed"],
      at: "2026-05-30T12:00:00.000Z",
      batchSize: 1_000
    });
    const replayed = buildAttachmentPreviewRetentionDryRunSchedulePlan({
      sources: [...sources].reverse(),
      closedLaunchIds: ["launch-closed"],
      at: "2026-05-30T12:00:00.000Z",
      batchSize: 1_000
    });
    const serialized = JSON.stringify(plan);

    expect(replayed).toEqual(plan);
    expect(plan).toMatchObject({
      boundary: "worker-local-attachment-preview-retention-dry-run-scheduling",
      consistency: "retry-safe-idempotent-descriptor-schedule",
      scope: "closed-launches",
      dryRun: true,
      readOnly: true,
      deletionExecution: false,
      deleteRequestedCount: 0,
      requestedBatchSize: 1000,
      plannedBatchSize: 250,
      batchCount: 3,
      summary: {
        sourceDescriptorCount: 527,
        closedLaunchDescriptorCount: 525,
        skippedOpenLaunchDescriptorCount: 1,
        missingLaunchScopeDescriptorCount: 1,
        cleanupEligibleDescriptorCount: 525,
        scheduledDescriptorCount: 525,
        deleteRequestedCount: 0,
        scheduleDigest: expect.any(String),
        projectionDigest: expect.any(String),
        plannedOperations: [
          "artifact.preview.retention.classify",
          "artifact.preview.retention.dry-run.schedule"
        ]
      }
    });
    expect(plan.batches).toEqual([
      expect.objectContaining({
        index: 0,
        descriptorCount: 250,
        scheduledAfterMinutes: 0,
        maxCount: 250,
        omittedDescriptorRefCount: 230,
        batchDigest: expect.any(String),
        deletionExecution: false,
        deleteRequestedCount: 0
      }),
      expect.objectContaining({
        index: 1,
        descriptorCount: 250,
        scheduledAfterMinutes: 5,
        omittedDescriptorRefCount: 230,
        deletionExecution: false
      }),
      expect.objectContaining({
        index: 2,
        descriptorCount: 25,
        scheduledAfterMinutes: 10,
        omittedDescriptorRefCount: 5,
        deletionExecution: false
      })
    ]);
    expect(plan.batches[0]?.descriptorRefs).toHaveLength(20);
    expect(plan.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "open-launch-descriptor-skipped" }),
        expect.objectContaining({ code: "missing-launch-scope" })
      ])
    );
    expect(serialized).not.toContain("descriptor-retention-secret");
    expect(serialized).not.toContain("raw/");
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("signedUrl");
    expect(serialized).not.toContain("token=");
    expect(serialized).not.toContain("s3");
    expect(serialized).not.toContain("minio");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("deleteObjects");
    expect(serialized).not.toContain("cleanup.execution.planned");
  });

  it("materializes artifact schedule descriptors for closed launches without deletion or provider claims", () => {
    const artifacts = [
      artifactDescriptor({
        id: "closed-materialized-a",
        launchId: "launch-closed",
        storedBytes: 96,
        storageKey: "synthetic-closed/raw/materialized-token-a.txt",
        sha256: "synthetic-materialized-secret-a",
        contentType: "text/plain"
      }),
      artifactDescriptor({
        id: "closed-materialized-b",
        launchId: "launch-closed",
        storedBytes: 128,
        storageKey: "synthetic-closed/raw/materialized-token-b.xml",
        sha256: "synthetic-materialized-secret-b",
        contentType: "application/xml"
      }),
      artifactDescriptor({
        id: "closed-materialized-c",
        launchId: "launch-closed",
        storedBytes: 160,
        storageKey: "synthetic-closed/raw/materialized-token-c.png",
        sha256: "synthetic-materialized-secret-c",
        contentType: "image/png"
      }),
      artifactDescriptor({
        id: "open-materialized",
        launchId: "launch-open",
        storedBytes: 192,
        storageKey: "synthetic-open/raw/open-materialized-token.txt",
        sha256: "synthetic-open-materialized-secret",
        contentType: "text/plain"
      })
    ];
    const scheduleDescriptors = createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors({
      artifacts,
      closedLaunchIds: ["launch-closed"],
      now: new Date("2026-05-30T12:00:00.000Z"),
      maxDescriptorsPerSchedule: 2,
      scheduleIntervalMinutes: 7
    });
    const replayScheduleDescriptors = {
      ...scheduleDescriptors,
      schedules: [...scheduleDescriptors.schedules].reverse()
    };

    const plan = buildAttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationPlan({
      scheduleDescriptors,
      at: "2026-05-30T12:00:00.000Z",
      maxDescriptorRefsPerRecord: 1
    });
    const replay = buildAttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationPlan({
      scheduleDescriptors: replayScheduleDescriptors,
      at: "2026-05-30T12:00:00.000Z",
      maxDescriptorRefsPerRecord: 1
    });
    const fromArtifacts = buildAttachmentPreviewRetentionDryRunArtifactScheduleMaterializationPlan({
      artifacts: [...artifacts].reverse(),
      closedLaunchIds: ["launch-closed"],
      at: "2026-05-30T12:00:00.000Z",
      maxDescriptorsPerSchedule: 2,
      scheduleIntervalMinutes: 7,
      maxDescriptorRefsPerRecord: 1
    });
    const serialized = JSON.stringify(plan);

    expect(replay).toEqual(plan);
    expect(fromArtifacts.summary.sourceScheduleDigest).toBe(plan.summary.sourceScheduleDigest);
    expect(fromArtifacts.summary.scheduleDigest).toBe(plan.summary.scheduleDigest);
    expect(plan).toMatchObject({
      boundary: "worker-local-attachment-preview-retention-dry-run-schedule-materialization",
      consistency: "retry-safe-idempotent-descriptor-schedule-materialization",
      scope: "closed-launches",
      dryRun: true,
      readOnly: true,
      executionMode: "dry-run",
      mutationAllowed: false,
      deletionExecution: false,
      deleteRequestedCount: 0,
      summary: {
        scannedArtifactCount: 4,
        stagedCandidateCount: 3,
        descriptorCount: 3,
        materializedDescriptorCount: 3,
        scheduleDescriptorCount: 2,
        skippedOpenLaunchRecords: 1,
        skippedNonAttachmentRecords: 0,
        retainedRecordCount: 0,
        sourceScheduleDigest: scheduleDescriptors.scheduleDigest,
        plannedOperations: [
          "artifact.preview.retention.dry-run.schedule.describe",
          "artifact.preview.retention.dry-run.schedule.materialize"
        ]
      }
    });
    expect(plan.records).toEqual([
      expect.objectContaining({
        index: 0,
        descriptorCount: 2,
        scheduledAfterMinutes: 0,
        maxDescriptors: 2,
        omittedDescriptorRefCount: 1,
        dryRun: true,
        mutationAllowed: false,
        deletionExecution: false,
        deleteRequestedCount: 0,
        safety: expect.objectContaining({
          closedLaunchScope: true,
          storageKeyIncluded: false,
          objectTargetIncluded: false,
          signedUrlIncluded: false,
          credentialIncluded: false,
          mutationAllowed: false
        })
      }),
      expect.objectContaining({
        index: 1,
        descriptorCount: 1,
        scheduledAfterMinutes: 7,
        omittedDescriptorRefCount: 0,
        deletionExecution: false
      })
    ]);
    expect(plan.records[0]?.descriptorRefs).toHaveLength(1);
    expect(serialized).not.toContain("synthetic-materialized-secret");
    expect(serialized).not.toContain("synthetic-open-materialized-secret");
    expect(serialized).not.toContain("raw/");
    expect(serialized).not.toContain("token=");
    expect(serialized).not.toContain("https://");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("deleteObjects");
    expect(serialized).not.toContain("cleanup.execution.planned");
    expect(serialized).not.toContain("provider");
  });

  it("retains closed-launch descriptor schedule materialization evidence idempotently across retry", () => {
    const artifacts = [
      {
        ...artifactDescriptor({
          id: "closed-schedule-materialization-a",
          launchId: "launch-closed",
          storedBytes: 96,
          storageKey: "storage://fixture/closed/raw-schedule-secret-a",
          sha256: "synthetic-schedule-secret-a",
          contentType: "text/plain"
        }),
        path: "/fixture/local/raw-schedule-secret-a.txt",
        storageRef: "storage://fixture/ref/raw-schedule-secret-a",
        signedUrl: "https://fixture.invalid/object?X-Amz-Signature=raw-schedule-secret-a",
        token: "raw-schedule-secret-a",
        rawBlob: "raw-schedule-secret-a"
      },
      {
        ...artifactDescriptor({
          id: "open-schedule-materialization",
          launchId: "launch-open",
          storedBytes: 128,
          storageKey: "storage://fixture/open/raw-schedule-secret-open",
          sha256: "synthetic-schedule-secret-open",
          contentType: "image/png"
        }),
        path: "/fixture/local/raw-schedule-secret-open.png",
        storageRef: "storage://fixture/ref/raw-schedule-secret-open",
        signedUrl: "https://fixture.invalid/object?X-Amz-Signature=raw-schedule-secret-open",
        token: "raw-schedule-secret-open",
        rawBlob: "raw-schedule-secret-open"
      },
      {
        ...artifactDescriptor({
          id: "closed-schedule-materialization-b",
          launchId: "launch-closed",
          storedBytes: 160,
          storageKey: "storage://fixture/closed/raw-schedule-secret-b",
          sha256: "synthetic-schedule-secret-b",
          contentType: "application/xml"
        }),
        path: "/fixture/local/raw-schedule-secret-b.xml",
        storageRef: "storage://fixture/ref/raw-schedule-secret-b",
        signedUrl: "https://fixture.invalid/object?X-Amz-Signature=raw-schedule-secret-b",
        token: "raw-schedule-secret-b",
        rawBlob: "raw-schedule-secret-b"
      }
    ];
    const scheduleDescriptors = createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors({
      artifacts,
      closedLaunchIds: ["launch-closed"],
      now: new Date("2026-05-30T12:00:00.000Z"),
      maxDescriptorsPerSchedule: 1,
      scheduleIntervalMinutes: 3
    });
    const plan = buildAttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationPlan({
      scheduleDescriptors,
      at: "2026-05-30T12:00:00.000Z",
      maxDescriptorRefsPerRecord: 1
    });
    const retryPlan = buildAttachmentPreviewRetentionDryRunScheduleDescriptorMaterializationPlan({
      scheduleDescriptors: {
        ...scheduleDescriptors,
        schedules: [...scheduleDescriptors.schedules].reverse()
      },
      at: "2026-05-30T12:00:00.000Z",
      maxDescriptorRefsPerRecord: 1
    });
    const recordsByScheduleRef = new Map<string, (typeof plan.records)[number]>();
    let deleteInvocationCount = 0;
    const applyEvidence = (materializationPlan: typeof plan) => {
      let createdRecordCount = 0;
      let unchangedRecordCount = 0;
      let updatedRecordCount = 0;

      if (
        materializationPlan.deletionExecution ||
        materializationPlan.deleteRequestedCount !== 0 ||
        materializationPlan.records.some(
          (record) => record.deletionExecution || record.deleteRequestedCount !== 0
        )
      ) {
        deleteInvocationCount += 1;
        throw new Error("Descriptor materialization retry guard must not execute deletion.");
      }

      for (const record of materializationPlan.records) {
        const previous = recordsByScheduleRef.get(record.scheduleRef);
        if (previous === undefined) {
          createdRecordCount += 1;
        } else if (previous.scheduleDigest === record.scheduleDigest) {
          unchangedRecordCount += 1;
        } else {
          updatedRecordCount += 1;
        }

        recordsByScheduleRef.set(record.scheduleRef, record);
      }

      return {
        boundary: materializationPlan.boundary,
        consistency: materializationPlan.consistency,
        scope: materializationPlan.scope,
        dryRun: materializationPlan.dryRun,
        executionMode: materializationPlan.executionMode,
        mutationAllowed: materializationPlan.mutationAllowed,
        deletionExecution: materializationPlan.deletionExecution,
        deleteRequestedCount: materializationPlan.deleteRequestedCount,
        sourceScheduleDigest: materializationPlan.summary.sourceScheduleDigest,
        scheduleDigest: materializationPlan.summary.scheduleDigest,
        materializedDescriptorCount: materializationPlan.summary.materializedDescriptorCount,
        createdRecordCount,
        unchangedRecordCount,
        updatedRecordCount,
        deleteInvocationCount,
        totalRecordCount: recordsByScheduleRef.size
      };
    };
    const snapshot = () =>
      [...recordsByScheduleRef.values()].sort((left, right) => left.index - right.index);

    const firstApply = applyEvidence(plan);
    const retryApply = applyEvidence(retryPlan);
    const existingDescriptorRetryApply = applyEvidence(plan);
    const evidenceSnapshot = {
      firstApply,
      retryApply,
      existingDescriptorRetryApply,
      records: snapshot()
    };
    const serializedEvidence = JSON.stringify(evidenceSnapshot);

    expect(retryPlan).toEqual(plan);
    expect(scheduleDescriptors).toMatchObject({
      scope: "closed-launches",
      artifactKind: "attachment",
      dryRun: true,
      executionMode: "dry-run",
      mutationAllowed: false,
      scannedArtifactCount: 3,
      stagedCandidateCount: 2,
      descriptorCount: 2,
      scheduleDescriptorCount: 2,
      skippedOpenLaunchRecords: 1,
      safety: expect.objectContaining({
        bounded: true,
        descriptorOnly: true,
        closedLaunchScope: true,
        providerMutationHandleIncluded: false,
        mutationAllowed: false
      })
    });
    expect(scheduleDescriptors.schedules).toEqual([
      expect.objectContaining({
        descriptorCount: 1,
        scheduledAfterMinutes: 0,
        dryRun: true,
        executionMode: "dry-run",
        mutationAllowed: false,
        safety: expect.objectContaining({
          bounded: true,
          descriptorOnly: true,
          closedLaunchScope: true,
          providerMutationHandleIncluded: false,
          mutationAllowed: false
        })
      }),
      expect.objectContaining({
        descriptorCount: 1,
        scheduledAfterMinutes: 3,
        dryRun: true,
        executionMode: "dry-run",
        mutationAllowed: false
      })
    ]);
    expect(plan).toMatchObject({
      boundary: "worker-local-attachment-preview-retention-dry-run-schedule-materialization",
      consistency: "retry-safe-idempotent-descriptor-schedule-materialization",
      scope: "closed-launches",
      dryRun: true,
      readOnly: true,
      executionMode: "dry-run",
      mutationAllowed: false,
      deletionExecution: false,
      deleteRequestedCount: 0,
      summary: expect.objectContaining({
        sourceScheduleDigest: scheduleDescriptors.scheduleDigest,
        scannedArtifactCount: 3,
        stagedCandidateCount: 2,
        descriptorCount: 2,
        materializedDescriptorCount: 2,
        scheduleDescriptorCount: 2,
        skippedOpenLaunchRecords: 1,
        scheduleDigest: expect.any(String),
        plannedOperations: [
          "artifact.preview.retention.dry-run.schedule.describe",
          "artifact.preview.retention.dry-run.schedule.materialize"
        ]
      })
    });
    expect(plan.records).toEqual([
      expect.objectContaining({
        descriptorCount: 1,
        scheduledAfterMinutes: 0,
        omittedDescriptorRefCount: 0,
        dryRun: true,
        executionMode: "dry-run",
        mutationAllowed: false,
        deletionExecution: false,
        deleteRequestedCount: 0,
        safety: expect.objectContaining({
          bounded: true,
          descriptorOnly: true,
          closedLaunchScope: true,
          pathIncluded: false,
          storageKeyIncluded: false,
          objectTargetIncluded: false,
          rawPayloadIncluded: false,
          blobIncluded: false,
          signedUrlIncluded: false,
          credentialIncluded: false,
          mutationAllowed: false
        })
      }),
      expect.objectContaining({
        descriptorCount: 1,
        scheduledAfterMinutes: 3,
        deletionExecution: false,
        deleteRequestedCount: 0
      })
    ]);
    expect(plan.records.every((record) => record.descriptorRefs.length <= 1)).toBe(true);
    expect(firstApply).toMatchObject({
      dryRun: true,
      executionMode: "dry-run",
      mutationAllowed: false,
      deletionExecution: false,
      deleteRequestedCount: 0,
      sourceScheduleDigest: scheduleDescriptors.scheduleDigest,
      materializedDescriptorCount: 2,
      createdRecordCount: 2,
      unchangedRecordCount: 0,
      updatedRecordCount: 0,
      deleteInvocationCount: 0,
      totalRecordCount: 2
    });
    expect(retryApply).toMatchObject({
      dryRun: true,
      executionMode: "dry-run",
      mutationAllowed: false,
      deletionExecution: false,
      deleteRequestedCount: 0,
      sourceScheduleDigest: scheduleDescriptors.scheduleDigest,
      materializedDescriptorCount: 2,
      createdRecordCount: 0,
      unchangedRecordCount: 2,
      updatedRecordCount: 0,
      deleteInvocationCount: 0,
      totalRecordCount: 2
    });
    expect(existingDescriptorRetryApply).toMatchObject({
      dryRun: true,
      executionMode: "dry-run",
      mutationAllowed: false,
      deletionExecution: false,
      deleteRequestedCount: 0,
      sourceScheduleDigest: scheduleDescriptors.scheduleDigest,
      materializedDescriptorCount: 2,
      createdRecordCount: 0,
      unchangedRecordCount: 2,
      updatedRecordCount: 0,
      deleteInvocationCount: 0,
      totalRecordCount: 2
    });
    expect(snapshot()).toEqual(plan.records);
    expect(serializedEvidence).not.toContain("raw-schedule-secret");
    expect(serializedEvidence).not.toContain("synthetic-schedule-secret");
    expect(serializedEvidence).not.toContain("/fixture/local");
    expect(serializedEvidence).not.toContain("storage://");
    expect(serializedEvidence).not.toContain('"storageKey":');
    expect(serializedEvidence).not.toContain("storageRef");
    expect(serializedEvidence).not.toContain('"signedUrl":');
    expect(serializedEvidence).not.toContain("https://");
    expect(serializedEvidence).not.toContain("X-Amz-Signature");
    expect(serializedEvidence).not.toContain("token");
    expect(serializedEvidence).not.toContain("rawBlob");
    expect(serializedEvidence).not.toContain("deleteObjects");
    expect(serializedEvidence).not.toContain("cleanup.batch.delete");
    expect(serializedEvidence).not.toContain("cleanup.execution.planned");
    expect(serializedEvidence).not.toContain("providerMutationHandle");
    expect(serializedEvidence).not.toMatch(
      /\b(?:storageRef|signedUrl|accessToken|authorization|Bearer)\b/i
    );
  });

  it("applies preview descriptors idempotently after a partial adapter write retry", async () => {
    const messages: string[] = [];
    const store = createInMemoryArtifactPreviewDescriptorStoreAdapter();
    const previewSources = [
      {
        artifact: artifactDescriptor({
          id: "retry-preview-log",
          launchId: "launch-1",
          storedBytes: 256,
          storageKey: "launch-1/raw/retry-log-secret.txt",
          sha256: "sha-retry-log-secret",
          contentType: "text/plain"
        }),
        content: "retry preview body token=retry-preview-secret",
        maxPreviewBytes: 64
      },
      {
        artifact: artifactDescriptor({
          id: "retry-preview-image",
          launchId: "launch-1",
          storedBytes: 1_024,
          storageKey: "launch-1/raw/retry-image-secret.png",
          sha256: "sha-retry-image-secret",
          contentType: "image/png"
        }),
        content: Buffer.from("retry-image-raw-secret")
      }
    ];
    let applyCalls = 0;
    const ports: WorkerPipelinePorts = {
      ...createNoopPipelinePorts(),
      artifactPreviews: {
        listPreviewSources: () => previewSources,
        listRetentionDescriptors: () => [],
        store: {
          kind: store.kind,
          applyDescriptors: (input) => {
            applyCalls += 1;
            const result = store.applyDescriptors(input);
            if (applyCalls === 1) {
              throw new Error("synthetic preview store failure after partial write");
            }

            return result;
          },
          snapshot: store.snapshot
        }
      }
    };
    const dispatcher = createInMemoryDispatcher({
      logger: {
        log: (message) => messages.push(String(message)),
        warn: (message) => messages.push(String(message)),
        error: (message) => messages.push(String(message))
      },
      pipelinePorts: ports,
      maxAttempts: 2,
      retryDelayMs: 0,
      now: () => new Date("2026-05-30T12:00:00.000Z")
    });

    dispatcher.enqueue({
      ...ingestionJob,
      id: "preview-generation-job-1",
      payload: {
        ...ingestionJob.payload,
        idempotencyKey: "preview-generation-idempotency-secret"
      }
    });

    const firstAttempt = await dispatcher.processNext();
    const secondAttempt = await dispatcher.processNext();
    const joinedMessages = messages.join("\n");
    const plannedLog = messages
      .map((message) => JSON.parse(message))
      .find((message) => message.event === "artifact.preview.pipeline.planned");
    const appliedLog = messages
      .map((message) => JSON.parse(message))
      .find((message) => message.event === "artifact.preview.descriptors.applied");

    expect(firstAttempt.status).toBe("retry");
    expect(secondAttempt.status).toBe("completed");
    expect(applyCalls).toBe(2);
    expect(store.snapshot()).toHaveLength(2);
    expect(plannedLog).toMatchObject({
      boundary: "wip-artifact-preview-worker",
      consistency: "retry-safe-idempotent-preview-upsert",
      sourceArtifactCount: 2,
      descriptorCount: 2,
      readyCount: 1,
      metadataOnlyCount: 1,
      inlinePreviewBytes: expect.any(Number)
    });
    expect(appliedLog).toMatchObject({
      adapterKind: "in-memory-preview-descriptor-wip",
      boundary: "wip-preview-descriptor-store",
      consistency: "retry-safe-upsert",
      receivedDescriptorCount: 2,
      upsertedDescriptorCount: 0,
      updatedDescriptorCount: 0,
      unchangedDescriptorCount: 2,
      totalDescriptorCount: 2
    });
    expect(joinedMessages).not.toContain("preview-generation-idempotency-secret");
    expect(joinedMessages).not.toContain("retry-preview-secret");
    expect(joinedMessages).not.toContain("retry-image-raw-secret");
    expect(joinedMessages).not.toContain("raw/retry");
    expect(joinedMessages).not.toContain("sha-retry");
    expect(joinedMessages).not.toContain('"storageKey":');
    expect(joinedMessages).not.toContain('"signedUrl":');
    expect(joinedMessages).not.toContain("job.handler.placeholder");
  });
});
