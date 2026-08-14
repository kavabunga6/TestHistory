import {
  isArchiveDiagnosticReplayCode,
  isArchiveDiagnosticReplaySource
} from "./workerArchiveDiagnosticPredicates.js";
import { hashIdempotencyParts } from "./workerHash.js";
import { isNonEmptyString } from "./workerValueUtils.js";
import type {
  ArchiveDiagnosticReplayAdapter,
  ArchiveDiagnosticReplayDiagnostic,
  ArchiveDiagnosticReplayEvent,
  ArchiveDiagnosticReplayJobPayload,
  ArchiveDiagnosticReplayPlan,
  ArchiveDiagnosticReplayRecord,
  ArchiveDiagnosticReplaySource,
  ArchiveDiagnosticReplaySummary
} from "./workerTypes.js";

export function buildArchiveDiagnosticReplayPlan(
  payload: ArchiveDiagnosticReplayJobPayload,
  at: string
): ArchiveDiagnosticReplayPlan {
  const diagnostics: ArchiveDiagnosticReplayDiagnostic[] = [];
  const acceptedRecords: ArchiveDiagnosticReplayRecord[] = [];
  const seenEventRefs = new Set<string>();
  let duplicateEventCount = 0;
  let rejectedOpenLaunchEventCount = 0;
  let rejectedOutOfScopeEventCount = 0;
  let invalidEventCount = 0;

  for (const event of orderArchiveDiagnosticReplayEvents(payload.events)) {
    const eventRef = buildArchiveDiagnosticEventRef(event);
    if (!isValidArchiveDiagnosticReplayEvent(event)) {
      invalidEventCount += 1;
      diagnostics.push({
        code: "invalid-event",
        severity: "error",
        retryable: false,
        eventRef,
        message: "Archive diagnostic evidence event was rejected before replay."
      });
      continue;
    }

    if (
      event.projectId !== payload.projectId ||
      event.launchId !== payload.launchId ||
      event.archiveRef !== payload.archiveRef
    ) {
      rejectedOutOfScopeEventCount += 1;
      diagnostics.push({
        code: "out-of-scope-event",
        severity: "warn",
        retryable: false,
        eventRef,
        message: "Archive diagnostic evidence event was outside the replay scope."
      });
      continue;
    }

    if (event.launchState !== "closed") {
      rejectedOpenLaunchEventCount += 1;
      diagnostics.push({
        code: "open-launch-event",
        severity: "warn",
        retryable: false,
        eventRef,
        message: "Archive diagnostic evidence event was ignored until the launch is closed."
      });
      continue;
    }

    if (seenEventRefs.has(eventRef)) {
      duplicateEventCount += 1;
      diagnostics.push({
        code: "duplicate-event",
        severity: "info",
        retryable: false,
        eventRef,
        message: "Duplicate archive diagnostic evidence event was ignored by replay."
      });
      continue;
    }
    seenEventRefs.add(eventRef);

    acceptedRecords.push({
      eventRef,
      projectId: event.projectId,
      launchId: event.launchId,
      archiveRef: event.archiveRef,
      source: event.source,
      code: event.code,
      severity: event.severity,
      retryable: event.retryable,
      occurredAt: event.occurredAt,
      ...(event.entryRef !== undefined
        ? { entryRef: normalizeArchiveDiagnosticRef(event.entryRef) }
        : {}),
      ...(event.chunkRef !== undefined
        ? { chunkRef: normalizeArchiveDiagnosticRef(event.chunkRef) }
        : {})
    });
  }

  const records = orderArchiveDiagnosticReplayRecords(acceptedRecords);
  const summary = buildArchiveDiagnosticReplaySummary({
    payload,
    records,
    duplicateEventCount,
    rejectedOpenLaunchEventCount,
    rejectedOutOfScopeEventCount,
    invalidEventCount
  });

  return {
    boundary: "worker-local-archive-diagnostics-replay",
    consistency: "retry-safe-idempotent-synthetic-evidence",
    transitions: [
      { state: "archive_diagnostic_events_received", at },
      { state: "archive_diagnostic_events_summarized", at },
      { state: "archive_diagnostic_replay_ready", at }
    ],
    records,
    diagnostics,
    summary
  };
}

