import crypto from "node:crypto";
import {
  createSecurityAuditEvent,
  type OutboundIntegrationEvent,
  type ProjectIssueTrackerIntegration,
  type ProjectNotificationIntegration,
  type SecurityAuditEventType
} from "@testhistory/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  claimAndDispatchIntegrationDeliveries,
  dispatchIntegrationDelivery,
  enqueueIssueDelivery
} from "../integrationDeliveryService.js";
import { parseSafeOutboundUrl } from "../outboundHttpSecurity.js";
import type { AppStore } from "../store.js";
import { toPersistentProject } from "../storeMappers.js";
import {
  actorIdHeader,
  authorizeProjectMutation,
  authorizeProjectVisibilityRead
} from "./project-auth.js";
import { appendStoreSecurityAuditEvents, getProjectAccessSettings } from "./projectSettings.js";

type NotificationBody = {
  name: string;
  provider: ProjectNotificationIntegration["provider"];
  endpointUrl: string;
  events: OutboundIntegrationEvent[];
  secretEnvVar?: string;
};
type IssueTrackerBody = {
  name: string;
  provider: ProjectIssueTrackerIntegration["provider"];
  baseUrl: string;
  projectKey: string;
  credentialEnvVar: string;
};
type IssueBody = {
  integrationId: string;
  summary: string;
  description?: string;
  labels?: string[];
  dispatchNow?: boolean;
};

