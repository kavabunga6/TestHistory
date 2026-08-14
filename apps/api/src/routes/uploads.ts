import type { FastifyInstance } from "fastify";
import type { AppStore } from "../store.js";
import { registerUploadAllureCtlRoutes } from "./uploadAllureCtlRoutes.js";
import { registerUploadArchiveReplayRoutes } from "./uploadArchiveReplayRoutes.js";
import { registerUploadArchiveRoutes } from "./uploadArchiveRoutes.js";
import { registerUploadIngestionRoutes } from "./uploadIngestionRoutes.js";

export async function registerUploadRoutes(app: FastifyInstance, store: AppStore) {
  await registerUploadArchiveRoutes(app, store);
  await registerUploadArchiveReplayRoutes(app, store);
  await registerUploadIngestionRoutes(app, store);
  await registerUploadAllureCtlRoutes(app, store);
}
