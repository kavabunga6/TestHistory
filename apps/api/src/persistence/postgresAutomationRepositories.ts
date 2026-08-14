import type {
  AutomationJobRepository,
  PersistentAutomationJob,
  PersistentTestPlan,
  TestPlanRepository
} from "@testhistory/domain";
import type { PostgresPersistenceConfig, PostgresQueryable } from "./postgres.js";
import {
  appendPaginationParams,
  mapOptional,
  pageRows,
  paginationParamCount,
  paginationSql,
  stringifyJson,
  table,
  toIso
} from "./postgresRepositoryHelpers.js";

type TestPlanRow = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  status: PersistentTestPlan["status"];
  selector: PersistentTestPlan["selector"];
  launch_name_template: string | null;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  version: number;
};

type AutomationJobRow = {
  id: string;
  project_id: string;
  name: string;
  status: PersistentAutomationJob["status"];
  trigger: PersistentAutomationJob["trigger"];
  test_plan_id: string | null;
  launch_id: string | null;
  branch: string | null;
  commit_sha: string | null;
  external_ref: NonNullable<PersistentAutomationJob["external"]> | null;
  requested_by: string;
  error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  started_at: Date | string | null;
  finished_at: Date | string | null;
  deleted_at: Date | string | null;
  version: number;
};

export function createTestPlanRepository(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): TestPlanRepository {
  return {
    async listByProject(projectId, query) {
      const params: unknown[] = [projectId];
      const filters = ["project_id = $1", "deleted_at IS NULL"];
      if (query?.status !== undefined) {
        params.push(query.status);
        filters.push(`status = $${params.length}`);
      }
      appendPaginationParams(params, query);
      const result = await queryable.query<TestPlanRow>(
        `${testPlanSelect(config)} WHERE ${filters.join(" AND ")}
         ORDER BY updated_at DESC, id ASC
         ${paginationSql(query, params.length - paginationParamCount(query))}`,
        params
      );
      return pageRows(result.rows.map(toPersistentTestPlan), query);
    },
    async findById(projectId, id) {
      const result = await queryable.query<TestPlanRow>(
        `${testPlanSelect(config)} WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [projectId, id]
      );
      return mapOptional(result.rows[0], toPersistentTestPlan);
    },
    async save(plan) {
      await queryable.query(
        `INSERT INTO ${table(config, "test_plans")} AS existing
          (id, project_id, name, description, status, selector, launch_name_template,
           created_by, created_at, updated_at, deleted_at, version)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET
           name=EXCLUDED.name, description=EXCLUDED.description, status=EXCLUDED.status,
           selector=EXCLUDED.selector, launch_name_template=EXCLUDED.launch_name_template,
           updated_at=EXCLUDED.updated_at, deleted_at=EXCLUDED.deleted_at,
           version=EXCLUDED.version
         WHERE existing.project_id = EXCLUDED.project_id`,
        [
          plan.id,
          plan.projectId,
          plan.name,
          plan.description ?? null,
          plan.status,
          stringifyJson(plan.selector),
          plan.launchNameTemplate ?? null,
          plan.createdBy,
          plan.createdAt,
          plan.updatedAt,
          plan.deletedAt ?? null,
          plan.version
        ]
      );
    }
  };
}

export function createAutomationJobRepository(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): AutomationJobRepository {
  return {
    async listByProject(projectId, query) {
      const params: unknown[] = [projectId];
      const filters = ["project_id = $1", "deleted_at IS NULL"];
      if (query?.status !== undefined) {
        params.push(query.status);
        filters.push(`status = $${params.length}`);
      }
      if (query?.testPlanId !== undefined) {
        params.push(query.testPlanId);
        filters.push(`test_plan_id = $${params.length}`);
      }
      appendPaginationParams(params, query);
      const result = await queryable.query<AutomationJobRow>(
        `${automationJobSelect(config)} WHERE ${filters.join(" AND ")}
         ORDER BY created_at DESC, id ASC
         ${paginationSql(query, params.length - paginationParamCount(query))}`,
        params
      );
      return pageRows(result.rows.map(toPersistentAutomationJob), query);
    },
    async findById(projectId, id) {
      const result = await queryable.query<AutomationJobRow>(
        `${automationJobSelect(config)} WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [projectId, id]
      );
      return mapOptional(result.rows[0], toPersistentAutomationJob);
    },
    async save(job) {
      await queryable.query(
        `INSERT INTO ${table(config, "automation_jobs")} AS existing
          (id, project_id, name, status, trigger, test_plan_id, launch_id, branch,
           commit_sha, external_ref, requested_by, error, created_at, updated_at,
           started_at, finished_at, deleted_at, version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (id) DO UPDATE SET
           name=EXCLUDED.name, status=EXCLUDED.status, trigger=EXCLUDED.trigger,
           test_plan_id=EXCLUDED.test_plan_id, launch_id=EXCLUDED.launch_id,
           branch=EXCLUDED.branch, commit_sha=EXCLUDED.commit_sha,
           external_ref=EXCLUDED.external_ref, error=EXCLUDED.error,
           updated_at=EXCLUDED.updated_at, started_at=EXCLUDED.started_at,
           finished_at=EXCLUDED.finished_at, deleted_at=EXCLUDED.deleted_at,
           version=EXCLUDED.version
         WHERE existing.project_id = EXCLUDED.project_id`,
        [
          job.id,
          job.projectId,
          job.name,
          job.status,
          job.trigger,
          job.testPlanId ?? null,
          job.launchId ?? null,
          job.branch ?? null,
          job.commitSha ?? null,
          job.external === undefined ? null : stringifyJson(job.external),
          job.requestedBy,
          job.error ?? null,
          job.createdAt,
          job.updatedAt,
          job.startedAt ?? null,
          job.finishedAt ?? null,
          job.deletedAt ?? null,
          job.version
        ]
      );
    }
  };
}

