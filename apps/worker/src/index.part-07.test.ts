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

describe("worker queue dispatcher part-07", () => {
  it("materializes security audit export lifecycle invariants idempotently without provider or raw leakage", () => {
    const projectId = "project-security-audit";
    const actorId = "actor-security-admin";
    const shadowProjectId = "project-shadow";
    const unsafeMarkers = [
      "synthetic-admin-token",
      "synthetic-denied-token",
      "synthetic-viewer-token",
      "synthetic-shadow-token",
      "synthetic://audit/raw-lifecycle.json",
      "storage://synthetic/audit/export",
      "https://synthetic-storage.invalid/export?X-Amz-Signature=synthetic-signed-token",
      "Bearer synthetic-export-token",
      "providerEndpoint",
      "signedUrl",
      "requestBody",
      "rawPayload",
      "exportProviderJob",
      "executeExportProvider",
      shadowProjectId,
      "actor-security-viewer"
    ];
    const baseRequest: SecurityAuditExportRequest = {
      projectId,
      actorId,
      requestedAt: "2026-05-30T10:00:00.000Z",
      range: {
        from: "2026-05-29T00:00:00.000Z",
        to: "2026-05-30T00:00:00.000Z"
      },
      destination: {
        type: "placeholder",
        secretRef: "audit-export-placeholder-ref"
      },
      format: "jsonl",
      criteria: {
        eventTypes: ["auth.login", "project.member.updated"],
        note: "Synthetic request token=synthetic-admin-token",
        rawLocation: "synthetic://audit/raw-lifecycle.json"
      }
    };
    const allowedDecision = evaluateSecurityAuditExportPolicy(baseRequest, {
      enabled: true,
      allowedProjectIds: [projectId],
      allowedActorIds: [actorId],
      maxRangeDays: 14
    });
    const deniedRequest: SecurityAuditExportRequest = {
      ...baseRequest,
      requestedAt: "2026-05-30T10:05:00.000Z",
      criteria: {
        note: "Synthetic denied request token=synthetic-denied-token",
        storageRef: "storage://synthetic/audit/export"
      }
    };
    const deniedDecision = evaluateSecurityAuditExportPolicy(deniedRequest, {
      enabled: true,
      allowedProjectIds: ["project-different"],
      allowedActorIds: [actorId]
    });
    const viewerRequest: SecurityAuditExportRequest = {
      ...baseRequest,
      actorId: "actor-security-viewer",
      criteria: {
        note: "Synthetic viewer token=synthetic-viewer-token"
      }
    };
    const viewerDecision = evaluateSecurityAuditExportPolicy(viewerRequest, {
      enabled: true,
      allowedProjectIds: [projectId],
      allowedActorIds: ["actor-security-viewer"]
    });
    const shadowRequest: SecurityAuditExportRequest = {
      ...baseRequest,
      projectId: shadowProjectId,
      actorId: "actor-shadow",
      criteria: {
        note: "Synthetic shadow token=synthetic-shadow-token"
      }
    };
    const shadowDecision = evaluateSecurityAuditExportPolicy(shadowRequest, {
      enabled: true,
      allowedProjectIds: [shadowProjectId],
      allowedActorIds: ["actor-shadow"]
    });
    const adminRequested = createSecurityAuditExportLifecycleEvent({
      projectId,
      requestId: "audit-export-admin",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T10:00:00.000Z",
      actorId,
      request: baseRequest,
      reason:
        "Synthetic request reason token=synthetic-admin-token signedUrl=https://synthetic-storage.invalid/export?X-Amz-Signature=synthetic-signed-token"
    });
    const adminEvaluated = createSecurityAuditExportLifecycleEvent({
      projectId,
      requestId: "audit-export-admin",
      type: "audit_export.evaluated",
      occurredAt: "2026-05-30T10:00:01.000Z",
      actorId,
      decision: allowedDecision
    });
    const adminApproved = createSecurityAuditExportLifecycleEvent({
      projectId,
      requestId: "audit-export-admin",
      type: "audit_export.approved",
      occurredAt: "2026-05-30T10:00:02.000Z",
      actorId,
      decision: allowedDecision,
      metadata: {
        mode: "policy-only",
        invariantProbe: true
      }
    });
    const deniedRequested = createSecurityAuditExportLifecycleEvent({
      projectId,
      requestId: "audit-export-denied",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T10:05:00.000Z",
      actorId,
      request: deniedRequest,
      reason: "Synthetic denied reason token=synthetic-denied-token"
    });
    const deniedEvaluated = createSecurityAuditExportLifecycleEvent({
      projectId,
      requestId: "audit-export-denied",
      type: "audit_export.evaluated",
      occurredAt: "2026-05-30T10:05:01.000Z",
      actorId,
      decision: deniedDecision
    });
    const denied = createSecurityAuditExportLifecycleEvent({
      projectId,
      requestId: "audit-export-denied",
      type: "audit_export.denied",
      occurredAt: "2026-05-30T10:05:02.000Z",
      actorId,
      decision: deniedDecision,
      metadata: {
        mode: "policy-only"
      }
    });
    const viewerApproved = createSecurityAuditExportLifecycleEvent({
      projectId,
      requestId: "audit-export-viewer",
      type: "audit_export.approved",
      occurredAt: "2026-05-30T10:10:02.000Z",
      actorId: "actor-security-viewer",
      decision: viewerDecision,
      metadata: {
        mode: "policy-only"
      }
    });
    const shadowApproved = createSecurityAuditExportLifecycleEvent({
      projectId: shadowProjectId,
      requestId: "audit-export-shadow",
      type: "audit_export.approved",
      occurredAt: "2026-05-30T10:15:02.000Z",
      actorId: "actor-shadow",
      decision: shadowDecision,
      metadata: {
        mode: "policy-only"
      }
    });
    const events: SecurityAuditExportLifecycleEvent[] = [
      viewerApproved,
      adminApproved,
      shadowApproved,
      denied,
      adminRequested,
      deniedRequested,
      adminEvaluated,
      deniedEvaluated,
      adminApproved,
      denied
    ];
    const buildMaterializedRecord = (
      projection: SecurityAuditExportLifecycleProjection,
      receivedEvents: readonly SecurityAuditExportLifecycleEvent[]
    ) => {
      const recomputed = replaySecurityAuditExportLifecycleEvents(projection.events, {
        projectId: projection.projectId,
        ...(projection.actorId !== undefined ? { actorId: projection.actorId } : {})
      });
      const scopedCandidates = receivedEvents.filter(
        (event) =>
          event.projectId === projection.projectId &&
          (projection.actorId === undefined || event.actorId === projection.actorId)
      );
      const scopedUniqueEventIds = [...new Set(scopedCandidates.map((event) => event.id))].sort();
      const eventFingerprints = projection.events.map((event) => event.fingerprint).sort();
      const reasonCodes = [
        ...new Set(
          projection.requests.flatMap((request) => request.reasons.map((reason) => reason.code))
        )
      ].sort();

      return {
        boundary: "worker-local-security-audit-export-lifecycle-invariant-materialization",
        consistency: "retry-safe-idempotent-security-audit-lifecycle-invariants",
        scope: projection.actorId === undefined ? "project" : "project-actor",
        readOnly: true,
        providerNeutral: true,
        executableExportProviderClaimsIncluded: false,
        rawLifecyclePayloadsIncluded: false,
        record: {
          projectId: projection.projectId,
          ...(projection.actorId !== undefined ? { actorId: projection.actorId } : {}),
          source: "security-audit-export-lifecycle-projection",
          deterministic: JSON.stringify(projection) === JSON.stringify(recomputed),
          recomputable: true,
          projectScoped: projection.events.every(
            (event) => event.projectId === projection.projectId
          ),
          actorScoped:
            projection.actorId === undefined ||
            projection.events.every((event) => event.actorId === projection.actorId),
          providerNeutral: true,
          executableExportProviderClaimsIncluded: false,
          rawLifecyclePayloadIncluded: false,
          requestIds: projection.requestIds,
          byStatus: projection.byStatus,
          reasonCodes,
          eventFingerprints,
          materializationDigest: `audit-export-lifecycle:${[
            projection.projectId,
            projection.actorId ?? "project",
            ...eventFingerprints
          ].join(":")}`
        },
        summary: {
          projectId: projection.projectId,
          ...(projection.actorId !== undefined ? { actorId: projection.actorId } : {}),
          receivedEventCount: receivedEvents.length,
          scopedEventCount: projection.events.length,
          materializedRecordCount: 1,
          duplicateEventCount: scopedCandidates.length - scopedUniqueEventIds.length,
          actorScopeIgnoredEventCount: receivedEvents.filter(
            (event) =>
              event.projectId === projection.projectId &&
              projection.actorId !== undefined &&
              event.actorId !== projection.actorId
          ).length,
          crossProjectIgnoredEventCount: receivedEvents.filter(
            (event) => event.projectId !== projection.projectId
          ).length,
          totalRequests: projection.totalRequests,
          byStatus: projection.byStatus,
          deterministic: JSON.stringify(projection) === JSON.stringify(recomputed),
          recomputable: true,
          projectScoped: true,
          actorScoped: projection.actorId !== undefined,
          providerNeutral: true,
          noSecretsOrSignedUrls: true,
          rawLifecyclePayloadsIncluded: false,
          executableExportProviderClaimsIncluded: false,
          mutationBoundary: "worker-materialization-only-no-rest-or-mcp-or-ui-claims",
          plannedOperations: [
            "security_audit_export.lifecycle.replay_invariant.summarize",
            "security_audit_export.lifecycle.replay_invariant.materialize"
          ]
        }
      };
    };
    type MaterializedRecord = ReturnType<typeof buildMaterializedRecord>["record"];
    const materializationAdapter = (() => {
      const records = new Map<string, MaterializedRecord>();
      return {
        applyRecord: (record: MaterializedRecord, at: string) => {
          const key = `${record.projectId}:${record.actorId ?? "project"}`;
          const previous = records.get(key);
          const changed = previous?.materializationDigest !== record.materializationDigest;
          if (previous === undefined || changed) {
            records.set(key, { ...record });
          }
          return {
            adapterKind: "in-memory-security-audit-export-lifecycle-invariant-worker-wip",
            boundary: "worker-local-security-audit-export-lifecycle-invariant-materialization",
            consistency: "retry-safe-idempotent-security-audit-lifecycle-invariants",
            appliedAt: at,
            upsertedRecordCount: previous === undefined ? 1 : 0,
            updatedRecordCount: previous !== undefined && changed ? 1 : 0,
            unchangedRecordCount: previous !== undefined && !changed ? 1 : 0,
            totalRecordCount: records.size
          };
        },
        getRecord: (projectId: string, actorId: string) => records.get(`${projectId}:${actorId}`),
        snapshot: () =>
          [...records.values()].sort((left, right) => left.projectId.localeCompare(right.projectId))
      };
    })();

    const actorProjection = replaySecurityAuditExportLifecycleEvents(events, {
      projectId,
      actorId
    });
    const reverseProjection = replaySecurityAuditExportLifecycleEvents([...events].reverse(), {
      projectId,
      actorId
    });
    const projectionFromMaterializedEvents = replaySecurityAuditExportLifecycleEvents(
      actorProjection.events,
      { projectId, actorId }
    );
    const materialized = buildMaterializedRecord(actorProjection, events);
    const recomputed = buildMaterializedRecord(projectionFromMaterializedEvents, events);
    const firstApply = materializationAdapter.applyRecord(
      materialized.record,
      "2026-05-30T12:00:00.000Z"
    );
    const replayApply = materializationAdapter.applyRecord(
      recomputed.record,
      "2026-05-30T12:01:00.000Z"
    );
    const storedRecord = materializationAdapter.getRecord(projectId, actorId);
    const serialized = JSON.stringify({
      materialized,
      storedRecord,
      snapshot: materializationAdapter.snapshot()
    });

    expect(actorProjection).toEqual(reverseProjection);
    expect(actorProjection).toEqual(projectionFromMaterializedEvents);
    expect(materialized).toMatchObject({
      boundary: "worker-local-security-audit-export-lifecycle-invariant-materialization",
      consistency: "retry-safe-idempotent-security-audit-lifecycle-invariants",
      scope: "project-actor",
      readOnly: true,
      providerNeutral: true,
      executableExportProviderClaimsIncluded: false,
      rawLifecyclePayloadsIncluded: false,
      record: {
        projectId,
        actorId,
        source: "security-audit-export-lifecycle-projection",
        deterministic: true,
        recomputable: true,
        projectScoped: true,
        actorScoped: true,
        providerNeutral: true,
        executableExportProviderClaimsIncluded: false,
        rawLifecyclePayloadIncluded: false,
        requestIds: ["audit-export-admin", "audit-export-denied"],
        byStatus: {
          requested: 0,
          evaluated: 0,
          approved: 1,
          denied: 1,
          cancelled: 0,
          expired: 0
        },
        reasonCodes: ["audit_export.allowed_placeholder", "audit_export.project_scope_denied"]
      },
      summary: {
        projectId,
        actorId,
        receivedEventCount: 10,
        scopedEventCount: 6,
        materializedRecordCount: 1,
        duplicateEventCount: 2,
        actorScopeIgnoredEventCount: 1,
        crossProjectIgnoredEventCount: 1,
        totalRequests: 2,
        deterministic: true,
        recomputable: true,
        projectScoped: true,
        actorScoped: true,
        providerNeutral: true,
        noSecretsOrSignedUrls: true,
        rawLifecyclePayloadsIncluded: false,
        executableExportProviderClaimsIncluded: false,
        mutationBoundary: "worker-materialization-only-no-rest-or-mcp-or-ui-claims",
        plannedOperations: [
          "security_audit_export.lifecycle.replay_invariant.summarize",
          "security_audit_export.lifecycle.replay_invariant.materialize"
        ]
      }
    });
    expect(recomputed.record).toEqual(materialized.record);
    expect(firstApply).toMatchObject({
      adapterKind: "in-memory-security-audit-export-lifecycle-invariant-worker-wip",
      boundary: "worker-local-security-audit-export-lifecycle-invariant-materialization",
      consistency: "retry-safe-idempotent-security-audit-lifecycle-invariants",
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
    expect(storedRecord).toEqual(materialized.record);
    expect(serialized).not.toContain('"events"');
    expect(serialized).not.toContain('"request"');
    expect(serialized).not.toContain('"decision"');
    expect(serialized).not.toContain("audit-export-placeholder-ref");
    for (const marker of unsafeMarkers) {
      expect(serialized).not.toContain(marker);
    }
    expect(serialized).not.toMatch(
      /\b(signedUrl|X-Amz-Signature|Bearer|requestBody|rawPayload|providerEndpoint|exportProviderJob|executeExportProvider|executed|jobUrl|deleteObjects)\b/i
    );
  });

  it("processes synthetic defect mute queue payloads with bounded redacted diagnostics", async () => {
    const messages: string[] = [];
    const logger: WorkerLogger = {
      log: (message) => messages.push(String(message)),
      warn: (message) => messages.push(String(message)),
      error: (message) => messages.push(String(message))
    };
    const adapter = createInMemoryDefectMuteProjectionAdapter();
    const projectId = "project-1";
    const events = Array.from({ length: 7 }, (_, index) =>
      defectMuteEvent({
        id: `mute-event-${index}`,
        muteId: `mute-${index}`,
        projectId,
        occurredAt: `2026-05-30T10:00:0${index}.000Z`,
        signatureHash: `signature-${index}`,
        testCaseId: `case-${index}`,
        resultUuid: `result-${index}`,
        ...(index === 0
          ? {
              reason:
                "Do not log payload token=queue-secret C:\\ci\\payload\\raw.txt storageKey=raw/key signedUrl=https://object.test/raw?token=queue-secret"
            }
          : {})
      })
    );
    const ports: WorkerPipelinePorts = {
      ...createNoopPipelinePorts(),
      defectMutes: adapter
    };
    const dispatcher = createInMemoryDispatcher({
      logger,
      pipelinePorts: ports,
      now: () => new Date("2026-05-30T12:00:00.000Z")
    });

    dispatcher.enqueue({
      id: "defect-mute-job-1",
      name: "defect.mute.project",
      payload: { projectId, events }
    });
    dispatcher.enqueue({
      id: "defect-mute-job-2",
      name: "defect.mute.project",
      payload: { projectId, events: [...events].reverse() }
    });

    const firstResult = await dispatcher.processNext();
    const replayResult = await dispatcher.processNext();
    const plannedLog = messages
      .map((message) => JSON.parse(message))
      .find((message) => message.event === "defect.mute.projection.planned");
    const appliedLogs = messages
      .map((message) => JSON.parse(message))
      .filter((message) => message.event === "defect.mute.projection.applied");
    const joinedMessages = messages.join("\n");

    expect(firstResult.status).toBe("completed");
    expect(replayResult.status).toBe("completed");
    expect(plannedLog).toMatchObject({
      projectId,
      eventCount: 7,
      mutationBoundary: "worker-projection-only-no-rest-mutation",
      diagnostics: {
        eventIdHashes: [
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String)
        ],
        omittedEventIdCount: 2
      }
    });
    expect(appliedLogs[0]).toMatchObject({
      receivedEventCount: 7,
      appendedEventCount: 7,
      unchangedEventCount: 0,
      activeMuteCount: 7,
      rawFailureOccurrenceCount: 7
    });
    expect(appliedLogs[1]).toMatchObject({
      receivedEventCount: 7,
      appendedEventCount: 0,
      unchangedEventCount: 7,
      totalStoredEventCount: 7,
      activeMuteCount: 7
    });
    expect(adapter.getProjection(projectId).records).toHaveLength(7);
    expect(joinedMessages).not.toContain("queue-secret");
    expect(joinedMessages).not.toContain("token=");
    expect(joinedMessages).not.toContain("C:\\ci\\payload");
    expect(joinedMessages).not.toContain("storageKey");
    expect(joinedMessages).not.toContain("signedUrl");
    expect(joinedMessages).not.toContain("mute-event-0");
    expect(joinedMessages).not.toContain('"payload"');
  });

  it("plans artifact cleanup as bounded dry-run batches without logging raw targets", async () => {
    const messages: string[] = [];
    const logger: WorkerLogger = {
      log: (message) => messages.push(String(message)),
      warn: (message) => messages.push(String(message)),
      error: (message) => messages.push(String(message))
    };
    const ports: WorkerPipelinePorts = {
      ...createNoopPipelinePorts(),
      artifacts: {
        listRetentionArtifacts: () =>
          Array.from({ length: 525 }, (_, index) =>
            artifactDescriptor({
              id: `artifact-${index}`,
              launchId: "launch-closed",
              storedBytes: 10,
              storageKey: `launch-closed/attachment/raw-secret-path-${index}`,
              sha256: `digest-secret-${index}`
            })
          ),
        listClosedLaunchIds: () => ["launch-closed"]
      }
    };
    const dispatcher = createInMemoryDispatcher({
      logger,
      pipelinePorts: ports,
      now: () => new Date("2026-05-30T12:00:00.000Z")
    });

    const firstEnqueue = dispatcher.enqueue({
      id: "cleanup-job-1",
      name: "artifact.cleanup",
      payload: {
        projectId: "project-1",
        before: "2026-05-30T00:00:00.000Z",
        batchSize: 1_000,
        dryRun: true
      }
    });
    const duplicateEnqueue = dispatcher.enqueue({
      id: "cleanup-job-1-retry",
      name: "artifact.cleanup",
      payload: {
        projectId: "project-1",
        before: "2026-05-30T00:00:00.000Z",
        batchSize: 1_000,
        dryRun: true
      }
    });

    const result = await dispatcher.processNext();
    const joinedMessages = messages.join("\n");
    const cleanupLog = messages
      .map((message) => JSON.parse(message))
      .find((message) => message.event === "artifact.cleanup.pipeline.planned");

    expect(firstEnqueue.status).toBe("enqueued");
    expect(duplicateEnqueue.status).toBe("duplicate");
    expect(result.status).toBe("completed");
    expect(cleanupLog).toMatchObject({
      dryRun: true,
      executionMode: "dry-run",
      requestedBatchSize: 1000,
      plannedBatchSize: 500,
      scannedArtifactCount: 525,
      stagedCandidateCount: 525,
      skippedOpenLaunchRecords: 0,
      retainedRecordCount: 0,
      deletionBatchCount: 0,
      dryRunBatchCount: 2,
      dryRunPlanDigest: expect.any(String),
      candidateCount: 525,
      deleteRequestedCount: 0,
      batches: [
        expect.objectContaining({
          index: 0,
          candidateCount: 500,
          totalBytes: 5000,
          candidateRefs: expect.arrayContaining([
            expect.stringMatching(/^artifact-retention-candidate:/)
          ]),
          batchDigest: expect.any(String),
          deletionExecution: false
        }),
        expect.objectContaining({
          index: 1,
          candidateCount: 25,
          totalBytes: 250,
          batchDigest: expect.any(String),
          deletionExecution: false
        })
      ],
      auditRecordCount: 2,
      auditEvidence: [
        expect.objectContaining({
          action: "retention.preview",
          status: "planned",
          scope: "closed-launches",
          candidateCount: 525,
          deleteRequestedCount: 0
        }),
        expect.objectContaining({
          action: "cleanup.dry-run",
          status: "noop",
          candidateCount: 525,
          deleteRequestedCount: 0,
          planDigest: expect.any(String)
        })
      ],
      summary: {
        dryRun: true,
        executionMode: "dry-run",
        plannedBatchSize: 500,
        scannedArtifactCount: 525,
        stagedCandidateCount: 525,
        skippedOpenLaunchRecords: 0,
        retainedRecordCount: 0,
        deletionBatchCount: 0,
        dryRunBatchCount: 2,
        candidateCount: 525,
        deleteRequestedCount: 0,
        totalCandidateBytes: 5250,
        auditRecordCount: 2,
        dryRunPlanDigest: expect.any(String)
      }
    });
    expect(joinedMessages).not.toContain("secret-bucket");
    expect(joinedMessages).not.toContain("raw-secret-path");
    expect(joinedMessages).not.toContain("digest-secret");
    expect(joinedMessages).not.toContain("storageKey");
    expect(joinedMessages).not.toContain("deleteObjects");
    expect(joinedMessages).not.toContain("cleanup.execution.planned");
    expect(joinedMessages).not.toContain("job.handler.placeholder");
  });
});
