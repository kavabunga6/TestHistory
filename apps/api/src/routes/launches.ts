import {
  buildLaunchResultDetails,
  evaluateQualityGate,
  replayDefectMuteAuditEvents,
  type DefectMuteRecord,
  type Launch as DomainLaunch,
  type QualityGateDefectMuteRule,
  type QualityGateRule,
  type QualityGateThresholds
} from "@testhistory/domain";
import type { FastifyInstance } from "fastify";
import {
  serializeArtifactChecksumDuplicates,
  serializeArtifactDescriptor
} from "./artifact-responses.js";
import { summarizeStoredLaunch, type AppStore, type Launch } from "../store.js";
import { authorizeProjectMutation, authorizeProjectVisibilityRead } from "./project-auth.js";
import { registerLaunchDeletionRoute } from "./launchDeletionRoute.js";
import { addArtifactPreviewReferences } from "./artifactPreviewReferences.js";
import {
  compareLaunches,
  compareResults,
  defectMuteRecordSchema,
  isPaginationValidationError,
  launchArtifacts,
  launchDetailEmbeddedLimit,
  launchSortFields,
  matchesLaunchSearch,
  matchesResultSearch,
  maxListLimit,
  paginate,
  paginationValidationError,
  parseListPagination,
  qualityGateThresholdSchema,
  resultArtifacts,
  resultSortFields,
  serializeLaunch,
  serializeLaunchResultSummary,
  toApiLaunch,
  type LaunchListQuery,
  type LaunchResultListQuery
} from "./launchHelpers.js";
import { findActiveDefectMuteForResult, loadProjectDefectMuteEvents } from "./defectMutations.js";
import { serializeProjectionRecord } from "./defectProjection.js";
import { toPersistentLaunch } from "../storeMappers.js";
import { registerLaunchLifecycleRoutes } from "./launchLifecycleRoutes.js";

type QualityGateEvaluationRequestBody = {
  rules?: QualityGateRule[];
  thresholds?: QualityGateThresholds;
  defectMutes?: DefectMuteRecord[];
  defectMuteRules?: QualityGateDefectMuteRule[];
};

const launchWriteRoles = ["owner", "maintainer", "editor", "ci"] as const;

async function activeMutesForProject(store: AppStore, projectId: string) {
  const events = await loadProjectDefectMuteEvents(store, projectId);
  return replayDefectMuteAuditEvents(events, { projectId }).activeRecords;
}

const persistedDefectMuteRules: QualityGateDefectMuteRule[] = [
  "newFailures",
  "failedBrokenTotal",
  "criticalFailures"
].map((metric) => ({
  code: `persisted-quarantine-${metric}`,
  reasonCode: `quality_gate.${metric}`,
  mode: "exclude_muted_affected_tests"
}));

persistedDefectMuteRules.push(
  {
    code: "persisted-quarantine-failed",
    reasonCode: "quality_gate.rule.failed.lte",
    mode: "exclude_muted_affected_tests"
  },
  {
    code: "persisted-quarantine-broken",
    reasonCode: "quality_gate.rule.broken.lte",
    mode: "exclude_muted_affected_tests"
  }
);

function serializeResultWithQuarantine(
  launch: Launch,
  result: Launch["results"][number],
  activeMutes: DefectMuteRecord[]
) {
  const quarantine = findActiveDefectMuteForResult(activeMutes, result);
  return {
    ...serializeLaunchResultSummary(launch, result),
    ...(quarantine !== undefined ? { quarantine: serializeProjectionRecord(quarantine) } : {})
  };
}

