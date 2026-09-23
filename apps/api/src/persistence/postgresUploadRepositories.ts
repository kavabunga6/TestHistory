import type {
  PersistentUploadJob,
  UploadJobRepository,
  UploadSessionRepository
} from "@testhistory/domain";
import type { PostgresPersistenceConfig, PostgresQueryable } from "./postgres.js";
import type { UploadJobRow, UploadSessionRow } from "./postgresRows.js";
import {
  appendPaginationParams,
  hydrateUploadSessions,
  mapOptional,
  pageRows,
  paginationParamCount,
  paginationSql,
  stringifyJson,
  table,
  toPersistentUploadJob,
  uploadSessionFileId
} from "./postgresRepositoryHelpers.js";

export function createUploadJobRepository(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): UploadJobRepository {
  return {
    async listByLaunch(launchId, query) {
      const params: unknown[] = [launchId];
      appendPaginationParams(params, query);
      const result = await queryable.query<UploadJobRow>(
        `
          SELECT
            id, launch_id, status, received_files, imported_results, duplicate_results,
            stored_artifacts, errors, results, lease, source, created_at, updated_at, deleted_at, version
          FROM ${table(config, "upload_jobs")}
          WHERE launch_id = $1 AND deleted_at IS NULL
          ORDER BY created_at DESC, id ASC
          ${paginationSql(query, params.length - paginationParamCount(query))}
        `,
        params
      );
      return pageRows(result.rows.map(toPersistentUploadJob), query);
    },
    async findById(id) {
      const result = await queryable.query<UploadJobRow>(
        `
          SELECT
            id, launch_id, status, received_files, imported_results, duplicate_results,
            stored_artifacts, errors, results, lease, source, created_at, updated_at, deleted_at, version
          FROM ${table(config, "upload_jobs")}
          WHERE id = $1 AND deleted_at IS NULL
        `,
        [id]
      );
      return mapOptional(result.rows[0], toPersistentUploadJob);
    },
    async claimQueued(input) {
      const lease = {
        claimedBy: input.workerId,
        claimedAt: input.claimedAt,
        expiresAt: input.leaseExpiresAt,
        claimToken: input.claimToken
      } satisfies NonNullable<PersistentUploadJob["lease"]>;
      const result = await queryable.query<UploadJobRow>(
        `
          WITH claimable AS (
            SELECT id
            FROM ${table(config, "upload_jobs")}
            WHERE deleted_at IS NULL
              AND source->>'mode' = $1
              AND (
                status = 'queued'
                OR (
                  status = 'processing'
                  AND lease IS NOT NULL
                  AND lease->>'expiresAt' <= $2
                )
              )
            ORDER BY created_at ASC, id ASC
            LIMIT $3
            FOR UPDATE SKIP LOCKED
          )
          UPDATE ${table(config, "upload_jobs")} upload_jobs
          SET
            status = 'processing',
            lease = $4::jsonb,
            updated_at = $5,
            version = upload_jobs.version + 1
          FROM claimable
          WHERE upload_jobs.id = claimable.id
          RETURNING
            upload_jobs.id,
            upload_jobs.launch_id,
            upload_jobs.status,
            upload_jobs.received_files,
            upload_jobs.imported_results,
            upload_jobs.duplicate_results,
            upload_jobs.stored_artifacts,
            upload_jobs.errors,
            upload_jobs.results,
            upload_jobs.lease,
            upload_jobs.source,
            upload_jobs.created_at,
            upload_jobs.updated_at,
            upload_jobs.deleted_at,
            upload_jobs.version
        `,
        [input.source, input.claimedAt, input.limit, stringifyJson(lease), input.claimedAt]
      );
      return {
        items: result.rows.map(toPersistentUploadJob)
      };
    },
    async save(job) {
      await queryable.query(
        `
          INSERT INTO ${table(config, "upload_jobs")}
            (
              id, launch_id, status, received_files, imported_results, duplicate_results,
              stored_artifacts, errors, results, lease, source, created_at, updated_at, deleted_at, version
            )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, $14, $15)
          ON CONFLICT (id) DO UPDATE SET
            launch_id = EXCLUDED.launch_id,
            status = EXCLUDED.status,
            received_files = EXCLUDED.received_files,
            imported_results = EXCLUDED.imported_results,
            duplicate_results = EXCLUDED.duplicate_results,
            stored_artifacts = EXCLUDED.stored_artifacts,
            errors = EXCLUDED.errors,
            results = EXCLUDED.results,
            lease = EXCLUDED.lease,
            source = EXCLUDED.source,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at,
            version = EXCLUDED.version
        `,
        [
          job.id,
          job.launchId,
          job.status,
          job.receivedFiles,
          job.importedResults,
          job.duplicateResults,
          job.storedArtifacts,
          stringifyJson(job.errors),
          stringifyJson(job.results ?? []),
          stringifyJson(job.lease ?? null),
          stringifyJson(job.source ?? null),
          job.createdAt,
          job.updatedAt,
          job.deletedAt ?? null,
          job.version
        ]
      );
    }
  };
}

