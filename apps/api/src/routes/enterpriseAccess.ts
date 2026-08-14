import { randomBytes, randomUUID } from "node:crypto";
import type { ProjectRole } from "@testhistory/contracts";
import {
  createSecurityAuditEvent,
  type ProjectMembership,
  type ProjectOidcProvider,
  type Project,
  type ProjectAccessSettings
} from "@testhistory/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { hashOpaqueSecret } from "../passwordHash.js";
import type { AppStore } from "../store.js";
import { toPersistentProject } from "../storeMappers.js";
import { assertSafeOutboundDestination, parseSafeOutboundUrl } from "../outboundHttpSecurity.js";
import {
  actorIdHeader,
  authorizeProjectMutation,
  authorizeProjectVisibilityRead
} from "./project-auth.js";
import { appendStoreSecurityAuditEvents, getProjectAccessSettings } from "./projectSettings.js";
import {
  oidcBodySchema,
  oidcPatchSchema,
  projectParams,
  providerParams,
  scimListQuerySchema,
  scimPatchBodySchema,
  scimTokenBodySchema,
  scimUserBodySchema,
  scimUserParams
} from "./enterpriseAccessSchemas.js";

type OidcProviderBody = {
  name: string;
  issuer: string;
  clientId: string;
  clientSecretEnvVar: string;
  scopes?: string[];
  defaultRole?: ProjectRole;
  enabled?: boolean;
};

type ScimUserBody = {
  externalId?: string;
  userName: string;
  displayName?: string;
  active?: boolean;
  emails?: Array<{ value?: string; primary?: boolean }>;
  roles?: Array<{ value?: string } | string>;
};

const scimUserSchema = "urn:ietf:params:scim:schemas:core:2.0:User";
const scimErrorSchema = "urn:ietf:params:scim:api:messages:2.0:Error";
const projectRoles: readonly ProjectRole[] = ["owner", "maintainer", "editor", "viewer", "ci"];

