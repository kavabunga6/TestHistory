import type {
  LaunchRepository,
  LaunchResultRepository,
  ProjectRepository
} from "@testhistory/domain";
import type { PostgresPersistenceConfig, PostgresQueryable } from "./postgres.js";
import type { LaunchResultRow, LaunchRow, ProjectRow } from "./postgresRows.js";
import {
  appendPaginationParams,
  launchSelect,
  mapOptional,
  normalizeUuid,
  pageRows,
  paginationParamCount,
  paginationParams,
  paginationSql,
  stringifyJson,
  table,
  toPersistentLaunch,
  toPersistentLaunchResult,
  toPersistentProject
} from "./postgresRepositoryHelpers.js";

export function createProjectRepository(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): ProjectRepository {
  return {
    async list(query) {
      const result = await queryable.query<ProjectRow>(
        `
          SELECT id, key, name, artifact_retention, access_settings, created_at, updated_at, archived_at, deleted_at, version
          FROM ${table(config, "projects")}
          WHERE deleted_at IS NULL
          ORDER BY created_at ASC, id ASC
          ${paginationSql(query)}
        `,
        paginationParams(query)
      );
      return pageRows(result.rows.map(toPersistentProject), query);
    },
    async findById(id) {
      const result = await queryable.query<ProjectRow>(
        `
          SELECT id, key, name, artifact_retention, access_settings, created_at, updated_at, archived_at, deleted_at, version
          FROM ${table(config, "projects")}
          WHERE id = $1 AND deleted_at IS NULL
        `,
        [id]
      );
      return mapOptional(result.rows[0], toPersistentProject);
    },
    async findByKey(key) {
      const result = await queryable.query<ProjectRow>(
        `
          SELECT id, key, name, artifact_retention, access_settings, created_at, updated_at, archived_at, deleted_at, version
          FROM ${table(config, "projects")}
          WHERE key = $1 AND deleted_at IS NULL
        `,
        [key]
      );
      return mapOptional(result.rows[0], toPersistentProject);
    },
    async save(project) {
      await queryable.query(
        `
          INSERT INTO ${table(config, "projects")}
            (id, key, name, artifact_retention, access_settings, created_at, updated_at, archived_at, deleted_at, version)
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
            key = EXCLUDED.key,
            name = EXCLUDED.name,
            artifact_retention = EXCLUDED.artifact_retention,
            access_settings = EXCLUDED.access_settings,
            updated_at = EXCLUDED.updated_at,
            archived_at = EXCLUDED.archived_at,
            deleted_at = EXCLUDED.deleted_at,
            version = EXCLUDED.version
        `,
        [
          project.id,
          project.key,
          project.name,
          stringifyJson(project.artifactRetention ?? null),
          stringifyJson(project.accessSettings ?? null),
          project.createdAt,
          project.updatedAt,
          project.archivedAt ?? null,
          project.deletedAt ?? null,
          project.version
        ]
      );
    }
  };
}

export function createLaunchRepository(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): LaunchRepository {
  return {
    async listByProject(projectId, query) {
      const params: unknown[] = [projectId];
      const filters = [`launches.project_id = $1`, "launches.deleted_at IS NULL"];
      if (query?.status !== undefined) {
        params.push(query.status);
        filters.push(`launches.status = $${params.length}`);
      }
      if (query?.branch !== undefined) {
        params.push(query.branch);
        filters.push(`launches.branch = $${params.length}`);
      }
      appendPaginationParams(params, query);

      const result = await queryable.query<LaunchRow>(
        `
          ${launchSelect(config)}
          WHERE ${filters.join(" AND ")}
          ORDER BY launches.created_at DESC, launches.id ASC
          ${paginationSql(query, params.length - paginationParamCount(query))}
        `,
        params
      );
      return pageRows(result.rows.map(toPersistentLaunch), query);
    },
    async findById(id) {
      const result = await queryable.query<LaunchRow>(
        `
          ${launchSelect(config)}
          WHERE launches.id = $1 AND launches.deleted_at IS NULL
        `,
        [id]
      );
      return mapOptional(result.rows[0], toPersistentLaunch);
    },
    async save(launch) {
      await queryable.query(
        `
          INSERT INTO ${table(config, "launches")}
            (
              id, project_id, name, status, branch, commit_sha, build_number, close_pipeline,
              created_at, updated_at, closed_at, archived_at, failed_at, deleted_at, version
            )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (id) DO UPDATE SET
            project_id = EXCLUDED.project_id,
            name = EXCLUDED.name,
            status = EXCLUDED.status,
            branch = EXCLUDED.branch,
            commit_sha = EXCLUDED.commit_sha,
            build_number = EXCLUDED.build_number,
            close_pipeline = EXCLUDED.close_pipeline,
            updated_at = EXCLUDED.updated_at,
            closed_at = EXCLUDED.closed_at,
            archived_at = EXCLUDED.archived_at,
            failed_at = EXCLUDED.failed_at,
            deleted_at = EXCLUDED.deleted_at,
            version = EXCLUDED.version
        `,
        [
          launch.id,
          launch.projectId,
          launch.name,
          launch.status,
          launch.branch ?? null,
          launch.commitSha ?? null,
          launch.buildNumber ?? null,
          stringifyJson(launch.closePipeline),
          launch.createdAt,
          launch.updatedAt,
          launch.closedAt ?? null,
          launch.archivedAt ?? null,
          launch.failedAt ?? null,
          launch.deletedAt ?? null,
          launch.version
        ]
      );
    },
    async deleteById(id) {
      await queryable.query(`DELETE FROM ${table(config, "launches")} WHERE id = $1`, [id]);
    }
  };
}

