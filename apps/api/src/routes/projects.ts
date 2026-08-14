import type { AuthTokenScope, ProjectRole } from "@testhistory/contracts";
import type { Project, ProjectApiTokenRecord } from "@testhistory/domain";
import { createSecurityAuditEvent } from "@testhistory/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AppStore } from "../store.js";
import { toPersistentProject } from "../storeMappers.js";
import { authenticateUser } from "./auth.js";
import {
  authorizeProjectVisibilityRead,
  hasProjectAuthSignals,
  requiresProjectAuth
} from "./project-auth.js";
import {
  appendStoreSecurityAuditEvents,
  buildRoleChangedEvents,
  defaultProjectArtifactRetentionSettings,
  getProjectAccessSettings,
  serializeApiToken,
  serializeProjectAccessSettings,
  serializeProjectArtifactSettings,
  validateAccessSettingsPatch,
  validateApiTokenCreateRequest,
  validateArtifactSettingsPatch,
  type AccessSettingsPatch,
  type ApiTokenCreateRequest,
  type ArtifactSettingsPatch
} from "./projectSettings.js";

const settingsReadScope: AuthTokenScope = "settings:read";
const settingsWriteScope: AuthTokenScope = "settings:write";
const settingsReadRoles: readonly ProjectRole[] = ["owner", "maintainer"];
const settingsWriteRoles: readonly ProjectRole[] = ["owner"];