export async function registerOutboundIntegrationRoutes(app: FastifyInstance, store: AppStore) {
  app.get<{ Params: { projectId: string } }>(
    "/api/v1/projects/:projectId/integrations/notifications",
    { schema: { tags: ["integrations"], params: projectParams } },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (!project) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeProjectVisibilityRead(request, project, "settings:read");
      if (denied) return reply.code(403).send(denied);
      const items =
        getProjectAccessSettings(project, project.createdAt).notificationIntegrations ?? [];
      return {
        kind: "notification-integration-list",
        items: items.map((item) => redactNotification(item))
      };
    }
  );

  app.post<{ Params: { projectId: string }; Body: NotificationBody }>(
    "/api/v1/projects/:projectId/integrations/notifications",
    { schema: { tags: ["integrations"], params: projectParams, body: notificationBodySchema } },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (!project) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeManageIntegrations(request, project);
      if (denied) return reply.code(403).send(denied);
      try {
        parseSafeOutboundUrl(request.body.endpointUrl);
      } catch (error) {
        return reply
          .code(400)
          .send({ message: error instanceof Error ? error.message : "Invalid endpoint URL" });
      }
      const now = new Date().toISOString();
      const integration: ProjectNotificationIntegration = {
        id: crypto.randomUUID(),
        name: request.body.name.trim(),
        provider: request.body.provider,
        enabled: true,
        endpointUrl: request.body.endpointUrl,
        events: [...new Set(request.body.events)],
        createdBy: actorIdHeader(request) ?? "system",
        createdAt: now,
        updatedAt: now,
        ...(request.body.secretEnvVar !== undefined
          ? { secretEnvVar: request.body.secretEnvVar }
          : {})
      };
      const settings = getProjectAccessSettings(project, now);
      project.accessSettings = {
        ...settings,
        notificationIntegrations: [...(settings.notificationIntegrations ?? []), integration],
        updatedAt: now
      };
      await persistProject(store, project);
      await auditConfig(
        store,
        request,
        project.id,
        integration.id,
        integration.name,
        "notification-integration.created"
      );
      return reply.code(201).send({ integration: redactNotification(integration) });
    }
  );

  app.get<{ Params: { projectId: string } }>(
    "/api/v1/projects/:projectId/integrations/issue-trackers",
    { schema: { tags: ["integrations"], params: projectParams } },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (!project) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeProjectVisibilityRead(request, project, "settings:read");
      if (denied) return reply.code(403).send(denied);
      const items =
        getProjectAccessSettings(project, project.createdAt).issueTrackerIntegrations ?? [];
      return {
        kind: "issue-tracker-integration-list",
        items: items.map((item) => redactIssueTracker(item))
      };
    }
  );

  app.post<{ Params: { projectId: string }; Body: IssueTrackerBody }>(
    "/api/v1/projects/:projectId/integrations/issue-trackers",
    { schema: { tags: ["integrations"], params: projectParams, body: issueTrackerBodySchema } },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (!project) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeManageIntegrations(request, project);
      if (denied) return reply.code(403).send(denied);
      try {
        parseSafeOutboundUrl(request.body.baseUrl);
      } catch (error) {
        return reply
          .code(400)
          .send({ message: error instanceof Error ? error.message : "Invalid base URL" });
      }
      const projectKeyError = validateIssueTrackerProjectKey(request.body);
      if (projectKeyError !== undefined) return reply.code(400).send({ message: projectKeyError });
      const now = new Date().toISOString();
      const integration: ProjectIssueTrackerIntegration = {
        id: crypto.randomUUID(),
        name: request.body.name.trim(),
        provider: request.body.provider,
        enabled: true,
        baseUrl: request.body.baseUrl,
        projectKey: request.body.projectKey.trim(),
        credentialEnvVar: request.body.credentialEnvVar,
        createdBy: actorIdHeader(request) ?? "system",
        createdAt: now,
        updatedAt: now
      };
      const settings = getProjectAccessSettings(project, now);
      project.accessSettings = {
        ...settings,
        issueTrackerIntegrations: [...(settings.issueTrackerIntegrations ?? []), integration],
        updatedAt: now
      };
      await persistProject(store, project);
      await auditConfig(
        store,
        request,
        project.id,
        integration.id,
        integration.name,
        "issue-tracker-integration.created"
      );
      return reply.code(201).send({ integration: redactIssueTracker(integration) });
    }
  );

  app.patch<{
    Params: { projectId: string; kind: "notifications" | "issue-trackers"; integrationId: string };
    Body: { enabled: boolean };
  }>(
    "/api/v1/projects/:projectId/integrations/:kind/:integrationId",
    { schema: { tags: ["integrations"], params: integrationItemParams, body: enabledBodySchema } },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (!project) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeManageIntegrations(request, project);
      if (denied) return reply.code(403).send(denied);
      const now = new Date().toISOString();
      const settings = getProjectAccessSettings(project, now);
      const collection =
        request.params.kind === "notifications"
          ? (settings.notificationIntegrations ?? [])
          : (settings.issueTrackerIntegrations ?? []);
      const item = collection.find((candidate) => candidate.id === request.params.integrationId);
      if (!item) return reply.code(404).send({ message: "Integration not found" });
      item.enabled = request.body.enabled;
      item.updatedAt = now;
      project.accessSettings = { ...settings, updatedAt: now };
      await persistProject(store, project);
      const type =
        request.params.kind === "notifications"
          ? "notification-integration.updated"
          : "issue-tracker-integration.updated";
      await auditConfig(store, request, project.id, item.id, item.name, type);
      return {
        integration:
          request.params.kind === "notifications"
            ? redactNotification(item as ProjectNotificationIntegration)
            : redactIssueTracker(item as ProjectIssueTrackerIntegration)
      };
    }
  );

  app.delete<{
    Params: { projectId: string; kind: "notifications" | "issue-trackers"; integrationId: string };
  }>(
    "/api/v1/projects/:projectId/integrations/:kind/:integrationId",
    { schema: { tags: ["integrations"], params: integrationItemParams } },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (!project) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeManageIntegrations(request, project);
      if (denied) return reply.code(403).send(denied);
      const now = new Date().toISOString();
      const settings = getProjectAccessSettings(project, now);
      const isNotification = request.params.kind === "notifications";
      const collection = isNotification
        ? (settings.notificationIntegrations ?? [])
        : (settings.issueTrackerIntegrations ?? []);
      const item = collection.find((candidate) => candidate.id === request.params.integrationId);
      if (!item) return reply.code(404).send({ message: "Integration not found" });
      project.accessSettings = isNotification
        ? {
            ...settings,
            notificationIntegrations: (settings.notificationIntegrations ?? []).filter(
              (candidate) => candidate.id !== item.id
            ),
            updatedAt: now
          }
        : {
            ...settings,
            issueTrackerIntegrations: (settings.issueTrackerIntegrations ?? []).filter(
              (candidate) => candidate.id !== item.id
            ),
            updatedAt: now
          };
      await persistProject(store, project);
      await auditConfig(
        store,
        request,
        project.id,
        item.id,
        item.name,
        isNotification ? "notification-integration.deleted" : "issue-tracker-integration.deleted"
      );
      return reply.code(204).send();
    }
  );

  app.get<{
    Params: { projectId: string };
    Querystring: { status?: string; kind?: "notification" | "issue" };
  }>(
    "/api/v1/projects/:projectId/integration-deliveries",
    { schema: { tags: ["integrations"], params: projectParams } },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (!project) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeProjectVisibilityRead(request, project, "settings:read");
      if (denied) return reply.code(403).send(denied);
      const page = await store.repositories.integrationDeliveries.listByProject(project.id, {
        ...(request.query.kind !== undefined ? { kind: request.query.kind } : {}),
        ...(isDeliveryStatus(request.query.status) ? { status: request.query.status } : {})
      });
      return { kind: "integration-delivery-list", items: page.items.map(redactDelivery) };
    }
  );

  app.post<{ Params: { projectId: string }; Body: IssueBody }>(
    "/api/v1/projects/:projectId/issues",
    { schema: { tags: ["integrations"], params: projectParams, body: issueBodySchema } },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (!project) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeProjectMutation(
        request,
        project,
        "test-cases:write",
        ["owner", "maintainer", "editor"],
        "Actor role is not allowed to create issues"
      );
      if (denied) return reply.code(403).send(denied);
      const integration = project.accessSettings?.issueTrackerIntegrations?.find(
        (item) => item.id === request.body.integrationId && item.enabled
      );
      if (!integration)
        return reply.code(404).send({ message: "Issue tracker integration not found" });
      const delivery = await enqueueIssueDelivery({
        store,
        projectId: project.id,
        integrationId: integration.id,
        summary: request.body.summary,
        ...(request.body.description !== undefined
          ? { description: request.body.description }
          : {}),
        ...(request.body.labels !== undefined ? { labels: request.body.labels } : {}),
        actor: { type: "actor", actorId: actorIdHeader(request) ?? "system" }
      });
      const result =
        request.body.dispatchNow === false
          ? delivery
          : await dispatchIntegrationDelivery(store, delivery);
      return reply
        .code(result.status === "delivered" ? 201 : 202)
        .send({ delivery: redactDelivery(result) });
    }
  );

  app.post<{ Body: { workerId: string; limit?: number } }>(
    "/api/v1/integrations/deliveries/dispatch",
    { schema: { tags: ["integrations"], body: dispatchBodySchema } },
    async (request) => {
      const items = await claimAndDispatchIntegrationDeliveries({
        store,
        workerId: request.body.workerId,
        limit: Math.min(request.body.limit ?? 25, 100)
      });
      return {
        kind: "integration-delivery-dispatch",
        processed: items.length,
        items: items.map(redactDelivery)
      };
    }
  );
}

