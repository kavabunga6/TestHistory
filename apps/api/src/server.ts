import { createApiApp } from "./app.js";
import { createRuntimeAppStore } from "./runtimeStore.js";

const port = Number(process.env.API_PORT ?? "18080");
const store = await createRuntimeAppStore(process.env);
const app = await createApiApp(store);

let shuttingDown = false;
const shutdown = async (signal: NodeJS.Signals) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  app.log.info({ signal }, "Shutting down API server");
  try {
    await app.close();
    process.exitCode = 0;
  } catch (error) {
    app.log.error({ error, signal }, "Failed to shut down API server cleanly");
    process.exitCode = 1;
  }
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port, host: "0.0.0.0" });
