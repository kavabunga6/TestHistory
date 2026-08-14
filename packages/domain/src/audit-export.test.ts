import { describe, expect, it } from "vitest";
import {
  appendSecurityAuditExportLifecycleEvent,
  createSecurityAuditExportLifecycleEvent,
  defaultSecurityAuditExportPolicy,
  evaluateSecurityAuditExportPolicy,
  replaySecurityAuditExportLifecycleEvents,
  type SecurityAuditExportLifecycleEvent,
  type SecurityAuditExportRequest
} from "./index.js";

const BASE_REQUEST: SecurityAuditExportRequest = {
  projectId: "project-security-audit",
  actorId: "actor-security-admin",
  requestedAt: "2026-05-30T08:00:00.000Z",
  range: {
    from: "2026-05-01T00:00:00.000Z",
    to: "2026-05-08T00:00:00.000Z"
  },
  destination: {
    type: "placeholder",
    secretRef: "audit-export-placeholder-ref"
  },
  criteria: {
    eventTypes: ["auth.login.failed", "auth.access.denied"],
    note: "Bearer raw-note-secret and token=raw-filter-token",
    nested: {
      reason: "keep this visible",
      session: "raw-session-secret"
    }
  }
};

describe("security audit export policy evaluation", () => {
  it("is disabled by default", () => {
    const decision = evaluateSecurityAuditExportPolicy(BASE_REQUEST);

    expect(defaultSecurityAuditExportPolicy().enabled).toBe(false);
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe("denied");
    expect(decision.reasons.map((reason) => reason.code)).toEqual(["audit_export.disabled"]);
  });

  it("allows placeholder export decisions when explicit policy, scope, range, and secretRef match", () => {
    const decision = evaluateSecurityAuditExportPolicy(BASE_REQUEST, {
      enabled: true,
      allowedProjectIds: ["project-security-audit"],
      allowedActorIds: ["actor-security-admin"],
      maxRangeDays: 14
    });

    expect(decision).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        allowed: true,
        status: "allowed",
        limits: { maxRangeDays: 14 }
      })
    );
    expect(decision.request.destination).toEqual({
      type: "placeholder",
      secretRef: "audit-export-placeholder-ref"
    });
    expect(decision.request.range.days).toBe(7);
    expect(decision.reasons.map((reason) => reason.code)).toEqual([
      "audit_export.allowed_placeholder"
    ]);
  });

  it("requires destination secretRef instead of provider credentials", () => {
    const decision = evaluateSecurityAuditExportPolicy(
      {
        ...BASE_REQUEST,
        destination: { type: "placeholder" }
      },
      { enabled: true }
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reasons.map((reason) => reason.code)).toEqual([
      "audit_export.secret_ref_required"
    ]);
  });

  it("rejects ranges over the policy limit", () => {
    const decision = evaluateSecurityAuditExportPolicy(
      {
        ...BASE_REQUEST,
        range: {
          from: "2026-05-01T00:00:00.000Z",
          to: "2026-06-10T00:00:00.000Z"
        }
      },
      { enabled: true, maxRangeDays: 31 }
    );

    expect(decision.allowed).toBe(false);
    expect(decision.request.range.days).toBe(40);
    expect(decision.reasons.map((reason) => reason.code)).toEqual([
      "audit_export.range_exceeds_limit"
    ]);
  });

  it("redacts criteria in returned decisions", () => {
    const decision = evaluateSecurityAuditExportPolicy(BASE_REQUEST, { enabled: true });
    const serialized = JSON.stringify(decision);

    expect(decision.request.criteria).toEqual({
      eventTypes: ["auth.login.failed", "auth.access.denied"],
      nested: {
        reason: "keep this visible",
        session: "[redacted]"
      },
      note: "Bearer [redacted] and token=[redacted]"
    });
    expect(serialized).not.toContain("raw-note-secret");
    expect(serialized).not.toContain("raw-filter-token");
    expect(serialized).not.toContain("raw-session-secret");
  });

  it("emits deterministic denial reasons in policy order", () => {
    const request: SecurityAuditExportRequest = {
      ...BASE_REQUEST,
      range: {
        from: "2026-05-08T00:00:00.000Z",
        to: "2026-05-01T00:00:00.000Z"
      },
      destination: {
        type: "placeholder"
      }
    };
    const first = evaluateSecurityAuditExportPolicy(request, {
      allowedActorIds: ["different-actor"],
      enabled: false,
      allowedProjectIds: ["different-project"],
      maxRangeDays: 1
    });
    const second = evaluateSecurityAuditExportPolicy(request, {
      maxRangeDays: 1,
      allowedProjectIds: ["different-project"],
      enabled: false,
      allowedActorIds: ["different-actor"]
    });
    const expectedCodes = [
      "audit_export.disabled",
      "audit_export.secret_ref_required",
      "audit_export.range_invalid",
      "audit_export.project_scope_denied",
      "audit_export.actor_scope_denied"
    ];

    expect(first.reasons.map((reason) => reason.code)).toEqual(expectedCodes);
    expect(second.reasons.map((reason) => reason.code)).toEqual(expectedCodes);
    expect(first.reasons).toEqual(second.reasons);
  });

  it("rejects unsafe raw secret, url, path, and token fields", () => {
    const request = {
      ...BASE_REQUEST,
      destination: {
        ...BASE_REQUEST.destination,
        url: "https://example.test/upload?token=raw-url-token",
        path: "C:\\tmp\\audit-export.jsonl",
        token: "raw-token",
        rawSecret: "raw-secret"
      },
      criteria: {
        actorId: "actor-security-admin",
        rawPath: "C:\\tmp\\criteria.json"
      }
    } as unknown as SecurityAuditExportRequest;
    const decision = evaluateSecurityAuditExportPolicy(request, { enabled: true });
    const serialized = JSON.stringify(decision);

    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toEqual([
      {
        code: "audit_export.unsafe_field",
        severity: "deny",
        explanation:
          "Security audit export requests must not contain raw secret, url, path, token, or credential fields.",
        fields: [
          "request.criteria.rawPath",
          "request.destination.path",
          "request.destination.rawSecret",
          "request.destination.token",
          "request.destination.url"
        ]
      }
    ]);
    expect(serialized).not.toContain("raw-url-token");
    expect(serialized).not.toContain("raw-token");
    expect(serialized).not.toContain("raw-secret");
    expect(serialized).not.toContain("criteria.json");
  });
});