export function createInMemoryArchiveDiagnosticReplayAdapter(
  initialEvents: readonly ArchiveDiagnosticReplayEvent[] = []
): ArchiveDiagnosticReplayAdapter {
  const recordsByScope = new Map<string, Map<string, ArchiveDiagnosticReplayRecord>>();

  function applyRecords(
    projectId: string,
    launchId: string,
    archiveRef: string,
    records: readonly ArchiveDiagnosticReplayRecord[]
  ): { appendedEventCount: number; unchangedEventCount: number; totalStoredEventCount: number } {
    const key = archiveDiagnosticProjectionKey({ projectId, launchId, archiveRef });
    const storedRecords =
      recordsByScope.get(key) ?? new Map<string, ArchiveDiagnosticReplayRecord>();
    recordsByScope.set(key, storedRecords);
    let appendedEventCount = 0;
    let unchangedEventCount = 0;

    for (const record of records) {
      const current = storedRecords.get(record.eventRef);
      if (current === undefined) {
        appendedEventCount += 1;
        storedRecords.set(record.eventRef, cloneArchiveDiagnosticReplayRecord(record));
        continue;
      }

      if (JSON.stringify(current) === JSON.stringify(record)) {
        unchangedEventCount += 1;
      }
    }

    return {
      appendedEventCount,
      unchangedEventCount,
      totalStoredEventCount: storedRecords.size
    };
  }

  const adapter: ArchiveDiagnosticReplayAdapter = {
    kind: "in-memory-archive-diagnostics-replay-wip",
    applyEvents({ projectId, launchId, archiveRef, events, replayDigest, at }) {
      const payload = { projectId, launchId, archiveRef, events };
      const plan = buildArchiveDiagnosticReplayPlan(payload, at);
      const applyResult = applyRecords(projectId, launchId, archiveRef, plan.records);
      const projection = adapter.getProjection({ projectId, launchId, archiveRef });

      return {
        ...projection.summary,
        adapterKind: "in-memory-archive-diagnostics-replay-wip",
        boundary: "worker-local-archive-diagnostics-replay",
        consistency: "append-only-idempotent-replay",
        appliedAt: at,
        idempotencyKeyHash: hashIdempotencyParts([
          "archive.diagnostics.replay.apply",
          replayDigest,
          ...plan.records.map((record) => record.eventRef)
        ]),
        receivedEventCount: events.length,
        appendedEventCount: applyResult.appendedEventCount,
        unchangedEventCount: applyResult.unchangedEventCount,
        totalStoredEventCount: applyResult.totalStoredEventCount
      };
    },
    getProjection(input) {
      const key = archiveDiagnosticProjectionKey(input);
      const records = orderArchiveDiagnosticReplayRecords([
        ...(recordsByScope.get(key)?.values() ?? [])
      ]);
      return {
        projectId: input.projectId,
        launchId: input.launchId,
        archiveRef: input.archiveRef,
        records,
        summary: buildArchiveDiagnosticReplaySummary({
          payload: { ...input, events: [] },
          records,
          duplicateEventCount: 0,
          rejectedOpenLaunchEventCount: 0,
          rejectedOutOfScopeEventCount: 0,
          invalidEventCount: 0
        })
      };
    },
    snapshot() {
      return [...recordsByScope.keys()]
        .map((key) => {
          const [projectId, launchId, archiveRef] = key.split("\u001f");
          return adapter.getProjection({
            projectId: projectId ?? "",
            launchId: launchId ?? "",
            archiveRef: archiveRef ?? ""
          });
        })
        .sort((left, right) =>
          [left.projectId, left.launchId, left.archiveRef]
            .join("\u001f")
            .localeCompare([right.projectId, right.launchId, right.archiveRef].join("\u001f"))
        );
    }
  };

  if (initialEvents.length > 0) {
    const groupedEvents = new Map<string, ArchiveDiagnosticReplayEvent[]>();
    for (const event of initialEvents) {
      const key = archiveDiagnosticProjectionKey(event);
      const events = groupedEvents.get(key) ?? [];
      events.push(event);
      groupedEvents.set(key, events);
    }
    for (const events of groupedEvents.values()) {
      const first = events[0];
      if (first === undefined) {
        continue;
      }
      adapter.applyEvents({
        projectId: first.projectId,
        launchId: first.launchId,
        archiveRef: first.archiveRef,
        events,
        replayDigest: "initial",
        at: first.occurredAt
      });
    }
  }

  return adapter;
}

