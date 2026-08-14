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

describe("worker queue dispatcher defects-security", () => {
  it("records retry metadata and dead-letters exhausted jobs", async () => {
    const dispatcher = createInMemoryDispatcher({
      logger: quietLogger,
      maxAttempts: 2,
      retryDelayMs: 0,
      handlers: {
        "ingestion.parse": () => {
          throw new Error("parser failed");
        }
      },
      now: () => new Date("2026-05-30T00:00:00.000Z")
    });

    dispatcher.enqueue(ingestionJob);

    const firstResult = await dispatcher.processNext();
    const secondResult = await dispatcher.processNext();
    const snapshot = dispatcher.snapshot();

    expect(firstResult.status).toBe("retry");
    expect(secondResult.status).toBe("dead-lettered");
    expect(snapshot.deadLetters).toHaveLength(1);
    expect(snapshot.statuses).toContainEqual(
      expect.objectContaining({
        jobId: "job-1",
        state: "dead_lettered",
        attempt: 2,
        reason: "parser failed"
      })
    );
    expect(snapshot.deadLetters[0]?.retry).toMatchObject({
      attempt: 2,
      maxAttempts: 2,
      lastError: {
        name: "Error",
        message: "parser failed"
      }
    });
    expect(snapshot.deadLetters[0]?.reason).toBe("parser failed");
  });

  it("does not enqueue duplicate idempotent jobs", async () => {
    const handled: string[] = [];
    const dispatcher = createInMemoryDispatcher({
      logger: quietLogger,
      handlers: {
        "ingestion.parse": (job) => {
          handled.push(job.id);
        }
      }
    });
    const firstJob = {
      ...ingestionJob,
      id: "idempotent-job-1",
      payload: {
        ...ingestionJob.payload,
        idempotencyKey: "same-idempotency-secret"
      }
    } satisfies EnqueueWorkerJob<"ingestion.parse">;
    const duplicateJob = {
      ...firstJob,
      id: "idempotent-job-2"
    } satisfies EnqueueWorkerJob<"ingestion.parse">;

    const firstResult = dispatcher.enqueue(firstJob);
    const duplicateResult = dispatcher.enqueue(duplicateJob);

    expect(firstResult.status).toBe("enqueued");
    expect(duplicateResult).toMatchObject({
      status: "duplicate",
      duplicateOfJobId: "idempotent-job-1"
    });
    expect(dispatcher.snapshot().queued).toHaveLength(1);
    expect(dispatcher.snapshot().duplicates).toHaveLength(1);
    expect(dispatcher.snapshot().duplicates[0]?.idempotencyKeyHash).not.toContain("secret");

    await dispatcher.processNext();

    expect(handled).toEqual(["idempotent-job-1"]);
    expect(dispatcher.snapshot().statuses).toContainEqual(
      expect.objectContaining({
        jobId: "idempotent-job-2",
        state: "duplicate",
        duplicateOfJobId: "idempotent-job-1"
      })
    );
  });

  it("plans launch close child jobs once per idempotency key", async () => {
    const messages: string[] = [];
    const logger: WorkerLogger = {
      log: (message) => messages.push(String(message)),
      warn: (message) => messages.push(String(message)),
      error: (message) => messages.push(String(message))
    };
    const dispatcher = createInMemoryDispatcher({
      logger,
      now: () => new Date("2026-05-30T12:00:00.000Z")
    });

    const firstResult = dispatcher.enqueue(launchCloseJob);
    const duplicateResult = dispatcher.enqueue({
      ...launchCloseJob,
      id: "close-job-2"
    });

    expect(firstResult.status).toBe("enqueued");
    expect(duplicateResult).toMatchObject({
      status: "duplicate",
      duplicateOfJobId: "close-job-1"
    });

    const result = await dispatcher.processNext();
    const snapshot = dispatcher.snapshot();

    expect(result.status).toBe("completed");
    expect(snapshot.queued.map((job) => job.name).sort()).toEqual([
      "analytics.materialize",
      "testcase.sync"
    ]);
    expect(snapshot.duplicates).toHaveLength(1);
    expect(snapshot.statuses).toContainEqual(
      expect.objectContaining({
        jobId: "close-job-1",
        jobName: "launch.close",
        state: "completed"
      })
    );
    expect(messages.join("\n")).not.toContain("job.handler.placeholder");

    const childPlanLogs = messages
      .map((message) => JSON.parse(message))
      .filter((message) => message.event === "launch.close.child_job.planned");

    expect(childPlanLogs).toEqual([
      expect.objectContaining({
        parentJobId: "close-job-1",
        childJobName: "testcase.sync",
        enqueueStatus: "enqueued"
      }),
      expect.objectContaining({
        parentJobId: "close-job-1",
        childJobName: "analytics.materialize",
        enqueueStatus: "enqueued"
      })
    ]);
  });

  it("plans recomputable analytics facts and search index documents without raw leakage", async () => {
    const projectionResults = [
      projectionResult({
        uuid: "result-2",
        name: "Synthetic settings saves safely",
        status: "failed",
        start: 10_000,
        stop: 24_250,
        labels: {
          epic: ["settings"],
          owner: ["qa"]
        },
        parameters: [
          { name: "browser", value: "chromium" },
          { name: "password", value: "hidden-password-secret", mode: "hidden" }
        ],
        attachmentCount: 1,
        statusDetails: {
          trace: "raw-stack-trace-secret",
          flaky: true
        },
        attachments: ["s3://secret-bucket/raw-storage-key.png"]
      }),
      projectionResult({
        uuid: "result-1",
        testCaseId: "case-1",
        name: "Synthetic checkout completes",
        status: "passed",
        durationMs: 750,
        labels: {
          feature: ["checkout"]
        },
        parameters: [
          { name: "tenant", value: "demo" },
          { name: "token", value: "masked-token-secret", mode: "masked" }
        ],
        attachmentCount: 0
      })
    ];
    const payload = {
      projectId: "project-1",
      launchId: "launch-1"
    };

    const plan = buildAnalyticsMaterializePipelinePlan(
      payload,
      "2026-05-30T12:00:00.000Z",
      projectionResults
    );
    const recomputed = buildAnalyticsMaterializePipelinePlan(
      payload,
      "2026-05-30T12:00:00.000Z",
      [...projectionResults].reverse()
    );
    const serializedPlan = JSON.stringify(plan);

    expect(recomputed).toEqual(plan);
    expect(plan.facts).toHaveLength(2);
    expect(plan.searchIndexDocuments).toHaveLength(2);
    expect(plan.defectClusters).toHaveLength(1);
    expect(plan.facts.map((fact) => fact.resultUuid)).toEqual(["result-1", "result-2"]);
    expect(plan.searchIndexDocuments[0]).toMatchObject({
      indexName: "testhistory-results",
      resultUuid: "result-1",
      title: "Synthetic checkout completes",
      status: "passed",
      durationBucket: "0-1s",
      visibleParameterNames: ["tenant"]
    });
    expect(plan.searchIndexDocuments[1]).toMatchObject({
      resultUuid: "result-2",
      status: "failed",
      durationBucket: "10s+",
      flaky: true,
      defectState: "new",
      visibleParameterNames: ["browser"],
      attachmentCount: 1
    });
    expect(plan.defectClusters[0]).toEqual(
      expect.objectContaining({
        state: "new",
        affectedTestIds: ["Synthetic settings saves safely"],
        currentAffectedTestIds: ["Synthetic settings saves safely"],
        occurrenceCount: 1
      })
    );
    expect(plan.summary).toMatchObject({
      resultCount: 2,
      analyticsFactCount: 2,
      searchDocumentCount: 2,
      defectClusterCount: 1,
      activeDefectClusterCount: 1,
      passedCount: 1,
      failedCount: 1,
      projectionDigest: expect.any(String),
      plannedOperations: ["analytics.materialize", "search.index", "defect.cluster"]
    });
    expect(serializedPlan).not.toContain("raw-stack-trace-secret");
    expect(serializedPlan).not.toContain("raw-storage-key");
    expect(serializedPlan).not.toContain("hidden-password-secret");
    expect(serializedPlan).not.toContain("masked-token-secret");
  });

  it("applies search projections idempotently with API-compatible pagination and filters", () => {
    const adapter = createInMemorySearchIndexProjectionAdapter();
    const payload = {
      projectId: "project-1",
      launchId: "launch-search-1"
    };
    const projectionResults = [
      projectionResult({
        uuid: "search-result-1",
        testCaseId: "case-checkout-card",
        name: "Checkout accepts card",
        status: "failed",
        durationMs: 1_250,
        labels: { feature: ["checkout"], layer: ["web"] },
        parameters: [{ name: "browser", value: "chromium" }]
      }),
      projectionResult({
        uuid: "search-result-2",
        testCaseId: "case-checkout-coupon",
        name: "Checkout applies coupon",
        status: "passed",
        durationMs: 850,
        labels: { feature: ["checkout"], layer: ["api"] },
        parameters: [{ name: "tenant", value: "demo" }]
      }),
      projectionResult({
        uuid: "search-result-3",
        testCaseId: "case-profile-avatar",
        name: "Profile uploads avatar",
        status: "broken",
        durationMs: 12_500,
        labels: { feature: ["profile"], layer: ["mobile"] },
        statusDetails: { muted: true }
      }),
      projectionResult({
        uuid: "search-result-4",
        testCaseId: "case-health",
        name: "Health endpoint responds",
        status: "passed",
        durationMs: 30,
        labels: { feature: ["operations"] }
      })
    ];

    const plan = buildAnalyticsMaterializePipelinePlan(
      payload,
      "2026-05-30T12:00:00.000Z",
      projectionResults
    );
    const firstApply = adapter.applyDocuments({
      documents: plan.searchIndexDocuments,
      projectionDigest: String(plan.summary.projectionDigest),
      at: "2026-05-30T12:00:01.000Z"
    });
    const replayPlan = buildAnalyticsMaterializePipelinePlan(
      payload,
      "2026-05-30T12:00:00.000Z",
      [...projectionResults].reverse()
    );
    const replayApply = adapter.applyDocuments({
      documents: replayPlan.searchIndexDocuments,
      projectionDigest: String(replayPlan.summary.projectionDigest),
      at: "2026-05-30T12:00:02.000Z"
    });
    const updatedPlan = buildAnalyticsMaterializePipelinePlan(
      payload,
      "2026-05-30T12:00:00.000Z",
      projectionResults.map((result) =>
        result.uuid === "search-result-1" ? { ...result, status: "passed" } : result
      )
    );
    const updateApply = adapter.applyDocuments({
      documents: updatedPlan.searchIndexDocuments,
      projectionDigest: String(updatedPlan.summary.projectionDigest),
      at: "2026-05-30T12:00:03.000Z"
    });

    expect(firstApply).toMatchObject({
      boundary: "wip-in-memory-projection",
      consistency: "retry-safe-upsert",
      receivedDocumentCount: 4,
      upsertedDocumentCount: 4,
      updatedDocumentCount: 0,
      unchangedDocumentCount: 0,
      totalDocumentCount: 4
    });
    expect(replayApply).toMatchObject({
      receivedDocumentCount: 4,
      upsertedDocumentCount: 0,
      updatedDocumentCount: 0,
      unchangedDocumentCount: 4,
      totalDocumentCount: 4
    });
    expect(updateApply).toMatchObject({
      receivedDocumentCount: 4,
      upsertedDocumentCount: 0,
      updatedDocumentCount: 1,
      unchangedDocumentCount: 3,
      totalDocumentCount: 4
    });

    expect(
      adapter.listDocuments({
        projectId: "project-1",
        launchId: "launch-search-1",
        search: "checkout",
        limit: 1,
        offset: 0,
        sort: "title"
      })
    ).toMatchObject({
      total: 2,
      limit: 1,
      offset: 0,
      hasMore: true,
      nextOffset: 1,
      boundary: "wip-in-memory-projection",
      consistency: "api-list-compatible",
      items: [expect.objectContaining({ title: "Checkout accepts card", status: "passed" })]
    });
    expect(
      adapter.listDocuments({
        projectId: "project-1",
        launchId: "launch-search-1",
        statuses: ["broken"],
        muted: true
      }).items
    ).toEqual([expect.objectContaining({ resultUuid: "search-result-3" })]);
    expect(
      adapter.listDocuments({
        projectId: "project-1",
        launchId: "launch-search-1",
        search: "profile"
      }).items
    ).toEqual([expect.objectContaining({ title: "Profile uploads avatar" })]);
    expect(adapter.listDocuments({ projectId: "other-project" })).toMatchObject({
      total: 0,
      items: []
    });
  });

  it("retries search indexing after a partial adapter write without duplicating documents", async () => {
    const messages: string[] = [];
    const adapter = createInMemorySearchIndexProjectionAdapter();
    let applyCalls = 0;
    const ports: WorkerPipelinePorts = {
      ...createNoopPipelinePorts(),
      analytics: {
        listProjectionResults: () => [
          projectionResult({
            uuid: "retry-result-1",
            testCaseId: "case-retry-1",
            name: "Retry search document one",
            status: "passed"
          }),
          projectionResult({
            uuid: "retry-result-2",
            testCaseId: "case-retry-2",
            name: "Retry search document two",
            status: "failed"
          })
        ],
        planMaterialize: ({ payload, at, results }) =>
          buildAnalyticsMaterializePipelinePlan(payload, at, results)
      },
      searchIndex: {
        kind: adapter.kind,
        applyDocuments: (input) => {
          applyCalls += 1;
          const result = adapter.applyDocuments(input);
          if (applyCalls === 1) {
            throw new Error("synthetic search adapter failure after partial write");
          }

          return result;
        },
        listDocuments: adapter.listDocuments,
        snapshot: adapter.snapshot
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
      id: "analytics-search-retry-job-1",
      name: "analytics.materialize",
      payload: {
        projectId: "project-1",
        launchId: "launch-search-retry"
      }
    });

    const firstAttempt = await dispatcher.processNext();
    const secondAttempt = await dispatcher.processNext();
    const appliedLog = messages
      .map((message) => JSON.parse(message))
      .find((message) => message.event === "search.index.documents.applied");

    expect(firstAttempt.status).toBe("retry");
    expect(secondAttempt.status).toBe("completed");
    expect(applyCalls).toBe(2);
    expect(adapter.snapshot()).toHaveLength(2);
    expect(appliedLog).toMatchObject({
      adapterKind: "in-memory-search-projection-wip",
      boundary: "wip-in-memory-projection",
      consistency: "retry-safe-upsert",
      receivedDocumentCount: 2,
      upsertedDocumentCount: 0,
      updatedDocumentCount: 0,
      unchangedDocumentCount: 2,
      totalDocumentCount: 2
    });
  });

  it("projects deterministic defect cluster lifecycle without leaking raw failure evidence", () => {
    const results = [
      projectionResult({
        uuid: "older-related",
        launchId: "launch-defect-1",
        launchName: "main #71",
        launchCreatedAt: "2026-05-01T00:00:00.000Z",
        testCaseId: "case-checkout-chrome",
        name: "checkout chrome",
        status: "failed",
        statusDetails: {
          message: "AssertionError: expected total 41 to equal 42",
          trace:
            "AssertionError: expected total 41 to equal 42\n    at CheckoutPage.assertTotal (C:\\ci\\run-1\\checkout.spec.ts:10:2)"
        }
      }),
      projectionResult({
        uuid: "latest-related",
        launchId: "launch-defect-2",
        launchName: "main #72",
        launchCreatedAt: "2026-05-02T00:00:00.000Z",
        testCaseId: "case-checkout-firefox",
        name: "checkout firefox",
        status: "failed",
        statusDetails: {
          message: "AssertionError: expected total 99 to equal 100 token=inline-worker-secret",
          trace:
            "AssertionError: expected total 99 to equal 100\n    at CheckoutPage.assertTotal (/tmp/ci/run-2/checkout.spec.ts:99:3)"
        }
      }),
      projectionResult({
        uuid: "unrelated",
        launchId: "launch-defect-2",
        launchName: "main #72",
        launchCreatedAt: "2026-05-02T00:00:00.000Z",
        testCaseId: "case-login-timeout",
        name: "login timeout",
        status: "broken",
        statusDetails: {
          message:
            "TimeoutError: GET https://user:pass@example.test/login?token=query-worker-secret"
        }
      })
    ];
    const payload = { projectId: "project-1" };

    const clusters = buildAnalyticsDefectClusterProjections(
      payload,
      "2026-05-30T12:00:00.000Z",
      results
    );
    const recomputed = buildAnalyticsDefectClusterProjections(
      payload,
      "2026-05-30T12:00:00.000Z",
      [...results].reverse()
    );
    const serialized = JSON.stringify(clusters);

    expect(recomputed).toEqual(clusters);
    expect(clusters).toHaveLength(2);
    expect(clusters.map((cluster) => cluster.affectedTestIds)).toEqual([
      ["case-checkout-chrome", "case-checkout-firefox"],
      ["case-login-timeout"]
    ]);
    expect(clusters[0]).toEqual(
      expect.objectContaining({
        state: "recurring",
        currentAffectedTestIds: ["case-checkout-firefox"],
        occurrenceCount: 2
      })
    );
    expect(serialized).not.toContain("inline-worker-secret");
    expect(serialized).not.toContain("query-worker-secret");
    expect(serialized).not.toContain("user:pass");
    expect(serialized).not.toContain("run-2");
  });

  it("logs analytics.materialize and search.index projection summaries without full raw payloads", async () => {
    const messages: string[] = [];
    const logger: WorkerLogger = {
      log: (message) => messages.push(String(message)),
      warn: (message) => messages.push(String(message)),
      error: (message) => messages.push(String(message))
    };
    const ports: WorkerPipelinePorts = {
      ...createNoopPipelinePorts(),
      analytics: {
        listProjectionResults: () => [
          projectionResult({
            uuid: "result-1",
            testCaseId: "case-1",
            name: "Synthetic checkout completes",
            status: "broken",
            parameters: [
              { name: "browser", value: "firefox" },
              { name: "secret", value: "masked-value-secret", mode: "masked" }
            ],
            statusDetails: {
              trace: "trace-line-secret",
              muted: true
            },
            attachments: ["s3://bucket/storage-key-secret.txt"]
          })
        ],
        planMaterialize: ({ payload, at, results }) =>
          buildAnalyticsMaterializePipelinePlan(payload, at, results)
      }
    };
    const dispatcher = createInMemoryDispatcher({
      logger,
      pipelinePorts: ports,
      now: () => new Date("2026-05-30T12:00:00.000Z")
    });

    dispatcher.enqueue({
      id: "analytics-job-1",
      name: "analytics.materialize",
      traceId: "trace-analytics-1",
      payload: {
        projectId: "project-1",
        launchId: "launch-1"
      }
    });

    const result = await dispatcher.processNext();
    const joinedMessages = messages.join("\n");
    const analyticsLog = messages
      .map((message) => JSON.parse(message))
      .find((message) => message.event === "analytics.materialize.pipeline.planned");
    const searchLog = messages
      .map((message) => JSON.parse(message))
      .find((message) => message.event === "search.index.pipeline.planned");

    expect(result.status).toBe("completed");
    expect(analyticsLog).toMatchObject({
      jobId: "analytics-job-1",
      jobName: "analytics.materialize",
      projectId: "project-1",
      launchId: "launch-1",
      resultCount: 1,
      analyticsFactCount: 1,
      searchDocumentCount: 1,
      summary: {
        brokenCount: 1,
        projectionDigest: expect.any(String)
      }
    });
    expect(searchLog).toMatchObject({
      parentJobName: "analytics.materialize",
      documentCount: 1,
      projectionDigest: expect.any(String),
      summary: {
        indexName: "testhistory-results",
        documentCount: 1
      }
    });
    expect(joinedMessages).not.toContain("trace-line-secret");
    expect(joinedMessages).not.toContain("storage-key-secret");
    expect(joinedMessages).not.toContain("masked-value-secret");
    expect(joinedMessages).not.toContain("secret=");
    expect(joinedMessages).not.toContain("job.handler.placeholder");
  });
});
