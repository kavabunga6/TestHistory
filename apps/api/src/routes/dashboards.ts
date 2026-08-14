import type { AuthTokenScope, ProjectRole } from "@testhistory/contracts";
import type { FastifyInstance } from "fastify";
import type { AppStore, DashboardRecord, WidgetRecord } from "../store.js";
import {
  authorizeProjectMutation,
  authorizeProjectVisibilityRead,
  hasProjectAuthSignals
} from "./project-auth.js";

type DashboardBody = {
  projectId: string;
  name: string;
  description?: string;
};

type DashboardPatchBody = Partial<Pick<DashboardBody, "name" | "description">>;

type WidgetBody = {
  title: string;
  type?: WidgetRecord["type"];
  query?: Record<string, unknown>;
  layout?: Record<string, unknown>;
};

type WidgetPatchBody = Partial<WidgetBody>;

const dashboardReadScope: AuthTokenScope = "dashboards:read";
const dashboardWriteScope: AuthTokenScope = "dashboards:write";
const dashboardWriteRoles: readonly ProjectRole[] = ["owner", "maintainer", "editor"];

export async function registerDashboardRoutes(app: FastifyInstance, store: AppStore) {
  app.get<{ Querystring: { projectId?: string } }>(
    "/api/v1/dashboards",
    {
      schema: {
        tags: ["dashboards"],
        querystring: {
          type: "object",
          properties: {
            projectId: { type: "string" }
          }
        }
      }
    },
    async (request, reply) => {
      if (request.query.projectId !== undefined) {
        const project = store.projects.get(request.query.projectId);
        if (project === undefined) {
          return reply.code(404).send({ message: "Project not found" });
        }
        const denied = authorizeProjectVisibilityRead(request, project, dashboardReadScope);
        if (denied !== undefined) {
          return reply.code(403).send(denied);
        }
      }

      return {
        kind: "dashboard-list",
        items: Array.from(store.dashboards.values())
          .filter(
            (dashboard) =>
              request.query.projectId === undefined ||
              dashboard.projectId === request.query.projectId
          )
          .filter((dashboard) => {
            if (!hasProjectAuthSignals(request)) {
              return true;
            }
            const project = store.projects.get(dashboard.projectId);
            return (
              project !== undefined &&
              authorizeProjectVisibilityRead(request, project, dashboardReadScope) === undefined
            );
          })
          .map((dashboard) => serializeDashboard(store, dashboard))
      };
    }
  );

  app.post<{ Body: DashboardBody }>(
    "/api/v1/dashboards",
    {
      schema: {
        tags: ["dashboards"],
        body: dashboardBodySchema(["projectId", "name"])
      }
    },
    async (request, reply) => {
      const project = store.projects.get(request.body.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const denied = authorizeProjectMutation(
        request,
        project,
        dashboardWriteScope,
        dashboardWriteRoles,
        "Actor role is not allowed to manage dashboards"
      );
      if (denied !== undefined) {
        return reply.code(403).send(denied);
      }

      const now = new Date().toISOString();
      const dashboard: DashboardRecord = {
        id: crypto.randomUUID(),
        projectId: request.body.projectId,
        name: request.body.name,
        ...(request.body.description !== undefined
          ? { description: request.body.description }
          : {}),
        createdAt: now,
        updatedAt: now
      };
      store.dashboards.set(dashboard.id, dashboard);
      return reply.code(201).send(serializeDashboard(store, dashboard));
    }
  );

  app.get<{ Params: { dashboardId: string } }>(
    "/api/v1/dashboards/:dashboardId",
    {
      schema: {
        tags: ["dashboards"],
        params: idParamsSchema("dashboardId")
      }
    },
    async (request, reply) => {
      const dashboard = store.dashboards.get(request.params.dashboardId);
      if (dashboard === undefined) {
        return reply.code(404).send({ message: "Dashboard not found" });
      }
      const project = store.projects.get(dashboard.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const denied = authorizeProjectVisibilityRead(request, project, dashboardReadScope);
      if (denied !== undefined) {
        return reply.code(403).send(denied);
      }
      return serializeDashboard(store, dashboard);
    }
  );

  app.patch<{ Params: { dashboardId: string }; Body: DashboardPatchBody }>(
    "/api/v1/dashboards/:dashboardId",
    {
      schema: {
        tags: ["dashboards"],
        params: idParamsSchema("dashboardId"),
        body: dashboardBodySchema([])
      }
    },
    async (request, reply) => {
      const dashboard = store.dashboards.get(request.params.dashboardId);
      if (dashboard === undefined) {
        return reply.code(404).send({ message: "Dashboard not found" });
      }
      const project = store.projects.get(dashboard.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const denied = authorizeProjectMutation(
        request,
        project,
        dashboardWriteScope,
        dashboardWriteRoles,
        "Actor role is not allowed to manage dashboards"
      );
      if (denied !== undefined) {
        return reply.code(403).send(denied);
      }

      if (request.body.name !== undefined) {
        dashboard.name = request.body.name;
      }
      if (request.body.description !== undefined) {
        dashboard.description = request.body.description;
      }
      dashboard.updatedAt = new Date().toISOString();
      return serializeDashboard(store, dashboard);
    }
  );

  app.delete<{ Params: { dashboardId: string } }>(
    "/api/v1/dashboards/:dashboardId",
    {
      schema: {
        tags: ["dashboards"],
        params: idParamsSchema("dashboardId")
      }
    },
    async (request, reply) => {
      const dashboard = store.dashboards.get(request.params.dashboardId);
      if (dashboard === undefined) {
        return reply.code(404).send({ message: "Dashboard not found" });
      }
      const project = store.projects.get(dashboard.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const denied = authorizeProjectMutation(
        request,
        project,
        dashboardWriteScope,
        dashboardWriteRoles,
        "Actor role is not allowed to manage dashboards"
      );
      if (denied !== undefined) {
        return reply.code(403).send(denied);
      }
      store.dashboards.delete(request.params.dashboardId);
      for (const widget of store.widgets.values()) {
        if (widget.dashboardId === request.params.dashboardId) {
          store.widgets.delete(widget.id);
        }
      }
      return reply.code(204).send();
    }
  );

  app.get<{ Params: { dashboardId: string } }>(
    "/api/v1/dashboards/:dashboardId/widgets",
    {
      schema: {
        tags: ["dashboards"],
        params: idParamsSchema("dashboardId")
      }
    },
    async (request, reply) => {
      const dashboard = store.dashboards.get(request.params.dashboardId);
      if (dashboard === undefined) {
        return reply.code(404).send({ message: "Dashboard not found" });
      }
      const project = store.projects.get(dashboard.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const denied = authorizeProjectVisibilityRead(request, project, dashboardReadScope);
      if (denied !== undefined) {
        return reply.code(403).send(denied);
      }
      return {
        kind: "widget-list",
        dashboardId: request.params.dashboardId,
        items: dashboardWidgets(store, request.params.dashboardId)
      };
    }
  );

  app.post<{ Params: { dashboardId: string }; Body: WidgetBody }>(
    "/api/v1/dashboards/:dashboardId/widgets",
    {
      schema: {
        tags: ["dashboards"],
        params: idParamsSchema("dashboardId"),
        body: widgetBodySchema(["title"])
      }
    },
    async (request, reply) => {
      const dashboard = store.dashboards.get(request.params.dashboardId);
      if (dashboard === undefined) {
        return reply.code(404).send({ message: "Dashboard not found" });
      }
      const project = store.projects.get(dashboard.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const denied = authorizeProjectMutation(
        request,
        project,
        dashboardWriteScope,
        dashboardWriteRoles,
        "Actor role is not allowed to manage dashboards"
      );
      if (denied !== undefined) {
        return reply.code(403).send(denied);
      }

      const now = new Date().toISOString();
      const widget: WidgetRecord = {
        id: crypto.randomUUID(),
        dashboardId: request.params.dashboardId,
        title: request.body.title,
        type: request.body.type ?? "metric",
        query: request.body.query ?? { entity: "launches" },
        ...(request.body.layout !== undefined ? { layout: request.body.layout } : {}),
        createdAt: now,
        updatedAt: now
      };
      store.widgets.set(widget.id, widget);
      return reply.code(201).send(widget);
    }
  );

  app.patch<{ Params: { dashboardId: string; widgetId: string }; Body: WidgetPatchBody }>(
    "/api/v1/dashboards/:dashboardId/widgets/:widgetId",
    {
      schema: {
        tags: ["dashboards"],
        params: {
          type: "object",
          required: ["dashboardId", "widgetId"],
          properties: {
            dashboardId: { type: "string" },
            widgetId: { type: "string" }
          }
        },
        body: widgetBodySchema([])
      }
    },
    async (request, reply) => {
      const widget = store.widgets.get(request.params.widgetId);
      if (widget === undefined || widget.dashboardId !== request.params.dashboardId) {
        return reply.code(404).send({ message: "Widget not found" });
      }
      const dashboard = store.dashboards.get(widget.dashboardId);
      if (dashboard === undefined) {
        return reply.code(404).send({ message: "Dashboard not found" });
      }
      const project = store.projects.get(dashboard.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const denied = authorizeProjectMutation(
        request,
        project,
        dashboardWriteScope,
        dashboardWriteRoles,
        "Actor role is not allowed to manage dashboards"
      );
      if (denied !== undefined) {
        return reply.code(403).send(denied);
      }
      if (request.body.title !== undefined) {
        widget.title = request.body.title;
      }
      if (request.body.type !== undefined) {
        widget.type = request.body.type;
      }
      if (request.body.query !== undefined) {
        widget.query = request.body.query;
      }
      if (request.body.layout !== undefined) {
        widget.layout = request.body.layout;
      }
      widget.updatedAt = new Date().toISOString();
      return widget;
    }
  );

  app.delete<{ Params: { dashboardId: string; widgetId: string } }>(
    "/api/v1/dashboards/:dashboardId/widgets/:widgetId",
    {
      schema: {
        tags: ["dashboards"],
        params: {
          type: "object",
          required: ["dashboardId", "widgetId"],
          properties: {
            dashboardId: { type: "string" },
            widgetId: { type: "string" }
          }
        }
      }
    },
    async (request, reply) => {
      const widget = store.widgets.get(request.params.widgetId);
      if (widget === undefined || widget.dashboardId !== request.params.dashboardId) {
        return reply.code(404).send({ message: "Widget not found" });
      }
      const dashboard = store.dashboards.get(widget.dashboardId);
      if (dashboard === undefined) {
        return reply.code(404).send({ message: "Dashboard not found" });
      }
      const project = store.projects.get(dashboard.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const denied = authorizeProjectMutation(
        request,
        project,
        dashboardWriteScope,
        dashboardWriteRoles,
        "Actor role is not allowed to manage dashboards"
      );
      if (denied !== undefined) {
        return reply.code(403).send(denied);
      }
      store.widgets.delete(widget.id);
      return reply.code(204).send();
    }
  );
}

function dashboardBodySchema(required: string[]) {
  return {
    type: "object",
    required,
    additionalProperties: false,
    properties: {
      projectId: { type: "string" },
      name: { type: "string" },
      description: { type: "string" }
    }
  };
}

function widgetBodySchema(required: string[]) {
  return {
    type: "object",
    required,
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      type: { type: "string", enum: ["metric", "table", "chart"] },
      query: { type: "object", additionalProperties: true },
      layout: { type: "object", additionalProperties: true }
    }
  };
}

function idParamsSchema(name: string) {
  return {
    type: "object",
    required: [name],
    properties: {
      [name]: { type: "string" }
    }
  };
}

function serializeDashboard(store: AppStore, dashboard: DashboardRecord) {
  return {
    ...dashboard,
    widgets: dashboardWidgets(store, dashboard.id)
  };
}

function dashboardWidgets(store: AppStore, dashboardId: string) {
  return Array.from(store.widgets.values()).filter((widget) => widget.dashboardId === dashboardId);
}
