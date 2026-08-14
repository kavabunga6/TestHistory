import type {
  CleanupRuleRepository,
  DefectMuteAuditRepository,
  DefectDispositionRepository,
  IdentityCorrectionAuditRepository,
  SecurityAuditRepository
} from "@testhistory/domain";
import type { PostgresPersistenceConfig, PostgresQueryable } from "./postgres.js";
import type {
  CleanupRuleRow,
  DefectMuteAuditEventRow,
  DefectDispositionEventRow,
  IdentityCorrectionAuditEventRow,
  SecurityAuditEventRow
} from "./postgresRows.js";
import {
  appendPaginationParams,
  cleanupRuleScopeCondition,
  cleanupRuleSelect,
  mapOptional,
  pageRows,
  paginationParamCount,
  paginationSql,
  stringifyJson,
  table,
  toPersistentCleanupRule,
  toPersistentDefectMuteAuditEvent,
  toPersistentDefectDispositionEvent,
  toPersistentIdentityCorrectionAuditEvent,
  toPersistentSecurityAuditEvent
} from "./postgresRepositoryHelpers.js";

export function createSecurityAuditRepository(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): SecurityAuditRepository {
  const select = `
    SELECT
      id, project_id, event_type, payload, occurred_at,
      created_at, updated_at, deleted_at, version
    FROM ${table(config, "security_audit_events")}
  `;
  return {
    async listByProject(projectId, query) {
      const params: unknown[] = [projectId];
      const filters = ["project_id = $1", "deleted_at IS NULL"];
      if (query?.type !== undefined) {
        params.push(query.type);
        filters.push(`event_type = $${params.length}`);
      }
      appendPaginationParams(params, query);
      const result = await queryable.query<SecurityAuditEventRow>(
        `
          ${select}
          WHERE ${filters.join(" AND ")}
          ORDER BY occurred_at ASC, id ASC
          ${paginationSql(query, params.length - paginationParamCount(query))}
        `,
        params
      );
      return pageRows(result.rows.map(toPersistentSecurityAuditEvent), query);
    },
    async findById(id) {
      const result = await queryable.query<SecurityAuditEventRow>(
        `${select} WHERE id = $1 AND deleted_at IS NULL`,
        [id]
      );
      return mapOptional(result.rows[0], toPersistentSecurityAuditEvent);
    },
    async append(event) {
      const result = await queryable.query<{ id: string }>(
        `
          INSERT INTO ${table(config, "security_audit_events")} AS existing
            (
              id, project_id, event_type, payload, occurred_at,
              created_at, updated_at, deleted_at, version
            )
          VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET id = existing.id
          WHERE existing.payload = EXCLUDED.payload
          RETURNING id
        `,
        [
          event.id,
          event.projectId,
          event.type,
          stringifyJson(event),
          event.occurredAt,
          event.createdAt,
          event.updatedAt,
          event.deletedAt ?? null,
          event.version
        ]
      );
      if (result.rows[0]?.id !== event.id) {
        throw new Error(`Security audit event ${event.id} is append-only and cannot be replaced.`);
      }
    }
  };
}

export function createDefectDispositionRepository(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): DefectDispositionRepository {
  const select = `
    SELECT
      id, project_id, defect_id, action, payload, occurred_at,
      created_at, updated_at, deleted_at, version
    FROM ${table(config, "defect_disposition_events")}
  `;

  return {
    async listByProject(projectId, query) {
      const params: unknown[] = [projectId];
      const filters = ["project_id = $1", "deleted_at IS NULL"];
      if (query?.defectId !== undefined) {
        params.push(query.defectId);
        filters.push(`defect_id = $${params.length}`);
      }
      appendPaginationParams(params, query);
      const result = await queryable.query<DefectDispositionEventRow>(
        `
          ${select}
          WHERE ${filters.join(" AND ")}
          ORDER BY occurred_at ASC, id ASC
          ${paginationSql(query, params.length - paginationParamCount(query))}
        `,
        params
      );
      return pageRows(result.rows.map(toPersistentDefectDispositionEvent), query);
    },
    async findById(id) {
      const result = await queryable.query<DefectDispositionEventRow>(
        `${select} WHERE id = $1 AND deleted_at IS NULL`,
        [id]
      );
      return mapOptional(result.rows[0], toPersistentDefectDispositionEvent);
    },
    async append(event) {
      const result = await queryable.query<{ id: string }>(
        `
          INSERT INTO ${table(config, "defect_disposition_events")} AS existing
            (
              id, project_id, defect_id, action, payload, occurred_at,
              created_at, updated_at, deleted_at, version
            )
          VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET id = existing.id
          WHERE existing.payload = EXCLUDED.payload
          RETURNING id
        `,
        [
          event.id,
          event.projectId,
          event.defectId,
          event.action,
          stringifyJson(event),
          event.occurredAt,
          event.createdAt,
          event.updatedAt,
          event.deletedAt ?? null,
          event.version
        ]
      );
      if (result.rows[0]?.id !== event.id) {
        throw new Error(
          `Defect disposition event ${event.id} is append-only and cannot be replaced.`
        );
      }
    }
  };
}

