import { createHash } from "node:crypto";
import {
  buildDefectClusters,
  buildDefectMuteReplayInvariantEvidence,
  createDefectMute,
  evaluateQualityGate,
  redactSensitiveText,
  unmuteDefect,
  type DefectMuteAuditEvent,
  type DefectMuteEffectiveProjectionSnapshot,
  type DefectMuteOrigin,
  type DefectMuteRawFailureOccurrence,
  type DefectMuteRawFailureProjection,
  type DefectMuteRecord,
  type DefectMuteReplayProjection,
  type Launch as DomainLaunch,
  type QualityGateDecisionReason,
  type QualityGateEvaluation
} from "@testhistory/domain";
import type { AppStore, Launch } from "../store.js";

const workerProjectionActorId = "qa-api-agent";

type DefectMuteProjectionQueryShape = {
  actorId?: string;
  launchId?: string;
  status?: "active" | "inactive";
};

type DefectMuteProjectionPageShape = {
  limit: number;
  cursor: string | null;
};

export function buildWorkerDefectMuteEvents(
  store: AppStore,
  projectId: string
): DefectMuteAuditEvent[] {
  const launches = projectLaunches(store, projectId);
  const clusters = buildDefectClusters(launches as DomainLaunch[]);
  return clusters.flatMap((cluster, index) => {
    const occurredAt = addSeconds(cluster.lastSeenAt, index + 1);
    const record = createDefectMute({
      id: `worker-mute-${cluster.signature.hash}`,
      projectId,
      scope: { signatureHashes: [cluster.signature.hash] },
      reason: `Worker projection for failure signature ${cluster.signature.hash}`,
      origin: { type: "actor", actorId: workerProjectionActorId },
      occurredAt,
      clusters: [cluster]
    });

    if (cluster.state !== "resolved-ish") {
      return record.auditEvents;
    }

    return unmuteDefect({
      record,
      reason: "Worker projection closed resolved defect mute",
      origin: { type: "actor", actorId: workerProjectionActorId },
      occurredAt: addSeconds(occurredAt, 1)
    }).auditEvents;
  });
}

function projectLaunches(store: AppStore, projectId: string): Launch[] {
  return (Array.from(store.launches.values()) as Launch[])
    .filter((launch) => launch.projectId === projectId)
    .sort((left, right) => {
      const createdAt = left.createdAt.localeCompare(right.createdAt);
      return createdAt === 0 ? left.id.localeCompare(right.id) : createdAt;
    });
}

export function selectQualityGateLaunch(
  store: AppStore,
  projectId: string,
  launchId: string | undefined
): Launch | undefined {
  if (launchId !== undefined) {
    const launch = store.launches.get(launchId) as Launch | undefined;
    return launch?.projectId === projectId ? launch : undefined;
  }

  return projectLaunches(store, projectId).at(-1);
}

export function buildProjectedQualityGate(launch: Launch, activeRecords: DefectMuteRecord[]) {
  const evaluation = evaluateQualityGate(launch as DomainLaunch, {
    rules: [],
    thresholds: {
      newFailures: { op: "lte", value: 0, severity: "fail" },
      failedBrokenTotal: { op: "lte", value: 0, severity: "fail" },
      criticalFailures: { op: "lte", value: 0, severity: "fail" },
      flakyTests: { op: "lte", value: 0, severity: "warn" },
      durationRegressions: { op: "lte", value: 0, severity: "warn" },
      unknown: { op: "lte", value: 0, severity: "warn" },
      passRate: { op: "gte", value: 0, severity: "warn" }
    },
    defectMutes: activeRecords,
    defectMuteRules: [
      {
        code: "worker-mute-new-failures",
        reasonCode: "quality_gate.newFailures",
        mode: "exclude_muted_affected_tests"
      },
      {
        code: "worker-mute-failed-broken-total",
        reasonCode: "quality_gate.failedBrokenTotal",
        mode: "exclude_muted_affected_tests"
      },
      {
        code: "worker-mute-critical-failures",
        reasonCode: "quality_gate.criticalFailures",
        mode: "exclude_muted_affected_tests"
      }
    ]
  });

  return serializeProjectedQualityGate(launch, evaluation);
}

