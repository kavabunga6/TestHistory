import {
  evaluateSecurityAuditExportPolicy,
  replaySecurityAuditExportLifecycleEvents,
  replaySecurityAuditEvents,
  type SecurityAuditExportPolicy,
  type SecurityAuditExportRequest,
  type SecurityAuditEventType,
  type SecurityAuditOutcome,
  type SecurityAuditSeverity
} from "@testhistory/domain";
import type { FastifyInstance } from "fastify";
import type { AppStore } from "../store.js";
import {
  authorizeSecurityAuditExportEvaluation,
  authorizeSecurityAuditExportLifecycleMaterializedRead,
  authorizeSecurityAuditExportLifecycleReplay,
  authorizeSecurityAuditRead
} from "./securityAuditAuth.js";
import {
  buildSecurityAuditExportLifecycleMaterializedDigest,
  buildSecurityAuditExportLifecycleMaterializedRecord,
  buildSyntheticSecurityAuditEvents,
  buildSyntheticSecurityAuditExportLifecycleEvents,
  digestLifecycleReplay,
  paginateAudit,
  parseAuditPagination,
  toSecurityAuditExportLifecycleReplayItem
} from "./securityAuditHelpers.js";

type SecurityAuditQuery = {
  projectId?: string;
  type?: SecurityAuditEventType;
  outcome?: SecurityAuditOutcome;
  severity?: SecurityAuditSeverity;
  limit?: number | string;
  cursor?: string;
};

type SecurityAuditExportLifecycleReplayQuery = {
  actorId?: string;
  limit?: number | string;
  cursor?: string;
};

type SecurityAuditExportLifecycleReplayParams = {
  projectId: string;
};

type SecurityAuditExportEvaluationBody = {
  request: SecurityAuditExportRequest;
  policy?: SecurityAuditExportPolicy;
};

const securityAuditReadScope = "security:audit:read";
const maxAuditLimit = 500;