export async function registerEnterpriseAccessRoutes(app: FastifyInstance, store: AppStore) {
  app.get<{ Params: { projectId: string } }>(
    "/api/v1/projects/:projectId/enterprise-access",
    { schema: { tags: ["security"], params: projectParams } },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (project === undefined) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeProjectVisibilityRead(request, project, "settings:read");
      if (denied !== undefined) return reply.code(403).send(denied);
      return enterpriseAccessRead(project);
    }
  );

  app.post<{ Params: { projectId: string }; Body: OidcProviderBody }>(
    "/api/v1/projects/:projectId/enterprise-access/oidc",
    { schema: { tags: ["security"], params: projectParams, body: oidcBodySchema } },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (project === undefined) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeEnterpriseMutation(request, project);
      if (denied !== undefined) return reply.code(403).send(denied);
      const validation = validateOidcProvider(request.body);
      if (validation !== undefined)
        return reply.code(400).send({ message: validation, redacted: true });
      const now = new Date().toISOString();
      const provider: ProjectOidcProvider = {
        id: randomUUID(),
        name: request.body.name.trim(),
        issuer: normalizeIssuer(request.body.issuer),
        clientId: request.body.clientId.trim(),
        clientSecretEnvVar: request.body.clientSecretEnvVar.trim(),
        scopes: normalizeScopes(request.body.scopes),
        defaultRole: request.body.defaultRole ?? "viewer",
        enabled: request.body.enabled ?? true,
        createdAt: now,
        updatedAt: now
      };
      const settings = getProjectAccessSettings(project, now);
      project.accessSettings = {
        ...settings,
        oidcProviders: [...(settings.oidcProviders ?? []), provider],
        updatedAt: now
      };
      await saveProject(store, project);
      await auditEnterprise(
        store,
        request,
        project.id,
        "auth.oidc-provider.created",
        provider.id,
        provider.name
      );
      return reply.code(201).send({ kind: "oidc-provider", provider });
    }
  );

  app.patch<{ Params: { projectId: string; providerId: string }; Body: Partial<OidcProviderBody> }>(
    "/api/v1/projects/:projectId/enterprise-access/oidc/:providerId",
    { schema: { tags: ["security"], params: providerParams, body: oidcPatchSchema } },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (project === undefined) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeEnterpriseMutation(request, project);
      if (denied !== undefined) return reply.code(403).send(denied);
      const settings = getProjectAccessSettings(project, new Date().toISOString());
      const previous = settings.oidcProviders?.find(
        (item) => item.id === request.params.providerId
      );
      if (previous === undefined)
        return reply.code(404).send({ message: "OIDC provider not found" });
      const candidate: OidcProviderBody = {
        name: request.body.name ?? previous.name,
        issuer: request.body.issuer ?? previous.issuer,
        clientId: request.body.clientId ?? previous.clientId,
        clientSecretEnvVar: request.body.clientSecretEnvVar ?? previous.clientSecretEnvVar,
        scopes: request.body.scopes ?? previous.scopes,
        defaultRole: request.body.defaultRole ?? previous.defaultRole,
        enabled: request.body.enabled ?? previous.enabled
      };
      const validation = validateOidcProvider(candidate);
      if (validation !== undefined)
        return reply.code(400).send({ message: validation, redacted: true });
      const updated: ProjectOidcProvider = {
        ...previous,
        name: candidate.name.trim(),
        issuer: normalizeIssuer(candidate.issuer),
        clientId: candidate.clientId.trim(),
        clientSecretEnvVar: candidate.clientSecretEnvVar.trim(),
        scopes: normalizeScopes(candidate.scopes),
        defaultRole: candidate.defaultRole ?? "viewer",
        enabled: candidate.enabled ?? true,
        updatedAt: new Date().toISOString()
      };
      project.accessSettings = {
        ...settings,
        oidcProviders: (settings.oidcProviders ?? []).map((item) =>
          item.id === updated.id ? updated : item
        ),
        updatedAt: updated.updatedAt
      };
      await saveProject(store, project);
      await auditEnterprise(
        store,
        request,
        project.id,
        "auth.oidc-provider.updated",
        updated.id,
        updated.name
      );
      return { kind: "oidc-provider", provider: updated };
    }
  );

  app.delete<{ Params: { projectId: string; providerId: string } }>(
    "/api/v1/projects/:projectId/enterprise-access/oidc/:providerId",
    { schema: { tags: ["security"], params: providerParams } },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (project === undefined) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeEnterpriseMutation(request, project);
      if (denied !== undefined) return reply.code(403).send(denied);
      const settings = getProjectAccessSettings(project, new Date().toISOString());
      const previous = settings.oidcProviders?.find(
        (item) => item.id === request.params.providerId
      );
      if (previous === undefined)
        return reply.code(404).send({ message: "OIDC provider not found" });
      project.accessSettings = {
        ...settings,
        oidcProviders: (settings.oidcProviders ?? []).filter((item) => item.id !== previous.id),
        updatedAt: new Date().toISOString()
      };
      await saveProject(store, project);
      await auditEnterprise(
        store,
        request,
        project.id,
        "auth.oidc-provider.deleted",
        previous.id,
        previous.name
      );
      return { kind: "oidc-provider-deleted", id: previous.id };
    }
  );

  app.post<{ Params: { projectId: string; providerId: string } }>(
    "/api/v1/projects/:projectId/enterprise-access/oidc/:providerId/discover",
    { schema: { tags: ["security"], params: providerParams } },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (project === undefined) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeProjectVisibilityRead(request, project, "settings:read");
      if (denied !== undefined) return reply.code(403).send(denied);
      const provider = getProjectAccessSettings(project, project.createdAt).oidcProviders?.find(
        (item) => item.id === request.params.providerId
      );
      if (provider === undefined)
        return reply.code(404).send({ message: "OIDC provider not found" });
      try {
        return {
          kind: "oidc-discovery",
          providerId: provider.id,
          discovery: await discoverOidc(provider)
        };
      } catch (error) {
        return reply.code(502).send({ message: safeError(error), redacted: true });
      }
    }
  );

  app.post<{ Params: { projectId: string }; Body: { defaultRole?: ProjectRole } }>(
    "/api/v1/projects/:projectId/enterprise-access/scim/token",
    { schema: { tags: ["security"], params: projectParams, body: scimTokenBodySchema } },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (project === undefined) return reply.code(404).send({ message: "Project not found" });
      const denied = authorizeEnterpriseMutation(request, project);
      if (denied !== undefined) return reply.code(403).send(denied);
      const now = new Date().toISOString();
      const prefix = `thscim_${randomBytes(5).toString("hex")}`;
      const secret = `${prefix}_${randomBytes(32).toString("base64url")}`;
      const settings = getProjectAccessSettings(project, now);
      project.accessSettings = {
        ...settings,
        scimProvisioning: {
          enabled: true,
          tokenPrefix: prefix,
          tokenHash: hashOpaqueSecret(secret),
          defaultRole:
            request.body.defaultRole ?? settings.scimProvisioning?.defaultRole ?? "viewer",
          createdAt: settings.scimProvisioning?.createdAt ?? now,
          updatedAt: now
        },
        updatedAt: now
      };
      await saveProject(store, project);
      await auditEnterprise(
        store,
        request,
        project.id,
        "auth.scim-token.rotated",
        project.id,
        "SCIM"
      );
      return reply.code(201).send({
        kind: "scim-token-created",
        secret,
        secretShownOnce: true,
        endpoint: `/api/scim/v2/projects/${project.id}`,
        provisioning: enterpriseAccessRead(project).scimProvisioning
      });
    }
  );

  registerScimUserRoutes(app, store);
}

