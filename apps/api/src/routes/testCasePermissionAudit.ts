import {
  buildHistoryComparePermissionAuditReplayInvariantEvidence,
  createHistoryComparePermissionAuditEvent,
  type HistoryComparePermissionAuditEvent,
  type HistoryComparePermissionAuditProjection,
  type HistoryComparePermissionAuditRecord,
  type Launch
} from "@testhistory/domain";
import type { FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import type { AppStore } from "../store.js";
import { authorizeProjectScope } from "./project-auth.js";
import {
  actorIdHeader,
  buildHistoryPoints,
  findHistoryCandidate,
  sanitizeHistoryCompareText,
  summarizeCompareEnrichment,
  toHistoryCompareSnapshot
} from "./testCaseHistory.js";
import {
  historyCompareReadScope,
  type HistoryComparePermissionAuditInvariantQuery,
  type HistoryComparePermissionAuditQuery,
  type HistoryPage
} from "./testCaseRouteSupport.js";

export function buildHistoryComparePermissionAuditEvents(input: {
  launches: Launch[];
  projectId: string;
  testCaseId: string;
  actorId: string;
  baseResultUuid?: string;
  targetResultUuid?: string;
}): HistoryComparePermissionAuditEvent[] {
  const points = buildHistoryPoints(input.launches, input.testCaseId);
  const pairs =
    input.baseResultUuid !== undefined && input.targetResultUuid !== undefined
      ? [{ baseResultUuid: input.baseResultUuid, targetResultUuid: input.targetResultUuid }]
      : points.slice(1).map((point, index) => ({
          baseResultUuid: points[index]!.resultUuid,
          targetResultUuid: point.resultUuid
        }));

  return pairs
    .filter((pair) => pair.baseResultUuid !== pair.targetResultUuid)
    .flatMap((pair, index) => {
      const base = findHistoryCandidate(input.launches, input.testCaseId, pair.baseResultUuid);
      const target = findHistoryCandidate(input.launches, input.testCaseId, pair.targetResultUuid);
      if (base === undefined || target === undefined) {
        return [];
      }

      const beforeSnapshot = toHistoryCompareSnapshot(base.launch, base.result);
      const afterSnapshot = toHistoryCompareSnapshot(target.launch, target.result);
      const enrichment = summarizeCompareEnrichment(beforeSnapshot, afterSnapshot);
      const decision = enrichment.status === "partial" ? "partial" : "ready";

      return [
        createHistoryComparePermissionAuditEvent({
          projectId: input.projectId,
          actorId: input.actorId,
          compareId: buildPermissionAuditCompareId(
            input.projectId,
            input.testCaseId,
            pair.baseResultUuid,
            pair.targetResultUuid
          ),
          testCaseId: input.testCaseId,
          baseResultUuid: pair.baseResultUuid,
          targetResultUuid: pair.targetResultUuid,
          occurredAt: permissionAuditOccurredAt(target.launch, index),
          decision,
          reasons:
            decision === "ready"
              ? [
                  {
                    code: "history_compare_permission.ready",
                    severity: "info",
                    explanation: "Compare fields are available for this actor and project.",
                    fields: []
                  }
                ]
              : [
                  {
                    code: "history_compare_permission.field_hidden",
                    severity: "warn",
                    explanation: "Some compare enrichment fields are unavailable for this actor.",
                    fields: enrichment.unavailable
                  }
                ],
          unavailable: enrichment.unavailable,
          rawHistory: [
            { resultUuid: base.result.uuid, raw: base.result.raw },
            { resultUuid: target.result.uuid, raw: target.result.raw }
          ],
          page: { returned: 0, total: 0, omitted: 0 }
        })
      ];
    });
}

export function serializePermissionAuditQuery(
  projectId: string,
  actorId: string,
  query: HistoryComparePermissionAuditQuery,
  page: HistoryPage
) {
  return {
    projectId,
    actorId,
    testCaseScoped: true,
    projectScoped: true,
    actorScoped: true,
    comparePairScoped: query.baseResultUuid !== undefined && query.targetResultUuid !== undefined,
    pagination: {
      limit: page.limit,
      cursor: page.cursor,
      offset: page.offset
    },
    redacted: true
  };
}

export function serializePermissionAuditInvariantQuery(
  projectId: string,
  actorId: string,
  testCaseId: string,
  query: HistoryComparePermissionAuditInvariantQuery,
  page: HistoryPage
) {
  return {
    projectId,
    actorId,
    testCaseId,
    testCaseScoped: true,
    projectScoped: true,
    actorScoped: true,
    comparePairScoped: query.baseResultUuid !== undefined && query.targetResultUuid !== undefined,
    pagination: {
      limit: page.limit,
      cursor: page.cursor,
      offset: page.offset
    },
    redacted: true
  };
}

export function serializePermissionAuditProjection(
  projectId: string,
  projection: HistoryComparePermissionAuditProjection
) {
  return {
    adapterKind: "in-memory-history-compare-permission-audit-wip",
    boundary: "read-only-permission-audit-projection",
    projectId,
    actorScoped: projection.actorId !== undefined,
    projectionDigest: buildPermissionAuditProjectionDigest(projectId, projection),
    mutationBoundary: "read-only-no-rest-mutation",
    replayedEventCount: projection.totalEvents,
    recordCount: projection.records.length,
    byDecision: projection.byDecision,
    actorCount: projection.actorIds.length,
    compareCount: projection.compareIds.length,
    testCaseCount: projection.testCaseIds.length,
    rawHistory: projection.rawHistory,
    firstOccurredAt: projection.firstOccurredAt,
    lastOccurredAt: projection.lastOccurredAt
  };
}

export function serializePermissionAuditRecord(record: HistoryComparePermissionAuditRecord) {
  const sourcePage = record.events[record.events.length - 1]?.page;
  return {
    compareId: record.compareId,
    testCaseId: record.testCaseId,
    actor: { type: "actor", actorId: record.actorId, scoped: true },
    decision: record.decision,
    reasons: record.reasons,
    unavailable: record.unavailable,
    rawHistory: record.rawHistory,
    eventCount: record.events.length,
    ...(sourcePage !== undefined ? { sourcePage } : {}),
    firstOccurredAt: record.firstOccurredAt,
    lastOccurredAt: record.lastOccurredAt,
    redacted: true
  };
}

export function buildHistoryComparePermissionAuditPersistedInvariantRecord(input: {
  projectId: string;
  testCaseId: string;
  actorId: string;
  ordinal: number;
  eventId: string;
  persistedAt: string;
  evidence: ReturnType<typeof buildHistoryComparePermissionAuditReplayInvariantEvidence>;
}) {
  const eventIdDigest = buildShortPermissionAuditDigest("persisted-invariant-event", input.eventId);
  const evidenceDigest = buildShortPermissionAuditDigest("persisted-invariant-evidence", {
    deterministic: input.evidence.deterministic,
    recomputable: input.evidence.recomputable,
    projectScoped: input.evidence.projectScoped,
    actorScoped: input.evidence.actorScoped.passed,
    rawCompareInputs: {
      preserved: input.evidence.rawCompareInputs.preserved,
      digestCount: input.evidence.rawCompareInputs.digestCount,
      itemCount: input.evidence.rawCompareInputs.itemCount
    },
    redactionPassed: input.evidence.redaction.passed,
    projectionDigest: input.evidence.projectionDigest,
    recomputedDigest: input.evidence.recomputedDigest
  });

  return {
    kind: "test-case-history-compare-permission-audit-replay-invariant-persisted-record",
    persistedRef: `history-compare-permission-audit-replay-invariant-persisted:${eventIdDigest}`,
    projectId: input.projectId,
    testCaseId: input.testCaseId,
    actor: { type: "actor", actorId: input.actorId, scoped: true },
    ordinal: input.ordinal,
    eventIdHash: eventIdDigest,
    persistedAt: input.persistedAt,
    deterministic: input.evidence.deterministic,
    recomputable: input.evidence.recomputable,
    projectScoped: input.evidence.projectScoped,
    actorScoped: input.evidence.actorScoped.passed,
    appendOnly: {
      uniqueProjectedEventIds: input.evidence.appendOnly.uniqueProjectedEventIds,
      projectedEventCount: input.evidence.appendOnly.projectedEventIds.length,
      duplicateEventCount: input.evidence.appendOnly.duplicateEventIds.length
    },
    rawCompareInputs: {
      included: false as const,
      preserved: input.evidence.rawCompareInputs.preserved,
      digestCount: input.evidence.rawCompareInputs.digestCount,
      itemCount: input.evidence.rawCompareInputs.itemCount
    },
    redaction: {
      passed: input.evidence.redaction.passed,
      leakedMarkerCount: input.evidence.redaction.leakedMarkers.length,
      leakedMarkers: sanitizePermissionAuditInvariantStrings(
        input.evidence.redaction.leakedMarkers
      ),
      rawHistoryIncluded: false as const,
      rawCompareInputsIncluded: false as const,
      hiddenOrMaskedValuesIncluded: false as const,
      tokensIncluded: false as const,
      pathsIncluded: false as const,
      storageLocationsIncluded: false as const,
      artifactUrlsIncluded: false as const,
      policy:
        "Persisted invariant records include opaque digests and boolean evidence only; raw compare inputs, raw history bodies, hidden values, local paths, storage refs, tokens, and signed URLs are not exposed."
    },
    persistence: {
      source: "history-compare-permission-audit-replay-invariants",
      readOnly: true,
      mutationBoundary: "rest-persisted-read-only-no-compare-or-replay-mutation"
    },
    execution: {
      compareStarted: false,
      replayStarted: false,
      workerJobEnqueued: false,
      mutation: false
    },
    projectionDigest: buildPermissionAuditInvariantDigest(input.evidence.projectionDigest),
    recomputedDigest: buildPermissionAuditInvariantDigest(input.evidence.recomputedDigest),
    evidenceDigest,
    redacted: true
  };
}

export function buildHistoryComparePermissionAuditPersistedDigest(
  records: Array<ReturnType<typeof buildHistoryComparePermissionAuditPersistedInvariantRecord>>
): string {
  return hashParts([
    "history-compare-permission-audit-replay-invariant-persisted-read",
    JSON.stringify(
      records.map((record) => ({
        persistedRef: record.persistedRef,
        projectId: record.projectId,
        testCaseId: record.testCaseId,
        actorId: record.actor.actorId,
        persistedAt: record.persistedAt,
        evidenceDigest: record.evidenceDigest
      }))
    )
  ]);
}

export function sanitizePermissionAuditInvariantStrings(values: readonly string[]): string[] {
  return values.map((value) => sanitizeHistoryCompareText(value, []));
}

function buildShortPermissionAuditDigest(scope: string, value: unknown): string {
  return hashParts([scope, typeof value === "string" ? value : JSON.stringify(value)]).slice(0, 24);
}

function buildPermissionAuditCompareId(
  projectId: string,
  testCaseId: string,
  baseResultUuid: string,
  targetResultUuid: string
): string {
  const digest = hashParts([
    "history-compare-permission",
    projectId,
    testCaseId,
    baseResultUuid,
    targetResultUuid
  ]);
  return `history-compare-permission:${digest.slice(0, 24)}`;
}

function buildPermissionAuditProjectionDigest(
  projectId: string,
  projection: HistoryComparePermissionAuditProjection
): string {
  const hash = createHash("sha256");
  hash.update("history-compare-permission-audit-projection");
  hash.update("\0");
  hash.update(projectId);
  hash.update("\0");
  hash.update(projection.actorId ?? "");
  for (const event of projection.events) {
    hash.update("\0");
    hash.update(event.id);
    hash.update("\0");
    hash.update(event.fingerprint);
  }
  return hash.digest("hex");
}

export function buildPermissionAuditInvariantDigest(value: string): string {
  return hashParts(["history-compare-permission-audit-replay-invariant", value]);
}

function permissionAuditOccurredAt(launch: Launch, index: number): string {
  const timestamp = Date.parse(launch.createdAt);
  if (!Number.isFinite(timestamp)) {
    return launch.createdAt;
  }

  return new Date(timestamp + index).toISOString();
}

function hashParts(parts: string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function authorizeHistoryComparePermissionAuditRead(
  store: AppStore,
  request: FastifyRequest,
  projectId: string
) {
  const denial = authorizeHistoryCompareRead(store, request, projectId);
  if (denial === undefined) {
    return undefined;
  }

  return {
    ...denial,
    kind: "test-case-history-compare-permission-audit",
    message:
      denial.availability.reason === "missing_scope"
        ? "Missing required test case history compare permission audit read scope"
        : denial.availability.reason === "invalid_token"
          ? "API token is invalid"
          : "Actor is not allowed to read test case history compare permission audit for this project",
    availability: {
      ...denial.availability,
      status: "denied" as const
    }
  };
}

export function authorizeHistoryCompareRead(
  store: AppStore,
  request: FastifyRequest,
  projectId: string
) {
  const actorId = actorIdHeader(request);
  const project = store.projects.get(projectId);
  const denial =
    project === undefined
      ? {
          message: "Actor is not allowed to access this project"
        }
      : authorizeProjectScope(request, project, historyCompareReadScope);
  if (denial === undefined) {
    return undefined;
  }

  const reason =
    denial.message === "API token is invalid"
      ? "invalid_token"
      : denial.message.startsWith("Missing required")
        ? "missing_scope"
        : "project_scope_denied";
  if (reason === "missing_scope") {
    return {
      kind: "test-case-history-compare",
      error: "PermissionDeniedError",
      message: "Missing required test case history compare read scope",
      requiredScopes: [historyCompareReadScope],
      projectId,
      ...(actorId !== undefined ? { actor: { type: "actor", actorId, scoped: true } } : {}),
      access: {
        scope: historyCompareReadScope,
        projectScoped: true,
        actorScoped: actorId !== undefined,
        mutation: false,
        redacted: true
      },
      availability: {
        status: "denied",
        reason: "missing_scope",
        projectScoped: true,
        actorScoped: actorId !== undefined,
        redacted: true,
        partial: false,
        unavailable: []
      },
      redacted: true
    };
  }

  return {
    kind: "test-case-history-compare",
    error: "PermissionDeniedError",
    message:
      reason === "invalid_token"
        ? "API token is invalid"
        : "Actor is not allowed to compare test case history for this project",
    requiredScopes: [historyCompareReadScope],
    projectId,
    ...(actorId !== undefined ? { actor: { type: "actor", actorId, scoped: true } } : {}),
    access: {
      scope: historyCompareReadScope,
      projectScoped: true,
      actorScoped: actorId !== undefined,
      mutation: false,
      redacted: true
    },
    availability: {
      status: "denied",
      reason,
      projectScoped: true,
      actorScoped: actorId !== undefined,
      redacted: true,
      partial: false,
      unavailable: []
    },
    redacted: true
  };
}
