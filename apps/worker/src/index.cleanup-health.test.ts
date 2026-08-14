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

describe("worker queue dispatcher cleanup-health", () => {
  it("materializes selected-case history compare permission audit snapshots without raw compare leakage", () => {
    const events = [
      historyComparePermissionAuditEvent({
        compareId: "compare-ready",
        occurredAt: "2026-05-30T10:00:00.000Z",
        rawSecret: "ready-audit-secret"
      }),
      historyComparePermissionAuditEvent({
        compareId: "compare-ready",
        occurredAt: "2026-05-30T10:00:00.000Z",
        rawSecret: "ready-audit-secret"
      }),
      historyComparePermissionAuditEvent({
        compareId: "compare-partial",
        occurredAt: "2026-05-30T10:05:00.000Z",
        decision: "partial",
        rawSecret: "partial-audit-secret"
      }),
      historyComparePermissionAuditEvent({
        compareId: "compare-other-actor",
        actorId: "actor-2",
        occurredAt: "2026-05-30T10:10:00.000Z",
        decision: "denied",
        rawSecret: "actor-audit-secret"
      }),
      historyComparePermissionAuditEvent({
        compareId: "compare-other-project",
        projectId: "project-2",
        occurredAt: "2026-05-30T10:15:00.000Z",
        decision: "denied",
        rawSecret: "project-audit-secret"
      }),
      historyComparePermissionAuditEvent({
        compareId: "compare-other-case",
        testCaseId: "case-other",
        occurredAt: "2026-05-30T10:20:00.000Z",
        rawSecret: "case-audit-secret"
      })
    ];

    const plan = buildHistoryComparePermissionAuditMaterializationPlan({
      projectId: "project-1",
      testCaseId: "case-history",
      actorId: "actor-1",
      events,
      at: "2026-05-30T12:00:00.000Z"
    });
    const recomputed = buildHistoryComparePermissionAuditMaterializationPlan({
      projectId: "project-1",
      testCaseId: "case-history",
      actorId: "actor-1",
      events: [...events].reverse(),
      at: "2026-05-30T12:00:00.000Z"
    });
    const serialized = JSON.stringify(plan);

    expect(recomputed.records).toEqual(plan.records);
    expect(recomputed.summary.materializationDigest).toBe(plan.summary.materializationDigest);
    expect(plan).toMatchObject({
      boundary: "worker-local-history-compare-permission-audit-materialization",
      consistency: "retry-safe-idempotent-selected-case-snapshot",
      scope: "project-test-case-actor",
      readOnly: true,
      rawCompareInputsIncluded: false,
      summary: {
        projectId: "project-1",
        testCaseId: "case-history",
        actorId: "actor-1",
        receivedEventCount: 6,
        scopedEventCount: 2,
        materializedRecordCount: 2,
        duplicateEventCount: 1,
        actorScopeIgnoredEventCount: 1,
        crossProjectIgnoredEventCount: 1,
        testCaseScopeIgnoredEventCount: 1,
        byDecision: {
          denied: 0,
          partial: 1,
          ready: 1
        },
        rawHistory: {
          included: false,
          preserved: true,
          digestCount: 2,
          itemCount: 2
        },
        selectedCaseHistoryCompareCompatible: true,
        mutationBoundary: "worker-materialization-only-no-rest-or-mcp-or-ui-claims",
        plannedOperations: [
          "history_compare.permission_audit.replay",
          "history_compare.permission_audit.materialize"
        ]
      }
    });
    expect(plan.records.map((record) => record.compareId)).toEqual([
      "compare-ready",
      "compare-partial"
    ]);
    expect(plan.records[0]).toEqual(
      expect.objectContaining({
        projectId: "project-1",
        testCaseId: "case-history",
        actorId: "actor-1",
        compareId: "compare-ready",
        decision: "ready",
        reasonCodes: ["history_compare_permission.ready"],
        rawHistory: expect.objectContaining({
          included: false,
          preserved: true,
          itemCount: 1
        }),
        eventCount: 1
      })
    );
    expect(plan.diagnostics.map((diagnostic) => diagnostic.code).sort()).toEqual([
      "history_compare_permission.actor_scope_event_ignored",
      "history_compare_permission.cross_project_event_ignored",
      "history_compare_permission.duplicate_event_ignored",
      "history_compare_permission.test_case_scope_event_ignored"
    ]);
    expect(serialized).not.toContain("ready-audit-secret");
    expect(serialized).not.toContain("partial-audit-secret");
    expect(serialized).not.toContain("actor-audit-secret");
    expect(serialized).not.toContain("project-audit-secret");
    expect(serialized).not.toContain("case-audit-secret");
    expect(serialized).not.toContain("Downloads");
    expect(serialized).not.toContain("allure-results");
    expect(serialized).not.toContain("storage://");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("result-base");
    expect(serialized).not.toContain("result-target");
  });

  it("applies history compare permission audit snapshots idempotently per actor and test case", () => {
    const adapter = createInMemoryHistoryComparePermissionAuditSnapshotAdapter();
    const readyEvent = historyComparePermissionAuditEvent({
      compareId: "compare-upsert",
      occurredAt: "2026-05-30T10:00:00.000Z",
      rawSecret: "upsert-audit-secret"
    });
    const partialEvent = historyComparePermissionAuditEvent({
      compareId: "compare-upsert",
      occurredAt: "2026-05-30T10:10:00.000Z",
      decision: "partial",
      rawSecret: "updated-audit-secret"
    });

    const firstApply = adapter.applyEvents({
      projectId: "project-1",
      testCaseId: "case-history",
      actorId: "actor-1",
      events: [readyEvent],
      materializationDigest: "first",
      at: "2026-05-30T12:00:00.000Z"
    });
    const replayApply = adapter.applyEvents({
      projectId: "project-1",
      testCaseId: "case-history",
      actorId: "actor-1",
      events: [readyEvent],
      materializationDigest: "first",
      at: "2026-05-30T12:01:00.000Z"
    });
    const updateApply = adapter.applyEvents({
      projectId: "project-1",
      testCaseId: "case-history",
      actorId: "actor-1",
      events: [readyEvent, partialEvent],
      materializationDigest: "updated",
      at: "2026-05-30T12:02:00.000Z"
    });
    const projection = adapter.getProjection({
      projectId: "project-1",
      testCaseId: "case-history",
      actorId: "actor-1"
    });
    const otherActorProjection = adapter.getProjection({
      projectId: "project-1",
      testCaseId: "case-history",
      actorId: "actor-2"
    });
    const serializedProjection = JSON.stringify(adapter.snapshot());

    expect(firstApply).toMatchObject({
      adapterKind: "in-memory-history-compare-permission-audit-worker-wip",
      boundary: "worker-local-history-compare-permission-audit-materialization",
      consistency: "retry-safe-idempotent-selected-case-snapshot",
      upsertedSnapshotCount: 1,
      updatedSnapshotCount: 0,
      unchangedSnapshotCount: 0,
      totalSnapshotCount: 1
    });
    expect(replayApply).toMatchObject({
      upsertedSnapshotCount: 0,
      updatedSnapshotCount: 0,
      unchangedSnapshotCount: 1,
      totalSnapshotCount: 1
    });
    expect(updateApply).toMatchObject({
      upsertedSnapshotCount: 0,
      updatedSnapshotCount: 1,
      unchangedSnapshotCount: 0,
      totalSnapshotCount: 1,
      byDecision: {
        denied: 0,
        partial: 1,
        ready: 0
      }
    });
    expect(projection.records).toEqual([
      expect.objectContaining({
        compareId: "compare-upsert",
        decision: "partial",
        eventCount: 2,
        firstOccurredAt: "2026-05-30T10:00:00.000Z",
        lastOccurredAt: "2026-05-30T10:10:00.000Z"
      })
    ]);
    expect(otherActorProjection.records).toEqual([]);
    expect(serializedProjection).not.toContain("upsert-audit-secret");
    expect(serializedProjection).not.toContain("updated-audit-secret");
    expect(serializedProjection).not.toContain("Downloads");
    expect(serializedProjection).not.toContain("storage://");
    expect(serializedProjection).not.toContain("X-Amz-Signature");
    expect(serializedProjection).not.toContain("Bearer");
    expect(serializedProjection).not.toContain("result-base");
    expect(serializedProjection).not.toContain("result-target");
  });

  it("guards persisted history compare summary materialization retries across page checkpoints and scopes", () => {
    const adapter = createInMemoryHistoryComparePermissionAuditSnapshotAdapter();
    const projectId = "project-1";
    const testCaseId = "case-history";
    const actorId = "actor-1";
    const alphaEvent = historyComparePermissionAuditEvent({
      compareId: "compare-alpha",
      occurredAt: "2026-05-30T10:00:00.000Z",
      rawSecret: "page-alpha-raw-secret"
    });
    const betaEvent = historyComparePermissionAuditEvent({
      compareId: "compare-beta",
      occurredAt: "2026-05-30T10:02:00.000Z",
      decision: "partial",
      rawSecret: "page-beta-raw-secret"
    });
    const gammaEvent = historyComparePermissionAuditEvent({
      compareId: "compare-gamma",
      occurredAt: "2026-05-30T10:04:00.000Z",
      decision: "denied",
      rawSecret: "page-gamma-raw-secret"
    });
    const deltaEvent = historyComparePermissionAuditEvent({
      compareId: "compare-delta",
      occurredAt: "2026-05-30T10:06:00.000Z",
      rawSecret: "page-delta-raw-secret"
    });
    const shadowEvents = [
      historyComparePermissionAuditEvent({
        compareId: "compare-shadow-actor",
        actorId: "actor-shadow",
        occurredAt: "2026-05-30T10:01:00.000Z",
        rawSecret: "shadow-actor-raw-secret"
      }),
      historyComparePermissionAuditEvent({
        compareId: "compare-shadow-project",
        projectId: "project-shadow",
        occurredAt: "2026-05-30T10:03:00.000Z",
        rawSecret: "shadow-project-raw-secret"
      }),
      historyComparePermissionAuditEvent({
        compareId: "compare-shadow-case",
        testCaseId: "case-shadow",
        occurredAt: "2026-05-30T10:05:00.000Z",
        rawSecret: "shadow-case-raw-secret"
      })
    ];
    const allEvents = [deltaEvent, ...shadowEvents, betaEvent, gammaEvent, alphaEvent, alphaEvent];
    const firstPagePlan = buildHistoryComparePermissionAuditMaterializationPlan({
      projectId,
      testCaseId,
      actorId,
      events: allEvents,
      at: "2026-05-30T12:00:00.000Z",
      limit: 2
    });
    const firstPageRetryPlan = buildHistoryComparePermissionAuditMaterializationPlan({
      projectId,
      testCaseId,
      actorId,
      events: [...allEvents].reverse(),
      at: "2026-05-30T12:00:30.000Z",
      limit: 2
    });
    const secondPagePlan = buildHistoryComparePermissionAuditMaterializationPlan({
      projectId,
      testCaseId,
      actorId,
      events: [deltaEvent, ...shadowEvents, gammaEvent],
      at: "2026-05-30T12:01:00.000Z",
      limit: 2
    });
    const secondPageRetryPlan = buildHistoryComparePermissionAuditMaterializationPlan({
      projectId,
      testCaseId,
      actorId,
      events: [gammaEvent, ...shadowEvents, deltaEvent],
      at: "2026-05-30T12:01:30.000Z",
      limit: 2
    });
    const checkpointFor = (plan: typeof firstPagePlan) => {
      const lastRecord = plan.records.at(-1);

      return {
        materializationDigest: plan.summary.materializationDigest,
        lastSnapshotRef: lastRecord?.snapshotRef,
        lastCompareId: lastRecord?.compareId,
        totalScopedRecordCount: plan.summary.totalScopedRecordCount,
        omittedRecordCount: plan.summary.omittedRecordCount
      };
    };

    const firstApply = adapter.applyEvents({
      projectId,
      testCaseId,
      actorId,
      events: allEvents,
      materializationDigest: firstPagePlan.summary.materializationDigest,
      at: "2026-05-30T12:02:00.000Z",
      limit: 2
    });
    const firstRetryApply = adapter.applyEvents({
      projectId,
      testCaseId,
      actorId,
      events: [...allEvents].reverse(),
      materializationDigest: firstPageRetryPlan.summary.materializationDigest,
      at: "2026-05-30T12:02:30.000Z",
      limit: 2
    });
    const secondApply = adapter.applyEvents({
      projectId,
      testCaseId,
      actorId,
      events: [deltaEvent, ...shadowEvents, gammaEvent],
      materializationDigest: secondPagePlan.summary.materializationDigest,
      at: "2026-05-30T12:03:00.000Z",
      limit: 2
    });
    const secondRetryApply = adapter.applyEvents({
      projectId,
      testCaseId,
      actorId,
      events: [gammaEvent, ...shadowEvents, deltaEvent],
      materializationDigest: secondPageRetryPlan.summary.materializationDigest,
      at: "2026-05-30T12:03:30.000Z",
      limit: 2
    });
    const scopedProjection = adapter.getProjection({ projectId, testCaseId, actorId });
    const shadowActorProjection = adapter.getProjection({
      projectId,
      testCaseId,
      actorId: "actor-shadow"
    });
    const shadowCaseProjection = adapter.getProjection({
      projectId,
      testCaseId: "case-shadow",
      actorId
    });
    const shadowProjectProjection = adapter.getProjection({
      projectId: "project-shadow",
      testCaseId,
      actorId
    });
    const serializedSnapshot = JSON.stringify(adapter.snapshot());
    const storageSchemeMarker = ["storage", "://"].join("");
    const signatureMarker = ["X-Amz", "Signature"].join("-");
    const bearerMarker = ["Bear", "er"].join("");
    const rawCompareInputMarker = ["raw.compare", "input"].join(".");
    const hiddenTokenMarker = ["hidden", "token"].join(".");

    expect(firstPageRetryPlan.records).toEqual(firstPagePlan.records);
    expect(secondPageRetryPlan.records).toEqual(secondPagePlan.records);
    expect(checkpointFor(firstPageRetryPlan)).toEqual(checkpointFor(firstPagePlan));
    expect(checkpointFor(secondPageRetryPlan)).toEqual(checkpointFor(secondPagePlan));
    expect(firstPagePlan.records.map((record) => record.compareId)).toEqual([
      "compare-alpha",
      "compare-beta"
    ]);
    expect(secondPagePlan.records.map((record) => record.compareId)).toEqual([
      "compare-gamma",
      "compare-delta"
    ]);
    expect(firstPagePlan.summary).toMatchObject({
      receivedEventCount: 8,
      scopedEventCount: 4,
      materializedRecordCount: 2,
      totalScopedRecordCount: 4,
      omittedRecordCount: 2,
      duplicateEventCount: 1,
      actorScopeIgnoredEventCount: 1,
      crossProjectIgnoredEventCount: 1,
      testCaseScopeIgnoredEventCount: 1
    });
    expect(secondPagePlan.summary).toMatchObject({
      scopedEventCount: 2,
      materializedRecordCount: 2,
      totalScopedRecordCount: 2,
      omittedRecordCount: 0,
      actorScopeIgnoredEventCount: 1,
      crossProjectIgnoredEventCount: 1,
      testCaseScopeIgnoredEventCount: 1
    });
    expect(firstApply).toMatchObject({
      upsertedSnapshotCount: 2,
      updatedSnapshotCount: 0,
      unchangedSnapshotCount: 0,
      totalSnapshotCount: 2
    });
    expect(firstRetryApply).toMatchObject({
      upsertedSnapshotCount: 0,
      updatedSnapshotCount: 0,
      unchangedSnapshotCount: 2,
      totalSnapshotCount: 2
    });
    expect(secondApply).toMatchObject({
      upsertedSnapshotCount: 2,
      updatedSnapshotCount: 0,
      unchangedSnapshotCount: 0,
      totalSnapshotCount: 4
    });
    expect(secondRetryApply).toMatchObject({
      upsertedSnapshotCount: 0,
      updatedSnapshotCount: 0,
      unchangedSnapshotCount: 2,
      totalSnapshotCount: 4
    });
    expect(scopedProjection).toMatchObject({
      projectId,
      testCaseId,
      actorId,
      summary: {
        materializedRecordCount: 4,
        totalScopedRecordCount: 4,
        rawHistory: {
          included: false,
          preserved: true,
          digestCount: 4,
          itemCount: 4
        },
        byDecision: {
          denied: 1,
          partial: 1,
          ready: 2
        }
      }
    });
    expect(scopedProjection.records.map((record) => record.compareId)).toEqual([
      "compare-alpha",
      "compare-beta",
      "compare-gamma",
      "compare-delta"
    ]);
    expect(scopedProjection.records.every((record) => record.projectId === projectId)).toBe(true);
    expect(scopedProjection.records.every((record) => record.testCaseId === testCaseId)).toBe(true);
    expect(scopedProjection.records.every((record) => record.actorId === actorId)).toBe(true);
    expect(shadowActorProjection.records).toEqual([]);
    expect(shadowCaseProjection.records).toEqual([]);
    expect(shadowProjectProjection.records).toEqual([]);
    for (const unsafeMarker of [
      "page-alpha-raw-secret",
      "page-beta-raw-secret",
      "page-gamma-raw-secret",
      "page-delta-raw-secret",
      "shadow-actor-raw-secret",
      "shadow-project-raw-secret",
      "shadow-case-raw-secret",
      "Downloads",
      "allure-results",
      storageSchemeMarker,
      signatureMarker,
      bearerMarker,
      rawCompareInputMarker,
      hiddenTokenMarker,
      "result-base",
      "result-target",
      "project-shadow",
      "actor-shadow",
      "case-shadow"
    ]) {
      expect(serializedSnapshot).not.toContain(unsafeMarker);
    }
  });

  it("replays defect mute projections idempotently while preserving raw failure records", () => {
    const adapter = createInMemoryDefectMuteProjectionAdapter();
    const projectId = "project-1";
    const muted = defectMuteEvent({
      id: "mute-event-1",
      muteId: "mute-1",
      projectId,
      occurredAt: "2026-05-30T10:00:00.000Z",
      signatureHash: "signature-checkout",
      testCaseId: "case-checkout",
      resultUuid: "result-checkout",
      launchId: "launch-raw-preserved",
      launchName: "main #101"
    });
    const unmuted = defectMuteEvent({
      id: "unmute-event-1",
      type: "defect.unmuted",
      muteId: "mute-1",
      projectId,
      occurredAt: "2026-05-30T11:00:00.000Z",
      signatureHash: "signature-checkout",
      testCaseId: "case-checkout",
      resultUuid: "result-checkout",
      launchId: "launch-raw-preserved",
      launchName: "main #101",
      reason: "Resolved by release owner"
    });

    const plan = buildDefectMuteProjectionPlan(
      { projectId, events: [muted] },
      "2026-05-30T12:00:00.000Z"
    );
    const firstApply = adapter.applyEvents({
      projectId,
      events: [muted],
      projectionDigest: plan.summary.projectionDigest,
      at: "2026-05-30T12:00:01.000Z"
    });
    const replayApply = adapter.applyEvents({
      projectId,
      events: [muted],
      projectionDigest: plan.summary.projectionDigest,
      at: "2026-05-30T12:00:02.000Z"
    });
    const updatePlan = buildDefectMuteProjectionPlan(
      { projectId, events: [muted, unmuted] },
      "2026-05-30T12:00:03.000Z"
    );
    const updateApply = adapter.applyEvents({
      projectId,
      events: [unmuted],
      projectionDigest: updatePlan.summary.projectionDigest,
      at: "2026-05-30T12:00:04.000Z"
    });
    const projection = adapter.getProjection(projectId);

    expect(firstApply).toMatchObject({
      boundary: "worker-local-mute-projection",
      consistency: "append-only-replay",
      mutationBoundary: "worker-projection-only-no-rest-mutation",
      receivedEventCount: 1,
      appendedEventCount: 1,
      unchangedEventCount: 0,
      activeMuteCount: 1,
      rawFailureOccurrenceCount: 1
    });
    expect(replayApply).toMatchObject({
      receivedEventCount: 1,
      appendedEventCount: 0,
      unchangedEventCount: 1,
      totalStoredEventCount: 1,
      activeMuteCount: 1
    });
    expect(updateApply).toMatchObject({
      receivedEventCount: 1,
      appendedEventCount: 1,
      unchangedEventCount: 0,
      totalStoredEventCount: 2,
      activeMuteCount: 0,
      inactiveMuteCount: 1
    });
    expect(projection.records[0]?.rawFailureHistory).toEqual(muted.rawFailureHistory);
    expect(projection.rawFailureHistory.occurrences).toEqual(muted.rawFailureHistory);
  });
});
