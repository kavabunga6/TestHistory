import type { AuthTokenScope, ProjectRole } from "@testhistory/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type {
  AppStore,
  ThqlFilterEntity,
  ThqlFilterScope,
  ThqlSavedFilterRecord
} from "../store.js";
import { authenticateUser } from "./auth.js";
import {
  actorIdHeader,
  authorizeProjectMutation,
  authorizeProjectVisibilityRead
} from "./project-auth.js";

type FilterListQuery = {
  entity?: ThqlFilterEntity;
  projectId?: string;
};

type FilterBody = {
  description?: string;
  entity: ThqlFilterEntity;
  name: string;
  projectId?: string;
  query: string;
  scope: ThqlFilterScope;
};

const filterEntities = ["defects", "launchResults", "launches", "testCases"] as const;
const filterScopes = ["global", "personal", "project"] as const;
const settingsReadScope: AuthTokenScope = "settings:read";
const settingsWriteScope: AuthTokenScope = "settings:write";
const projectFilterRoles: readonly ProjectRole[] = ["owner"];

export async function registerThqlFilterRoutes(app: FastifyInstance, store: AppStore) {
  app.get<{ Querystring: FilterListQuery }>(
    "/api/v1/thql/filters",
    {
      schema: {
        tags: ["query"],
        querystring: filterListQuerySchema()
      }
    },
    async (request, reply) => {
      const query = normalizeFilterListQuery(store, request.query);
      const accessDenial = authorizeFilterList(request, store, query);
      if (accessDenial !== undefined) {
        return reply.code(accessDenial.statusCode).send(accessDenial.body);
      }
      const actorId = resolveActorId(request, store);
      return {
        kind: "thql-filter-list",
        items: Array.from(store.thqlFilters.values())
          .filter((filter) => matchesFilterQuery(filter, query))
          .filter((filter) => canReadFilter(filter, actorId, request, store))
          .map(serializeFilter)
      };
    }
  );

  app.post<{ Body: FilterBody }>(
    "/api/v1/thql/filters",
    {
      schema: {
        tags: ["query"],
        body: filterBodySchema()
      }
    },
    async (request, reply) => {
      const validation = validateFilterBody(request.body);
      if (validation !== undefined) {
        return reply.code(400).send({ message: validation, redacted: true });
      }
      const denial = authorizeFilterMutation(request, store, request.body);
      if (denial !== undefined) {
        return reply.code(denial.statusCode).send(denial.body);
      }

      const actorId = resolveActorId(request, store);
      const projectId =
        request.body.scope === "project"
          ? resolveProjectIdentifier(store, request.body.projectId)?.id
          : undefined;
      const now = new Date().toISOString();
      const filter: ThqlSavedFilterRecord = {
        createdAt: now,
        createdBy: actorId,
        entity: request.body.entity,
        id: crypto.randomUUID(),
        name: request.body.name.trim(),
        query: request.body.query.trim(),
        scope: request.body.scope,
        updatedAt: now,
        ...(request.body.description !== undefined
          ? { description: request.body.description.trim() }
          : {}),
        ...(request.body.scope === "personal" ? { ownerId: actorId } : {}),
        ...(projectId !== undefined ? { projectId } : {})
      };
      store.thqlFilters.set(filter.id, filter);
      return reply.code(201).send({
        kind: "thql-filter-created",
        filter: serializeFilter(filter)
      });
    }
  );

  app.delete<{ Params: { filterId: string } }>(
    "/api/v1/thql/filters/:filterId",
    {
      schema: {
        tags: ["query"],
        params: {
          type: "object",
          additionalProperties: false,
          required: ["filterId"],
          properties: {
            filterId: { type: "string" }
          }
        }
      }
    },
    async (request, reply) => {
      const filter = store.thqlFilters.get(request.params.filterId);
      if (filter === undefined) {
        return reply.code(404).send({ message: "THQL filter not found", redacted: true });
      }
      const denial = authorizeExistingFilterMutation(request, store, filter);
      if (denial !== undefined) {
        return reply.code(denial.statusCode).send(denial.body);
      }
      store.thqlFilters.delete(filter.id);
      return { kind: "thql-filter-deleted", filterId: filter.id };
    }
  );
}

function authorizeFilterList(
  request: FastifyRequest,
  store: AppStore,
  query: FilterListQuery
): { body: unknown; statusCode: number } | undefined {
  if (query.projectId === undefined) {
    return undefined;
  }
  const project = resolveProjectIdentifier(store, query.projectId);
  if (project === undefined) {
    return { statusCode: 404, body: { message: "Project not found", redacted: true } };
  }
  const denial = authorizeProjectVisibilityRead(request, project, settingsReadScope);
  return denial === undefined ? undefined : { statusCode: 403, body: denial };
}

