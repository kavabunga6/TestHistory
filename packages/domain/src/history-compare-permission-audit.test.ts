import { describe, expect, it } from "vitest";
import {
  appendHistoryComparePermissionAuditEvent,
  buildHistoryComparePermissionAuditReplayInvariantEvidence,
  createHistoryComparePermissionAuditEvent,
  replayHistoryComparePermissionAuditEvents,
  type CreateHistoryComparePermissionAuditEventInput,
  type HistoryComparePermissionAuditEvent
} from "./index.js";

describe("history compare permission audit", () => {
  it("replays deterministic actor-scoped compare decisions by project", () => {
    const ready = event({
      actorId: "actor-a",
      compareId: "compare-ready",
      testCaseId: "case-checkout",
      baseResultUuid: "result-1",
      targetResultUuid: "result-2",
      occurredAt: "2026-05-20T10:00:00Z",
      decision: "ready",
      reasons: [
        {
          code: "history_compare_permission.ready",
          severity: "info",
          explanation: "Compare fields are available for this actor and project.",
          fields: []
        }
      ],
      rawHistory: [{ uuid: "result-1" }, { uuid: "result-2" }]
    });
    const partial = event({
      actorId: "actor-a",
      compareId: "compare-partial",
      testCaseId: "case-checkout",
      baseResultUuid: "result-2",
      targetResultUuid: "result-3",
      occurredAt: "2026-05-20T10:01:00Z",
      decision: "partial",
      reasons: [
        {
          code: "history_compare_permission.field_hidden",
          severity: "warn",
          explanation: "Some compare enrichment fields are hidden by actor scope.",
          fields: ["labels.securityTier", "defect.signature"]
        }
      ],
      unavailable: ["defect.signature", "labels.securityTier"],
      rawHistory: [{ uuid: "result-2" }, { uuid: "result-3" }]
    });
    const denied = event({
      actorId: "actor-b",
      compareId: "compare-denied",
      testCaseId: "case-checkout",
      baseResultUuid: "result-2",
      targetResultUuid: "result-4",
      occurredAt: "2026-05-20T10:02:00Z",
      decision: "denied",
      reasons: [
        {
          code: "history_compare_permission.project_scope_denied",
          severity: "deny",
          explanation: "Actor is outside the project compare scope.",
          fields: ["projectId"]
        }
      ]
    });

    const first = replayHistoryComparePermissionAuditEvents([denied, partial, ready], {
      projectId: "project-history"
    });
    const second = replayHistoryComparePermissionAuditEvents([partial, ready, denied], {
      projectId: "project-history"
    });
    const withDuplicate = replayHistoryComparePermissionAuditEvents(
      [denied, partial, ready, partial],
      {
        projectId: "project-history"
      }
    );
    const actorScoped = replayHistoryComparePermissionAuditEvents([denied, partial, ready], {
      projectId: "project-history",
      actorId: "actor-a"
    });

    expect(first).toEqual(second);
    expect(first.byDecision).toEqual({ denied: 1, partial: 1, ready: 1 });
    expect(first.actorIds).toEqual(["actor-a", "actor-b"]);
    expect(first.compareIds).toEqual(["compare-denied", "compare-partial", "compare-ready"]);
    expect(first.diagnostics).toEqual([]);
    expect(withDuplicate).toMatchObject({
      byDecision: first.byDecision,
      actorIds: first.actorIds,
      compareIds: first.compareIds,
      events: first.events,
      records: first.records
    });
    expect(withDuplicate.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "history_compare_permission.duplicate_event_ignored"
    ]);
    expect(actorScoped.actorIds).toEqual(["actor-a"]);
    expect(actorScoped.compareIds).toEqual(["compare-partial", "compare-ready"]);
    expect(actorScoped.byDecision).toEqual({ denied: 0, partial: 1, ready: 1 });
    expect(actorScoped.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "history_compare_permission.actor_scope_event_ignored"
    ]);
  });

  it("redacts permission reasons and never stores raw history payloads", () => {
    const rawHistory = [
      {
        uuid: "result-sensitive",
        raw: {
          statusDetails: {
            message: "Bearer raw-token failed from C:\\synthetic\\redacted\\secret-report.json"
          },
          artifact: {
            storageKey: "s3://private-bucket/history/raw.json",
            signedUrl: "https://storage.example.test/private/raw.json?X-Amz-Signature=raw-signature"
          }
        }
      }
    ];
    const original = JSON.stringify(rawHistory);

    const auditEvent = event({
      actorId: "actor token=raw-actor-token",
      compareId: "compare-redacted",
      testCaseId: "case password=raw-case-secret",
      baseResultUuid: "result-sensitive",
      targetResultUuid: "result-target",
      occurredAt: "2026-05-21T10:00:00Z",
      decision: "denied",
      reasons: [
        {
          code: "history_compare_permission.denied",
          severity: "deny",
          explanation:
            "Denied Bearer raw-reason-token at C:\\synthetic\\redacted\\history.json signedUrl=https://storage.example.test/private/raw.json?X-Amz-Signature=raw-signature s3://private-bucket/history/raw.json",
          fields: ["signedUrl", "storageKey", "statusDetails.trace"]
        }
      ],
      rawHistory
    });
    const projection = replayHistoryComparePermissionAuditEvents([auditEvent], {
      projectId: "project-history"
    });
    const serialized = JSON.stringify({ auditEvent, projection });

    expect(JSON.stringify(rawHistory)).toBe(original);
    expect(auditEvent.rawHistory).toEqual({
      included: false,
      preserved: true,
      digest: expect.any(String),
      itemCount: 1
    });
    expect(projection.rawHistory.included).toBe(false);
    expect(projection.rawHistory.preserved).toBe(true);
    expect(serialized).not.toContain("raw-token");
    expect(serialized).not.toContain("raw-actor-token");
    expect(serialized).not.toContain("raw-case-secret");
    expect(serialized).not.toContain("C:\\synthetic\\redacted");
    expect(serialized).not.toContain("secret-report.json");
    expect(serialized).not.toContain("s3://");
    expect(serialized).not.toContain("private-bucket");
    expect(serialized).not.toContain("raw-signature");
    expect(serialized).not.toContain("storage.example.test");
    expect(serialized).not.toContain("statusDetails");
    expect(serialized).not.toContain('"raw"');
    expect(auditEvent.reasons[0]?.fields).toEqual(["[redacted-field]"]);
  });

  it("preserves raw history inputs while recording only a stable digest", () => {
    const rawHistory = [
      {
        uuid: "result-a",
        nested: {
          labels: { component: ["checkout"] },
          statusDetails: { message: "visible failure text" }
        }
      }
    ];
    const before = JSON.stringify(rawHistory);

    const first = event({
      compareId: "compare-raw-history",
      baseResultUuid: "result-a",
      targetResultUuid: "result-b",
      occurredAt: "2026-05-22T10:00:00Z",
      decision: "partial",
      reasons: [
        {
          code: "history_compare_permission.field_hidden",
          severity: "warn",
          explanation: "One enrichment field is unavailable for this actor.",
          fields: ["labels.securityTier"]
        }
      ],
      unavailable: ["labels.securityTier"],
      rawHistory
    });
    const second = event({
      compareId: "compare-raw-history-copy",
      baseResultUuid: "result-a",
      targetResultUuid: "result-b",
      occurredAt: "2026-05-22T10:01:00Z",
      decision: "partial",
      reasons: [
        {
          code: "history_compare_permission.field_hidden",
          severity: "warn",
          explanation: "One enrichment field is unavailable for this actor.",
          fields: ["labels.securityTier"]
        }
      ],
      unavailable: ["labels.securityTier"],
      rawHistory: [
        {
          nested: {
            statusDetails: { message: "visible failure text" },
            labels: { component: ["checkout"] }
          },
          uuid: "result-a"
        }
      ]
    });

    expect(JSON.stringify(rawHistory)).toBe(before);
    expect(first.rawHistory.digest).toBe(second.rawHistory.digest);
    expect(first.rawHistory.included).toBe(false);
    expect(JSON.stringify(first)).not.toContain("visible failure text");
  });

  it("handles cross-project events and rejects illegal decision states", () => {
    const projectA = event({
      projectId: "project-a",
      compareId: "compare-a",
      baseResultUuid: "result-a1",
      targetResultUuid: "result-a2",
      occurredAt: "2026-05-23T10:00:00Z",
      decision: "ready",
      reasons: [
        {
          code: "history_compare_permission.ready",
          severity: "info",
          explanation: "Compare fields are available for this actor and project.",
          fields: []
        }
      ]
    });
    const projectB = event({
      projectId: "project-b",
      compareId: "compare-b",
      baseResultUuid: "result-b1",
      targetResultUuid: "result-b2",
      occurredAt: "2026-05-23T10:01:00Z",
      decision: "ready",
      reasons: [
        {
          code: "history_compare_permission.ready",
          severity: "info",
          explanation: "Compare fields are available for this actor and project.",
          fields: []
        }
      ]
    });

    const projection = replayHistoryComparePermissionAuditEvents([projectB, projectA], {
      projectId: "project-a"
    });

    expect(projection.compareIds).toEqual(["compare-a"]);
    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "history_compare_permission.cross_project_event_ignored"
    ]);
    expect(() =>
      replayHistoryComparePermissionAuditEvents([projectB, projectA], {
        projectId: "project-a",
        crossProject: "reject"
      })
    ).toThrow("belongs to project project-b, not project-a");
    expect(() =>
      event({
        compareId: "compare-illegal-ready",
        baseResultUuid: "result-1",
        targetResultUuid: "result-2",
        occurredAt: "2026-05-23T10:02:00Z",
        decision: "ready",
        unavailable: ["labels.securityTier"],
        reasons: [
          {
            code: "history_compare_permission.field_hidden",
            severity: "warn",
            explanation: "One enrichment field is unavailable for this actor.",
            fields: ["labels.securityTier"]
          }
        ]
      })
    ).toThrow("ready audit events cannot hide fields or deny");
    expect(() =>
      event({
        compareId: "compare-illegal-denied",
        baseResultUuid: "result-1",
        targetResultUuid: "result-2",
        occurredAt: "2026-05-23T10:03:00Z",
        decision: "denied",
        reasons: []
      })
    ).toThrow("denied audit events require a deny reason");
    expect(() =>
      event({
        compareId: "compare-surface-claim",
        baseResultUuid: "result-1",
        targetResultUuid: "result-2",
        occurredAt: "2026-05-23T10:04:00Z",
        decision: "ready",
        reasons: [
          {
            code: "history_compare_permission.ready",
            severity: "info",
            explanation: "REST response shape is unchanged.",
            fields: []
          }
        ]
      })
    ).toThrow("must not claim REST, MCP, OpenAPI");
  });

  it("keeps append-only event ids immutable", () => {
    const auditEvent = event({
      compareId: "compare-append",
      baseResultUuid: "result-1",
      targetResultUuid: "result-2",
      occurredAt: "2026-05-24T10:00:00Z",
      decision: "ready",
      reasons: [
        {
          code: "history_compare_permission.ready",
          severity: "info",
          explanation: "Compare fields are available for this actor and project.",
          fields: []
        }
      ]
    });
    const appended = appendHistoryComparePermissionAuditEvent([], auditEvent);
    const duplicate = appendHistoryComparePermissionAuditEvent(appended, auditEvent);
    const replaced = {
      ...auditEvent,
      decision: "denied" as const,
      reasons: [
        {
          code: "history_compare_permission.project_scope_denied",
          severity: "deny" as const,
          explanation: "Actor is outside the project compare scope.",
          fields: ["projectId"]
        }
      ]
    };

    expect(duplicate).toEqual(appended);
    expect(() => appendHistoryComparePermissionAuditEvent(appended, replaced)).toThrow(
      "append-only and cannot be replaced"
    );
  });

  it("builds replay invariant evidence without raw compare input or cross-actor leakage", () => {
    const ready = event({
      actorId: "actor-a",
      compareId: "compare-invariant-ready",
      baseResultUuid: "result-ready-1",
      targetResultUuid: "result-ready-2",
      occurredAt: "2026-05-25T10:00:00Z",
      decision: "ready",
      reasons: [
        {
          code: "history_compare_permission.ready",
          severity: "info",
          explanation: "Compare fields are available for this actor and project.",
          fields: []
        }
      ],
      rawHistory: [
        {
          uuid: "result-ready-1",
          payload: "raw-compare-payload-marker",
          signedUrl: "https://example.invalid/synthetic?token=raw-compare-url-marker"
        }
      ]
    });
    const otherActor = event({
      actorId: "actor-b",
      compareId: "compare-invariant-other-actor",
      baseResultUuid: "result-other-1",
      targetResultUuid: "result-other-2",
      occurredAt: "2026-05-25T10:01:00Z",
      decision: "denied",
      reasons: [
        {
          code: "history_compare_permission.project_scope_denied",
          severity: "deny",
          explanation: "Actor is outside the project compare scope.",
          fields: ["projectId"]
        }
      ],
      rawHistory: [{ uuid: "result-other-1", payload: "raw-other-actor-payload-marker" }]
    });
    const otherProject = event({
      projectId: "project-other",
      actorId: "actor-a",
      compareId: "compare-invariant-other-project",
      baseResultUuid: "result-project-1",
      targetResultUuid: "result-project-2",
      occurredAt: "2026-05-25T10:02:00Z",
      decision: "ready",
      reasons: [
        {
          code: "history_compare_permission.ready",
          severity: "info",
          explanation: "Compare fields are available for this actor and project.",
          fields: []
        }
      ],
      rawHistory: [{ uuid: "result-project-1", payload: "raw-other-project-payload-marker" }]
    });

    const evidence = buildHistoryComparePermissionAuditReplayInvariantEvidence(
      [otherProject, otherActor, ready, ready],
      {
        projectId: "project-history",
        actorId: "actor-a",
        unsafeMarkers: [
          "raw-compare-payload-marker",
          "raw-compare-url-marker",
          "raw-other-actor-payload-marker",
          "raw-other-project-payload-marker"
        ]
      }
    );
    const serializedEvidence = JSON.stringify(evidence);

    expect(evidence.deterministic).toBe(true);
    expect(evidence.recomputable).toBe(true);
    expect(evidence.projectScoped).toBe(true);
    expect(evidence.actorScoped).toEqual({
      requested: true,
      passed: true,
      actorId: "actor-a",
      leakedActorIds: []
    });
    expect(evidence.appendOnly).toEqual({
      uniqueProjectedEventIds: true,
      duplicateEventIds: [],
      projectedEventIds: [ready.id]
    });
    expect(evidence.rawCompareInputs).toEqual({
      included: false,
      preserved: true,
      digestCount: 1,
      itemCount: 1
    });
    expect(evidence.redaction).toEqual({ passed: true, leakedMarkers: [] });
    expect(evidence.projectionDigest).toBe(evidence.recomputedDigest);
    expect(serializedEvidence).not.toContain("actor-b");
    expect(serializedEvidence).not.toContain("project-other");
    expect(serializedEvidence).not.toContain("raw-compare-payload-marker");
    expect(serializedEvidence).not.toContain("raw-compare-url-marker");
    expect(serializedEvidence).not.toContain("raw-other-actor-payload-marker");
    expect(serializedEvidence).not.toContain("raw-other-project-payload-marker");
  });

  it("persists invariant snapshots as deterministic append-only actor and test-case scoped evidence", () => {
    const ready = event({
      actorId: "actor-persistence",
      testCaseId: "case-persistence",
      compareId: "compare-persistence-ready",
      baseResultUuid: "result-persistence-1",
      targetResultUuid: "result-persistence-2",
      occurredAt: "2026-05-26T10:00:00Z",
      decision: "ready",
      reasons: [
        {
          code: "history_compare_permission.ready",
          severity: "info",
          explanation: "Compare fields are available for this actor and project.",
          fields: []
        }
      ],
      rawHistory: [
        {
          uuid: "result-persistence-1",
          statusDetails: {
            message: "Synthetic raw compare marker raw-persistence-ready-payload"
          },
          artifact: {
            path: "C:\\synthetic\\history-compare\\ready-payload.json",
            storageKey: "s3://synthetic-history-compare/raw-ready.json",
            signedUrl:
              "https://example.invalid/synthetic-history-compare/raw-ready.json?token=raw-persistence-ready-url"
          }
        }
      ]
    });
    const partial = event({
      actorId: "actor-persistence",
      testCaseId: "case-persistence",
      compareId: "compare-persistence-partial",
      baseResultUuid: "result-persistence-2",
      targetResultUuid: "result-persistence-3",
      occurredAt: "2026-05-26T10:01:00Z",
      decision: "partial",
      reasons: [
        {
          code: "history_compare_permission.field_hidden",
          severity: "warn",
          explanation:
            "Some compare enrichment is unavailable; Bearer raw-persistence-partial-reason stays outside persisted snapshots.",
          fields: ["labels.securityTier", "statusDetails.message", "signedUrl"]
        }
      ],
      unavailable: ["labels.securityTier", "statusDetails.message", "signedUrl"],
      rawHistory: [
        {
          uuid: "result-persistence-2",
          payload: "raw-persistence-partial-payload",
          attachment: "synthetic://history-compare/raw-partial.xml"
        }
      ]
    });
    const otherActor = event({
      actorId: "actor-persistence-shadow",
      testCaseId: "case-persistence",
      compareId: "compare-persistence-shadow-actor",
      baseResultUuid: "result-shadow-1",
      targetResultUuid: "result-shadow-2",
      occurredAt: "2026-05-26T10:02:00Z",
      decision: "denied",
      reasons: [
        {
          code: "history_compare_permission.project_scope_denied",
          severity: "deny",
          explanation: "Actor is outside the project compare scope.",
          fields: ["projectId"]
        }
      ],
      rawHistory: [{ uuid: "result-shadow-1", payload: "raw-persistence-shadow-actor-payload" }]
    });
    const otherProject = event({
      projectId: "project-persistence-shadow",
      actorId: "actor-persistence",
      testCaseId: "case-persistence",
      compareId: "compare-persistence-shadow-project",
      baseResultUuid: "result-project-1",
      targetResultUuid: "result-project-2",
      occurredAt: "2026-05-26T10:03:00Z",
      decision: "ready",
      reasons: [
        {
          code: "history_compare_permission.ready",
          severity: "info",
          explanation: "Compare fields are available for this actor and project.",
          fields: []
        }
      ],
      rawHistory: [{ uuid: "result-project-1", payload: "raw-persistence-shadow-project-payload" }]
    });
    const otherTestCase = event({
      actorId: "actor-persistence",
      testCaseId: "case-persistence-shadow",
      compareId: "compare-persistence-shadow-case",
      baseResultUuid: "result-case-1",
      targetResultUuid: "result-case-2",
      occurredAt: "2026-05-26T10:04:00Z",
      decision: "ready",
      reasons: [
        {
          code: "history_compare_permission.ready",
          severity: "info",
          explanation: "Compare fields are available for this actor and project.",
          fields: []
        }
      ],
      rawHistory: [{ uuid: "result-case-1", payload: "raw-persistence-shadow-case-payload" }]
    });
    const persisted = [otherProject, partial, otherActor, ready, otherTestCase, partial, ready];
    const shuffled = [ready, otherTestCase, partial, otherActor, partial, otherProject, ready];
    const unsafeMarkers = [
      "raw-persistence-ready-payload",
      "raw-persistence-ready-url",
      "raw-persistence-partial-reason",
      "raw-persistence-partial-payload",
      "raw-persistence-shadow-actor-payload",
      "raw-persistence-shadow-project-payload",
      "raw-persistence-shadow-case-payload",
      "C:\\synthetic\\history-compare",
      "s3://synthetic-history-compare",
      "synthetic://history-compare"
    ];
    const rawInputMarkers = [
      ...unsafeMarkers,
      "result-persistence-1",
      "result-persistence-2",
      "result-persistence-3",
      "result-shadow-1",
      "result-shadow-2",
      "result-project-1",
      "result-project-2",
      "result-case-1",
      "result-case-2"
    ];

    const snapshot = historyComparePermissionInvariantSnapshot(persisted, {
      projectId: "project-history",
      actorId: "actor-persistence",
      testCaseId: "case-persistence",
      unsafeMarkers
    });
    const shuffledSnapshot = historyComparePermissionInvariantSnapshot(shuffled, {
      projectId: "project-history",
      actorId: "actor-persistence",
      testCaseId: "case-persistence",
      unsafeMarkers
    });
    const persistedEvents = JSON.parse(
      JSON.stringify(persisted)
    ) as HistoryComparePermissionAuditEvent[];
    const persistedEventReplaySnapshot = historyComparePermissionInvariantSnapshot(
      persistedEvents,
      {
        projectId: "project-history",
        actorId: "actor-persistence",
        testCaseId: "case-persistence",
        unsafeMarkers
      }
    );
    const persistedSnapshot = JSON.parse(JSON.stringify(snapshot)) as ReturnType<
      typeof historyComparePermissionInvariantSnapshot
    >;
    const serializedSnapshot = JSON.stringify(snapshot);
    const serializedPersistedSnapshot = JSON.stringify(persistedSnapshot);

    expect(snapshot).toEqual(shuffledSnapshot);
    expect(persistedSnapshot).toEqual(snapshot);
    expect(persistedEventReplaySnapshot).toEqual(persistedSnapshot);
    expect(snapshot.evidence.deterministic).toBe(true);
    expect(snapshot.evidence.recomputable).toBe(true);
    expect(snapshot.evidence.projectScoped).toBe(true);
    expect(snapshot.evidence.actorScoped).toEqual({
      requested: true,
      passed: true,
      actorId: "actor-persistence",
      leakedActorIds: []
    });
    expect(snapshot.evidence.appendOnly).toEqual({
      uniqueProjectedEventIds: true,
      duplicateEventIds: [],
      projectedEventIds: [ready.id, partial.id]
    });
    expect(snapshot.evidence.rawCompareInputs).toEqual({
      included: false,
      preserved: true,
      digestCount: 2,
      itemCount: 2
    });
    expect(snapshot.evidence.redaction).toEqual({ passed: true, leakedMarkers: [] });
    expect(snapshot.projectIds).toEqual(["project-history"]);
    expect(snapshot.actorIds).toEqual(["actor-persistence"]);
    expect(snapshot.testCaseIds).toEqual(["case-persistence"]);
    expect(snapshot.compareIds).toEqual([
      "compare-persistence-partial",
      "compare-persistence-ready"
    ]);
    expect(snapshot.byDecision).toEqual({ denied: 0, partial: 1, ready: 1 });
    expect(snapshot.rawHistory).toEqual({
      included: false,
      preserved: true,
      digestCount: 2,
      itemCount: 2
    });
    expect(serializedSnapshot).not.toContain("actor-persistence-shadow");
    expect(serializedSnapshot).not.toContain("project-persistence-shadow");
    expect(serializedSnapshot).not.toContain("case-persistence-shadow");
    for (const marker of rawInputMarkers) {
      expect(serializedSnapshot).not.toContain(marker);
      expect(serializedPersistedSnapshot).not.toContain(marker);
    }
  });

  it("replays persisted invariant summaries across cursor pages without scope or raw payload leakage", async () => {
    const projectId = "project-history";
    const actorId = "actor-page";
    const testCaseId = "case-page";
    const ready = event({
      projectId,
      actorId,
      testCaseId,
      compareId: "compare-page-ready",
      baseResultUuid: "result-page-1",
      targetResultUuid: "result-page-2",
      occurredAt: "2026-05-27T10:00:00Z",
      decision: "ready",
      reasons: [
        {
          code: "history_compare_permission.ready",
          severity: "info",
          explanation: "Compare fields are available for this actor and project.",
          fields: []
        }
      ],
      rawHistory: [
        {
          uuid: "result-page-1",
          payload: "UNSAFE_COMPARE_PAYLOAD_PAGE_READY",
          nested: { details: "UNSAFE_COMPARE_TRACE_PAGE_READY" }
        }
      ]
    });
    const partial = event({
      projectId,
      actorId,
      testCaseId,
      compareId: "compare-page-partial",
      baseResultUuid: "result-page-2",
      targetResultUuid: "result-page-3",
      occurredAt: "2026-05-27T10:01:00Z",
      decision: "partial",
      reasons: [
        {
          code: "history_compare_permission.field_hidden",
          severity: "warn",
          explanation: "One persisted enrichment field is unavailable for this actor.",
          fields: ["labels.securityTier"]
        }
      ],
      unavailable: ["labels.securityTier"],
      rawHistory: [
        {
          uuid: "result-page-2",
          payload: "UNSAFE_COMPARE_PAYLOAD_PAGE_PARTIAL"
        }
      ]
    });
    const denied = event({
      projectId,
      actorId,
      testCaseId,
      compareId: "compare-page-denied",
      baseResultUuid: "result-page-3",
      targetResultUuid: "result-page-4",
      occurredAt: "2026-05-27T10:02:00Z",
      decision: "denied",
      reasons: [
        {
          code: "history_compare_permission.case_scope_denied",
          severity: "deny",
          explanation: "Actor cannot compare this persisted test case history.",
          fields: ["testCaseId"]
        }
      ],
      rawHistory: [
        {
          uuid: "result-page-3",
          payload: "UNSAFE_COMPARE_PAYLOAD_PAGE_DENIED"
        }
      ]
    });
    const otherActor = event({
      projectId,
      actorId: "actor-page-shadow",
      testCaseId,
      compareId: "compare-page-shadow-actor",
      baseResultUuid: "result-page-shadow-1",
      targetResultUuid: "result-page-shadow-2",
      occurredAt: "2026-05-27T10:03:00Z",
      decision: "ready",
      reasons: [
        {
          code: "history_compare_permission.ready",
          severity: "info",
          explanation: "Compare fields are available for this actor and project.",
          fields: []
        }
      ],
      rawHistory: [{ uuid: "result-page-shadow-1", payload: "UNSAFE_COMPARE_SHADOW_ACTOR" }]
    });
    const otherProject = event({
      projectId: "project-history-shadow",
      actorId,
      testCaseId,
      compareId: "compare-page-shadow-project",
      baseResultUuid: "result-page-project-1",
      targetResultUuid: "result-page-project-2",
      occurredAt: "2026-05-27T10:04:00Z",
      decision: "ready",
      reasons: [
        {
          code: "history_compare_permission.ready",
          severity: "info",
          explanation: "Compare fields are available for this actor and project.",
          fields: []
        }
      ],
      rawHistory: [{ uuid: "result-page-project-1", payload: "UNSAFE_COMPARE_SHADOW_PROJECT" }]
    });
    const otherCase = event({
      projectId,
      actorId,
      testCaseId: "case-page-shadow",
      compareId: "compare-page-shadow-case",
      baseResultUuid: "result-page-case-1",
      targetResultUuid: "result-page-case-2",
      occurredAt: "2026-05-27T10:05:00Z",
      decision: "ready",
      reasons: [
        {
          code: "history_compare_permission.ready",
          severity: "info",
          explanation: "Compare fields are available for this actor and project.",
          fields: []
        }
      ],
      rawHistory: [{ uuid: "result-page-case-1", payload: "UNSAFE_COMPARE_SHADOW_CASE" }]
    });
    const persistedEvents = [
      otherProject,
      partial,
      otherActor,
      ready,
      otherCase,
      denied,
      partial,
      ready
    ];
    const unsafeMarkers = [
      "UNSAFE_COMPARE_PAYLOAD_PAGE_READY",
      "UNSAFE_COMPARE_TRACE_PAGE_READY",
      "UNSAFE_COMPARE_PAYLOAD_PAGE_PARTIAL",
      "UNSAFE_COMPARE_PAYLOAD_PAGE_DENIED",
      "UNSAFE_COMPARE_SHADOW_ACTOR",
      "UNSAFE_COMPARE_SHADOW_PROJECT",
      "UNSAFE_COMPARE_SHADOW_CASE",
      "result-page-shadow-1",
      "result-page-project-1",
      "result-page-case-1"
    ];
    const repository = new CursorPagedHistoryComparePermissionAuditRepository(persistedEvents);
    const pagedSnapshot = await loadPagedHistoryComparePermissionInvariantSnapshot(repository, {
      projectId,
      actorId,
      testCaseId,
      limit: 2,
      unsafeMarkers
    });
    const oneShotSnapshot = historyComparePermissionInvariantSnapshot(persistedEvents, {
      projectId,
      actorId,
      testCaseId,
      unsafeMarkers
    });
    const replayedFromProjectedEvents = historyComparePermissionInvariantSnapshot(
      pagedSnapshot.projectedEvents,
      {
        projectId,
        actorId,
        testCaseId,
        unsafeMarkers
      }
    );
    const retriedSnapshot = await loadPagedHistoryComparePermissionInvariantSnapshot(repository, {
      projectId,
      actorId,
      testCaseId,
      limit: 2,
      unsafeMarkers
    });
    const emptyPage = await repository.listByScope({
      projectId,
      actorId,
      testCaseId,
      limit: 2,
      cursor: pagedSnapshot.exhaustedCursor
    });
    const serializedSnapshot = JSON.stringify(pagedSnapshot);

    expect(pagedSnapshot).toMatchObject({
      visitedCursors: [undefined, "2", "4"],
      exhaustedCursor: "5",
      projectIds: [projectId],
      actorIds: [actorId],
      testCaseIds: [testCaseId],
      compareIds: ["compare-page-denied", "compare-page-partial", "compare-page-ready"],
      byDecision: { denied: 1, partial: 1, ready: 1 },
      rawHistory: {
        included: false,
        preserved: true,
        digestCount: 3,
        itemCount: 3
      }
    });
    expect(stripPagingMetadata(pagedSnapshot)).toEqual(oneShotSnapshot);
    expect(replayedFromProjectedEvents).toEqual(oneShotSnapshot);
    expect(retriedSnapshot).toEqual(pagedSnapshot);
    expect(emptyPage).toEqual({ items: [] });
    expect(pagedSnapshot.evidence).toMatchObject({
      deterministic: true,
      recomputable: true,
      projectScoped: true,
      actorScoped: {
        requested: true,
        passed: true,
        actorId,
        leakedActorIds: []
      },
      appendOnly: {
        uniqueProjectedEventIds: true,
        duplicateEventIds: [],
        projectedEventIds: [ready.id, partial.id, denied.id]
      },
      rawCompareInputs: {
        included: false,
        preserved: true,
        digestCount: 3,
        itemCount: 3
      },
      redaction: { passed: true, leakedMarkers: [] }
    });
    expect(serializedSnapshot).not.toContain("actor-page-shadow");
    expect(serializedSnapshot).not.toContain("project-history-shadow");
    expect(serializedSnapshot).not.toContain("case-page-shadow");
    for (const marker of unsafeMarkers) {
      expect(serializedSnapshot).not.toContain(marker);
    }
  });
});