function registerScimUserRoutes(app: FastifyInstance, store: AppStore) {
  app.get<{
    Params: { projectId: string };
    Querystring: { startIndex?: number; count?: number; filter?: string };
  }>(
    "/api/scim/v2/projects/:projectId/Users",
    { schema: { tags: ["security"], params: projectParams, querystring: scimListQuerySchema } },
    async (request, reply) => {
      const access = authenticateScim(request, store, request.params.projectId);
      if ("error" in access) return scimError(reply, access.status, access.error);
      const all = access.settings.memberships
        .filter((item) => item.source === "scim")
        .filter((item) => matchesScimFilter(item, request.query.filter));
      const startIndex = request.query.startIndex ?? 1;
      const count = request.query.count ?? 100;
      const resources = all.slice(startIndex - 1, startIndex - 1 + count).map(toScimUser);
      return {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        totalResults: all.length,
        startIndex,
        itemsPerPage: resources.length,
        Resources: resources
      };
    }
  );

  app.post<{ Params: { projectId: string }; Body: ScimUserBody }>(
    "/api/scim/v2/projects/:projectId/Users",
    { schema: { tags: ["security"], params: projectParams, body: scimUserBodySchema } },
    async (request, reply) => {
      const access = authenticateScim(request, store, request.params.projectId);
      if ("error" in access) return scimError(reply, access.status, access.error);
      const existing = access.settings.memberships.find(
        (item) => item.source === "scim" && item.subject === scimSubject(request.body)
      );
      if (existing !== undefined) return scimError(reply, 409, "SCIM user already exists");
      const now = new Date().toISOString();
      const membership = scimMembership(
        request.body,
        access.settings.scimProvisioning!.defaultRole,
        now
      );
      access.project.accessSettings = {
        ...access.settings,
        memberships: [...access.settings.memberships, membership],
        scimProvisioning: { ...access.settings.scimProvisioning!, lastUsedAt: now },
        updatedAt: now
      };
      await saveProject(store, access.project);
      await auditEnterprise(
        store,
        request,
        access.project.id,
        "auth.scim-user.provisioned",
        membership.id,
        membership.displayName,
        "service"
      );
      return reply
        .code(201)
        .header("location", `/api/scim/v2/projects/${access.project.id}/Users/${membership.id}`)
        .send(toScimUser(membership));
    }
  );

  app.patch<{
    Params: { projectId: string; userId: string };
    Body: { Operations?: Array<{ op?: string; path?: string; value?: unknown }> };
  }>(
    "/api/scim/v2/projects/:projectId/Users/:userId",
    { schema: { tags: ["security"], params: scimUserParams, body: scimPatchBodySchema } },
    async (request, reply) => {
      const access = authenticateScim(request, store, request.params.projectId);
      if ("error" in access) return scimError(reply, access.status, access.error);
      const membership = access.settings.memberships.find(
        (item) => item.id === request.params.userId && item.source === "scim"
      );
      if (membership === undefined) return scimError(reply, 404, "SCIM user not found");
      const updated = applyScimPatch(membership, request.body.Operations ?? []);
      const now = new Date().toISOString();
      updated.updatedAt = now;
      access.project.accessSettings = {
        ...access.settings,
        memberships: access.settings.memberships.map((item) =>
          item.id === updated.id ? updated : item
        ),
        scimProvisioning: { ...access.settings.scimProvisioning!, lastUsedAt: now },
        updatedAt: now
      };
      await saveProject(store, access.project);
      await auditEnterprise(
        store,
        request,
        access.project.id,
        updated.status === "disabled" ? "auth.scim-user.disabled" : "auth.scim-user.updated",
        updated.id,
        updated.displayName,
        "service"
      );
      return toScimUser(updated);
    }
  );

  app.delete<{ Params: { projectId: string; userId: string } }>(
    "/api/scim/v2/projects/:projectId/Users/:userId",
    { schema: { tags: ["security"], params: scimUserParams } },
    async (request, reply) => {
      const access = authenticateScim(request, store, request.params.projectId);
      if ("error" in access) return scimError(reply, access.status, access.error);
      const membership = access.settings.memberships.find(
        (item) => item.id === request.params.userId && item.source === "scim"
      );
      if (membership === undefined) return scimError(reply, 404, "SCIM user not found");
      const now = new Date().toISOString();
      membership.status = "disabled";
      membership.updatedAt = now;
      access.project.accessSettings = {
        ...access.settings,
        memberships: access.settings.memberships.map((item) =>
          item.id === membership.id ? membership : item
        ),
        scimProvisioning: { ...access.settings.scimProvisioning!, lastUsedAt: now },
        updatedAt: now
      };
      await saveProject(store, access.project);
      await auditEnterprise(
        store,
        request,
        access.project.id,
        "auth.scim-user.disabled",
        membership.id,
        membership.displayName,
        "service"
      );
      return reply.code(204).send();
    }
  );
}

