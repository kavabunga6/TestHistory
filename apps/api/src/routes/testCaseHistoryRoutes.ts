import {
  buildDefectClusters,
  buildTestCaseHistoryCompareDecision,
  buildTestCaseSummaries
} from "@testhistory/domain";
import type { FastifyInstance } from "fastify";
import type { AppStore } from "../store.js";
import {
  actorIdHeader,
  buildHistoryPoints,
  findHistoryCandidate,
  parseBoolean,
  sensitiveParameterValues,
  summarizeCompareEnrichment,
  summarizeComparePoint,
  summarizeHistoryCompareChanges,
  toHistoryCompareChange,
  toHistoryCompareSnapshot
} from "./testCaseHistory.js";
import { authorizeHistoryCompareRead } from "./testCasePermissionAudit.js";
import {
  authorizeTestCaseReadQuery,
  filterTestCaseReadLaunches,
  findScopedLaunches,
  historyCompareReadScope,
  maxHistoryLimit,
  paginate,
  paginateHistory,
  parseHistoryPagination,
  type HistoryCompareQuery,
  type HistoryQuery
} from "./testCaseRouteSupport.js";

export async function registerTestCaseHistoryRoutes(app: FastifyInstance, store: AppStore) {
  app.get<{ Params: { testCaseId: string } }>(
    "/api/v1/test-cases/:testCaseId/history",
    {
      schema: {
        tags: ["test-cases"],
        params: {
          type: "object",
          required: ["testCaseId"],
          properties: { testCaseId: { type: "string" } }
        },
        querystring: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: maxHistoryLimit },
            cursor: { type: "string" }
          }
        }
      }
    },
    async (request, reply) => {
      const query = request.query as HistoryQuery;
      const record = store.testCases.get(request.params.testCaseId);
      const access = authorizeTestCaseReadQuery(
        store,
        request,
        query.projectId ?? record?.projectId
      );
      if (access?.statusCode !== undefined) {
        return reply.code(access.statusCode).send(access.body);
      }

      const scopedLaunches = filterTestCaseReadLaunches(
        store,
        request,
        findScopedLaunches(store, query.projectId)
      );
      const summary = buildTestCaseSummaries(scopedLaunches).find(
        (testCase) => testCase.id === request.params.testCaseId
      );
      if (
        !summary &&
        (!record || (query.projectId !== undefined && record.projectId !== query.projectId))
      ) {
        return reply.code(404).send({ message: "Test case not found" });
      }

      const pagination = parseHistoryPagination(query);
      if (typeof pagination === "string") {
        return reply.code(400).send({ message: pagination });
      }

      const points = buildHistoryPoints(scopedLaunches, request.params.testCaseId);
      const page = paginateHistory(points, pagination.limit, pagination.offset);
      return {
        kind: "test-case-history",
        testCaseId: request.params.testCaseId,
        ...(query.projectId !== undefined ? { projectId: query.projectId } : {}),
        ...(summary?.identity !== undefined ? { identity: summary.identity } : {}),
        totalPoints: points.length,
        returnedPoints: page.items.length,
        omittedPoints: Math.max(points.length - (pagination.offset + page.items.length), 0),
        page: page.metadata,
        points: page.items
      };
    }
  );

  app.get<{ Params: { testCaseId: string }; Querystring: HistoryCompareQuery }>(
    "/api/v1/test-cases/:testCaseId/history/compare",
    {
      schema: {
        tags: ["test-cases"],
        params: {
          type: "object",
          required: ["testCaseId"],
          properties: { testCaseId: { type: "string" } }
        },
        querystring: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            baseResultUuid: { type: "string" },
            targetResultUuid: { type: "string" },
            includeUnchanged: { anyOf: [{ type: "boolean" }, { type: "string" }] },
            limit: { type: "integer", minimum: 1, maximum: maxHistoryLimit },
            cursor: { type: "string" }
          }
        }
      }
    },
    async (request, reply) => {
      const query = request.query;
      if (query.projectId === undefined) {
        return reply.code(400).send({ message: "projectId is required for history comparison" });
      }
      if (query.baseResultUuid === undefined || query.targetResultUuid === undefined) {
        return reply
          .code(400)
          .send({ message: "baseResultUuid and targetResultUuid are required" });
      }
      if (query.baseResultUuid === query.targetResultUuid) {
        return reply.code(400).send({ message: "baseResultUuid and targetResultUuid must differ" });
      }
      if (!store.projects.has(query.projectId)) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const denial = authorizeHistoryCompareRead(store, request, query.projectId);
      if (denial !== undefined) {
        return reply.code(403).send(denial);
      }

      const pagination = parseHistoryPagination(query);
      if (typeof pagination === "string") {
        return reply.code(400).send({ message: pagination });
      }

      const scopedLaunches = findScopedLaunches(store, query.projectId);
      const summary = buildTestCaseSummaries(scopedLaunches).find(
        (testCase) => testCase.id === request.params.testCaseId
      );
      const record = store.testCases.get(request.params.testCaseId);
      if (!summary && (!record || record.projectId !== query.projectId)) {
        return reply.code(404).send({ message: "Test case not found" });
      }

      const points = buildHistoryPoints(scopedLaunches, request.params.testCaseId);
      const base = points.find((point) => point.resultUuid === query.baseResultUuid);
      const target = points.find((point) => point.resultUuid === query.targetResultUuid);
      if (base === undefined || target === undefined) {
        return reply.code(404).send({ message: "History comparison point not found" });
      }

      const baseCandidate = findHistoryCandidate(
        scopedLaunches,
        request.params.testCaseId,
        query.baseResultUuid
      );
      const targetCandidate = findHistoryCandidate(
        scopedLaunches,
        request.params.testCaseId,
        query.targetResultUuid
      );
      if (baseCandidate === undefined || targetCandidate === undefined) {
        return reply.code(404).send({ message: "History comparison point not found" });
      }

      const beforeSnapshot = toHistoryCompareSnapshot(baseCandidate.launch, baseCandidate.result);
      const afterSnapshot = toHistoryCompareSnapshot(
        targetCandidate.launch,
        targetCandidate.result
      );
      const comparison = buildTestCaseHistoryCompareDecision({
        projectId: query.projectId,
        testCaseId: request.params.testCaseId,
        before: beforeSnapshot,
        after: afterSnapshot,
        defectClusters: buildDefectClusters(scopedLaunches)
      });
      const includeUnchanged = parseBoolean(query.includeUnchanged);
      const sensitiveValues = sensitiveParameterValues([
        ...baseCandidate.result.parameters,
        ...targetCandidate.result.parameters
      ]);
      const changes = comparison.decisions
        .filter((decision) => includeUnchanged || decision.change !== "unchanged")
        .map((decision) => toHistoryCompareChange(decision, sensitiveValues));
      const page = paginate(changes, pagination.limit, pagination.offset);
      const actorId = actorIdHeader(request);
      const enrichment = summarizeCompareEnrichment(beforeSnapshot, afterSnapshot);
      const availabilityStatus =
        enrichment.status === "partial" ? "partial" : changes.length === 0 ? "empty" : "ready";
      return {
        kind: "test-case-history-compare",
        id: comparison.id,
        testCaseId: request.params.testCaseId,
        projectId: query.projectId,
        ...(actorId !== undefined ? { actor: { type: "actor", actorId, scoped: true } } : {}),
        access: {
          scope: historyCompareReadScope,
          projectScoped: true,
          actorScoped: actorId !== undefined,
          mutation: false,
          redacted: true
        },
        availability: {
          status: availabilityStatus,
          projectScoped: true,
          actorScoped: actorId !== undefined,
          redacted: true,
          partial: enrichment.status === "partial",
          unavailable: enrichment.unavailable
        },
        ...(summary?.identity !== undefined ? { identity: summary.identity } : {}),
        base: summarizeComparePoint(base, comparison.from),
        target: summarizeComparePoint(target, comparison.to),
        enrichment,
        totalChanges: changes.length,
        returnedChanges: page.items.length,
        omittedChanges: Math.max(changes.length - (pagination.offset + page.items.length), 0),
        page: page.metadata,
        summary: summarizeHistoryCompareChanges(changes),
        redaction: {
          ...comparison.redaction,
          tokensIncluded: false,
          pathsIncluded: false,
          storageLocationsIncluded: false,
          artifactUrlsIncluded: false
        },
        changes: page.items
      };
    }
  );
}
