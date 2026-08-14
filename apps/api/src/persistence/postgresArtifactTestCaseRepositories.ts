import type {
  ArtifactRepository,
  TestCaseHistoryRepository,
  TestCaseRepository
} from "@testhistory/domain";
import { sanitizePersistentAttemptParameters } from "@testhistory/domain";
import type { PostgresPersistenceConfig, PostgresQueryable } from "./postgres.js";
import type { ArtifactRow, TestCaseHistoryVersionRow, TestCaseRow } from "./postgresRows.js";
import {
  appendPaginationParams,
  artifactSelect,
  mapOptional,
  pageRows,
  paginationParamCount,
  paginationSql,
  stringifyJson,
  table,
  testCaseSelect,
  toPersistentArtifact,
  toPersistentTestCase,
  toPersistentTestCaseHistoryVersion
} from "./postgresRepositoryHelpers.js";

export function createArtifactRepository(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): ArtifactRepository {
  return {
    async list(query) {
      const params: unknown[] = [];
      const filters = ["deleted_at IS NULL"];
      if (query?.launchId !== undefined) {
        params.push(query.launchId);
        filters.push(`launch_id = $${params.length}`);
      }
      if (query?.projectId !== undefined) {
        params.push(query.projectId);
        filters.push(`project_id = $${params.length}`);
      }
      if (query?.kind !== undefined) {
        params.push(query.kind);
        filters.push(`kind = $${params.length}`);
      }
      appendPaginationParams(params, query);

      const result = await queryable.query<ArtifactRow>(
        `
          ${artifactSelect(config)}
          WHERE ${filters.join(" AND ")}
          ORDER BY created_at DESC, id ASC
          ${paginationSql(query, params.length - paginationParamCount(query))}
        `,
        params
      );
      return pageRows(result.rows.map(toPersistentArtifact), query);
    },
    async findById(id) {
      const result = await queryable.query<ArtifactRow>(
        `
          ${artifactSelect(config)}
          WHERE id = $1 AND deleted_at IS NULL
        `,
        [id]
      );
      return mapOptional(result.rows[0], toPersistentArtifact);
    },
    async save(artifact) {
      await this.saveMany([artifact]);
    },
    async saveMany(artifactRecords) {
      for (const artifact of artifactRecords) {
        await queryable.query(
          `
            INSERT INTO ${table(config, "artifacts")}
              (
                id, launch_id, project_id, path, kind, content_type, original_bytes,
                stored_bytes, sha256, compression, storage_key, storage, expires_at,
                retention, cleanup, upload, created_at, updated_at, deleted_at, version
              )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7,
              $8, $9, $10, $11, $12::jsonb, $13,
              $14::jsonb, $15::jsonb, $16::jsonb, $17, $18, $19, $20
            )
            ON CONFLICT (id) DO UPDATE SET
              launch_id = EXCLUDED.launch_id,
              project_id = EXCLUDED.project_id,
              path = EXCLUDED.path,
              kind = EXCLUDED.kind,
              content_type = EXCLUDED.content_type,
              original_bytes = EXCLUDED.original_bytes,
              stored_bytes = EXCLUDED.stored_bytes,
              sha256 = EXCLUDED.sha256,
              compression = EXCLUDED.compression,
              storage_key = EXCLUDED.storage_key,
              storage = EXCLUDED.storage,
              expires_at = EXCLUDED.expires_at,
              retention = EXCLUDED.retention,
              cleanup = EXCLUDED.cleanup,
              upload = EXCLUDED.upload,
              updated_at = EXCLUDED.updated_at,
              deleted_at = EXCLUDED.deleted_at,
              version = EXCLUDED.version
          `,
          [
            artifact.id,
            artifact.launchId,
            artifact.projectId ?? null,
            artifact.path,
            artifact.kind,
            artifact.contentType ?? null,
            artifact.originalBytes,
            artifact.storedBytes,
            artifact.sha256,
            artifact.compression,
            artifact.storageKey,
            stringifyJson(artifact.storage),
            artifact.expiresAt,
            stringifyJson(artifact.retention),
            stringifyJson(artifact.cleanup),
            stringifyJson(artifact.upload),
            artifact.createdAt,
            artifact.updatedAt,
            artifact.deletedAt ?? null,
            artifact.version
          ]
        );
      }
    },
    async deleteById(id) {
      await queryable.query(`DELETE FROM ${table(config, "artifacts")} WHERE id = $1`, [id]);
    }
  };
}

