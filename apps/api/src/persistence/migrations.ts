import { createHash } from "node:crypto";

export type MigrationPhase = "schema" | "seed";

export type MigrationDefinition = {
  id: string;
  phase: MigrationPhase;
  description: string;
  checksum: string;
  sql: string;
};

export type SeedPolicy = {
  mode: "schema-only" | "reference-data";
  allowInProduction: boolean;
  referenceData: string[];
  forbiddenData: string[];
};

export const migrationConvention = {
  idPattern: /^20\d{10}_[a-z0-9_]+$/,
  tableName: "schema_migrations",
  checksum: "sha256(sql)",
  lock: "PostgreSQL advisory transaction lock around migration application",
  transaction: "Each migration runs in a single transaction; seed migrations must be idempotent."
} as const;

export const seedPolicy: SeedPolicy = {
  mode: "reference-data",
  allowInProduction: true,
  referenceData: ["global cleanup rules", "schema migration history"],
  forbiddenData: ["projects", "launches", "results", "test cases", "upload jobs", "artifacts"]
};

export const schemaMigrations: MigrationDefinition[] = [
  defineMigration({
    id: "202605300001_persistence_core",
    phase: "schema",
    description:
      "Persistent boundary for projects, launches, results, uploads, artifacts, tests, cleanup.",
    sql: `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  phase text NOT NULL CHECK (phase IN ('schema', 'seed')),
  description text NOT NULL,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY,
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  artifact_retention jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  archived_at timestamptz,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS launches (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'processing', 'closed', 'failed', 'archived')),
  branch text,
  commit_sha text,
  build_number text,
  close_pipeline jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  closed_at timestamptz,
  archived_at timestamptz,
  failed_at timestamptz,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS launches_project_created_idx ON launches(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS launches_project_status_idx ON launches(project_id, status);
CREATE INDEX IF NOT EXISTS launches_branch_idx ON launches(branch) WHERE branch IS NOT NULL;

CREATE TABLE IF NOT EXISTS launch_results (
  id uuid PRIMARY KEY,
  launch_id uuid NOT NULL REFERENCES launches(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  result_uuid text NOT NULL,
  history_id text,
  test_case_id text,
  full_name text,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('failed', 'broken', 'passed', 'skipped', 'unknown')),
  duration_ms integer,
  labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  parameters jsonb NOT NULL DEFAULT '[]'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw jsonb NOT NULL,
  source jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  UNIQUE (launch_id, result_uuid)
);

CREATE INDEX IF NOT EXISTS launch_results_launch_idx ON launch_results(launch_id);
CREATE INDEX IF NOT EXISTS launch_results_test_case_idx ON launch_results(test_case_id)
  WHERE test_case_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS launch_results_history_idx ON launch_results(history_id)
  WHERE history_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS upload_jobs (
  id uuid PRIMARY KEY,
  launch_id uuid NOT NULL REFERENCES launches(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (
    status IN ('queued', 'processing', 'completed', 'completed_with_errors', 'failed')
  ),
  received_files integer NOT NULL DEFAULT 0,
  imported_results integer NOT NULL DEFAULT 0,
  duplicate_results integer NOT NULL DEFAULT 0,
  stored_artifacts integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  lease jsonb,
  source jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS upload_jobs_launch_idx ON upload_jobs(launch_id, created_at DESC);

CREATE TABLE IF NOT EXISTS upload_sessions (
  id uuid PRIMARY KEY,
  launch_id uuid NOT NULL REFERENCES launches(id) ON DELETE CASCADE,
  path text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('open', 'completing', 'completed', 'aborted', 'expired', 'failed')
  ),
  total_chunks integer NOT NULL,
  received_chunks integer NOT NULL DEFAULT 0,
  total_bytes bigint,
  received_bytes bigint NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  cleanup jsonb,
  completed_job_id uuid REFERENCES upload_jobs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS upload_sessions_launch_status_idx ON upload_sessions(launch_id, status);
CREATE INDEX IF NOT EXISTS upload_sessions_expiry_idx ON upload_sessions(expires_at)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS upload_session_files (
  id uuid PRIMARY KEY,
  upload_session_id uuid NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
  path text NOT NULL,
  total_chunks integer NOT NULL,
  received_chunks integer NOT NULL DEFAULT 0,
  total_bytes bigint,
  received_bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (upload_session_id, path)
);

CREATE TABLE IF NOT EXISTS upload_session_chunks (
  upload_session_file_id uuid NOT NULL REFERENCES upload_session_files(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  bytes integer NOT NULL,
  sha256 text,
  object_key text,
  received_at timestamptz NOT NULL,
  PRIMARY KEY (upload_session_file_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS artifacts (
  id text PRIMARY KEY,
  launch_id uuid NOT NULL REFERENCES launches(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE RESTRICT,
  path text NOT NULL,
  kind text NOT NULL,
  content_type text,
  original_bytes bigint NOT NULL,
  stored_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  compression text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  storage jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  retention jsonb NOT NULL,
  cleanup jsonb NOT NULL,
  upload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS artifacts_launch_idx ON artifacts(launch_id);
CREATE INDEX IF NOT EXISTS artifacts_project_kind_idx ON artifacts(project_id, kind);
CREATE INDEX IF NOT EXISTS artifacts_cleanup_idx ON artifacts(expires_at, kind);

CREATE TABLE IF NOT EXISTS test_cases (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  allure_id text,
  name text NOT NULL,
  full_name text,
  workflow_status text NOT NULL CHECK (
    workflow_status IN ('draft', 'active', 'deprecated', 'archived')
  ),
  tags text[] NOT NULL DEFAULT '{}',
  layer text,
  description text,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  members text[] NOT NULL DEFAULT '{}',
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  issues text[] NOT NULL DEFAULT '{}',
  test_keys text[] NOT NULL DEFAULT '{}',
  relations text[] NOT NULL DEFAULT '{}',
  scenario text,
  expected_result text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS test_cases_project_idx ON test_cases(project_id, name);
CREATE INDEX IF NOT EXISTS test_cases_allure_idx ON test_cases(project_id, allure_id)
  WHERE allure_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS test_case_history_versions (
  id text PRIMARY KEY,
  test_case_id text NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  launch_id uuid NOT NULL REFERENCES launches(id) ON DELETE CASCADE,
  result_uuid text NOT NULL,
  status text NOT NULL CHECK (status IN ('failed', 'broken', 'passed', 'skipped', 'unknown')),
  seen_at timestamptz NOT NULL,
  history_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  UNIQUE (test_case_id, launch_id, result_uuid)
);

CREATE INDEX IF NOT EXISTS test_case_history_case_seen_idx
  ON test_case_history_versions(test_case_id, seen_at);

CREATE TABLE IF NOT EXISTS cleanup_rules (
  id text PRIMARY KEY,
  target text NOT NULL CHECK (
    target IN ('artifact', 'upload-session', 'launch', 'test-case-history')
  ),
  scope jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  selector jsonb NOT NULL DEFAULT '{}'::jsonb,
  action text NOT NULL CHECK (
    action IN ('mark_eligible', 'delete_chunks', 'delete_object', 'archive')
  ),
  grace_seconds integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS cleanup_rules_target_enabled_idx ON cleanup_rules(target, enabled);
`
  }),
  defineMigration({
    id: "202605300002_seed_cleanup_rules",
    phase: "seed",
    description: "Idempotent reference cleanup rules; no tenant data is seeded.",
    sql: `
INSERT INTO cleanup_rules (
  id,
  target,
  scope,
  enabled,
  selector,
  action,
  grace_seconds,
  created_at,
  updated_at
) VALUES
  (
    'upload-session-expired-delete-chunks',
    'upload-session',
    '{"type":"global"}'::jsonb,
    true,
    '{"status":["expired","aborted","failed"]}'::jsonb,
    'delete_chunks',
    0,
    now(),
    now()
  ),
  (
    'artifact-retention-mark-eligible',
    'artifact',
    '{"type":"global"}'::jsonb,
    true,
    '{"expiresAt":"lte:now"}'::jsonb,
    'mark_eligible',
    604800,
    now(),
    now()
  )
ON CONFLICT (id) DO UPDATE SET
  target = EXCLUDED.target,
  scope = EXCLUDED.scope,
  enabled = EXCLUDED.enabled,
  selector = EXCLUDED.selector,
  action = EXCLUDED.action,
  grace_seconds = EXCLUDED.grace_seconds,
  updated_at = now(),
  version = cleanup_rules.version + 1;
`
  }),
  defineMigration({
    id: "202605300003_ingestion_indexes",
    phase: "schema",
    description:
      "High-volume ingestion indexes for launch result lookup and upload session processing.",
    sql: `
CREATE INDEX IF NOT EXISTS launch_results_launch_result_uuid_idx
  ON launch_results(launch_id, result_uuid)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS launch_results_launch_history_idx
  ON launch_results(launch_id, history_id)
  WHERE history_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS launch_results_launch_test_case_idx
  ON launch_results(launch_id, test_case_id)
  WHERE test_case_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS launch_results_project_history_created_idx
  ON launch_results(project_id, history_id, created_at DESC)
  WHERE history_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS upload_jobs_launch_status_idx
  ON upload_jobs(launch_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS upload_sessions_launch_path_idx
  ON upload_sessions(launch_id, path)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS upload_sessions_status_updated_idx
  ON upload_sessions(status, updated_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS upload_session_files_session_path_idx
  ON upload_session_files(upload_session_id, path);

CREATE INDEX IF NOT EXISTS upload_session_chunks_received_idx
  ON upload_session_chunks(received_at DESC);
`
  }),
  defineMigration({
    id: "202605300004_attempt_history_boundary",
    phase: "schema",
    description:
      "Persistent boundary for Allure retry attempts and parameterized test case history reads.",
    sql: `
ALTER TABLE test_case_history_versions
  ADD COLUMN IF NOT EXISTS attempt_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  ADD COLUMN IF NOT EXISTS attempt_key text,
  ADD COLUMN IF NOT EXISTS parameter_variant_signature text,
  ADD COLUMN IF NOT EXISTS parameters jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS retry boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flaky boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS started_at_millis bigint,
  ADD COLUMN IF NOT EXISTS stopped_at_millis bigint,
  ADD COLUMN IF NOT EXISTS status_details jsonb;

ALTER TABLE test_case_history_versions
  DROP CONSTRAINT IF EXISTS test_case_history_versions_test_case_id_launch_id_result_uuid_key;

ALTER TABLE test_case_history_versions
  ADD CONSTRAINT test_case_history_versions_attempt_key
  UNIQUE (test_case_id, launch_id, result_uuid, attempt_index);

CREATE INDEX IF NOT EXISTS test_case_history_project_seen_idx
  ON test_case_history_versions(project_id, seen_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS test_case_history_identity_variant_idx
  ON test_case_history_versions(history_id, parameter_variant_signature, seen_at DESC)
  WHERE history_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS test_case_history_launch_attempt_idx
  ON test_case_history_versions(launch_id, result_uuid, attempt_index)
  WHERE deleted_at IS NULL;
`
  }),
  defineMigration({
    id: "202605300005_identity_correction_audit",
    phase: "schema",
    description:
      "Append-only audit boundary for conservative identity correction links, splits, and merges.",
    sql: `
CREATE TABLE IF NOT EXISTS identity_correction_audit_events (
  id text PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('conservative_link', 'split', 'merge', 'correction')),
  source text NOT NULL CHECK (
    source IN ('testCaseId', 'fullName', 'historyId', 'name', 'heuristic', 'manual', 'migration')
  ),
  confidence text NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  origin jsonb NOT NULL,
  reason text NOT NULL,
  before_ids text[] NOT NULL,
  after_ids text[] NOT NULL,
  scope jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CHECK (array_length(before_ids, 1) > 0),
  CHECK (array_length(after_ids, 1) > 0)
);

CREATE INDEX IF NOT EXISTS identity_correction_audit_project_kind_idx
  ON identity_correction_audit_events(project_id, kind, occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS identity_correction_audit_before_ids_idx
  ON identity_correction_audit_events USING gin(before_ids)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS identity_correction_audit_after_ids_idx
  ON identity_correction_audit_events USING gin(after_ids)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS identity_correction_audit_variant_idx
  ON identity_correction_audit_events((scope->>'parameterVariantSignature'), occurred_at DESC)
  WHERE scope ? 'parameterVariantSignature' AND deleted_at IS NULL;
`
  }),
  defineMigration({
    id: "202605300006_cleanup_rule_scope_indexes",
    phase: "schema",
    description:
      "Scoped cleanup rule lookup indexes for global, project, and launch retention policy reads.",
    sql: `
CREATE INDEX IF NOT EXISTS cleanup_rules_global_active_idx
  ON cleanup_rules(target, id)
  WHERE enabled = true AND deleted_at IS NULL AND scope->>'type' = 'global';

CREATE INDEX IF NOT EXISTS cleanup_rules_project_active_idx
  ON cleanup_rules(target, (scope->>'projectId'), id)
  WHERE enabled = true AND deleted_at IS NULL AND scope->>'type' = 'project';

CREATE INDEX IF NOT EXISTS cleanup_rules_launch_active_idx
  ON cleanup_rules(target, (scope->>'launchId'), id)
  WHERE enabled = true AND deleted_at IS NULL AND scope->>'type' = 'launch';
`
  }),
  defineMigration({
    id: "202605300007_project_artifact_retention_settings",
    phase: "schema",
    description: "Project-level artifact retention policy overrides for enterprise cleanup.",
    sql: `
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS artifact_retention jsonb;
`
  }),
  defineMigration({
    id: "202605300008_upload_job_worker_leases",
    phase: "schema",
    description:
      "Worker claim leases for upload jobs so parallel workers do not process the same job.",
    sql: `
ALTER TABLE upload_jobs
  ADD COLUMN IF NOT EXISTS lease jsonb;

CREATE INDEX IF NOT EXISTS upload_jobs_claimable_idx
  ON upload_jobs((source->>'mode'), status, created_at ASC, id ASC)
  WHERE deleted_at IS NULL AND status IN ('queued', 'processing');

CREATE INDEX IF NOT EXISTS upload_jobs_lease_expires_idx
  ON upload_jobs(((lease->>'expiresAt')), status)
  WHERE deleted_at IS NULL AND lease IS NOT NULL;
`
  }),
  defineMigration({
    id: "202606030001_project_access_settings",
    phase: "schema",
    description: "Project-scoped memberships, API tokens, visibility, and integration providers.",
    sql: `
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS access_settings jsonb;
`
  }),
  defineMigration({
    id: "202608090001_defect_mute_audit_events",
    phase: "schema",
    description: "Append-only project-scoped audit events for defect quarantine commands.",
    sql: `
CREATE TABLE IF NOT EXISTS defect_mute_audit_events (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mute_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('defect.muted', 'defect.unmuted')),
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS defect_mute_audit_project_time_idx
  ON defect_mute_audit_events(project_id, occurred_at ASC, id ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS defect_mute_audit_project_mute_idx
  ON defect_mute_audit_events(project_id, mute_id, occurred_at ASC)
  WHERE deleted_at IS NULL;
`
  }),
  defineMigration({
    id: "202608090002_defect_disposition_events",
    phase: "schema",
    description: "Append-only project-scoped defect archive and result unlink commands.",
    sql: `
CREATE TABLE IF NOT EXISTS defect_disposition_events (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  defect_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('archived', 'result_unlinked')),
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS defect_disposition_project_time_idx
  ON defect_disposition_events(project_id, occurred_at ASC, id ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS defect_disposition_project_defect_idx
  ON defect_disposition_events(project_id, defect_id, occurred_at ASC)
  WHERE deleted_at IS NULL;
`
  }),
  defineMigration({
    id: "202608090003_security_audit_events",
    phase: "schema",
    description: "Append-only project-scoped security and administrative audit events.",
    sql: `
CREATE TABLE IF NOT EXISTS security_audit_events (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS security_audit_project_time_idx
  ON security_audit_events(project_id, occurred_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS security_audit_project_type_idx
  ON security_audit_events(project_id, event_type, occurred_at DESC)
  WHERE deleted_at IS NULL;
`
  }),
  defineMigration({
    id: "202608090004_test_plans_automation_jobs",
    phase: "schema",
    description: "Automated test selection plans and external CI execution records.",
    sql: `
CREATE TABLE IF NOT EXISTS test_plans (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL CHECK (status IN ('active', 'disabled', 'archived')),
  selector jsonb NOT NULL,
  launch_name_template text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS test_plans_project_status_idx
  ON test_plans(project_id, status, updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS automation_jobs (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  trigger text NOT NULL CHECK (trigger IN ('api', 'schedule', 'webhook', 'ci')),
  test_plan_id text REFERENCES test_plans(id) ON DELETE SET NULL,
  launch_id uuid REFERENCES launches(id) ON DELETE SET NULL,
  branch text,
  commit_sha text,
  external_ref jsonb,
  requested_by text NOT NULL,
  error text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  started_at timestamptz,
  finished_at timestamptz,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS automation_jobs_project_status_idx
  ON automation_jobs(project_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS automation_jobs_plan_idx
  ON automation_jobs(project_id, test_plan_id, created_at DESC)
  WHERE test_plan_id IS NOT NULL AND deleted_at IS NULL;
`
  }),
  defineMigration({
    id: "202608090005_integration_delivery_outbox",
    phase: "schema",
    description: "Durable retryable outbox for notification and issue-tracker deliveries.",
    sql: `
CREATE TABLE IF NOT EXISTS integration_deliveries (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  integration_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('notification', 'issue')),
  event text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'delivered', 'retrying', 'dead')),
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  next_attempt_at timestamptz NOT NULL,
  delivered_at timestamptz,
  response_status integer,
  external_reference text,
  last_error text,
  lease jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS integration_deliveries_dispatch_idx
  ON integration_deliveries(status, next_attempt_at ASC, id ASC)
  WHERE deleted_at IS NULL AND status IN ('pending', 'retrying', 'processing');
CREATE INDEX IF NOT EXISTS integration_deliveries_project_time_idx
  ON integration_deliveries(project_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
`
  })
];

function defineMigration(input: Omit<MigrationDefinition, "checksum">): MigrationDefinition {
  if (!migrationConvention.idPattern.test(input.id)) {
    throw new Error(`Invalid migration id: ${input.id}`);
  }

  return {
    ...input,
    checksum: createHash("sha256").update(input.sql).digest("hex")
  };
}