function enterpriseAccessRead(project: Parameters<typeof getProjectAccessSettings>[0]) {
  const settings = getProjectAccessSettings(project, project.createdAt);
  return {
    kind: "enterprise-access",
    projectId: project.id,
    oidcProviders: settings.oidcProviders ?? [],
    scimProvisioning:
      settings.scimProvisioning === undefined
        ? undefined
        : {
            enabled: settings.scimProvisioning.enabled,
            tokenPrefix: settings.scimProvisioning.tokenPrefix,
            defaultRole: settings.scimProvisioning.defaultRole,
            createdAt: settings.scimProvisioning.createdAt,
            updatedAt: settings.scimProvisioning.updatedAt,
            lastUsedAt: settings.scimProvisioning.lastUsedAt
          },
    scimUsers: settings.memberships.filter((item) => item.source === "scim").length
  };
}

function authorizeEnterpriseMutation(
  request: FastifyRequest,
  project: Parameters<typeof getProjectAccessSettings>[0]
) {
  return authorizeProjectMutation(
    request,
    project,
    "settings:write",
    ["owner", "maintainer"],
    "Actor role is not allowed to manage enterprise access"
  );
}

function validateOidcProvider(body: OidcProviderBody): string | undefined {
  if (body.name.trim().length === 0 || body.name.length > 200) return "name is invalid";
  if (body.clientId.trim().length === 0 || body.clientId.length > 300) return "clientId is invalid";
  if (!/^[A-Z][A-Z0-9_]{2,127}$/.test(body.clientSecretEnvVar.trim()))
    return "clientSecretEnvVar must be an environment variable name";
  try {
    parseSafeOutboundUrl(normalizeIssuer(body.issuer));
  } catch (error) {
    return safeError(error);
  }
  if (
    normalizeScopes(body.scopes).length === 0 ||
    normalizeScopes(body.scopes).some((scope) => scope.length > 100)
  )
    return "scopes are invalid";
  return undefined;
}

