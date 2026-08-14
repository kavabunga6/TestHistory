import { createHash } from "node:crypto";
import type {
  PersistentArtifact,
  PersistentCleanupRule,
  PersistentDefectMuteAuditEvent,
  PersistentDefectDispositionEvent,
  PersistentIdentityCorrectionAuditEvent,
  PersistentLaunch,
  PersistentLaunchResult,
  PersistentProject,
  PersistentSecurityAuditEvent,
  PersistentTestCase,
  PersistentTestCaseHistoryVersion,
  PersistentUploadJob,
  PersistentUploadSession,
  RepositoryListQuery,
  RepositoryPage
} from "@testhistory/domain";
import { sanitizePersistentAttemptParameters } from "@testhistory/domain";
import type { PostgresPersistenceConfig, PostgresQueryable } from "./postgres.js";
import type {
  ArtifactRow,
  CleanupRuleRow,
  DefectMuteAuditEventRow,
  DefectDispositionEventRow,
  IdentityCorrectionAuditEventRow,
  LaunchResultRow,
  LaunchRow,
  ProjectRow,
  SecurityAuditEventRow,
  TestCaseHistoryVersionRow,
  TestCaseRow,
  UploadJobRow,
  UploadSessionChunkRow,
  UploadSessionFileRow,
  UploadSessionRow
} from "./postgresRows.js";

const inspectCustom = Symbol.for("nodejs.util.inspect.custom");

export function launchSelect(config: PostgresPersistenceConfig): string {
  return `
    SELECT
      launches.id,
      launches.project_id,
      launches.name,
      launches.status,
      launches.branch,
      launches.commit_sha,
      launches.build_number,
      launches.close_pipeline,
      launches.created_at,
      launches.updated_at,
      launches.closed_at,
      launches.archived_at,
      launches.failed_at,
      launches.deleted_at,
      launches.version,
      COUNT(launch_results.id) FILTER (WHERE launch_results.deleted_at IS NULL) AS result_count
    FROM ${table(config, "launches")} launches
    LEFT JOIN ${table(config, "launch_results")} launch_results
      ON launch_results.launch_id = launches.id
    GROUP BY launches.id
  `;
}

export function artifactSelect(config: PostgresPersistenceConfig): string {
  return `
    SELECT
      id, launch_id, project_id, path, kind, content_type, original_bytes,
      stored_bytes, sha256, compression, storage_key, storage, expires_at,
      retention, cleanup, upload, created_at, updated_at, deleted_at, version
    FROM ${table(config, "artifacts")}
  `;
}

export function testCaseSelect(config: PostgresPersistenceConfig): string {
  return `
    SELECT
      id, project_id, allure_id, name, full_name, workflow_status, tags, layer,
      description, custom_fields, members, links, issues, test_keys, relations,
      scenario, expected_result, created_at, updated_at, deleted_at, version
    FROM ${table(config, "test_cases")}
  `;
}

export function cleanupRuleSelect(config: PostgresPersistenceConfig): string {
  return `
    SELECT
      id, target, scope, enabled, selector, action, grace_seconds,
      created_at, updated_at, deleted_at, version
    FROM ${table(config, "cleanup_rules")}
  `;
}

export function toPersistentProject(row: ProjectRow): PersistentProject {
  const project: PersistentProject = {
    id: row.id,
    key: row.key,
    name: row.name,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: row.version
  };
  assignOptional(project, "artifactRetention", row.artifact_retention ?? undefined);
  assignOptional(project, "accessSettings", row.access_settings ?? undefined);
  assignOptional(project, "archivedAt", optionalIso(row.archived_at));
  assignOptional(project, "deletedAt", optionalIso(row.deleted_at));
  return project;
}

