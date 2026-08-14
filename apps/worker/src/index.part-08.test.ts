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

describe("worker queue dispatcher part-08", () => {
  it("replays dry-run retention batch digests across closed-launch scoped worker plans", async () => {
    const artifacts = [
      artifactDescriptor({
        id: "closed-a",
        launchId: "launch-closed",
        storedBytes: 12,
        storageKey: "launch-closed/attachment/raw-closed-token-a"
      }),
      artifactDescriptor({
        id: "open-a",
        launchId: "launch-open",
        storedBytes: 99,
        storageKey: "launch-open/attachment/raw-open-token"
      }),
      artifactDescriptor({
        id: "closed-b",
        launchId: "launch-closed",
        storedBytes: 13,
        storageKey: "launch-closed/attachment/raw-closed-token-b"
      })
    ];
    async function runDryPlan(orderedArtifacts: readonly ArtifactDescriptor[]) {
      const messages: string[] = [];
      const dispatcher = createInMemoryDispatcher({
        logger: {
          log: (message) => messages.push(String(message)),
          warn: (message) => messages.push(String(message)),
          error: (message) => messages.push(String(message))
        },
        pipelinePorts: {
          ...createNoopPipelinePorts(),
          artifacts: {
            listRetentionArtifacts: () => orderedArtifacts,
            listClosedLaunchIds: () => ["launch-closed"]
          }
        },
        now: () => new Date("2026-05-30T12:00:00.000Z")
      });

      dispatcher.enqueue({
        id: `cleanup-dry-run-${orderedArtifacts[0]?.id ?? "none"}`,
        name: "artifact.cleanup",
        payload: {
          projectId: "project-1",
          before: "2026-05-30T00:00:00.000Z",
          batchSize: 1,
          dryRun: true
        }
      });

      await dispatcher.processNext();
      return messages
        .map((message) => JSON.parse(message))
        .find((message) => message.event === "artifact.cleanup.pipeline.planned");
    }

    const firstLog = await runDryPlan(artifacts);
    const replayLog = await runDryPlan([...artifacts].reverse());
    const serialized = JSON.stringify(firstLog);

    expect(firstLog).toMatchObject({
      dryRun: true,
      executionMode: "dry-run",
      scannedArtifactCount: 3,
      stagedCandidateCount: 2,
      skippedOpenLaunchRecords: 1,
      deletionBatchCount: 0,
      dryRunBatchCount: 2,
      deleteRequestedCount: 0,
      dryRunPlanDigest: expect.any(String),
      batches: [
        expect.objectContaining({
          candidateCount: 1,
          batchDigest: expect.any(String),
          deletionExecution: false
        }),
        expect.objectContaining({
          candidateCount: 1,
          batchDigest: expect.any(String),
          deletionExecution: false
        })
      ]
    });
    expect(replayLog.dryRunPlanDigest).toBe(firstLog.dryRunPlanDigest);
    expect(replayLog.batches.map((batch: { batchDigest: string }) => batch.batchDigest)).toEqual(
      firstLog.batches.map((batch: { batchDigest: string }) => batch.batchDigest)
    );
    expect(serialized).not.toContain("launch-open/attachment");
    expect(serialized).not.toContain("raw-open-token");
    expect(serialized).not.toContain("raw-closed-token");
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("deleteObjects");
    expect(serialized).not.toContain("cleanup.execution.planned");
  });

  it("logs descriptor-backed attachment preview retention dry-run scheduling without deletion", async () => {
    const closedDescriptor = createArtifactPreviewDescriptor({
      artifact: artifactDescriptor({
        id: "closed-preview-cleanup",
        launchId: "launch-closed",
        storedBytes: 80,
        storageKey: "launch-closed/raw/closed-preview-cleanup-secret.txt",
        sha256: "closed-preview-cleanup-secret",
        contentType: "text/plain"
      }),
      content: "closed preview token=closed-preview-cleanup-secret"
    });
    const secondClosedDescriptor = createArtifactPreviewDescriptor({
      artifact: artifactDescriptor({
        id: "closed-preview-cleanup-second",
        launchId: "launch-closed",
        storedBytes: 90,
        storageKey: "launch-closed/raw/closed-preview-cleanup-second-secret.txt",
        sha256: "closed-preview-cleanup-second-secret",
        contentType: "text/plain"
      }),
      content: "closed preview token=closed-preview-cleanup-second-secret"
    });
    const openDescriptor = createArtifactPreviewDescriptor({
      artifact: artifactDescriptor({
        id: "open-preview-cleanup",
        launchId: "launch-open",
        storedBytes: 100,
        storageKey: "launch-open/raw/open-preview-cleanup-secret.txt",
        sha256: "open-preview-cleanup-secret",
        contentType: "text/plain"
      }),
      content: "open preview token=open-preview-cleanup-secret"
    });
    const sources = [
      {
        launchId: "launch-closed",
        observedAt: "2026-05-01T00:00:00.000Z",
        retentionClass: "passed-short" as const,
        descriptor: closedDescriptor
      },
      {
        launchId: "launch-open",
        observedAt: "2026-05-01T00:00:00.000Z",
        retentionClass: "passed-short" as const,
        descriptor: openDescriptor
      },
      {
        launchId: "launch-closed",
        observedAt: "2026-05-01T00:00:00.000Z",
        retentionClass: "passed-short" as const,
        descriptor: secondClosedDescriptor
      }
    ];
    async function runCleanupWithSources(orderedSources: Array<(typeof sources)[number]>) {
      const messages: string[] = [];
      const dispatcher = createInMemoryDispatcher({
        logger: {
          log: (message) => messages.push(String(message)),
          warn: (message) => messages.push(String(message)),
          error: (message) => messages.push(String(message))
        },
        pipelinePorts: {
          ...createNoopPipelinePorts(),
          artifacts: {
            listRetentionArtifacts: () => [],
            listClosedLaunchIds: () => ["launch-closed"]
          },
          artifactPreviews: {
            ...createNoopPipelinePorts().artifactPreviews,
            listRetentionDescriptors: () => orderedSources
          }
        },
        now: () => new Date("2026-05-30T12:00:00.000Z")
      });

      const enqueue = dispatcher.enqueue({
        id: `preview-retention-dry-run-${orderedSources[0]?.launchId ?? "none"}`,
        name: "artifact.cleanup",
        payload: {
          projectId: "project-1",
          before: "2026-05-30T00:00:00.000Z",
          batchSize: 1,
          dryRun: true
        }
      });
      const duplicate = dispatcher.enqueue({
        id: "preview-retention-dry-run-duplicate",
        name: "artifact.cleanup",
        payload: {
          projectId: "project-1",
          before: "2026-05-30T00:00:00.000Z",
          batchSize: 1,
          dryRun: true
        }
      });

      await dispatcher.processNext();
      return {
        enqueue,
        duplicate,
        joinedMessages: messages.join("\n"),
        scheduleLog: messages
          .map((message) => JSON.parse(message))
          .find((message) => message.event === "artifact.preview.retention_dry_run.scheduled")
      };
    }

    const first = await runCleanupWithSources(sources);
    const replay = await runCleanupWithSources([...sources].reverse());
    const duplicateClosedReplay = await runCleanupWithSources([
      sources[0]!,
      sources[0]!,
      sources[1]!,
      sources[2]!
    ]);
    const serialized = JSON.stringify(first.scheduleLog);
    const duplicateSerialized = JSON.stringify(duplicateClosedReplay.scheduleLog);
    const scheduleCheckpointFor = (log: typeof first.scheduleLog) => ({
      scheduleDigest: log.summary.scheduleDigest,
      scheduledDescriptorCount: log.summary.scheduledDescriptorCount,
      batchCount: log.batchCount,
      batchDigests: log.batches.map((batch: { batchDigest: string }) => batch.batchDigest)
    });

    expect(first.enqueue.status).toBe("enqueued");
    expect(first.duplicate.status).toBe("duplicate");
    expect(first.scheduleLog).toMatchObject({
      boundary: "worker-local-attachment-preview-retention-dry-run-scheduling",
      consistency: "retry-safe-idempotent-descriptor-schedule",
      scope: "closed-launches",
      dryRun: true,
      readOnly: true,
      deletionExecution: false,
      deleteRequestedCount: 0,
      requestedBatchSize: 1,
      plannedBatchSize: 1,
      batchCount: 2,
      batches: [
        expect.objectContaining({
          descriptorCount: 1,
          deletionExecution: false,
          deleteRequestedCount: 0
        }),
        expect.objectContaining({
          descriptorCount: 1,
          deletionExecution: false,
          deleteRequestedCount: 0
        })
      ],
      summary: {
        sourceDescriptorCount: 3,
        closedLaunchDescriptorCount: 2,
        skippedOpenLaunchDescriptorCount: 1,
        cleanupEligibleDescriptorCount: 2,
        scheduledDescriptorCount: 2,
        deleteRequestedCount: 0,
        scheduleDigest: expect.any(String)
      }
    });
    expect(replay.scheduleLog.summary.scheduleDigest).toBe(
      first.scheduleLog.summary.scheduleDigest
    );
    expect(
      replay.scheduleLog.batches.map((batch: { batchDigest: string }) => batch.batchDigest)
    ).toEqual(first.scheduleLog.batches.map((batch: { batchDigest: string }) => batch.batchDigest));
    expect(scheduleCheckpointFor(duplicateClosedReplay.scheduleLog)).toEqual(
      scheduleCheckpointFor(first.scheduleLog)
    );
    expect(duplicateClosedReplay.scheduleLog.summary).toMatchObject({
      sourceDescriptorCount: 4,
      closedLaunchDescriptorCount: 3,
      skippedOpenLaunchDescriptorCount: 1,
      cleanupEligibleDescriptorCount: 2,
      scheduledDescriptorCount: 2,
      duplicateDescriptorCount: 1
    });
    expect(duplicateClosedReplay.scheduleLog.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "duplicate-descriptor",
          retryable: false,
          severity: "warn"
        })
      ])
    );
    expect(first.joinedMessages).not.toContain("preview-cleanup-secret");
    expect(first.joinedMessages).not.toContain("launch-open/raw");
    expect(first.joinedMessages).not.toContain("storageKey");
    expect(first.joinedMessages).not.toContain("signedUrl");
    expect(first.joinedMessages).not.toContain("token=");
    expect(serialized).not.toContain("s3");
    expect(serialized).not.toContain("minio");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("deleteObjects");
    expect(serialized).not.toContain("cleanup.execution.planned");
    expect(duplicateClosedReplay.joinedMessages).not.toContain("preview-cleanup-secret");
    expect(duplicateClosedReplay.joinedMessages).not.toContain("launch-closed/raw");
    expect(duplicateSerialized).not.toContain("storageKey");
    expect(duplicateSerialized).not.toContain("signedUrl");
    expect(duplicateSerialized).not.toContain("deleteObjects");
    expect(duplicateSerialized).not.toContain("cleanup.batch.delete");
    expect(duplicateSerialized).not.toContain("cleanup.execution.planned");
  });

  it("does not plan deletion batches for open launch artifacts", async () => {
    const messages: string[] = [];
    const logger: WorkerLogger = {
      log: (message) => messages.push(String(message)),
      warn: (message) => messages.push(String(message)),
      error: (message) => messages.push(String(message))
    };
    const dispatcher = createInMemoryDispatcher({
      logger,
      pipelinePorts: {
        ...createNoopPipelinePorts(),
        artifacts: {
          listRetentionArtifacts: () => [
            artifactDescriptor({
              id: "open-artifact",
              launchId: "launch-open",
              storedBytes: 42,
              storageKey: "launch-open/attachment/raw-open-secret"
            })
          ],
          listClosedLaunchIds: () => []
        }
      },
      now: () => new Date("2026-05-30T12:00:00.000Z")
    });

    dispatcher.enqueue({
      id: "cleanup-open-launch-job-1",
      name: "artifact.cleanup",
      payload: {
        projectId: "project-1",
        before: "2026-05-30T00:00:00.000Z",
        dryRun: false
      }
    });

    const result = await dispatcher.processNext();
    const cleanupLog = messages
      .map((message) => JSON.parse(message))
      .find((message) => message.event === "artifact.cleanup.pipeline.planned");

    expect(result.status).toBe("completed");
    expect(cleanupLog).toMatchObject({
      dryRun: false,
      executionMode: "delete",
      scannedArtifactCount: 1,
      stagedCandidateCount: 0,
      skippedOpenLaunchRecords: 1,
      deletionBatchCount: 0,
      candidateCount: 0,
      deleteRequestedCount: 0,
      batches: [],
      auditRecordCount: 2,
      noopReason: "open-launches-only",
      auditEvidence: [
        expect.objectContaining({
          action: "retention.preview",
          status: "planned",
          candidateCount: 0,
          skippedOpenLaunchRecords: 1
        }),
        expect.objectContaining({
          action: "cleanup.noop",
          status: "noop",
          noopReason: "open-launches-only",
          deleteRequestedCount: 0
        })
      ],
      summary: {
        scannedArtifactCount: 1,
        stagedCandidateCount: 0,
        skippedOpenLaunchRecords: 1,
        deletionBatchCount: 0,
        totalCandidateBytes: 0,
        auditRecordCount: 2,
        noopReason: "open-launches-only"
      }
    });
    expect(messages.join("\n")).not.toContain("raw-open-secret");
  });

  it("logs preview descriptor retention eligibility during cleanup without provider claims", async () => {
    const messages: string[] = [];
    const descriptor = createArtifactPreviewDescriptor({
      artifact: artifactDescriptor({
        id: "cleanup-preview-descriptor",
        launchId: "launch-closed",
        storedBytes: 64,
        storageKey: "launch-closed/raw/cleanup-preview-retention-secret.txt",
        sha256: "cleanup-preview-retention-secret",
        contentType: "text/plain"
      }),
      content: "cleanup preview token=cleanup-preview-retention-secret"
    });
    const dispatcher = createInMemoryDispatcher({
      logger: {
        log: (message) => messages.push(String(message)),
        warn: (message) => messages.push(String(message)),
        error: (message) => messages.push(String(message))
      },
      pipelinePorts: {
        ...createNoopPipelinePorts(),
        artifactPreviews: {
          listPreviewSources: () => [],
          listRetentionDescriptors: () => [
            {
              descriptor,
              retentionClass: "passed-short",
              observedAt: "2026-05-01T00:00:00.000Z"
            }
          ],
          store: createInMemoryArtifactPreviewDescriptorStoreAdapter()
        }
      },
      now: () => new Date("2026-05-30T12:00:00.000Z")
    });

    dispatcher.enqueue({
      id: "cleanup-preview-retention-job-1",
      name: "artifact.cleanup",
      payload: {
        projectId: "project-1",
        before: "2026-05-30T00:00:00.000Z",
        dryRun: false
      }
    });

    const result = await dispatcher.processNext();
    const joinedMessages = messages.join("\n");
    const retentionLog = messages
      .map((message) => JSON.parse(message))
      .find((message) => message.event === "artifact.preview.retention_eligibility.planned");

    expect(result.status).toBe("completed");
    expect(retentionLog).toMatchObject({
      boundary: "worker-local-preview-retention-eligibility",
      consistency: "retry-safe-idempotent-retention-projection",
      sourceDescriptorCount: 1,
      classifiedDescriptorCount: 1,
      cleanupEligibleDescriptorCount: 1,
      retainedDescriptorCount: 0,
      evidenceDescriptorCount: 0,
      legalHoldPlaceholderCount: 0,
      invalidDescriptorCount: 0,
      duplicateDescriptorCount: 0,
      summary: {
        plannedOperations: [
          "artifact.preview.retention.classify",
          "artifact.preview.cleanup.project"
        ]
      }
    });
    expect(joinedMessages).not.toContain("cleanup-preview-retention-secret");
    expect(joinedMessages).not.toContain("raw/");
    expect(joinedMessages).not.toContain("token=");
    expect(joinedMessages).not.toContain('"storageKey"');
    expect(joinedMessages).not.toContain('"signedUrl"');
    expect(JSON.stringify(retentionLog)).not.toContain("deleteRequested");
    expect(JSON.stringify(retentionLog)).not.toContain("storage");
  });

  it("reports heartbeat and Kubernetes-oriented health", () => {
    const configuredEnv = {
      DATABASE_URL: "postgres://user:pass@db.example.test/app",
      RABBITMQ_URL: "amqp://user:pass@rabbitmq.example.test/vhost",
      S3_ENDPOINT: "https://s3.example.test",
      REDIS_URL: "redis://:pass@redis.example.test:6379"
    };
    const dispatcher = createInMemoryDispatcher({
      env: configuredEnv,
      logger: quietLogger,
      now: () => new Date("2026-05-30T12:00:00.000Z")
    });

    dispatcher.enqueue(ingestionJob);

    const heartbeat = dispatcher.heartbeat();
    const health = dispatcher.getHealth();

    expect(heartbeat).toMatchObject({
      status: "ok",
      live: true,
      ready: true,
      queueDepth: 1,
      completedJobs: 0,
      deadLetterJobs: 0,
      requiredDependencies: 4,
      configuredRequiredDependencies: 4
    });
    expect(health).toMatchObject({
      status: "ok",
      live: true,
      ready: true,
      checkedAt: "2026-05-30T12:00:00.000Z",
      queue: {
        adapter: "rabbitmq-mock",
        depth: 1,
        completedJobs: 0,
        deadLetterJobs: 0,
        duplicateJobs: 0,
        retryScheduledJobs: 0
      },
      heartbeat: {
        lastHeartbeatAt: "2026-05-30T12:00:00.000Z",
        stale: false
      }
    });
  });

  it("sanitizes structured log values before writing", () => {
    const sanitized = sanitizeLogValue({
      token: "secret-token",
      idempotencyKey: "secret-idempotency-key",
      storageKey: "launch-1/attachment/raw-storage-secret",
      signedUrl: "https://object.test/key?X-Amz-Signature=secret",
      hidden: "hidden-value-secret",
      maskedValue: "masked-value-secret",
      localPath: "C:\\tmp\\secret-artifact.log",
      rawContent: "sensitive file content",
      attachmentContent: "raw attachment body secret",
      nested: {
        password: "secret-password",
        uri: "https://user:pass@example.test/artifacts/result.json?signature=abc#fragment"
      }
    });

    expect(sanitized).toEqual({
      token: "[redacted]",
      idempotencyKey: "[redacted]",
      storageKey: "[redacted]",
      signedUrl: "[redacted]",
      hidden: "[redacted]",
      maskedValue: "[redacted]",
      localPath: "[redacted]",
      rawContent: "[redacted]",
      attachmentContent: "[redacted]",
      nested: {
        password: "[redacted]",
        uri: "https://example.test/artifacts/result.json"
      }
    });
  });

  it("logs only safe ingestion metadata without descriptor content or idempotency secrets", async () => {
    const messages: string[] = [];
    const logger: WorkerLogger = {
      log: (message) => messages.push(String(message)),
      warn: (message) => messages.push(String(message)),
      error: (message) => messages.push(String(message))
    };
    const dispatcher = createInMemoryDispatcher({ logger });

    dispatcher.enqueue(ingestionJobWithDescriptors);
    await dispatcher.processNext();

    const joinedMessages = messages.join("\n");
    expect(joinedMessages).not.toContain("synthetic-idempotency-secret");
    expect(joinedMessages).not.toContain("synthetic-result-digest-secret");
    expect(joinedMessages).not.toContain("synthetic-attachment-digest-secret");
    expect(joinedMessages).not.toContain("synthetic-result-secret-name.json");
    expect(joinedMessages).not.toContain("synthetic-screen-secret.png");
    expect(joinedMessages).not.toContain("synthetic test name with secret");
    expect(joinedMessages).not.toContain("token=synthetic-secret");

    const summaryMessage = messages
      .map((message) => JSON.parse(message))
      .find((message) => {
        return message.event === "ingestion.parse.metadata_summary";
      });

    expect(summaryMessage).toMatchObject({
      level: "info",
      event: "ingestion.parse.metadata_summary",
      jobId: "job-with-descriptors",
      jobName: "ingestion.parse",
      projectId: "project-1",
      launchId: "launch-1",
      sourceFormat: "allure-results",
      hasImportId: true,
      hasIdempotencyKey: true,
      allure: {
        results: {
          total: 2,
          statusCounts: {
            passed: 1,
            failed: 1
          }
        },
        attachments: {
          total: 3,
          totalSizeBytes: 2560,
          typeCounts: {
            "image/png": 1,
            "text/plain": 1,
            unknown: 1
          }
        }
      }
    });
  });

  it("writes structured JSON logs without raw secret fields", async () => {
    const messages: string[] = [];
    const logger: WorkerLogger = {
      log: (message) => messages.push(String(message)),
      warn: (message) => messages.push(String(message)),
      error: (message) => messages.push(String(message))
    };
    const dispatcher = createInMemoryDispatcher({ logger });

    dispatcher.enqueue({
      ...ingestionJob,
      payload: {
        ...ingestionJob.payload,
        source: {
          ...ingestionJob.payload.source,
          uri: "https://user:pass@example.test/results?token=secret"
        }
      }
    });

    await dispatcher.processNext();

    expect(messages.length).toBeGreaterThan(0);
    expect(messages.join("\n")).not.toContain("secret");
    expect(JSON.parse(messages[0]!)).toMatchObject({
      level: "info",
      event: "job.enqueued",
      jobId: "job-1",
      jobName: "ingestion.parse"
    });
  });
});