export function createLaunchResultRepository(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): LaunchResultRepository {
  return {
    async listByLaunch(launchId, query) {
      const params: unknown[] = [launchId];
      appendPaginationParams(params, query);
      const result = await queryable.query<LaunchResultRow>(
        `
          SELECT
            id, launch_id, project_id, result_uuid, history_id, test_case_id, full_name, name,
            status, duration_ms, labels, parameters, attachments, steps, raw, source,
            created_at, updated_at, deleted_at, version
          FROM ${table(config, "launch_results")}
          WHERE launch_id = $1 AND deleted_at IS NULL
          ORDER BY created_at ASC, id ASC
          ${paginationSql(query, params.length - paginationParamCount(query))}
        `,
        params
      );
      return pageRows(result.rows.map(toPersistentLaunchResult), query);
    },
    async findByLaunchAndUuid(launchId, resultUuid) {
      const result = await queryable.query<LaunchResultRow>(
        `
          SELECT
            id, launch_id, project_id, result_uuid, history_id, test_case_id, full_name, name,
            status, duration_ms, labels, parameters, attachments, steps, raw, source,
            created_at, updated_at, deleted_at, version
          FROM ${table(config, "launch_results")}
          WHERE launch_id = $1 AND result_uuid = $2 AND deleted_at IS NULL
        `,
        [launchId, resultUuid]
      );
      return mapOptional(result.rows[0], toPersistentLaunchResult);
    },
    async saveMany(results) {
      for (const result of results) {
        await queryable.query(
          `
            INSERT INTO ${table(config, "launch_results")}
              (
                id, launch_id, project_id, result_uuid, history_id, test_case_id, full_name, name,
                status, duration_ms, labels, parameters, attachments, steps, raw, source,
                created_at, updated_at, deleted_at, version
              )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8,
              $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb,
              $17, $18, $19, $20
            )
            ON CONFLICT (launch_id, result_uuid) DO UPDATE SET
              project_id = EXCLUDED.project_id,
              history_id = EXCLUDED.history_id,
              test_case_id = EXCLUDED.test_case_id,
              full_name = EXCLUDED.full_name,
              name = EXCLUDED.name,
              status = EXCLUDED.status,
              duration_ms = EXCLUDED.duration_ms,
              labels = EXCLUDED.labels,
              parameters = EXCLUDED.parameters,
              attachments = EXCLUDED.attachments,
              steps = EXCLUDED.steps,
              raw = EXCLUDED.raw,
              source = EXCLUDED.source,
              updated_at = EXCLUDED.updated_at,
              deleted_at = EXCLUDED.deleted_at,
              version = EXCLUDED.version
          `,
          [
            normalizeUuid(result.id, `${result.launchId}:${result.resultUuid}`),
            result.launchId,
            result.projectId,
            result.resultUuid,
            result.historyId ?? null,
            result.testCaseId ?? null,
            result.fullName ?? null,
            result.name,
            result.status,
            result.durationMs ?? null,
            stringifyJson(result.labels),
            stringifyJson(result.parameters),
            stringifyJson(result.attachments),
            stringifyJson(result.steps),
            stringifyJson(result.raw),
            stringifyJson(result.source),
            result.createdAt,
            result.updatedAt,
            result.deletedAt ?? null,
            result.version
          ]
        );
      }
    }
  };
}
