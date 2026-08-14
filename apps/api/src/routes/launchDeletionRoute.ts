import type { FastifyInstance } from "fastify";

import type { AppStore, Launch } from "../store.js";
import { authorizeProjectMutation } from "./project-auth.js";
import { removeLaunchRecords } from "./launchDeletion.js";

export function registerLaunchDeletionRoute(app: FastifyInstance, store: AppStore) {
  app.delete<{ Params: { launchId: string } }>(
    "/api/v1/launches/:launchId",
    {
      schema: {
        tags: ["launches"],
        params: {
          type: "object",
          additionalProperties: false,
          required: ["launchId"],
          properties: { launchId: { type: "string", minLength: 1 } }
        },
        response: {
          200: { type: "object", additionalProperties: true },
          403: { type: "object", additionalProperties: true },
          404: { type: "object", additionalProperties: true },
          409: { type: "object", additionalProperties: true }
        }
      }
    },
    async (request, reply) => {
      const launch = store.launches.get(request.params.launchId);
      if (launch === undefined) {
        return reply.code(404).send({ message: "Launch not found", redacted: true });
      }
      const project = store.projects.get(launch.projectId);
      if (project === undefined) {
        return reply.code(404).send({ message: "Project not found", redacted: true });
      }
      const authDenial = authorizeProjectMutation(
        request,
        project,
        "launches:write",
        ["owner", "maintainer"],
        "Actor role is not allowed to delete launches"
      );
      if (authDenial !== undefined) {
        return reply.code(403).send(authDenial);
      }
      const launchStatus = (launch as Launch).status;
      if (launchStatus === "open" || launchStatus === "processing") {
        return reply.code(409).send({
          message: `Active launch cannot be deleted; current status is ${launchStatus}`,
          redacted: true
        });
      }

      const removed = await removeLaunchRecords(store, launch.id);
      return reply.send({
        kind: "launch-deletion",
        launchId: launch.id,
        projectId: launch.projectId,
        removed
      });
    }
  );
}
