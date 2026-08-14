import {
  replayHistoryComparePermissionAuditEvents,
  type HistoryComparePermissionAuditDecision,
  type HistoryComparePermissionAuditEvent,
  type HistoryComparePermissionAuditRecord,
  type HistoryComparePermissionAuditReplayDiagnostic
} from "@testhistory/domain";

import { hashIdempotencyParts } from "./workerHash.js";
import {
  normalizeOptionalWorkerText,
  normalizeRequiredWorkerText,
  normalizeWorkerIsoTimestamp
} from "./workerNormalize.js";
import { normalizePaginationLimit } from "./workerPagination.js";
import type {
  HistoryComparePermissionAuditMaterializationDiagnostic,
  HistoryComparePermissionAuditMaterializationPlan,
  HistoryComparePermissionAuditMaterializationSummary,
  HistoryComparePermissionAuditSnapshotAdapter,
  HistoryComparePermissionAuditSnapshotRecord
} from "./workerTypes.js";
import { isNonEmptyString } from "./workerValueUtils.js";

export function buildHistoryComparePermissionAuditMaterializationPlan(input: {
  projectId: string;
  testCaseId: string;
  actorId?: string;
  events: readonly HistoryComparePermissionAuditEvent[];
  at: string;
  limit?: number;
}): HistoryComparePermissionAuditMaterializationPlan {
  const projectId = normalizeRequiredWorkerText(input.projectId, "projectId");
  const testCaseId = normalizeRequiredWorkerText(input.testCaseId, "testCaseId");
  const actorId = normalizeOptionalWorkerText(input.actorId);
  const materializedAt = normalizeWorkerIsoTimestamp(input.at);
  const limit = normalizePaginationLimit(input.limit);
  const diagnostics: HistoryComparePermissionAuditMaterializationDiagnostic[] = [];
  const eventById = new Map(input.events.map((event) => [event.id, event]));
  const replayEvents: HistoryComparePermissionAuditEvent[] = [];
  let testCaseScopeIgnoredEventCount = 0;

  for (const event of orderHistoryComparePermissionAuditEventsForWorker(input.events)) {
    if (event.projectId === projectId && event.testCaseId !== testCaseId) {
      testCaseScopeIgnoredEventCount += 1;
      diagnostics.push({
        code: "history_compare_permission.test_case_scope_event_ignored",
        severity: "warn",
        retryable: false,
        eventRef: event.id,
        compareId: event.compareId,
        projectId: event.projectId,
        testCaseId: event.testCaseId,
        actorId: event.actorId,
        expectedProjectId: projectId,
        expectedTestCaseId: testCaseId,
        ...(actorId !== undefined ? { expectedActorId: actorId } : {}),
        message:
          "History compare permission audit event was outside the selected test case materialization scope."
      });
      continue;
    }

    replayEvents.push(event);
  }

  const projection = replayHistoryComparePermissionAuditEvents(replayEvents, {
    projectId,
    ...(actorId !== undefined ? { actorId } : {})
  });
  diagnostics.push(
    ...projection.diagnostics.map((diagnostic) =>
      mapHistoryComparePermissionReplayDiagnosticForWorker(diagnostic, eventById, {
        projectId,
        testCaseId,
        ...(actorId !== undefined ? { actorId } : {})
      })
    )
  );

  const allRecords = orderHistoryComparePermissionAuditSnapshotRecords(
    projection.records
      .filter((record) => record.testCaseId === testCaseId)
      .map((record) => buildHistoryComparePermissionAuditSnapshotRecord(record))
  );
  const records = allRecords.slice(0, limit);
  const summary = buildHistoryComparePermissionAuditMaterializationSummary({
    projectId,
    testCaseId,
    ...(actorId !== undefined ? { actorId } : {}),
    receivedEventCount: input.events.length,
    scopedEventCount: projection.totalEvents,
    records,
    totalScopedRecordCount: allRecords.length,
    omittedRecordCount: Math.max(0, allRecords.length - records.length),
    diagnostics,
    testCaseScopeIgnoredEventCount
  });

  return {
    boundary: "worker-local-history-compare-permission-audit-materialization",
    consistency: "retry-safe-idempotent-selected-case-snapshot",
    scope: "project-test-case-actor",
    readOnly: true,
    rawCompareInputsIncluded: false,
    transitions: [
      { state: "history_compare_permission_audit_events_received", at: materializedAt },
      { state: "history_compare_permission_audit_replayed", at: materializedAt },
      { state: "history_compare_permission_audit_snapshots_materialized", at: materializedAt }
    ],
    records,
    diagnostics: orderHistoryComparePermissionAuditMaterializationDiagnostics(diagnostics),
    summary
  };
}

