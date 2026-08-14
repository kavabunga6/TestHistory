import {
  createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors,
  createRetentionPlan,
  defaultArtifactPolicy,
  executeArtifactCleanup,
  type ArtifactKind,
  type ArtifactStorageKey
} from "@testhistory/artifacts";
import type { FastifyInstance } from "fastify";
import { serializeArtifactDescriptor } from "./artifact-responses.js";
import { defaultUploadFieldPolicy, type AppStore, type Launch } from "../store.js";
import { registerArtifactContentRoute } from "./artifactContentRoute.js";
import {
  artifactRetentionReadScope,
  authorizeArtifactRetentionRead,
  authorizeArtifactRetentionRequest
} from "./artifactRetentionAuth.js";
import {
  removeDeletedArtifactDescriptors,
  serializeArtifactCleanupExecutionResult
} from "./artifactCleanupResponse.js";
import {
  buildPreviewRetentionDryRunPlan,
  chunk,
  paginate,
  parsePositiveIntegerOption,
  parseArtifactListPagination,
  parsePreviewRetentionPagination,
  parsePreviewRetentionSchedulePagination,
  previewRetentionReadPolicy,
  previewRetentionScheduleExecution,
  previewRetentionScheduleReadPolicy,
  previewRetentionValidationErrorHandler,
  readPreviewRetentionRecord,
  readSingleHeader,
  sanitizeOptionalPublicIdentifier,
  sanitizeScheduleDigest,
  serializePreviewRetentionRecord,
  serializePreviewRetentionScheduleDescriptor,
  summarizePreviewRetentionRecords,
  summarizePreviewRetentionScheduleDescriptors
} from "./artifactPreviewRetentionResponses.js";

type AttachmentPreviewRetentionQuery = {
  batchSize?: number | string;
  limit?: number | string;
  cursor?: string;
  status?: AttachmentPreviewRetentionStatus;
};

type AttachmentPreviewRetentionScheduleQuery = {
  limit?: number | string;
  cursor?: string;
  scheduleDigest?: string;
  scheduleSize?: number | string;
};

type ArtifactRetentionExecutionRequest = {
  projectId?: string;
  dryRun?: boolean;
  batchSize?: number;
  maxBytes?: number;
};

type ArtifactListQuery = {
  launchId?: string;
  projectId?: string;
  kind?: ArtifactKind;
  limit?: number | string;
  cursor?: string;
  offset?: number | string;
};

type AttachmentPreviewRetentionStatus = "cleanup_eligible" | "retained" | "preserved";

const artifactKinds: ArtifactKind[] = [
  "allure-result",
  "allure-container",
  "attachment",
  "fixture",
  "scenario",
  "environment",
  "executor",
  "unknown"
];

const maxPreviewRetentionLimit = 100;
const maxPreviewRetentionBatchSize = 100;
const defaultArtifactCleanupExecutionBatchSize = 100;
const maxArtifactCleanupExecutionBatchSize = 500;
const defaultArtifactCleanupExecutionMaxBytes = 512 * 1024 * 1024;
const maxArtifactCleanupExecutionMaxBytes = 1024 * 1024 * 1024;
const maxArtifactListLimit = 500;
const scheduleDigestPattern = "^[a-f0-9]{24}$";

