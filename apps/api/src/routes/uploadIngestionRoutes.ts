import type { FastifyInstance } from "fastify";
import type { AppStore } from "../store.js";
import { registerUploadChunkedRoutes } from "./uploadChunkedRoutes.js";
import { registerUploadJobProcessRoutes } from "./uploadJobProcessRoutes.js";
import { registerUploadQueueRoutes } from "./uploadQueueRoutes.js";

export async function registerUploadIngestionRoutes(app: FastifyInstance, store: AppStore) {
  await registerUploadQueueRoutes(app, store);
  await registerUploadChunkedRoutes(app, store);
  await registerUploadJobProcessRoutes(app, store);
}