export function createInMemoryHistoryComparePermissionAuditSnapshotAdapter(
  initialEvents: readonly HistoryComparePermissionAuditEvent[] = []
): HistoryComparePermissionAuditSnapshotAdapter {
  const recordsByScope = new Map<
    string,
    Map<string, HistoryComparePermissionAuditSnapshotRecord>
  >();

  function applyRecords(
    projectId: string,
    testCaseId: string,
    actorId: string | undefined,
    records: readonly HistoryComparePermissionAuditSnapshotRecord[]
  ) {
    const key = historyComparePermissionAuditSnapshotScopeKey({
      projectId,
      testCaseId,
      ...(actorId !== undefined ? { actorId } : {})
    });
    const storedRecords = recordsByScope.get(key) ?? new Map();
    recordsByScope.set(key, storedRecords);
    let upsertedSnapshotCount = 0;
    let updatedSnapshotCount = 0;
    let unchangedSnapshotCount = 0;

    for (const record of records) {
      const current = storedRecords.get(record.compareId);
      if (current === undefined) {
        upsertedSnapshotCount += 1;
        storedRecords.set(
          record.compareId,
          cloneHistoryComparePermissionAuditSnapshotRecord(record)
        );
        continue;
      }

      if (areHistoryComparePermissionAuditSnapshotRecordsEqual(current, record)) {
        unchangedSnapshotCount += 1;
        continue;
      }

      updatedSnapshotCount += 1;
      storedRecords.set(record.compareId, cloneHistoryComparePermissionAuditSnapshotRecord(record));
    }

    return {
      upsertedSnapshotCount,
      updatedSnapshotCount,
      unchangedSnapshotCount,
      totalSnapshotCount: storedRecords.size
    };
  }

  const adapter: HistoryComparePermissionAuditSnapshotAdapter = {
    kind: "in-memory-history-compare-permission-audit-worker-wip",
    applyEvents({ projectId, testCaseId, actorId, events, materializationDigest, at, limit }) {
      const plan = buildHistoryComparePermissionAuditMaterializationPlan({
        projectId,
        testCaseId,
        ...(actorId !== undefined ? { actorId } : {}),
        events,
        at,
        ...(limit !== undefined ? { limit } : {})
      });
      const applyResult = applyRecords(projectId, testCaseId, actorId, plan.records);

      return {
        ...plan.summary,
        adapterKind: "in-memory-history-compare-permission-audit-worker-wip",
        boundary: "worker-local-history-compare-permission-audit-materialization",
        consistency: "retry-safe-idempotent-selected-case-snapshot",
        appliedAt: at,
        idempotencyKeyHash: hashIdempotencyParts([
          "history_compare.permission_audit.snapshot.apply",
          materializationDigest,
          plan.summary.materializationDigest,
          ...plan.records.map((record) => record.snapshotRef)
        ]),
        upsertedSnapshotCount: applyResult.upsertedSnapshotCount,
        updatedSnapshotCount: applyResult.updatedSnapshotCount,
        unchangedSnapshotCount: applyResult.unchangedSnapshotCount,
        totalSnapshotCount: applyResult.totalSnapshotCount
      };
    },
    getProjection(input) {
      const projectId = normalizeRequiredWorkerText(input.projectId, "projectId");
      const testCaseId = normalizeRequiredWorkerText(input.testCaseId, "testCaseId");
      const actorId = normalizeOptionalWorkerText(input.actorId);
      const key = historyComparePermissionAuditSnapshotScopeKey({
        projectId,
        testCaseId,
        ...(actorId !== undefined ? { actorId } : {})
      });
      const records = orderHistoryComparePermissionAuditSnapshotRecords([
        ...(recordsByScope.get(key)?.values() ?? [])
      ]).map(cloneHistoryComparePermissionAuditSnapshotRecord);

      return {
        projectId,
        testCaseId,
        ...(actorId !== undefined ? { actorId } : {}),
        records,
        summary: buildHistoryComparePermissionAuditMaterializationSummary({
          projectId,
          testCaseId,
          ...(actorId !== undefined ? { actorId } : {}),
          receivedEventCount: 0,
          scopedEventCount: records.reduce((total, record) => total + record.eventCount, 0),
          records,
          totalScopedRecordCount: records.length,
          omittedRecordCount: 0,
          diagnostics: [],
          testCaseScopeIgnoredEventCount: 0
        })
      };
    },
    snapshot() {
      return [...recordsByScope.keys()]
        .map((key) => {
          const [projectId, testCaseId, actorId] = key.split("\u001f");
          return adapter.getProjection({
            projectId: projectId ?? "",
            testCaseId: testCaseId ?? "",
            ...(actorId !== undefined && actorId !== "" ? { actorId } : {})
          });
        })
        .sort((left, right) =>
          [left.projectId, left.testCaseId, left.actorId ?? ""]
            .join("\u001f")
            .localeCompare([right.projectId, right.testCaseId, right.actorId ?? ""].join("\u001f"))
        );
    }
  };

  if (initialEvents.length > 0) {
    const scopeKeys = new Set(
      initialEvents.map((event) =>
        historyComparePermissionAuditSnapshotScopeKey({
          projectId: event.projectId,
          testCaseId: event.testCaseId,
          actorId: event.actorId
        })
      )
    );
    for (const key of scopeKeys) {
      const [projectId, testCaseId, actorId] = key.split("\u001f");
      adapter.applyEvents({
        projectId: projectId ?? "",
        testCaseId: testCaseId ?? "",
        ...(actorId !== undefined && actorId !== "" ? { actorId } : {}),
        events: initialEvents,
        materializationDigest: "initial",
        at: initialEvents[0]?.occurredAt ?? new Date().toISOString()
      });
    }
  }

  return adapter;
}