export function createDefectMuteAuditRepository(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): DefectMuteAuditRepository {
  const select = `
    SELECT
      id, project_id, mute_id, event_type, payload, occurred_at,
      created_at, updated_at, deleted_at, version
    FROM ${table(config, "defect_mute_audit_events")}
  `;

  return {
    async listByProject(projectId, query) {
      const params: unknown[] = [projectId];
      const filters = ["project_id = $1", "deleted_at IS NULL"];
      if (query?.muteId !== undefined) {
        params.push(query.muteId);
        filters.push(`mute_id = $${params.length}`);
      }
      appendPaginationParams(params, query);
      const result = await queryable.query<DefectMuteAuditEventRow>(
        `
          ${select}
          WHERE ${filters.join(" AND ")}
          ORDER BY occurred_at ASC, id ASC
          ${paginationSql(query, params.length - paginationParamCount(query))}
        `,
        params
      );
      return pageRows(result.rows.map(toPersistentDefectMuteAuditEvent), query);
    },
    async findById(id) {
      const result = await queryable.query<DefectMuteAuditEventRow>(
        `${select} WHERE id = $1 AND deleted_at IS NULL`,
        [id]
      );
      return mapOptional(result.rows[0], toPersistentDefectMuteAuditEvent);
    },
    async append(event) {
      const result = await queryable.query<{ id: string }>(
        `
          INSERT INTO ${table(config, "defect_mute_audit_events")} AS existing
            (
              id, project_id, mute_id, event_type, payload, occurred_at,
              created_at, updated_at, deleted_at, version
            )
          VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET id = existing.id
          WHERE existing.payload = EXCLUDED.payload
          RETURNING id
        `,
        [
          event.id,
          event.projectId,
          event.muteId,
          event.type,
          stringifyJson(event),
          event.occurredAt,
          event.createdAt,
          event.updatedAt,
          event.deletedAt ?? null,
          event.version
        ]
      );
      if (result.rows[0]?.id !== event.id) {
        throw new Error(`Defect mute event ${event.id} is append-only and cannot be replaced.`);
      }
    }
  };
}