function buildArchiveDiagnosticReplaySummary(input: {
  payload: ArchiveDiagnosticReplayJobPayload;
  records: readonly ArchiveDiagnosticReplayRecord[];
  duplicateEventCount: number;
  rejectedOpenLaunchEventCount: number;
  rejectedOutOfScopeEventCount: number;
  invalidEventCount: number;
}): ArchiveDiagnosticReplaySummary {
  const severityCounts = createEmptyArchiveDiagnosticSeverityCounts();
  const sourceCounts = createEmptyArchiveDiagnosticSourceCounts();
  for (const record of input.records) {
    severityCounts[record.severity] += 1;
    sourceCounts[record.source] += 1;
  }

  return {
    projectId: input.payload.projectId,
    launchId: input.payload.launchId,
    archiveRef: input.payload.archiveRef,
    eventCount: input.payload.events.length,
    acceptedEventCount: input.records.length,
    duplicateEventCount: input.duplicateEventCount,
    rejectedOpenLaunchEventCount: input.rejectedOpenLaunchEventCount,
    rejectedOutOfScopeEventCount: input.rejectedOutOfScopeEventCount,
    invalidEventCount: input.invalidEventCount,
    retryableEventCount: input.records.filter((record) => record.retryable).length,
    severityCounts,
    sourceCounts,
    replayDigest: hashIdempotencyParts([
      "archive-diagnostics-replay",
      input.payload.projectId,
      input.payload.launchId,
      input.payload.archiveRef,
      ...input.records.map((record) =>
        [
          record.eventRef,
          record.source,
          record.code,
          record.severity,
          record.retryable ? "retryable" : "terminal"
        ].join(":")
      )
    ]),
    closedArchiveStatusReadCompatible: true,
    closedArchiveDiagnosticsReadCompatible: true,
    mutationBoundary: "worker-replay-only-no-rest-or-ui-claims"
  };
}

function createEmptyArchiveDiagnosticSeverityCounts(): Record<
  ArchiveDiagnosticReplayEvent["severity"],
  number
> {
  return {
    info: 0,
    warn: 0,
    error: 0
  };
}

function createEmptyArchiveDiagnosticSourceCounts(): Record<ArchiveDiagnosticReplaySource, number> {
  return {
    "archive.status.read": 0,
    "archive.diagnostics.read": 0,
    "archive.cleanup.preview": 0
  };
}

function isValidArchiveDiagnosticReplayEvent(
  event: ArchiveDiagnosticReplayEvent
): event is ArchiveDiagnosticReplayEvent {
  return (
    isNonEmptyString(event.id) &&
    isNonEmptyString(event.projectId) &&
    isNonEmptyString(event.launchId) &&
    isNonEmptyString(event.archiveRef) &&
    isNonEmptyString(event.occurredAt) &&
    isArchiveDiagnosticReplaySource(event.source) &&
    (event.launchState === "closed" || event.launchState === "open") &&
    isArchiveDiagnosticReplayCode(event.code) &&
    (event.severity === "info" || event.severity === "warn" || event.severity === "error") &&
    typeof event.retryable === "boolean"
  );
}

function orderArchiveDiagnosticReplayEvents(
  events: readonly ArchiveDiagnosticReplayEvent[]
): ArchiveDiagnosticReplayEvent[] {
  return [...events].sort((left, right) =>
    [
      left.projectId,
      left.launchId,
      left.archiveRef,
      left.occurredAt,
      left.id,
      left.source,
      left.code
    ]
      .join("\u001f")
      .localeCompare(
        [
          right.projectId,
          right.launchId,
          right.archiveRef,
          right.occurredAt,
          right.id,
          right.source,
          right.code
        ].join("\u001f")
      )
  );
}

function orderArchiveDiagnosticReplayRecords(
  records: readonly ArchiveDiagnosticReplayRecord[]
): ArchiveDiagnosticReplayRecord[] {
  return [...records].sort((left, right) => left.eventRef.localeCompare(right.eventRef));
}

function buildArchiveDiagnosticEventRef(event: ArchiveDiagnosticReplayEvent): string {
  return `archive-diagnostic:${hashIdempotencyParts([
    "archive-diagnostic-event",
    event.projectId,
    event.launchId,
    event.archiveRef,
    event.id,
    event.occurredAt,
    event.source,
    event.code
  ])}`;
}

function normalizeArchiveDiagnosticRef(value: string): string {
  return /^[a-z0-9_.:-]{1,96}$/i.test(value) ? value : `ref:${hashIdempotencyParts([value])}`;
}

function archiveDiagnosticProjectionKey(input: {
  projectId: string;
  launchId: string;
  archiveRef: string;
}): string {
  return [input.projectId, input.launchId, input.archiveRef].join("\u001f");
}

function cloneArchiveDiagnosticReplayRecord(
  record: ArchiveDiagnosticReplayRecord
): ArchiveDiagnosticReplayRecord {
  return {
    ...record
  };
}