function authorizeManageIntegrations(
  request: FastifyRequest,
  project: Parameters<typeof authorizeProjectMutation>[1]
) {
  return authorizeProjectMutation(
    request,
    project,
    "settings:write",
    ["owner", "maintainer"],
    "Actor role is not allowed to manage integrations"
  );
}
async function persistProject(store: AppStore, project: Parameters<typeof toPersistentProject>[0]) {
  store.projects.set(project.id, project);
  if (store.driver === "postgres")
    await store.repositories.projects.save(toPersistentProject(project));
}
async function auditConfig(
  store: AppStore,
  request: FastifyRequest,
  projectId: string,
  id: string,
  name: string,
  type: SecurityAuditEventType
) {
  await appendStoreSecurityAuditEvents(store, [
    createSecurityAuditEvent({
      projectId,
      type,
      outcome: "allowed",
      occurredAt: new Date().toISOString(),
      actor: { type: "actor", actorId: actorIdHeader(request) ?? "system" },
      resource: { type: "integration", id, name },
      request: {
        method: request.method,
        requestId: request.id,
        ...(request.routeOptions.url !== undefined ? { route: request.routeOptions.url } : {})
      }
    })
  ]);
}
function redactNotification(item: ProjectNotificationIntegration) {
  const copy = { ...item } as Partial<ProjectNotificationIntegration> & {
    signingSecretConfigured?: boolean;
  };
  copy.signingSecretConfigured =
    item.secretEnvVar === undefined ? false : Boolean(process.env[item.secretEnvVar]);
  delete copy.secretEnvVar;
  return copy;
}
function redactIssueTracker(item: ProjectIssueTrackerIntegration) {
  const copy = { ...item } as Partial<ProjectIssueTrackerIntegration> & {
    credentialConfigured?: boolean;
  };
  copy.credentialConfigured = Boolean(process.env[item.credentialEnvVar]);
  delete copy.credentialEnvVar;
  return copy;
}
function redactDelivery(item: {
  id: string;
  projectId: string;
  integrationId: string;
  kind: string;
  event: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
  responseStatus?: number;
  externalReference?: string;
  lastError?: string;
}) {
  return {
    id: item.id,
    projectId: item.projectId,
    integrationId: item.integrationId,
    kind: item.kind,
    event: item.event,
    status: item.status,
    attempts: item.attempts,
    maxAttempts: item.maxAttempts,
    nextAttemptAt: item.nextAttemptAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    ...(item.deliveredAt !== undefined ? { deliveredAt: item.deliveredAt } : {}),
    ...(item.responseStatus !== undefined ? { responseStatus: item.responseStatus } : {}),
    ...(item.externalReference !== undefined ? { externalReference: item.externalReference } : {}),
    ...(item.lastError !== undefined ? { lastError: item.lastError } : {})
  };
}
function isDeliveryStatus(
  value: string | undefined
): value is "pending" | "processing" | "delivered" | "retrying" | "dead" {
  return (
    value !== undefined &&
    ["pending", "processing", "delivered", "retrying", "dead"].includes(value)
  );
}
function validateIssueTrackerProjectKey(input: IssueTrackerBody): string | undefined {
  const key = input.projectKey.trim();
  if (input.provider === "github" && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(key)) {
    return "GitHub projectKey must use owner/repository format";
  }
  if (input.provider === "jira" && !/^[A-Za-z][A-Za-z0-9_-]{0,99}$/.test(key)) {
    return "Jira projectKey is invalid";
  }
  if (/[\u0000-\u001f\u007f]/.test(key))
    return "Issue tracker projectKey contains control characters";
  return undefined;
}