function event(
  input: Partial<CreateHistoryComparePermissionAuditEventInput> &
    Pick<
      CreateHistoryComparePermissionAuditEventInput,
      "baseResultUuid" | "decision" | "occurredAt" | "targetResultUuid"
    >
) {
  return createHistoryComparePermissionAuditEvent({
    projectId: "project-history",
    actorId: "actor-a",
    testCaseId: "case-checkout",
    ...input
  });
}

function historyComparePermissionInvariantSnapshot(
  events: readonly HistoryComparePermissionAuditEvent[],
  options: {
    projectId: string;
    actorId: string;
    testCaseId: string;
    unsafeMarkers: readonly string[];
  }
) {
  const testCaseEvents = events.filter((candidate) => candidate.testCaseId === options.testCaseId);
  const projection = replayHistoryComparePermissionAuditEvents(testCaseEvents, {
    projectId: options.projectId,
    actorId: options.actorId
  });
  const evidence = buildHistoryComparePermissionAuditReplayInvariantEvidence(testCaseEvents, {
    projectId: options.projectId,
    actorId: options.actorId,
    unsafeMarkers: options.unsafeMarkers
  });

  return {
    evidence,
    projectIds: uniqueSorted(projection.events.map((candidate) => candidate.projectId)),
    actorIds: projection.actorIds,
    testCaseIds: projection.testCaseIds,
    compareIds: projection.compareIds,
    byDecision: projection.byDecision,
    rawHistory: {
      included: projection.rawHistory.included,
      preserved: projection.rawHistory.preserved,
      digestCount: projection.rawHistory.digests.length,
      itemCount: projection.rawHistory.itemCount
    }
  };
}

