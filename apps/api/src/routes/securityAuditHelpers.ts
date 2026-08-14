import {
  createSecurityAuditExportLifecycleEvent,
  createSecurityAuditEvent,
  evaluateSecurityAuditExportPolicy,
  type SecurityAuditExportLifecycleEvent,
  type SecurityAuditExportLifecycleRequestRecord,
  type SecurityAuditExportRequest,
  type SecurityAuditEvent
} from "@testhistory/domain";
import { createHash } from "node:crypto";

type SecurityAuditQueryShape = {
  limit?: number | string;
  cursor?: string;
};

const defaultAuditLimit = 100;
const maxAuditLimit = 500;

export type AuditPage = {
  limit: number;
  cursor: string | null;
  offset: number;
  returned: number;
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export function parseAuditPagination(
  query: SecurityAuditQueryShape
): { limit: number; offset: number } | string {
  const limit = query.limit === undefined ? defaultAuditLimit : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxAuditLimit) {
    return `limit must be an integer between 1 and ${maxAuditLimit}`;
  }

  const offset = query.cursor === undefined ? 0 : Number(query.cursor);
  if (!Number.isInteger(offset) || offset < 0) {
    return "cursor must be a non-negative integer offset";
  }

  return { limit, offset };
}

export function paginateAudit(items: readonly unknown[], limit: number, offset: number): AuditPage {
  const returned = items.slice(offset, offset + limit).length;
  const nextOffset = offset + returned;
  const hasMore = nextOffset < items.length;
  return {
    limit,
    cursor: offset === 0 ? null : String(offset),
    offset,
    returned,
    total: items.length,
    nextCursor: hasMore ? String(nextOffset) : null,
    hasMore
  };
}

export function toSecurityAuditExportLifecycleReplayItem(
  record: SecurityAuditExportLifecycleRequestRecord
) {
  const lastEvent = record.events[record.events.length - 1];
  const decisionStatus = record.decision?.status;
  return {
    requestId: record.requestId,
    status: record.status,
    eventCount: record.events.length,
    ...(lastEvent?.occurredAt !== undefined ? { lastEventAt: lastEvent.occurredAt } : {}),
    actorIds: record.actorIds,
    ...(decisionStatus !== undefined ? { decisionStatus } : {}),
    reasonCodes: record.reasons.map((reason) => reason.code),
    timeline: {
      ...(record.requestedAt !== undefined ? { requestedAt: record.requestedAt } : {}),
      ...(record.evaluatedAt !== undefined ? { evaluatedAt: record.evaluatedAt } : {}),
      ...(record.decidedAt !== undefined ? { decidedAt: record.decidedAt } : {}),
      ...(record.cancelledAt !== undefined ? { cancelledAt: record.cancelledAt } : {}),
      ...(record.expiredAt !== undefined ? { expiredAt: record.expiredAt } : {})
    }
  };
}

export function buildSecurityAuditExportLifecycleMaterializedRecord(input: {
  projectId: string;
  actorId: string;
  materializedAt: string;
  record: SecurityAuditExportLifecycleRequestRecord;
}) {
  const replayItem = toSecurityAuditExportLifecycleReplayItem(input.record);
  const evidenceDigest = digestLifecycleReplay({
    projectId: input.projectId,
    actorId: input.actorId,
    requestId: input.record.requestId,
    status: input.record.status,
    eventCount: input.record.events.length,
    actorIds: input.record.actorIds,
    reasonCodes: input.record.reasons.map((reason) => reason.code)
  });
  const materializedRef = digestLifecycleReplay({
    scope: "security-audit-export-lifecycle-materialized-record",
    projectId: input.projectId,
    actorId: input.actorId,
    requestId: input.record.requestId,
    evidenceDigest
  });

  return {
    kind: "security-audit-export-lifecycle-replay-invariant-materialized-record",
    materializedRef: `security-audit-export-lifecycle-replay-invariant:${materializedRef.slice(
      0,
      24
    )}`,
    projectId: input.projectId,
    actor: {
      id: input.actorId,
      scoped: true
    },
    requestId: input.record.requestId,
    status: replayItem.status,
    eventCount: replayItem.eventCount,
    ...(replayItem.lastEventAt !== undefined ? { lastEventAt: replayItem.lastEventAt } : {}),
    actorIds: replayItem.actorIds,
    ...(replayItem.decisionStatus !== undefined
      ? { decisionStatus: replayItem.decisionStatus }
      : {}),
    reasonCodes: replayItem.reasonCodes,
    timeline: replayItem.timeline,
    materializedAt: input.materializedAt,
    evidenceDigest,
    redaction: {
      rawLifecycleEventsIncluded: false,
      rawRequestsIncluded: false,
      destinationRefsIncluded: false,
      providerEndpointsIncluded: false,
      signedUrlsIncluded: false,
      credentialsIncluded: false,
      tokensIncluded: false,
      redacted: true
    },
    execution: {
      exportStarted: false,
      providerExecution: false,
      providerIntegration: false,
      providerEndpointContacted: false,
      credentialsResolved: false,
      signedUrlsIssued: false,
      destinationResolved: false,
      mutation: false
    },
    providerNeutral: true,
    redacted: true
  };
}