function serializeProjectedQualityGate(launch: Launch, evaluation: QualityGateEvaluation) {
  return {
    launchId: launch.id,
    raw: {
      status: evaluation.rawStatus,
      metrics: evaluation.metrics,
      statusCounters: evaluation.statusCounters
    },
    effective: {
      status: evaluation.status,
      effects: evaluation.effects,
      reasons: evaluation.reasons.map(serializeQualityGateReason)
    },
    distinction:
      "Raw failure counters remain unchanged; effective gate fields show explicit defect mute projection effects."
  };
}

function serializeQualityGateReason(reason: QualityGateDecisionReason) {
  return {
    code: reason.code,
    metric: reason.metric,
    severity: reason.severity,
    passed: reason.passed,
    effectivePassed: reason.effectivePassed,
    actual: reason.actual,
    effectiveActual: reason.effectiveActual,
    op: reason.op,
    threshold: reason.threshold,
    affectedTestCaseIds: sanitizeProjectionStringArray(reason.affectedTestCaseIds),
    affectedResultUuids: sanitizeProjectionStringArray(reason.affectedResultUuids),
    effects: reason.effects.map((effect) => ({
      ...effect,
      muteIds: sanitizeProjectionStringArray(effect.muteIds),
      affectedTestCaseIds: sanitizeProjectionStringArray(effect.affectedTestCaseIds),
      affectedSignatureHashes: sanitizeProjectionStringArray(effect.affectedSignatureHashes),
      explanation: redactSensitiveText(effect.explanation)
    }))
  };
}

export function serializeProjectionRecord(record: DefectMuteRecord) {
  return {
    id: record.id,
    status: record.status,
    ...(record.projectId !== undefined ? { projectId: record.projectId } : {}),
    origin: record.origin,
    reason: record.reason,
    mutedAt: record.mutedAt,
    ...(record.unmutedAt !== undefined ? { unmutedAt: record.unmutedAt } : {}),
    ...(record.unmutedBy !== undefined ? { unmutedBy: record.unmutedBy } : {}),
    ...(record.unmuteReason !== undefined ? { unmuteReason: record.unmuteReason } : {}),
    scope: record.scope,
    affectedSignatureHashes: record.affectedSignatureHashes,
    affectedTestIds: record.affectedTestIds,
    rawFailureHistory: summarizeRawFailureOccurrences(record.rawFailureHistory),
    audit: {
      eventCount: record.auditEvents.length,
      mutedEventCount: record.auditEvents.filter((event) => event.type === "defect.muted").length,
      unmutedEventCount: record.auditEvents.filter((event) => event.type === "defect.unmuted")
        .length
    }
  };
}

export function serializeProjectionQuery(
  projectId: string,
  actorId: string | undefined,
  query: DefectMuteProjectionQueryShape,
  page: DefectMuteProjectionPageShape
) {
  return {
    projectId,
    ...(actorId !== undefined ? { actorId } : {}),
    ...(query.launchId !== undefined ? { launchId: query.launchId } : {}),
    ...(query.status !== undefined ? { status: query.status } : {}),
    limit: page.limit,
    cursor: page.cursor
  };
}

export function serializeRawFailureProjection(projection: DefectMuteRawFailureProjection) {
  return {
    totalOccurrences: projection.totalOccurrences,
    statusCounters: projection.statusCounters,
    byTestId: projection.byTestId,
    bySignatureHash: projection.bySignatureHash
  };
}

export function serializeEffectiveProjectionState(state: DefectMuteEffectiveProjectionSnapshot) {
  return {
    projectId: state.projectId,
    activeMuteIds: state.activeMuteIds,
    inactiveMuteIds: state.inactiveMuteIds,
    affectedSignatureHashes: state.affectedSignatureHashes,
    affectedTestIds: state.affectedTestIds,
    records: state.records
  };
}

function summarizeRawFailureOccurrences(occurrences: DefectMuteRawFailureOccurrence[]) {
  const statusCounters: Record<"failed" | "broken", number> = { failed: 0, broken: 0 };
  const byTestId: Record<string, number> = {};
  const bySignatureHash: Record<string, number> = {};
  for (const occurrence of occurrences) {
    statusCounters[occurrence.status] += 1;
    byTestId[occurrence.testId] = (byTestId[occurrence.testId] ?? 0) + 1;
    bySignatureHash[occurrence.signatureHash] =
      (bySignatureHash[occurrence.signatureHash] ?? 0) + 1;
  }

  return {
    totalOccurrences: occurrences.length,
    statusCounters,
    byTestId: sortRecord(byTestId),
    bySignatureHash: sortRecord(bySignatureHash)
  };
}

