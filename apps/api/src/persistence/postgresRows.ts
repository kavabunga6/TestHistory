import type {
  CleanupRuleTarget,
  PersistentArtifact,
  PersistentCleanupRule,
  PersistentDefectMuteAuditEvent,
  PersistentDefectDispositionEvent,
  PersistentIdentityCorrectionAuditEvent,
  PersistentSecurityAuditEvent,
  PersistentLaunch,
  PersistentLaunchResult,
  PersistentProject,
  PersistentTestCase,
  PersistentTestCaseHistoryVersion,
  PersistentUploadJob,
  PersistentUploadSession
} from "@testhistory/domain";

export type ProjectRow = {
  id: string;
  key: string;
  name: string;
  artifact_retention: PersistentProject["artifactRetention"] | null;
  access_settings: PersistentProject["accessSettings"] | null;
  created_at: Date | string;
  updated_at: Date | string;
  archived_at: Date | string | null;
  deleted_at: Date | string | null;
  version: number;
};

export type LaunchRow = {
  id: string;
  project_id: string;
  name: string;
  status: PersistentLaunch["status"];
  branch: string | null;
  commit_sha: string | null;
  build_number: string | null;
  close_pipeline: PersistentLaunch["closePipeline"] | null;
  created_at: Date | string;
  updated_at: Date | string;
  closed_at: Date | string | null;
  archived_at: Date | string | null;
  failed_at: Date | string | null;
  deleted_at: Date | string | null;
  version: number;
  result_count: string | number;
};

export type LaunchResultRow = {
  id: string;
  launch_id: string;
  project_id: string;
  result_uuid: string;
  history_id: string | null;
  test_case_id: string | null;
  full_name: string | null;
  name: string;
  status: PersistentLaunchResult["status"];
  duration_ms: number | null;
  labels: PersistentLaunchResult["labels"];
  parameters: PersistentLaunchResult["parameters"];
  attachments: PersistentLaunchResult["attachments"];
  steps: PersistentLaunchResult["steps"];
  raw: PersistentLaunchResult["raw"];
  source: PersistentLaunchResult["source"] | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  version: number;
};

export type UploadJobRow = {
  id: string;
  launch_id: string;
  status: PersistentUploadJob["status"];
  received_files: number;
  imported_results: number;
  duplicate_results: number;
  stored_artifacts: number;
  errors: PersistentUploadJob["errors"];
  results: NonNullable<PersistentUploadJob["results"]>;
  lease: PersistentUploadJob["lease"] | null;
  source: PersistentUploadJob["source"] | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  version: number;
};

export type UploadSessionRow = {
  id: string;
  launch_id: string;
  path: string;
  status: PersistentUploadSession["status"];
  total_chunks: number;
  received_chunks: number;
  total_bytes: string | number | null;
  received_bytes: string | number;
  expires_at: Date | string;
  closed_at: Date | string | null;
  cleanup: PersistentUploadSession["cleanup"] | null;
  completed_job_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  version: number;
};

export type UploadSessionFileRow = {
  id: string;
  upload_session_id: string;
  path: string;
  total_chunks: number;
  received_chunks: number;
  total_bytes: string | number | null;
  received_bytes: string | number;
  created_at: Date | string;
  updated_at: Date | string;
};

export type UploadSessionChunkRow = {
  upload_session_file_id: string;
  chunk_index: number;
  bytes: number;
  sha256: string | null;
  object_key: string | null;
  received_at: Date | string;
};

export type ArtifactRow = {
  id: string;
  launch_id: string;
  project_id: string | null;
  path: string;
  kind: string;
  content_type: string | null;
  original_bytes: string | number;
  stored_bytes: string | number;
  sha256: string;
  compression: PersistentArtifact["compression"];
  storage_key: string;
  storage: PersistentArtifact["storage"];
  expires_at: Date | string;
  retention: PersistentArtifact["retention"];
  cleanup: PersistentArtifact["cleanup"];
  upload: PersistentArtifact["upload"];
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  version: number;
};

export type TestCaseRow = {
  id: string;
  project_id: string;
  allure_id: string | null;
  name: string;
  full_name: string | null;
  workflow_status: PersistentTestCase["workflowStatus"];
  tags: string[];
  layer: string | null;
  description: string | null;
  custom_fields: PersistentTestCase["customFields"];
  members: string[];
  links: PersistentTestCase["links"];
  issues: string[];
  test_keys: string[];
  relations: string[];
  scenario: string | null;
  expected_result: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  version: number;
};

export type TestCaseHistoryVersionRow = {
  id: string;
  test_case_id: string;
  project_id: string;
  launch_id: string;
  result_uuid: string;
  status: PersistentTestCaseHistoryVersion["status"];
  seen_at: Date | string;
  history_id: string | null;
  attempt_index: number;
  attempt_number: number;
  attempt_key: string | null;
  parameter_variant_signature: string | null;
  parameters: PersistentTestCaseHistoryVersion["parameters"];
  retry: boolean;
  flaky: boolean;
  started_at_millis: string | number | null;
  stopped_at_millis: string | number | null;
  status_details: PersistentTestCaseHistoryVersion["statusDetails"] | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  version: number;
};

export type IdentityCorrectionAuditEventRow = {
  id: string;
  dedupe_key: string;
  project_id: string;
  kind: PersistentIdentityCorrectionAuditEvent["kind"];
  source: PersistentIdentityCorrectionAuditEvent["source"];
  confidence: PersistentIdentityCorrectionAuditEvent["confidence"];
  origin: PersistentIdentityCorrectionAuditEvent["origin"];
  reason: string;
  before_ids: string[];
  after_ids: string[];
  scope: PersistentIdentityCorrectionAuditEvent["scope"] | null;
  evidence: PersistentIdentityCorrectionAuditEvent["evidence"];
  occurred_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  version: number;
};

export type CleanupRuleRow = {
  id: string;
  target: CleanupRuleTarget;
  scope: PersistentCleanupRule["scope"];
  enabled: boolean;
  selector: PersistentCleanupRule["selector"];
  action: PersistentCleanupRule["action"];
  grace_seconds: number;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  version: number;
};

export type DefectMuteAuditEventRow = {
  id: string;
  project_id: string;
  mute_id: string;
  event_type: PersistentDefectMuteAuditEvent["type"];
  payload: PersistentDefectMuteAuditEvent;
  occurred_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  version: number;
};

export type DefectDispositionEventRow = {
  id: string;
  project_id: string;
  defect_id: string;
  action: PersistentDefectDispositionEvent["action"];
  payload: PersistentDefectDispositionEvent;
  occurred_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  version: number;
};

export type SecurityAuditEventRow = {
  id: string;
  project_id: string;
  event_type: PersistentSecurityAuditEvent["type"];
  payload: PersistentSecurityAuditEvent;
  occurred_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  version: number;
};

export type MigrationRow = {
  id: string;
  checksum: string;
  applied_at: Date | string;
};