const envName = { type: "string", pattern: "^[A-Z][A-Z0-9_]{2,127}$" } as const;
const projectParams = {
  type: "object",
  required: ["projectId"],
  properties: { projectId: { type: "string", minLength: 1 } }
} as const;
const integrationItemParams = {
  type: "object",
  required: ["projectId", "kind", "integrationId"],
  properties: {
    projectId: { type: "string", minLength: 1 },
    kind: { type: "string", enum: ["notifications", "issue-trackers"] },
    integrationId: { type: "string", minLength: 1 }
  }
} as const;
const eventValues = [
  "automation-job.succeeded",
  "automation-job.failed",
  "automation-job.canceled",
  "launch.closed",
  "launch.failed",
  "quality-gate.failed"
] as const;
const notificationBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "provider", "endpointUrl", "events"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 200 },
    provider: { type: "string", enum: ["generic", "slack", "teams", "pachca"] },
    endpointUrl: { type: "string", minLength: 1, maxLength: 2000 },
    events: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "string", enum: eventValues }
    },
    secretEnvVar: envName
  }
} as const;
const issueTrackerBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "provider", "baseUrl", "projectKey", "credentialEnvVar"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 200 },
    provider: { type: "string", enum: ["jira", "youtrack", "github", "generic"] },
    baseUrl: { type: "string", minLength: 1, maxLength: 2000 },
    projectKey: { type: "string", minLength: 1, maxLength: 300 },
    credentialEnvVar: envName
  }
} as const;
const enabledBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["enabled"],
  properties: { enabled: { type: "boolean" } }
} as const;
const issueBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["integrationId", "summary"],
  properties: {
    integrationId: { type: "string", minLength: 1 },
    summary: { type: "string", minLength: 1, maxLength: 300 },
    description: { type: "string", maxLength: 20_000 },
    labels: {
      type: "array",
      maxItems: 30,
      items: { type: "string", minLength: 1, maxLength: 100 }
    },
    dispatchNow: { type: "boolean" }
  }
} as const;
const dispatchBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["workerId"],
  properties: {
    workerId: { type: "string", minLength: 1, maxLength: 200 },
    limit: { type: "integer", minimum: 1, maximum: 100 }
  }
} as const;
