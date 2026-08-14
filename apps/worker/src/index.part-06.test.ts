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

describe("worker queue dispatcher part-06", () => {
  it("materializes defect mute replay invariant summaries from projected state without raw leakage", () => {
    const projectionAdapter = createInMemoryDefectMuteProjectionAdapter();
    const materializationAdapter = createInMemoryDefectMuteReplayInvariantMaterializationAdapter();
    const projectId = "project-1";
    const otherProjectId = "project-2";
    const actorId = "actor-mute-owner";
    const otherActorId = "actor-other-project";
    const unsafeMarkers = [
      "synthetic-mute-secret",
      "synthetic-raw-failure-secret",
      "synthetic-unmute-secret",
      "synthetic-unmute-raw-secret",
      "synthetic-other-project-secret",
      "signature-other-project",
      "case-other-project",
      otherProjectId
    ];
    const projectRecordForbiddenMarkers = [
      ...unsafeMarkers,
      actorId,
      otherActorId,
      "signature-invariant",
      "case-invariant",
      "result-token=synthetic-raw-failure-secret",
      "result-token=synthetic-unmute-raw-secret",
      "main #120 token=synthetic-raw-failure-secret",
      "main #121 token=synthetic-unmute-raw-secret",
      "Known issue token=synthetic-mute-secret",
      "Resolved after deploy password=synthetic-unmute-secret",
      "storageKey=synthetic/raw/failure"
    ];
    const otherProjectForbiddenMarkers = [
      `"projectId":"${projectId}"`,
      actorId,
      "signature-invariant",
      "case-invariant",
      "synthetic-mute-secret",
      "synthetic-raw-failure-secret",
      "synthetic-unmute-secret",
      "synthetic-unmute-raw-secret"
    ];
    const muted = defectMuteEvent({
      id: "mute-invariant-event-1",
      muteId: "mute-invariant-1",
      projectId,
      actorId,
      occurredAt: "2026-05-30T10:00:00.000Z",
      signatureHash: "signature-invariant",
      testCaseId: "case-invariant",
      resultUuid: "result-token=synthetic-raw-failure-secret",
      launchId: "launch-invariant",
      launchName: "main #120 token=synthetic-raw-failure-secret",
      reason: "Known issue token=synthetic-mute-secret storageKey=synthetic/raw/failure"
    });
    const unmuted = defectMuteEvent({
      id: "unmute-invariant-event-1",
      type: "defect.unmuted",
      muteId: "mute-invariant-1",
      projectId,
      actorId,
      occurredAt: "2026-05-30T11:00:00.000Z",
      signatureHash: "signature-invariant",
      testCaseId: "case-invariant",
      resultUuid: "result-token=synthetic-unmute-raw-secret",
      launchId: "launch-invariant",
      launchName: "main #121 token=synthetic-unmute-raw-secret",
      reason: "Resolved after deploy password=synthetic-unmute-secret"
    });
    const otherProjectMuted = defectMuteEvent({
      id: "mute-other-project-event-1",
      muteId: "mute-other-project-1",
      projectId: otherProjectId,
      actorId: otherActorId,
      occurredAt: "2026-05-30T10:05:00.000Z",
      signatureHash: "signature-other-project",
      testCaseId: "case-other-project",
      resultUuid: "result-other-project",
      reason: "Other project token=synthetic-other-project-secret"
    });

    projectionAdapter.applyEvents({
      projectId,
      events: [muted, unmuted],
      projectionDigest: "project-1-invariant",
      at: "2026-05-30T12:00:00.000Z"
    });
    projectionAdapter.applyEvents({
      projectId: otherProjectId,
      events: [otherProjectMuted],
      projectionDigest: "project-2-invariant",
      at: "2026-05-30T12:00:00.000Z"
    });

    const projection = projectionAdapter.getProjection(projectId);
    const otherProjection = projectionAdapter.getProjection(otherProjectId);
    const plan = buildDefectMuteReplayInvariantMaterializationPlan({
      projectId,
      projection,
      at: "2026-05-30T12:01:00.000Z",
      unsafeMarkers
    });
    const replayPlan = buildDefectMuteReplayInvariantMaterializationPlan({
      projectId,
      projection,
      at: "2026-05-30T12:02:00.000Z",
      unsafeMarkers
    });
    const otherPlan = buildDefectMuteReplayInvariantMaterializationPlan({
      projectId: otherProjectId,
      projection: otherProjection,
      at: "2026-05-30T12:02:30.000Z",
      unsafeMarkers: otherProjectForbiddenMarkers
    });
    const firstApply = materializationAdapter.applyProjection({
      projectId,
      projection,
      materializationDigest: plan.summary.materializationDigest,
      at: "2026-05-30T12:03:00.000Z",
      unsafeMarkers
    });
    const replayApply = materializationAdapter.applyProjection({
      projectId,
      projection,
      materializationDigest: replayPlan.summary.materializationDigest,
      at: "2026-05-30T12:04:00.000Z",
      unsafeMarkers
    });
    const otherApply = materializationAdapter.applyProjection({
      projectId: otherProjectId,
      projection: otherProjection,
      materializationDigest: otherPlan.summary.materializationDigest,
      at: "2026-05-30T12:05:00.000Z",
      unsafeMarkers: otherProjectForbiddenMarkers
    });
    const projectReplayAfterOtherApply = materializationAdapter.applyProjection({
      projectId,
      projection,
      materializationDigest: replayPlan.summary.materializationDigest,
      at: "2026-05-30T12:06:00.000Z",
      unsafeMarkers
    });
    const record = materializationAdapter.getRecord(projectId);
    const otherRecord = materializationAdapter.getRecord(otherProjectId);
    const snapshot = materializationAdapter.snapshot();
    const serializedRecord = JSON.stringify(record);
    const serializedOtherRecord = JSON.stringify(otherRecord);
    const serializedPlan = JSON.stringify(plan);

    expect(plan).toMatchObject({
      boundary: "worker-local-defect-mute-replay-invariant-materialization",
      consistency: "retry-safe-idempotent-projected-mute-state",
      scope: "project",
      readOnly: true,
      rawFailurePayloadsIncluded: false,
      summary: {
        projectId,
        materializedRecordCount: 1,
        deterministic: true,
        recomputable: true,
        projectScoped: true,
        appendOnlyUniqueProjectedEventIds: true,
        redactionPassed: true,
        effectiveStateExcludesRawFailureHistory: true,
        rawFailureHistoryPreserved: true,
        rawFailureHistoryNotMutatedByUnmute: true,
        rawFailureOccurrenceCount: 1,
        effectiveRecordCount: 1,
        projectedMuteStateCompatible: true,
        mutationBoundary: "worker-materialization-only-no-rest-or-mcp-or-ui-claims",
        plannedOperations: [
          "defect_mute.replay_invariant.summarize",
          "defect_mute.replay_invariant.materialize"
        ]
      },
      record: {
        projectId,
        source: "projected-defect-mute-state",
        deterministic: true,
        recomputable: true,
        projectScoped: true,
        appendOnly: {
          uniqueProjectedEventIds: true,
          projectedEventCount: 2,
          duplicateEventCount: 0,
          duplicateEventIdHashes: []
        },
        redaction: {
          passed: true,
          leakedMarkerHashes: []
        },
        rawEffectiveSeparation: {
          effectiveStateExcludesRawFailureHistory: true,
          rawFailureHistoryPreserved: true,
          rawFailureHistoryNotMutatedByUnmute: true,
          rawFailureOccurrenceCount: 1,
          effectiveRecordCount: 1,
          rawFailurePayloadIncluded: false
        }
      }
    });
    expect(plan.record.evidenceDigest).toBe(replayPlan.record.evidenceDigest);
    expect(plan.summary.materializationDigest).toBe(replayPlan.summary.materializationDigest);
    expect(firstApply).toMatchObject({
      adapterKind: "in-memory-defect-mute-replay-invariant-worker-wip",
      boundary: "worker-local-defect-mute-replay-invariant-materialization",
      consistency: "retry-safe-idempotent-projected-mute-state",
      upsertedRecordCount: 1,
      updatedRecordCount: 0,
      unchangedRecordCount: 0,
      totalRecordCount: 1
    });
    expect(replayApply).toMatchObject({
      upsertedRecordCount: 0,
      updatedRecordCount: 0,
      unchangedRecordCount: 1,
      totalRecordCount: 1
    });
    expect(otherApply).toMatchObject({
      projectId: otherProjectId,
      upsertedRecordCount: 1,
      updatedRecordCount: 0,
      unchangedRecordCount: 0,
      totalRecordCount: 2,
      redactionPassed: true,
      rawFailureOccurrenceCount: 1,
      effectiveRecordCount: 1
    });
    expect(projectReplayAfterOtherApply).toMatchObject({
      projectId,
      upsertedRecordCount: 0,
      updatedRecordCount: 0,
      unchangedRecordCount: 1,
      totalRecordCount: 2
    });
    expect(record).toMatchObject({
      projectId,
      source: "projected-defect-mute-state",
      rawEffectiveSeparation: {
        rawFailurePayloadIncluded: false
      }
    });
    expect(otherRecord).toMatchObject({
      projectId: otherProjectId,
      source: "projected-defect-mute-state",
      projectScoped: true,
      redaction: {
        passed: true,
        leakedMarkerHashes: []
      },
      rawEffectiveSeparation: {
        rawFailurePayloadIncluded: false
      }
    });
    expect(snapshot.map((materializedRecord) => materializedRecord.projectId)).toEqual([
      projectId,
      otherProjectId
    ]);
    expect(otherProjection.records).toHaveLength(1);
    expect(serializedPlan).not.toContain('"rawFailureHistory":[');
    expect(serializedRecord).not.toContain('"rawFailureHistory":[');
    expect(serializedRecord).not.toContain('"origin"');
    expect(serializedRecord).not.toContain('"actorId"');
    expect(serializedRecord).not.toContain('"resultUuid"');
    expect(serializedRecord).not.toContain('"launchName"');
    expect(serializedRecord).not.toContain('"reason"');
    expect(serializedRecord).not.toContain('"scope"');
    expect(serializedRecord).not.toContain('"affectedSignatureHashes"');
    expect(serializedRecord).not.toContain('"affectedTestIds"');
    expect(serializedOtherRecord).not.toContain('"rawFailureHistory":[');
    expect(serializedOtherRecord).not.toContain('"origin"');
    expect(serializedOtherRecord).not.toContain('"actorId"');
    for (const marker of projectRecordForbiddenMarkers) {
      expect(serializedPlan).not.toContain(marker);
      expect(serializedRecord).not.toContain(marker);
    }
    for (const marker of otherProjectForbiddenMarkers) {
      expect(serializedOtherRecord).not.toContain(marker);
    }
  });

  it("guards defect mute invariant materialization retries across reordered replay and project scopes", () => {
    const projectionAdapter = createInMemoryDefectMuteProjectionAdapter();
    const materializationAdapter = createInMemoryDefectMuteReplayInvariantMaterializationAdapter();
    const projectId = "project-retry-guard";
    const otherProjectId = "shadow-mute-invariant";
    const rawForbiddenMarkers = [
      "retry-guard-token",
      "retry-guard-password",
      "retry-guard-shadow-token",
      "Users",
      "Downloads",
      "runner",
      "raw-failure",
      "X-Amz-Signature",
      "Bearer synthetic-worker-token",
      "storageKey=raw/failure",
      "retry-guard-result-token=retry-guard-token",
      "retry-guard-result-password=retry-guard-password"
    ];
    const muted = defectMuteEvent({
      id: "mute-retry-guard-event-1",
      muteId: "mute-retry-guard-1",
      projectId,
      actorId: "actor-retry-guard",
      occurredAt: "2026-05-30T10:00:00.000Z",
      signatureHash: "signature-retry-guard",
      testCaseId: "case-retry-guard",
      resultUuid: "retry-guard-result-token=retry-guard-token",
      launchId: "launch-retry-guard",
      launchName: "main retry guard C:\\Users\\example-user\\Downloads\\raw-failure.txt",
      reason:
        "Known issue token=retry-guard-token storageKey=raw/failure signedUrl=https://storage.invalid/raw?X-Amz-Signature=retry-guard-token"
    });
    const unmuted = defectMuteEvent({
      id: "unmute-retry-guard-event-1",
      type: "defect.unmuted",
      muteId: "mute-retry-guard-1",
      projectId,
      actorId: "actor-retry-guard",
      occurredAt: "2026-05-30T10:10:00.000Z",
      signatureHash: "signature-retry-guard",
      testCaseId: "case-retry-guard",
      resultUuid: "retry-guard-result-password=retry-guard-password",
      launchId: "launch-retry-guard",
      launchName: "main retry guard /home/runner/work/raw-failure.log",
      reason: "Resolved after deploy Bearer synthetic-worker-token"
    });
    const otherMuted = defectMuteEvent({
      id: "mute-retry-guard-shadow-event-1",
      muteId: "mute-retry-guard-1",
      projectId: otherProjectId,
      actorId: "actor-retry-guard-shadow",
      occurredAt: "2026-05-30T10:05:00.000Z",
      signatureHash: "signature-retry-guard-shadow",
      testCaseId: "case-retry-guard-shadow",
      resultUuid: "retry-guard-shadow-token",
      launchId: "launch-retry-guard-shadow",
      launchName: "shadow retry guard token=retry-guard-shadow-token",
      reason: "Shadow project should not bleed token=retry-guard-shadow-token"
    });

    const firstProjectionApply = projectionAdapter.applyEvents({
      projectId,
      events: [muted, unmuted],
      projectionDigest: "retry-guard-projection-first",
      at: "2026-05-30T11:00:00.000Z"
    });
    const reorderedProjectionApply = projectionAdapter.applyEvents({
      projectId,
      events: [unmuted, muted],
      projectionDigest: "retry-guard-projection-reordered",
      at: "2026-05-30T11:01:00.000Z"
    });
    projectionAdapter.applyEvents({
      projectId: otherProjectId,
      events: [otherMuted],
      projectionDigest: "retry-guard-projection-shadow",
      at: "2026-05-30T11:02:00.000Z"
    });

    const projection = projectionAdapter.getProjection(projectId);
    const reorderedProjection = projectionAdapter.getProjection(projectId);
    const otherProjection = projectionAdapter.getProjection(otherProjectId);
    const plan = buildDefectMuteReplayInvariantMaterializationPlan({
      projectId,
      projection,
      at: "2026-05-30T11:03:00.000Z",
      unsafeMarkers: [...rawForbiddenMarkers, otherProjectId]
    });
    const retryPlan = buildDefectMuteReplayInvariantMaterializationPlan({
      projectId,
      projection: reorderedProjection,
      at: "2026-05-30T11:04:00.000Z",
      unsafeMarkers: [...rawForbiddenMarkers, otherProjectId]
    });
    const firstApply = materializationAdapter.applyProjection({
      projectId,
      projection,
      materializationDigest: plan.summary.materializationDigest,
      at: "2026-05-30T11:05:00.000Z",
      unsafeMarkers: [...rawForbiddenMarkers, otherProjectId]
    });
    const firstStoredRecord = materializationAdapter.getRecord(projectId);
    const retryApply = materializationAdapter.applyProjection({
      projectId,
      projection: reorderedProjection,
      materializationDigest: retryPlan.summary.materializationDigest,
      at: "2026-05-30T11:06:00.000Z",
      unsafeMarkers: [...rawForbiddenMarkers, otherProjectId]
    });
    const otherApply = materializationAdapter.applyProjection({
      projectId: otherProjectId,
      projection: otherProjection,
      materializationDigest: "retry-guard-shadow-materialization",
      at: "2026-05-30T11:07:00.000Z",
      unsafeMarkers: [projectId, ...rawForbiddenMarkers]
    });
    const retryAfterOtherProjectApply = materializationAdapter.applyProjection({
      projectId,
      projection: reorderedProjection,
      materializationDigest: retryPlan.summary.materializationDigest,
      at: "2026-05-30T11:08:00.000Z",
      unsafeMarkers: [...rawForbiddenMarkers, otherProjectId]
    });
    const storedRecord = materializationAdapter.getRecord(projectId);
    const otherStoredRecord = materializationAdapter.getRecord(otherProjectId);
    const serializedMaterializedProject = JSON.stringify({
      plan,
      retryPlan,
      firstApply,
      retryApply,
      retryAfterOtherProjectApply,
      storedRecord
    });
    const serializedStoredRecord = JSON.stringify(storedRecord);
    const serializedOtherRecord = JSON.stringify(otherStoredRecord);

    expect(firstProjectionApply).toMatchObject({
      receivedEventCount: 2,
      appendedEventCount: 2,
      unchangedEventCount: 0,
      totalStoredEventCount: 2
    });
    expect(reorderedProjectionApply).toMatchObject({
      receivedEventCount: 2,
      appendedEventCount: 0,
      unchangedEventCount: 2,
      totalStoredEventCount: 2
    });
    expect(projection.rawFailureHistory).toMatchObject({
      totalOccurrences: 1,
      occurrences: [
        expect.objectContaining({
          launchId: "launch-retry-guard",
          signatureHash: "signature-retry-guard",
          testId: "case-retry-guard",
          status: "failed"
        })
      ]
    });
    expect(projection.rawFailureHistory.occurrences).not.toEqual(unmuted.rawFailureHistory);
    expect(plan.summary.materializationDigest).toBe(retryPlan.summary.materializationDigest);
    expect(plan.record.evidenceDigest).toBe(retryPlan.record.evidenceDigest);
    expect(firstApply).toMatchObject({
      projectId,
      upsertedRecordCount: 1,
      updatedRecordCount: 0,
      unchangedRecordCount: 0,
      totalRecordCount: 1,
      redactionPassed: true,
      rawFailureOccurrenceCount: 1,
      effectiveRecordCount: 1
    });
    expect(retryApply).toMatchObject({
      projectId,
      upsertedRecordCount: 0,
      updatedRecordCount: 0,
      unchangedRecordCount: 1,
      totalRecordCount: 1,
      redactionPassed: true
    });
    expect(otherApply).toMatchObject({
      projectId: otherProjectId,
      upsertedRecordCount: 1,
      updatedRecordCount: 0,
      unchangedRecordCount: 0,
      totalRecordCount: 2
    });
    expect(retryAfterOtherProjectApply).toMatchObject({
      projectId,
      upsertedRecordCount: 0,
      updatedRecordCount: 0,
      unchangedRecordCount: 1,
      totalRecordCount: 2
    });
    expect(retryApply.idempotencyKeyHash).toBe(retryAfterOtherProjectApply.idempotencyKeyHash);
    expect(storedRecord).toEqual(firstStoredRecord);
    expect(storedRecord?.materializedAt).toBe("2026-05-30T11:05:00.000Z");
    expect(storedRecord).toMatchObject({
      projectId,
      projectScoped: true,
      redaction: {
        passed: true,
        leakedMarkerHashes: []
      },
      rawEffectiveSeparation: {
        effectiveStateExcludesRawFailureHistory: true,
        rawFailureHistoryPreserved: true,
        rawFailureHistoryNotMutatedByUnmute: true,
        rawFailurePayloadIncluded: false
      }
    });
    expect(materializationAdapter.snapshot().map((record) => record.projectId)).toEqual([
      projectId,
      otherProjectId
    ]);
    expect(serializedMaterializedProject).not.toContain('"rawFailureHistory":[');
    expect(serializedMaterializedProject).not.toContain('"origin"');
    expect(serializedStoredRecord).not.toContain('"scope"');
    expect(serializedMaterializedProject).not.toContain('"actorId"');
    expect(serializedMaterializedProject).not.toContain('"affectedSignatureHashes"');
    expect(serializedMaterializedProject).not.toContain('"affectedTestIds"');
    expect(serializedMaterializedProject).not.toContain(otherProjectId);
    expect(serializedMaterializedProject).not.toContain("signature-retry-guard");
    expect(serializedMaterializedProject).not.toContain("case-retry-guard");
    expect(serializedMaterializedProject).not.toContain("signedUrl");
    expect(serializedOtherRecord).not.toContain(projectId);
    for (const marker of rawForbiddenMarkers) {
      expect(serializedMaterializedProject).not.toContain(marker);
      expect(serializedOtherRecord).not.toContain(marker);
    }
  });
});
