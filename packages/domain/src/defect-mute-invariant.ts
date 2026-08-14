import type { DefectMuteReplayProjection } from "./defect-mute-types.js";
import { stableStringify } from "./defect-mute-utils.js";

export function defectMuteReplayInvariantShape(
  projection: DefectMuteReplayProjection,
  options: { includeDiagnostics: boolean }
): unknown {
  return {
    projectId: projection.projectId,
    totalEvents: projection.totalEvents,
    mutedEvents: projection.mutedEvents,
    unmutedEvents: projection.unmutedEvents,
    active: projection.active,
    inactive: projection.inactive,
    firstOccurredAt: projection.firstOccurredAt,
    lastOccurredAt: projection.lastOccurredAt,
    affectedSignatureHashes: projection.affectedSignatureHashes,
    affectedTestIds: projection.affectedTestIds,
    rawFailureHistory: projection.rawFailureHistory,
    effectiveState: projection.effectiveState,
    records: projection.records.map((record) => ({
      id: record.id,
      status: record.status,
      projectId: record.projectId,
      scope: record.scope,
      mutedAt: record.mutedAt,
      unmutedAt: record.unmutedAt,
      affectedSignatureHashes: record.affectedSignatureHashes,
      affectedTestIds: record.affectedTestIds,
      rawFailureHistory: record.rawFailureHistory
    })),
    events: projection.events.map((event) => ({
      id: event.id,
      type: event.type,
      muteId: event.muteId,
      projectId: event.projectId,
      occurredAt: event.occurredAt,
      scope: event.scope,
      affectedSignatureHashes: event.affectedSignatureHashes,
      affectedTestIds: event.affectedTestIds,
      rawFailureHistory: event.rawFailureHistory
    })),
    ...(options.includeDiagnostics
      ? {
          diagnostics: projection.diagnostics
            .map((diagnostic) => ({
              code: diagnostic.code,
              eventId: diagnostic.eventId,
              muteId: diagnostic.muteId,
              projectId: diagnostic.projectId,
              expectedProjectId: diagnostic.expectedProjectId,
              fieldPaths: diagnostic.fieldPaths
            }))
            .sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)))
        }
      : {})
  };
}