function testPlanSelect(config: PostgresPersistenceConfig): string {
  return `SELECT id, project_id, name, description, status, selector,
    launch_name_template, created_by, created_at, updated_at, deleted_at, version
    FROM ${table(config, "test_plans")}`;
}

function automationJobSelect(config: PostgresPersistenceConfig): string {
  return `SELECT id, project_id, name, status, trigger, test_plan_id, launch_id,
    branch, commit_sha, external_ref, requested_by, error, created_at, updated_at,
    started_at, finished_at, deleted_at, version
    FROM ${table(config, "automation_jobs")}`;
}

function toPersistentTestPlan(row: TestPlanRow): PersistentTestPlan {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    status: row.status,
    selector: row.selector,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: row.version,
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.launch_name_template !== null ? { launchNameTemplate: row.launch_name_template } : {}),
    ...(row.deleted_at !== null ? { deletedAt: toIso(row.deleted_at) } : {})
  };
}

function toPersistentAutomationJob(row: AutomationJobRow): PersistentAutomationJob {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    status: row.status,
    trigger: row.trigger,
    requestedBy: row.requested_by,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: row.version,
    ...(row.test_plan_id !== null ? { testPlanId: row.test_plan_id } : {}),
    ...(row.launch_id !== null ? { launchId: row.launch_id } : {}),
    ...(row.branch !== null ? { branch: row.branch } : {}),
    ...(row.commit_sha !== null ? { commitSha: row.commit_sha } : {}),
    ...(row.external_ref !== null ? { external: row.external_ref } : {}),
    ...(row.error !== null ? { error: row.error } : {}),
    ...(row.started_at !== null ? { startedAt: toIso(row.started_at) } : {}),
    ...(row.finished_at !== null ? { finishedAt: toIso(row.finished_at) } : {}),
    ...(row.deleted_at !== null ? { deletedAt: toIso(row.deleted_at) } : {})
  };
}