export function buildSecurityAuditExportLifecycleMaterializedDigest(
  records: Array<ReturnType<typeof buildSecurityAuditExportLifecycleMaterializedRecord>>
): string {
  return digestLifecycleReplay({
    scope: "security-audit-export-lifecycle-replay-invariant-materialized-read",
    records: records.map((record) => ({
      materializedRef: record.materializedRef,
      projectId: record.projectId,
      actorId: record.actor.id,
      requestId: record.requestId,
      materializedAt: record.materializedAt,
      evidenceDigest: record.evidenceDigest
    }))
  });
}

export function digestLifecycleReplay(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function buildSyntheticSecurityAuditExportLifecycleEvents(
  projectId: string
): SecurityAuditExportLifecycleEvent[] {
  const approvedRequest: SecurityAuditExportRequest = {
    projectId,
    actorId: "security-audit-actor",
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
      note: "Bearer raw-lifecycle-token token=raw-export-filter-token",
      nested: {
        reason: "policy replay fixture",
        session: "raw-lifecycle-session-secret"
      }
    }
  };
  const deniedRequest: SecurityAuditExportRequest = {
    ...approvedRequest,
    actorId: "security-audit-actor",
    requestedAt: "2026-05-30T09:00:00.000Z",
    range: {
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-06-10T00:00:00.000Z"
    },
    criteria: {
      eventTypes: ["auth.access.denied"],
      note: "denied request referenced C:\\Users\\tester\\Downloads\\audit-export.jsonl and https://storage.example/export?X-Amz-Signature=raw-signature",
      nested: {
        reason: "token=raw-denied-lifecycle-token"
      }
    }
  };
  const otherActorRequest: SecurityAuditExportRequest = {
    ...approvedRequest,
    actorId: "security-audit-other-actor",
    requestedAt: "2026-05-30T10:00:00.000Z",
    criteria: {
      eventTypes: ["auth.token.revoked"],
      note: "other actor lifecycle fixture"
    }
  };
  const approvedDecision = evaluateSecurityAuditExportPolicy(approvedRequest, {
    enabled: true,
    allowedProjectIds: [projectId],
    allowedActorIds: ["security-audit-actor"],
    maxRangeDays: 14
  });
  const deniedDecision = evaluateSecurityAuditExportPolicy(deniedRequest, {
    enabled: true,
    allowedProjectIds: [projectId],
    allowedActorIds: ["security-audit-actor"],
    maxRangeDays: 14
  });
  const otherActorDecision = evaluateSecurityAuditExportPolicy(otherActorRequest, {
    enabled: true,
    allowedProjectIds: [projectId],
    allowedActorIds: ["security-audit-other-actor"],
    maxRangeDays: 14
  });

  return [
    createSecurityAuditExportLifecycleEvent({
      projectId,
      requestId: "audit-export-lifecycle-approved",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T08:00:00.000Z",
      actorId: "security-audit-actor",
      request: approvedRequest,
      reason: "requested by actor with token=raw-request-reason-token"
    }),
    createSecurityAuditExportLifecycleEvent({
      projectId,
      requestId: "audit-export-lifecycle-approved",
      type: "audit_export.evaluated",
      occurredAt: "2026-05-30T08:00:01.000Z",
      actorId: "security-audit-actor",
      decision: approvedDecision
    }),
    createSecurityAuditExportLifecycleEvent({
      projectId,
      requestId: "audit-export-lifecycle-approved",
      type: "audit_export.approved",
      occurredAt: "2026-05-30T08:00:02.000Z",
      actorId: "security-audit-actor",
      decision: approvedDecision,
      metadata: {
        mode: "policy-only",
        replayOnly: true
      }
    }),
    createSecurityAuditExportLifecycleEvent({
      projectId,
      requestId: "audit-export-lifecycle-denied",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T09:00:00.000Z",
      actorId: "security-audit-actor",
      request: deniedRequest
    }),
    createSecurityAuditExportLifecycleEvent({
      projectId,
      requestId: "audit-export-lifecycle-denied",
      type: "audit_export.evaluated",
      occurredAt: "2026-05-30T09:00:01.000Z",
      actorId: "security-audit-actor",
      decision: deniedDecision
    }),
    createSecurityAuditExportLifecycleEvent({
      projectId,
      requestId: "audit-export-lifecycle-denied",
      type: "audit_export.denied",
      occurredAt: "2026-05-30T09:00:02.000Z",
      actorId: "security-audit-actor",
      decision: deniedDecision,
      metadata: {
        mode: "policy-only"
      }
    }),
    createSecurityAuditExportLifecycleEvent({
      projectId,
      requestId: "audit-export-lifecycle-other-actor",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T10:00:00.000Z",
      actorId: "security-audit-other-actor",
      request: otherActorRequest
    }),
    createSecurityAuditExportLifecycleEvent({
      projectId,
      requestId: "audit-export-lifecycle-other-actor",
      type: "audit_export.evaluated",
      occurredAt: "2026-05-30T10:00:01.000Z",
      actorId: "security-audit-other-actor",
      decision: otherActorDecision
    }),
    createSecurityAuditExportLifecycleEvent({
      projectId,
      requestId: "audit-export-lifecycle-other-actor",
      type: "audit_export.approved",
      occurredAt: "2026-05-30T10:00:02.000Z",
      actorId: "security-audit-other-actor",
      decision: otherActorDecision,
      metadata: {
        mode: "policy-only"
      }
    }),
    createSecurityAuditExportLifecycleEvent({
      projectId: `${projectId}-other`,
      requestId: "audit-export-lifecycle-cross-project",
      type: "audit_export.requested",
      occurredAt: "2026-05-30T11:00:00.000Z",
      actorId: "security-audit-actor",
      request: {
        ...approvedRequest,
        projectId: `${projectId}-other`
      }
    })
  ];
}

