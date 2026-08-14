import type { AllureStatus, AuthTokenScope } from "@testhistory/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppStore, Launch } from "../store.js";
import { authorizeProjectVisibilityRead, hasProjectAuthSignals } from "./project-auth.js";
import {
  evaluateThql,
  getThqlFields,
  parseThql,
  thqlSearchFields,
  validateThqlFields
} from "./thql.js";

type QuerySpec = {
  entity?: string;
  projectId?: string;
  launchId?: string;
  filters?: Record<string, string | string[] | number | boolean>;
  metrics?: string[];
  groupBy?: string[];
  limit?: number;
  thql?: string;
};

type QueryBody = {
  query?: QuerySpec;
  limit?: number;
};

const queryEntities = ["launches", "results", "testCases"] as const;
const allureStatuses = ["failed", "broken", "passed", "skipped", "unknown"] as const;
const maxPreviewLimit = 100;
const analyticsReadScope: AuthTokenScope = "analytics:read";
const analyticsMetrics = [
  "count",
  "statusCounters",
  "passRate",
  "failureRate",
  "totalDurationMs",
  "averageDurationMs",
  "p50DurationMs",
  "p95DurationMs"
] as const;
const analyticsGroupFields = ["status", "projectId", "launchId", "branch"] as const;

export async function registerAnalyticsRoutes(app: FastifyInstance, store: AppStore) {
  app.post<{ Body: QueryBody }>(
    "/api/v1/query/validate",
    {
      schema: {
        tags: ["query"],
        body: queryBodySchema()
      }
    },
    async (request) => {
      const validation = validateQuerySpec(request.body?.query);
      return {
        kind: "query-validation",
        valid: validation.errors.length === 0,
        errors: validation.errors,
        normalized: validation.normalized,
        capabilities: queryCapabilities()
      };
    }
  );

  app.post<{ Body: QueryBody }>(
    "/api/v1/query/preview",
    {
      schema: {
        tags: ["query"],
        body: queryBodySchema()
      }
    },
    async (request, reply) => {
      const validation = validateQuerySpec(request.body?.query);
      if (validation.errors.length > 0) {
        return reply.code(400).send({
          kind: "query-preview",
          valid: false,
          errors: validation.errors
        });
      }

      const query = validation.normalized;
      const accessDenial = authorizeAnalyticsQuery(request, store, query);
      if (accessDenial !== undefined) {
        return reply.code(accessDenial.statusCode).send(accessDenial.body);
      }
      const limit = clampLimit(request.body?.limit ?? query.limit);
      const allRows = filterAuthorizedRows(request, store, runQueryPreview(store, query));
      const rows = allRows.slice(0, limit);
      return {
        kind: "query-preview",
        valid: true,
        query,
        page: {
          limit,
          returned: rows.length,
          truncated: allRows.length > rows.length
        },
        rows
      };
    }
  );

  app.post<{ Body: QueryBody }>(
    "/api/v1/analytics/run",
    {
      schema: {
        tags: ["analytics"],
        body: queryBodySchema()
      }
    },
    async (request, reply) => {
      const validation = validateQuerySpec(request.body?.query);
      if (validation.errors.length > 0) {
        return reply.code(400).send({
          kind: "analytics-run",
          valid: false,
          errors: validation.errors
        });
      }

      const accessDenial = authorizeAnalyticsQuery(request, store, validation.normalized);
      if (accessDenial !== undefined) {
        return reply.code(accessDenial.statusCode).send(accessDenial.body);
      }

      const rows = filterAuthorizedRows(
        request,
        store,
        runQueryPreview(store, validation.normalized)
      );
      return {
        kind: "analytics-run",
        valid: true,
        query: validation.normalized,
        result: summarizeRows(rows, validation.normalized)
      };
    }
  );
}