export function createTestCaseRepository(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): TestCaseRepository {
  return {
    async listByProject(projectId, query) {
      const params: unknown[] = [projectId];
      appendPaginationParams(params, query);
      const result = await queryable.query<TestCaseRow>(
        `
          ${testCaseSelect(config)}
          WHERE project_id = $1 AND deleted_at IS NULL
          ORDER BY name ASC, id ASC
          ${paginationSql(query, params.length - paginationParamCount(query))}
        `,
        params
      );
      return pageRows(result.rows.map(toPersistentTestCase), query);
    },
    async findById(projectId, id) {
      const result = await queryable.query<TestCaseRow>(
        `
          ${testCaseSelect(config)}
          WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL
        `,
        [projectId, id]
      );
      return mapOptional(result.rows[0], toPersistentTestCase);
    },
    async save(testCase) {
      await queryable.query(
        `
          INSERT INTO ${table(config, "test_cases")} AS existing
            (
              id, project_id, allure_id, name, full_name, workflow_status, tags, layer,
              description, custom_fields, members, links, issues, test_keys, relations,
              scenario, expected_result, created_at, updated_at, deleted_at, version
            )
          VALUES (
              $1, $2, $3, $4, $5, $6, $7::text[], $8,
              $9, $10::jsonb, $11::text[], $12::jsonb, $13::text[], $14::text[], $15::text[],
              $16, $17, $18, $19, $20, $21
          )
          ON CONFLICT (id) DO UPDATE SET
            project_id = EXCLUDED.project_id,
            allure_id = EXCLUDED.allure_id,
            name = EXCLUDED.name,
            full_name = EXCLUDED.full_name,
            workflow_status = EXCLUDED.workflow_status,
            tags = EXCLUDED.tags,
            layer = EXCLUDED.layer,
            description = EXCLUDED.description,
            custom_fields = EXCLUDED.custom_fields,
            members = EXCLUDED.members,
            links = EXCLUDED.links,
            issues = EXCLUDED.issues,
            test_keys = EXCLUDED.test_keys,
            relations = EXCLUDED.relations,
            scenario = EXCLUDED.scenario,
            expected_result = EXCLUDED.expected_result,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at,
            version = EXCLUDED.version
          WHERE existing.project_id = EXCLUDED.project_id
        `,
        [
          testCase.id,
          testCase.projectId,
          testCase.allureId ?? null,
          testCase.name,
          testCase.fullName ?? null,
          testCase.workflowStatus,
          testCase.tags,
          testCase.layer ?? null,
          testCase.description ?? null,
          stringifyJson(testCase.customFields),
          testCase.members,
          stringifyJson(testCase.links),
          testCase.issues,
          testCase.testKeys,
          testCase.relations,
          testCase.scenario ?? null,
          testCase.expectedResult ?? null,
          testCase.createdAt,
          testCase.updatedAt,
          testCase.deletedAt ?? null,
          testCase.version
        ]
      );
    }
  };
}

export function createTestCaseHistoryRepository(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): TestCaseHistoryRepository {
  return {
    async listByTestCase(testCaseId, query) {
      const params: unknown[] = [testCaseId];
      appendPaginationParams(params, query);
      const result = await queryable.query<TestCaseHistoryVersionRow>(
        `
          SELECT
            id, test_case_id, project_id, launch_id, result_uuid, status, seen_at, history_id,
            attempt_index, attempt_number, attempt_key, parameter_variant_signature, parameters,
            retry, flaky, started_at_millis, stopped_at_millis, status_details,
            created_at, updated_at, deleted_at, version
          FROM ${table(config, "test_case_history_versions")}
          WHERE test_case_id = $1 AND deleted_at IS NULL
          ORDER BY seen_at ASC, attempt_index ASC, id ASC
          ${paginationSql(query, params.length - paginationParamCount(query))}
        `,
        params
      );
      return pageRows(result.rows.map(toPersistentTestCaseHistoryVersion), query);
    },
    async saveMany(history) {
      for (const item of history) {
        await queryable.query(
          `
            INSERT INTO ${table(config, "test_case_history_versions")}
              (
                id, test_case_id, project_id, launch_id, result_uuid, status, seen_at, history_id,
                attempt_index, attempt_number, attempt_key, parameter_variant_signature, parameters,
                retry, flaky, started_at_millis, stopped_at_millis, status_details,
                created_at, updated_at, deleted_at, version
              )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8,
              $9, $10, $11, $12, $13::jsonb,
              $14, $15, $16, $17, $18::jsonb,
              $19, $20, $21, $22
            )
            ON CONFLICT (test_case_id, launch_id, result_uuid, attempt_index) DO UPDATE SET
              project_id = EXCLUDED.project_id,
              status = EXCLUDED.status,
              seen_at = EXCLUDED.seen_at,
              history_id = EXCLUDED.history_id,
              attempt_number = EXCLUDED.attempt_number,
              attempt_key = EXCLUDED.attempt_key,
              parameter_variant_signature = EXCLUDED.parameter_variant_signature,
              parameters = EXCLUDED.parameters,
              retry = EXCLUDED.retry,
              flaky = EXCLUDED.flaky,
              started_at_millis = EXCLUDED.started_at_millis,
              stopped_at_millis = EXCLUDED.stopped_at_millis,
              status_details = EXCLUDED.status_details,
              updated_at = EXCLUDED.updated_at,
              deleted_at = EXCLUDED.deleted_at,
              version = EXCLUDED.version
          `,
          [
            item.id,
            item.testCaseId,
            item.projectId,
            item.launchId,
            item.resultUuid,
            item.status,
            item.seenAt,
            item.historyId ?? null,
            item.attemptIndex ?? 0,
            item.attemptNumber ?? (item.attemptIndex ?? 0) + 1,
            item.attemptKey ?? null,
            item.parameterVariantSignature ?? null,
            stringifyJson(sanitizePersistentAttemptParameters(item.parameters)),
            item.retry ?? false,
            item.flaky ?? false,
            item.startedAt ?? null,
            item.stoppedAt ?? null,
            stringifyJson(item.statusDetails),
            item.createdAt,
            item.updatedAt,
            item.deletedAt ?? null,
            item.version
          ]
        );
      }
    }
  };
}