export function originActorId(origin: DefectMuteOrigin): string | undefined {
  return origin.type === "actor" ? origin.actorId : undefined;
}

export function buildProjectionDigest(
  projectId: string,
  projection: DefectMuteReplayProjection
): string {
  const hash = createHash("sha256");
  hash.update("defect.mute.project.projection");
  hash.update("\0");
  hash.update(projectId);
  for (const event of projection.events) {
    hash.update("\0");
    hash.update(event.id);
  }
  for (const record of projection.records) {
    hash.update("\0");
    hash.update(record.id);
    hash.update("\0");
    hash.update(record.status);
    hash.update("\0");
    hash.update(record.mutedAt);
    hash.update("\0");
    hash.update(record.unmutedAt ?? "");
  }

  return hash.digest("hex");
}

export function buildDefectMuteReplayInvariantMaterializedRecord(input: {
  projectId: string;
  materializedAt: string;
  evidence: ReturnType<typeof buildDefectMuteReplayInvariantEvidence>;
}) {
  const leakedMarkerHashes = sanitizeProjectionStringArray(
    input.evidence.redaction.leakedMarkers
  ).map((marker) => buildShortDigest("defect-mute-redaction-marker", marker));
  const duplicateEventIdHashes = sanitizeProjectionStringArray(
    input.evidence.appendOnly.duplicateEventIds
  ).map((eventId) => buildShortDigest("defect-mute-duplicate-event", eventId));
  const evidenceDigest = buildShortDigest("defect-mute-replay-invariant-evidence", {
    deterministic: input.evidence.deterministic,
    recomputable: input.evidence.recomputable,
    projectScoped: input.evidence.projectScoped,
    appendOnly: {
      uniqueProjectedEventIds: input.evidence.appendOnly.uniqueProjectedEventIds,
      projectedEventCount: input.evidence.appendOnly.projectedEventIds.length,
      duplicateEventIdHashes
    },
    rawEffectiveSeparation: input.evidence.rawEffectiveSeparation,
    redaction: {
      passed: input.evidence.redaction.passed,
      leakedMarkerHashes
    },
    projectionDigest: input.evidence.projectionDigest,
    recomputedDigest: input.evidence.recomputedDigest
  });

  return {
    invariantRef: `defect-mute-replay-invariant:${evidenceDigest}`,
    projectId: input.projectId,
    source: "projected-defect-mute-state",
    materializedAt: input.materializedAt,
    deterministic: input.evidence.deterministic,
    recomputable: input.evidence.recomputable,
    projectScoped: input.evidence.projectScoped,
    appendOnly: {
      uniqueProjectedEventIds: input.evidence.appendOnly.uniqueProjectedEventIds,
      projectedEventCount: input.evidence.appendOnly.projectedEventIds.length,
      duplicateEventCount: input.evidence.appendOnly.duplicateEventIds.length,
      duplicateEventIdHashes
    },
    redaction: {
      passed: input.evidence.redaction.passed,
      leakedMarkerCount: input.evidence.redaction.leakedMarkers.length,
      leakedMarkerHashes
    },
    rawEffectiveSeparation: {
      ...input.evidence.rawEffectiveSeparation,
      rawFailurePayloadIncluded: false as const
    },
    projectionDigest: input.evidence.projectionDigest,
    recomputedDigest: input.evidence.recomputedDigest,
    evidenceDigest
  };
}

export function buildMaterializedInvariantDigest(
  records: Array<ReturnType<typeof buildDefectMuteReplayInvariantMaterializedRecord>>
): string {
  return buildShortDigest(
    "defect-mute-replay-invariant-materialized-read",
    records.map((record) => ({
      invariantRef: record.invariantRef,
      projectId: record.projectId,
      materializedAt: record.materializedAt,
      evidenceDigest: record.evidenceDigest
    }))
  );
}

function buildShortDigest(scope: string, value: unknown): string {
  const hash = createHash("sha256");
  hash.update(scope);
  hash.update("\0");
  hash.update(typeof value === "string" ? value : JSON.stringify(value));
  return hash.digest("hex").slice(0, 24);
}

export function sanitizeProjectionStringArray(values: string[]): string[] {
  return values.map(redactSensitiveText).filter((value) => value.length > 0);
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
  );
}

function addSeconds(iso: string, seconds: number): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) {
    return iso;
  }

  return new Date(time + seconds * 1000).toISOString();
}
