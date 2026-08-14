import type { FastifyInstance } from "fastify";

import { enqueueLaunchNotifications } from "../integrationDeliveryService.js";
import {
  syncTestCasesFromLaunch,
  type AppStore,
  type Launch,
  type LaunchClosePipeline
} from "../store.js";
import {
  toPersistentLaunch,
  toPersistentTestCase,
  toPersistentTestCaseHistory
} from "../storeMappers.js";
import {
  buildProcessingSummary,
  closePipelineResponse,
  collectUploadErrors,
  reconcilePendingUploads,
  serializeLaunch,
  toApiLaunch
} from "./launchHelpers.js";
import { actorIdHeader, authorizeProjectMutation } from "./project-auth.js";

const launchWriteRoles = ["owner", "maintainer", "editor", "ci"] as const;

export function registerLaunchLifecycleRoutes(app: FastifyInstance, store: AppStore) {
  app.post<{ Params: { launchId: string } }>(
    "/api/v1/launches/:launchId/close",
    { schema: launchMutationSchema },
    async (request, reply) => {
      const launch = toApiLaunch(store.launches.get(request.params.launchId));
      if (!launch) return reply.code(404).send({ message: "Launch not found" });
      const project = store.projects.get(launch.projectId);
      if (project === undefined) return reply.code(404).send({ message: "Project not found" });
      const authDenial = authorizeProjectMutation(
        request,
        project,
        "launches:write",
        launchWriteRoles,
        "Actor role is not allowed to mutate launches"
      );
      if (authDenial !== undefined) return reply.code(403).send(authDenial);

      if (launch.status === "archived") {
        return reply.code(409).send({
          message: "Archived launch cannot be closed",
          launch: serializeLaunch(launch)
        });
      }
      if (launch.status === "closed" || launch.status === "failed") {
        return reply.send(closePipelineResponse(launch));
      }

      const pending = await moveLaunchThroughClosePipeline(store, launch);
      if (pending !== undefined) return reply.code(409).send(pending);

      await enqueueLaunchNotifications(store, launch, {
        type: "actor",
        actorId: actorIdHeader(request) ?? "system"
      });
      return reply.send(closePipelineResponse(launch));
    }
  );

  app.post<{ Params: { launchId: string } }>(
    "/api/v1/launches/:launchId/archive",
    { schema: launchMutationSchema },
    async (request, reply) => {
      const launch = toApiLaunch(store.launches.get(request.params.launchId));
      if (!launch) return reply.code(404).send({ message: "Launch not found" });
      const project = store.projects.get(launch.projectId);
      if (project === undefined) return reply.code(404).send({ message: "Project not found" });
      const authDenial = authorizeProjectMutation(
        request,
        project,
        "launches:write",
        launchWriteRoles,
        "Actor role is not allowed to mutate launches"
      );
      if (authDenial !== undefined) return reply.code(403).send(authDenial);
      if (launch.status === "open" || launch.status === "processing") {
        return reply.code(409).send({
          message: `Launch must be closed or failed before archive; current status is ${launch.status}`,
          launch: serializeLaunch(launch)
        });
      }
      if (launch.status !== "archived") {
        launch.status = "archived";
        launch.archivedAt = new Date().toISOString();
        if (store.driver === "postgres") {
          await store.repositories.launches.save(toPersistentLaunch(launch));
        }
      }
      return reply.send({ launch: serializeLaunch(launch) });
    }
  );
}

async function moveLaunchThroughClosePipeline(store: AppStore, launch: Launch) {
  const now = new Date().toISOString();
  const pendingUploads = reconcilePendingUploads(store, launch.id);
  if (pendingUploads.length > 0) {
    launch.closePipeline = {
      status: "pending_uploads",
      requestedAt: launch.closePipeline?.requestedAt ?? now,
      updatedAt: now,
      pendingUploads,
      summary: buildProcessingSummary(store, launch, 0),
      processedTestCases: 0,
      errors: []
    };
    if (store.driver === "postgres") {
      await store.repositories.launches.save(toPersistentLaunch(launch));
    }
    return { message: "Launch has pending uploads", ...closePipelineResponse(launch) };
  }

  launch.status = "processing";
  launch.closePipeline = {
    status: "processing",
    requestedAt: launch.closePipeline?.requestedAt ?? now,
    startedAt: now,
    updatedAt: now,
    pendingUploads: [],
    summary: buildProcessingSummary(store, launch, 0),
    processedTestCases: 0,
    errors: collectUploadErrors(store, launch.id)
  };

  try {
    closeLaunch(store, launch);
  } catch (error) {
    failLaunch(store, launch, error);
  }
  await persistClosedLaunch(store, launch);
  return undefined;
}

function closeLaunch(store: AppStore, launch: Launch) {
  const processedTestCases = syncTestCasesFromLaunch(store, launch);
  const finishedAt = new Date().toISOString();
  launch.status = "closed";
  launch.closedAt = finishedAt;
  launch.closePipeline = {
    ...launch.closePipeline!,
    status: "closed",
    updatedAt: finishedAt,
    finishedAt,
    pendingUploads: [],
    summary: buildProcessingSummary(store, launch, processedTestCases),
    processedTestCases,
    errors: collectUploadErrors(store, launch.id)
  };
}

function failLaunch(store: AppStore, launch: Launch, error: unknown) {
  const failedAt = new Date().toISOString();
  launch.status = "failed";
  launch.failedAt = failedAt;
  launch.closePipeline = {
    ...(launch.closePipeline as LaunchClosePipeline),
    status: "failed",
    updatedAt: failedAt,
    finishedAt: failedAt,
    summary: buildProcessingSummary(store, launch, 0),
    processedTestCases: 0,
    errors: [
      ...(launch.closePipeline?.errors ?? []),
      { scope: "close", message: error instanceof Error ? error.message : String(error) }
    ]
  };
}

async function persistClosedLaunch(store: AppStore, launch: Launch) {
  if (store.driver !== "postgres") return;
  await store.transaction(async (repositories) => {
    await repositories.launches.save(toPersistentLaunch(launch));
    const testCases = Array.from(store.testCases.values()).filter(
      (testCase) => testCase.projectId === launch.projectId
    );
    for (const testCase of testCases) {
      await repositories.testCases.save(toPersistentTestCase(testCase));
      await repositories.testCaseHistory.saveMany(
        testCase.historyVersions.map((history) =>
          toPersistentTestCaseHistory(testCase.id, testCase.projectId, history)
        )
      );
    }
  });
}

const launchMutationSchema = {
  tags: ["launches"],
  params: {
    type: "object",
    required: ["launchId"],
    properties: { launchId: { type: "string" } }
  }
} as const;