export async function registerSecurityAuditRoutes(app: FastifyInstance, store: AppStore) {
  app.get<{ Querystring: SecurityAuditQuery }>(
    "/api/v1/security/audit",
    {
      schema: {
        tags: ["security"],
        querystring: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string" },
            type: {
              type: "string",
              enum: [
                "auth.login.succeeded",
                "auth.login.failed",
                "auth.logout",
                "auth.access.denied",
                "auth.role.changed",
                "auth.token.created",
                "auth.token.revoked",
                "auth.session.revoked",
                "auth.probe.accepted",
                "auth.probe.denied",
                "defect.mute.created",
                "defect.mute.removed",
                "defect.link.removed",
                "defect.deleted",
                "test-plan.created",
                "test-plan.updated",
                "test-plan.archived",
                "automation-job.created",
                "automation-job.updated",
                "ci-integration.created",
                "ci-webhook.accepted",
                "ci-webhook.denied",
                "notification-integration.created",
                "notification-integration.updated",
                "notification-integration.deleted",
                "issue-tracker-integration.created",
                "issue-tracker-integration.updated",
                "issue-tracker-integration.deleted",
                "integration-delivery.queued",
                "integration-delivery.delivered",
                "integration-delivery.failed"
              ]
            },
            outcome: { type: "string", enum: ["allowed", "denied", "failed"] },
            severity: { type: "string", enum: ["info", "warn", "critical"] },
            limit: { type: "integer", minimum: 1, maximum: maxAuditLimit },
            cursor: { type: "string" }
          }
        },
        response: {
          200: {
            type: "object",
            additionalProperties: true
          },
          400: {
            type: "object",
            additionalProperties: true
          },
          403: {
            type: "object",
            additionalProperties: true
          }
        }
      }
    },
    async (request, reply) => {
      const projectId = request.query.projectId?.trim();
      if (projectId === undefined || projectId.length === 0) {
        return reply.code(400).send({ message: "projectId is required" });
      }
      const project = store.projects.get(projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const denial = authorizeSecurityAuditRead(request, project);
      if (denial !== undefined) {
        return reply.code(403).send(denial);
      }

      const pagination = parseAuditPagination(request.query);
      if (typeof pagination === "string") {
        return reply.code(400).send({ message: pagination });
      }

      const projection = replaySecurityAuditEvents(
        [...buildSyntheticSecurityAuditEvents(projectId), ...store.securityAuditEvents],
        {
          projectId
        }
      );
      const filteredEvents = projection.events.filter(
        (event) =>
          (request.query.type === undefined || event.type === request.query.type) &&
          (request.query.outcome === undefined || event.outcome === request.query.outcome) &&
          (request.query.severity === undefined || event.severity === request.query.severity)
      );
      const page = paginateAudit(filteredEvents, pagination.limit, pagination.offset);

      return {
        kind: "security-audit-list",
        projectId,
        access: {
          scope: securityAuditReadScope,
          projectScoped: true,
          mutation: false,
          redacted: true
        },
        page,
        summary: {
          total: projection.total,
          allowed: projection.allowed,
          denied: projection.denied,
          failed: projection.failed,
          byType: projection.byType,
          byOutcome: projection.byOutcome,
          bySeverity: projection.bySeverity,
          actorIds: projection.actorIds,
          resourceIds: projection.resourceIds,
          ...(projection.firstOccurredAt !== undefined
            ? { firstOccurredAt: projection.firstOccurredAt }
            : {}),
          ...(projection.lastOccurredAt !== undefined
            ? { lastOccurredAt: projection.lastOccurredAt }
            : {})
        },
        items: filteredEvents.slice(pagination.offset, pagination.offset + pagination.limit)
      };
    }
  );

  app.get<{
    Params: SecurityAuditExportLifecycleReplayParams;
    Querystring: SecurityAuditExportLifecycleReplayQuery;
  }>(
    "/api/v1/projects/:projectId/security/audit/export/lifecycle/replay/invariants",
    {
      schema: {
        tags: ["security"],
        params: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string" }
          }
        },
        querystring: {
          type: "object",
          required: ["actorId"],
          properties: {
            actorId: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: maxAuditLimit },
            cursor: { type: "string" }
          }
        },
        response: {
          200: { type: "object", additionalProperties: true },
          400: { type: "object", additionalProperties: true },
          403: { type: "object", additionalProperties: true },
          404: { type: "object", additionalProperties: true }
        }
      }
    },
    async (request, reply) => {
      const projectId = request.params.projectId.trim();
      const actorId = request.query.actorId?.trim();
      if (projectId.length === 0) {
        return reply.code(400).send({ message: "projectId is required", redacted: true });
      }
      if (actorId === undefined || actorId.length === 0) {
        return reply.code(400).send({ message: "actorId is required", redacted: true });
      }
      const project = store.projects.get(projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const denial = authorizeSecurityAuditExportLifecycleReplay(request, project, actorId);
      if (denial !== undefined) {
        return reply.code(403).send(denial);
      }

      const pagination = parseAuditPagination(request.query);
      if (typeof pagination === "string") {
        return reply.code(400).send({ message: pagination, redacted: true });
      }

      const syntheticEvents = buildSyntheticSecurityAuditExportLifecycleEvents(projectId);
      const projection = replaySecurityAuditExportLifecycleEvents(syntheticEvents, {
        projectId,
        actorId
      });
      const page = paginateAudit(projection.requests, pagination.limit, pagination.offset);
      const pageItems = projection.requests.slice(
        pagination.offset,
        pagination.offset + pagination.limit
      );

      return {
        kind: "security-audit-export-lifecycle-replay-invariants",
        project: {
          id: projectId,
          scoped: true
        },
        actor: {
          id: actorId,
          scoped: true
        },
        access: {
          scope: securityAuditReadScope,
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        replay: {
          status: projection.totalRequests === 0 ? "empty" : "replayed",
          eventCount: projection.events.length,
          requestCount: projection.totalRequests,
          duplicateCount: 0,
          ignoredCount: syntheticEvents.length - projection.events.length,
          projectionDigest: digestLifecycleReplay({
            projectId: projection.projectId,
            actorId: projection.actorId,
            requestIds: projection.requestIds,
            byStatus: projection.byStatus
          }),
          appendOnly: true,
          deterministic: true,
          recomputable: true,
          rawEventsExposed: false,
          rawRequestsExposed: false,
          providerNeutral: true
        },
        execution: {
          exportStarted: false,
          providerIntegration: false,
          providerEndpointContacted: false,
          credentialsResolved: false,
          signedUrlsIssued: false,
          destinationResolved: false
        },
        page,
        summary: {
          totalRequests: projection.totalRequests,
          ...projection.byStatus
        },
        invariants: {
          appendOnly: true,
          deterministic: true,
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          mutationFree: true,
          providerNeutral: true,
          rawEventsExposed: false,
          rawRequestsExposed: false,
          providerEndpointsContacted: false,
          signedUrlsIssued: false,
          secretsExposed: false
        },
        items: pageItems.map(toSecurityAuditExportLifecycleReplayItem)
      };
    }
  );

  app.get<{
    Params: SecurityAuditExportLifecycleReplayParams;
    Querystring: SecurityAuditExportLifecycleReplayQuery;
  }>(
    "/api/v1/projects/:projectId/security/audit/export/lifecycle/replay/invariants/materialized",
    {
      schema: {
        tags: ["security"],
        params: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string" }
          }
        },
        querystring: {
          type: "object",
          properties: {
            actorId: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: maxAuditLimit },
            cursor: { type: "string" }
          }
        },
        response: {
          200: { type: "object", additionalProperties: true },
          400: { type: "object", additionalProperties: true },
          403: { type: "object", additionalProperties: true },
          404: { type: "object", additionalProperties: true }
        }
      }
    },
    async (request, reply) => {
      const projectId = request.params.projectId.trim();
      const actorId = request.query.actorId?.trim();
      if (projectId.length === 0) {
        return reply.code(400).send({ message: "projectId is required", redacted: true });
      }
      if (actorId === undefined || actorId.length === 0) {
        return reply.code(400).send({ message: "actorId is required", redacted: true });
      }
      const project = store.projects.get(projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const denial = authorizeSecurityAuditExportLifecycleMaterializedRead(
        request,
        project,
        actorId
      );
      if (denial !== undefined) {
        return reply.code(403).send(denial);
      }

      const pagination = parseAuditPagination(request.query);
      if (typeof pagination === "string") {
        return reply.code(400).send({ message: pagination, redacted: true });
      }

      const syntheticEvents = buildSyntheticSecurityAuditExportLifecycleEvents(projectId);
      const projection = replaySecurityAuditExportLifecycleEvents(syntheticEvents, {
        projectId,
        actorId
      });
      const materializedAt =
        projection.requests
          .flatMap((record) => record.events.map((event) => event.occurredAt))
          .sort((left, right) => left.localeCompare(right))
          .at(-1) ?? "1970-01-01T00:00:00.000Z";
      const records = projection.requests.map((record) =>
        buildSecurityAuditExportLifecycleMaterializedRecord({
          projectId,
          actorId,
          materializedAt,
          record
        })
      );
      const page = paginateAudit(records, pagination.limit, pagination.offset);
      const pageItems = records.slice(pagination.offset, pagination.offset + pagination.limit);
      const materializationDigest = buildSecurityAuditExportLifecycleMaterializedDigest(records);

      return {
        kind: "security-audit-export-lifecycle-replay-invariant-materialized-read",
        project: {
          id: projectId,
          scoped: true
        },
        actor: {
          id: actorId,
          scoped: true
        },
        access: {
          scope: securityAuditReadScope,
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        availability: {
          status: records.length === 0 ? "empty" : "ready",
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          partial: false,
          unavailable: []
        },
        materialization: {
          adapterKind:
            "api-read-model-security-audit-export-lifecycle-replay-invariant-materialized-wip",
          boundary:
            "worker-compatible-security-audit-export-lifecycle-replay-invariant-materialized-read",
          consistency: "provider-neutral-export-lifecycle-replay-summary",
          source: "security-audit-export-lifecycle-replay-invariants",
          readOnly: true,
          providerNeutral: true,
          rawLifecycleEventsIncluded: false,
          rawRequestsIncluded: false,
          destinationRefsIncluded: false,
          providerEndpointsIncluded: false,
          signedUrlsIncluded: false,
          credentialsIncluded: false,
          tokensIncluded: false,
          mutationBoundary: "api-materialized-read-only-no-export-provider-mutation",
          materializedAt,
          materializedRecordCount: records.length,
          materializationDigest
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
        summary: {
          totalRequests: projection.totalRequests,
          materializedRecordCount: records.length,
          ...projection.byStatus,
          appendOnly: true,
          deterministic: true,
          recomputable: true,
          projectScoped: true,
          actorScoped: true,
          providerNeutral: true,
          redactionPassed: true,
          rawLifecycleEventsIncluded: false,
          rawRequestsIncluded: false,
          secretsExposed: false,
          materializationDigest,
          plannedOperations: [
            "security_audit.export_lifecycle.replay_invariant.summarize",
            "security_audit.export_lifecycle.replay_invariant.materialized_read"
          ]
        },
        invariants: {
          appendOnly: true,
          deterministic: true,
          recomputable: true,
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          mutationFree: true,
          providerNeutral: true,
          rawEventsExposed: false,
          rawRequestsExposed: false,
          providerEndpointsContacted: false,
          signedUrlsIssued: false,
          secretsExposed: false
        },
        page,
        items: pageItems
      };
    }
  );

  app.post<{ Body: SecurityAuditExportEvaluationBody }>(
    "/api/v1/security/audit/export/evaluate",
    {
      schema: {
        tags: ["security"],
        body: {
          type: "object",
          required: ["request"],
          properties: {
            request: {
              type: "object",
              required: ["projectId", "actorId", "requestedAt", "range", "destination"],
              properties: {
                projectId: { type: "string" },
                actorId: { type: "string" },
                requestedAt: { type: "string" },
                range: {
                  type: "object",
                  required: ["from", "to"],
                  properties: {
                    from: { type: "string" },
                    to: { type: "string" }
                  }
                },
                destination: {
                  type: "object",
                  required: ["type"],
                  properties: {
                    type: { type: "string", enum: ["placeholder"] },
                    secretRef: { type: "string" }
                  }
                },
                format: { type: "string", enum: ["jsonl", "csv"] },
                criteria: {}
              }
            },
            policy: {
              type: "object",
              properties: {
                enabled: { type: "boolean" },
                placeholderOnly: { type: "boolean" },
                requireSecretRef: { type: "boolean" },
                maxRangeDays: { type: "number", exclusiveMinimum: 0 },
                allowedProjectIds: { type: "array", items: { type: "string" } },
                allowedActorIds: { type: "array", items: { type: "string" } }
              }
            }
          }
        },
        response: {
          200: { type: "object", additionalProperties: true },
          400: { type: "object", additionalProperties: true },
          403: { type: "object", additionalProperties: true },
          404: { type: "object", additionalProperties: true }
        }
      }
    },
    async (request, reply) => {
      const exportRequest = request.body.request;
      const projectId = exportRequest.projectId?.trim();
      const actorId = exportRequest.actorId?.trim();
      if (projectId === undefined || projectId.length === 0) {
        return reply.code(400).send({ message: "request.projectId is required", redacted: true });
      }
      if (actorId === undefined || actorId.length === 0) {
        return reply.code(400).send({ message: "request.actorId is required", redacted: true });
      }
      const project = store.projects.get(projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const denial = authorizeSecurityAuditExportEvaluation(request, project, actorId);
      if (denial !== undefined) {
        return reply.code(403).send(denial);
      }

      try {
        const decision = evaluateSecurityAuditExportPolicy(
          exportRequest,
          request.body.policy ?? {}
        );
        return {
          kind: "security-audit-export-policy-evaluation",
          projectId: decision.request.projectId,
          actor: {
            type: "actor",
            actorId: decision.request.actorId,
            scoped: true
          },
          access: {
            scope: securityAuditReadScope,
            projectScoped: true,
            actorScoped: true,
            mutation: false,
            redacted: true
          },
          execution: {
            exportStarted: false,
            providerIntegration: false,
            credentialsResolved: false,
            destinationType: decision.request.destination.type
          },
          decision
        };
      } catch {
        return reply.code(400).send({
          message: "Invalid security audit export evaluation request",
          redacted: true
        });
      }
    }
  );
}