export function createUploadSessionRepository(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): UploadSessionRepository {
  return {
    async listByLaunch(launchId, query) {
      const params: unknown[] = [launchId];
      const filters = ["launch_id = $1", "deleted_at IS NULL"];
      if (query?.status !== undefined) {
        params.push(query.status);
        filters.push(`status = $${params.length}`);
      }
      appendPaginationParams(params, query);

      const result = await queryable.query<UploadSessionRow>(
        `
          SELECT
            id, launch_id, path, status, total_chunks, received_chunks, total_bytes,
            received_bytes, expires_at, closed_at, cleanup, completed_job_id,
            created_at, updated_at, deleted_at, version
          FROM ${table(config, "upload_sessions")}
          WHERE ${filters.join(" AND ")}
          ORDER BY created_at DESC, id ASC
          ${paginationSql(query, params.length - paginationParamCount(query))}
        `,
        params
      );
      const sessions = await hydrateUploadSessions(queryable, config, result.rows);
      return pageRows(sessions, query);
    },
    async findById(id) {
      const result = await queryable.query<UploadSessionRow>(
        `
          SELECT
            id, launch_id, path, status, total_chunks, received_chunks, total_bytes,
            received_bytes, expires_at, closed_at, cleanup, completed_job_id,
            created_at, updated_at, deleted_at, version
          FROM ${table(config, "upload_sessions")}
          WHERE id = $1 AND deleted_at IS NULL
        `,
        [id]
      );
      const sessions = await hydrateUploadSessions(queryable, config, result.rows);
      return sessions[0];
    },
    async save(session) {
      await queryable.query(
        `
          INSERT INTO ${table(config, "upload_sessions")}
            (
              id, launch_id, path, status, total_chunks, received_chunks, total_bytes,
              received_bytes, expires_at, closed_at, cleanup, completed_job_id,
              created_at, updated_at, deleted_at, version
            )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11::jsonb, $12,
            $13, $14, $15, $16
          )
          ON CONFLICT (id) DO UPDATE SET
            launch_id = EXCLUDED.launch_id,
            path = EXCLUDED.path,
            status = EXCLUDED.status,
            total_chunks = EXCLUDED.total_chunks,
            received_chunks = EXCLUDED.received_chunks,
            total_bytes = EXCLUDED.total_bytes,
            received_bytes = EXCLUDED.received_bytes,
            expires_at = EXCLUDED.expires_at,
            closed_at = EXCLUDED.closed_at,
            cleanup = EXCLUDED.cleanup,
            completed_job_id = EXCLUDED.completed_job_id,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at,
            version = EXCLUDED.version
        `,
        [
          session.id,
          session.launchId,
          session.path,
          session.status,
          session.totalChunks,
          session.receivedChunks,
          session.totalBytes ?? null,
          session.receivedBytes,
          session.expiresAt,
          session.closedAt ?? null,
          stringifyJson(session.cleanup),
          session.completedJobId ?? null,
          session.createdAt,
          session.updatedAt,
          session.deletedAt ?? null,
          session.version
        ]
      );

      const filePaths = session.files.map((file) => file.path);
      await queryable.query(
        `
          DELETE FROM ${table(config, "upload_session_files")}
          WHERE upload_session_id = $1 AND NOT (path = ANY($2::text[]))
        `,
        [session.id, filePaths]
      );

      for (const file of session.files) {
        const fileId = uploadSessionFileId(session.id, file.path);
        await queryable.query(
          `
            INSERT INTO ${table(config, "upload_session_files")}
              (
                id, upload_session_id, path, total_chunks, received_chunks,
                total_bytes, received_bytes, created_at, updated_at
              )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (upload_session_id, path) DO UPDATE SET
              total_chunks = EXCLUDED.total_chunks,
              received_chunks = EXCLUDED.received_chunks,
              total_bytes = EXCLUDED.total_bytes,
              received_bytes = EXCLUDED.received_bytes,
              updated_at = EXCLUDED.updated_at
          `,
          [
            fileId,
            session.id,
            file.path,
            file.totalChunks,
            file.receivedChunks,
            file.totalBytes ?? null,
            file.receivedBytes,
            session.createdAt,
            session.updatedAt
          ]
        );

        const chunkIndexes = file.chunks.map((chunk) => chunk.index);
        await queryable.query(
          `
            DELETE FROM ${table(config, "upload_session_chunks")}
            WHERE upload_session_file_id = $1 AND NOT (chunk_index = ANY($2::int[]))
          `,
          [fileId, chunkIndexes]
        );

        for (const chunk of file.chunks) {
          await queryable.query(
            `
              INSERT INTO ${table(config, "upload_session_chunks")}
                (
                  upload_session_file_id, chunk_index, bytes, sha256, object_key, received_at
                )
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (upload_session_file_id, chunk_index) DO UPDATE SET
                bytes = EXCLUDED.bytes,
                sha256 = EXCLUDED.sha256,
                object_key = EXCLUDED.object_key,
                received_at = EXCLUDED.received_at
            `,
            [
              fileId,
              chunk.index,
              chunk.bytes,
              chunk.sha256 ?? null,
              chunk.objectKey ?? null,
              chunk.receivedAt
            ]
          );
        }
      }
    }
  };
}
