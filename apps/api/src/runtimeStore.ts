import { createAppStore, type AppStore } from "./store.js";
import { createFileBackedAppStore } from "./storeFilePersistence.js";
import { createS3ArtifactObjectStoreFromEnv } from "./s3ArtifactObjectStore.js";
import { createPostgresAppStore } from "./postgresAppStore.js";
import { resolvePostgresPersistenceConfig } from "./persistence/postgres.js";

export type RuntimeStorePlan =
  { mode: "file"; filePath: string } | { mode: "memory" } | { mode: "postgres" };

export function resolveRuntimeStorePlan(env: NodeJS.ProcessEnv = process.env): RuntimeStorePlan {
  const filePath = env.TESTHISTORY_STORE_FILE?.trim();
  if (filePath !== undefined && filePath.length > 0) {
    return { mode: "file", filePath };
  }

  if (resolvePostgresPersistenceConfig(env) !== undefined) {
    return { mode: "postgres" };
  }

  if (env.NODE_ENV === "production") {
    throw new Error(
      "No durable store is configured. Refusing to start production with an ephemeral memory store. " +
        "Set TESTHISTORY_DATABASE_URL for PostgreSQL or TESTHISTORY_STORE_FILE for a single-instance transitional deployment."
    );
  }

  return { mode: "memory" };
}

export async function createRuntimeAppStore(
  env: NodeJS.ProcessEnv = process.env
): Promise<AppStore> {
  const plan = resolveRuntimeStorePlan(env);
  const store =
    plan.mode === "file"
      ? createFileBackedAppStore(plan.filePath)
      : plan.mode === "postgres"
        ? await createPostgresAppStore(resolvePostgresPersistenceConfig(env)!)
        : createAppStore();
  const artifactObjects = createS3ArtifactObjectStoreFromEnv(env);
  return artifactObjects === undefined ? store : { ...store, artifactObjects };
}
