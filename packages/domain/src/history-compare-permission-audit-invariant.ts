import type { HistoryComparePermissionAuditProjection } from "./history-compare-permission-audit.js";
import { stableStringify } from "./history-compare-permission-audit-utils.js";

export function historyComparePermissionReplayInvariantShape(
  projection: HistoryComparePermissionAuditProjection,
  options: { includeDiagnostics: boolean }
): unknown {
  return {
    projectId: projection.projectId,
    actorId: projection.actorId,
    totalEvents: projection.totalEvents,
    byDecision: projection.byDecision,
    actorIds: projection.actorIds,
    compareIds: projection.compareIds,
    testCaseIds: projection.testCaseIds,
    rawHistory: projection.rawHistory,
    records: projection.records.map((record) => ({
      projectId: record.projectId,
      actorId: record.actorId,
      compareId: record.compareId,
      testCaseId: record.testCaseId,
      decision: record.decision,
      reasons: record.reasons,
      unavailable: record.unavailable,
      rawHistory: record.rawHistory,
      eventIds: record.events.map((event) => event.id),
      firstOccurredAt: record.firstOccurredAt,
      lastOccurredAt: record.lastOccurredAt
    })),
    events: projection.events.map((event) => ({
      id: event.id,
      fingerprint: event.fingerprint,
      projectId: event.projectId,
      actorId: event.actorId,
      compareId: event.compareId,
      testCaseId: event.testCaseId,
      baseResultUuid: event.baseResultUuid,
      targetResultUuid: event.targetResultUuid,
      occurredAt: event.occurredAt,
      decision: event.decision,
      reasons: event.reasons,
      unavailable: event.unavailable,
      rawHistory: event.rawHistory,
      page: event.page
    })),
    ...(options.includeDiagnostics
      ? {
          diagnostics: projection.diagnostics
            .map((diagnostic) => ({
              code: diagnostic.code,
              eventId: diagnostic.eventId,
              compareId: diagnostic.compareId,
              projectId: diagnostic.projectId,
              actorId: diagnostic.actorId,
              expectedProjectId: diagnostic.expectedProjectId,
              expectedActorId: diagnostic.expectedActorId
            }))
            .sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)))
        }
      : {})
  };
}
