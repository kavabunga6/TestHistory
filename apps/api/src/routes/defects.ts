import {
  buildDefectClusters,
  applyDefectDispositionEvents,
  buildDefectMuteReplayInvariantEvidence,
  replayDefectMuteAuditEvents
} from "@testhistory/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppStore } from "../store.js";
import {
  loadProjectDefectDispositionEvents,
  loadProjectDefectMuteEvents,
  registerDefectMutationRoutes
} from "./defectMutations.js";
import {
  buildDefectMuteReplayInvariantMaterializedRecord,
  buildMaterializedInvariantDigest,
  buildProjectedQualityGate,
  buildProjectionDigest,
  buildWorkerDefectMuteEvents,
  originActorId,
  sanitizeProjectionStringArray,
  selectQualityGateLaunch,
  serializeEffectiveProjectionState,
  serializeProjectionQuery,
  serializeProjectionRecord,
  serializeRawFailureProjection
} from "./defectProjection.js";
import {
  actorIdHeader,
  authorizeDefectMuteProjectionRead,
  defectMuteProjectionReadScope,
  matchesDefectSearch,
  matchesDefectStatus,
  maxProjectionLimit,
  paginateProjection,
  parseProjectionPagination,
  selectDefectListLaunches,
  serializeDefectCluster,
  unsafeReplayInvariantMarkers,
  type DefectListQuery,
  type DefectMuteProjectionQuery,
  type DefectMuteReplayInvariantMaterializedQuery,
  type DefectMuteReplayInvariantQuery
} from "./defectsReadModel.js";