export async function registerLaunchRoutes(app: FastifyInstance, store: AppStore) {
  registerLaunchDeletionRoute(app, store);
  app.get<{
    Params: { projectId: string };
    Querystring: LaunchListQuery;
  }>(
    "/api/v1/projects/:projectId/launches",
    {
      attachValidation: true,
      schema: {
        tags: ["launches"],
        params: {
          type: "object",
          required: ["projectId"],
          properties: { projectId: { type: "string" } }
        },
        querystring: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["open", "processing", "closed", "failed", "archived"]
            },
            branch: { type: "string" },
            q: { type: "string" },
            search: { type: "string" },
            sort: {
              type: "string",
              enum: launchSortFields
            },
            order: { type: "string", enum: ["asc", "desc"] },
            limit: { type: "integer", minimum: 1, maximum: maxListLimit },
            cursor: { type: "string" },
            offset: { type: "integer", minimum: 0 }
          }
        }
      }
    },
    async (request, reply) => {
      if (request.validationError) {
        return reply
          .code(400)
          .send(paginationValidationError("invalid launch list query controls"));
      }

      const project = store.projects.get(request.params.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const authDenial = authorizeProjectVisibilityRead(request, project, "launches:read");
      if (authDenial !== undefined) {
        return reply.code(403).send(authDenial);
      }

      const pagination = parseListPagination(request.query, launchSortFields);
      if (isPaginationValidationError(pagination)) {
        return reply.code(400).send(pagination);
      }

      const items = (Array.from(store.launches.values()) as Launch[])
        .filter((launch) => launch.projectId === request.params.projectId)
        .filter(
          (launch) => request.query.status === undefined || launch.status === request.query.status
        )
        .filter(
          (launch) => request.query.branch === undefined || launch.branch === request.query.branch
        )
        .filter((launch) => matchesLaunchSearch(launch, request.query.q ?? request.query.search))
        .sort(compareLaunches(pagination.sort, pagination.order))
        .map(serializeLaunch);

      const page = paginate(items, pagination.limit, pagination.offset);
      return {
        kind: "launch-list",
        projectId: request.params.projectId,
        page: page.metadata,
        items: page.items
      };
    }
  );

  app.post<{
    Params: { projectId: string };
    Body: { name: string; branch?: string; commitSha?: string; buildNumber?: string };
  }>(
    "/api/v1/projects/:projectId/launches",
    {
      schema: {
        tags: ["launches"],
        params: {
          type: "object",
          required: ["projectId"],
          properties: { projectId: { type: "string" } }
        },
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            branch: { type: "string" },
            commitSha: { type: "string" },
            buildNumber: { type: "string" }
          }
        }
      }
    },
    async (request, reply) => {
      const project = store.projects.get(request.params.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const authDenial = authorizeProjectMutation(
        request,
        project,
        "launches:write",
        launchWriteRoles,
        "Actor role is not allowed to mutate launches"
      );
      if (authDenial !== undefined) {
        return reply.code(403).send(authDenial);
      }

      const launch: Launch = {
        id: crypto.randomUUID(),
        projectId: request.params.projectId,
        name: request.body.name,
        status: "open",
        ...(request.body.branch !== undefined ? { branch: request.body.branch } : {}),
        ...(request.body.commitSha !== undefined ? { commitSha: request.body.commitSha } : {}),
        ...(request.body.buildNumber !== undefined
          ? { buildNumber: request.body.buildNumber }
          : {}),
        createdAt: new Date().toISOString(),
        results: []
      };

      store.launches.set(launch.id, launch as DomainLaunch);
      if (store.driver === "postgres") {
        await store.repositories.launches.save(toPersistentLaunch(launch));
      }
      return reply.code(201).send(summarizeStoredLaunch(launch));
    }
  );

  app.get<{ Params: { launchId: string } }>(
    "/api/v1/launches/:launchId",
    {
      schema: {
        tags: ["launches"],
        params: {
          type: "object",
          required: ["launchId"],
          properties: { launchId: { type: "string" } }
        }
      }
    },
    async (request, reply) => {
      const launch = toApiLaunch(store.launches.get(request.params.launchId));
      if (!launch) {
        return reply.code(404).send({ message: "Launch not found" });
      }
      const project = store.projects.get(launch.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const authDenial = authorizeProjectVisibilityRead(request, project, "launches:read");
      if (authDenial !== undefined) {
        return reply.code(403).send(authDenial);
      }

      const activeMutes = await activeMutesForProject(store, launch.projectId);
      const embeddedResults = paginate(
        [...launch.results]
          .sort(compareResults(launch, "createdAt", "asc"))
          .map((result) => serializeResultWithQuarantine(launch, result, activeMutes)),
        launchDetailEmbeddedLimit,
        0
      );
      const embeddedArtifacts = paginate(
        launchArtifacts(store, launch.id).map(serializeArtifactDescriptor),
        launchDetailEmbeddedLimit,
        0
      );

      return {
        ...serializeLaunch(launch),
        results: embeddedResults.items,
        resultsPage: embeddedResults.metadata,
        artifacts: embeddedArtifacts.items,
        artifactsPage: embeddedArtifacts.metadata,
        checksumDuplicates: serializeArtifactChecksumDuplicates(launchArtifacts(store, launch.id)),
        links: {
          results: `/api/v1/launches/${encodeURIComponent(launch.id)}/results?limit=${launchDetailEmbeddedLimit}`,
          artifacts: `/api/v1/artifacts?launchId=${encodeURIComponent(launch.id)}`
        }
      };
    }
  );

  app.get<{
    Params: { launchId: string };
    Querystring: LaunchResultListQuery;
  }>(
    "/api/v1/launches/:launchId/results",
    {
      attachValidation: true,
      schema: {
        tags: ["launches"],
        params: {
          type: "object",
          required: ["launchId"],
          properties: { launchId: { type: "string" } }
        },
        querystring: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["failed", "broken", "passed", "skipped", "unknown"]
            },
            testCaseId: { type: "string" },
            historyId: { type: "string" },
            q: { type: "string" },
            search: { type: "string" },
            sort: {
              type: "string",
              enum: resultSortFields
            },
            order: { type: "string", enum: ["asc", "desc"] },
            limit: { type: "integer", minimum: 1, maximum: maxListLimit },
            cursor: { type: "string" },
            offset: { type: "integer", minimum: 0 }
          }
        }
      }
    },
    async (request, reply) => {
      if (request.validationError) {
        return reply
          .code(400)
          .send(paginationValidationError("invalid result list query controls"));
      }

      const launch = toApiLaunch(store.launches.get(request.params.launchId));
      if (!launch) {
        return reply.code(404).send({ message: "Launch not found" });
      }
      const project = store.projects.get(launch.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const authDenial = authorizeProjectVisibilityRead(request, project, "launches:read");
      if (authDenial !== undefined) {
        return reply.code(403).send(authDenial);
      }

      const pagination = parseListPagination(request.query, resultSortFields);
      if (isPaginationValidationError(pagination)) {
        return reply.code(400).send(pagination);
      }

      const activeMutes = await activeMutesForProject(store, launch.projectId);
      const items = launch.results
        .filter(
          (result) => request.query.status === undefined || result.status === request.query.status
        )
        .filter(
          (result) =>
            request.query.testCaseId === undefined || result.testCaseId === request.query.testCaseId
        )
        .filter(
          (result) =>
            request.query.historyId === undefined || result.historyId === request.query.historyId
        )
        .filter((result) => matchesResultSearch(result, request.query.q ?? request.query.search))
        .sort(compareResults(launch, pagination.sort, pagination.order))
        .map((result) => serializeResultWithQuarantine(launch, result, activeMutes));

      const page = paginate(items, pagination.limit, pagination.offset);
      return {
        kind: "launch-result-list",
        launchId: launch.id,
        projectId: launch.projectId,
        page: page.metadata,
        items: page.items
      };
    }
  );

  app.get<{ Params: { launchId: string; resultUuid: string } }>(
    "/api/v1/launches/:launchId/results/:resultUuid",
    {
      schema: {
        tags: ["launches"],
        params: {
          type: "object",
          required: ["launchId", "resultUuid"],
          properties: {
            launchId: { type: "string" },
            resultUuid: { type: "string" }
          }
        }
      }
    },
    async (request, reply) => {
      const launch = toApiLaunch(store.launches.get(request.params.launchId));
      if (!launch) {
        return reply.code(404).send({ message: "Launch not found" });
      }
      const project = store.projects.get(launch.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const authDenial = authorizeProjectVisibilityRead(request, project, "launches:read");
      if (authDenial !== undefined) {
        return reply.code(403).send(authDenial);
      }

      const details = buildLaunchResultDetails(launch as DomainLaunch, request.params.resultUuid);
      if (details === undefined) {
        return reply.code(404).send({ message: "Launch result not found" });
      }

      const artifacts = resultArtifacts(store, launch, request.params.resultUuid, details);
      const detailsWithPreviewReferences = addArtifactPreviewReferences(details, artifacts);
      const activeMutes = await activeMutesForProject(store, launch.projectId);
      const quarantine = findActiveDefectMuteForResult(activeMutes, details);
      return {
        ...detailsWithPreviewReferences,
        ...(quarantine !== undefined ? { quarantine: serializeProjectionRecord(quarantine) } : {}),
        artifacts: artifacts.map(serializeArtifactDescriptor),
        checksumDuplicates: serializeArtifactChecksumDuplicates(
          launchArtifacts(store, launch.id),
          new Set(artifacts.map((artifact) => artifact.id))
        )
      };
    }
  );

  app.get<{ Params: { launchId: string } }>(
    "/api/v1/launches/:launchId/quality-gate",
    {
      preValidation: (request, _reply, done) => {
        (request as { body: QualityGateEvaluationRequestBody }).body ??= {};
        done();
      },
      schema: {
        tags: ["quality-gates"],
        params: {
          type: "object",
          required: ["launchId"],
          properties: { launchId: { type: "string" } }
        }
      }
    },
    async (request, reply) => {
      const launch = toApiLaunch(store.launches.get(request.params.launchId));
      if (!launch) {
        return reply.code(404).send({ message: "Launch not found" });
      }
      const project = store.projects.get(launch.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const authDenial = authorizeProjectVisibilityRead(request, project, "quality-gates:evaluate");
      if (authDenial !== undefined) {
        return reply.code(403).send(authDenial);
      }

      return evaluateQualityGate(launch as DomainLaunch, {
        defectMutes: await activeMutesForProject(store, launch.projectId),
        defectMuteRules: persistedDefectMuteRules
      });
    }
  );

  app.post<{ Params: { launchId: string }; Body?: QualityGateEvaluationRequestBody }>(
    "/api/v1/launches/:launchId/quality-gate",
    {
      schema: {
        tags: ["quality-gates"],
        params: {
          type: "object",
          required: ["launchId"],
          properties: { launchId: { type: "string" } }
        },
        body: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              properties: {
                rules: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["metric", "op", "value", "severity"],
                    additionalProperties: false,
                    properties: {
                      metric: {
                        type: "string",
                        enum: ["failed", "broken", "unknown", "passRate", "total"]
                      },
                      op: { type: "string", enum: ["lte", "gte"] },
                      value: { type: "number" },
                      severity: { type: "string", enum: ["warn", "fail"] }
                    }
                  }
                },
                thresholds: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    newFailures: qualityGateThresholdSchema(),
                    failedBrokenTotal: qualityGateThresholdSchema(),
                    criticalFailures: qualityGateThresholdSchema(),
                    flakyTests: qualityGateThresholdSchema(),
                    durationRegressions: qualityGateThresholdSchema(),
                    unknown: qualityGateThresholdSchema(),
                    passRate: qualityGateThresholdSchema(),
                    criticalLabels: {
                      type: "object",
                      additionalProperties: {
                        type: "array",
                        items: { type: "string" }
                      }
                    }
                  }
                },
                defectMutes: {
                  type: "array",
                  items: defectMuteRecordSchema()
                },
                defectMuteRules: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["code", "reasonCode", "mode"],
                    additionalProperties: false,
                    properties: {
                      code: { type: "string" },
                      reasonCode: { type: "string" },
                      mode: {
                        type: "string",
                        enum: ["exclude_muted_affected_tests"]
                      }
                    }
                  }
                }
              }
            },
            { type: "null" }
          ]
        }
      }
    },
    async (request, reply) => {
      const launch = toApiLaunch(store.launches.get(request.params.launchId));
      if (!launch) {
        return reply.code(404).send({ message: "Launch not found" });
      }
      const project = store.projects.get(launch.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }
      const authDenial = authorizeProjectVisibilityRead(request, project, "quality-gates:evaluate");
      if (authDenial !== undefined) {
        return reply.code(403).send(authDenial);
      }

      const persistedMutes = await activeMutesForProject(store, launch.projectId);
      const body = request.body;
      if (
        body?.thresholds !== undefined ||
        body?.defectMutes !== undefined ||
        body?.defectMuteRules !== undefined ||
        persistedMutes.length > 0
      ) {
        return evaluateQualityGate(launch as DomainLaunch, {
          ...(body?.rules !== undefined ? { rules: body.rules } : {}),
          ...(body?.thresholds !== undefined ? { thresholds: body.thresholds } : {}),
          defectMutes: body?.defectMutes ?? persistedMutes,
          defectMuteRules: body?.defectMuteRules ?? persistedDefectMuteRules
        });
      }

      return evaluateQualityGate(launch as DomainLaunch, body?.rules);
    }
  );

  registerLaunchLifecycleRoutes(app, store);
}