export function buildSyntheticSecurityAuditEvents(projectId: string): SecurityAuditEvent[] {
  return [
    createSecurityAuditEvent({
      projectId,
      type: "auth.login.succeeded",
      outcome: "allowed",
      occurredAt: "2026-05-30T09:00:00.000Z",
      actor: { type: "actor", actorId: "qa-lead", displayName: "QA Lead" },
      resource: { type: "project", id: projectId, name: "Project workspace" },
      request: {
        requestId: "req-audit-1",
        method: "POST",
        route: "/api/v1/auth/login",
        ipAddress: "192.0.2.10",
        userAgent: "TestHistory synthetic"
      },
      reason: "Synthetic successful login event",
      metadata: { provider: "oidc", token: "redact-me-audit-token" }
    }),
    createSecurityAuditEvent({
      projectId,
      type: "auth.access.denied",
      outcome: "denied",
      severity: "warn",
      occurredAt: "2026-05-30T09:05:00.000Z",
      actor: { type: "anonymous", externalId: "anonymous-web" },
      resource: { type: "launch", id: "launch-denied" },
      request: {
        requestId: "req-audit-2",
        method: "GET",
        route: "/api/v1/launches/launch-denied",
        ipAddress: "192.0.2.11",
        userAgent: "TestHistory synthetic"
      },
      reason: "Missing project membership",
      metadata: {
        authorization: "Bearer redact-me-audit-header",
        attemptedScope: "launches:read",
        payload: "{ hidden body }"
      }
    }),
    createSecurityAuditEvent({
      projectId,
      type: "auth.token.revoked",
      outcome: "allowed",
      occurredAt: "2026-05-30T09:10:00.000Z",
      actor: { type: "service", serviceId: "security-audit-worker" },
      resource: { type: "token", id: "api-token-1" },
      reason: "Synthetic expired token cleanup",
      metadata: { storageKey: "redact-me-storage", revoked: true }
    }),
    createSecurityAuditEvent({
      projectId: `${projectId}-other`,
      type: "auth.login.failed",
      outcome: "failed",
      occurredAt: "2026-05-30T09:15:00.000Z",
      actor: { type: "anonymous", externalId: "other-project" },
      reason: "Cross-project fixture that must never be returned"
    })
  ];
}