type CursorPage<T> = {
  items: T[];
  nextCursor?: string;
};

type HistoryComparePermissionAuditListQuery = {
  projectId: string;
  actorId: string;
  testCaseId: string;
  limit: number;
  cursor?: string;
};

class CursorPagedHistoryComparePermissionAuditRepository {
  private readonly events: HistoryComparePermissionAuditEvent[];

  constructor(events: readonly HistoryComparePermissionAuditEvent[]) {
    this.events = [...events].sort((left, right) => {
      const projectOrder = left.projectId.localeCompare(right.projectId);
      if (projectOrder !== 0) {
        return projectOrder;
      }

      const actorOrder = left.actorId.localeCompare(right.actorId);
      if (actorOrder !== 0) {
        return actorOrder;
      }

      const caseOrder = left.testCaseId.localeCompare(right.testCaseId);
      if (caseOrder !== 0) {
        return caseOrder;
      }

      const occurredAt = left.occurredAt.localeCompare(right.occurredAt);
      return occurredAt === 0 ? left.id.localeCompare(right.id) : occurredAt;
    });
  }

  async listByScope(
    query: HistoryComparePermissionAuditListQuery
  ): Promise<CursorPage<HistoryComparePermissionAuditEvent>> {
    const offset = query.cursor === undefined ? 0 : Number.parseInt(query.cursor, 10);
    const scoped = this.events.filter(
      (event) =>
        event.projectId === query.projectId &&
        event.actorId === query.actorId &&
        event.testCaseId === query.testCaseId
    );
    const items = scoped.slice(offset, offset + query.limit);
    const nextOffset = offset + items.length;

    return {
      items,
      ...(nextOffset < scoped.length ? { nextCursor: String(nextOffset) } : {})
    };
  }
}