export function createIdentityCorrectionAuditRepository(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): IdentityCorrectionAuditRepository {
  return {
    async listByProject(projectId, query) {
      const params: unknown[] = [projectId];
      const filters = ["project_id = $1", "deleted_at IS NULL"];
      if (query?.kind !== undefined) {
        params.push(query.kind);
        filters.push(`kind = $${params.length}`);
      }
      if (query?.beforeId !== undefined) {
        params.push(query.beforeId);
        filters.push(`$${params.length} = ANY(before_ids)`);
      }
      if (query?.afterId !== undefined) {
        params.push(query.afterId);
        filters.push(`$${params.length} = ANY(after_ids)`);
      }
      if (query?.parameterVariantSignature !== undefined) {
        params.push(query.parameterVariantSignature);
        filters.push(`scope->>'parameterVariantSignature' = $${params.length}`);
      }
      appendPaginationParams(params, query);

      const result = await queryable.query<IdentityCorrectionAuditEventRow>(
        `
          SELECT
            id, dedupe_key, project_id, kind, source, confidence, origin, reason,
            before_ids, after_ids, scope, evidence, occurred_at,
            created_at, updated_at, deleted_at, version
          FROM ${table(config, "identity_correction_audit_events")}
          WHERE ${filters.join(" AND ")}
          ORDER BY occurred_at ASC, id ASC
          ${paginationSql(query, params.length - paginationParamCount(query))}
        `,
        params
      );
      return pageRows(result.rows.map(toPersistentIdentityCorrectionAuditEvent), query);
    },
    async findByDedupeKey(dedupeKey) {
      const result = await queryable.query<IdentityCorrectionAuditEventRow>(
        `
          SELECT
            id, dedupe_key, project_id, kind, source, confidence, origin, reason,
            before_ids, after_ids, scope, evidence, occurred_at,
            created_at, updated_at, deleted_at, version
          FROM ${table(config, "identity_correction_audit_events")}
          WHERE dedupe_key = $1 AND deleted_at IS NULL
        `,
        [dedupeKey]
      );
      return mapOptional(result.rows[0], toPersistentIdentityCorrectionAuditEvent);
    },
    async saveMany(events) {
      for (const event of events) {
        await queryable.query(
          `
            INSERT INTO ${table(config, "identity_correction_audit_events")}
              (
                id, dedupe_key, project_id, kind, source, confidence, origin, reason,
                before_ids, after_ids, scope, evidence, occurred_at,
                created_at, updated_at, deleted_at, version
              )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7::jsonb, $8,
              $9::text[], $10::text[], $11::jsonb, $12::jsonb, $13,
              $14, $15, $16, $17
            )
            ON CONFLICT (dedupe_key) DO NOTHING
          `,
          [
            event.id,
            event.dedupeKey,
            event.projectId,
            event.kind,
            event.source,
            event.confidence,
            stringifyJson(event.origin),
            event.reason,
            event.beforeIds,
            event.afterIds,
            stringifyJson(event.scope),
            stringifyJson(event.evidence),
            event.occurredAt,
            event.createdAt,
            event.updatedAt,
            event.deletedAt ?? null,
            event.version
          ]
        );
      }
    }
  };
}

export function createCleanupRuleRepository(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig
): CleanupRuleRepository {
  return {
    async listActive(query) {
      const params: unknown[] = [];
      const filters = ["enabled = true", "deleted_at IS NULL"];
      if (query?.target !== undefined) {
        params.push(query.target);
        filters.push(`target = $${params.length}`);
      }
      filters.push(cleanupRuleScopeCondition(params, query));
      const result = await queryable.query<CleanupRuleRow>(
        `
          ${cleanupRuleSelect(config)}
          WHERE ${filters.join(" AND ")}
          ORDER BY target ASC, id ASC
        `,
        params
      );
      return result.rows.map(toPersistentCleanupRule);
    },
    async findById(id, query) {
      const params: unknown[] = [id];
      const result = await queryable.query<CleanupRuleRow>(
        `
          ${cleanupRuleSelect(config)}
          WHERE id = $1 AND deleted_at IS NULL AND ${cleanupRuleScopeCondition(params, query)}
        `,
        params
      );
      return mapOptional(result.rows[0], toPersistentCleanupRule);
    },
    async save(rule) {
      await queryable.query(
        `
          INSERT INTO ${table(config, "cleanup_rules")} AS existing
            (
              id, target, scope, enabled, selector, action, grace_seconds,
              created_at, updated_at, deleted_at, version
            )
          VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO UPDATE SET
            target = EXCLUDED.target,
            scope = EXCLUDED.scope,
            enabled = EXCLUDED.enabled,
            selector = EXCLUDED.selector,
            action = EXCLUDED.action,
            grace_seconds = EXCLUDED.grace_seconds,
            updated_at = EXCLUDED.updated_at,
            deleted_at = EXCLUDED.deleted_at,
            version = EXCLUDED.version
          WHERE existing.scope = EXCLUDED.scope
        `,
        [
          rule.id,
          rule.target,
          stringifyJson(rule.scope),
          rule.enabled,
          stringifyJson(rule.selector),
          rule.action,
          rule.graceSeconds,
          rule.createdAt,
          rule.updatedAt,
          rule.deletedAt ?? null,
          rule.version
        ]
      );
    }
  };
}