describe("security audit export request lifecycle", () => {
  it("replays lifecycle events deterministically into project-scoped request state", () => {
    const decision = evaluateSecurityAuditExportPolicy(BASE_REQUEST, {
      enabled: true,
      allowedProjectIds: ["project-security-audit"],
      allowedActorIds: ["actor-security-admin"],
      maxRangeDays: 14
    });
    const requested = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-1",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T08:00:00.000Z",
      actorId: "actor-security-admin",
      request: BASE_REQUEST,
      reason: "operator requested token=raw-request-reason"
    });
    const evaluated = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-1",
      type: "audit_export.evaluated",
      occurredAt: "2026-05-30T08:00:01.000Z",
      actorId: "actor-security-admin",
      decision
    });
    const approved = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-1",
      type: "audit_export.approved",
      occurredAt: "2026-05-30T08:00:02.000Z",
      actorId: "actor-security-admin",
      decision,
      metadata: {
        mode: "placeholder",
        policyOnly: true
      }
    });

    const first = replaySecurityAuditExportLifecycleEvents([approved, requested, evaluated], {
      projectId: "project-security-audit"
    });
    const second = replaySecurityAuditExportLifecycleEvents([evaluated, approved, requested], {
      projectId: "project-security-audit"
    });
    const serialized = JSON.stringify(first);

    expect(first).toEqual(second);
    expect(first).toEqual(
      expect.objectContaining({
        projectId: "project-security-audit",
        totalRequests: 1,
        requestIds: ["export-request-1"],
        byStatus: {
          requested: 0,
          evaluated: 0,
          approved: 1,
          denied: 0,
          cancelled: 0,
          expired: 0
        },
        firstOccurredAt: "2026-05-30T08:00:00.000Z",
        lastOccurredAt: "2026-05-30T08:00:02.000Z"
      })
    );
    expect(first.requests[0]).toEqual(
      expect.objectContaining({
        requestId: "export-request-1",
        status: "approved",
        requestedAt: "2026-05-30T08:00:00.000Z",
        evaluatedAt: "2026-05-30T08:00:01.000Z",
        decidedAt: "2026-05-30T08:00:02.000Z",
        actorIds: ["actor-security-admin"]
      })
    );
    expect(first.requests[0]?.events.map((event) => event.status)).toEqual([
      "requested",
      "evaluated",
      "approved"
    ]);
    expect(serialized).not.toContain("raw-request-reason");
    expect(serialized).not.toContain("raw-note-secret");
    expect(serialized).not.toContain("raw-filter-token");
    expect(serialized).not.toContain("raw-session-secret");
  });

  it("keeps transitions immutable and rejects append replacement", () => {
    const requested = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-immutable",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T08:10:00.000Z",
      request: BASE_REQUEST
    });
    const duplicate = appendSecurityAuditExportLifecycleEvent([requested], requested);
    const rewritten = {
      ...requested,
      fingerprint: "different-fingerprint"
    } as SecurityAuditExportLifecycleEvent;

    expect(Object.isFrozen(requested)).toBe(true);
    expect(duplicate).toEqual([requested]);
    expect(() => appendSecurityAuditExportLifecycleEvent([requested], rewritten)).toThrow(
      "append-only"
    );
  });

  it("rejects illegal lifecycle transitions during replay", () => {
    const decision = evaluateSecurityAuditExportPolicy(BASE_REQUEST, { enabled: true });
    const requested = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-illegal",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T08:20:00.000Z",
      request: BASE_REQUEST
    });
    const approved = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-illegal",
      type: "audit_export.approved",
      occurredAt: "2026-05-30T08:20:01.000Z",
      decision
    });

    expect(() =>
      replaySecurityAuditExportLifecycleEvents([approved], {
        projectId: "project-security-audit"
      })
    ).toThrow("none -> approved");
    expect(() =>
      replaySecurityAuditExportLifecycleEvents([requested, approved], {
        projectId: "project-security-audit"
      })
    ).toThrow("requested -> approved");
  });

  it("isolates project scope and rejects scoped payload mismatches", () => {
    const projectA = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-project-a",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T08:30:00.000Z",
      request: BASE_REQUEST
    });
    const projectB = createSecurityAuditExportLifecycleEvent({
      projectId: "project-other",
      requestId: "export-request-project-b",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T08:30:01.000Z",
      request: {
        ...BASE_REQUEST,
        projectId: "project-other"
      }
    });
    const projection = replaySecurityAuditExportLifecycleEvents([projectB, projectA], {
      projectId: "project-security-audit"
    });

    expect(projection.requestIds).toEqual(["export-request-project-a"]);
    expect(() =>
      createSecurityAuditExportLifecycleEvent({
        projectId: "project-security-audit",
        requestId: "export-request-mismatch",
        type: "audit_export.requested",
        occurredAt: "2026-05-30T08:30:02.000Z",
        request: {
          ...BASE_REQUEST,
          projectId: "project-other"
        }
      })
    ).toThrow("request.projectId must match event projectId");
  });

  it("supports actor-scoped deterministic replay without leaking unrelated actor requests", () => {
    const adminDecision = evaluateSecurityAuditExportPolicy(BASE_REQUEST, {
      enabled: true,
      allowedProjectIds: ["project-security-audit"],
      allowedActorIds: ["actor-security-admin"]
    });
    const viewerRequest: SecurityAuditExportRequest = {
      ...BASE_REQUEST,
      actorId: "actor-security-viewer",
      criteria: {
        eventTypes: ["auth.access.denied"],
        note: "actor-scoped viewer request"
      }
    };
    const viewerDecision = evaluateSecurityAuditExportPolicy(viewerRequest, {
      enabled: true,
      allowedProjectIds: ["project-security-audit"],
      allowedActorIds: ["actor-security-viewer"]
    });
    const adminRequested = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-admin",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T08:35:00.000Z",
      actorId: "actor-security-admin",
      request: BASE_REQUEST
    });
    const adminEvaluated = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-admin",
      type: "audit_export.evaluated",
      occurredAt: "2026-05-30T08:35:01.000Z",
      actorId: "actor-security-admin",
      decision: adminDecision
    });
    const adminApproved = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-admin",
      type: "audit_export.approved",
      occurredAt: "2026-05-30T08:35:02.000Z",
      actorId: "actor-security-admin",
      decision: adminDecision,
      metadata: {
        mode: "policy-only"
      }
    });
    const viewerRequested = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-viewer",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T08:35:03.000Z",
      actorId: "actor-security-viewer",
      request: viewerRequest
    });
    const viewerEvaluated = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-viewer",
      type: "audit_export.evaluated",
      occurredAt: "2026-05-30T08:35:04.000Z",
      actorId: "actor-security-viewer",
      decision: viewerDecision
    });
    const viewerApproved = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-viewer",
      type: "audit_export.approved",
      occurredAt: "2026-05-30T08:35:05.000Z",
      actorId: "actor-security-viewer",
      decision: viewerDecision,
      metadata: {
        mode: "policy-only"
      }
    });
    const mixedStream = [
      viewerApproved,
      adminApproved,
      viewerRequested,
      adminRequested,
      viewerEvaluated,
      adminEvaluated,
      viewerApproved,
      adminApproved
    ];
    const adminProjection = replaySecurityAuditExportLifecycleEvents(mixedStream, {
      projectId: "project-security-audit",
      actorId: "actor-security-admin"
    });
    const adminProjectionAgain = replaySecurityAuditExportLifecycleEvents(
      [...mixedStream].reverse(),
      {
        projectId: "project-security-audit",
        actorId: "actor-security-admin"
      }
    );
    const projectProjection = replaySecurityAuditExportLifecycleEvents(mixedStream, {
      projectId: "project-security-audit"
    });
    const serializedActorProjection = JSON.stringify(adminProjection);

    expect(adminProjection).toEqual(adminProjectionAgain);
    expect(adminProjection).toEqual(
      expect.objectContaining({
        projectId: "project-security-audit",
        actorId: "actor-security-admin",
        totalRequests: 1,
        requestIds: ["export-request-admin"],
        byStatus: {
          requested: 0,
          evaluated: 0,
          approved: 1,
          denied: 0,
          cancelled: 0,
          expired: 0
        }
      })
    );
    expect(projectProjection.requestIds).toEqual(["export-request-admin", "export-request-viewer"]);
    expect(adminProjection.requests[0]?.actorIds).toEqual(["actor-security-admin"]);
    expect(serializedActorProjection).not.toContain("actor-security-viewer");
    expect(serializedActorProjection).not.toContain("export-request-viewer");
  });

  it("redacts criteria and reasons while rejecting unsafe request fields", () => {
    const event = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-redaction",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T08:40:00.000Z",
      request: BASE_REQUEST,
      reason: "Bearer raw-lifecycle-reason failed session=raw-reason-session"
    });
    const serialized = JSON.stringify(event);

    expect(event.reason).toBe("Bearer [redacted] failed session=[redacted]");
    expect(event.request?.criteria).toEqual({
      eventTypes: ["auth.login.failed", "auth.access.denied"],
      nested: {
        reason: "keep this visible",
        session: "[redacted]"
      },
      note: "Bearer [redacted] and token=[redacted]"
    });
    expect(serialized).not.toContain("raw-lifecycle-reason");
    expect(serialized).not.toContain("raw-reason-session");
    expect(serialized).not.toContain("raw-note-secret");

    expect(() =>
      createSecurityAuditExportLifecycleEvent({
        projectId: "project-security-audit",
        requestId: "export-request-unsafe",
        type: "audit_export.requested",
        occurredAt: "2026-05-30T08:40:01.000Z",
        request: {
          ...BASE_REQUEST,
          destination: {
            ...BASE_REQUEST.destination,
            url: "https://example.test/export?token=raw-url-token",
            path: "C:\\tmp\\audit-export.jsonl",
            token: "raw-token"
          }
        } as unknown as SecurityAuditExportRequest
      })
    ).toThrow("request.destination.path");

    const decisionWithUnsafeRuntimeFields = {
      ...evaluateSecurityAuditExportPolicy(BASE_REQUEST, { enabled: true }),
      request: {
        ...evaluateSecurityAuditExportPolicy(BASE_REQUEST, { enabled: true }).request,
        destination: {
          ...BASE_REQUEST.destination,
          signedUrl: "https://example.test/export?token=raw-decision-token"
        }
      }
    };
    expect(() =>
      createSecurityAuditExportLifecycleEvent({
        projectId: "project-security-audit",
        requestId: "export-request-unsafe-decision",
        type: "audit_export.evaluated",
        occurredAt: "2026-05-30T08:40:02.000Z",
        decision: decisionWithUnsafeRuntimeFields
      })
    ).toThrow("decision.request.destination.signedUrl");
  });

  it("keeps lifecycle metadata provider-neutral and free of execution claims", () => {
    const neutral = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-neutral",
      type: "audit_export.cancelled",
      occurredAt: "2026-05-30T08:50:00.000Z",
      reason: "cancelled before placeholder handoff",
      metadata: {
        mode: "placeholder",
        policyOnly: true
      }
    });

    expect(neutral.metadata).toEqual({
      mode: "placeholder",
      policyOnly: true
    });
    expect(() =>
      createSecurityAuditExportLifecycleEvent({
        projectId: "project-security-audit",
        requestId: "export-request-provider-claim",
        type: "audit_export.cancelled",
        occurredAt: "2026-05-30T08:50:01.000Z",
        metadata: {
          providerName: "s3",
          executionId: "job-123",
          jobUrl: "https://ci.example.test/job/123"
        } as NonNullable<SecurityAuditExportLifecycleEvent["metadata"]>
      })
    ).toThrow("metadata.executionId");
  });

  it("rejects provider and execution claims when replaying forged persisted events", () => {
    const requested = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-forged-provider-claim",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T08:55:00.000Z",
      actorId: "actor-security-admin",
      request: BASE_REQUEST
    });
    const forged = {
      ...requested,
      metadata: {
        mode: "policy-only",
        providerName: "object-store",
        executionId: "export-execution-1"
      }
    } as SecurityAuditExportLifecycleEvent;

    expect(() =>
      replaySecurityAuditExportLifecycleEvents([forged], {
        projectId: "project-security-audit"
      })
    ).toThrow("metadata.executionId");
  });

  it("models denied terminal decisions without provider execution claims", () => {
    const deniedDecision = evaluateSecurityAuditExportPolicy(BASE_REQUEST, {
      enabled: true,
      allowedProjectIds: ["different-project"]
    });
    const requested = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-denied",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T09:00:00.000Z",
      request: BASE_REQUEST
    });
    const evaluated = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-denied",
      type: "audit_export.evaluated",
      occurredAt: "2026-05-30T09:00:01.000Z",
      decision: deniedDecision
    });
    const denied = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-denied",
      type: "audit_export.denied",
      occurredAt: "2026-05-30T09:00:02.000Z",
      decision: deniedDecision,
      metadata: {
        mode: "policy-only"
      }
    });
    const projection = replaySecurityAuditExportLifecycleEvents([denied, evaluated, requested], {
      projectId: "project-security-audit"
    });
    const serialized = JSON.stringify(projection);

    expect(projection.byStatus.denied).toBe(1);
    expect(projection.requests[0]?.status).toBe("denied");
    expect(projection.requests[0]?.reasons.map((reason) => reason.code)).toEqual([
      "audit_export.project_scope_denied"
    ]);
    expect(serialized).not.toMatch(/provider|execution|executed|jobUrl/i);
  });

  it("preserves replay invariants for mixed hostile synthetic lifecycle streams", () => {
    const adminDecision = evaluateSecurityAuditExportPolicy(BASE_REQUEST, {
      enabled: true,
      allowedProjectIds: ["project-security-audit"],
      allowedActorIds: ["actor-security-admin"],
      maxRangeDays: 14
    });
    const deniedRequest: SecurityAuditExportRequest = {
      ...BASE_REQUEST,
      actorId: "actor-security-admin",
      criteria: {
        eventTypes: ["auth.token.revoked"],
        note: "Synthetic denied marker token=raw-denied-note-token",
        nested: {
          body: "raw-denied-body-marker"
        }
      }
    };
    const deniedDecision = evaluateSecurityAuditExportPolicy(deniedRequest, {
      enabled: true,
      allowedProjectIds: ["project-shadow"],
      allowedActorIds: ["actor-security-admin"]
    });
    const viewerRequest: SecurityAuditExportRequest = {
      ...BASE_REQUEST,
      actorId: "actor-security-viewer",
      criteria: {
        note: "viewer synthetic token=raw-viewer-token"
      }
    };
    const viewerDecision = evaluateSecurityAuditExportPolicy(viewerRequest, {
      enabled: true,
      allowedProjectIds: ["project-security-audit"],
      allowedActorIds: ["actor-security-viewer"]
    });
    const otherProjectRequest: SecurityAuditExportRequest = {
      ...BASE_REQUEST,
      projectId: "project-shadow",
      actorId: "actor-shadow",
      criteria: {
        note: "shadow synthetic token=raw-shadow-token"
      }
    };
    const otherProjectDecision = evaluateSecurityAuditExportPolicy(otherProjectRequest, {
      enabled: true,
      allowedProjectIds: ["project-shadow"],
      allowedActorIds: ["actor-shadow"]
    });
    const adminRequested = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-invariant-admin",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T10:00:00.000Z",
      actorId: "actor-security-admin",
      request: BASE_REQUEST,
      reason:
        "Synthetic admin request token=raw-admin-reason-token at C:\\synthetic\\audit\\raw.json"
    });
    const adminEvaluated = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-invariant-admin",
      type: "audit_export.evaluated",
      occurredAt: "2026-05-30T10:00:01.000Z",
      actorId: "actor-security-admin",
      decision: adminDecision
    });
    const adminApproved = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-invariant-admin",
      type: "audit_export.approved",
      occurredAt: "2026-05-30T10:00:02.000Z",
      actorId: "actor-security-admin",
      decision: adminDecision,
      metadata: {
        mode: "policy-only",
        policyOnly: true
      }
    });
    const deniedRequested = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-invariant-denied",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T10:00:03.000Z",
      actorId: "actor-security-admin",
      request: deniedRequest,
      reason: "Synthetic denied request token=raw-denied-reason-token"
    });
    const deniedEvaluated = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-invariant-denied",
      type: "audit_export.evaluated",
      occurredAt: "2026-05-30T10:00:04.000Z",
      actorId: "actor-security-admin",
      decision: deniedDecision
    });
    const denied = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-invariant-denied",
      type: "audit_export.denied",
      occurredAt: "2026-05-30T10:00:05.000Z",
      actorId: "actor-security-admin",
      decision: deniedDecision,
      metadata: {
        mode: "policy-only"
      }
    });
    const viewerRequested = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-invariant-viewer",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T10:00:06.000Z",
      actorId: "actor-security-viewer",
      request: viewerRequest
    });
    const viewerEvaluated = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-invariant-viewer",
      type: "audit_export.evaluated",
      occurredAt: "2026-05-30T10:00:07.000Z",
      actorId: "actor-security-viewer",
      decision: viewerDecision
    });
    const viewerApproved = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-invariant-viewer",
      type: "audit_export.approved",
      occurredAt: "2026-05-30T10:00:08.000Z",
      actorId: "actor-security-viewer",
      decision: viewerDecision,
      metadata: {
        mode: "policy-only"
      }
    });
    const shadowRequested = createSecurityAuditExportLifecycleEvent({
      projectId: "project-shadow",
      requestId: "export-request-invariant-shadow",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T10:00:09.000Z",
      actorId: "actor-shadow",
      request: otherProjectRequest
    });
    const shadowEvaluated = createSecurityAuditExportLifecycleEvent({
      projectId: "project-shadow",
      requestId: "export-request-invariant-shadow",
      type: "audit_export.evaluated",
      occurredAt: "2026-05-30T10:00:10.000Z",
      actorId: "actor-shadow",
      decision: otherProjectDecision
    });
    const shadowApproved = createSecurityAuditExportLifecycleEvent({
      projectId: "project-shadow",
      requestId: "export-request-invariant-shadow",
      type: "audit_export.approved",
      occurredAt: "2026-05-30T10:00:11.000Z",
      actorId: "actor-shadow",
      decision: otherProjectDecision,
      metadata: {
        mode: "policy-only"
      }
    });
    const stream = [
      viewerApproved,
      adminApproved,
      shadowApproved,
      denied,
      viewerRequested,
      adminRequested,
      shadowRequested,
      deniedRequested,
      viewerEvaluated,
      adminEvaluated,
      shadowEvaluated,
      deniedEvaluated,
      adminApproved,
      denied
    ];

    const actorProjection = replaySecurityAuditExportLifecycleEvents(stream, {
      projectId: "project-security-audit",
      actorId: "actor-security-admin"
    });
    const actorProjectionFromReverse = replaySecurityAuditExportLifecycleEvents(
      [...stream].reverse(),
      {
        projectId: "project-security-audit",
        actorId: "actor-security-admin"
      }
    );
    const recomputed = replaySecurityAuditExportLifecycleEvents(actorProjection.events, {
      projectId: "project-security-audit",
      actorId: "actor-security-admin"
    });
    const projectProjection = replaySecurityAuditExportLifecycleEvents(stream, {
      projectId: "project-security-audit"
    });
    const serializedActorProjection = JSON.stringify(actorProjection);
    const projectedEventIds = actorProjection.events.map((event) => event.id);

    expect(actorProjection).toEqual(actorProjectionFromReverse);
    expect(actorProjection).toEqual(recomputed);
    expect(new Set(projectedEventIds).size).toBe(projectedEventIds.length);
    expect(actorProjection).toEqual(
      expect.objectContaining({
        projectId: "project-security-audit",
        actorId: "actor-security-admin",
        totalRequests: 2,
        requestIds: ["export-request-invariant-admin", "export-request-invariant-denied"],
        byStatus: {
          requested: 0,
          evaluated: 0,
          approved: 1,
          denied: 1,
          cancelled: 0,
          expired: 0
        }
      })
    );
    expect(projectProjection.requestIds).toEqual([
      "export-request-invariant-admin",
      "export-request-invariant-denied",
      "export-request-invariant-viewer"
    ]);
    expect(
      actorProjection.events.every((event) => event.projectId === "project-security-audit")
    ).toBe(true);
    expect(actorProjection.events.every((event) => event.actorId === "actor-security-admin")).toBe(
      true
    );
    expect(
      actorProjection.requests.every((request) => request.projectId === "project-security-audit")
    ).toBe(true);
    expect(actorProjection.requests.flatMap((request) => request.actorIds)).toEqual([
      "actor-security-admin",
      "actor-security-admin"
    ]);
    expect(serializedActorProjection).not.toContain("actor-security-viewer");
    expect(serializedActorProjection).not.toContain("export-request-invariant-viewer");
    expect(serializedActorProjection).not.toContain("project-shadow");
    expect(serializedActorProjection).not.toContain("actor-shadow");
    expect(serializedActorProjection).not.toContain("export-request-invariant-shadow");
    for (const marker of [
      "raw-admin-reason-token",
      "raw-denied-note-token",
      "raw-denied-body-marker",
      "raw-denied-reason-token",
      "raw-viewer-token",
      "raw-shadow-token",
      "C:\\synthetic\\audit\\raw.json"
    ]) {
      expect(serializedActorProjection).not.toContain(marker);
    }
    expect(serializedActorProjection).not.toMatch(
      /\b(s3|gcs|azure|providerEndpoint|signedUrl|execution|executed|jobUrl|rawPayload|requestBody)\b/i
    );
  });

  it("rejects forged persisted lifecycle payloads with provider endpoints and raw secrets", () => {
    const requested = createSecurityAuditExportLifecycleEvent({
      projectId: "project-security-audit",
      requestId: "export-request-forged-invariant",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T10:10:00.000Z",
      actorId: "actor-security-admin",
      request: BASE_REQUEST
    });
    const forgedMetadata = {
      ...requested,
      metadata: {
        mode: "policy-only",
        providerEndpoint: "https://object-store.example.invalid/export",
        signedUrl: "https://object-store.example.invalid/export?token=raw-forged-signed-token",
        requestBody: "raw-forged-body-marker",
        token: "raw-forged-token"
      }
    } as SecurityAuditExportLifecycleEvent;
    const forgedRequest = {
      ...requested,
      request: {
        ...requested.request,
        destination: {
          type: "placeholder",
          secretRef: "audit-export-placeholder-ref",
          signedUrl: "https://example.invalid/export?token=raw-forged-request-token"
        }
      }
    } as SecurityAuditExportLifecycleEvent;
    const forgedDecision = {
      ...requested,
      type: "audit_export.evaluated",
      status: "evaluated",
      decision: {
        ...evaluateSecurityAuditExportPolicy(BASE_REQUEST, { enabled: true }),
        request: {
          ...evaluateSecurityAuditExportPolicy(BASE_REQUEST, { enabled: true }).request,
          criteria: {
            rawPayload: "raw-forged-decision-payload",
            token: "raw-forged-decision-token"
          }
        }
      }
    } as SecurityAuditExportLifecycleEvent;

    expect(() =>
      replaySecurityAuditExportLifecycleEvents([forgedMetadata], {
        projectId: "project-security-audit"
      })
    ).toThrow("metadata.providerEndpoint");
    expect(() =>
      replaySecurityAuditExportLifecycleEvents([forgedRequest], {
        projectId: "project-security-audit"
      })
    ).toThrow("request.destination.signedUrl");
    expect(() =>
      replaySecurityAuditExportLifecycleEvents([requested, forgedDecision], {
        projectId: "project-security-audit"
      })
    ).toThrow(/decision\.request\.criteria\.(rawPayload|token)/);
  });
});