export function toPersistentDefectMuteAuditEvent(
  row: DefectMuteAuditEventRow
): PersistentDefectMuteAuditEvent {
  const event: PersistentDefectMuteAuditEvent = {
    ...row.payload,
    id: row.id,
    projectId: row.project_id,
    muteId: row.mute_id,
    type: row.event_type,
    occurredAt: toIso(row.occurred_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: row.version
  };
  assignOptional(event, "deletedAt", optionalIso(row.deleted_at));
  return event;
}

export function toPersistentDefectDispositionEvent(
  row: DefectDispositionEventRow
): PersistentDefectDispositionEvent {
  const event: PersistentDefectDispositionEvent = {
    ...row.payload,
    id: row.id,
    projectId: row.project_id,
    defectId: row.defect_id,
    action: row.action,
    occurredAt: toIso(row.occurred_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: row.version
  };
  assignOptional(event, "deletedAt", optionalIso(row.deleted_at));
  return event;
}

export function toPersistentSecurityAuditEvent(
  row: SecurityAuditEventRow
): PersistentSecurityAuditEvent {
  const event: PersistentSecurityAuditEvent = {
    ...row.payload,
    id: row.id,
    projectId: row.project_id,
    type: row.event_type,
    occurredAt: toIso(row.occurred_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: row.version
  };
  assignOptional(event, "deletedAt", optionalIso(row.deleted_at));
  return event;
}

export function toPersistentLaunch(row: LaunchRow): PersistentLaunch {
  const launch: PersistentLaunch = {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: row.version,
    resultCount: Number(row.result_count)
  };
  assignOptional(launch, "branch", optionalString(row.branch));
  assignOptional(launch, "commitSha", optionalString(row.commit_sha));
  assignOptional(launch, "buildNumber", optionalString(row.build_number));
  assignOptional(launch, "closePipeline", row.close_pipeline ?? undefined);
  assignOptional(launch, "closedAt", optionalIso(row.closed_at));
  assignOptional(launch, "archivedAt", optionalIso(row.archived_at));
  assignOptional(launch, "failedAt", optionalIso(row.failed_at));
  assignOptional(launch, "deletedAt", optionalIso(row.deleted_at));
  return launch;
}

export function toPersistentLaunchResult(row: LaunchResultRow): PersistentLaunchResult {
  const result: PersistentLaunchResult = {
    id: row.id,
    uuid: row.result_uuid,
    launchId: row.launch_id,
    projectId: row.project_id,
    resultUuid: row.result_uuid,
    name: row.name,
    status: row.status,
    labels: row.labels,
    parameters: row.parameters,
    attachments: row.attachments,
    steps: row.steps,
    raw: row.raw,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: row.version
  };
  assignOptional(result, "historyId", optionalString(row.history_id));
  assignOptional(result, "testCaseId", optionalString(row.test_case_id));
  assignOptional(result, "fullName", optionalString(row.full_name));
  assignOptional(result, "durationMs", row.duration_ms ?? undefined);
  assignOptional(result, "source", row.source ?? undefined);
  assignOptional(result, "deletedAt", optionalIso(row.deleted_at));
  return result;
}

export function toPersistentUploadJob(row: UploadJobRow): PersistentUploadJob {
  const job: PersistentUploadJob = {
    id: row.id,
    launchId: row.launch_id,
    status: row.status,
    receivedFiles: row.received_files,
    importedResults: row.imported_results,
    duplicateResults: row.duplicate_results,
    storedArtifacts: row.stored_artifacts,
    errors: row.errors,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: row.version
  };
  assignOptional(job, "lease", row.lease ?? undefined);
  assignOptional(job, "source", row.source ?? undefined);
  assignOptional(job, "deletedAt", optionalIso(row.deleted_at));
  return job;
}

export async function hydrateUploadSessions(
  queryable: PostgresQueryable,
  config: PostgresPersistenceConfig,
  rows: UploadSessionRow[]
): Promise<PersistentUploadSession[]> {
  if (rows.length === 0) {
    return [];
  }

  const sessionIds = rows.map((row) => row.id);
  const fileResult = await queryable.query<UploadSessionFileRow>(
    `
      SELECT
        id, upload_session_id, path, total_chunks, received_chunks, total_bytes,
        received_bytes, created_at, updated_at
      FROM ${table(config, "upload_session_files")}
      WHERE upload_session_id = ANY($1::uuid[])
      ORDER BY created_at ASC, path ASC
    `,
    [sessionIds]
  );

  const fileIds = fileResult.rows.map((row) => row.id);
  const chunkResult =
    fileIds.length === 0
      ? { rows: [] as UploadSessionChunkRow[] }
      : await queryable.query<UploadSessionChunkRow>(
          `
            SELECT
              upload_session_file_id, chunk_index, bytes, sha256, object_key, received_at
            FROM ${table(config, "upload_session_chunks")}
            WHERE upload_session_file_id = ANY($1::uuid[])
            ORDER BY upload_session_file_id ASC, chunk_index ASC
          `,
          [fileIds]
        );

  const chunksByFile = groupBy(chunkResult.rows, (chunk) => chunk.upload_session_file_id);
  const filesBySession = groupBy(fileResult.rows, (file) => file.upload_session_id);

  return rows.map((row) =>
    toPersistentUploadSession(
      row,
      (filesBySession.get(row.id) ?? []).map((file) =>
        toPersistentUploadSessionFile(file, chunksByFile.get(file.id) ?? [])
      )
    )
  );
}

function toPersistentUploadSession(
  row: UploadSessionRow,
  files: PersistentUploadSession["files"]
): PersistentUploadSession {
  const session: PersistentUploadSession = {
    id: row.id,
    launchId: row.launch_id,
    path: row.path,
    status: row.status,
    totalChunks: row.total_chunks,
    receivedChunks: row.received_chunks,
    receivedBytes: toNumber(row.received_bytes),
    files,
    expiresAt: toIso(row.expires_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: row.version
  };
  assignOptional(session, "totalBytes", optionalNumber(row.total_bytes));
  assignOptional(session, "closedAt", optionalIso(row.closed_at));
  assignOptional(session, "cleanup", row.cleanup ?? undefined);
  assignOptional(session, "completedJobId", optionalString(row.completed_job_id));
  assignOptional(session, "deletedAt", optionalIso(row.deleted_at));
  return session;
}

function toPersistentUploadSessionFile(
  row: UploadSessionFileRow,
  chunks: UploadSessionChunkRow[]
): PersistentUploadSession["files"][number] {
  const file: PersistentUploadSession["files"][number] = {
    path: row.path,
    totalChunks: row.total_chunks,
    receivedChunks: row.received_chunks,
    receivedBytes: toNumber(row.received_bytes),
    chunks: chunks.map(toPersistentUploadChunk)
  };
  assignOptional(file, "totalBytes", optionalNumber(row.total_bytes));
  return file;
}

function toPersistentUploadChunk(
  row: UploadSessionChunkRow
): PersistentUploadSession["files"][number]["chunks"][number] {
  const chunk: PersistentUploadSession["files"][number]["chunks"][number] = {
    index: row.chunk_index,
    bytes: row.bytes,
    receivedAt: toIso(row.received_at)
  };
  assignOptional(chunk, "sha256", optionalString(row.sha256));
  assignOptional(chunk, "objectKey", optionalString(row.object_key));
  return chunk;
}

export function toPersistentArtifact(row: ArtifactRow): PersistentArtifact {
  const artifact: PersistentArtifact = {
    id: row.id,
    launchId: row.launch_id,
    path: row.path,
    kind: row.kind,
    originalBytes: toNumber(row.original_bytes),
    storedBytes: toNumber(row.stored_bytes),
    sha256: row.sha256,
    compression: row.compression,
    storageKey: row.storage_key,
    storage: row.storage,
    expiresAt: toIso(row.expires_at),
    retention: row.retention,
    cleanup: row.cleanup,
    upload: row.upload,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: row.version
  };
  assignOptional(artifact, "projectId", optionalString(row.project_id));
  assignOptional(artifact, "contentType", optionalString(row.content_type));
  assignOptional(artifact, "deletedAt", optionalIso(row.deleted_at));
  return artifact;
}

export function toPersistentTestCase(row: TestCaseRow): PersistentTestCase {
  const testCase: PersistentTestCase = {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    workflowStatus: row.workflow_status,
    tags: row.tags,
    customFields: row.custom_fields,
    members: row.members,
    links: row.links,
    issues: row.issues,
    testKeys: row.test_keys,
    relations: row.relations,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: row.version
  };
  assignOptional(testCase, "allureId", optionalString(row.allure_id));
  assignOptional(testCase, "fullName", optionalString(row.full_name));
  assignOptional(testCase, "layer", optionalString(row.layer));
  assignOptional(testCase, "description", optionalString(row.description));
  assignOptional(testCase, "scenario", optionalString(row.scenario));
  assignOptional(testCase, "expectedResult", optionalString(row.expected_result));
  assignOptional(testCase, "deletedAt", optionalIso(row.deleted_at));
  return testCase;
}

export function toPersistentTestCaseHistoryVersion(
  row: TestCaseHistoryVersionRow
): PersistentTestCaseHistoryVersion {
  const history: PersistentTestCaseHistoryVersion = {
    id: row.id,
    testCaseId: row.test_case_id,
    projectId: row.project_id,
    launchId: row.launch_id,
    resultUuid: row.result_uuid,
    status: row.status,
    seenAt: toIso(row.seen_at),
    attemptIndex: row.attempt_index,
    attemptNumber: row.attempt_number,
    parameters: sanitizePersistentAttemptParameters(row.parameters),
    retry: row.retry,
    flaky: row.flaky,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: row.version
  };
  assignOptional(history, "historyId", optionalString(row.history_id));
  assignOptional(history, "attemptKey", optionalString(row.attempt_key));
  assignOptional(
    history,
    "parameterVariantSignature",
    optionalString(row.parameter_variant_signature)
  );
  assignOptional(history, "startedAt", optionalNumber(row.started_at_millis));
  assignOptional(history, "stoppedAt", optionalNumber(row.stopped_at_millis));
  assignOptional(history, "statusDetails", row.status_details ?? undefined);
  assignOptional(history, "deletedAt", optionalIso(row.deleted_at));
  return history;
}

export function toPersistentIdentityCorrectionAuditEvent(
  row: IdentityCorrectionAuditEventRow
): PersistentIdentityCorrectionAuditEvent {
  const event: PersistentIdentityCorrectionAuditEvent = {
    id: row.id,
    dedupeKey: row.dedupe_key,
    projectId: row.project_id,
    kind: row.kind,
    source: row.source,
    confidence: row.confidence,
    origin: row.origin,
    reason: row.reason,
    beforeIds: row.before_ids,
    afterIds: row.after_ids,
    evidence: row.evidence,
    occurredAt: toIso(row.occurred_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: row.version
  };
  assignOptional(event, "scope", row.scope ?? undefined);
  assignOptional(event, "deletedAt", optionalIso(row.deleted_at));
  return event;
}

export function toPersistentCleanupRule(row: CleanupRuleRow): PersistentCleanupRule {
  const rule: PersistentCleanupRule = {
    id: row.id,
    target: row.target,
    scope: row.scope,
    enabled: row.enabled,
    selector: row.selector,
    action: row.action,
    graceSeconds: row.grace_seconds,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: row.version
  };
  assignOptional(rule, "deletedAt", optionalIso(row.deleted_at));
  return rule;
}

export function pageRows<T>(rows: T[], query?: RepositoryListQuery): RepositoryPage<T> {
  const limit = pageLimit(query);
  if (limit === undefined || rows.length <= limit) {
    return { items: rows };
  }

  const offset = pageOffset(query);
  return {
    items: rows.slice(0, limit),
    nextCursor: String(offset + limit)
  };
}

export function paginationSql(query: RepositoryListQuery | undefined, startIndex = 0): string {
  const limit = pageLimit(query);
  if (limit === undefined) {
    return "";
  }

  return `LIMIT $${startIndex + 1} OFFSET $${startIndex + 2}`;
}

export function paginationParams(query: RepositoryListQuery | undefined): unknown[] {
  const limit = pageLimit(query);
  return limit === undefined ? [] : [limit + 1, pageOffset(query)];
}

export function appendPaginationParams(
  params: unknown[],
  query: RepositoryListQuery | undefined
): void {
  params.push(...paginationParams(query));
}

export function paginationParamCount(query: RepositoryListQuery | undefined): number {
  return pageLimit(query) === undefined ? 0 : 2;
}

export function cleanupRuleScopeCondition(
  params: unknown[],
  query: { projectId?: string; launchId?: string } | undefined
): string {
  const clauses = ["scope->>'type' = 'global'"];
  if (query?.projectId !== undefined) {
    params.push(query.projectId);
    clauses.push(`(scope->>'type' = 'project' AND scope->>'projectId' = $${params.length})`);
  }
  if (query?.launchId !== undefined) {
    params.push(query.launchId);
    clauses.push(`(scope->>'type' = 'launch' AND scope->>'launchId' = $${params.length})`);
  }
  return `(${clauses.join(" OR ")})`;
}

function pageLimit(query: RepositoryListQuery | undefined): number | undefined {
  if (query?.limit === undefined) {
    return undefined;
  }
  return Math.max(1, Math.floor(query.limit));
}

function pageOffset(query: RepositoryListQuery | undefined): number {
  return query?.cursor === undefined ? 0 : Math.max(0, Number(query.cursor) || 0);
}

export function table(config: PostgresPersistenceConfig, name: string): string {
  return `${quoteIdentifier(config.schema)}.${quoteIdentifier(name)}`;
}

export function quoteIdentifier(value: string): string {
  return `"${readIdentifier(value, value, "identifier").replaceAll('"', '""')}"`;
}

export function readIdentifier(value: string | undefined, fallback: string, label: string): string {
  const resolved = value?.trim() || fallback;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(resolved)) {
    throw new Error(`Invalid PostgreSQL ${label}: ${resolved}`);
  }
  return resolved;
}

export function readInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export function stringifyJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function optionalIso(value: Date | string | null): string | undefined {
  return value === null ? undefined : toIso(value);
}

function optionalString(value: string | null): string | undefined {
  return value === null ? undefined : value;
}

function optionalNumber(value: string | number | null): number | undefined {
  return value === null ? undefined : toNumber(value);
}

function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

export function mapOptional<T, U>(value: T | undefined, mapper: (value: T) => U): U | undefined {
  return value === undefined ? undefined : mapper(value);
}

function groupBy<T>(values: T[], keySelector: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keySelector(value);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [value]);
    } else {
      group.push(value);
    }
  }
  return groups;
}

function assignOptional<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

export function normalizeUuid(candidate: string, seed: string): string {
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
  ) {
    return candidate;
  }

  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(
    17,
    20
  )}-${hex.slice(20, 32)}`;
}

export function uploadSessionFileId(sessionId: string, path: string): string {
  return normalizeUuid(`${sessionId}:${path}`, `${sessionId}:${path}`);
}

export function redactPostgresConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    if (url.password.length > 0) {
      url.password = "REDACTED";
    }
    return url.toString();
  } catch {
    return connectionString.replace(/(:\/\/[^:\s/?#]+:)([^@\s/?#]+)(@)/, "$1REDACTED$3");
  }
}

export function sanitizeDatabaseError(
  error: unknown,
  message: string,
  config: PostgresPersistenceConfig
): Error {
  const originalMessage = error instanceof Error ? error.message : String(error);
  const redactedMessage = redactSecrets(originalMessage, config.connectionString);
  return new Error(`${message} for ${describePostgresConfig(config)}: ${redactedMessage}`);
}

function redactSecrets(value: string, connectionString: string): string {
  return value
    .replaceAll(connectionString, redactPostgresConnectionString(connectionString))
    .replace(/(:\/\/[^:\s/?#]+:)([^@\s/?#]+)(@)/g, "$1REDACTED$3");
}

function describePostgresConfig(config: PostgresPersistenceConfig): string {
  return JSON.stringify(toRedactedConfig(config));
}

export function withRedactedInspect(config: PostgresPersistenceConfig): PostgresPersistenceConfig {
  const redacted = () => toRedactedConfig(config);
  Object.defineProperty(config, "toJSON", { value: redacted });
  Object.defineProperty(config, inspectCustom, { value: redacted });
  return config;
}

function toRedactedConfig(config: PostgresPersistenceConfig) {
  return {
    driver: config.driver,
    connectionString: redactPostgresConnectionString(config.connectionString),
    schema: config.schema,
    migrationsTable: config.migrationsTable,
    advisoryLockKey: config.advisoryLockKey,
    requireSsl: config.requireSsl
  };
}
