import { describe, expect, it } from "vitest";
import {
  buildIdentityCorrectionAuditEvents,
  createIdentityCorrectionAuditEvent,
  type IdentityCorrectionAuditInput
} from "./index.js";

describe("identity correction audit", () => {
  it("creates serializable conservative link, split, merge, and correction events", () => {
    const base = auditInput({
      kind: "conservative_link",
      beforeIds: ["history:checkout-login"],
      afterIds: ["case:checkout-login"],
      source: "historyId",
      confidence: "medium",
      origin: { type: "system", name: "identity-reconciler" },
      reason: "Link observed history id to explicit test case id without rewriting history."
    });

    const events = [
      createIdentityCorrectionAuditEvent(base),
      createIdentityCorrectionAuditEvent(
        auditInput({
          kind: "split",
          beforeIds: ["case:param-checkout"],
          afterIds: ["case:param-checkout:chrome", "case:param-checkout:firefox"],
          source: "heuristic",
          confidence: "high",
          origin: { type: "actor", actorId: "synthetic-user", displayName: "Synthetic User" },
          reason: "Parameter variants were previously grouped under one identity."
        })
      ),
      createIdentityCorrectionAuditEvent(
        auditInput({
          kind: "merge",
          beforeIds: ["case:legacy-name", "case:renamed"],
          afterIds: ["case:stable-login"],
          source: "manual",
          confidence: "high",
          origin: { type: "actor", actorId: "synthetic-user" },
          reason: "Manual review confirmed rename continuity."
        })
      ),
      createIdentityCorrectionAuditEvent(
        auditInput({
          kind: "correction",
          beforeIds: ["case:typo"],
          afterIds: ["case:corrected"],
          source: "migration",
          confidence: "high",
          origin: { type: "system", name: "identity-backfill" },
          reason: "Backfill corrected a deterministic normalization bug."
        })
      )
    ];

    expect(events.map((event) => event.kind)).toEqual([
      "conservative_link",
      "split",
      "merge",
      "correction"
    ]);
    expect(events[0]).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^identity-audit:/),
        dedupeKey: expect.any(String),
        source: "historyId",
        confidence: "medium",
        origin: { type: "system", name: "identity-reconciler" },
        beforeIds: ["history:checkout-login"],
        afterIds: ["case:checkout-login"],
        scope: {
          launchId: "launch-identity",
          historyId: "history-checkout",
          parameterVariantSignature: '[{"name":"browser","value":"chromium"}]'
        },
        evidence: [
          {
            launchId: "launch-identity",
            resultUuid: "result-1",
            historyId: "history-checkout",
            attemptIndex: 0,
            parameterVariantSignature: '[{"name":"browser","value":"chromium"}]'
          }
        ]
      })
    );
    expect(JSON.parse(JSON.stringify(events))).toEqual(events);
  });

  it("does not inflate audit events for retry attempts of the same correction", () => {
    const firstAttempt = auditInput({
      beforeIds: ["history:login"],
      afterIds: ["case:login"],
      evidence: [
        {
          launchId: "launch-retry",
          resultUuid: "result-failed",
          historyId: "history-login",
          attemptIndex: 0,
          parameterVariantSignature: '[{"name":"browser","value":"chromium"}]'
        }
      ]
    });
    const retryAttempt = auditInput({
      beforeIds: ["history:login"],
      afterIds: ["case:login"],
      evidence: [
        {
          launchId: "launch-retry",
          resultUuid: "result-passed",
          historyId: "history-login",
          attemptIndex: 1,
          parameterVariantSignature: '[{"name":"browser","value":"chromium"}]'
        }
      ]
    });

    const events = buildIdentityCorrectionAuditEvents([firstAttempt, retryAttempt]);

    expect(events).toHaveLength(1);
    expect(events[0]?.evidence).toHaveLength(2);
    expect(createIdentityCorrectionAuditEvent(firstAttempt).id).toBe(
      createIdentityCorrectionAuditEvent(retryAttempt).id
    );
  });

  it("keeps parameter variants from collapsing into one correction event", () => {
    const chrome = auditInput({
      beforeIds: ["history:checkout"],
      afterIds: ["case:checkout:chrome"],
      scope: {
        launchId: "launch-identity",
        historyId: "history-checkout",
        parameterVariantSignature: '[{"name":"browser","value":"chromium"}]'
      },
      evidence: [
        {
          resultUuid: "result-chrome",
          parameterVariantSignature: '[{"name":"browser","value":"chromium"}]'
        }
      ]
    });
    const firefox = auditInput({
      beforeIds: ["history:checkout"],
      afterIds: ["case:checkout:firefox"],
      scope: {
        launchId: "launch-identity",
        historyId: "history-checkout",
        parameterVariantSignature: '[{"name":"browser","value":"firefox"}]'
      },
      evidence: [
        {
          resultUuid: "result-firefox",
          parameterVariantSignature: '[{"name":"browser","value":"firefox"}]'
        }
      ]
    });

    const events = buildIdentityCorrectionAuditEvents([chrome, firefox]);

    expect(events).toHaveLength(2);
    expect(new Set(events.map((event) => event.id)).size).toBe(2);
    expect(events.map((event) => event.scope?.parameterVariantSignature).sort()).toEqual([
      '[{"name":"browser","value":"chromium"}]',
      '[{"name":"browser","value":"firefox"}]'
    ]);
  });

  it("rejects ambiguous event shapes before they can reach persistence", () => {
    expect(() =>
      createIdentityCorrectionAuditEvent(
        auditInput({
          kind: "merge",
          beforeIds: ["case:only-one-before"],
          afterIds: ["case:after"]
        })
      )
    ).toThrow("merge audit events require at least two before ids");
  });
});

function auditInput(
  overrides: Partial<IdentityCorrectionAuditInput>
): IdentityCorrectionAuditInput {
  return {
    projectId: "00000000-0000-4000-8000-000000000201",
    kind: "conservative_link",
    source: "historyId",
    confidence: "medium",
    origin: { type: "system", name: "identity-reconciler" },
    reason: "Conservatively link observed history id to explicit test case id.",
    beforeIds: ["history:login"],
    afterIds: ["case:login"],
    scope: {
      launchId: "launch-identity",
      historyId: "history-checkout",
      parameterVariantSignature: '[{"name":"browser","value":"chromium"}]'
    },
    evidence: [
      {
        launchId: "launch-identity",
        resultUuid: "result-1",
        historyId: "history-checkout",
        attemptIndex: 0,
        parameterVariantSignature: '[{"name":"browser","value":"chromium"}]'
      }
    ],
    occurredAt: "2026-05-30T10:00:00.000Z",
    ...overrides
  };
}