export async function registerProjectRoutes(app: FastifyInstance, store: AppStore) {
  app.get(
    "/api/v1/projects",
    {
      schema: {
        tags: ["projects"]
      }
    },
    async (request, reply) => {
      const projects = Array.from(store.projects.values());
      if (!hasProjectAuthSignals(request)) {
        if (requiresProjectAuth()) {
          return reply.code(403).send({
            error: "PermissionDeniedError",
            message: "Authentication is required to list projects",
            redacted: true,
            requiredScopes: ["projects:read"]
          });
        }
        return projects;
      }

      return projects.filter(
        (project) => authorizeProjectVisibilityRead(request, project, "projects:read") === undefined
      );
    }
  );

  app.post<{ Body: { key: string; name: string } }>(
    "/api/v1/projects",
    {
      schema: {
        tags: ["projects"],
        body: {
          type: "object",
          required: ["key", "name"],
          additionalProperties: false,
          properties: {
            key: { type: "string", minLength: 1, maxLength: 40, pattern: "^[A-Za-z0-9_-]+$" },
            name: { type: "string", minLength: 1, maxLength: 160 }
          }
        },
        response: {
          201: { type: "object", additionalProperties: true },
          400: { type: "object", additionalProperties: true },
          403: { type: "object", additionalProperties: true },
          409: { type: "object", additionalProperties: true }
        }
      }
    },
    async (request, reply) => {
      if (requiresProjectAuth()) {
        const scopes = parseHeaderList(request.headers["x-testhistory-scopes"]);
        const actorId = parseHeaderList(request.headers["x-testhistory-actor-id"])[0];
        if (actorId === undefined || !scopes.includes("projects:write")) {
          return reply.code(403).send({
            error: "PermissionDeniedError",
            message: "Authentication is required to create projects",
            redacted: true,
            requiredScopes: ["projects:write"]
          });
        }
      }

      const key = request.body.key.trim().toUpperCase();
      const name = request.body.name.trim();
      if (name.length === 0) {
        return reply.code(400).send({
          error: "ProjectValidationError",
          field: "name",
          message: "Project name must not be blank",
          redacted: true
        });
      }
      const duplicate = Array.from(store.projects.values()).find(
        (project) => project.key.trim().toUpperCase() === key
      );
      if (duplicate !== undefined) {
        return reply.code(409).send({
          error: "ProjectConflictError",
          field: "key",
          message: `Project key ${key} already exists`,
          projectId: duplicate.id,
          redacted: true
        });
      }

      const now = new Date().toISOString();
      const project: Project = {
        id: randomUUID(),
        key,
        name,
        createdAt: now,
        artifactRetention: defaultProjectArtifactRetentionSettings(now)
      };

      store.projects.set(project.id, project);
      if (store.driver === "postgres") {
        await store.repositories.projects.save(toPersistentProject(project));
      }
      return reply.code(201).send(project);
    }
  );

  app.get<{ Params: { projectId: string } }>(
    "/api/v1/projects/:projectId/settings/artifacts",
    {
      schema: {
        tags: ["projects"],
        params: {
          type: "object",
          required: ["projectId"],
          properties: { projectId: { type: "string" } }
        },
        response: {
          200: { type: "object", additionalProperties: true },
          403: { type: "object", additionalProperties: true },
          404: { type: "object", additionalProperties: true }
        }
      }
    },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const denied = authorizeProjectSettings(request, project, settingsReadScope, store);
      if (denied !== undefined) {
        return reply.code(403).send(denied);
      }

      return serializeProjectArtifactSettings(project);
    }
  );

  app.patch<{ Params: { projectId: string }; Body: ArtifactSettingsPatch }>(
    "/api/v1/projects/:projectId/settings/artifacts",
    {
      schema: {
        tags: ["projects"],
        params: {
          type: "object",
          required: ["projectId"],
          properties: { projectId: { type: "string" } }
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            attachmentRetentionDays: { type: "integer", minimum: 1, maximum: 3650 },
            cleanupGraceDays: { type: "integer", minimum: 0, maximum: 365 },
            compressRetainedTextArtifacts: { type: "boolean" },
            deleteBinaryArtifactsAfterRetention: { type: "boolean" },
            retentionPolicies: {
              type: "array",
              items: {
                type: "object",
                required: [
                  "id",
                  "artifact",
                  "passedDays",
                  "failedDays",
                  "quarantinedDays",
                  "maxSizeMb"
                ],
                additionalProperties: false,
                properties: {
                  id: { type: "string", minLength: 1, maxLength: 80 },
                  artifact: { type: "string", minLength: 1, maxLength: 120 },
                  passedDays: { type: "integer", minimum: 0, maximum: 3650 },
                  failedDays: { type: "integer", minimum: 0, maximum: 3650 },
                  quarantinedDays: { type: "integer", minimum: 0, maximum: 3650 },
                  maxSizeMb: { type: "integer", minimum: 1, maximum: 102400 }
                }
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
      const project = store.projects.get(request.params.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const denied = authorizeProjectSettings(request, project, settingsWriteScope, store);
      if (denied !== undefined) {
        return reply.code(403).send(denied);
      }

      const validationError = validateArtifactSettingsPatch(request.body);
      if (validationError !== undefined) {
        return reply.code(400).send({ message: validationError });
      }

      const now = new Date().toISOString();
      const current = project.artifactRetention ?? defaultProjectArtifactRetentionSettings(now);
      project.artifactRetention = {
        ...current,
        ...request.body,
        updatedAt: now
      };
      store.projects.set(project.id, project);
      if (store.driver === "postgres") {
        await store.repositories.projects.save(toPersistentProject(project));
      }

      return serializeProjectArtifactSettings(project);
    }
  );

  app.get<{ Params: { projectId: string } }>(
    "/api/v1/projects/:projectId/settings/access",
    {
      schema: {
        tags: ["projects", "security"],
        params: {
          type: "object",
          required: ["projectId"],
          properties: { projectId: { type: "string" } }
        },
        response: {
          200: { type: "object", additionalProperties: true },
          403: { type: "object", additionalProperties: true },
          404: { type: "object", additionalProperties: true }
        }
      }
    },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const denied = authorizeProjectSettings(request, project, settingsReadScope, store);
      if (denied !== undefined) {
        return reply.code(403).send(denied);
      }

      return serializeProjectAccessSettings(project);
    }
  );

  app.patch<{ Params: { projectId: string }; Body: AccessSettingsPatch }>(
    "/api/v1/projects/:projectId/settings/access",
    {
      schema: {
        tags: ["projects", "security"],
        params: {
          type: "object",
          required: ["projectId"],
          properties: { projectId: { type: "string" } }
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            visibility: { type: "string", enum: ["private", "internal", "public-demo"] },
            memberships: { type: "array", items: { type: "object", additionalProperties: true } },
            visibilityPolicies: {
              type: "array",
              items: { type: "object", additionalProperties: true }
            },
            integrationProviders: {
              type: "array",
              items: { type: "object", additionalProperties: true }
            },
            customFieldMappings: {
              type: "array",
              items: { type: "object", additionalProperties: true }
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
      const project = store.projects.get(request.params.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const denied = authorizeProjectSettings(request, project, settingsWriteScope, store);
      if (denied !== undefined) {
        return reply.code(403).send(denied);
      }

      const validationError = validateAccessSettingsPatch(request.body);
      if (validationError !== undefined) {
        return reply.code(400).send({ message: validationError, redacted: true });
      }

      const now = new Date().toISOString();
      const current = getProjectAccessSettings(project, now);
      const roleChangedEvents = buildRoleChangedEvents({
        actorId: getActorId(request),
        nextMemberships: request.body.memberships,
        now,
        previousMemberships: current.memberships,
        projectId: project.id,
        route: "/api/v1/projects/:projectId/settings/access"
      });
      project.accessSettings = {
        ...current,
        ...request.body,
        apiTokens: current.apiTokens,
        updatedAt: now
      };
      store.projects.set(project.id, project);
      if (store.driver === "postgres") {
        await store.repositories.projects.save(toPersistentProject(project));
      }
      await appendStoreSecurityAuditEvents(store, roleChangedEvents);

      return serializeProjectAccessSettings(project);
    }
  );

  app.post<{ Params: { projectId: string }; Body: ApiTokenCreateRequest }>(
    "/api/v1/projects/:projectId/settings/access/tokens",
    {
      schema: {
        tags: ["projects", "security"],
        params: {
          type: "object",
          required: ["projectId"],
          properties: { projectId: { type: "string" } }
        },
        body: {
          type: "object",
          required: ["name", "ownerSubject", "scopes"],
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 120 },
            ownerSubject: { type: "string", minLength: 1, maxLength: 160 },
            scopes: { type: "array", items: { type: "string" }, minItems: 1 },
            expiresAt: { type: "string" }
          }
        },
        response: {
          201: { type: "object", additionalProperties: true },
          400: { type: "object", additionalProperties: true },
          403: { type: "object", additionalProperties: true },
          404: { type: "object", additionalProperties: true }
        }
      }
    },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const denied = authorizeProjectSettings(request, project, settingsWriteScope, store);
      if (denied !== undefined) {
        return reply.code(403).send(denied);
      }

      const validationError = validateApiTokenCreateRequest(request.body);
      if (validationError !== undefined) {
        return reply.code(400).send({ message: validationError, redacted: true });
      }

      const now = new Date().toISOString();
      const current = getProjectAccessSettings(project, now);
      const prefix = `th_live_${randomBytes(4).toString("hex")}`;
      const secret = `${prefix}_${randomBytes(24).toString("base64url")}`;
      const token: ProjectApiTokenRecord = {
        createdAt: now,
        createdBy: getActorId(request),
        fingerprint: createHash("sha256").update(secret).digest("hex").slice(0, 16),
        id: crypto.randomUUID(),
        name: request.body.name.trim(),
        ownerSubject: request.body.ownerSubject.trim(),
        prefix,
        scopes: request.body.scopes,
        secretHash: hashApiTokenSecret(secret),
        status: "active",
        updatedAt: now,
        ...(request.body.expiresAt !== undefined ? { expiresAt: request.body.expiresAt } : {})
      };
      project.accessSettings = {
        ...current,
        apiTokens: [token, ...current.apiTokens],
        updatedAt: now
      };
      store.projects.set(project.id, project);
      if (store.driver === "postgres") {
        await store.repositories.projects.save(toPersistentProject(project));
      }
      await appendStoreSecurityAuditEvents(store, [
        createSecurityAuditEvent({
          actor: { type: "actor", actorId: getActorId(request) },
          metadata: {
            fingerprint: token.fingerprint,
            ownerSubject: token.ownerSubject,
            prefix: token.prefix,
            scopes: token.scopes,
            status: token.status
          },
          occurredAt: now,
          outcome: "allowed",
          projectId: project.id,
          request: {
            method: "POST",
            route: "/api/v1/projects/:projectId/settings/access/tokens"
          },
          resource: { type: "api-token", id: token.id, name: token.name },
          type: "auth.token.created"
        })
      ]);

      return reply.code(201).send({
        kind: "project-api-token-created",
        projectId: project.id,
        token: serializeApiToken(token),
        secret,
        secretShownOnce: true
      });
    }
  );

  app.delete<{ Params: { projectId: string; tokenId: string } }>(
    "/api/v1/projects/:projectId/settings/access/tokens/:tokenId",
    {
      schema: {
        tags: ["projects", "security"],
        params: {
          type: "object",
          required: ["projectId", "tokenId"],
          properties: { projectId: { type: "string" }, tokenId: { type: "string" } }
        },
        response: {
          200: { type: "object", additionalProperties: true },
          403: { type: "object", additionalProperties: true },
          404: { type: "object", additionalProperties: true }
        }
      }
    },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const denied = authorizeProjectSettings(request, project, settingsWriteScope, store);
      if (denied !== undefined) {
        return reply.code(403).send(denied);
      }

      const now = new Date().toISOString();
      const current = getProjectAccessSettings(project, now);
      const token = current.apiTokens.find((item) => item.id === request.params.tokenId);
      if (token === undefined) {
        return reply.code(404).send({ message: "API token not found" });
      }

      project.accessSettings = {
        ...current,
        apiTokens: current.apiTokens.map((item) =>
          item.id === token.id
            ? {
                ...item,
                revokedAt: now,
                revokedBy: getActorId(request),
                status: "revoked",
                updatedAt: now
              }
            : item
        ),
        updatedAt: now
      };
      store.projects.set(project.id, project);
      if (store.driver === "postgres") {
        await store.repositories.projects.save(toPersistentProject(project));
      }

      const revoked = project.accessSettings.apiTokens.find((item) => item.id === token.id)!;
      await appendStoreSecurityAuditEvents(store, [
        createSecurityAuditEvent({
          actor: { type: "actor", actorId: getActorId(request) },
          metadata: {
            fingerprint: revoked.fingerprint,
            ownerSubject: revoked.ownerSubject,
            prefix: revoked.prefix,
            scopes: revoked.scopes,
            status: revoked.status
          },
          occurredAt: now,
          outcome: "allowed",
          projectId: project.id,
          request: {
            method: "DELETE",
            route: "/api/v1/projects/:projectId/settings/access/tokens/:tokenId"
          },
          resource: { type: "api-token", id: revoked.id, name: revoked.name },
          type: "auth.token.revoked"
        })
      ]);
      return {
        kind: "project-api-token-revoked",
        projectId: project.id,
        token: serializeApiToken(revoked)
      };
    }
  );
}

function authorizeProjectSettings(
  request: FastifyRequest,
  project: Project,
  requiredScope: AuthTokenScope,
  store: AppStore
) {
  const principal = authenticateUser(request, store);
  if (principal?.user.role === "admin") {
    return undefined;
  }

  const bearerToken = parseBearerToken(request.headers.authorization);
  if (bearerToken !== undefined) {
    const now = new Date().toISOString();
    const settings = getProjectAccessSettings(project, now);
    const token = settings.apiTokens.find(
      (item) => item.secretHash === hashApiTokenSecret(bearerToken)
    );
    if (token === undefined) {
      return {
        error: "PermissionDeniedError",
        message: "API token is invalid",
        projectId: project.id,
        redacted: true,
        requiredScopes: [requiredScope]
      };
    }
    if (token.status !== "active" || (token.expiresAt !== undefined && token.expiresAt <= now)) {
      return {
        error: "PermissionDeniedError",
        message: "API token is not active",
        projectId: project.id,
        redacted: true,
        requiredScopes: [requiredScope]
      };
    }
    if (!token.scopes.includes(requiredScope)) {
      return {
        error: "PermissionDeniedError",
        message: `Missing required ${requiredScope} scope`,
        projectId: project.id,
        redacted: true,
        requiredScopes: [requiredScope]
      };
    }

    project.accessSettings = {
      ...settings,
      apiTokens: settings.apiTokens.map((item) =>
        item.id === token.id ? { ...item, lastUsedAt: now, updatedAt: now } : item
      ),
      updatedAt: settings.updatedAt
    };
    return undefined;
  }

  const projectId = project.id;
  const scopes = parseHeaderList(request.headers["x-testhistory-scopes"]);
  const projectScopes = parseHeaderList(request.headers["x-testhistory-project-scope"]);
  if (!scopes.includes(requiredScope)) {
    return {
      error: "PermissionDeniedError",
      message: `Missing required ${requiredScope} scope`,
      projectId,
      redacted: true,
      requiredScopes: [requiredScope]
    };
  }
  if (!projectScopes.includes(projectId) && !projectScopes.includes("*")) {
    return {
      error: "PermissionDeniedError",
      message: "Actor is not allowed to manage settings for this project",
      projectId,
      redacted: true,
      requiredScopes: [requiredScope]
    };
  }

  const actorId = getActorId(request);
  const roleDenial = authorizeProjectSettingsRole(project, actorId, requiredScope);
  if (roleDenial !== undefined) {
    return roleDenial;
  }

  return undefined;
}

function authorizeProjectSettingsRole(
  project: Project,
  actorId: string,
  requiredScope: AuthTokenScope
) {
  const now = new Date().toISOString();
  const settings = getProjectAccessSettings(project, now);
  const allowedRoles =
    requiredScope === settingsWriteScope ? settingsWriteRoles : settingsReadRoles;
  const membership = settings.memberships.find(
    (item) => item.subject === actorId && item.status === "active"
  );
  if (membership !== undefined && allowedRoles.includes(membership.role)) {
    return undefined;
  }

  return {
    error: "PermissionDeniedError",
    message:
      requiredScope === settingsWriteScope
        ? "Actor role is not allowed to manage project settings"
        : "Actor role is not allowed to read project settings",
    projectId: project.id,
    redacted: true,
    requiredRoles: [...allowedRoles],
    requiredScopes: [requiredScope]
  };
}

function parseHeaderList(value: FastifyRequest["headers"][string]): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseHeaderList(item));
  }
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseBearerToken(value: FastifyRequest["headers"]["authorization"]): string | undefined {
  if (Array.isArray(value)) {
    return parseBearerToken(value[0]);
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1];
}

function getActorId(request: FastifyRequest): string {
  return parseHeaderList(request.headers["x-testhistory-actor-id"])[0] ?? "system";
}

function hashApiTokenSecret(secret: string): string {
  return `sha256:${createHash("sha256").update(secret).digest("hex")}`;
}