function buildHistoryComparePermissionAuditSnapshotRecord(
  record: HistoryComparePermissionAuditRecord
): HistoryComparePermissionAuditSnapshotRecord {
  const reasonCodes = uniqueSortedForWorker(record.reasons.map((reason) => reason.code));
  const reasonSeverities = uniqueSortedForWorker(record.reasons.map((reason) => reason.severity));
  const unavailableFields = uniqueSortedForWorker(record.unavailable);
  const rawHistory: HistoryComparePermissionAuditSnapshotRecord["rawHistory"] = {
    included: false,
    preserved: true,
    itemCount: record.rawHistory.itemCount ?? 0
  };
  if (record.rawHistory.digest !== undefined) {
    rawHistory.digest = record.rawHistory.digest;
  }

  return {
    snapshotRef: `history-compare-permission-audit-snapshot:${hashIdempotencyParts([
      record.projectId,
      record.testCaseId,
      record.actorId,
      record.compareId,
      record.decision,
      record.firstOccurredAt,
      record.lastOccurredAt,
      String(record.events.length)
    ])}`,
    projectId: record.projectId,
    testCaseId: record.testCaseId,
    actorId: record.actorId,
    compareId: record.compareId,
    decision: record.decision,
    reasonCodes,
    reasonSeverities,
    unavailableFields,
    rawHistory,
    eventCount: record.events.length,
    firstOccurredAt: record.firstOccurredAt,
    lastOccurredAt: record.lastOccurredAt
  };
}