export async function registerDefectRoutes(app: FastifyInstance, store: AppStore) {
  await registerDefectMutationRoutes(app, store);
  app.get(
    "/api/v1/defects",
    {
      attachValidation: true,
      schema: {
        tags: ["defects"],
        querystring: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            status: {
              type: "string",
              enum: ["open", "closed", "resolved-ish", "new", "recurring"]
            },
            q: { type: "string" },
            search: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: maxProjectionLimit },
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
    async (request: FastifyRequest<{ Querystring: DefectListQuery }>, reply) => {
      if (request.validationError) {
        return reply.code(400).send({
          code: "defects.pagination.invalid",
          message: "invalid defect list query controls",
          redacted: true
        });
      }

      const query = request.query;
      const projectIds = query.projectId === undefined ? undefined : [query.projectId];
      if (query.projectId !== undefined && !store.projects.has(query.projectId)) {
        return reply.code(404).send({ message: "Project not found" });
      }

      if (query.projectId !== undefined) {
        const denial = authorizeDefectMuteProjectionRead(
          store,
          request,
          query.projectId,
          actorIdHeader(request)
        );
        if (denial !== undefined) {
          return reply.code(403).send(denial);
        }
      }

      const pagination = parseProjectionPagination(query);
      if (typeof pagination === "string") {
        return reply.code(400).send({
          code: "defects.pagination.invalid",
          message: pagination,
          redacted: true
        });
      }

      const launches = selectDefectListLaunches(store, projectIds);
      const dispositionEvents =
        query.projectId === undefined
          ? []
          : await loadProjectDefectDispositionEvents(store, query.projectId);
      const clusters = applyDefectDispositionEvents(
        buildDefectClusters(launches),
        dispositionEvents
      )
        .filter((cluster) => matchesDefectStatus(cluster, query.status))
        .filter((cluster) => matchesDefectSearch(cluster, query.q ?? query.search))
        .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
      const page = paginateProjection(clusters, pagination.limit, pagination.offset);

      return {
        kind: "defect-list",
        ...(query.projectId !== undefined ? { projectId: query.projectId } : {}),
        page: page.metadata,
        items: page.items.map(serializeDefectCluster)
      };
    }
  );

  app.get<{
    Params: { projectId: string };
    Querystring: DefectMuteProjectionQuery;
  }>(
    "/api/v1/projects/:projectId/defect-mutes/projection",
    {
      schema: {
        tags: ["defects"],
        params: {
          type: "object",
          required: ["projectId"],
          properties: { projectId: { type: "string" } }
        },
        querystring: {
          type: "object",
          properties: {
            actorId: { type: "string" },
            launchId: { type: "string" },
            status: { type: "string", enum: ["active", "inactive"] },
            limit: { type: "integer", minimum: 1, maximum: maxProjectionLimit },
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
      if (!store.projects.has(projectId)) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const actorId = request.query.actorId ?? actorIdHeader(request);
      const denial = authorizeDefectMuteProjectionRead(store, request, projectId, actorId);
      if (denial !== undefined) {
        return reply.code(403).send(denial);
      }

      const pagination = parseProjectionPagination(request.query);
      if (typeof pagination === "string") {
        return reply.code(400).send({ message: pagination });
      }

      const projectEvents = [
        ...(await loadProjectDefectMuteEvents(store, projectId)),
        ...buildWorkerDefectMuteEvents(store, projectId)
      ];
      const scopedEvents =
        actorId === undefined
          ? projectEvents
          : projectEvents.filter((event) => originActorId(event.origin) === actorId);
      const projection = replayDefectMuteAuditEvents(scopedEvents, { projectId });
      const records = projection.records.filter(
        (record) => request.query.status === undefined || record.status === request.query.status
      );
      const page = paginateProjection(records, pagination.limit, pagination.offset);
      const launch = selectQualityGateLaunch(store, projectId, request.query.launchId);
      if (request.query.launchId !== undefined && launch === undefined) {
        return reply.code(404).send({ message: "Launch not found" });
      }

      const qualityGate =
        launch === undefined
          ? undefined
          : buildProjectedQualityGate(launch, projection.activeRecords);
      const digest = buildProjectionDigest(projectId, projection);

      return {
        kind: "defect-mute-projection",
        projectId,
        ...(actorId !== undefined ? { actor: { type: "actor", actorId, scoped: true } } : {}),
        access: {
          scope: defectMuteProjectionReadScope,
          projectScoped: true,
          actorScoped: actorId !== undefined,
          mutation: false,
          redacted: true
        },
        query: serializeProjectionQuery(projectId, actorId, request.query, page.metadata),
        projection: {
          adapterKind: "in-memory-defect-mute-projection-wip",
          boundary: "worker-local-mute-projection",
          consistency: "append-only-replay",
          replayStatus: "replayed",
          projectionDigest: digest,
          mutationBoundary: "worker-projection-only-no-rest-mutation",
          eventCount: projection.totalEvents,
          mutedEventCount: projection.mutedEvents,
          unmutedEventCount: projection.unmutedEvents,
          activeMuteCount: projection.active,
          inactiveMuteCount: projection.inactive,
          rawFailureOccurrenceCount: projection.rawFailureHistory.totalOccurrences,
          ...(projection.firstOccurredAt !== undefined
            ? { firstOccurredAt: projection.firstOccurredAt }
            : {}),
          ...(projection.lastOccurredAt !== undefined
            ? { lastOccurredAt: projection.lastOccurredAt }
            : {})
        },
        page: page.metadata,
        rawFailureHistory: serializeRawFailureProjection(projection.rawFailureHistory),
        effectiveState: serializeEffectiveProjectionState(projection.effectiveState),
        ...(qualityGate !== undefined ? { qualityGate } : {}),
        items: page.items.map(serializeProjectionRecord)
      };
    }
  );

  app.get<{
    Params: { projectId: string };
    Querystring: DefectMuteReplayInvariantQuery;
  }>(
    "/api/v1/projects/:projectId/defect-mutes/projection/replay/invariants",
    {
      schema: {
        tags: ["defects"],
        params: {
          type: "object",
          required: ["projectId"],
          properties: { projectId: { type: "string" } }
        },
        querystring: {
          type: "object",
          properties: {
            actorId: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: maxProjectionLimit },
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
      if (!store.projects.has(projectId)) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const actorId = request.query.actorId ?? actorIdHeader(request);
      const denial = authorizeDefectMuteProjectionRead(store, request, projectId, actorId);
      if (denial !== undefined) {
        return reply.code(403).send({
          ...denial,
          kind: "defect-mute-replay-invariant",
          availability: {
            ...denial.availability,
            unavailable: ["defect-mute-replay-invariant"]
          }
        });
      }

      const pagination = parseProjectionPagination(request.query);
      if (typeof pagination === "string") {
        return reply.code(400).send({ message: pagination });
      }

      const projectEvents = [
        ...(await loadProjectDefectMuteEvents(store, projectId)),
        ...buildWorkerDefectMuteEvents(store, projectId)
      ];
      const scopedEvents =
        actorId === undefined
          ? projectEvents
          : projectEvents.filter((event) => originActorId(event.origin) === actorId);
      const evidence = buildDefectMuteReplayInvariantEvidence(scopedEvents, {
        projectId,
        unsafeMarkers: unsafeReplayInvariantMarkers
      });
      const page = paginateProjection(
        evidence.appendOnly.projectedEventIds.map((eventId, index) => ({
          ordinal: index,
          eventId
        })),
        pagination.limit,
        pagination.offset
      );

      return {
        kind: "defect-mute-replay-invariant",
        projectId,
        ...(actorId !== undefined ? { actor: { type: "actor", actorId, scoped: true } } : {}),
        access: {
          scope: defectMuteProjectionReadScope,
          projectScoped: true,
          actorScoped: actorId !== undefined,
          mutation: false,
          redacted: true
        },
        query: {
          projectId,
          ...(actorId !== undefined ? { actorId } : {}),
          limit: page.metadata.limit,
          cursor: page.metadata.cursor
        },
        invariant: {
          boundary: "read-only-defect-mute-replay-invariant",
          source: "worker-local-mute-projection",
          consistency: "append-only-replay",
          mutationBoundary: "rest-read-only-no-replay-mutation",
          deterministic: evidence.deterministic,
          recomputable: evidence.recomputable,
          projectScoped: evidence.projectScoped,
          projectionDigest: evidence.projectionDigest,
          recomputedDigest: evidence.recomputedDigest
        },
        rawEffectiveSeparation: {
          ...evidence.rawEffectiveSeparation,
          documentation:
            "Raw failure history is preserved only as bounded counters; effective replay state is serialized separately and never includes raw failure occurrences or result payloads."
        },
        appendOnly: {
          uniqueProjectedEventIds: evidence.appendOnly.uniqueProjectedEventIds,
          duplicateEventIds: sanitizeProjectionStringArray(evidence.appendOnly.duplicateEventIds),
          totalProjectedEventIds: evidence.appendOnly.projectedEventIds.length
        },
        redaction: {
          passed: evidence.redaction.passed,
          leakedMarkers: sanitizeProjectionStringArray(evidence.redaction.leakedMarkers),
          policy:
            "Response contains invariant metadata and paged event identifiers only; raw result payloads, local paths, storage refs, tokens, and signed URLs are not exposed."
        },
        page: page.metadata,
        items: page.items
      };
    }
  );

  app.get<{
    Params: { projectId: string };
    Querystring: DefectMuteReplayInvariantMaterializedQuery;
  }>(
    "/api/v1/projects/:projectId/defect-mutes/projection/replay/invariants/materialized",
    {
      schema: {
        tags: ["defects"],
        params: {
          type: "object",
          required: ["projectId"],
          properties: { projectId: { type: "string" } }
        },
        querystring: {
          type: "object",
          properties: {
            actorId: { type: "string" },
            limit: { anyOf: [{ type: "integer" }, { type: "string" }] },
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
      if (!store.projects.has(projectId)) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const actorId = request.query.actorId ?? actorIdHeader(request);
      const denial = authorizeDefectMuteProjectionRead(store, request, projectId, actorId);
      if (denial !== undefined) {
        return reply.code(403).send({
          ...denial,
          kind: "defect-mute-replay-invariant-materialized-read",
          availability: {
            ...denial.availability,
            unavailable: ["defect-mute-replay-invariant-materialized-read"]
          }
        });
      }

      const pagination = parseProjectionPagination(request.query);
      if (typeof pagination === "string") {
        return reply.code(400).send({
          kind: "defect-mute-replay-invariant-materialized-read",
          message: pagination,
          redacted: true
        });
      }

      const projectEvents = [
        ...(await loadProjectDefectMuteEvents(store, projectId)),
        ...buildWorkerDefectMuteEvents(store, projectId)
      ];
      const scopedEvents =
        actorId === undefined
          ? projectEvents
          : projectEvents.filter((event) => originActorId(event.origin) === actorId);
      const projection = replayDefectMuteAuditEvents(scopedEvents, { projectId });
      const evidence = buildDefectMuteReplayInvariantEvidence(projection.events, {
        projectId,
        unsafeMarkers: unsafeReplayInvariantMarkers
      });
      const materializedAt = projection.lastOccurredAt ?? "1970-01-01T00:00:00.000Z";
      const records =
        projection.totalEvents === 0
          ? []
          : [
              buildDefectMuteReplayInvariantMaterializedRecord({
                projectId,
                materializedAt,
                evidence
              })
            ];
      const page = paginateProjection(records, pagination.limit, pagination.offset);
      const materializationDigest = buildMaterializedInvariantDigest(records);

      return {
        kind: "defect-mute-replay-invariant-materialized-read",
        projectId,
        ...(actorId !== undefined ? { actor: { type: "actor", actorId, scoped: true } } : {}),
        access: {
          scope: defectMuteProjectionReadScope,
          projectScoped: true,
          actorScoped: actorId !== undefined,
          mutation: false,
          redacted: true
        },
        availability: {
          status:
            records.length === 0
              ? "empty"
              : evidence.deterministic &&
                  evidence.recomputable &&
                  evidence.projectScoped &&
                  evidence.rawEffectiveSeparation.effectiveStateExcludesRawFailureHistory &&
                  evidence.redaction.passed
                ? "ready"
                : "partial",
          projectScoped: true,
          actorScoped: actorId !== undefined,
          redacted: true,
          partial:
            records.length > 0 &&
            (!evidence.deterministic ||
              !evidence.recomputable ||
              !evidence.projectScoped ||
              !evidence.rawEffectiveSeparation.effectiveStateExcludesRawFailureHistory ||
              !evidence.redaction.passed),
          unavailable: evidence.redaction.passed ? [] : ["redaction"]
        },
        query: {
          projectId,
          ...(actorId !== undefined ? { actorId } : {}),
          limit: page.metadata.limit,
          cursor: page.metadata.cursor
        },
        materialization: {
          adapterKind: "api-read-model-defect-mute-replay-invariant-materialized-wip",
          boundary: "worker-compatible-defect-mute-replay-invariant-materialized-read",
          consistency: "retry-safe-idempotent-projected-mute-state",
          source: "projected-defect-mute-state",
          readOnly: true,
          rawFailurePayloadsIncluded: false,
          mutationBoundary: "rest-read-only-no-worker-or-replay-mutation",
          materializedAt: records[0]?.materializedAt ?? materializedAt,
          materializedRecordCount: records.length,
          materializationDigest
        },
        summary: {
          projectId,
          materializedRecordCount: records.length,
          deterministic: evidence.deterministic,
          recomputable: evidence.recomputable,
          projectScoped: evidence.projectScoped,
          appendOnlyUniqueProjectedEventIds: evidence.appendOnly.uniqueProjectedEventIds,
          redactionPassed: evidence.redaction.passed,
          effectiveStateExcludesRawFailureHistory:
            evidence.rawEffectiveSeparation.effectiveStateExcludesRawFailureHistory,
          rawFailureHistoryPreserved: evidence.rawEffectiveSeparation.rawFailureHistoryPreserved,
          rawFailureHistoryNotMutatedByUnmute:
            evidence.rawEffectiveSeparation.rawFailureHistoryNotMutatedByUnmute,
          rawFailureOccurrenceCount: evidence.rawEffectiveSeparation.rawFailureOccurrenceCount,
          effectiveRecordCount: evidence.rawEffectiveSeparation.effectiveRecordCount,
          materializationDigest,
          projectedMuteStateCompatible: true,
          mutationBoundary: "api-materialized-read-only-no-rest-or-worker-mutation",
          plannedOperations: [
            "defect_mute.replay_invariant.summarize",
            "defect_mute.replay_invariant.materialized_read"
          ]
        },
        page: page.metadata,
        items: page.items
      };
    }
  );
}