function authorizeAnalyticsQuery(request: FastifyRequest, store: AppStore, query: QuerySpec) {
  if (!hasProjectAuthSignals(request)) {
    return undefined;
  }

  const project = resolveQueryProject(store, query);
  if (project === "not-found") {
    return { statusCode: 404, body: { message: "Project not found" } };
  }
  if (project === undefined) {
    const firstProject = store.projects.values().next().value;
    if (firstProject === undefined) {
      return undefined;
    }
    const denial = authorizeProjectVisibilityRead(request, firstProject, analyticsReadScope);
    if (denial?.message.includes("API token") || denial?.message.includes("Missing required")) {
      return { statusCode: 403, body: denial };
    }
    return undefined;
  }

  const denial = authorizeProjectVisibilityRead(request, project, analyticsReadScope);
  if (denial !== undefined) {
    return { statusCode: 403, body: denial };
  }

  return undefined;
}

function resolveQueryProject(store: AppStore, query: QuerySpec) {
  if (query.launchId !== undefined) {
    const launch = store.launches.get(query.launchId);
    if (launch === undefined) {
      return "not-found";
    }
    return store.projects.get(launch.projectId) ?? "not-found";
  }
  if (query.projectId !== undefined) {
    return store.projects.get(query.projectId) ?? "not-found";
  }
  return undefined;
}

function filterAuthorizedRows(
  request: FastifyRequest,
  store: AppStore,
  rows: Array<Record<string, unknown>>
) {
  if (!hasProjectAuthSignals(request)) {
    return rows;
  }

  return rows.filter((row) => {
    if (typeof row.projectId !== "string") {
      return false;
    }
    const project = store.projects.get(row.projectId);
    return (
      project !== undefined &&
      authorizeProjectVisibilityRead(request, project, analyticsReadScope) === undefined
    );
  });
}

function queryBodySchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      limit: { type: "integer", minimum: 1, maximum: maxPreviewLimit },
      query: {
        type: "object",
        additionalProperties: false,
        properties: {
          entity: { type: "string" },
          projectId: { type: "string" },
          launchId: { type: "string" },
          filters: {
            type: "object",
            additionalProperties: {
              anyOf: [
                { type: "string" },
                { type: "number" },
                { type: "boolean" },
                { type: "array", items: { type: "string" } }
              ]
            }
          },
          metrics: { type: "array", items: { type: "string" } },
          groupBy: { type: "array", items: { type: "string" } },
          limit: { type: "integer", minimum: 1, maximum: maxPreviewLimit },
          thql: { type: "string", maxLength: 2000 }
        }
      }
    }
  };
}

function validateQuerySpec(input: QuerySpec | undefined) {
  const normalized: Required<Pick<QuerySpec, "entity">> & QuerySpec = {
    entity: input?.entity ?? "launches",
    ...(input?.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input?.launchId !== undefined ? { launchId: input.launchId } : {}),
    ...(input?.filters !== undefined ? { filters: input.filters } : {}),
    ...(input?.metrics !== undefined ? { metrics: input.metrics } : {}),
    ...(input?.groupBy !== undefined ? { groupBy: input.groupBy } : {}),
    ...(input?.limit !== undefined ? { limit: input.limit } : {}),
    ...(input?.thql !== undefined ? { thql: input.thql.trim() } : {})
  };
  const errors: Array<{ code: string; message: string; path: string }> = [];

  if (!isQueryEntity(normalized.entity)) {
    errors.push({
      code: "query.entity.unsupported",
      message: "entity must be one of launches, results, or testCases",
      path: "/query/entity"
    });
  }
  if (
    normalized.limit !== undefined &&
    (!Number.isInteger(normalized.limit) || normalized.limit < 1)
  ) {
    errors.push({
      code: "query.limit.invalid",
      message: "limit must be a positive integer",
      path: "/query/limit"
    });
  }
  for (const metric of normalized.metrics ?? []) {
    if (!(analyticsMetrics as readonly string[]).includes(metric)) {
      errors.push({
        code: "query.metric.unsupported",
        message: `Unsupported analytics metric: ${metric}`,
        path: "/query/metrics"
      });
    }
  }
  for (const field of normalized.groupBy ?? []) {
    if (!(analyticsGroupFields as readonly string[]).includes(field)) {
      errors.push({
        code: "query.group.unsupported",
        message: `Unsupported analytics group: ${field}`,
        path: "/query/groupBy"
      });
    }
  }
  if (
    normalized.entity === "results" &&
    normalized.projectId === undefined &&
    normalized.launchId === undefined
  ) {
    errors.push({
      code: "query.scope.required",
      message: "results queries require projectId or launchId",
      path: "/query"
    });
  }
  if (
    normalized.thql !== undefined &&
    normalized.thql.length > 0 &&
    isQueryEntity(normalized.entity)
  ) {
    try {
      errors.push(
        ...validateThqlFields(normalized.entity, getThqlFields(parseThql(normalized.thql)))
      );
    } catch (error) {
      errors.push({
        code: "query.thql.syntax",
        message: error instanceof Error ? error.message : "Invalid THQL query",
        path: "/query/thql"
      });
    }
  }

  return { normalized, errors };
}