function mapHistoryComparePermissionReplayDiagnosticForWorker(
  diagnostic: HistoryComparePermissionAuditReplayDiagnostic,
  eventById: ReadonlyMap<string, HistoryComparePermissionAuditEvent>,
  expected: { projectId: string; testCaseId: string; actorId?: string }
): HistoryComparePermissionAuditMaterializationDiagnostic {
  const event = eventById.get(diagnostic.eventId);
  const mapped: HistoryComparePermissionAuditMaterializationDiagnostic = {
    code: diagnostic.code,
    severity:
      diagnostic.code === "history_compare_permission.duplicate_event_ignored" ? "info" : "warn",
    retryable: false,
    eventRef: diagnostic.eventId,
    compareId: diagnostic.compareId,
    projectId: diagnostic.projectId,
    testCaseId: event?.testCaseId ?? expected.testCaseId,
    actorId: diagnostic.actorId,
    message: diagnostic.message
  };

  if (diagnostic.expectedProjectId !== undefined) {
    mapped.expectedProjectId = diagnostic.expectedProjectId;
  }
  if (diagnostic.expectedActorId !== undefined) {
    mapped.expectedActorId = diagnostic.expectedActorId;
  }
  if (diagnostic.code !== "history_compare_permission.cross_project_event_ignored") {
    mapped.expectedProjectId = expected.projectId;
  }
  if (expected.actorId !== undefined) {
    mapped.expectedActorId = expected.actorId;
  }

  return mapped;
}

function buildHistoryComparePermissionAuditMaterializationSummary(input: {
  projectId: string;
  testCaseId: string;
  actorId?: string;
  receivedEventCount: number;
  scopedEventCount: number;
  records: readonly HistoryComparePermissionAuditSnapshotRecord[];
  totalScopedRecordCount: number;
  omittedRecordCount: number;
  diagnostics: readonly HistoryComparePermissionAuditMaterializationDiagnostic[];
  testCaseScopeIgnoredEventCount: number;
}): HistoryComparePermissionAuditMaterializationSummary {
  const byDecision = createEmptyHistoryComparePermissionDecisionCounts();
  const rawHistoryDigests = new Set<string>();
  let rawHistoryItemCount = 0;

  for (const record of input.records) {
    byDecision[record.decision] += 1;
    rawHistoryItemCount += record.rawHistory.itemCount;
    if (record.rawHistory.digest !== undefined) {
      rawHistoryDigests.add(record.rawHistory.digest);
    }
  }

  return {
    projectId: input.projectId,
    testCaseId: input.testCaseId,
    ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
    receivedEventCount: input.receivedEventCount,
    scopedEventCount: input.scopedEventCount,
    materializedRecordCount: input.records.length,
    totalScopedRecordCount: input.totalScopedRecordCount,
    omittedRecordCount: input.omittedRecordCount,
    duplicateEventCount: input.diagnostics.filter(
      (diagnostic) => diagnostic.code === "history_compare_permission.duplicate_event_ignored"
    ).length,
    actorScopeIgnoredEventCount: input.diagnostics.filter(
      (diagnostic) => diagnostic.code === "history_compare_permission.actor_scope_event_ignored"
    ).length,
    crossProjectIgnoredEventCount: input.diagnostics.filter(
      (diagnostic) => diagnostic.code === "history_compare_permission.cross_project_event_ignored"
    ).length,
    testCaseScopeIgnoredEventCount: input.testCaseScopeIgnoredEventCount,
    byDecision,
    rawHistory: {
      included: false,
      preserved: true,
      digestCount: rawHistoryDigests.size,
      itemCount: rawHistoryItemCount
    },
    materializationDigest: buildHistoryComparePermissionAuditMaterializationDigest(input.records),
    selectedCaseHistoryCompareCompatible: true,
    mutationBoundary: "worker-materialization-only-no-rest-or-mcp-or-ui-claims",
    plannedOperations: [
      "history_compare.permission_audit.replay",
      "history_compare.permission_audit.materialize"
    ]
  };
}

