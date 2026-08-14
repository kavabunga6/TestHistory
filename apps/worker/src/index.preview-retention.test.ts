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

describe("worker queue dispatcher preview-retention", () => {
  it("consumes archive diagnostic replay jobs idempotently and retry-safe", async () => {
    const messages: string[] = [];
    const archiveDiagnostics = createInMemoryArchiveDiagnosticReplayAdapter();
    const events = [
      archiveDiagnosticEvent({
        id: "closed-diagnostic-1",
        source: "archive.status.read",
        code: "archive-status-read",
        severity: "info",
        storageRef: "minio://private/archive/secret-status"
      }),
      archiveDiagnosticEvent({
        id: "closed-diagnostic-2",
        source: "archive.diagnostics.read",
        code: "entry-processing-error",
        retryable: true,
        signedUrl: "https://object.test/archive?token=archive-secret"
      })
    ];
    const dispatcher = createInMemoryDispatcher({
      logger: {
        log: (message) => messages.push(String(message)),
        warn: (message) => messages.push(String(message)),
        error: (message) => messages.push(String(message))
      },
      pipelinePorts: {
        ...createNoopPipelinePorts(),
        archiveDiagnostics
      },
      now: () => new Date("2026-05-30T12:20:00.000Z")
    });

    const enqueueResult = dispatcher.enqueue({
      id: "archive-diagnostic-replay-job-1",
      name: "archive.diagnostics.replay",
      payload: {
        projectId: "project-1",
        launchId: "launch-closed",
        archiveRef: "archive:synthetic-closed",
        events
      }
    });
    const result = await dispatcher.processNext();
    const projection = archiveDiagnostics.getProjection({
      projectId: "project-1",
      launchId: "launch-closed",
      archiveRef: "archive:synthetic-closed"
    });
    const retryApply = archiveDiagnostics.applyEvents({
      projectId: "project-1",
      launchId: "launch-closed",
      archiveRef: "archive:synthetic-closed",
      events,
      replayDigest: projection.summary.replayDigest,
      at: "2026-05-30T12:21:00.000Z"
    });
    const joinedMessages = messages.join("\n");
    const appliedLog = messages
      .map((message) => JSON.parse(message))
      .find((message) => message.event === "archive.diagnostics.replay.applied");

    expect(enqueueResult.status).toBe("enqueued");
    expect(result.status).toBe("completed");
    expect(projection.records).toHaveLength(2);
    expect(projection.summary).toMatchObject({
      acceptedEventCount: 2,
      retryableEventCount: 1,
      closedArchiveStatusReadCompatible: true,
      closedArchiveDiagnosticsReadCompatible: true,
      mutationBoundary: "worker-replay-only-no-rest-or-ui-claims"
    });
    expect(retryApply).toMatchObject({
      receivedEventCount: 2,
      appendedEventCount: 0,
      unchangedEventCount: 2,
      totalStoredEventCount: 2
    });
    expect(appliedLog).toMatchObject({
      boundary: "worker-local-archive-diagnostics-replay",
      consistency: "append-only-idempotent-replay",
      receivedEventCount: 2,
      appendedEventCount: 2,
      unchangedEventCount: 0,
      totalStoredEventCount: 2,
      acceptedEventCount: 2,
      rejectedOpenLaunchEventCount: 0
    });
    expect(joinedMessages).not.toContain("minio://");
    expect(joinedMessages).not.toContain("token=archive-secret");
    expect(joinedMessages).not.toContain("private/archive");
    expect(joinedMessages).not.toContain('"rawPath"');
    expect(joinedMessages).not.toContain('"storageRef"');
    expect(joinedMessages).not.toContain('"signedUrl"');
    expect(joinedMessages).not.toContain("REST endpoint");
    expect(joinedMessages).not.toContain("UI route");
  });

  it("materializes synthetic archive diagnostic fixture contracts idempotently without raw payload targets", () => {
    const fixtureContracts = [
      {
        name: "corrupt",
        archiveRef: "archive:fixture-corrupt",
        events: [
          archiveDiagnosticEvent({
            id: "fixture-corrupt-parser",
            archiveRef: "archive:fixture-corrupt",
            code: "parser-diagnostic",
            severity: "error",
            retryable: false,
            message:
              "Synthetic corrupt archive marker rawArchivePayload=fixture-corrupt-payload token=fixture-corrupt-token",
            rawPath: "synthetic://archive-fixtures/corrupt/raw-result.json",
            storageRef: "storage://fixture-bucket/corrupt/raw-result.json",
            signedUrl: "https://object.test/corrupt?X-Amz-Signature=fixture-corrupt-signature",
            token: "Bearer fixture-corrupt-token"
          })
        ]
      },
      {
        name: "empty",
        archiveRef: "archive:fixture-empty",
        events: [
          archiveDiagnosticEvent({
            id: "fixture-empty-status",
            archiveRef: "archive:fixture-empty",
            source: "archive.status.read",
            code: "archive-status-read",
            severity: "info",
            retryable: false,
            message: "Synthetic empty archive marker rawArchivePayload=fixture-empty-payload"
          })
        ]
      },
      {
        name: "denied",
        archiveRef: "archive:fixture-denied",
        events: [
          archiveDiagnosticEvent({
            id: "fixture-denied-status",
            archiveRef: "archive:fixture-denied",
            source: "archive.status.read",
            code: "archive-status-read",
            severity: "warn",
            retryable: false,
            rawPath: "synthetic://archive-fixtures/denied/private-result.json",
            storageRef: "minio://fixture-bucket/denied/private-result.json",
            signedUrl: "https://object.test/denied?token=fixture-denied-token",
            token: "fixture-denied-token"
          })
        ]
      },
      {
        name: "partial",
        archiveRef: "archive:fixture-partial",
        events: [
          archiveDiagnosticEvent({
            id: "fixture-partial-unsafe",
            archiveRef: "archive:fixture-partial",
            code: "unsafe-entry-path",
            severity: "warn",
            entryRef: "entry:fixture-partial",
            chunkRef: "chunk:fixture-partial",
            retryable: false,
            rawPath: "synthetic://archive-fixtures/partial/unsafe-result.json"
          })
        ]
      },
      {
        name: "duplicate",
        archiveRef: "archive:fixture-duplicate",
        events: [
          archiveDiagnosticEvent({
            id: "fixture-duplicate-event",
            archiveRef: "archive:fixture-duplicate",
            code: "duplicate-entry",
            severity: "warn",
            entryRef: "entry:fixture-duplicate",
            retryable: false,
            message: "Synthetic duplicate entry rawArchivePayload=fixture-duplicate-payload"
          }),
          archiveDiagnosticEvent({
            id: "fixture-duplicate-event",
            archiveRef: "archive:fixture-duplicate",
            code: "duplicate-entry",
            severity: "warn",
            entryRef: "entry:fixture-duplicate",
            retryable: false,
            message: "Synthetic duplicate retry token=fixture-duplicate-token"
          })
        ]
      },
      {
        name: "retry",
        archiveRef: "archive:fixture-retry",
        events: [
          archiveDiagnosticEvent({
            id: "fixture-retry-processing",
            archiveRef: "archive:fixture-retry",
            code: "entry-processing-error",
            severity: "error",
            retryable: true,
            storageRef: "s3://fixture-bucket/retry/raw-result.json",
            signedUrl: "https://object.test/retry?X-Amz-Signature=fixture-retry-signature",
            token: "fixture-retry-token"
          })
        ]
      }
    ] satisfies Array<{
      name: string;
      archiveRef: string;
      events: readonly ArchiveDiagnosticReplayEvent[];
    }>;
    const archiveDiagnostics = createInMemoryArchiveDiagnosticReplayAdapter();
    const materializationEvidence = fixtureContracts.map((contract) => {
      const plan = buildArchiveDiagnosticReplayPlan(
        {
          projectId: "project-1",
          launchId: "launch-closed",
          archiveRef: contract.archiveRef,
          events: contract.events
        },
        "2026-05-30T12:40:00.000Z"
      );
      const firstApply = archiveDiagnostics.applyEvents({
        projectId: "project-1",
        launchId: "launch-closed",
        archiveRef: contract.archiveRef,
        events: contract.events,
        replayDigest: plan.summary.replayDigest,
        at: "2026-05-30T12:41:00.000Z"
      });
      const retryApply = archiveDiagnostics.applyEvents({
        projectId: "project-1",
        launchId: "launch-closed",
        archiveRef: contract.archiveRef,
        events: [...contract.events].reverse(),
        replayDigest: plan.summary.replayDigest,
        at: "2026-05-30T12:42:00.000Z"
      });
      const projection = archiveDiagnostics.getProjection({
        projectId: "project-1",
        launchId: "launch-closed",
        archiveRef: contract.archiveRef
      });

      return {
        name: contract.name,
        plan,
        firstApply,
        retryApply,
        projection
      };
    });
    const snapshot = archiveDiagnostics.snapshot();
    const serializedEvidence = JSON.stringify({ materializationEvidence, snapshot });

    expect(snapshot).toHaveLength(fixtureContracts.length);
    expect(materializationEvidence.map((evidence) => evidence.name)).toEqual([
      "corrupt",
      "empty",
      "denied",
      "partial",
      "duplicate",
      "retry"
    ]);
    expect(
      materializationEvidence.map(({ name, firstApply, retryApply, projection }) => ({
        name,
        appended: firstApply.appendedEventCount,
        retryAppended: retryApply.appendedEventCount,
        retryUnchanged: retryApply.unchangedEventCount,
        records: projection.records.length,
        duplicateEvents: projection.summary.duplicateEventCount,
        retryableEvents: projection.summary.retryableEventCount,
        mutationBoundary: projection.summary.mutationBoundary
      }))
    ).toEqual([
      {
        name: "corrupt",
        appended: 1,
        retryAppended: 0,
        retryUnchanged: 1,
        records: 1,
        duplicateEvents: 0,
        retryableEvents: 0,
        mutationBoundary: "worker-replay-only-no-rest-or-ui-claims"
      },
      {
        name: "empty",
        appended: 1,
        retryAppended: 0,
        retryUnchanged: 1,
        records: 1,
        duplicateEvents: 0,
        retryableEvents: 0,
        mutationBoundary: "worker-replay-only-no-rest-or-ui-claims"
      },
      {
        name: "denied",
        appended: 1,
        retryAppended: 0,
        retryUnchanged: 1,
        records: 1,
        duplicateEvents: 0,
        retryableEvents: 0,
        mutationBoundary: "worker-replay-only-no-rest-or-ui-claims"
      },
      {
        name: "partial",
        appended: 1,
        retryAppended: 0,
        retryUnchanged: 1,
        records: 1,
        duplicateEvents: 0,
        retryableEvents: 0,
        mutationBoundary: "worker-replay-only-no-rest-or-ui-claims"
      },
      {
        name: "duplicate",
        appended: 1,
        retryAppended: 0,
        retryUnchanged: 1,
        records: 1,
        duplicateEvents: 0,
        retryableEvents: 0,
        mutationBoundary: "worker-replay-only-no-rest-or-ui-claims"
      },
      {
        name: "retry",
        appended: 1,
        retryAppended: 0,
        retryUnchanged: 1,
        records: 1,
        duplicateEvents: 0,
        retryableEvents: 1,
        mutationBoundary: "worker-replay-only-no-rest-or-ui-claims"
      }
    ]);
    expect(
      materializationEvidence.find((evidence) => evidence.name === "duplicate")?.plan.summary
        .duplicateEventCount
    ).toBe(1);
    expect(serializedEvidence).not.toContain("rawArchivePayload");
    expect(serializedEvidence).not.toContain("synthetic://archive-fixtures");
    expect(serializedEvidence).not.toContain("storage://");
    expect(serializedEvidence).not.toContain("minio://");
    expect(serializedEvidence).not.toContain("s3://");
    expect(serializedEvidence).not.toContain("X-Amz-Signature");
    expect(serializedEvidence).not.toContain("token=");
    expect(serializedEvidence).not.toContain("Bearer");
    expect(serializedEvidence).not.toContain("fixture-corrupt-token");
    expect(serializedEvidence).not.toContain("fixture-denied-token");
    expect(serializedEvidence).not.toContain("fixture-duplicate-token");
    expect(serializedEvidence).not.toContain("fixture-retry-token");
    expect(serializedEvidence).not.toContain("fixture-bucket");
    expect(serializedEvidence).not.toContain("raw-result.json");
    expect(serializedEvidence).not.toContain("REST endpoint");
    expect(serializedEvidence).not.toContain("UI route");
  });

  it("plans attachment preview generation as bounded descriptors without raw blobs or storage targets", () => {
    const sources = [
      {
        artifact: artifactDescriptor({
          id: "preview-text-1",
          launchId: "launch-1",
          storedBytes: 1_024,
          storageKey: "launch-1/raw/preview-text-secret.log",
          sha256: "sha-text-secret",
          contentType: "text/plain"
        }),
        content:
          "visible line\npassword=preview-secret\nC:\\ci\\worker\\local-preview-secret.log\nhttps://user:pass@example.test/file?token=preview-secret",
        maxPreviewBytes: 120
      },
      {
        artifact: artifactDescriptor({
          id: "preview-image-1",
          launchId: "launch-1",
          storedBytes: 2_048,
          storageKey: "launch-1/raw/preview-image-secret.png",
          sha256: "sha-image-secret",
          contentType: "image/png"
        }),
        content: Buffer.from("raw-image-bytes-preview-secret")
      },
      {
        artifact: artifactDescriptor({
          id: "preview-binary-1",
          launchId: "launch-1",
          storedBytes: 4_096,
          storageKey: "launch-1/raw/preview-binary-secret.bin",
          sha256: "sha-binary-secret",
          contentType: "application/octet-stream"
        }),
        content: Buffer.from("raw-binary-preview-secret")
      },
      {
        artifact: artifactDescriptor({
          id: "preview-text-1",
          launchId: "launch-1",
          storedBytes: 1_024,
          storageKey: "launch-1/raw/duplicate-secret.log",
          sha256: "sha-text-secret",
          contentType: "text/plain"
        }),
        content: "duplicate raw preview secret"
      },
      {
        artifact: artifactDescriptor({
          id: "preview-error-1",
          launchId: "launch-1",
          storedBytes: 64,
          storageKey: "launch-1/raw/error-secret.log",
          sha256: "sha-error-secret",
          contentType: "text/plain"
        }),
        processingError: {
          code: "temporary-preview-token-secret",
          retryable: true
        }
      }
    ];

    const plan = buildArtifactPreviewGenerationPlan(
      ingestionJob.payload,
      "2026-05-30T12:00:00.000Z",
      sources
    );
    const recomputed = buildArtifactPreviewGenerationPlan(
      ingestionJob.payload,
      "2026-05-30T12:00:00.000Z",
      [...sources].reverse()
    );
    const serialized = JSON.stringify(plan);

    expect(recomputed).toEqual(plan);
    expect(plan).toMatchObject({
      boundary: "wip-artifact-preview-worker",
      consistency: "retry-safe-idempotent-preview-upsert",
      summary: {
        projectId: "project-1",
        launchId: "launch-1",
        sourceArtifactCount: 5,
        descriptorCount: 3,
        readyCount: 1,
        metadataOnlyCount: 1,
        unsupportedCount: 1,
        retryableErrorCount: 1,
        terminalErrorCount: 0,
        plannedOperations: ["artifact.preview.generate", "artifact.preview.upsert"]
      }
    });
    expect(plan.records).toHaveLength(4);
    expect(plan.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate-artifact", retryable: false }),
        expect.objectContaining({ code: "preview-generation-error", retryable: true })
      ])
    );
    expect(plan.descriptors.map((descriptor) => descriptor.support)).toEqual([
      "unsupported",
      "metadata-only",
      "inline"
    ]);
    expect(serialized).not.toContain("preview-secret");
    expect(serialized).not.toContain("raw-image-bytes");
    expect(serialized).not.toContain("raw-binary-preview-secret");
    expect(serialized).not.toContain("duplicate raw preview");
    expect(serialized).not.toContain("temporary-preview-token-secret");
    expect(serialized).not.toContain("raw/preview");
    expect(serialized).not.toContain("C:\\ci\\worker");
    expect(serialized).not.toContain("user:pass");
    expect(serialized).not.toContain("token=");
    expect(serialized).not.toContain('"signedUrl":');
    expect(serialized).not.toContain('"storageKey":');
  });

  it("projects preview descriptor retention eligibility without raw cleanup targets", () => {
    const oldPassedDescriptor = createArtifactPreviewDescriptor({
      artifact: artifactDescriptor({
        id: "old-passed-preview",
        launchId: "launch-1",
        storedBytes: 128,
        storageKey: "launch-1/raw/old-passed-preview-retention-secret.txt",
        sha256: "old-passed-preview-retention-secret",
        contentType: "text/plain"
      }),
      content: "short lived preview token=old-passed-preview-retention-secret"
    });
    const freshFailureDescriptor = createArtifactPreviewDescriptor({
      artifact: artifactDescriptor({
        id: "fresh-failure-preview",
        launchId: "launch-1",
        storedBytes: 256,
        storageKey: "launch-1/raw/fresh-failure-preview-retention-secret.log",
        sha256: "fresh-failure-preview-retention-secret",
        contentType: "text/plain"
      }),
      content: "failure preview should be evidence retained"
    });
    const heldFailureDescriptor = createArtifactPreviewDescriptor({
      artifact: artifactDescriptor({
        id: "held-failure-preview",
        launchId: "launch-1",
        storedBytes: 512,
        storageKey: "launch-1/raw/held-failure-preview-retention-secret.log",
        sha256: "held-failure-preview-retention-secret",
        contentType: "text/plain"
      }),
      content: "legal hold placeholder preview"
    });
    const unsafeDescriptor = {
      ...oldPassedDescriptor,
      id: "unsafe-preview-retention-input",
      body: {
        ...oldPassedDescriptor.body,
        value:
          "unsafe C:\\ci\\worker\\preview-retention-secret.log https://example.test/file?token=preview-retention-secret"
      },
      safety: {
        ...oldPassedDescriptor.safety,
        pathIncluded: true
      }
    } as unknown as typeof oldPassedDescriptor;

    const sources = [
      {
        descriptor: freshFailureDescriptor,
        retentionClass: "failure-diagnostic" as const,
        observedAt: "2026-05-20T00:00:00.000Z"
      },
      {
        descriptor: oldPassedDescriptor,
        retentionClass: "passed-short" as const,
        observedAt: "2026-05-01T00:00:00.000Z"
      },
      {
        descriptor: heldFailureDescriptor,
        retentionClass: "failure-diagnostic" as const,
        policyClass: "legal-hold-placeholder" as const,
        retentionHorizonDays: 3650,
        observedAt: "2026-01-01T00:00:00.000Z"
      },
      {
        descriptor: oldPassedDescriptor,
        retentionClass: "passed-short" as const,
        observedAt: "2026-05-01T00:00:00.000Z"
      },
      {
        descriptor: unsafeDescriptor,
        retentionClass: "passed-short" as const,
        observedAt: "2026-05-01T00:00:00.000Z"
      }
    ];

    const plan = buildArtifactPreviewRetentionEligibilityPlan({
      sources,
      at: "2026-05-30T12:00:00.000Z"
    });
    const replayed = buildArtifactPreviewRetentionEligibilityPlan({
      sources: [...sources].reverse(),
      at: "2026-05-30T12:00:00.000Z"
    });
    const serialized = JSON.stringify(plan);

    expect(replayed).toEqual(plan);
    expect(plan).toMatchObject({
      boundary: "worker-local-preview-retention-eligibility",
      consistency: "retry-safe-idempotent-retention-projection",
      summary: {
        sourceDescriptorCount: 5,
        classifiedDescriptorCount: 3,
        cleanupEligibleDescriptorCount: 1,
        retainedDescriptorCount: 2,
        evidenceDescriptorCount: 1,
        legalHoldPlaceholderCount: 1,
        invalidDescriptorCount: 1,
        duplicateDescriptorCount: 1,
        omittedDiagnosticCount: 0,
        plannedOperations: [
          "artifact.preview.retention.classify",
          "artifact.preview.cleanup.project"
        ]
      }
    });
    expect(plan.cleanupEligibleDescriptors).toHaveLength(1);
    expect(plan.cleanupEligibleDescriptors[0]).toMatchObject({
      retentionClass: "passed-short",
      policyClass: "short-lived-preview",
      cleanupEligibleAt: "2026-05-08T00:00:00.000Z",
      reason: "preview-retention-horizon-applies"
    });
    expect(plan.records.find((record) => record.policyClass === "evidence-retained")).toMatchObject(
      {
        status: "retained",
        evidencePreserved: true,
        cleanupEligibleAt: "2026-08-18T00:00:00.000Z"
      }
    );
    expect(
      plan.records.find((record) => record.policyClass === "legal-hold-placeholder")
    ).toMatchObject({
      status: "preserved",
      legalHoldPlaceholder: true,
      cleanupEligibleAt: null
    });
    expect(plan.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate-descriptor" }),
        expect.objectContaining({ code: "invalid-descriptor-retention" })
      ])
    );
    expect(serialized).not.toContain("preview-retention-secret");
    expect(serialized).not.toContain("raw/");
    expect(serialized).not.toContain("C:\\ci\\worker");
    expect(serialized).not.toContain("https://example.test");
    expect(serialized).not.toContain("token=");
    expect(serialized).not.toContain('"body"');
    expect(serialized).not.toContain('"storageKey"');
    expect(serialized).not.toContain('"signedUrl"');
  });

  it("bounds preview descriptor retention diagnostics", () => {
    const descriptor = createArtifactPreviewDescriptor({
      artifact: artifactDescriptor({
        id: "bounded-preview-retention",
        launchId: "launch-1",
        storedBytes: 32,
        storageKey: "launch-1/raw/bounded-preview-retention-secret.txt",
        sha256: "bounded-preview-retention-secret",
        contentType: "text/plain"
      }),
      content: "bounded diagnostics token=bounded-preview-retention-secret"
    });
    const unsafeSources = Array.from({ length: 25 }, (_, index) => ({
      descriptor: {
        ...descriptor,
        id: `bounded-preview-retention-${index}`,
        safety: {
          ...descriptor.safety,
          pathIncluded: true
        }
      } as unknown as typeof descriptor,
      retentionClass: "passed-short" as const,
      observedAt: "2026-05-01T00:00:00.000Z"
    }));

    const plan = buildArtifactPreviewRetentionEligibilityPlan({
      sources: unsafeSources,
      at: "2026-05-30T12:00:00.000Z"
    });
    const serialized = JSON.stringify(plan);

    expect(plan.records).toEqual([]);
    expect(plan.diagnostics).toHaveLength(21);
    expect(plan.diagnostics.at(-1)).toMatchObject({ code: "diagnostic-limit-reached" });
    expect(plan.summary).toMatchObject({
      sourceDescriptorCount: 25,
      classifiedDescriptorCount: 0,
      invalidDescriptorCount: 25,
      omittedDiagnosticCount: 5
    });
    expect(serialized).not.toContain("bounded-preview-retention-secret");
    expect(serialized).not.toContain("raw/");
    expect(serialized).not.toContain("token=");
  });
});
