import { describe, expect, it } from "vitest";
import type {
  AllureStatus,
  AllureStatusDetails,
  NormalizedTestResult
} from "@testhistory/contracts";
import {
  appendDefectMuteAuditEvent,
  buildDefectClusters,
  buildDefectMuteReplayInvariantEvidence,
  createDefectMute,
  evaluateQualityGate,
  replayDefectMuteAuditEvents,
  snapshotDefectMuteEffectiveState,
  unmuteDefect,
  type DefectMuteAuditEvent,
  type Launch
} from "./index.js";

describe("defect mute persistence projection", () => {
  it("keeps persisted mute events append-only and idempotent", () => {
    const launch = multiLaunch("project-a", "launch-a", "main #1", "2026-04-20T00:00:00Z", [
      testResult({
        uuid: "failure-a",
        testCaseId: "case-a",
        name: "checkout fails",
        status: "failed",
        statusDetails: { message: "AssertionError: expected 41 to equal 42" }
      })
    ]);
    const mute = createDefectMute({
      id: "mute-append-only",
      projectId: "project-a",
      scope: { testCaseIds: ["case-a"] },
      reason: "Known incident token=raw-append-token",
      origin: { type: "actor", actorId: "qa-lead" },
      occurredAt: "2026-04-20T01:00:00Z",
      clusters: buildDefectClusters([launch])
    });
    const [event] = mute.auditEvents;
    const stream = appendDefectMuteAuditEvent([], event!);
    const retried = appendDefectMuteAuditEvent(stream, event!);
    const replayed = replayDefectMuteAuditEvents([event!, event!], {
      projectId: "project-a"
    });

    expect(retried).toEqual(stream);
    expect(replayed.totalEvents).toBe(1);
    expect(replayed.diagnostics).toEqual([
      expect.objectContaining({
        code: "defect_mute.duplicate_event_ignored",
        eventId: event!.id
      })
    ]);
    expect(() =>
      appendDefectMuteAuditEvent(stream, {
        ...event!,
        reason: "Replacement should fail"
      })
    ).toThrow("append-only and cannot be replaced");
    expect(JSON.stringify(stream)).not.toContain("raw-append-token");
  });

  it("replays reversible project-scoped projections without cross-project leakage", () => {
    const projectALaunch = multiLaunch("project-a", "launch-a", "main #2", "2026-04-21T00:00:00Z", [
      testResult({
        uuid: "failure-a",
        testCaseId: "case-a",
        name: "checkout fails",
        status: "failed",
        statusDetails: { message: "AssertionError: expected status 200 to equal 500" }
      })
    ]);
    const projectBLaunch = multiLaunch("project-b", "launch-b", "main #2", "2026-04-21T00:00:00Z", [
      testResult({
        uuid: "failure-b",
        testCaseId: "case-b",
        name: "profile fails",
        status: "broken",
        statusDetails: { message: "TimeoutError: waiting for profile" }
      })
    ]);
    const projectAMute = createDefectMute({
      id: "mute-project-a",
      projectId: "project-a",
      scope: { testCaseIds: ["case-a"] },
      reason: "Mute project A only",
      origin: { type: "actor", actorId: "qa-a" },
      occurredAt: "2026-04-21T01:00:00Z",
      clusters: buildDefectClusters([projectALaunch])
    });
    const projectAUnmuted = unmuteDefect({
      record: projectAMute,
      reason: "Project A fixed",
      origin: { type: "system", systemId: "release-bot" },
      occurredAt: "2026-04-21T02:00:00Z"
    });
    const projectBMute = createDefectMute({
      id: "mute-project-b",
      projectId: "project-b",
      scope: { testCaseIds: ["case-b"] },
      reason: "Mute project B only",
      origin: { type: "actor", actorId: "qa-b" },
      occurredAt: "2026-04-21T01:30:00Z",
      clusters: buildDefectClusters([projectBLaunch])
    });
    const stream = [
      projectBMute.auditEvents[0]!,
      projectAUnmuted.auditEvents[1]!,
      projectAUnmuted.auditEvents[0]!
    ];

    const projectAProjection = replayDefectMuteAuditEvents(stream, { projectId: "project-a" });
    const projectBProjection = replayDefectMuteAuditEvents(stream, { projectId: "project-b" });

    expect(projectAProjection).toEqual(
      expect.objectContaining({
        projectId: "project-a",
        totalEvents: 2,
        mutedEvents: 1,
        unmutedEvents: 1,
        active: 0,
        inactive: 1,
        affectedTestIds: ["case-a"]
      })
    );
    expect(projectAProjection.diagnostics).toEqual([
      expect.objectContaining({
        code: "defect_mute.cross_project_event_ignored",
        eventId: projectBMute.auditEvents[0]!.id,
        projectId: "project-b",
        expectedProjectId: "project-a"
      })
    ]);
    expect(() =>
      replayDefectMuteAuditEvents(stream, { projectId: "project-a", crossProject: "reject" })
    ).toThrow("belongs to project project-b, not project-a");
    expect(projectAProjection.records).toEqual([
      expect.objectContaining({
        id: "mute-project-a",
        status: "inactive",
        projectId: "project-a",
        rawFailureHistory: [
          expect.objectContaining({
            testId: "case-a",
            status: "failed",
            launchId: "launch-a"
          })
        ]
      })
    ]);
    expect(projectAProjection.rawFailureHistory).toEqual(
      expect.objectContaining({
        totalOccurrences: 1,
        statusCounters: { failed: 1, broken: 0 },
        byTestId: { "case-a": 1 }
      })
    );
    expect(JSON.stringify(projectAProjection)).not.toContain("case-b");

    expect(projectBProjection).toEqual(
      expect.objectContaining({
        projectId: "project-b",
        totalEvents: 1,
        active: 1,
        inactive: 0,
        affectedTestIds: ["case-b"]
      })
    );
    expect(projectBProjection.diagnostics).toHaveLength(2);
  });

  it("recomputes active and unmuted projections without hiding raw failure history", () => {
    const baseline = multiLaunch("project-a", "launch-before", "main #3", "2026-04-22T00:00:00Z", [
      testResult({
        uuid: "before",
        testCaseId: "case-muted",
        name: "payment fails",
        status: "passed"
      })
    ]);
    const current = multiLaunch("project-a", "launch-current", "main #4", "2026-04-23T00:00:00Z", [
      testResult({
        uuid: "current",
        testCaseId: "case-muted",
        name: "payment fails",
        status: "failed",
        statusDetails: {
          message: "AssertionError: expected payment state paid to equal pending"
        }
      })
    ]);
    const mute = createDefectMute({
      id: "mute-quality-gate",
      projectId: "project-a",
      scope: { testCaseIds: ["case-muted"] },
      reason: "Temporarily muted during provider incident",
      origin: { type: "actor", actorId: "qa-lead" },
      occurredAt: "2026-04-23T01:00:00Z",
      clusters: buildDefectClusters([baseline, current])
    });
    const activeProjection = replayDefectMuteAuditEvents(mute.auditEvents, {
      projectId: "project-a"
    });
    const activeEvaluation = evaluateQualityGate(current, {
      rules: [],
      thresholds: { passRate: { op: "gte", value: 0, severity: "warn" } },
      historyLaunches: [baseline],
      defectMutes: activeProjection.activeRecords,
      defectMuteRules: [
        {
          code: "mute-new-failures",
          reasonCode: "quality_gate.newFailures",
          mode: "exclude_muted_affected_tests"
        },
        {
          code: "mute-failed-broken-total",
          reasonCode: "quality_gate.failedBrokenTotal",
          mode: "exclude_muted_affected_tests"
        }
      ]
    });

    const unmuted = unmuteDefect({
      record: mute,
      reason: "Provider incident resolved",
      origin: { type: "system", systemId: "release-bot" },
      occurredAt: "2026-04-23T02:00:00Z"
    });
    const inactiveProjection = replayDefectMuteAuditEvents([...unmuted.auditEvents].reverse(), {
      projectId: "project-a"
    });
    const inactiveEvaluation = evaluateQualityGate(current, {
      rules: [],
      thresholds: { passRate: { op: "gte", value: 0, severity: "warn" } },
      historyLaunches: [baseline],
      defectMutes: inactiveProjection.activeRecords,
      defectMuteRules: [
        {
          code: "mute-new-failures",
          reasonCode: "quality_gate.newFailures",
          mode: "exclude_muted_affected_tests"
        },
        {
          code: "mute-failed-broken-total",
          reasonCode: "quality_gate.failedBrokenTotal",
          mode: "exclude_muted_affected_tests"
        }
      ]
    });

    expect(activeProjection.rawFailureHistory).toEqual(
      expect.objectContaining({
        totalOccurrences: 1,
        statusCounters: { failed: 1, broken: 0 }
      })
    );
    expect(activeEvaluation.metrics.failed).toBe(1);
    expect(activeEvaluation.statusCounters.failed).toBe(1);
    expect(activeEvaluation.rawStatus).toBe("failed");
    expect(activeEvaluation.status).toBe("passed");
    expect(activeEvaluation.effects).toHaveLength(2);

    expect(inactiveProjection.rawFailureHistory.totalOccurrences).toBe(1);
    expect(inactiveEvaluation.metrics.failed).toBe(1);
    expect(inactiveEvaluation.statusCounters.failed).toBe(1);
    expect(inactiveEvaluation.status).toBe("failed");
    expect(inactiveEvaluation.effects).toEqual([]);
  });

  it("keeps effective mute state separate from raw failure history and drops unsafe payload fields", () => {
    const muted = {
      id: "event-synthetic-muted",
      type: "defect.muted",
      muteId: "mute-synthetic",
      projectId: "project-a",
      occurredAt: "2026-04-24T01:00:00Z",
      origin: { type: "actor", actorId: "qa-user token=raw-origin-token" },
      scope: { testCaseIds: ["case-payload"] },
      reason: "Known issue token=raw-reason-token at C:\\tmp\\raw-reason-path\\log.txt",
      affectedSignatureHashes: ["signature-payload"],
      affectedTestIds: ["case-payload"],
      rawFailureHistory: [
        {
          signatureHash: "signature-payload",
          launchId: "launch-token=raw-launch-token",
          launchName: "https://ci.example.test/builds/42?token=raw-launch-url-token",
          launchCreatedAt: "2026-04-24T00:00:00Z",
          resultUuid: "uuid-storageKey=raw-result-storage-key",
          testId: "case-payload",
          status: "failed"
        }
      ],
      payload: {
        token: "raw-payload-token",
        signedUrl: "https://storage.example.test/signed?token=raw-signed-url-token",
        storage: { path: "C:\\tmp\\raw-payload-path\\result.json" }
      }
    } as const;
    const unmuted = {
      ...muted,
      id: "event-synthetic-unmuted",
      type: "defect.unmuted",
      occurredAt: "2026-04-24T02:00:00Z",
      reason: "Resolved token=raw-unmute-token",
      rawFailureHistory: [
        {
          signatureHash: "signature-payload",
          launchId: "replacement-launch",
          launchName: "replacement",
          launchCreatedAt: "2026-04-24T01:30:00Z",
          resultUuid: "replacement-result",
          testId: "replacement-case",
          status: "broken"
        }
      ]
    } as const;

    const projection = replayDefectMuteAuditEvents(
      [unmuted as unknown as DefectMuteAuditEvent, muted as unknown as DefectMuteAuditEvent],
      {
        projectId: "project-a"
      }
    );
    const serialized = JSON.stringify(projection);

    expect(projection.effectiveState).toEqual({
      projectId: "project-a",
      activeMuteIds: [],
      inactiveMuteIds: ["mute-synthetic"],
      affectedSignatureHashes: ["signature-payload"],
      affectedTestIds: ["case-payload"],
      records: [
        {
          id: "mute-synthetic",
          status: "inactive",
          projectId: "project-a",
          scope: { testCaseIds: ["case-payload"] },
          mutedAt: "2026-04-24T01:00:00Z",
          unmutedAt: "2026-04-24T02:00:00Z",
          affectedSignatureHashes: ["signature-payload"],
          affectedTestIds: ["case-payload"]
        }
      ]
    });
    expect(projection.records[0]?.rawFailureHistory).toEqual([
      expect.objectContaining({
        launchId: "launch-token=[redacted]",
        launchName: "https://ci.example.test/builds/42",
        resultUuid: "uuid-storageKey=[redacted]",
        testId: "case-payload",
        status: "failed"
      })
    ]);
    expect(projection.rawFailureHistory).toEqual(
      expect.objectContaining({
        totalOccurrences: 1,
        statusCounters: { failed: 1, broken: 0 },
        byTestId: { "case-payload": 1 }
      })
    );
    expect(JSON.stringify(projection.effectiveState)).not.toContain("rawFailureHistory");
    expect(projection.diagnostics).toEqual([
      expect.objectContaining({
        code: "defect_mute.unsafe_payload_field_redacted",
        fieldPaths: [
          "event.payload",
          "event.payload.token",
          "event.payload.signedUrl",
          "event.payload.storage",
          "event.payload.storage.path"
        ]
      }),
      expect.objectContaining({
        code: "defect_mute.unsafe_payload_field_redacted"
      })
    ]);
    expect(serialized).not.toContain("raw-origin-token");
    expect(serialized).not.toContain("raw-reason-token");
    expect(serialized).not.toContain("raw-reason-path");
    expect(serialized).not.toContain("raw-launch-token");
    expect(serialized).not.toContain("raw-launch-url-token");
    expect(serialized).not.toContain("raw-result-storage-key");
    expect(serialized).not.toContain("raw-payload-token");
    expect(serialized).not.toContain("raw-signed-url-token");
    expect(serialized).not.toContain("raw-payload-path");
    expect(serialized).not.toContain("raw-unmute-token");
  });

  it("builds deterministic invariant evidence for effective replay without mutating raw failures", () => {
    const projectLaunch = multiLaunch(
      "project-invariant",
      "launch-invariant",
      "main #5",
      "2026-04-25T00:00:00Z",
      [
        testResult({
          uuid: "failure-invariant",
          testCaseId: "case-invariant",
          name: "invoice export fails",
          status: "failed",
          statusDetails: {
            message: "AssertionError: expected generated invoice to be available"
          }
        })
      ]
    );
    const otherProjectLaunch = multiLaunch(
      "project-other",
      "launch-other",
      "main #5",
      "2026-04-25T00:00:00Z",
      [
        testResult({
          uuid: "failure-other",
          testCaseId: "case-other",
          name: "unrelated project failure",
          status: "broken",
          statusDetails: { message: "TimeoutError: unrelated project setup" }
        })
      ]
    );
    const mute = createDefectMute({
      id: "mute-invariant",
      projectId: "project-invariant",
      scope: { testCaseIds: ["case-invariant"] },
      reason: "Synthetic triage token=raw-invariant-reason-marker",
      origin: { type: "actor", actorId: "qa-invariant token=raw-invariant-actor-marker" },
      occurredAt: "2026-04-25T01:00:00Z",
      clusters: buildDefectClusters([projectLaunch])
    });
    const unmuted = unmuteDefect({
      record: mute,
      reason: "Synthetic resolved token=raw-invariant-unmute-marker",
      origin: { type: "system", systemId: "quality-bot" },
      occurredAt: "2026-04-25T02:00:00Z"
    });
    const forgedUnmuteRawHistory = {
      ...unmuted.auditEvents[1]!,
      rawFailureHistory: [
        {
          signatureHash: "signature-forged",
          launchId: "launch-forged",
          launchName: "forged launch token=raw-invariant-forged-marker",
          launchCreatedAt: "2026-04-25T01:30:00Z",
          resultUuid: "result-forged",
          testId: "case-forged",
          status: "broken"
        }
      ],
      payload: {
        token: "raw-invariant-payload-marker",
        signedUrl: "https://example.invalid/synthetic?token=raw-invariant-url-marker"
      }
    } as const;
    const otherProjectMute = createDefectMute({
      id: "mute-other-project",
      projectId: "project-other",
      scope: { testCaseIds: ["case-other"] },
      reason: "Other project synthetic",
      origin: { type: "actor", actorId: "qa-other" },
      occurredAt: "2026-04-25T01:15:00Z",
      clusters: buildDefectClusters([otherProjectLaunch])
    });

    const evidence = buildDefectMuteReplayInvariantEvidence(
      [
        forgedUnmuteRawHistory as unknown as DefectMuteAuditEvent,
        otherProjectMute.auditEvents[0]!,
        mute.auditEvents[0]!,
        mute.auditEvents[0]!
      ],
      {
        projectId: "project-invariant",
        unsafeMarkers: [
          "raw-invariant-reason-marker",
          "raw-invariant-actor-marker",
          "raw-invariant-unmute-marker",
          "raw-invariant-forged-marker",
          "raw-invariant-payload-marker",
          "raw-invariant-url-marker"
        ]
      }
    );

    expect(evidence).toEqual(
      expect.objectContaining({
        projectId: "project-invariant",
        deterministic: true,
        recomputable: true,
        projectScoped: true,
        redaction: { passed: true, leakedMarkers: [] }
      })
    );
    expect(evidence.appendOnly).toEqual({
      uniqueProjectedEventIds: true,
      duplicateEventIds: [],
      projectedEventIds: [mute.auditEvents[0]!.id, unmuted.auditEvents[1]!.id]
    });
    expect(evidence.rawEffectiveSeparation).toEqual({
      effectiveStateExcludesRawFailureHistory: true,
      rawFailureHistoryPreserved: true,
      rawFailureHistoryNotMutatedByUnmute: true,
      rawFailureOccurrenceCount: 1,
      effectiveRecordCount: 1
    });
    expect(evidence.projectionDigest).toBe(evidence.recomputedDigest);
    expect(JSON.stringify(evidence)).not.toContain("case-other");
  });

  it("keeps replay invariant evidence bounded to mute scopes and redacted across hostile streams", () => {
    const projectId = "project-scope-regression";
    const scopedLaunch = multiLaunch(
      projectId,
      "launch-scope-regression",
      "main #scope",
      "2026-04-26T00:00:00Z",
      [
        testResult({
          uuid: "failure-login",
          testCaseId: "case-login",
          name: "login fails",
          status: "failed",
          statusDetails: {
            message: "AssertionError: login button remained disabled"
          }
        }),
        testResult({
          uuid: "failure-export",
          testCaseId: "case-export",
          name: "export fails",
          status: "broken",
          statusDetails: {
            message: "TimeoutError: export job did not finish"
          }
        }),
        testResult({
          uuid: "failure-neighbor",
          testCaseId: "case-neighbor",
          name: "neighboring unrelated failure",
          status: "failed",
          statusDetails: {
            message: "AssertionError: neighboring workflow stayed red"
          }
        })
      ]
    );
    const otherProjectLaunch = multiLaunch(
      "project-shadow-regression",
      "launch-shadow token=raw-cross-launch-token",
      "shadow #1 token=raw-cross-launch-name-token",
      "2026-04-26T00:30:00Z",
      [
        testResult({
          uuid: "failure-shadow-storageKey=raw-cross-result-key",
          testCaseId: "case-shadow token=raw-cross-case-token",
          name: "shadow project failure",
          status: "failed",
          statusDetails: {
            message:
              "AssertionError: shadow project should never leak token=raw-cross-message-token"
          }
        })
      ]
    );
    const clusters = buildDefectClusters([scopedLaunch]);
    const loginSignatureHash = clusters.find((cluster) =>
      cluster.affectedTestIds.includes("case-login")
    )?.signature.hash;
    expect(loginSignatureHash).toBeDefined();

    const signatureScopedMute = createDefectMute({
      id: "mute-signature-scope",
      projectId,
      scope: { signatureHashes: [loginSignatureHash!] },
      reason: "Synthetic signature mute token=raw-scope-signature-reason",
      origin: { type: "actor", actorId: "qa-scope token=raw-scope-signature-actor" },
      occurredAt: "2026-04-26T01:00:00Z",
      clusters
    });
    const caseScopedMute = createDefectMute({
      id: "mute-case-scope",
      projectId,
      scope: { testCaseIds: ["case-export"] },
      reason: "Synthetic case mute token=raw-scope-case-reason",
      origin: { type: "actor", actorId: "qa-case token=raw-scope-case-actor" },
      occurredAt: "2026-04-26T01:05:00Z",
      clusters
    });
    const caseUnmuted = unmuteDefect({
      record: caseScopedMute,
      reason: "Synthetic case resolved token=raw-scope-unmute-reason",
      origin: { type: "system", systemId: "triage-bot token=raw-scope-unmute-system" },
      occurredAt: "2026-04-26T02:00:00Z"
    });
    const forgedUnmute = {
      ...caseUnmuted.auditEvents[1]!,
      rawFailureHistory: [
        {
          signatureHash: "signature-forged token=raw-scope-forged-signature",
          launchId: "launch-forged token=raw-scope-forged-launch",
          launchName: "https://ci.example.test/builds/forged?token=raw-scope-forged-url",
          launchCreatedAt: "2026-04-26T01:45:00Z",
          resultUuid: "result-forged storageKey=raw-scope-forged-result",
          testId: "case-forged token=raw-scope-forged-case",
          status: "broken"
        }
      ],
      payload: {
        token: "raw-scope-forged-payload",
        storage: { path: "C:\\synthetic\\raw-scope-forged-path\\result.json" }
      }
    } as const;
    const otherProjectMute = createDefectMute({
      id: "mute-shadow-scope",
      projectId: "project-shadow-regression",
      scope: { testCaseIds: ["case-shadow token=raw-cross-scope-token"] },
      reason: "Synthetic cross project token=raw-cross-reason-token",
      origin: { type: "actor", actorId: "qa-shadow token=raw-cross-actor-token" },
      occurredAt: "2026-04-26T01:10:00Z",
      clusters: buildDefectClusters([otherProjectLaunch])
    });
    const stream = [
      forgedUnmute as unknown as DefectMuteAuditEvent,
      {
        ...otherProjectMute.auditEvents[0]!,
        payload: {
          signedUrl: "https://storage.example.test/object?token=raw-cross-signed-url-token",
          path: "C:\\synthetic\\raw-cross-payload-path\\shadow.json"
        }
      } as unknown as DefectMuteAuditEvent,
      signatureScopedMute.auditEvents[0]!,
      caseUnmuted.auditEvents[0]!,
      signatureScopedMute.auditEvents[0]!
    ];

    const projection = replayDefectMuteAuditEvents(stream, { projectId });
    const evidence = buildDefectMuteReplayInvariantEvidence(stream, {
      projectId,
      unsafeMarkers: [
        "raw-scope-signature-reason",
        "raw-scope-signature-actor",
        "raw-scope-case-reason",
        "raw-scope-case-actor",
        "raw-scope-unmute-reason",
        "raw-scope-unmute-system",
        "raw-scope-forged-signature",
        "raw-scope-forged-launch",
        "raw-scope-forged-url",
        "raw-scope-forged-result",
        "raw-scope-forged-case",
        "raw-scope-forged-payload",
        "raw-scope-forged-path",
        "raw-cross-launch-token",
        "raw-cross-launch-name-token",
        "raw-cross-result-key",
        "raw-cross-case-token",
        "raw-cross-message-token",
        "raw-cross-scope-token",
        "raw-cross-reason-token",
        "raw-cross-actor-token",
        "raw-cross-signed-url-token",
        "raw-cross-payload-path"
      ]
    });

    expect(projection.affectedTestIds).toEqual(["case-export", "case-login"]);
    expect(projection.rawFailureHistory).toEqual(
      expect.objectContaining({
        totalOccurrences: 2,
        statusCounters: { failed: 1, broken: 1 },
        byTestId: { "case-export": 1, "case-login": 1 }
      })
    );
    expect(projection.effectiveState.records).toEqual([
      expect.objectContaining({
        id: "mute-case-scope",
        status: "inactive",
        affectedTestIds: ["case-export"]
      }),
      expect.objectContaining({
        id: "mute-signature-scope",
        status: "active",
        affectedTestIds: ["case-login"]
      })
    ]);
    expect(projection.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "defect_mute.unsafe_payload_field_redacted" }),
        expect.objectContaining({
          code: "defect_mute.cross_project_event_ignored",
          projectId: "project-shadow-regression",
          expectedProjectId: projectId
        }),
        expect.objectContaining({
          code: "defect_mute.duplicate_event_ignored",
          eventId: signatureScopedMute.auditEvents[0]!.id
        })
      ])
    );

    expect(evidence).toEqual(
      expect.objectContaining({
        projectId,
        deterministic: true,
        recomputable: true,
        projectScoped: true,
        redaction: { passed: true, leakedMarkers: [] }
      })
    );
    expect(evidence.appendOnly).toEqual({
      uniqueProjectedEventIds: true,
      duplicateEventIds: [],
      projectedEventIds: [
        signatureScopedMute.auditEvents[0]!.id,
        caseUnmuted.auditEvents[0]!.id,
        caseUnmuted.auditEvents[1]!.id
      ]
    });
    expect(evidence.rawEffectiveSeparation).toEqual({
      effectiveStateExcludesRawFailureHistory: true,
      rawFailureHistoryPreserved: true,
      rawFailureHistoryNotMutatedByUnmute: true,
      rawFailureOccurrenceCount: 2,
      effectiveRecordCount: 2
    });
    expect(evidence.projectionDigest).toBe(evidence.recomputedDigest);

    const serialized = JSON.stringify({ projection, evidence });
    expect(serialized).not.toContain("case-neighbor");
    expect(serialized).not.toContain("case-shadow");
    expect(serialized).not.toContain("raw-cross");
    expect(serialized).not.toContain("raw-scope");
  });

  it("materializes deterministic replay invariant summaries from projected mute state", () => {
    const projectId = "project-materialized-summary";
    const actorId = "qa-materialized token=raw-summary-actor-token";
    const crossProjectId = "project-materialized-shadow";
    const launch = multiLaunch(
      projectId,
      "launch-materialized token=raw-summary-launch-id",
      "main #summary token=raw-summary-launch-name",
      "2026-04-27T00:00:00Z",
      [
        testResult({
          uuid: "failure-materialized storageKey=raw-summary-result-key",
          testCaseId: "case-materialized",
          name: "materialized checkout failure",
          status: "failed",
          statusDetails: {
            message:
              "AssertionError: summary should avoid raw payload token=raw-summary-message-token"
          }
        })
      ]
    );
    const otherProjectLaunch = multiLaunch(
      crossProjectId,
      "launch-shadow token=raw-summary-cross-launch",
      "shadow #summary token=raw-summary-cross-launch-name",
      "2026-04-27T00:10:00Z",
      [
        testResult({
          uuid: "failure-shadow token=raw-summary-cross-result",
          testCaseId: "case-shadow token=raw-summary-cross-case",
          name: "shadow failure",
          status: "broken",
          statusDetails: {
            message: "TimeoutError: cross project token=raw-summary-cross-message"
          }
        })
      ]
    );
    const mute = createDefectMute({
      id: "mute-materialized",
      projectId,
      scope: { testCaseIds: ["case-materialized"] },
      reason:
        "Synthetic provider incident token=raw-summary-reason-token path=C:\\synthetic\\raw-summary-reason-path\\incident.txt",
      origin: { type: "actor", actorId },
      occurredAt: "2026-04-27T01:00:00Z",
      clusters: buildDefectClusters([launch])
    });
    const unmuted = unmuteDefect({
      record: mute,
      reason: "Synthetic resolved token=raw-summary-unmute-token",
      origin: { type: "system", systemId: "summary-bot token=raw-summary-system-token" },
      occurredAt: "2026-04-27T02:00:00Z"
    });
    const forgedUnmute = {
      ...unmuted.auditEvents[1]!,
      rawFailureHistory: [
        {
          signatureHash: "signature-forged token=raw-summary-forged-signature",
          launchId: "launch-forged token=raw-summary-forged-launch",
          launchName: "https://ci.example.test/builds/forged?token=raw-summary-forged-url",
          launchCreatedAt: "2026-04-27T01:30:00Z",
          resultUuid: "result-forged storageKey=raw-summary-forged-result",
          testId: "case-forged token=raw-summary-forged-case",
          status: "broken"
        }
      ],
      payload: {
        token: "raw-summary-forged-payload",
        signedUrl: "https://storage.example.test/object?token=raw-summary-signed-url",
        path: "C:\\synthetic\\raw-summary-forged-path\\result.json"
      }
    } as const;
    const otherProjectMute = createDefectMute({
      id: "mute-materialized-shadow",
      projectId: crossProjectId,
      scope: { testCaseIds: ["case-shadow token=raw-summary-cross-scope"] },
      reason:
        "Synthetic shadow token=raw-summary-cross-reason path=C:\\synthetic\\raw-summary-cross-path\\result.json",
      origin: { type: "actor", actorId: "qa-shadow token=raw-summary-cross-actor" },
      occurredAt: "2026-04-27T01:15:00Z",
      clusters: buildDefectClusters([otherProjectLaunch])
    });
    const otherProjectUnmuted = unmuteDefect({
      record: otherProjectMute,
      reason: "Shadow resolved token=raw-summary-cross-unmute-reason",
      origin: { type: "system", systemId: "shadow-bot token=raw-summary-cross-system" },
      occurredAt: "2026-04-27T02:15:00Z"
    });
    const stream = [
      forgedUnmute as unknown as DefectMuteAuditEvent,
      otherProjectUnmuted.auditEvents[1]!,
      otherProjectMute.auditEvents[0]!,
      otherProjectMute.auditEvents[0]!,
      mute.auditEvents[0]!,
      mute.auditEvents[0]!,
      forgedUnmute as unknown as DefectMuteAuditEvent
    ];

    const materializeSummary = (events: readonly DefectMuteAuditEvent[]) => {
      const projection = replayDefectMuteAuditEvents(events, { projectId });
      const evidence = buildDefectMuteReplayInvariantEvidence(events, {
        projectId,
        unsafeMarkers: [
          "raw-summary-actor-token",
          "raw-summary-launch-id",
          "raw-summary-launch-name",
          "raw-summary-result-key",
          "raw-summary-message-token",
          "raw-summary-cross-launch",
          "raw-summary-cross-launch-name",
          "raw-summary-cross-result",
          "raw-summary-cross-case",
          "raw-summary-cross-message",
          "raw-summary-reason-token",
          "raw-summary-unmute-token",
          "raw-summary-system-token",
          "raw-summary-reason-path",
          "raw-summary-forged-signature",
          "raw-summary-forged-launch",
          "raw-summary-forged-url",
          "raw-summary-forged-result",
          "raw-summary-forged-case",
          "raw-summary-forged-payload",
          "raw-summary-signed-url",
          "raw-summary-forged-path",
          "raw-summary-cross-scope",
          "raw-summary-cross-reason",
          "raw-summary-cross-path",
          "raw-summary-cross-actor",
          "raw-summary-cross-unmute-reason",
          "raw-summary-cross-system"
        ]
      });

      return {
        projectId: projection.projectId,
        eventCounters: {
          total: projection.totalEvents,
          muted: projection.mutedEvents,
          unmuted: projection.unmutedEvents
        },
        effectiveState: snapshotDefectMuteEffectiveState(projection),
        invariant: {
          deterministic: evidence.deterministic,
          recomputable: evidence.recomputable,
          projectScoped: evidence.projectScoped,
          redacted: evidence.redaction.passed,
          projectedEventIds: evidence.appendOnly.projectedEventIds,
          duplicateEventIds: evidence.appendOnly.duplicateEventIds,
          rawEffectiveSeparation: evidence.rawEffectiveSeparation,
          projectionDigestMatchesRecomputed: evidence.projectionDigest === evidence.recomputedDigest
        }
      };
    };

    const summary = materializeSummary(stream);
    const shuffledStreams = [
      [...stream].reverse(),
      [stream[3]!, stream[6]!, stream[1]!, stream[4]!, stream[0]!, stream[5]!, stream[2]!],
      [stream[5]!, stream[2]!, stream[0]!, stream[1]!, stream[4]!, stream[3]!, stream[6]!]
    ];
    const projection = replayDefectMuteAuditEvents(stream, { projectId });
    const recomputedSummary = materializeSummary(projection.events);
    const serializedSummary = JSON.stringify(summary);

    for (const shuffledStream of shuffledStreams) {
      expect(materializeSummary(shuffledStream)).toEqual(summary);
    }
    expect(summary).toEqual(recomputedSummary);
    expect(summary.eventCounters).toEqual({ total: 2, muted: 1, unmuted: 1 });
    expect(summary.effectiveState).toEqual({
      projectId,
      activeMuteIds: [],
      inactiveMuteIds: ["mute-materialized"],
      affectedSignatureHashes: expect.any(Array),
      affectedTestIds: ["case-materialized"],
      records: [
        expect.objectContaining({
          id: "mute-materialized",
          status: "inactive",
          projectId,
          affectedTestIds: ["case-materialized"]
        })
      ]
    });
    expect(projection.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "defect_mute.unsafe_payload_field_redacted" }),
        expect.objectContaining({
          code: "defect_mute.cross_project_event_ignored",
          projectId: crossProjectId,
          expectedProjectId: projectId
        }),
        expect.objectContaining({
          code: "defect_mute.duplicate_event_ignored",
          eventId: mute.auditEvents[0]!.id
        }),
        expect.objectContaining({
          code: "defect_mute.duplicate_event_ignored",
          eventId: unmuted.auditEvents[1]!.id
        })
      ])
    );
    expect(summary.invariant).toEqual(
      expect.objectContaining({
        deterministic: true,
        recomputable: true,
        projectScoped: true,
        redacted: true,
        projectedEventIds: [mute.auditEvents[0]!.id, unmuted.auditEvents[1]!.id],
        duplicateEventIds: [],
        projectionDigestMatchesRecomputed: true
      })
    );
    expect(summary.invariant.rawEffectiveSeparation).toEqual({
      effectiveStateExcludesRawFailureHistory: true,
      rawFailureHistoryPreserved: true,
      rawFailureHistoryNotMutatedByUnmute: true,
      rawFailureOccurrenceCount: 1,
      effectiveRecordCount: 1
    });
    expect(serializedSummary).not.toContain('"rawFailureHistory":');
    expect(JSON.stringify(summary.effectiveState)).not.toContain("rawFailureHistory");
    expect(serializedSummary).not.toContain("failure-materialized");
    expect(serializedSummary).not.toContain("raw-summary-result-key");
    expect(serializedSummary).not.toContain("launch-materialized");
    expect(serializedSummary).not.toContain("raw-summary-launch");
    expect(serializedSummary).not.toContain(crossProjectId);
    expect(serializedSummary).not.toContain("case-shadow");
    expect(serializedSummary).not.toContain("provider");
    expect(serializedSummary).not.toContain("reason");
    expect(serializedSummary).not.toContain("C:\\");
    expect(serializedSummary).not.toContain("synthetic");
    expect(serializedSummary).not.toContain("path");
    expect(serializedSummary).not.toContain("raw-summary");
  });
});

function multiLaunch(
  projectId: string,
  id: string,
  name: string,
  createdAt: string,
  results: NormalizedTestResult[]
): Launch {
  return {
    id,
    projectId,
    name,
    status: "closed",
    createdAt,
    results
  };
}

function testResult(input: {
  uuid: string;
  name: string;
  status: AllureStatus;
  testCaseId?: string;
  historyId?: string;
  statusDetails?: AllureStatusDetails;
}): NormalizedTestResult {
  return {
    uuid: input.uuid,
    ...(input.testCaseId !== undefined ? { testCaseId: input.testCaseId } : {}),
    ...(input.historyId !== undefined ? { historyId: input.historyId } : {}),
    name: input.name,
    status: input.status,
    labels: {},
    parameters: [],
    attachments: [],
    steps: [],
    raw: {
      uuid: input.uuid,
      ...(input.testCaseId !== undefined ? { testCaseId: input.testCaseId } : {}),
      ...(input.historyId !== undefined ? { historyId: input.historyId } : {}),
      name: input.name,
      status: input.status,
      ...(input.statusDetails !== undefined ? { statusDetails: input.statusDetails } : {})
    }
  };
}