async function loadPagedHistoryComparePermissionInvariantSnapshot(
  repository: CursorPagedHistoryComparePermissionAuditRepository,
  options: {
    projectId: string;
    actorId: string;
    testCaseId: string;
    limit: number;
    unsafeMarkers: readonly string[];
  }
) {
  const accumulated: HistoryComparePermissionAuditEvent[] = [];
  const visitedCursors: Array<string | undefined> = [];
  let cursor: string | undefined;

  do {
    visitedCursors.push(cursor);
    const page = await repository.listByScope({
      projectId: options.projectId,
      actorId: options.actorId,
      testCaseId: options.testCaseId,
      limit: options.limit,
      ...(cursor !== undefined ? { cursor } : {})
    });
    accumulated.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== undefined);

  const snapshot = historyComparePermissionInvariantSnapshot(accumulated, {
    projectId: options.projectId,
    actorId: options.actorId,
    testCaseId: options.testCaseId,
    unsafeMarkers: options.unsafeMarkers
  });
  const projection = replayHistoryComparePermissionAuditEvents(accumulated, {
    projectId: options.projectId,
    actorId: options.actorId
  });

  return {
    ...snapshot,
    projectedEvents: projection.events,
    visitedCursors,
    exhaustedCursor: String(accumulated.length)
  };
}

function stripPagingMetadata(
  snapshot: Awaited<ReturnType<typeof loadPagedHistoryComparePermissionInvariantSnapshot>>
) {
  const summary = { ...snapshot };
  for (const key of ["projectedEvents", "visitedCursors", "exhaustedCursor"] as const) {
    Reflect.deleteProperty(summary, key);
  }
  return summary;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