function queryCapabilities() {
  return {
    entities: queryEntities,
    filters: {
      launches: thqlSearchFields.launches,
      results: thqlSearchFields.results,
      testCases: thqlSearchFields.testCases
    },
    metrics: analyticsMetrics,
    groupBy: analyticsGroupFields
  };
}

function runQueryPreview(store: AppStore, query: QuerySpec): Array<Record<string, unknown>> {
  if (query.entity === "results") {
    return Array.from(store.launches.values())
      .map((launch) => launch as Launch)
      .filter((launch) => matchesField(launch.projectId, query.projectId))
      .filter((launch) => matchesField(launch.id, query.launchId))
      .flatMap((launch) =>
        launch.results.map((result) => ({
          entity: "result",
          projectId: launch.projectId,
          launchId: launch.id,
          launchName: launch.name,
          branch: launch.branch,
          createdAt: launch.createdAt,
          uuid: result.uuid,
          name: result.name,
          status: result.status,
          testCaseId: result.testCaseId,
          historyId: result.historyId,
          durationMs: result.durationMs
        }))
      )
      .filter((row) => matchesFilters(row, query.filters))
      .filter((row) => matchesThql(row, query.thql));
  }

  if (query.entity === "testCases") {
    return Array.from(store.testCases.values())
      .filter((testCase) => matchesField(testCase.projectId, query.projectId))
      .map((testCase) => ({
        entity: "testCase",
        id: testCase.id,
        projectId: testCase.projectId,
        name: testCase.name,
        workflowStatus: testCase.workflowStatus,
        tags: testCase.tags,
        updatedAt: testCase.updatedAt
      }))
      .filter((row) => matchesFilters(row, query.filters))
      .filter((row) => matchesThql(row, query.thql));
  }

  return Array.from(store.launches.values())
    .map((launch) => launch as Launch)
    .filter((launch) => matchesField(launch.projectId, query.projectId))
    .map((launch) => ({
      entity: "launch",
      id: launch.id,
      projectId: launch.projectId,
      name: launch.name,
      status: launch.status,
      branch: launch.branch,
      resultCount: launch.results.length,
      createdAt: launch.createdAt
    }))
    .filter((row) => matchesFilters(row, query.filters))
    .filter((row) => matchesThql(row, query.thql));
}

function isQueryEntity(value: string): value is (typeof queryEntities)[number] {
  return (queryEntities as readonly string[]).includes(value);
}

function summarizeRows(rows: Array<Record<string, unknown>>, query: QuerySpec) {
  const statusCounters = Object.fromEntries(allureStatuses.map((status) => [status, 0])) as Record<
    AllureStatus,
    number
  >;
  for (const row of rows) {
    if (typeof row.status === "string" && row.status in statusCounters) {
      statusCounters[row.status as AllureStatus] += 1;
    }
  }

  return {
    rowCount: rows.length,
    metrics: summarizeMetricValues(rows, statusCounters),
    groups: groupRows(rows, query.groupBy ?? []),
    series: buildLaunchSeries(rows)
  };
}

