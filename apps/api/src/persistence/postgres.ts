import type { TestHistoryPersistence, TestHistoryRepositories } from "@testhistory/domain";
import pg from "pg";
import { schemaMigrations, seedPolicy, type MigrationDefinition } from "./migrations.js";
import { createPostgresRepositories } from "./postgresRepositories.js";
import {
  quoteIdentifier,
  readIdentifier,
  readInteger,
  redactPostgresConnectionString,
  sanitizeDatabaseError,
  table,
  withRedactedInspect
} from "./postgresRepositoryHelpers.js";
import type { MigrationRow } from "./postgresRows.js";

const { Pool } = pg;

export type PostgresPersistenceConfig = {
  driver: "postgres";
  connectionString: string;
  schema: string;
  migrationsTable: string;
  advisoryLockKey: number;
  requireSsl: boolean;
};

export type PostgresPersistencePlan = {
  config: PostgresPersistenceConfig;
  migrations: MigrationDefinition[];
  seedPolicy: typeof seedPolicy;
};

export type PostgresQueryable = Pick<pg.Pool | pg.PoolClient, "query">;

export { createPostgresRepositories, redactPostgresConnectionString };

export function resolvePostgresPersistenceConfig(
  env: NodeJS.ProcessEnv = process.env
): PostgresPersistenceConfig | undefined {
  const connectionString = env.TESTHISTORY_DATABASE_URL ?? env.DATABASE_URL;
  if (connectionString === undefined || connectionString.trim() === "") {
    return undefined;
  }

  return withRedactedInspect({
    driver: "postgres",
    connectionString,
    schema: readIdentifier(env.TESTHISTORY_DATABASE_SCHEMA, "public", "schema"),
    migrationsTable: "schema_migrations",
    advisoryLockKey: readInteger(env.TESTHISTORY_MIGRATION_LOCK_KEY, 92_605_300),
    requireSsl: env.TESTHISTORY_DATABASE_SSL === "true"
  });
}

export function createPostgresPersistencePlan(
  env: NodeJS.ProcessEnv = process.env
): PostgresPersistencePlan | undefined {
  const config = resolvePostgresPersistenceConfig(env);
  if (config === undefined) {
    return undefined;
  }

  return {
    config,
    migrations: schemaMigrations,
    seedPolicy
  };
}

export async function createPostgresPersistence(
  config: PostgresPersistenceConfig
): Promise<TestHistoryPersistence> {
  const pool = new Pool({
    connectionString: config.connectionString,
    ssl: config.requireSsl ? { rejectUnauthorized: false } : undefined
  });

  await applyMigrations(pool, config);

  const repositories = createPostgresRepositories(pool, config);
  const persistence = {
    repositories,
    health: () => readHealth(pool, config),
    transaction: async <T>(work: (repositories: TestHistoryRepositories) => Promise<T>) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work(createPostgresRepositories(client, config));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw sanitizeDatabaseError(error, "PostgreSQL transaction failed", config);
      } finally {
        client.release();
      }
    },
    close: () => pool.end()
  };

  return persistence;
}

async function applyMigrations(pool: pg.Pool, config: PostgresPersistenceConfig): Promise<void> {
  const schema = quoteIdentifier(config.schema);
  const migrationsTable = quoteIdentifier(config.migrationsTable);

  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    const applied = await readAppliedMigrations(pool, config);

    for (const migration of schemaMigrations) {
      const existing = applied.get(migration.id);
      if (existing !== undefined) {
        if (existing.checksum !== migration.checksum) {
          throw new Error(`Checksum mismatch for migration ${migration.id}`);
        }
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock($1)", [config.advisoryLockKey]);
        await client.query(`SET LOCAL search_path TO ${schema}`);
        await client.query(migration.sql);
        await client.query(
          `
            INSERT INTO ${schema}.${migrationsTable}
              (id, phase, description, checksum, applied_at)
            VALUES ($1, $2, $3, $4, now())
            ON CONFLICT (id) DO NOTHING
          `,
          [migration.id, migration.phase, migration.description, migration.checksum]
        );
        await client.query("COMMIT");
        applied.set(migration.id, {
          id: migration.id,
          checksum: migration.checksum,
          applied_at: new Date().toISOString()
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  } catch (error) {
    throw sanitizeDatabaseError(error, "PostgreSQL migration failed", config);
  }
}

async function readAppliedMigrations(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): Promise<Map<string, MigrationRow>> {
  if (!(await hasMigrationsTable(queryable, config))) {
    return new Map();
  }

  const result = await queryable.query<MigrationRow>(
    `
      SELECT id, checksum, applied_at
      FROM ${table(config, config.migrationsTable)}
      ORDER BY id ASC
    `
  );
  return new Map(result.rows.map((row) => [row.id, row]));
}

async function hasMigrationsTable(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): Promise<boolean> {
  const result = await queryable.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2
      ) AS exists
    `,
    [config.schema, config.migrationsTable]
  );
  return result.rows[0]?.exists === true;
}

async function readHealth(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): Promise<Awaited<ReturnType<TestHistoryPersistence["health"]>>> {
  try {
    const [{ rows: writeRows }, migrated, applied] = await Promise.all([
      queryable.query<{ writable: boolean }>("SELECT NOT pg_is_in_recovery() AS writable"),
      hasMigrationsTable(queryable, config),
      readLatestMigration(queryable, config)
    ]);

    return {
      driver: "postgres",
      writable: writeRows[0]?.writable === true,
      migrated,
      ...(applied?.id !== undefined ? { migrationVersion: applied.id } : {})
    };
  } catch (error) {
    throw sanitizeDatabaseError(error, "PostgreSQL health check failed", config);
  }
}

async function readLatestMigration(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): Promise<MigrationRow | undefined> {
  if (!(await hasMigrationsTable(queryable, config))) {
    return undefined;
  }

  const result = await queryable.query<MigrationRow>(
    `
      SELECT id, checksum, applied_at
      FROM ${table(config, config.migrationsTable)}
      ORDER BY id DESC
      LIMIT 1
    `
  );
  return result.rows[0];
}
