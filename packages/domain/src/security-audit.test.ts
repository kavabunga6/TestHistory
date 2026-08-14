import { describe, expect, it } from "vitest";
import {
  appendSecurityAuditEvent,
  createSecurityAuditEvent,
  replaySecurityAuditEvents,
  type SecurityAuditEvent
} from "./index.js";

describe("security audit events", () => {
  it("creates immutable project-scoped events with recursive redaction", () => {
    const event = createSecurityAuditEvent({
      projectId: "00000000-0000-4000-8000-000000000501",
      type: "auth.access.denied",
      outcome: "denied",
      occurredAt: "2026-05-30T10:00:00.000Z",
      actor: {
        type: "actor",
        actorId: "qa-user token=raw-actor-secret",
        displayName: "QA lead password=raw-display-secret"
      },
      resource: {
        type: "artifact",
        id: "artifact-storageKey=raw-resource-secret",
        name: "screenshot from C:\\tmp\\raw-path-secret\\screen.png"
      },
      request: {
        requestId: "request-1",
        traceId: "trace secret=raw-trace-secret",
        ipAddress: "192.0.2.10",
        userAgent: "synthetic-agent session=raw-user-agent-secret",
        method: "GET",
        route: "/api/v1/artifacts/download?token=raw-query-secret"
      },
      reason: "Bearer raw-reason-secret was rejected",
      metadata: {
        authorization: "Bearer raw-header-secret",
        visible: "kept value",
        nested: {
          cookie: "session=raw-cookie-secret",
          url: "https://user:pass@example.test/private?token=raw-url-secret",
          path: "C:\\tmp\\raw-metadata-secret\\artifact.txt"
        }
      }
    });
    const serialized = JSON.stringify(event);

    expect(event).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        id: expect.stringMatching(/^security-audit:/),
        fingerprint: expect.any(String),
        projectId: "00000000-0000-4000-8000-000000000501",
        type: "auth.access.denied",
        outcome: "denied",
        severity: "warn",
        actor: {
          type: "actor",
          actorId: "qa-user token=[redacted]",
          displayName: "QA lead password=[redacted]"
        }
      })
    );
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.metadata)).toBe(true);
    expect(() => {
      (event as { reason: string }).reason = "changed";
    }).toThrow();
    expect(serialized).not.toContain("raw-actor-secret");
    expect(serialized).not.toContain("raw-display-secret");
    expect(serialized).not.toContain("raw-resource-secret");
    expect(serialized).not.toContain("raw-path-secret");
    expect(serialized).not.toContain("raw-trace-secret");
    expect(serialized).not.toContain("raw-user-agent-secret");
    expect(serialized).not.toContain("raw-query-secret");
    expect(serialized).not.toContain("raw-reason-secret");
    expect(serialized).not.toContain("raw-header-secret");
    expect(serialized).not.toContain("raw-cookie-secret");
    expect(serialized).not.toContain("raw-url-secret");
    expect(serialized).not.toContain("raw-metadata-secret");
    expect(serialized).toContain("https://example.test/private");
    expect(serialized).toContain("[path]");
  });

  it("keeps append-only streams idempotent but rejects replacement attempts", () => {
    const event = createSecurityAuditEvent({
      projectId: "project-audit-append",
      type: "auth.token.revoked",
      outcome: "allowed",
      occurredAt: "2026-05-30T11:00:00.000Z",
      actor: { type: "system", systemId: "session-cleanup" },
      resource: { type: "token", id: "token-1" },
      reason: "Synthetic session cleanup"
    });
    const stream = appendSecurityAuditEvent([], event);
    const retried = appendSecurityAuditEvent(stream, event);
    const forgedReplacement = {
      ...event,
      fingerprint: "different-fingerprint",
      reason: "Attempt to rewrite immutable audit history"
    } as SecurityAuditEvent;

    expect(stream).toEqual([event]);
    expect(retried).toEqual(stream);
    expect(() => appendSecurityAuditEvent(stream, forgedReplacement)).toThrow(
      "append-only and cannot be replaced"
    );
  });

  it("replays project-scoped projections deterministically and redacts persisted payloads", () => {
    const first = createSecurityAuditEvent({
      projectId: "project-audit-replay",
      type: "auth.login.succeeded",
      outcome: "allowed",
      occurredAt: "2026-05-30T09:00:00.000Z",
      actor: { type: "actor", actorId: "qa-user" },
      resource: { type: "project", id: "project-audit-replay" },
      metadata: { provider: "oidc" }
    });
    const second = createSecurityAuditEvent({
      projectId: "project-audit-replay",
      type: "auth.access.denied",
      outcome: "denied",
      severity: "critical",
      occurredAt: "2026-05-30T09:05:00.000Z",
      actor: { type: "service", serviceId: "mcp-gateway" },
      resource: { type: "launch", id: "launch token=raw-launch-secret" },
      reason: "Scope mismatch token=raw-replay-reason",
      metadata: { payload: "raw-persisted-body-secret" }
    });
    const otherProject = createSecurityAuditEvent({
      projectId: "project-other",
      type: "auth.login.failed",
      outcome: "failed",
      occurredAt: "2026-05-30T08:00:00.000Z",
      actor: { type: "anonymous", externalId: "ip-192-0-2-11" },
      reason: "Wrong password=raw-other-secret"
    });
    const replayed = replaySecurityAuditEvents([second, otherProject, first], {
      projectId: "project-audit-replay"
    });
    const replayedAgain = replaySecurityAuditEvents([first, second, otherProject], {
      projectId: "project-audit-replay"
    });
    const serialized = JSON.stringify(replayed);

    expect(replayed).toEqual(replayedAgain);
    expect(replayed).toEqual(
      expect.objectContaining({
        projectId: "project-audit-replay",
        total: 2,
        allowed: 1,
        denied: 1,
        failed: 0,
        firstOccurredAt: "2026-05-30T09:00:00.000Z",
        lastOccurredAt: "2026-05-30T09:05:00.000Z",
        actorIds: ["actor:qa-user", "service:mcp-gateway"],
        resourceIds: ["launch:launch token=[redacted]", "project:project-audit-replay"]
      })
    );
    expect(replayed.byType["auth.login.succeeded"]).toBe(1);
    expect(replayed.byType["auth.access.denied"]).toBe(1);
    expect(replayed.bySeverity.critical).toBe(1);
    expect(replayed.events.map((event) => event.id)).toEqual([first.id, second.id]);
    expect(serialized).not.toContain("project-other");
    expect(serialized).not.toContain("raw-launch-secret");
    expect(serialized).not.toContain("raw-replay-reason");
    expect(serialized).not.toContain("raw-persisted-body-secret");
    expect(serialized).not.toContain("raw-other-secret");
  });
});
