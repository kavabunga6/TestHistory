import {
  buildHistoryComparePermissionAuditReplayInvariantEvidence,
  buildTestCaseSummaries,
  replayHistoryComparePermissionAuditEvents
} from "@testhistory/domain";
import type { FastifyInstance } from "fastify";
import type { AppStore } from "../store.js";
import { actorIdHeader } from "./testCaseHistory.js";
import {
  authorizeHistoryComparePermissionAuditRead,
  buildHistoryComparePermissionAuditEvents,
  buildHistoryComparePermissionAuditPersistedDigest,
  buildHistoryComparePermissionAuditPersistedInvariantRecord,
  buildPermissionAuditInvariantDigest,
  sanitizePermissionAuditInvariantStrings,
  serializePermissionAuditInvariantQuery,
  serializePermissionAuditProjection,
  serializePermissionAuditQuery,
  serializePermissionAuditRecord,
  uniqueSorted
} from "./testCasePermissionAudit.js";
import {
  findScopedLaunches,
  historyCompareReadScope,
  maxHistoryLimit,
  paginate,
  parseHistoryPagination,
  unsafePermissionAuditInvariantMarkers,
  type HistoryComparePermissionAuditInvariantQuery,
  type HistoryComparePermissionAuditPersistedInvariantQuery,
  type HistoryComparePermissionAuditQuery
} from "./testCaseRouteSupport.js";

