import type {
  IntegrationDeliveryRepository,
  PersistentIntegrationDelivery
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

type IntegrationDeliveryRow = {
  id: string;
  project_id: string;
  integration_id: string;
  kind: PersistentIntegrationDelivery["kind"];
  event: string;
  status: PersistentIntegrationDelivery["status"];
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  next_attempt_at: Date | string;
  delivered_at: Date | string | null;
  response_status: number | null;
  external_reference: string | null;
  last_error: string | null;
  lease: NonNullable<PersistentIntegrationDelivery["lease"]> | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  version: number;
};

export function createIntegrationDeliveryRepository(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): IntegrationDeliveryRepository {
  return {
    async listByProject(projectId, query) {
      const params: unknown[] = [projectId];
      const filters = ["project_id = $1", "deleted_at IS NULL"];
      if (query?.status !== undefined) {
        params.push(query.status);
        filters.push(`status = $${params.length}`);
      }
      if (query?.kind !== undefined) {
        params.push(query.kind);
        filters.push(`kind = $${params.length}`);
      }
      appendPaginationParams(params, query);
      const result = await queryable.query<IntegrationDeliveryRow>(
        `${selectDelivery(config)} WHERE ${filters.join(" AND ")}
         ORDER BY created_at DESC, id ASC
         ${paginationSql(query, params.length - paginationParamCount(query))}`,
        params
      );
      return pageRows(result.rows.map(toPersistentIntegrationDelivery), query);
    },
    async findById(projectId, id) {
      const result = await queryable.query<IntegrationDeliveryRow>(
        `${selectDelivery(config)} WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [projectId, id]
      );
      return mapOptional(result.rows[0], toPersistentIntegrationDelivery);
    },
    async claimDispatchable(input) {
      const result = await queryable.query<IntegrationDeliveryRow>(
        `WITH candidates AS (
           SELECT id FROM ${table(config, "integration_deliveries")}
           WHERE deleted_at IS NULL
             AND next_attempt_at <= $1
             AND status IN ('pending', 'retrying', 'processing')
             AND (status <> 'processing' OR lease IS NULL OR lease->>'expiresAt' <= $1::text)
           ORDER BY next_attempt_at ASC, id ASC
           FOR UPDATE SKIP LOCKED
           LIMIT $2
         )
         UPDATE ${table(config, "integration_deliveries")} AS delivery
         SET status = 'processing', updated_at = $1,
             lease = jsonb_build_object('workerId', $3::text, 'token', $4::text, 'expiresAt', $5::text),
             version = delivery.version + 1
         FROM candidates
         WHERE delivery.id = candidates.id
         RETURNING ${returningColumns("delivery")}`,
        [input.claimedAt, input.limit, input.workerId, input.leaseToken, input.leaseExpiresAt]
      );
      return { items: result.rows.map(toPersistentIntegrationDelivery) };
    },
    async save(delivery) {
      await queryable.query(
        `INSERT INTO ${table(config, "integration_deliveries")} AS existing
          (id, project_id, integration_id, kind, event, status, payload, attempts,
           max_attempts, next_attempt_at, delivered_at, response_status,
           external_reference, last_error, lease, created_at, updated_at, deleted_at, version)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19)
         ON CONFLICT (id) DO UPDATE SET
           status=EXCLUDED.status, payload=EXCLUDED.payload, attempts=EXCLUDED.attempts,
           max_attempts=EXCLUDED.max_attempts, next_attempt_at=EXCLUDED.next_attempt_at,
           delivered_at=EXCLUDED.delivered_at, response_status=EXCLUDED.response_status,
           external_reference=EXCLUDED.external_reference, last_error=EXCLUDED.last_error,
           lease=EXCLUDED.lease, updated_at=EXCLUDED.updated_at,
           deleted_at=EXCLUDED.deleted_at, version=EXCLUDED.version
         WHERE existing.project_id = EXCLUDED.project_id
           AND existing.integration_id = EXCLUDED.integration_id`,
        [
          delivery.id,
          delivery.projectId,
          delivery.integrationId,
          delivery.kind,
          delivery.event,
          delivery.status,
          stringifyJson(delivery.payload),
          delivery.attempts,
          delivery.maxAttempts,
          delivery.nextAttemptAt,
          delivery.deliveredAt ?? null,
          delivery.responseStatus ?? null,
          delivery.externalReference ?? null,
          delivery.lastError ?? null,
          delivery.lease === undefined ? null : stringifyJson(delivery.lease),
          delivery.createdAt,
          delivery.updatedAt,
          delivery.deletedAt ?? null,
          delivery.version
        ]
      );
    }
  };
}

function selectDelivery(config: PostgresPersistenceConfig): string {
  return `SELECT ${returningColumns()} FROM ${table(config, "integration_deliveries")}`;
}

function returningColumns(prefix?: string): string {
  const p = prefix === undefined ? "" : `${prefix}.`;
  return `${p}id, ${p}project_id, ${p}integration_id, ${p}kind, ${p}event,
    ${p}status, ${p}payload, ${p}attempts, ${p}max_attempts, ${p}next_attempt_at,
    ${p}delivered_at, ${p}response_status, ${p}external_reference, ${p}last_error,
    ${p}lease, ${p}created_at, ${p}updated_at, ${p}deleted_at, ${p}version`;
}

function toPersistentIntegrationDelivery(
  row: IntegrationDeliveryRow
): PersistentIntegrationDelivery {
  return {
    id: row.id,
    projectId: row.project_id,
    integrationId: row.integration_id,
    kind: row.kind,
    event: row.event,
    status: row.status,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    nextAttemptAt: toIso(row.next_attempt_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: row.version,
    ...(row.delivered_at !== null ? { deliveredAt: toIso(row.delivered_at) } : {}),
    ...(row.response_status !== null ? { responseStatus: row.response_status } : {}),
    ...(row.external_reference !== null ? { externalReference: row.external_reference } : {}),
    ...(row.last_error !== null ? { lastError: row.last_error } : {}),
    ...(row.lease !== null ? { lease: row.lease } : {}),
    ...(row.deleted_at !== null ? { deletedAt: toIso(row.deleted_at) } : {})
  };
}