function groupRows(rows: Array<Record<string, unknown>>, fields: string[]) {
  if (fields.length === 0) {
    return [];
  }

  const groups = new Map<
    string,
    { key: Record<string, unknown>; rows: Array<Record<string, unknown>> }
  >();
  for (const row of rows) {
    const key = Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
    const serialized = JSON.stringify(key);
    const existing = groups.get(serialized);
    if (existing === undefined) {
      groups.set(serialized, { key, rows: [row] });
    } else {
      existing.rows.push(row);
    }
  }
  return Array.from(groups.values()).map((group) => ({
    key: group.key,
    ...summarizeMetricValues(group.rows)
  }));
}

function summarizeMetricValues(
  rows: Array<Record<string, unknown>>,
  preparedCounters?: Record<AllureStatus, number>
) {
  const statusCounters =
    preparedCounters ??
    (Object.fromEntries(allureStatuses.map((status) => [status, 0])) as Record<
      AllureStatus,
      number
    >);
  if (preparedCounters === undefined) {
    for (const row of rows) {
      if (typeof row.status === "string" && row.status in statusCounters) {
        statusCounters[row.status as AllureStatus] += 1;
      }
    }
  }
  const totalStatuses = Object.values(statusCounters).reduce((total, count) => total + count, 0);
  const failures = statusCounters.failed + statusCounters.broken;
  const durations = rows
    .map((row) => row.durationMs)
    .filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0
    )
    .sort((left, right) => left - right);
  const totalDurationMs = durations.reduce((total, value) => total + value, 0);
  return {
    count: rows.length,
    statusCounters,
    passRate: totalStatuses === 0 ? null : statusCounters.passed / totalStatuses,
    failureRate: totalStatuses === 0 ? null : failures / totalStatuses,
    totalDurationMs,
    averageDurationMs:
      durations.length === 0 ? null : Math.round(totalDurationMs / durations.length),
    p50DurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95)
  };
}

function buildLaunchSeries(rows: Array<Record<string, unknown>>) {
  const launches = new Map<
    string,
    {
      id: string;
      name: string;
      branch?: string;
      createdAt: string;
      rows: Array<Record<string, unknown>>;
    }
  >();
  for (const row of rows) {
    if (typeof row.launchId !== "string" || typeof row.createdAt !== "string") continue;
    const existing = launches.get(row.launchId);
    if (existing !== undefined) {
      existing.rows.push(row);
      continue;
    }
    launches.set(row.launchId, {
      id: row.launchId,
      name: typeof row.launchName === "string" ? row.launchName : row.launchId,
      ...(typeof row.branch === "string" ? { branch: row.branch } : {}),
      createdAt: row.createdAt,
      rows: [row]
    });
  }
  return [...launches.values()]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map(({ rows: launchRows, ...launch }) => ({
      ...launch,
      metrics: summarizeMetricValues(launchRows)
    }));
}

function percentile(sortedValues: number[], value: number): number | null {
  if (sortedValues.length === 0) return null;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * value) - 1)
  );
  return sortedValues[index] ?? null;
}

function matchesFilters(row: Record<string, unknown>, filters: QuerySpec["filters"]): boolean {
  if (filters === undefined) {
    return true;
  }

  return Object.entries(filters).every(([field, expected]) => {
    const actual = row[field];
    if (Array.isArray(expected)) {
      return typeof actual === "string" && expected.includes(actual);
    }
    return actual === expected;
  });
}

function matchesThql(row: Record<string, unknown>, thql: string | undefined): boolean {
  if (thql === undefined || thql.trim().length === 0) {
    return true;
  }
  return evaluateThql(row, parseThql(thql));
}

function matchesField(actual: string | undefined, expected: string | undefined) {
  return expected === undefined || actual === expected;
}

function clampLimit(input: number | undefined) {
  if (input === undefined) {
    return 25;
  }
  return Math.min(maxPreviewLimit, Math.max(1, Math.floor(input)));
}
