import { describe, expect, it } from "vitest";
import { schemaMigrations } from "./index.js";
import { normalizeSql } from "./postgresTestUtils.js";

describe("PostgreSQL migration boundary", () => {
  it("keeps ingestion index migrations append-only and targeted for high-volume lookups", () => {
    const ingestionMigration = schemaMigrations.find(
      (migration) => migration.id === "202605300003_ingestion_indexes"
    );

    expect(normalizeSql(ingestionMigration?.sql ?? "")).toMatchInlineSnapshot(`
      "CREATE INDEX IF NOT EXISTS launch_results_launch_result_uuid_idx ON launch_results(launch_id, result_uuid) WHERE deleted_at IS NULL; CREATE INDEX IF NOT EXISTS launch_results_launch_history_idx ON launch_results(launch_id, history_id) WHERE history_id IS NOT NULL AND deleted_at IS NULL; CREATE INDEX IF NOT EXISTS launch_results_launch_test_case_idx ON launch_results(launch_id, test_case_id) WHERE test_case_id IS NOT NULL AND deleted_at IS NULL; CREATE INDEX IF NOT EXISTS launch_results_project_history_created_idx ON launch_results(project_id, history_id, created_at DESC) WHERE history_id IS NOT NULL AND deleted_at IS NULL; CREATE INDEX IF NOT EXISTS upload_jobs_launch_status_idx ON upload_jobs(launch_id, status, updated_at DESC) WHERE deleted_at IS NULL; CREATE INDEX IF NOT EXISTS upload_sessions_launch_path_idx ON upload_sessions(launch_id, path) WHERE deleted_at IS NULL; CREATE INDEX IF NOT EXISTS upload_sessions_status_updated_idx ON upload_sessions(status, updated_at) WHERE deleted_at IS NULL; CREATE INDEX IF NOT EXISTS upload_session_files_session_path_idx ON upload_session_files(upload_session_id, path); CREATE INDEX IF NOT EXISTS upload_session_chunks_received_idx ON upload_session_chunks(received_at DESC);"
    `);
  });

  it("adds an append-only attempt history migration with read-focused indexes", () => {
    const attemptMigration = schemaMigrations.find(
      (migration) => migration.id === "202605300004_attempt_history_boundary"
    );

    expect(normalizeSql(attemptMigration?.sql ?? "")).toMatchInlineSnapshot(`
      "ALTER TABLE test_case_history_versions ADD COLUMN IF NOT EXISTS attempt_index integer NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number > 0), ADD COLUMN IF NOT EXISTS attempt_key text, ADD COLUMN IF NOT EXISTS parameter_variant_signature text, ADD COLUMN IF NOT EXISTS parameters jsonb NOT NULL DEFAULT '[]'::jsonb, ADD COLUMN IF NOT EXISTS retry boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS flaky boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS started_at_millis bigint, ADD COLUMN IF NOT EXISTS stopped_at_millis bigint, ADD COLUMN IF NOT EXISTS status_details jsonb; ALTER TABLE test_case_history_versions DROP CONSTRAINT IF EXISTS test_case_history_versions_test_case_id_launch_id_result_uuid_key; ALTER TABLE test_case_history_versions ADD CONSTRAINT test_case_history_versions_attempt_key UNIQUE (test_case_id, launch_id, result_uuid, attempt_index); CREATE INDEX IF NOT EXISTS test_case_history_project_seen_idx ON test_case_history_versions(project_id, seen_at DESC) WHERE deleted_at IS NULL; CREATE INDEX IF NOT EXISTS test_case_history_identity_variant_idx ON test_case_history_versions(history_id, parameter_variant_signature, seen_at DESC) WHERE history_id IS NOT NULL AND deleted_at IS NULL; CREATE INDEX IF NOT EXISTS test_case_history_launch_attempt_idx ON test_case_history_versions(launch_id, result_uuid, attempt_index) WHERE deleted_at IS NULL;"
    `);
  });

  it("adds an append-only identity correction audit migration with dedupe and variant indexes", () => {
    const auditMigration = schemaMigrations.find(
      (migration) => migration.id === "202605300005_identity_correction_audit"
    );

    expect(normalizeSql(auditMigration?.sql ?? "")).toMatchInlineSnapshot(`
      "CREATE TABLE IF NOT EXISTS identity_correction_audit_events ( id text PRIMARY KEY, dedupe_key text NOT NULL UNIQUE, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT, kind text NOT NULL CHECK (kind IN ('conservative_link', 'split', 'merge', 'correction')), source text NOT NULL CHECK ( source IN ('testCaseId', 'fullName', 'historyId', 'name', 'heuristic', 'manual', 'migration') ), confidence text NOT NULL CHECK (confidence IN ('high', 'medium', 'low')), origin jsonb NOT NULL, reason text NOT NULL, before_ids text[] NOT NULL, after_ids text[] NOT NULL, scope jsonb, evidence jsonb NOT NULL DEFAULT '[]'::jsonb, occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz, version integer NOT NULL DEFAULT 1, CHECK (array_length(before_ids, 1) > 0), CHECK (array_length(after_ids, 1) > 0) ); CREATE INDEX IF NOT EXISTS identity_correction_audit_project_kind_idx ON identity_correction_audit_events(project_id, kind, occurred_at DESC) WHERE deleted_at IS NULL; CREATE INDEX IF NOT EXISTS identity_correction_audit_before_ids_idx ON identity_correction_audit_events USING gin(before_ids) WHERE deleted_at IS NULL; CREATE INDEX IF NOT EXISTS identity_correction_audit_after_ids_idx ON identity_correction_audit_events USING gin(after_ids) WHERE deleted_at IS NULL; CREATE INDEX IF NOT EXISTS identity_correction_audit_variant_idx ON identity_correction_audit_events((scope->>'parameterVariantSignature'), occurred_at DESC) WHERE scope ? 'parameterVariantSignature' AND deleted_at IS NULL;"
    `);
  });

  it("adds cleanup rule scope indexes for tenant-aware retention reads", () => {
    const cleanupRuleMigration = schemaMigrations.find(
      (migration) => migration.id === "202605300006_cleanup_rule_scope_indexes"
    );

    expect(normalizeSql(cleanupRuleMigration?.sql ?? "")).toMatchInlineSnapshot(`
      "CREATE INDEX IF NOT EXISTS cleanup_rules_global_active_idx ON cleanup_rules(target, id) WHERE enabled = true AND deleted_at IS NULL AND scope->>'type' = 'global'; CREATE INDEX IF NOT EXISTS cleanup_rules_project_active_idx ON cleanup_rules(target, (scope->>'projectId'), id) WHERE enabled = true AND deleted_at IS NULL AND scope->>'type' = 'project'; CREATE INDEX IF NOT EXISTS cleanup_rules_launch_active_idx ON cleanup_rules(target, (scope->>'launchId'), id) WHERE enabled = true AND deleted_at IS NULL AND scope->>'type' = 'launch';"
    `);
  });

  it("adds worker lease indexes for bounded upload queue claims", () => {
    const workerLeaseMigration = schemaMigrations.find(
      (migration) => migration.id === "202605300008_upload_job_worker_leases"
    );

    expect(normalizeSql(workerLeaseMigration?.sql ?? "")).toMatchInlineSnapshot(`
      "ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS lease jsonb; CREATE INDEX IF NOT EXISTS upload_jobs_claimable_idx ON upload_jobs((source->>'mode'), status, created_at ASC, id ASC) WHERE deleted_at IS NULL AND status IN ('queued', 'processing'); CREATE INDEX IF NOT EXISTS upload_jobs_lease_expires_idx ON upload_jobs(((lease->>'expiresAt')), status) WHERE deleted_at IS NULL AND lease IS NOT NULL;"
    `);
  });

  it("adds append-only project-scoped defect quarantine audit storage", () => {
    const migration = schemaMigrations.find(
      (candidate) => candidate.id === "202608090001_defect_mute_audit_events"
    );
    const sql = normalizeSql(migration?.sql ?? "");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS defect_mute_audit_events");
    expect(sql).toContain("project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE");
    expect(sql).toContain("event_type IN ('defect.muted', 'defect.unmuted')");
    expect(sql).toContain("defect_mute_audit_project_mute_idx");
  });

  it("adds append-only defect archive and result unlink storage", () => {
    const migration = schemaMigrations.find(
      (candidate) => candidate.id === "202608090002_defect_disposition_events"
    );
    const sql = normalizeSql(migration?.sql ?? "");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS defect_disposition_events");
    expect(sql).toContain("action IN ('archived', 'result_unlinked')");
    expect(sql).toContain("defect_disposition_project_defect_idx");
  });

  it("adds append-only project security audit storage", () => {
    const migration = schemaMigrations.find(
      (candidate) => candidate.id === "202608090003_security_audit_events"
    );
    const sql = normalizeSql(migration?.sql ?? "");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS security_audit_events");
    expect(sql).toContain("security_audit_project_time_idx");
    expect(sql).toContain("security_audit_project_type_idx");
  });

  it("adds durable automated test plans and external CI job records", () => {
    const migration = schemaMigrations.find(
      (candidate) => candidate.id === "202608090004_test_plans_automation_jobs"
    );
    const sql = normalizeSql(migration?.sql ?? "");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS test_plans");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS automation_jobs");
    expect(sql).toContain("test_plan_id text REFERENCES test_plans(id) ON DELETE SET NULL");
    expect(sql).toContain("automation_jobs_project_status_idx");
  });

  it("adds a durable retryable integration delivery outbox", () => {
    const migration = schemaMigrations.find(
      (candidate) => candidate.id === "202608090005_integration_delivery_outbox"
    );
    const sql = normalizeSql(migration?.sql ?? "");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS integration_deliveries");
    expect(sql).toContain("kind IN ('notification', 'issue')");
    expect(sql).toContain("integration_deliveries_dispatch_idx");
    expect(sql).toContain("integration_deliveries_project_time_idx");
  });
});