function authorizeFilterMutation(
  request: FastifyRequest,
  store: AppStore,
  body: FilterBody
): { body: unknown; statusCode: number } | undefined {
  if (body.scope === "personal") {
    return resolveActorId(request, store) === "anonymous"
      ? { statusCode: 401, body: { message: "Authentication required", redacted: true } }
      : undefined;
  }
  if (body.scope === "global") {
    return authorizeGlobalAdmin(request, store);
  }

  if (body.projectId === undefined) {
    return { statusCode: 400, body: { message: "projectId is required", redacted: true } };
  }
  const project = resolveProjectIdentifier(store, body.projectId);
  if (project === undefined) {
    return { statusCode: 404, body: { message: "Project not found", redacted: true } };
  }
  const denial = authorizeProjectMutation(
    request,
    project,
    settingsWriteScope,
    projectFilterRoles,
    "Actor role is not allowed to manage project THQL filters"
  );
  return denial === undefined ? undefined : { statusCode: 403, body: denial };
}

function authorizeExistingFilterMutation(
  request: FastifyRequest,
  store: AppStore,
  filter: ThqlSavedFilterRecord
) {
  if (filter.scope === "personal") {
    const actorId = resolveActorId(request, store);
    return actorId === filter.ownerId
      ? undefined
      : { statusCode: 403, body: { message: "Actor cannot delete this filter", redacted: true } };
  }
  if (filter.scope === "global") {
    return authorizeGlobalAdmin(request, store);
  }
  const projectId = filter.projectId;
  if (projectId === undefined) {
    return { statusCode: 400, body: { message: "Project filter is malformed", redacted: true } };
  }
  return authorizeFilterMutation(request, store, {
    entity: filter.entity,
    name: filter.name,
    projectId,
    query: filter.query,
    scope: "project"
  });
}

function authorizeGlobalAdmin(request: FastifyRequest, store: AppStore) {
  const principal = authenticateUser(request, store);
  if (principal === undefined) {
    return { statusCode: 401, body: { message: "Authentication required", redacted: true } };
  }
  return principal.user.role === "admin"
    ? undefined
    : {
        statusCode: 403,
        body: {
          message: "Only global admins can manage global THQL filters",
          redacted: true,
          requiredRoles: ["admin"]
        }
      };
}

function canReadFilter(
  filter: ThqlSavedFilterRecord,
  actorId: string,
  request: FastifyRequest,
  store: AppStore
) {
  if (filter.scope === "global") {
    return true;
  }
  if (filter.scope === "personal") {
    return filter.ownerId === actorId;
  }
  if (filter.projectId === undefined) {
    return false;
  }
  const project = store.projects.get(filter.projectId);
  return (
    project !== undefined &&
    authorizeProjectVisibilityRead(request, project, settingsReadScope) === undefined
  );
}

function resolveActorId(request: FastifyRequest, store: AppStore) {
  return authenticateUser(request, store)?.user.email ?? actorIdHeader(request) ?? "anonymous";
}

function matchesFilterQuery(filter: ThqlSavedFilterRecord, query: FilterListQuery) {
  return (
    (query.entity === undefined || filter.entity === query.entity) &&
    (query.projectId === undefined ||
      filter.scope !== "project" ||
      filter.projectId === query.projectId)
  );
}

function normalizeFilterListQuery(store: AppStore, query: FilterListQuery): FilterListQuery {
  if (query.projectId === undefined) {
    return query;
  }

  const project = resolveProjectIdentifier(store, query.projectId);
  return project === undefined ? query : { ...query, projectId: project.id };
}

function resolveProjectIdentifier(store: AppStore, identifier: string | undefined) {
  if (identifier === undefined) {
    return undefined;
  }

  return (
    store.projects.get(identifier) ??
    Array.from(store.projects.values()).find(
      (project) => project.key.toLowerCase() === identifier.toLowerCase()
    )
  );
}

function validateFilterBody(body: FilterBody) {
  if (!filterEntities.includes(body.entity)) return "entity is not supported";
  if (!filterScopes.includes(body.scope)) return "scope is not supported";
  if (body.name.trim().length === 0) return "name is required";
  if (body.query.trim().length === 0) return "query is required";
  if (body.scope === "project" && body.projectId === undefined) return "projectId is required";
  return undefined;
}

function serializeFilter(filter: ThqlSavedFilterRecord) {
  return {
    createdAt: filter.createdAt,
    createdBy: filter.createdBy,
    entity: filter.entity,
    id: filter.id,
    name: filter.name,
    query: filter.query,
    scope: filter.scope,
    updatedAt: filter.updatedAt,
    ...(filter.description !== undefined ? { description: filter.description } : {}),
    ...(filter.ownerId !== undefined ? { ownerId: filter.ownerId } : {}),
    ...(filter.projectId !== undefined ? { projectId: filter.projectId } : {})
  };
}

function filterListQuerySchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      entity: { type: "string", enum: filterEntities },
      projectId: { type: "string" }
    }
  };
}

function filterBodySchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["entity", "name", "query", "scope"],
    properties: {
      description: { type: "string" },
      entity: { type: "string", enum: filterEntities },
      name: { type: "string" },
      projectId: { type: "string" },
      query: { type: "string" },
      scope: { type: "string", enum: filterScopes }
    }
  };
}