function normalizeIssuer(value: string) {
  return value.trim().replace(/\/+$/, "");
}
function normalizeScopes(value: string[] | undefined) {
  return [...new Set(value ?? ["openid", "profile", "email"])]
    .map((item) => item.trim())
    .filter(Boolean);
}

async function discoverOidc(provider: ProjectOidcProvider) {
  const url = parseSafeOutboundUrl(`${provider.issuer}/.well-known/openid-configuration`);
  await assertSafeOutboundDestination(url);
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(7_000),
    headers: { accept: "application/json" }
  });
  if (!response.ok) throw new Error(`OIDC discovery returned ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > 65_536) throw new Error("OIDC discovery response is too large");
  const text = await response.text();
  if (Buffer.byteLength(text) > 65_536) throw new Error("OIDC discovery response is too large");
  const value = JSON.parse(text) as Record<string, unknown>;
  if (value.issuer !== provider.issuer)
    throw new Error("OIDC discovery issuer does not match configuration");
  const authorizationEndpoint = safeDiscoveryUrl(value.authorization_endpoint);
  const tokenEndpoint = safeDiscoveryUrl(value.token_endpoint);
  const jwksUri = safeDiscoveryUrl(value.jwks_uri);
  return { issuer: provider.issuer, authorizationEndpoint, tokenEndpoint, jwksUri };
}

function safeDiscoveryUrl(value: unknown) {
  if (typeof value !== "string") throw new Error("OIDC discovery is missing a required endpoint");
  return parseSafeOutboundUrl(value).toString();
}

function authenticateScim(
  request: FastifyRequest,
  store: AppStore,
  projectId: string
): { error: string; status: number } | { project: Project; settings: ProjectAccessSettings } {
  const project = store.projects.get(projectId);
  if (project === undefined) return { error: "Project not found", status: 404 as const };
  const settings = getProjectAccessSettings(project, project.createdAt);
  const secret = bearerToken(request.headers.authorization);
  if (
    settings.scimProvisioning?.enabled !== true ||
    secret === undefined ||
    hashOpaqueSecret(secret) !== settings.scimProvisioning.tokenHash
  ) {
    return { error: "SCIM bearer token is invalid", status: 401 as const };
  }
  return { project, settings };
}

function bearerToken(value: FastifyRequest["headers"]["authorization"]) {
  const source = Array.isArray(value) ? value[0] : value;
  return typeof source === "string" ? /^Bearer\s+(.+)$/i.exec(source.trim())?.[1] : undefined;
}

function scimMembership(
  body: ScimUserBody,
  defaultRole: ProjectRole,
  now: string
): ProjectMembership {
  const email = primaryEmail(body);
  return {
    id: randomUUID(),
    subject: scimSubject(body),
    displayName: body.displayName?.trim() || email || body.userName.trim(),
    ...(email !== undefined ? { email } : {}),
    role: scimRole(body.roles) ?? defaultRole,
    source: "scim",
    status: body.active === false ? "disabled" : "active",
    createdAt: now,
    updatedAt: now
  };
}

function scimSubject(body: ScimUserBody) {
  return (body.externalId?.trim() || body.userName.trim()).toLowerCase();
}
function primaryEmail(body: ScimUserBody) {
  return (
    body.emails
      ?.find((item) => item.primary)
      ?.value?.trim()
      .toLowerCase() ??
    body.emails?.[0]?.value?.trim().toLowerCase() ??
    (body.userName.includes("@") ? body.userName.trim().toLowerCase() : undefined)
  );
}
function scimRole(roles: ScimUserBody["roles"]) {
  const value = roles
    ?.map((item) => (typeof item === "string" ? item : item.value))
    .find(
      (item): item is string =>
        typeof item === "string" && projectRoles.includes(item as ProjectRole)
    );
  return value as ProjectRole | undefined;
}

function applyScimPatch(
  membership: ProjectMembership,
  operations: Array<{ op?: string; path?: string; value?: unknown }>
) {
  const updated = { ...membership };
  for (const operation of operations) {
    if (operation.op?.toLowerCase() !== "replace") continue;
    const path = operation.path?.toLowerCase();
    if (path === "active" && typeof operation.value === "boolean")
      updated.status = operation.value ? "active" : "disabled";
    if (path === "displayname" && typeof operation.value === "string" && operation.value.trim())
      updated.displayName = operation.value.trim();
    if (path === "roles") {
      const role = scimRole(
        Array.isArray(operation.value) ? (operation.value as ScimUserBody["roles"]) : undefined
      );
      if (role !== undefined) updated.role = role;
    }
  }
  return updated;
}

function toScimUser(membership: ProjectMembership) {
  return {
    schemas: [scimUserSchema],
    id: membership.id,
    externalId: membership.subject,
    userName: membership.email ?? membership.subject,
    displayName: membership.displayName,
    active: membership.status === "active",
    ...(membership.email !== undefined
      ? { emails: [{ value: membership.email, primary: true }] }
      : {}),
    roles: [{ value: membership.role }],
    meta: {
      resourceType: "User",
      created: membership.createdAt,
      lastModified: membership.updatedAt
    }
  };
}

function matchesScimFilter(membership: ProjectMembership, filter: string | undefined) {
  if (filter === undefined) return true;
  const match = /^userName\s+eq\s+"([^"]{1,320})"$/i.exec(filter.trim());
  return (
    match !== null &&
    (membership.email ?? membership.subject).toLowerCase() === match[1]!.toLowerCase()
  );
}

function scimError(
  reply: { code(status: number): { type(value: string): { send(value: unknown): unknown } } },
  status: number,
  detail: string
) {
  return reply
    .code(status)
    .type("application/scim+json")
    .send({ schemas: [scimErrorSchema], status: String(status), detail });
}

async function saveProject(
  store: AppStore,
  project: Parameters<typeof getProjectAccessSettings>[0]
) {
  store.projects.set(project.id, project);
  if (store.driver === "postgres")
    await store.repositories.projects.save(toPersistentProject(project));
}

async function auditEnterprise(
  store: AppStore,
  request: FastifyRequest,
  projectId: string,
  type: Parameters<typeof createSecurityAuditEvent>[0]["type"],
  id: string,
  name: string,
  actor: "actor" | "service" = "actor"
) {
  await appendStoreSecurityAuditEvents(store, [
    createSecurityAuditEvent({
      projectId,
      type,
      outcome: "allowed",
      occurredAt: new Date().toISOString(),
      actor:
        actor === "service"
          ? { type: "service", serviceId: `scim:${projectId}` }
          : { type: "actor", actorId: actorIdHeader(request) ?? "system" },
      resource: { type: type.startsWith("auth.scim") ? "scim-user" : "oidc-provider", id, name },
      request: {
        method: request.method,
        requestId: request.id,
        ...(request.routeOptions.url !== undefined ? { route: request.routeOptions.url } : {})
      }
    })
  ]);
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 300) : "Enterprise access request failed";
}