export async function registerTestCasePermissionAuditRoutes(app: FastifyInstance, store: AppStore) {
  app.get<{
    Params: { testCaseId: string };
    Querystring: HistoryComparePermissionAuditQuery;
  }>(
    "/api/v1/test-cases/:testCaseId/history/compare/permission-audit",
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
            limit: { type: "integer", minimum: 1, maximum: maxHistoryLimit },
            cursor: { type: "string" }
          }
        }
      }
    },
    async (request, reply) => {
      const query = request.query;
      if (query.projectId === undefined) {
        return reply
          .code(400)
          .send({ message: "projectId is required for permission audit reads" });
      }
      if (query.baseResultUuid !== undefined && query.targetResultUuid === undefined) {
        return reply.code(400).send({
          message: "targetResultUuid is required when baseResultUuid is provided"
        });
      }
      if (query.targetResultUuid !== undefined && query.baseResultUuid === undefined) {
        return reply.code(400).send({
          message: "baseResultUuid is required when targetResultUuid is provided"
        });
      }
      if (
        query.baseResultUuid !== undefined &&
        query.targetResultUuid !== undefined &&
        query.baseResultUuid === query.targetResultUuid
      ) {
        return reply.code(400).send({ message: "baseResultUuid and targetResultUuid must differ" });
      }
      if (!store.projects.has(query.projectId)) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const denial = authorizeHistoryComparePermissionAuditRead(store, request, query.projectId);
      if (denial !== undefined) {
        return reply.code(403).send(denial);
      }

      const pagination = parseHistoryPagination(query);
      if (typeof pagination === "string") {
        return reply.code(400).send({ message: pagination });
      }

      const actorId = actorIdHeader(request) ?? "anonymous";
      const scopedLaunches = findScopedLaunches(store, query.projectId);
      const summary = buildTestCaseSummaries(scopedLaunches).find(
        (testCase) => testCase.id === request.params.testCaseId
      );
      const record = store.testCases.get(request.params.testCaseId);
      if (!summary && (!record || record.projectId !== query.projectId)) {
        return reply.code(404).send({ message: "Test case not found" });
      }

      const events = buildHistoryComparePermissionAuditEvents({
        launches: scopedLaunches,
        projectId: query.projectId,
        testCaseId: request.params.testCaseId,
        actorId,
        ...(query.baseResultUuid !== undefined ? { baseResultUuid: query.baseResultUuid } : {}),
        ...(query.targetResultUuid !== undefined
          ? { targetResultUuid: query.targetResultUuid }
          : {})
      });
      if (
        query.baseResultUuid !== undefined &&
        query.targetResultUuid !== undefined &&
        events.length === 0
      ) {
        return reply.code(404).send({ message: "History comparison point not found" });
      }
      const projection = replayHistoryComparePermissionAuditEvents(events, {
        projectId: query.projectId,
        actorId
      });
      const page = paginate(projection.records, pagination.limit, pagination.offset);

      return {
        kind: "test-case-history-compare-permission-audit",
        projectId: query.projectId,
        testCaseId: request.params.testCaseId,
        actor: { type: "actor", actorId, scoped: true },
        access: {
          scope: historyCompareReadScope,
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        availability: {
          status:
            projection.byDecision.denied > 0
              ? "denied"
              : projection.byDecision.partial > 0
                ? "partial"
                : projection.records.length === 0
                  ? "empty"
                  : "ready",
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          partial: projection.byDecision.partial > 0,
          unavailable: uniqueSorted(projection.records.flatMap((item) => item.unavailable))
        },
        query: serializePermissionAuditQuery(query.projectId, actorId, query, page.metadata),
        audit: serializePermissionAuditProjection(query.projectId, projection),
        page: page.metadata,
        redaction: {
          rawHistoryIncluded: false,
          rawCompareInputsIncluded: false,
          hiddenOrMaskedValuesIncluded: false,
          tokensIncluded: false,
          pathsIncluded: false,
          storageLocationsIncluded: false,
          artifactUrlsIncluded: false
        },
        diagnostics: projection.diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          compareId: diagnostic.compareId,
          projectScoped: true,
          actorScoped: true,
          redacted: true
        })),
        items: page.items.map(serializePermissionAuditRecord)
      };
    }
  );

  app.get<{
    Params: { testCaseId: string };
    Querystring: HistoryComparePermissionAuditInvariantQuery;
  }>(
    "/api/v1/test-cases/:testCaseId/history/compare/permission-audit/replay/invariants",
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
            limit: { type: "integer", minimum: 1, maximum: maxHistoryLimit },
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
      const query = request.query;
      if (query.projectId === undefined) {
        return reply
          .code(400)
          .send({ message: "projectId is required for permission audit invariant reads" });
      }
      if (query.baseResultUuid !== undefined && query.targetResultUuid === undefined) {
        return reply.code(400).send({
          message: "targetResultUuid is required when baseResultUuid is provided"
        });
      }
      if (query.targetResultUuid !== undefined && query.baseResultUuid === undefined) {
        return reply.code(400).send({
          message: "baseResultUuid is required when targetResultUuid is provided"
        });
      }
      if (
        query.baseResultUuid !== undefined &&
        query.targetResultUuid !== undefined &&
        query.baseResultUuid === query.targetResultUuid
      ) {
        return reply.code(400).send({ message: "baseResultUuid and targetResultUuid must differ" });
      }
      if (!store.projects.has(query.projectId)) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const denial = authorizeHistoryComparePermissionAuditRead(store, request, query.projectId);
      if (denial !== undefined) {
        return reply.code(403).send({
          ...denial,
          kind: "test-case-history-compare-permission-audit-replay-invariants",
          message:
            denial.availability.reason === "missing_scope"
              ? "Missing required test case history compare permission audit invariant read scope"
              : denial.availability.reason === "invalid_token"
                ? "API token is invalid"
                : "Actor is not allowed to read test case history compare permission audit invariants for this project",
          availability: {
            ...denial.availability,
            status: "denied" as const,
            unavailable: ["history-compare-permission-audit-replay-invariants"]
          }
        });
      }

      const pagination = parseHistoryPagination(query);
      if (typeof pagination === "string") {
        return reply.code(400).send({ message: pagination });
      }

      const actorId = actorIdHeader(request) ?? "anonymous";
      const scopedLaunches = findScopedLaunches(store, query.projectId);
      const summary = buildTestCaseSummaries(scopedLaunches).find(
        (testCase) => testCase.id === request.params.testCaseId
      );
      const record = store.testCases.get(request.params.testCaseId);
      if (!summary && (!record || record.projectId !== query.projectId)) {
        return reply.code(404).send({ message: "Test case not found" });
      }

      const events = buildHistoryComparePermissionAuditEvents({
        launches: scopedLaunches,
        projectId: query.projectId,
        testCaseId: request.params.testCaseId,
        actorId,
        ...(query.baseResultUuid !== undefined ? { baseResultUuid: query.baseResultUuid } : {}),
        ...(query.targetResultUuid !== undefined
          ? { targetResultUuid: query.targetResultUuid }
          : {})
      });
      if (
        query.baseResultUuid !== undefined &&
        query.targetResultUuid !== undefined &&
        events.length === 0
      ) {
        return reply.code(404).send({ message: "History comparison point not found" });
      }

      const evidence = buildHistoryComparePermissionAuditReplayInvariantEvidence(events, {
        projectId: query.projectId,
        actorId,
        unsafeMarkers: unsafePermissionAuditInvariantMarkers
      });
      const page = paginate(
        evidence.appendOnly.projectedEventIds.map((eventId, index) => ({
          ordinal: index,
          eventId,
          redacted: true
        })),
        pagination.limit,
        pagination.offset
      );

      return {
        kind: "test-case-history-compare-permission-audit-replay-invariants",
        projectId: query.projectId,
        testCaseId: request.params.testCaseId,
        actor: { type: "actor", actorId, scoped: true },
        access: {
          scope: historyCompareReadScope,
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        availability: {
          status:
            evidence.appendOnly.projectedEventIds.length === 0
              ? "empty"
              : evidence.deterministic &&
                  evidence.recomputable &&
                  evidence.projectScoped &&
                  evidence.actorScoped.passed &&
                  evidence.rawCompareInputs.preserved &&
                  evidence.redaction.passed
                ? "ready"
                : "partial",
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          partial:
            !evidence.deterministic ||
            !evidence.recomputable ||
            !evidence.projectScoped ||
            !evidence.actorScoped.passed ||
            !evidence.rawCompareInputs.preserved ||
            !evidence.redaction.passed,
          unavailable: evidence.redaction.passed ? [] : ["redaction"]
        },
        query: serializePermissionAuditInvariantQuery(
          query.projectId,
          actorId,
          request.params.testCaseId,
          query,
          page.metadata
        ),
        invariant: {
          boundary: "read-only-history-compare-permission-audit-replay-invariant",
          source: "in-memory-history-compare-permission-audit-wip",
          consistency: "append-only-replay",
          mutationBoundary: "rest-read-only-no-replay-mutation",
          deterministic: evidence.deterministic,
          recomputable: evidence.recomputable,
          projectScoped: evidence.projectScoped,
          actorScoped: evidence.actorScoped,
          projectionDigest: buildPermissionAuditInvariantDigest(evidence.projectionDigest),
          recomputedDigest: buildPermissionAuditInvariantDigest(evidence.recomputedDigest)
        },
        appendOnly: {
          uniqueProjectedEventIds: evidence.appendOnly.uniqueProjectedEventIds,
          duplicateEventIds: sanitizePermissionAuditInvariantStrings(
            evidence.appendOnly.duplicateEventIds
          ),
          totalProjectedEventIds: evidence.appendOnly.projectedEventIds.length
        },
        rawCompareInputs: evidence.rawCompareInputs,
        redaction: {
          passed: evidence.redaction.passed,
          leakedMarkerCount: evidence.redaction.leakedMarkers.length,
          leakedMarkers: sanitizePermissionAuditInvariantStrings(evidence.redaction.leakedMarkers),
          rawHistoryIncluded: false,
          rawCompareInputsIncluded: false,
          hiddenOrMaskedValuesIncluded: false,
          tokensIncluded: false,
          pathsIncluded: false,
          storageLocationsIncluded: false,
          artifactUrlsIncluded: false,
          policy:
            "Response contains invariant metadata and paged event identifiers only; raw compare inputs, raw history bodies, local paths, storage refs, tokens, and signed URLs are not exposed."
        },
        page: page.metadata,
        items: page.items
      };
    }
  );

  app.get<{
    Params: { testCaseId: string };
    Querystring: HistoryComparePermissionAuditPersistedInvariantQuery;
  }>(
    "/api/v1/test-cases/:testCaseId/history/compare/permission-audit/replay/invariants/persisted",
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
            limit: { type: "integer", minimum: 1, maximum: maxHistoryLimit },
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
      const query = request.query;
      if (query.projectId === undefined) {
        return reply.code(400).send({
          message: "projectId is required for persisted permission audit invariant reads"
        });
      }
      if (query.baseResultUuid !== undefined && query.targetResultUuid === undefined) {
        return reply.code(400).send({
          message: "targetResultUuid is required when baseResultUuid is provided"
        });
      }
      if (query.targetResultUuid !== undefined && query.baseResultUuid === undefined) {
        return reply.code(400).send({
          message: "baseResultUuid is required when targetResultUuid is provided"
        });
      }
      if (
        query.baseResultUuid !== undefined &&
        query.targetResultUuid !== undefined &&
        query.baseResultUuid === query.targetResultUuid
      ) {
        return reply.code(400).send({ message: "baseResultUuid and targetResultUuid must differ" });
      }
      if (!store.projects.has(query.projectId)) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const denial = authorizeHistoryComparePermissionAuditRead(store, request, query.projectId);
      if (denial !== undefined) {
        return reply.code(403).send({
          ...denial,
          kind: "test-case-history-compare-permission-audit-replay-invariant-persisted-read",
          message:
            denial.availability.reason === "missing_scope"
              ? "Missing required test case history compare permission audit persisted invariant read scope"
              : denial.availability.reason === "invalid_token"
                ? "API token is invalid"
                : "Actor is not allowed to read test case history compare permission audit persisted invariants for this project",
          availability: {
            ...denial.availability,
            status: "denied" as const,
            unavailable: ["history-compare-permission-audit-replay-invariant-persisted-read"]
          }
        });
      }

      const pagination = parseHistoryPagination(query);
      if (typeof pagination === "string") {
        return reply.code(400).send({ message: pagination });
      }

      const actorId = actorIdHeader(request) ?? "anonymous";
      const scopedLaunches = findScopedLaunches(store, query.projectId);
      const summary = buildTestCaseSummaries(scopedLaunches).find(
        (testCase) => testCase.id === request.params.testCaseId
      );
      const record = store.testCases.get(request.params.testCaseId);
      if (!summary && (!record || record.projectId !== query.projectId)) {
        return reply.code(404).send({ message: "Test case not found" });
      }

      const events = buildHistoryComparePermissionAuditEvents({
        launches: scopedLaunches,
        projectId: query.projectId,
        testCaseId: request.params.testCaseId,
        actorId,
        ...(query.baseResultUuid !== undefined ? { baseResultUuid: query.baseResultUuid } : {}),
        ...(query.targetResultUuid !== undefined
          ? { targetResultUuid: query.targetResultUuid }
          : {})
      });
      if (
        query.baseResultUuid !== undefined &&
        query.targetResultUuid !== undefined &&
        events.length === 0
      ) {
        return reply.code(404).send({ message: "History comparison point not found" });
      }

      const evidence = buildHistoryComparePermissionAuditReplayInvariantEvidence(events, {
        projectId: query.projectId,
        actorId,
        unsafeMarkers: unsafePermissionAuditInvariantMarkers
      });
      const persistedAt =
        events
          .map((event) => event.occurredAt)
          .sort((left, right) => left.localeCompare(right))
          .at(-1) ?? "1970-01-01T00:00:00.000Z";
      const records = evidence.appendOnly.projectedEventIds.map((eventId, ordinal) =>
        buildHistoryComparePermissionAuditPersistedInvariantRecord({
          projectId: query.projectId!,
          testCaseId: request.params.testCaseId,
          actorId,
          ordinal,
          eventId,
          persistedAt,
          evidence
        })
      );
      const page = paginate(records, pagination.limit, pagination.offset);
      const persistenceDigest = buildHistoryComparePermissionAuditPersistedDigest(records);
      const ready =
        evidence.deterministic &&
        evidence.recomputable &&
        evidence.projectScoped &&
        evidence.actorScoped.passed &&
        evidence.rawCompareInputs.preserved &&
        evidence.redaction.passed;

      return {
        kind: "test-case-history-compare-permission-audit-replay-invariant-persisted-read",
        projectId: query.projectId,
        testCaseId: request.params.testCaseId,
        actor: { type: "actor", actorId, scoped: true },
        access: {
          scope: historyCompareReadScope,
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        availability: {
          status: records.length === 0 ? "empty" : ready ? "ready" : "partial",
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          partial: records.length > 0 && !ready,
          unavailable: evidence.redaction.passed ? [] : ["redaction"]
        },
        query: serializePermissionAuditInvariantQuery(
          query.projectId,
          actorId,
          request.params.testCaseId,
          query,
          page.metadata
        ),
        persistence: {
          adapterKind:
            "api-read-model-history-compare-permission-audit-replay-invariant-persisted-wip",
          boundary: "persistent-history-compare-permission-audit-replay-invariant-read",
          consistency: "append-only-replay-evidence",
          source: "history-compare-permission-audit-replay-invariants",
          readOnly: true,
          rawHistoryIncluded: false,
          rawCompareInputsIncluded: false,
          hiddenOrMaskedValuesIncluded: false,
          localPathsIncluded: false,
          storageRefsIncluded: false,
          signedUrlsIncluded: false,
          tokensIncluded: false,
          mutationBoundary: "rest-persisted-read-only-no-compare-or-replay-mutation",
          persistedAt,
          persistedRecordCount: records.length,
          persistenceDigest
        },
        summary: {
          projectId: query.projectId,
          testCaseId: request.params.testCaseId,
          actorId,
          persistedRecordCount: records.length,
          deterministic: evidence.deterministic,
          recomputable: evidence.recomputable,
          projectScoped: evidence.projectScoped,
          actorScoped: evidence.actorScoped.passed,
          appendOnlyUniqueProjectedEventIds: evidence.appendOnly.uniqueProjectedEventIds,
          rawCompareInputsPreserved: evidence.rawCompareInputs.preserved,
          rawCompareInputsIncluded: false,
          rawHistoryIncluded: false,
          hiddenOrMaskedValuesIncluded: false,
          redactionPassed: evidence.redaction.passed,
          persistenceDigest,
          plannedOperations: ["history_compare.permission_audit.replay_invariant.persisted_read"]
        },
        execution: {
          compareStarted: false,
          replayStarted: false,
          workerJobEnqueued: false,
          persistenceWriteStarted: false,
          mutation: false
        },
        page: page.metadata,
        items: page.items
      };
    }
  );
}
