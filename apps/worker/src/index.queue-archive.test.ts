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

describe("worker queue dispatcher queue-archive", () => {
  it("declares the MVP job topology", () => {
    expect(workerJobNames).toEqual([
      "ingestion.parse",
      "launch.close",
      "testcase.sync",
      "analytics.materialize",
      "defect.mute.project",
      "archive.diagnostics.replay",
      "artifact.cleanup"
    ]);
  });

  it("claims queued chunked upload jobs from the API and processes them without duplicate workers", async () => {
    const calls: Array<{ url: string; method: string | undefined; body?: string }> = [];
    const fetchImpl = async (input: string | URL, init?: RequestInit): Promise<Response> => {
      const url = input.toString();
      calls.push({
        url,
        method: init?.method,
        ...(typeof init?.body === "string" ? { body: init.body } : {})
      });

      if (init?.method === "POST" && url.endsWith("/api/v1/uploads/jobs/claim")) {
        return new Response(
          JSON.stringify({
            kind: "upload-job-claim",
            items: [
              {
                job: { id: "upload-job-1", status: "processing" },
                claim: { token: "claim-token-1" },
                source: { mode: "chunked-session", payloadAvailable: true },
                links: { process: "/api/v1/uploads/upload-job-1/process" }
              },
              {
                job: { id: "upload-job-2", status: "processing" },
                claim: { token: "claim-token-2" },
                source: { mode: "chunked-session", payloadAvailable: true },
                links: { process: "/api/v1/uploads/upload-job-2/process" }
              },
              {
                job: { id: "processing-job", status: "processing" },
                source: { mode: "chunked-session", payloadAvailable: true },
                links: { process: "/api/v1/uploads/processing-job/process" }
              }
            ]
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const result = await processApiUploadQueue({
      baseUrl: "http://testhistory.local",
      limit: 10,
      workerId: "worker-a",
      fetch: fetchImpl
    });

    expect(result).toEqual({
      status: "processed",
      polledJobs: 2,
      processedJobs: 2,
      failedJobs: 0,
      jobIds: ["upload-job-1", "upload-job-2"],
      errors: []
    });
    expect(calls).toEqual([
      {
        url: "http://testhistory.local/api/v1/uploads/jobs/claim",
        method: "POST",
        body: JSON.stringify({
          source: "chunked-session",
          limit: 10,
          workerId: "worker-a"
        })
      },
      {
        url: "http://testhistory.local/api/v1/uploads/upload-job-1/process",
        method: "POST",
        body: JSON.stringify({ claimToken: "claim-token-1" })
      },
      {
        url: "http://testhistory.local/api/v1/uploads/upload-job-2/process",
        method: "POST",
        body: JSON.stringify({ claimToken: "claim-token-2" })
      }
    ]);
  });

  it("dispatches queued jobs to typed handlers", async () => {
    const handled: string[] = [];
    const queueAdapter = createMockRabbitMqAdapter();
    const dispatcher = createInMemoryDispatcher({
      logger: quietLogger,
      queueAdapter,
      handlers: {
        "ingestion.parse": (job) => {
          handled.push(`${job.name}:${job.payload.source.format}`);
        }
      }
    });

    const enqueueResult = dispatcher.enqueue(ingestionJob);

    expect(enqueueResult.status).toBe("enqueued");
    expect(queueAdapter.snapshot().queued).toHaveLength(1);

    const result = await dispatcher.processNext();

    expect(result.status).toBe("completed");
    expect(handled).toEqual(["ingestion.parse:allure-results"]);
    expect(dispatcher.snapshot().completed).toHaveLength(1);
    expect(dispatcher.snapshot().statuses).toEqual([
      expect.objectContaining({
        jobId: "job-1",
        jobName: "ingestion.parse",
        state: "completed",
        attempt: 1,
        maxAttempts: 3
      })
    ]);
  });

  it("validates worker job envelopes before enqueueing", () => {
    const dispatcher = createInMemoryDispatcher({ logger: quietLogger });
    const invalidJob = {
      id: "",
      name: "ingestion.parse",
      payload: {
        projectId: "project-1",
        launchId: "launch-1",
        source: {
          format: "zip",
          uri: ""
        }
      }
    };

    const validation = validateWorkerJobEnvelope(invalidJob);

    expect(validation).toEqual({
      ok: false,
      issues: [
        "id must be a non-empty string",
        "payload.source.format must be allure-results or junit-xml",
        "payload.source.uri must be a non-empty string"
      ]
    });
    expect(() => dispatcher.enqueue(invalidJob as never)).toThrow(WorkerJobValidationError);
    expect(dispatcher.snapshot().queued).toHaveLength(0);
  });

  it("summarizes Allure result and attachment descriptors for idempotent parse jobs", () => {
    const summary = buildIngestionParseMetadataSummary(ingestionJobWithDescriptors.payload);

    expect(summary).toEqual({
      projectId: "project-1",
      launchId: "launch-1",
      sourceFormat: "allure-results",
      hasImportId: true,
      hasIdempotencyKey: true,
      allure: {
        results: {
          total: 2,
          withUuid: 1,
          withHistoryId: 1,
          withTestCaseId: 1,
          withContentDigest: 1,
          withDuration: 1,
          attachmentReferenceCount: 2,
          statusCounts: {
            passed: 1,
            failed: 1
          }
        },
        attachments: {
          total: 3,
          withContentDigest: 1,
          withSizeBytes: 2,
          totalSizeBytes: 2560,
          referencedByResultCount: 1,
          typeCounts: {
            "image/png": 1,
            "text/plain": 1,
            unknown: 1
          }
        }
      }
    });
  });

  it("plans archive manifest intake as deterministic bounded chunks without raw artifact data", () => {
    const archivePayload = {
      ...ingestionJob.payload,
      idempotencyKey: "archive-idempotency-secret",
      source: {
        format: "allure-results",
        uri: "s3://private-bucket/raw/upload.zip?token=archive-secret"
      },
      archiveManifest: {
        format: "allure-archive-manifest",
        archiveId: "synthetic-archive-secret",
        chunkSize: 2,
        entries: [
          {
            path: "screenshots/login.png",
            sizeBytes: 2_048,
            compressedBytes: 1_024,
            contentType: "image/png",
            sha256: "digest-secret-image",
            rawBytes: "do-not-log-raw-bytes-secret"
          },
          {
            path: "results/case-result.json",
            sizeBytes: 512,
            compressedBytes: 256,
            contentType: "application/json",
            sha256: "digest-secret-result"
          },
          {
            path: "results/case-result.json",
            sizeBytes: 512,
            compressedBytes: 256,
            contentType: "application/json",
            sha256: "digest-secret-result"
          },
          {
            path: "../outside/result.json",
            sizeBytes: 128
          },
          {
            path: "C:\\synthetic\\allure-results\\secret.txt",
            sizeBytes: 64,
            content: "local-path-payload-secret"
          },
          {
            path: "misc/video.bin",
            sizeBytes: 4_096,
            compressedBytes: 3_000,
            processingError: {
              code: "temporary-storage-read-failed-secret",
              retryable: true
            }
          },
          {
            path: "notes/readme.unsupported",
            sizeBytes: 10
          }
        ]
      }
    } as ArchiveManifestIngestionPayload & {
      archiveManifest: NonNullable<ArchiveManifestIngestionPayload["archiveManifest"]>;
    };
    const reversedArchivePayload = {
      ...archivePayload,
      archiveManifest: {
        ...archivePayload.archiveManifest,
        entries: [...archivePayload.archiveManifest.entries].reverse()
      }
    } as ArchiveManifestIngestionPayload & {
      archiveManifest: NonNullable<ArchiveManifestIngestionPayload["archiveManifest"]>;
    };

    const plan = buildArchiveIntakeExecutionPlan(
      archivePayload,
      archivePayload.archiveManifest,
      "2026-05-30T12:00:00.000Z"
    );
    const recomputed = buildArchiveIntakeExecutionPlan(
      reversedArchivePayload,
      reversedArchivePayload.archiveManifest,
      "2026-05-30T12:00:00.000Z"
    );
    const serialized = JSON.stringify(plan);

    expect(recomputed).toEqual(plan);
    expect(plan).toMatchObject({
      boundary: "wip-archive-manifest-worker-no-unzip",
      consistency: "retry-safe-idempotent-entry-plan",
      summary: {
        entryCount: 7,
        plannedEntryCount: 3,
        chunkCount: 2,
        rejectedEntryCount: 2,
        unsupportedEntryCount: 1,
        retryableEntryErrorCount: 1,
        plannedOperations: ["archive.manifest.read", "archive.entries.plan"]
      }
    });
    expect(plan.chunks).toEqual([
      expect.objectContaining({
        index: 0,
        entryCount: 2,
        status: "retryable-error",
        retryableEntryErrorCount: 1
      }),
      expect.objectContaining({
        index: 1,
        entryCount: 1,
        status: "planned",
        retryableEntryErrorCount: 0
      })
    ]);
    expect(plan.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate-entry", retryable: false }),
        expect.objectContaining({ code: "unsafe-entry-path", retryable: false }),
        expect.objectContaining({ code: "unsupported-entry", retryable: false }),
        expect.objectContaining({ code: "entry-processing-error", retryable: true })
      ])
    );
    expect(serialized).not.toContain("do-not-log-raw-bytes-secret");
    expect(serialized).not.toContain("local-path-payload-secret");
    expect(serialized).not.toContain("C:\\synthetic");
    expect(serialized).not.toContain("private-bucket");
    expect(serialized).not.toContain("digest-secret");
    expect(serialized).not.toContain("temporary-storage-read-failed-secret");
  });

  it("reconciles parser archive diagnostics into idempotent redacted worker summaries", () => {
    const parserManifest = {
      format: "allure-results-archive-manifest",
      entries: [
        {
          path: "allure-results/suite-b/same-result.json",
          kind: "result",
          sizeBytes: 128,
          compressedSizeBytes: 64
        },
        {
          path: "allure-results/suite-a/same-result.json",
          kind: "result",
          sizeBytes: 128,
          compressedSizeBytes: 64
        },
        {
          path: "allure-results/notes/password=synthetic-name-secret.txt",
          kind: "unsupported",
          ignored: true,
          reason: "unsupported allure-results archive entry"
        },
        {
          path: "allure-results/nested/environment.properties",
          kind: "environment"
        }
      ],
      warnings: [
        "Archive entries at indexes [0, 1] have the same basename; consumers must key by normalized path",
        "Archive entry at index 2 was ignored because its filename is not supported",
        "Archive entry at index 3 was ignored because its path is unsafe or malformed: C:\\Users\\tester\\Downloads\\secret-result.json?token=synthetic-parser-token",
        "Archive manifest produced 10 additional diagnostics that were omitted",
        "Archive entries at indexes [0, 1] have the same basename; consumers must key by normalized path"
      ]
    } as const;
    const manifest = mapArchiveParserManifestToWorkerManifest(parserManifest, {
      archiveId: "parser-archive-secret",
      chunkSize: 10
    });
    const replayManifest = mapArchiveParserManifestToWorkerManifest(
      {
        ...parserManifest,
        entries: [...parserManifest.entries].reverse(),
        warnings: [...parserManifest.warnings].reverse().concat(parserManifest.warnings)
      },
      {
        archiveId: "parser-archive-secret",
        chunkSize: 10
      }
    );

    const plan = buildArchiveIntakeExecutionPlan(
      { ...ingestionJob.payload, archiveManifest: manifest } as ArchiveManifestIngestionPayload,
      manifest,
      "2026-05-30T12:30:00.000Z"
    );
    const replayPlan = buildArchiveIntakeExecutionPlan(
      {
        ...ingestionJob.payload,
        archiveManifest: replayManifest
      } as ArchiveManifestIngestionPayload,
      replayManifest,
      "2026-05-30T12:30:00.000Z"
    );
    const reconciledAgain = reconcileArchiveParserDiagnostics(
      plan.diagnostics,
      manifest.parserDiagnostics ?? []
    );
    const serialized = JSON.stringify(plan);

    expect(replayPlan).toEqual(plan);
    expect(reconciledAgain).toEqual(plan.diagnostics);
    expect(plan.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "duplicate-entry",
          severity: "warn",
          message:
            "Parser reported 1 duplicate basename diagnostic; worker keys entries by normalized path hash."
        }),
        expect.objectContaining({
          code: "unsafe-entry-path",
          severity: "error",
          message:
            "Parser reported 1 malformed or unsafe path diagnostic; unsafe entries were ignored before worker planning."
        }),
        expect.objectContaining({
          code: "unsupported-entry",
          severity: "warn",
          message:
            "Parser reported 1 unsupported entry diagnostic; unsupported entries remain metadata-only status diagnostics."
        }),
        expect.objectContaining({
          code: "diagnostic-limit-reached",
          severity: "warn",
          message:
            "Parser reported 1 parser diagnostic limit notice; additional parser diagnostics were already omitted upstream."
        })
      ])
    );
    expect(serialized).not.toContain("C:\\Users\\tester\\Downloads");
    expect(serialized).not.toContain("synthetic-parser-token");
    expect(serialized).not.toContain("synthetic-name-secret");
    expect(serialized).not.toContain("parser-archive-secret");
  });

  it("bounds archive worker diagnostics while keeping retry replays stable", () => {
    const manifest = {
      format: "allure-archive-manifest" as const,
      entries: Array.from({ length: 80 }, (_, index) => ({
        path: `allure-results/ignored-${index}.unsupported`,
        kind: "unsupported" as const,
        sizeBytes: index + 1
      })),
      parserDiagnostics: Array.from(
        { length: 80 },
        (_, index) =>
          `Archive entry at index ${index} was ignored because its filename is not supported: token=bounded-parser-secret-${index}`
      )
    };

    const plan = buildArchiveIntakeExecutionPlan(
      { ...ingestionJob.payload, archiveManifest: manifest } as ArchiveManifestIngestionPayload,
      manifest,
      "2026-05-30T13:00:00.000Z"
    );
    const replayPlan = buildArchiveIntakeExecutionPlan(
      { ...ingestionJob.payload, archiveManifest: manifest } as ArchiveManifestIngestionPayload,
      manifest,
      "2026-05-30T13:00:00.000Z"
    );
    const serialized = JSON.stringify(plan);

    expect(replayPlan).toEqual(plan);
    expect(plan.diagnostics).toHaveLength(50);
    expect(plan.diagnostics.at(-1)).toMatchObject({
      code: "diagnostic-limit-reached",
      message: "Additional archive intake diagnostics were omitted by the worker."
    });
    expect(serialized).not.toContain("bounded-parser-secret");
    expect(serialized).not.toContain("allure-results/ignored");
  });

  it("logs archive intake execution summaries without paths payloads or storage secrets", async () => {
    const messages: string[] = [];
    const logger: WorkerLogger = {
      log: (message) => messages.push(String(message)),
      warn: (message) => messages.push(String(message)),
      error: (message) => messages.push(String(message))
    };
    const dispatcher = createInMemoryDispatcher({ logger });

    dispatcher.enqueue({
      id: "archive-ingestion-job-1",
      name: "ingestion.parse",
      traceId: "trace-archive-1",
      payload: {
        ...ingestionJob.payload,
        importId: "archive-import-secret",
        idempotencyKey: "archive-idempotency-secret",
        source: {
          format: "allure-results",
          uri: "s3://secret-bucket/uploads/allure.zip?token=archive-secret"
        },
        archiveManifest: {
          format: "allure-archive-manifest",
          chunkSize: 1,
          entries: [
            {
              path: "results/archive-result.json",
              sizeBytes: 128,
              compressedBytes: 64,
              contentType: "application/json",
              sha256: "archive-result-digest-secret",
              payloadBytes: "raw-payload-secret"
            },
            {
              path: "/tmp/allure-results/local-secret.txt",
              sizeBytes: 256
            }
          ]
        }
      } as EnqueueWorkerJob<"ingestion.parse">["payload"]
    });

    const result = await dispatcher.processNext();
    const joinedMessages = messages.join("\n");
    const archiveLog = messages
      .map((message) => JSON.parse(message))
      .find((message) => message.event === "ingestion.archive_intake.execution_planned");

    expect(result.status).toBe("completed");
    expect(archiveLog).toMatchObject({
      boundary: "wip-archive-manifest-worker-no-unzip",
      consistency: "retry-safe-idempotent-entry-plan",
      chunkCount: 1,
      plannedEntryCount: 1,
      rejectedEntryCount: 1,
      summary: {
        entryCount: 2,
        plannedEntryCount: 1,
        chunkCount: 1,
        rejectedEntryCount: 1,
        idempotencyDigest: expect.any(String)
      }
    });
    expect(joinedMessages).not.toContain("archive-idempotency-secret");
    expect(joinedMessages).not.toContain("archive-import-secret");
    expect(joinedMessages).not.toContain("archive-secret");
    expect(joinedMessages).not.toContain("secret-bucket");
    expect(joinedMessages).not.toContain("archive-result-digest-secret");
    expect(joinedMessages).not.toContain("raw-payload-secret");
    expect(joinedMessages).not.toContain("/tmp/allure-results");
    expect(joinedMessages).not.toContain("local-secret");
  });

  it("replays archive diagnostics from synthetic closed-read evidence without raw targets", () => {
    const payload = {
      projectId: "project-1",
      launchId: "launch-closed",
      archiveRef: "archive:synthetic-closed",
      events: [
        archiveDiagnosticEvent({
          id: "status-read-1",
          source: "archive.status.read",
          code: "archive-status-read",
          severity: "info",
          rawPath: "synthetic://hostile/archive/secret-result.json",
          storageRef: "storage://private-bucket/raw/archive-secret",
          signedUrl: "https://object.test/raw?X-Amz-Signature=synthetic-secret",
          token: "synthetic-token-secret"
        }),
        archiveDiagnosticEvent({
          id: "parser-warning-1",
          source: "archive.diagnostics.read",
          code: "unsafe-entry-path",
          severity: "error",
          entryRef: "entry:closed-ref",
          chunkRef: "chunk:closed-ref",
          message: "Unsafe path synthetic://hostile/archive/secret.json token=secret"
        }),
        archiveDiagnosticEvent({
          id: "parser-warning-1",
          source: "archive.diagnostics.read",
          code: "unsafe-entry-path",
          severity: "error",
          entryRef: "entry:closed-ref",
          chunkRef: "chunk:closed-ref"
        }),
        archiveDiagnosticEvent({
          id: "open-launch-1",
          launchState: "open",
          source: "archive.cleanup.preview",
          code: "entry-processing-error",
          retryable: true
        }),
        archiveDiagnosticEvent({
          id: "other-project-1",
          projectId: "project-2",
          source: "archive.status.read",
          code: "archive-status-read",
          severity: "info"
        })
      ]
    } satisfies ArchiveDiagnosticReplayJobPayload;

    const replayPlan = buildArchiveDiagnosticReplayPlan(payload, "2026-05-30T12:10:00.000Z");
    const replayPlanAgain = buildArchiveDiagnosticReplayPlan(
      { ...payload, events: [...payload.events].reverse() },
      "2026-05-30T12:10:00.000Z"
    );
    const serialized = JSON.stringify(replayPlan);

    expect(replayPlanAgain).toEqual(replayPlan);
    expect(replayPlan).toMatchObject({
      boundary: "worker-local-archive-diagnostics-replay",
      consistency: "retry-safe-idempotent-synthetic-evidence",
      summary: {
        projectId: "project-1",
        launchId: "launch-closed",
        archiveRef: "archive:synthetic-closed",
        eventCount: 5,
        acceptedEventCount: 2,
        duplicateEventCount: 1,
        rejectedOpenLaunchEventCount: 1,
        rejectedOutOfScopeEventCount: 1,
        closedArchiveStatusReadCompatible: true,
        closedArchiveDiagnosticsReadCompatible: true,
        mutationBoundary: "worker-replay-only-no-rest-or-ui-claims"
      }
    });
    expect(replayPlan.summary.severityCounts).toEqual({ info: 1, warn: 0, error: 1 });
    expect(replayPlan.summary.sourceCounts).toEqual({
      "archive.status.read": 1,
      "archive.diagnostics.read": 1,
      "archive.cleanup.preview": 0
    });
    expect(serialized).not.toContain("C:\\Users\\tester\\Downloads");
    expect(serialized).not.toContain("storage://");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("synthetic-token-secret");
    expect(serialized).not.toContain("token=secret");
    expect(serialized).not.toContain("REST endpoint");
    expect(serialized).not.toContain("UI route");
  });
});
