import type {
  PersistentArtifact,
  PersistentCleanupRule,
  PersistentIdentityCorrectionAuditEvent,
  PersistentTestCase,
  PersistentTestCaseHistoryVersion,
  PersistentUploadJob,
  PersistentUploadSession
} from "@testhistory/domain";
import { createIdentityCorrectionAuditEvent } from "@testhistory/domain";
import { vi } from "vitest";
import type { PostgresPersistenceConfig, PostgresQueryable } from "./index.js";

export type RecordedQuery = {
  sql: string;
  params: unknown[];
};

export function testConfig(): PostgresPersistenceConfig {
  return {
    driver: "postgres",
    connectionString: "postgres://test:supersecret@db.internal:5432/testhistory",
    schema: "testhistory",
    migrationsTable: "schema_migrations",
    advisoryLockKey: 92_605_300,
    requireSsl: false
  };
}

export function createRecordingClient(): PostgresQueryable & { queries: RecordedQuery[] } {
  const queries: RecordedQuery[] = [];
  return {
    queries,
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql: normalizeSql(sql), params });
      return { rows: [] };
    })
  } as unknown as PostgresQueryable & { queries: RecordedQuery[] };
}

export function uploadSessionFixture(): PersistentUploadSession {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    launchId: "00000000-0000-4000-8000-000000000101",
    path: "allure-results/result.json",
    status: "completed",
    totalChunks: 2,
    receivedChunks: 2,
    totalBytes: 42,
    receivedBytes: 42,
    files: [
      {
        path: "allure-results/result.json",
        totalChunks: 2,
        receivedChunks: 2,
        totalBytes: 42,
        receivedBytes: 42,
        chunks: [
          {
            index: 0,
            bytes: 21,
            sha256: "sha-0",
            objectKey: "chunks/session/result/0",
            receivedAt: "2026-05-30T10:01:00.000Z"
          },
          {
            index: 1,
            bytes: 21,
            sha256: "sha-1",
            objectKey: "chunks/session/result/1",
            receivedAt: "2026-05-30T10:02:00.000Z"
          }
        ]
      }
    ],
    expiresAt: "2026-05-30T12:00:00.000Z",
    closedAt: "2026-05-30T11:00:00.000Z",
    completedJobId: "30000000-0000-4000-8000-000000000001",
    cleanup: { reason: "completed", chunksClearedAt: "2026-05-30T11:01:00.000Z" },
    createdAt: "2026-05-30T10:00:00.000Z",
    updatedAt: "2026-05-30T11:00:00.000Z",
    version: 3
  };
}

export function uploadJobFixture(): PersistentUploadJob {
  return {
    id: "30000000-0000-4000-8000-000000000001",
    launchId: "00000000-0000-4000-8000-000000000101",
    status: "queued",
    receivedFiles: 4,
    importedResults: 0,
    duplicateResults: 0,
    storedArtifacts: 0,
    errors: [],
    source: {
      mode: "chunked-session",
      sessionId: "10000000-0000-4000-8000-000000000001",
      payloadAvailable: true
    },
    createdAt: "2026-05-30T09:59:00.000Z",
    updatedAt: "2026-05-30T09:59:00.000Z",
    version: 1
  };
}

export function artifactDescriptorFixture(): PersistentArtifact {
  return {
    id: "artifact-screenshot",
    launchId: "00000000-0000-4000-8000-000000000101",
    projectId: "00000000-0000-4000-8000-000000000201",
    path: "allure-results/screenshot-after-submit.png",
    kind: "screenshot",
    contentType: "image/png",
    originalBytes: 493568,
    storedBytes: 128432,
    sha256: "sha256-auth-screenshot-synthetic",
    compression: "gzip",
    storageKey: "artifact/project/launch/screenshot-after-submit.png.gz",
    storage: {
      provider: "s3-compatible",
      bucketRef: "artifacts",
      objectKeyRedacted: true,
      descriptorOnly: true
    },
    expiresAt: "2026-08-30T10:00:00.000Z",
    retention: {
      policyClass: "evidence-retained",
      cleanupEligible: false,
      reason: "failure-evidence"
    },
    cleanup: {
      eligible: false,
      dryRunOnly: true,
      deletionStarted: false
    },
    upload: {
      uploadJobId: "30000000-0000-4000-8000-000000000001",
      sourcePath: "allure-results/screenshot-after-submit.png",
      descriptorOnly: true
    },
    createdAt: "2026-05-30T10:10:00.000Z",
    updatedAt: "2026-05-30T10:10:00.000Z",
    version: 1
  };
}

