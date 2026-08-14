import type { DefectClusterOccurrence, DefectClusterReadModel } from "./defects.js";

export type DefectDispositionAction = "archived" | "result_unlinked";

export type DefectDispositionOccurrence = {
  launchId: string;
  resultUuid: string;
};

export type DefectDispositionEvent = {
  id: string;
  projectId: string;
  defectId: string;
  action: DefectDispositionAction;
  occurrences: DefectDispositionOccurrence[];
  actorId: string;
  reason: string;
  occurredAt: string;
};

export function appendDefectDispositionEvent(
  events: readonly DefectDispositionEvent[],
  event: DefectDispositionEvent
): DefectDispositionEvent[] {
  const existing = events.find((candidate) => candidate.id === event.id);
  if (existing === undefined) {
    return [...events, event];
  }
  if (JSON.stringify(existing) === JSON.stringify(event)) {
    return [...events];
  }
  throw new Error(`Defect disposition event ${event.id} is append-only and cannot be replaced.`);
}

export function applyDefectDispositionEvents(
  clusters: readonly DefectClusterReadModel[],
  events: readonly DefectDispositionEvent[]
): DefectClusterReadModel[] {
  const excludedByDefect = new Map<string, Set<string>>();
  for (const event of [...events].sort(compareEvents)) {
    const excluded = excludedByDefect.get(event.defectId) ?? new Set<string>();
    for (const occurrence of event.occurrences) {
      excluded.add(occurrenceKey(occurrence));
    }
    excludedByDefect.set(event.defectId, excluded);
  }

  return clusters.flatMap((cluster) => {
    const excluded = excludedByDefect.get(cluster.id);
    if (excluded === undefined) {
      return [cluster];
    }
    const occurrences = cluster.occurrences.filter(
      (occurrence) => !excluded.has(occurrenceKey(occurrence))
    );
    return occurrences.length === 0 ? [] : [withOccurrences(cluster, occurrences)];
  });
}

function withOccurrences(
  cluster: DefectClusterReadModel,
  occurrences: DefectClusterOccurrence[]
): DefectClusterReadModel {
  const first = occurrences[0]!;
  const last = occurrences[occurrences.length - 1]!;
  const latestLaunchId = cluster.state === "resolved-ish" ? undefined : cluster.lastSeenLaunchId;
  const currentOccurrences =
    latestLaunchId === undefined
      ? []
      : occurrences.filter((occurrence) => occurrence.launchId === latestLaunchId);
  const state =
    latestLaunchId === undefined || currentOccurrences.length === 0
      ? "resolved-ish"
      : first.launchId === latestLaunchId
        ? "new"
        : "recurring";

  return {
    ...cluster,
    state,
    occurrences,
    affectedTestIds: uniqueSorted(occurrences.map((occurrence) => occurrence.testId)),
    currentAffectedTestIds: uniqueSorted(currentOccurrences.map((occurrence) => occurrence.testId)),
    occurrenceCount: occurrences.length,
    firstSeenAt: first.launchCreatedAt,
    lastSeenAt: last.launchCreatedAt,
    firstSeenLaunchId: first.launchId,
    lastSeenLaunchId: last.launchId
  };
}

function occurrenceKey(occurrence: DefectDispositionOccurrence): string {
  return `${occurrence.launchId}\u0000${occurrence.resultUuid}`;
}

function compareEvents(left: DefectDispositionEvent, right: DefectDispositionEvent): number {
  const occurredAt = left.occurredAt.localeCompare(right.occurredAt);
  return occurredAt === 0 ? left.id.localeCompare(right.id) : occurredAt;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