export async function registerArtifactRoutes(app: FastifyInstance, store: AppStore) {
  registerArtifactContentRoute(app, store);

  app.get<{
    Querystring: ArtifactListQuery;
  }>(
    "/api/v1/artifacts",
    {
      attachValidation: true,
      schema: {
        tags: ["artifacts"],
        querystring: {
          type: "object",
          properties: {
            launchId: { type: "string" },
            projectId: { type: "string" },
            kind: { type: "string", enum: artifactKinds },
            limit: { type: "integer", minimum: 1, maximum: maxArtifactListLimit },
            cursor: { type: "string" },
            offset: { type: "integer", minimum: 0 }
          }
        }
      }
    },
    async (request, reply) => {
      if (request.validationError) {
        return reply.code(400).send({
          code: "artifact.pagination.invalid",
          message: "invalid artifact list query controls",
          redacted: true
        });
      }

      const launchProjectId =
        request.query.launchId === undefined
          ? undefined
          : store.launches.get(request.query.launchId)?.projectId;
      if (request.query.launchId !== undefined && launchProjectId === undefined) {
        return reply.code(404).send({ message: "Launch not found", redacted: true });
      }
      if (request.query.projectId !== undefined && !store.projects.has(request.query.projectId)) {
        return reply.code(404).send({ message: "Project not found", redacted: true });
      }
      const authorizationDenial = authorizeArtifactRetentionRequest(
        request,
        store,
        request.query.projectId ?? launchProjectId,
        false
      );
      if (authorizationDenial !== undefined) {
        return reply.code(403).send(authorizationDenial);
      }

      const items = Array.from(store.artifacts.values())
        .filter(
          (artifact) =>
            request.query.launchId === undefined || artifact.launchId === request.query.launchId
        )
        .filter(
          (artifact) => request.query.kind === undefined || artifact.kind === request.query.kind
        )
        .filter((artifact) => {
          if (request.query.projectId === undefined) {
            return true;
          }
          const launch = store.launches.get(artifact.launchId);
          return launch?.projectId === request.query.projectId;
        })
        .map(serializeArtifactDescriptor);

      if (request.query.limit === undefined && request.query.cursor === undefined) {
        return items;
      }

      const pagination = parseArtifactListPagination(request.query);
      if (typeof pagination === "string") {
        return reply.code(400).send({
          code: "artifact.pagination.invalid",
          message: pagination,
          redacted: true
        });
      }

      const page = paginate(items, pagination.limit, pagination.offset);
      return {
        kind: "artifact-list",
        page: page.metadata,
        items: page.items
      };
    }
  );

  app.get(
    "/api/v1/artifacts/upload-policy",
    {
      schema: {
        tags: ["artifacts"]
      }
    },
    async () => {
      const policy = defaultArtifactPolicy();
      return {
        ...policy,
        fieldSources: defaultUploadFieldPolicy(),
        chunkedUploads: true,
        acceptedKinds: artifactKinds,
        resultFilePattern: "*-result.json",
        containerFilePattern: "*-container.json"
      };
    }
  );

  app.get<{
    Params: { launchId: string };
    Querystring: AttachmentPreviewRetentionQuery;
  }>(
    "/api/v1/launches/:launchId/attachment-previews/retention/preview",
    {
      schema: {
        tags: ["artifacts"],
        params: {
          type: "object",
          required: ["launchId"],
          properties: { launchId: { type: "string" } }
        },
        querystring: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              minimum: 1,
              maximum: maxPreviewRetentionLimit
            },
            cursor: { type: "string" },
            batchSize: {
              type: "integer",
              minimum: 1,
              maximum: maxPreviewRetentionBatchSize
            },
            status: {
              type: "string",
              enum: ["cleanup_eligible", "retained", "preserved"]
            }
          }
        },
        response: {
          200: { type: "object", additionalProperties: true },
          400: { type: "object", additionalProperties: true },
          403: { type: "object", additionalProperties: true },
          404: { type: "object", additionalProperties: true },
          409: { type: "object", additionalProperties: true }
        }
      },
      errorHandler: previewRetentionValidationErrorHandler
    },
    async (request, reply) => {
      const launch = store.launches.get(request.params.launchId) as Launch | undefined;
      if (launch === undefined) {
        return reply.code(404).send({ message: "Launch not found" });
      }

      const project = store.projects.get(launch.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const denial = authorizeArtifactRetentionRead(request, project);
      if (denial !== undefined) {
        return reply.code(403).send(denial);
      }

      if (launch.status !== "closed") {
        return reply.code(409).send({
          error: "LaunchStateError",
          message: "Attachment preview retention preview is available for closed launches only",
          launchId: launch.id,
          projectId: launch.projectId,
          requiredLaunchStatus: "closed",
          actualLaunchStatus: launch.status,
          redacted: true
        });
      }

      const pagination = parsePreviewRetentionPagination(request.query);
      if (typeof pagination === "string") {
        return reply.code(400).send({ message: pagination, redacted: true });
      }

      const now = new Date();
      const records: Array<ReturnType<typeof serializePreviewRetentionRecord>> = [];
      let invalidDescriptorCount = 0;
      const scannedArtifacts = Array.from(store.artifacts.values()).filter(
        (artifact) => artifact.launchId === launch.id && artifact.kind === "attachment"
      );

      for (const artifact of scannedArtifacts) {
        const record = readPreviewRetentionRecord(artifact, now);
        if (record === undefined) {
          continue;
        }
        if (record === "invalid") {
          invalidDescriptorCount += 1;
          continue;
        }
        records.push(serializePreviewRetentionRecord(launch, artifact, record, now));
      }

      const filteredRecords = records.filter(
        (record) => request.query.status === undefined || record.status === request.query.status
      );
      const page = paginate(filteredRecords, pagination.limit, pagination.offset);
      const dryRunPlan = buildPreviewRetentionDryRunPlan(page.items, pagination.batchSize);

      return {
        kind: "attachment-preview-retention-preview",
        query: {
          status: request.query.status ?? null,
          limit: pagination.limit,
          cursor: request.query.cursor ?? null,
          batchSize: pagination.batchSize
        },
        launch: {
          id: launch.id,
          projectId: launch.projectId,
          status: launch.status,
          closedAt: launch.closedAt ?? null
        },
        access: {
          scope: artifactRetentionReadScope,
          projectScoped: true,
          mutation: false,
          redacted: true
        },
        execution: {
          dryRun: true,
          executionMode: "dry-run",
          deletionStarted: false,
          deletionMutation: false,
          deletionExecution: false,
          providerActions: false,
          objectStorageTouched: false,
          deleteRequestedCount: 0
        },
        boundary: {
          scope: "closed-launch",
          eligibleLaunchStatus: "closed",
          closedLaunchScoped: true,
          descriptorSource: "artifact-preview-descriptor-read-model",
          rawMaterialReturned: false
        },
        page: page.metadata,
        summary: summarizePreviewRetentionRecords(records, invalidDescriptorCount),
        items: page.items,
        dryRunPlan,
        policy: previewRetentionReadPolicy()
      };
    }
  );

  app.get<{
    Params: { launchId: string };
    Querystring: AttachmentPreviewRetentionScheduleQuery;
  }>(
    "/api/v1/launches/:launchId/attachment-previews/retention/dry-run/schedule",
    {
      schema: {
        tags: ["artifacts"],
        params: {
          type: "object",
          required: ["launchId"],
          properties: { launchId: { type: "string" } }
        },
        querystring: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              minimum: 1,
              maximum: maxPreviewRetentionLimit
            },
            cursor: { type: "string" },
            scheduleDigest: { type: "string", pattern: scheduleDigestPattern },
            scheduleSize: {
              type: "integer",
              minimum: 1,
              maximum: maxPreviewRetentionBatchSize
            }
          }
        },
        response: {
          200: { type: "object", additionalProperties: true },
          400: { type: "object", additionalProperties: true },
          403: { type: "object", additionalProperties: true },
          404: { type: "object", additionalProperties: true },
          409: { type: "object", additionalProperties: true }
        }
      },
      errorHandler: previewRetentionValidationErrorHandler
    },
    async (request, reply) => {
      const launch = store.launches.get(request.params.launchId) as Launch | undefined;
      if (launch === undefined) {
        return reply.code(404).send({ message: "Launch not found" });
      }

      const project = store.projects.get(launch.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const denial = authorizeArtifactRetentionRead(request, project);
      if (denial !== undefined) {
        return reply.code(403).send(denial);
      }

      if (launch.status !== "closed") {
        return reply.code(409).send({
          error: "LaunchStateError",
          message:
            "Attachment preview retention schedule descriptors are available for closed launches only",
          launchId: launch.id,
          projectId: launch.projectId,
          requiredLaunchStatus: "closed",
          actualLaunchStatus: launch.status,
          redacted: true
        });
      }

      const pagination = parsePreviewRetentionSchedulePagination(request.query);
      if (typeof pagination === "string") {
        return reply.code(400).send({ message: pagination, redacted: true });
      }

      const launchArtifacts = Array.from(store.artifacts.values()).filter(
        (artifact) => artifact.launchId === launch.id
      );
      const scheduleDescriptors = createAttachmentPreviewRetentionDryRunArtifactScheduleDescriptors(
        {
          artifacts: launchArtifacts,
          closedLaunchIds: [launch.id],
          now: new Date(),
          maxDescriptorsPerSchedule: pagination.scheduleSize
        }
      );
      const filteredSchedules =
        request.query.scheduleDigest === undefined
          ? scheduleDescriptors.schedules
          : scheduleDescriptors.schedules.filter(
              (schedule) => schedule.scheduleDigest === request.query.scheduleDigest
            );
      const page = paginate(filteredSchedules, pagination.limit, pagination.offset);
      const actorId = sanitizeOptionalPublicIdentifier(
        readSingleHeader(request.headers["x-testhistory-actor-id"])
      );

      return {
        kind: "attachment-preview-retention-dry-run-schedule",
        scope: {
          projectId: launch.projectId,
          launchId: launch.id,
          ...(actorId !== undefined ? { actorId } : {})
        },
        access: {
          scope: artifactRetentionReadScope,
          projectScoped: true,
          actorScoped: actorId !== undefined,
          mutation: false,
          redacted: true
        },
        query: {
          scheduleDigest: sanitizeScheduleDigest(request.query.scheduleDigest) ?? null,
          limit: pagination.limit,
          cursor: pagination.offset === 0 ? null : String(pagination.offset),
          scheduleSize: pagination.scheduleSize
        },
        boundary: {
          scope: "closed-launch",
          eligibleLaunchStatus: "closed",
          workerScheduled: false,
          closedLaunchScoped: true,
          descriptorSource: "artifact-schedule-descriptor-read-model",
          rawMaterialReturned: false
        },
        execution: previewRetentionScheduleExecution(),
        page: page.metadata,
        summary: summarizePreviewRetentionScheduleDescriptors(
          scheduleDescriptors,
          filteredSchedules
        ),
        transitions: [
          {
            state: "preview_retention_schedule_descriptors_read",
            at: new Date().toISOString()
          }
        ],
        batches: page.items.map(serializePreviewRetentionScheduleDescriptor),
        diagnostics: [],
        policy: previewRetentionScheduleReadPolicy()
      };
    }
  );

  app.post<{ Body?: { projectId?: string; batchSize?: number } }>(
    "/api/v1/artifacts/retention/preview",
    {
      schema: {
        tags: ["artifacts"],
        body: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            batchSize: { type: "number", minimum: 1 }
          }
        }
      }
    },
    async (request, reply) => {
      const authorizationDenial = authorizeArtifactRetentionRequest(
        request,
        store,
        request.body?.projectId,
        false
      );
      if (authorizationDenial !== undefined) {
        return reply.code(403).send(authorizationDenial);
      }

      const batchSize = Math.max(1, Math.floor(request.body?.batchSize ?? 100));
      const artifacts = Array.from(store.artifacts.values()).filter((artifact) => {
        if (request.body?.projectId === undefined) {
          return true;
        }
        return store.launches.get(artifact.launchId)?.projectId === request.body.projectId;
      });
      const closedLaunchArtifacts = artifacts.filter(
        (artifact) => store.launches.get(artifact.launchId)?.status === "closed"
      );
      const skippedOpenLaunchArtifacts = artifacts.filter(
        (artifact) => store.launches.get(artifact.launchId)?.status !== "closed"
      );
      const plan = createRetentionPlan(closedLaunchArtifacts);

      return {
        expired: plan.expired.map(serializeArtifactDescriptor),
        retained: [...plan.retained, ...skippedOpenLaunchArtifacts].map(
          serializeArtifactDescriptor
        ),
        skippedOpenLaunchArtifacts: skippedOpenLaunchArtifacts.map(serializeArtifactDescriptor),
        deletionPlan: {
          eligibleLaunchStatus: "closed",
          batchSize,
          batches: chunk(plan.expired, batchSize).map((batch, index) => ({
            index,
            artifactIds: batch.map((artifact) => artifact.id)
          }))
        }
      };
    }
  );

  app.post<{ Body?: ArtifactRetentionExecutionRequest }>(
    "/api/v1/artifacts/retention/execute",
    {
      schema: {
        tags: ["artifacts"],
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            projectId: { type: "string" },
            dryRun: { type: "boolean", default: true },
            batchSize: {
              type: "integer",
              minimum: 1,
              maximum: maxArtifactCleanupExecutionBatchSize
            },
            maxBytes: {
              type: "integer",
              minimum: 1,
              maximum: maxArtifactCleanupExecutionMaxBytes
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
      const projectId = request.body?.projectId;
      if (projectId !== undefined && !store.projects.has(projectId)) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const authorizationDenial = authorizeArtifactRetentionRequest(
        request,
        store,
        projectId,
        true
      );
      if (authorizationDenial !== undefined) {
        return reply.code(403).send(authorizationDenial);
      }

      const batchSize = parsePositiveIntegerOption(
        request.body?.batchSize,
        defaultArtifactCleanupExecutionBatchSize,
        maxArtifactCleanupExecutionBatchSize,
        "batchSize"
      );
      if (typeof batchSize === "string") {
        return reply.code(400).send({ message: batchSize });
      }

      const maxBytes = parsePositiveIntegerOption(
        request.body?.maxBytes,
        defaultArtifactCleanupExecutionMaxBytes,
        maxArtifactCleanupExecutionMaxBytes,
        "maxBytes"
      );
      if (typeof maxBytes === "string") {
        return reply.code(400).send({ message: maxBytes });
      }

      const dryRun = request.body?.dryRun ?? true;
      const artifacts = Array.from(store.artifacts.values()).filter((artifact) => {
        if (projectId === undefined) {
          return true;
        }
        return (
          artifact.projectId === projectId ||
          store.launches.get(artifact.launchId)?.projectId === projectId
        );
      });
      const closedLaunchIds = Array.from(store.launches.values())
        .filter((launch) => launch.status === "closed")
        .filter((launch) => projectId === undefined || launch.projectId === projectId)
        .map((launch) => launch.id);
      const deletedStorageKeys = new Set<ArtifactStorageKey>();
      const result = await executeArtifactCleanup({
        artifacts,
        closedLaunchIds,
        dryRun,
        maxCount: batchSize,
        maxBytes,
        objectStore: {
          async deleteObjects(keys) {
            const receipt = await store.artifactObjects.deleteObjects(keys);
            for (const key of receipt.deleted) {
              deletedStorageKeys.add(key);
            }
            return receipt;
          }
        }
      });
      const removedDescriptorCount = dryRun
        ? 0
        : await removeDeletedArtifactDescriptors(store, deletedStorageKeys);

      return serializeArtifactCleanupExecutionResult(result, {
        ...(projectId !== undefined ? { projectId } : {}),
        removedDescriptorCount
      });
    }
  );
}