export function testCaseFixture(): PersistentTestCase {
  return {
    id: "case-login",
    projectId: "00000000-0000-4000-8000-000000000201",
    allureId: "483420",
    name: "Авторизация по логину и паролю",
    fullName: "web.auth.SignInTest.authenticate",
    workflowStatus: "active",
    tags: ["login", "smoke"],
    layer: "E2E",
    description: "Проверяет вход пользователя без сохранения секретов.",
    customFields: {
      priority: "P0",
      component: "Identity"
    },
    members: ["Platform QA"],
    links: [{ name: "Story AUTH-41", url: "https://tracker.example/AUTH-41", type: "story" }],
    issues: ["AUTH-912"],
    testKeys: ["AUTH-TC-102"],
    relations: ["case-lockout"],
    scenario: "1. Открыть страницу входа\n2. Ввести логин\n3. Ввести пароль",
    expectedResult: "Пользователь попадает в рабочую область.",
    createdAt: "2026-05-30T10:00:00.000Z",
    updatedAt: "2026-05-30T10:05:00.000Z",
    version: 4
  };
}

export function testCaseHistoryAttemptFixture(): PersistentTestCaseHistoryVersion {
  return {
    id: "case-login:launch-1:result-2:1",
    testCaseId: "case-login",
    projectId: "00000000-0000-4000-8000-000000000201",
    launchId: "00000000-0000-4000-8000-000000000301",
    resultUuid: "result-2",
    status: "passed",
    seenAt: "2026-05-30T10:03:00.000Z",
    historyId: "history-login",
    attemptIndex: 1,
    attemptNumber: 2,
    attemptKey: "historyId:history-login::parameters:browser",
    parameterVariantSignature: '[{"name":"browser","value":"chromium"}]',
    parameters: [
      { name: "browser", value: "chromium" },
      { name: "apiToken", mode: "hidden", value: "never-store-me" },
      { name: "password", mode: "masked", value: "also-never-store-me" }
    ],
    retry: true,
    flaky: true,
    startedAt: 1770000003000,
    stoppedAt: 1770000004100,
    statusDetails: { flaky: true, message: "Passed on retry" },
    createdAt: "2026-05-30T10:03:00.000Z",
    updatedAt: "2026-05-30T10:04:00.000Z",
    version: 1
  };
}

export function cleanupRuleFixture(): PersistentCleanupRule {
  return {
    id: "artifact-retention-mark-eligible",
    target: "artifact",
    scope: { type: "project", projectId: "00000000-0000-4000-8000-000000000201" },
    enabled: true,
    selector: {
      expiresAt: "lte:now",
      retentionClass: "failed-result-attachments",
      maxBatch: 500
    },
    action: "mark_eligible",
    graceSeconds: 604800,
    createdAt: "2026-05-30T12:00:00.000Z",
    updatedAt: "2026-05-30T12:05:00.000Z",
    version: 3
  };
}

export function identityCorrectionAuditFixture(): PersistentIdentityCorrectionAuditEvent {
  const event = createIdentityCorrectionAuditEvent({
    projectId: "00000000-0000-4000-8000-000000000201",
    kind: "conservative_link",
    source: "historyId",
    confidence: "medium",
    origin: { type: "system", name: "identity-reconciler" },
    reason: "Conservatively link observed history id to explicit test case id.",
    beforeIds: ["history:login"],
    afterIds: ["case:login"],
    scope: {
      launchId: "00000000-0000-4000-8000-000000000301",
      historyId: "history-login",
      parameterVariantSignature: '[{"name":"browser","value":"chromium"}]'
    },
    evidence: [
      {
        launchId: "00000000-0000-4000-8000-000000000301",
        resultUuid: "result-failed",
        historyId: "history-login",
        attemptIndex: 0,
        parameterVariantSignature: '[{"name":"browser","value":"chromium"}]'
      },
      {
        launchId: "00000000-0000-4000-8000-000000000301",
        resultUuid: "result-passed",
        historyId: "history-login",
        attemptIndex: 1,
        parameterVariantSignature: '[{"name":"browser","value":"chromium"}]'
      }
    ],
    occurredAt: "2026-05-30T10:00:00.000Z"
  });

  return {
    ...event,
    createdAt: "2026-05-30T10:00:00.000Z",
    updatedAt: "2026-05-30T10:00:00.000Z",
    version: 1
  };
}

export function normalizeSql(sql: string): string {
  return sql.trim().replace(/\s+/g, " ");
}