function buildHistoryComparePermissionAuditMaterializationDigest(
  records: readonly HistoryComparePermissionAuditSnapshotRecord[]
): string {
  return hashIdempotencyParts([
    "history-compare-permission-audit-materialization",
    ...orderHistoryComparePermissionAuditSnapshotRecords(records).map((record) =>
      [
        record.snapshotRef,
        record.projectId,
        record.testCaseId,
        record.actorId,
        record.compareId,
        record.decision,
        record.eventCount,
        record.firstOccurredAt,
        record.lastOccurredAt,
        ...record.reasonCodes,
        ...record.unavailableFields
      ].join("\u001e")
    )
  ]);
}

function historyComparePermissionAuditSnapshotScopeKey(input: {
  projectId: string;
  testCaseId: string;
  actorId?: string;
}): string {
  return [input.projectId, input.testCaseId, input.actorId ?? ""].join("\u001f");
}

function createEmptyHistoryComparePermissionDecisionCounts(): Record<
  HistoryComparePermissionAuditDecision,
  number
> {
  return {
    denied: 0,
    partial: 0,
    ready: 0
  };
}

function orderHistoryComparePermissionAuditEventsForWorker(
  events: readonly HistoryComparePermissionAuditEvent[]
): HistoryComparePermissionAuditEvent[] {
  return [...events].sort((left, right) => {
    const occurredAt = left.occurredAt.localeCompare(right.occurredAt);
    if (occurredAt !== 0) {
      return occurredAt;
    }

    return left.id.localeCompare(right.id);
  });
}

function orderHistoryComparePermissionAuditSnapshotRecords(
  records: readonly HistoryComparePermissionAuditSnapshotRecord[]
): HistoryComparePermissionAuditSnapshotRecord[] {
  return [...records].sort((left, right) => {
    const project = left.projectId.localeCompare(right.projectId);
    if (project !== 0) {
      return project;
    }

    const testCase = left.testCaseId.localeCompare(right.testCaseId);
    if (testCase !== 0) {
      return testCase;
    }

    const lastOccurredAt = left.lastOccurredAt.localeCompare(right.lastOccurredAt);
    if (lastOccurredAt !== 0) {
      return lastOccurredAt;
    }

    return left.compareId.localeCompare(right.compareId);
  });
}

function orderHistoryComparePermissionAuditMaterializationDiagnostics(
  diagnostics: readonly HistoryComparePermissionAuditMaterializationDiagnostic[]
): HistoryComparePermissionAuditMaterializationDiagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const code = left.code.localeCompare(right.code);
    if (code !== 0) {
      return code;
    }

    return left.eventRef.localeCompare(right.eventRef);
  });
}

function cloneHistoryComparePermissionAuditSnapshotRecord(
  record: HistoryComparePermissionAuditSnapshotRecord
): HistoryComparePermissionAuditSnapshotRecord {
  const rawHistory: HistoryComparePermissionAuditSnapshotRecord["rawHistory"] = {
    included: false,
    preserved: true,
    itemCount: record.rawHistory.itemCount
  };
  if (record.rawHistory.digest !== undefined) {
    rawHistory.digest = record.rawHistory.digest;
  }

  return {
    ...record,
    reasonCodes: [...record.reasonCodes],
    reasonSeverities: [...record.reasonSeverities],
    unavailableFields: [...record.unavailableFields],
    rawHistory
  };
}

function areHistoryComparePermissionAuditSnapshotRecordsEqual(
  left: HistoryComparePermissionAuditSnapshotRecord,
  right: HistoryComparePermissionAuditSnapshotRecord
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function uniqueSortedForWorker(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => isNonEmptyString(value)))].sort();
}
