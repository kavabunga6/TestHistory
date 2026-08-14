import { describe, expect, it, vi } from "vitest";
import {
  createPostgresRepositories,
  redactPostgresConnectionString,
  type PostgresQueryable
} from "./index.js";
import {
  artifactDescriptorFixture,
  cleanupRuleFixture,
  createRecordingClient,
  identityCorrectionAuditFixture,
  normalizeSql,
  testCaseFixture,
  testCaseHistoryAttemptFixture,
  testConfig,
  uploadJobFixture,
  uploadSessionFixture
} from "./postgresTestUtils.js";

describe("PostgreSQL persistence boundary", () => {
  it("upserts upload sessions, files, and chunks with stable parameterized SQL", async () => {
    const client = createRecordingClient();
    const repositories = createPostgresRepositories(client, testConfig());
    const session = uploadSessionFixture();

    await repositories.uploadSessions.save(session);
    const firstSave = client.queries.map((query) => ({
      sql: query.sql,
      params: query.params
    }));

    await repositories.uploadSessions.save(session);
    const secondSave = client.queries.slice(firstSave.length).map((query) => ({
      sql: query.sql,
      params: query.params
    }));

    expect(firstSave).toEqual(secondSave);
    expect(firstSave[0]?.sql).toContain('INSERT INTO "testhistory"."upload_sessions"');
    expect(firstSave[0]?.sql).toContain("ON CONFLICT (id) DO UPDATE");
    expect(firstSave[0]?.params).toEqual([
      session.id,
      session.launchId,
      session.path,
      session.status,
      session.totalChunks,
      session.receivedChunks,
      session.totalBytes,
      session.receivedBytes,
      session.expiresAt,
      session.closedAt,
      JSON.stringify(session.cleanup),
      session.completedJobId,
      session.createdAt,
      session.updatedAt,
      null,
      session.version
    ]);
    expect(firstSave.some((query) => query.sql.includes("upload_session_files"))).toBe(true);
    expect(firstSave.some((query) => query.sql.includes("upload_session_chunks"))).toBe(true);
    expect(JSON.stringify(firstSave)).not.toContain("supersecret");
  });

  it("hydrates upload sessions from session, file, and chunk rows", async () => {
    const sessionId = "10000000-0000-4000-8000-000000000001";
    const fileId = "20000000-0000-4000-8000-000000000001";
    const client = {
      query: vi.fn(async (sql: string) => {
        const normalized = normalizeSql(sql);
        if (normalized.includes('FROM "testhistory"."upload_sessions"')) {
          return {
            rows: [
              {
                id: sessionId,
                launch_id: "00000000-0000-4000-8000-000000000101",
                path: "allure-results/result.json",
                status: "completed",
                total_chunks: 2,
                received_chunks: 2,
                total_bytes: "42",
                received_bytes: "42",
                expires_at: "2026-05-30T12:00:00.000Z",
                closed_at: "2026-05-30T11:00:00.000Z",
                cleanup: { reason: "completed", chunksClearedAt: "2026-05-30T11:01:00.000Z" },
                completed_job_id: "30000000-0000-4000-8000-000000000001",
                created_at: "2026-05-30T10:00:00.000Z",
                updated_at: "2026-05-30T11:00:00.000Z",
                deleted_at: null,
                version: 3
              }
            ]
          };
        }
        if (normalized.includes('FROM "testhistory"."upload_session_files"')) {
          return {
            rows: [
              {
                id: fileId,
                upload_session_id: sessionId,
                path: "allure-results/result.json",
                total_chunks: 2,
                received_chunks: 2,
                total_bytes: "42",
                received_bytes: "42",
                created_at: "2026-05-30T10:00:00.000Z",
                updated_at: "2026-05-30T10:02:00.000Z"
              }
            ]
          };
        }
        if (normalized.includes('FROM "testhistory"."upload_session_chunks"')) {
          return {
            rows: [
              {
                upload_session_file_id: fileId,
                chunk_index: 0,
                bytes: 21,
                sha256: "sha-0",
                object_key: "chunks/session/result/0",
                received_at: "2026-05-30T10:01:00.000Z"
              },
              {
                upload_session_file_id: fileId,
                chunk_index: 1,
                bytes: 21,
                sha256: "sha-1",
                object_key: "chunks/session/result/1",
                received_at: "2026-05-30T10:02:00.000Z"
              }
            ]
          };
        }
        return { rows: [] };
      })
    } as unknown as PostgresQueryable;

    const repositories = createPostgresRepositories(client, testConfig());

    await expect(repositories.uploadSessions.findById(sessionId)).resolves.toEqual(
      expect.objectContaining({
        id: sessionId,
        status: "completed",
        totalBytes: 42,
        receivedBytes: 42,
        completedJobId: "30000000-0000-4000-8000-000000000001",
        files: [
          expect.objectContaining({
            path: "allure-results/result.json",
            chunks: [
              expect.objectContaining({
                index: 0,
                bytes: 21,
                objectKey: "chunks/session/result/0"
              }),
              expect.objectContaining({ index: 1, bytes: 21, sha256: "sha-1" })
            ]
          })
        ]
      })
    );
  });

  it("claims queued upload jobs atomically with worker lease metadata", async () => {
    const job = uploadJobFixture();
    const claimedAt = "2026-05-30T10:00:00.000Z";
    const leaseExpiresAt = "2026-05-30T10:05:00.000Z";
    const claimToken = "claim-token-worker-a";
    const lease = {
      claimedBy: "worker-a",
      claimedAt,
      expiresAt: leaseExpiresAt,
      claimToken
    };
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        const normalized = normalizeSql(sql);

        expect(normalized).toContain("FOR UPDATE SKIP LOCKED");
        expect(normalized).toContain("status = 'queued'");
        expect(normalized).toContain("status = 'processing'");
        expect(normalized).toContain("lease->>'expiresAt' <= $2");
        expect(normalized).toContain('UPDATE "testhistory"."upload_jobs" upload_jobs');
        expect(params).toEqual(["chunked-session", claimedAt, 5, JSON.stringify(lease), claimedAt]);

        return {
          rows: [
            {
              id: job.id,
              launch_id: job.launchId,
              status: "processing",
              received_files: job.receivedFiles,
              imported_results: job.importedResults,
              duplicate_results: job.duplicateResults,
              stored_artifacts: job.storedArtifacts,
              errors: job.errors,
              lease,
              source: job.source,
              created_at: job.createdAt,
              updated_at: claimedAt,
              deleted_at: null,
              version: job.version + 1
            }
          ]
        };
      })
    } as unknown as PostgresQueryable;

    const repositories = createPostgresRepositories(client, testConfig());

    await expect(
      repositories.uploadJobs.claimQueued({
        source: "chunked-session",
        limit: 5,
        workerId: "worker-a",
        claimedAt,
        leaseExpiresAt,
        claimToken
      })
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: job.id,
          status: "processing",
          lease: expect.objectContaining({ claimedBy: "worker-a", claimToken })
        })
      ]
    });
  });

  it("upserts artifact descriptors with parameterized SQL and descriptor-only metadata", async () => {
    const client = createRecordingClient();
    const repositories = createPostgresRepositories(client, testConfig());
    const artifact = artifactDescriptorFixture();

    await repositories.artifacts.saveMany([artifact]);
    const firstSave = client.queries.map((query) => ({
      sql: query.sql,
      params: query.params
    }));

    await repositories.artifacts.save(artifact);
    const secondSave = client.queries.slice(firstSave.length).map((query) => ({
      sql: query.sql,
      params: query.params
    }));

    expect(firstSave).toEqual(secondSave);
    expect(firstSave[0]?.sql).toContain('INSERT INTO "testhistory"."artifacts"');
    expect(firstSave[0]?.sql).toContain("ON CONFLICT (id) DO UPDATE");
    expect(firstSave[0]?.params).toEqual([
      artifact.id,
      artifact.launchId,
      artifact.projectId,
      artifact.path,
      artifact.kind,
      artifact.contentType,
      artifact.originalBytes,
      artifact.storedBytes,
      artifact.sha256,
      artifact.compression,
      artifact.storageKey,
      JSON.stringify(artifact.storage),
      artifact.expiresAt,
      JSON.stringify(artifact.retention),
      JSON.stringify(artifact.cleanup),
      JSON.stringify(artifact.upload),
      artifact.createdAt,
      artifact.updatedAt,
      null,
      artifact.version
    ]);
    expect(JSON.stringify(firstSave)).not.toContain("supersecret");
    expect(JSON.stringify(firstSave)).not.toContain("signedUrl");
    expect(JSON.stringify(firstSave)).not.toContain("C:\\");
  });

  it("reads filtered artifact descriptor pages without exposing payload locations", async () => {
    const artifact = artifactDescriptorFixture();
    const projectId = artifact.projectId!;
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        const normalized = normalizeSql(sql);
        if (normalized.includes('FROM "testhistory"."artifacts"')) {
          expect(normalized).toContain("launch_id = $1");
          expect(normalized).toContain("project_id = $2");
          expect(normalized).toContain("kind = $3");
          expect(normalized).toContain("LIMIT $4 OFFSET $5");
          expect(params).toEqual([artifact.launchId, projectId, artifact.kind, 3, 2]);
          return {
            rows: [
              {
                id: artifact.id,
                launch_id: artifact.launchId,
                project_id: projectId,
                path: artifact.path,
                kind: artifact.kind,
                content_type: artifact.contentType,
                original_bytes: String(artifact.originalBytes),
                stored_bytes: String(artifact.storedBytes),
                sha256: artifact.sha256,
                compression: artifact.compression,
                storage_key: artifact.storageKey,
                storage: artifact.storage,
                expires_at: artifact.expiresAt,
                retention: artifact.retention,
                cleanup: artifact.cleanup,
                upload: artifact.upload,
                created_at: artifact.createdAt,
                updated_at: artifact.updatedAt,
                deleted_at: null,
                version: artifact.version
              },
              {
                id: "artifact-console",
                launch_id: artifact.launchId,
                project_id: projectId,
                path: "allure-results/browser-console.log",
                kind: "log",
                content_type: "text/plain",
                original_bytes: "1024",
                stored_bytes: "512",
                sha256: "sha256-console",
                compression: "gzip",
                storage_key: "artifact/project/launch/browser-console.log.gz",
                storage: {
                  provider: "s3-compatible",
                  bucketRef: "artifacts",
                  objectKeyRedacted: true
                },
                expires_at: artifact.expiresAt,
                retention: artifact.retention,
                cleanup: artifact.cleanup,
                upload: artifact.upload,
                created_at: "2026-05-30T10:11:00.000Z",
                updated_at: "2026-05-30T10:11:00.000Z",
                deleted_at: null,
                version: 1
              },
              {
                id: "artifact-next-page-sentinel",
                launch_id: artifact.launchId,
                project_id: projectId,
                path: "allure-results/next-page.bin",
                kind: "attachment",
                content_type: "application/octet-stream",
                original_bytes: "1",
                stored_bytes: "1",
                sha256: "sha256-next",
                compression: "none",
                storage_key: "artifact/project/launch/next-page.bin",
                storage: {
                  provider: "s3-compatible",
                  bucketRef: "artifacts",
                  objectKeyRedacted: true
                },
                expires_at: artifact.expiresAt,
                retention: artifact.retention,
                cleanup: artifact.cleanup,
                upload: artifact.upload,
                created_at: "2026-05-30T10:12:00.000Z",
                updated_at: "2026-05-30T10:12:00.000Z",
                deleted_at: null,
                version: 1
              }
            ]
          };
        }
        return { rows: [] };
      })
    } as unknown as PostgresQueryable;

    const repositories = createPostgresRepositories(client, testConfig());

    await expect(
      repositories.artifacts.list({
        launchId: artifact.launchId,
        projectId,
        kind: artifact.kind,
        limit: 2,
        cursor: "2"
      })
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: artifact.id,
          originalBytes: artifact.originalBytes,
          storedBytes: artifact.storedBytes,
          storage: expect.objectContaining({ objectKeyRedacted: true })
        }),
        expect.objectContaining({
          id: "artifact-console",
          originalBytes: 1024,
          storedBytes: 512
        })
      ],
      nextCursor: "4"
    });
    expect(JSON.stringify(vi.mocked(client.query).mock.calls)).not.toContain("signedUrl");
    expect(JSON.stringify(vi.mocked(client.query).mock.calls)).not.toContain("supersecret");
  });

  it("upserts manual test cases with stable parameterized SQL", async () => {
    const client = createRecordingClient();
    const repositories = createPostgresRepositories(client, testConfig());
    const testCase = testCaseFixture();

    await repositories.testCases.save(testCase);
    const firstSave = client.queries.map((query) => ({
      sql: query.sql,
      params: query.params
    }));

    await repositories.testCases.save(testCase);
    const secondSave = client.queries.slice(firstSave.length).map((query) => ({
      sql: query.sql,
      params: query.params
    }));

    expect(firstSave).toEqual(secondSave);
    expect(firstSave[0]?.sql).toContain('INSERT INTO "testhistory"."test_cases"');
    expect(firstSave[0]?.sql).toContain("AS existing");
    expect(firstSave[0]?.sql).toContain("ON CONFLICT (id) DO UPDATE");
    expect(firstSave[0]?.sql).toContain("WHERE existing.project_id = EXCLUDED.project_id");
    expect(firstSave[0]?.params).toEqual([
      testCase.id,
      testCase.projectId,
      testCase.allureId,
      testCase.name,
      testCase.fullName,
      testCase.workflowStatus,
      testCase.tags,
      testCase.layer,
      testCase.description,
      JSON.stringify(testCase.customFields),
      testCase.members,
      JSON.stringify(testCase.links),
      testCase.issues,
      testCase.testKeys,
      testCase.relations,
      testCase.scenario,
      testCase.expectedResult,
      testCase.createdAt,
      testCase.updatedAt,
      null,
      testCase.version
    ]);
    expect(JSON.stringify(firstSave)).not.toContain("supersecret");
    expect(JSON.stringify(firstSave)).not.toContain("never-store-me");
  });

  it("reads paged project test cases and preserves optional manual fields", async () => {
    const testCase = testCaseFixture();
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        const normalized = normalizeSql(sql);
        if (normalized.includes('FROM "testhistory"."test_cases"')) {
          expect(normalized).toContain("project_id = $1");
          expect(normalized).toContain("LIMIT $2 OFFSET $3");
          expect(params).toEqual([testCase.projectId, 3, 5]);
          return {
            rows: [
              {
                id: testCase.id,
                project_id: testCase.projectId,
                allure_id: testCase.allureId,
                name: testCase.name,
                full_name: testCase.fullName,
                workflow_status: testCase.workflowStatus,
                tags: testCase.tags,
                layer: testCase.layer,
                description: testCase.description,
                custom_fields: testCase.customFields,
                members: testCase.members,
                links: testCase.links,
                issues: testCase.issues,
                test_keys: testCase.testKeys,
                relations: testCase.relations,
                scenario: testCase.scenario,
                expected_result: testCase.expectedResult,
                created_at: testCase.createdAt,
                updated_at: testCase.updatedAt,
                deleted_at: null,
                version: testCase.version
              },
              {
                id: "case-without-optionals",
                project_id: testCase.projectId,
                allure_id: null,
                name: "Кейс без необязательных полей",
                full_name: null,
                workflow_status: "draft",
                tags: [],
                layer: null,
                description: null,
                custom_fields: {},
                members: [],
                links: [],
                issues: [],
                test_keys: [],
                relations: [],
                scenario: null,
                expected_result: null,
                created_at: "2026-05-30T11:00:00.000Z",
                updated_at: "2026-05-30T11:00:00.000Z",
                deleted_at: null,
                version: 1
              },
              {
                id: "case-next-page-sentinel",
                project_id: testCase.projectId,
                allure_id: null,
                name: "Следующая страница",
                full_name: null,
                workflow_status: "active",
                tags: [],
                layer: null,
                description: null,
                custom_fields: {},
                members: [],
                links: [],
                issues: [],
                test_keys: [],
                relations: [],
                scenario: null,
                expected_result: null,
                created_at: "2026-05-30T11:01:00.000Z",
                updated_at: "2026-05-30T11:01:00.000Z",
                deleted_at: null,
                version: 1
              }
            ]
          };
        }
        return { rows: [] };
      })
    } as unknown as PostgresQueryable;

    const repositories = createPostgresRepositories(client, testConfig());

    await expect(
      repositories.testCases.listByProject(testCase.projectId, { limit: 2, cursor: "5" })
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: testCase.id,
          allureId: testCase.allureId,
          scenario: testCase.scenario,
          expectedResult: testCase.expectedResult
        }),
        expect.objectContaining({
          id: "case-without-optionals",
          tags: [],
          links: []
        })
      ],
      nextCursor: "7"
    });
  });

  it("finds a test case by scoped id without querying tenant data by unsafe strings", async () => {
    const testCase = testCaseFixture();
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        const normalized = normalizeSql(sql);
        if (normalized.includes('FROM "testhistory"."test_cases"')) {
          expect(normalized).toContain("WHERE project_id = $1 AND id = $2 AND deleted_at IS NULL");
          expect(params).toEqual([testCase.projectId, testCase.id]);
          return {
            rows: [
              {
                id: testCase.id,
                project_id: testCase.projectId,
                allure_id: testCase.allureId,
                name: testCase.name,
                full_name: testCase.fullName,
                workflow_status: testCase.workflowStatus,
                tags: testCase.tags,
                layer: testCase.layer,
                description: testCase.description,
                custom_fields: testCase.customFields,
                members: testCase.members,
                links: testCase.links,
                issues: testCase.issues,
                test_keys: testCase.testKeys,
                relations: testCase.relations,
                scenario: testCase.scenario,
                expected_result: testCase.expectedResult,
                created_at: testCase.createdAt,
                updated_at: testCase.updatedAt,
                deleted_at: null,
                version: testCase.version
              }
            ]
          };
        }
        return { rows: [] };
      })
    } as unknown as PostgresQueryable;

    const repositories = createPostgresRepositories(client, testConfig());

    await expect(repositories.testCases.findById(testCase.projectId, testCase.id)).resolves.toEqual(
      expect.objectContaining({
        id: testCase.id,
        projectId: testCase.projectId,
        name: testCase.name,
        customFields: testCase.customFields
      })
    );
    expect(JSON.stringify(vi.mocked(client.query).mock.calls)).not.toContain("supersecret");
  });

  it("upserts test case history attempts with sanitized parameter metadata", async () => {
    const client = createRecordingClient();
    const repositories = createPostgresRepositories(client, testConfig());
    const attempt = testCaseHistoryAttemptFixture();

    await repositories.testCaseHistory.saveMany([attempt]);
    const firstSave = client.queries.map((query) => ({
      sql: query.sql,
      params: query.params
    }));

    await repositories.testCaseHistory.saveMany([attempt]);
    const secondSave = client.queries.slice(firstSave.length).map((query) => ({
      sql: query.sql,
      params: query.params
    }));

    expect(firstSave).toEqual(secondSave);
    expect(firstSave[0]?.sql).toContain('INSERT INTO "testhistory"."test_case_history_versions"');
    expect(firstSave[0]?.sql).toContain(
      "ON CONFLICT (test_case_id, launch_id, result_uuid, attempt_index) DO UPDATE"
    );
    expect(firstSave[0]?.params).toEqual([
      attempt.id,
      attempt.testCaseId,
      attempt.projectId,
      attempt.launchId,
      attempt.resultUuid,
      attempt.status,
      attempt.seenAt,
      attempt.historyId,
      attempt.attemptIndex,
      attempt.attemptNumber,
      attempt.attemptKey,
      attempt.parameterVariantSignature,
      JSON.stringify([
        { name: "browser", value: "chromium" },
        { name: "apiToken", mode: "hidden" },
        { name: "password", mode: "masked", value: "***" }
      ]),
      true,
      true,
      attempt.startedAt,
      attempt.stoppedAt,
      JSON.stringify(attempt.statusDetails),
      attempt.createdAt,
      attempt.updatedAt,
      null,
      attempt.version
    ]);
    expect(JSON.stringify(firstSave)).not.toContain("never-store-me");
    expect(JSON.stringify(firstSave)).not.toContain("also-never-store-me");
    expect(JSON.stringify(firstSave)).not.toContain("supersecret");
  });

  it("reads ordered test case history attempts from PostgreSQL rows", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        const normalized = normalizeSql(sql);
        if (normalized.includes('FROM "testhistory"."test_case_history_versions"')) {
          return {
            rows: [
              {
                id: "case-login:launch-1:result-1:0",
                test_case_id: "case-login",
                project_id: "00000000-0000-4000-8000-000000000201",
                launch_id: "00000000-0000-4000-8000-000000000301",
                result_uuid: "result-1",
                status: "failed",
                seen_at: "2026-05-30T10:00:00.000Z",
                history_id: "history-login",
                attempt_index: 0,
                attempt_number: 1,
                attempt_key: "historyId:history-login::parameters:browser",
                parameter_variant_signature: '[{"name":"browser","value":"chromium"}]',
                parameters: [{ name: "apiToken", mode: "hidden", value: "never-store-me" }],
                retry: false,
                flaky: false,
                started_at_millis: "1770000000000",
                stopped_at_millis: "1770000002500",
                status_details: { message: "Expected dashboard" },
                created_at: "2026-05-30T10:00:00.000Z",
                updated_at: "2026-05-30T10:01:00.000Z",
                deleted_at: null,
                version: 2
              },
              {
                id: "case-login:launch-1:result-2:1",
                test_case_id: "case-login",
                project_id: "00000000-0000-4000-8000-000000000201",
                launch_id: "00000000-0000-4000-8000-000000000301",
                result_uuid: "result-2",
                status: "passed",
                seen_at: "2026-05-30T10:03:00.000Z",
                history_id: "history-login",
                attempt_index: 1,
                attempt_number: 2,
                attempt_key: "historyId:history-login::parameters:browser",
                parameter_variant_signature: '[{"name":"browser","value":"chromium"}]',
                parameters: [{ name: "password", mode: "masked", value: "also-never-store-me" }],
                retry: true,
                flaky: true,
                started_at_millis: "1770000003000",
                stopped_at_millis: "1770000004100",
                status_details: { flaky: true },
                created_at: "2026-05-30T10:03:00.000Z",
                updated_at: "2026-05-30T10:04:00.000Z",
                deleted_at: null,
                version: 1
              }
            ]
          };
        }
        return { rows: [] };
      })
    } as unknown as PostgresQueryable;

    const repositories = createPostgresRepositories(client, testConfig());

    await expect(repositories.testCaseHistory.listByTestCase("case-login")).resolves.toEqual({
      items: [
        expect.objectContaining({
          resultUuid: "result-1",
          attemptIndex: 0,
          attemptNumber: 1,
          retry: false,
          flaky: false,
          startedAt: 1770000000000,
          parameters: [{ name: "apiToken", mode: "hidden" }]
        }),
        expect.objectContaining({
          resultUuid: "result-2",
          attemptIndex: 1,
          attemptNumber: 2,
          retry: true,
          flaky: true,
          stoppedAt: 1770000004100,
          parameters: [{ name: "password", mode: "masked", value: "***" }]
        })
      ]
    });
  });

  it("upserts identity correction audit events by dedupe key without retry inflation", async () => {
    const client = createRecordingClient();
    const repositories = createPostgresRepositories(client, testConfig());
    const repository = repositories.identityCorrectionAudit;
    const event = identityCorrectionAuditFixture();

    expect(repository).toBeDefined();
    await repository?.saveMany([event]);
    const firstSave = client.queries.map((query) => ({
      sql: query.sql,
      params: query.params
    }));

    await repository?.saveMany([event]);
    const secondSave = client.queries.slice(firstSave.length).map((query) => ({
      sql: query.sql,
      params: query.params
    }));

    expect(firstSave).toEqual(secondSave);
    expect(firstSave[0]?.sql).toContain(
      'INSERT INTO "testhistory"."identity_correction_audit_events"'
    );
    expect(firstSave[0]?.sql).toContain("ON CONFLICT (dedupe_key) DO NOTHING");
    expect(firstSave[0]?.params).toEqual([
      event.id,
      event.dedupeKey,
      event.projectId,
      event.kind,
      event.source,
      event.confidence,
      JSON.stringify(event.origin),
      event.reason,
      event.beforeIds,
      event.afterIds,
      JSON.stringify(event.scope),
      JSON.stringify(event.evidence),
      event.occurredAt,
      event.createdAt,
      event.updatedAt,
      null,
      event.version
    ]);
    expect(JSON.stringify(firstSave)).not.toContain("supersecret");
  });

  it("reads identity correction audit events with parameter variant filters", async () => {
    const event = identityCorrectionAuditFixture();
    const client = {
      query: vi.fn(async (sql: string) => {
        const normalized = normalizeSql(sql);
        if (normalized.includes('FROM "testhistory"."identity_correction_audit_events"')) {
          return {
            rows: [
              {
                id: event.id,
                dedupe_key: event.dedupeKey,
                project_id: event.projectId,
                kind: event.kind,
                source: event.source,
                confidence: event.confidence,
                origin: event.origin,
                reason: event.reason,
                before_ids: event.beforeIds,
                after_ids: event.afterIds,
                scope: event.scope,
                evidence: event.evidence,
                occurred_at: event.occurredAt,
                created_at: event.createdAt,
                updated_at: event.updatedAt,
                deleted_at: null,
                version: event.version
              }
            ]
          };
        }
        return { rows: [] };
      })
    } as unknown as PostgresQueryable;

    const repositories = createPostgresRepositories(client, testConfig());
    const repository = repositories.identityCorrectionAudit;

    expect(repository).toBeDefined();
    await expect(
      repository?.listByProject(event.projectId, {
        kind: "conservative_link",
        beforeId: "history:login",
        afterId: "case:login",
        parameterVariantSignature: '[{"name":"browser","value":"chromium"}]'
      })
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: event.id,
          dedupeKey: event.dedupeKey,
          scope: expect.objectContaining({
            parameterVariantSignature: '[{"name":"browser","value":"chromium"}]'
          })
        })
      ]
    });
    expect(normalizeSql(String(vi.mocked(client.query).mock.calls[0]?.[0]))).toContain(
      "scope->>'parameterVariantSignature' = $5"
    );
  });

  it("upserts cleanup rules with stable parameterized SQL and no execution claims", async () => {
    const client = createRecordingClient();
    const repositories = createPostgresRepositories(client, testConfig());
    const rule = cleanupRuleFixture();

    await repositories.cleanupRules.save(rule);
    const firstSave = client.queries.map((query) => ({
      sql: query.sql,
      params: query.params
    }));

    await repositories.cleanupRules.save(rule);
    const secondSave = client.queries.slice(firstSave.length).map((query) => ({
      sql: query.sql,
      params: query.params
    }));

    expect(firstSave).toEqual(secondSave);
    expect(firstSave[0]?.sql).toContain('INSERT INTO "testhistory"."cleanup_rules"');
    expect(firstSave[0]?.sql).toContain("AS existing");
    expect(firstSave[0]?.sql).toContain("ON CONFLICT (id) DO UPDATE");
    expect(firstSave[0]?.sql).toContain("WHERE existing.scope = EXCLUDED.scope");
    expect(firstSave[0]?.params).toEqual([
      rule.id,
      rule.target,
      JSON.stringify(rule.scope),
      rule.enabled,
      JSON.stringify(rule.selector),
      rule.action,
      rule.graceSeconds,
      rule.createdAt,
      rule.updatedAt,
      null,
      rule.version
    ]);
    expect(JSON.stringify(firstSave)).not.toContain("supersecret");
    expect(JSON.stringify(firstSave)).not.toContain("signedUrl");
    expect(JSON.stringify(firstSave)).not.toContain("C:\\Users");
  });

  it("reads active cleanup rules with optional target filter and deleted rules excluded", async () => {
    const rule = cleanupRuleFixture();
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        const normalized = normalizeSql(sql);
        if (normalized.includes('FROM "testhistory"."cleanup_rules"')) {
          expect(normalized).toContain("enabled = true AND deleted_at IS NULL");
          expect(normalized).toContain("target = $1");
          expect(normalized).toContain("scope->>'type' = 'global'");
          expect(normalized).toContain("scope->>'projectId' = $2");
          expect(normalized).toContain("ORDER BY target ASC, id ASC");
          expect(params).toEqual([rule.target, "00000000-0000-4000-8000-000000000201"]);
          return {
            rows: [
              {
                id: rule.id,
                target: rule.target,
                scope: rule.scope,
                enabled: rule.enabled,
                selector: rule.selector,
                action: rule.action,
                grace_seconds: rule.graceSeconds,
                created_at: rule.createdAt,
                updated_at: rule.updatedAt,
                deleted_at: null,
                version: rule.version
              }
            ]
          };
        }
        return { rows: [] };
      })
    } as unknown as PostgresQueryable;

    const repositories = createPostgresRepositories(client, testConfig());

    await expect(
      repositories.cleanupRules.listActive({
        target: "artifact",
        projectId: "00000000-0000-4000-8000-000000000201"
      })
    ).resolves.toEqual([
      expect.objectContaining({
        id: rule.id,
        target: "artifact",
        scope: rule.scope,
        selector: rule.selector,
        graceSeconds: rule.graceSeconds
      })
    ]);
    expect(JSON.stringify(vi.mocked(client.query).mock.calls)).not.toContain("supersecret");
  });

  it("finds cleanup rules by id without interpolating selectors or paths", async () => {
    const rule = cleanupRuleFixture();
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        const normalized = normalizeSql(sql);
        if (normalized.includes('FROM "testhistory"."cleanup_rules"')) {
          expect(normalized).toContain("WHERE id = $1 AND deleted_at IS NULL");
          expect(normalized).toContain("scope->>'type' = 'global'");
          expect(normalized).toContain("scope->>'projectId' = $2");
          expect(params).toEqual([rule.id, "00000000-0000-4000-8000-000000000201"]);
          return {
            rows: [
              {
                id: rule.id,
                target: rule.target,
                scope: rule.scope,
                enabled: rule.enabled,
                selector: rule.selector,
                action: rule.action,
                grace_seconds: rule.graceSeconds,
                created_at: rule.createdAt,
                updated_at: rule.updatedAt,
                deleted_at: null,
                version: rule.version
              }
            ]
          };
        }
        return { rows: [] };
      })
    } as unknown as PostgresQueryable;

    const repositories = createPostgresRepositories(client, testConfig());

    await expect(
      repositories.cleanupRules.findById(rule.id, {
        projectId: "00000000-0000-4000-8000-000000000201"
      })
    ).resolves.toEqual(
      expect.objectContaining({
        id: rule.id,
        action: "mark_eligible",
        enabled: true
      })
    );
    expect(JSON.stringify(vi.mocked(client.query).mock.calls)).not.toContain("signedUrl");
    expect(JSON.stringify(vi.mocked(client.query).mock.calls)).not.toContain("C:\\Users");
  });

  it("redacts PostgreSQL connection strings before they can be logged", () => {
    expect(
      redactPostgresConnectionString("postgres://test:supersecret@db.internal:5432/testhistory")
    ).toBe("postgres://test:REDACTED@db.internal:5432/testhistory");
  });
});
