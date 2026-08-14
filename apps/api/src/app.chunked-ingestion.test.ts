import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  createArtifactPreviewDescriptor,
  createArtifactPreviewDescriptorPersistenceRecord,
  type ArtifactDescriptor,
  type ArtifactPreviewDescriptorRetentionPolicyClass,
  type ArtifactResultStatus,
  type ArtifactRetentionClass
} from "@testhistory/artifacts";
import type { Launch as DomainLaunch } from "@testhistory/domain";
import { afterEach, describe, expect, it } from "vitest";
import { createApiApp } from "./app.js";
import { createAppStore, type Launch, type UploadJob } from "./store.js";

import {
  archiveJobReadSnapshot,
  buildSyntheticPosixArtifactPath,
  buildSyntheticPosixArtifactRoot,
  buildSyntheticWindowsDownloadRoot,
  createLaunch,
  createProject,
  createProjectLaunch,
  expectPersistedInvariantNoLeakage,
  expectSafeArtifactMetadata,
  expectSafeChunkedUploadReadModel,
  previewRetentionArtifact
} from "./appTestHelpers.js";
type ProjectResponse = {
  id: string;
  key: string;
  name: string;
  artifactRetention?: {
    attachmentRetentionDays: number;
    cleanupGraceDays: number;
    compressRetainedTextArtifacts: boolean;
    deleteBinaryArtifactsAfterRetention: boolean;
    updatedAt?: string;
  };
};

type LaunchResponse = {
  id: string;
  projectId: string;
  name: string;
  counters: Record<string, number>;
};

type ListResponse<T> = {
  kind: string;
  page: {
    limit: number;
    cursor: string | null;
    offset: number;
    returned: number;
    total: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
  items: T[];
};

function extractOpenApiPathSection(openApi: string, path: string): string {
  const start = openApi.indexOf(`  ${path}:\n`);

  expect(start, `${path} should exist in static OpenAPI`).toBeGreaterThanOrEqual(0);

  const rest = openApi.slice(start + 1);
  const nextPath = rest.search(/\n  \//);
  return nextPath === -1 ? rest : rest.slice(0, nextPath);
}

type QualityGateEvaluationResponse = {
  status: "passed" | "warning" | "failed";
  rawStatus: "passed" | "warning" | "failed";
  metrics: Record<string, number>;
  statusCounters: Record<string, number>;
  reasons: Array<{
    code: string;
    metric: string;
    severity: "warn" | "fail";
    passed: boolean;
    effectivePassed: boolean;
    actual: number;
    effectiveActual: number;
    op: "lte" | "gte";
    threshold: number;
    explanation: string;
    affectedTestCaseIds: string[];
    affectedResultUuids: string[];
    effects: Array<{
      type: "defect_mute";
      ruleCode: string;
      reasonCode: string;
      muteIds: string[];
      affectedTestCaseIds: string[];
      affectedSignatureHashes: string[];
      originalActual: number;
      effectiveActual: number;
      explanation: string;
    }>;
  }>;
  effects: Array<{
    type: "defect_mute";
    ruleCode: string;
    reasonCode: string;
    muteIds: string[];
    affectedTestCaseIds: string[];
    affectedSignatureHashes: string[];
    originalActual: number;
    effectiveActual: number;
    explanation: string;
  }>;
  violations: Array<{
    actual: number;
    expected: number;
  }>;
};

type SecurityAuditExportEvaluationResponse = {
  kind: "security-audit-export-policy-evaluation";
  projectId: string;
  actor: { type: "actor"; actorId: string; scoped: boolean };
  access: {
    scope: "security:audit:read";
    projectScoped: boolean;
    actorScoped: boolean;
    mutation: boolean;
    redacted: boolean;
  };
  execution: {
    exportStarted: boolean;
    providerIntegration: boolean;
    credentialsResolved: boolean;
    destinationType: "placeholder";
  };
  decision: {
    schemaVersion: 1;
    status: "allowed" | "denied";
    allowed: boolean;
    request: {
      projectId: string;
      actorId: string;
      requestedAt: string;
      range: { from: string; to: string; days: number };
      destination: { type: "placeholder"; secretRef?: string };
      format: "jsonl" | "csv";
      criteria?: unknown;
    };
    limits: { maxRangeDays: number };
    reasons: Array<{ code: string; severity: "info" | "deny"; fields: string[] }>;
  };
};

type SecurityAuditExportLifecycleReplayInvariantResponse = {
  kind: "security-audit-export-lifecycle-replay-invariants";
  project: { id: string; scoped: boolean };
  actor: { id: string; scoped: boolean };
  access: {
    scope: "security:audit:read";
    projectScoped: boolean;
    actorScoped: boolean;
    mutation: boolean;
    redacted: boolean;
  };
  replay: {
    status: "empty" | "replayed";
    eventCount: number;
    requestCount: number;
    ignoredCount: number;
    projectionDigest: string;
    appendOnly: boolean;
    deterministic: boolean;
    recomputable: boolean;
    rawEventsExposed: boolean;
    rawRequestsExposed: boolean;
    providerNeutral: boolean;
  };
  execution: {
    exportStarted: boolean;
    providerIntegration: boolean;
    providerEndpointContacted: boolean;
    credentialsResolved: boolean;
    signedUrlsIssued: boolean;
    destinationResolved: boolean;
  };
  page: {
    limit: number;
    cursor: string | null;
    offset: number;
    returned: number;
    total: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
  summary: Record<string, number>;
  invariants: Record<string, boolean>;
  items: Array<{
    requestId: string;
    status: string;
    eventCount: number;
    actorIds: string[];
    decisionStatus?: string;
    reasonCodes: string[];
  }>;
};

type ArchiveDiagnosticReplayFixtureListResponse = {
  kind: "archive-diagnostic-replay-fixture-list";
  project: { id: string; scoped: boolean };
  actor: { id: string; scoped: boolean };
  access: {
    scope: "uploads:read";
    projectScoped: boolean;
    actorScoped: boolean;
    mutation: boolean;
    redacted: boolean;
  };
  page: {
    limit: number;
    cursor: string | null;
    offset: number;
    returned: number;
    total: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
  summary: {
    totalFixtures: number;
    fixtureNames: string[];
    supportedFiles: number;
    attachmentFiles: number;
    ignoredFiles: number;
    warningCount: number;
    parseErrors: number;
    attemptGroups: number;
    readOnly: boolean;
    mutation: boolean;
    archivePayloadAvailable: boolean;
    rawManifestEntriesReturned: boolean;
    rawResultFilesReturned: boolean;
    resultContentReturned: boolean;
    rawPathsReturned: boolean;
    payloadBytesReturned: number;
    redacted: boolean;
  };
  items: Array<{
    kind: "archive-diagnostic-replay-fixture";
    projectId: string;
    fixtureRef: string;
    name: string;
    scenario: string;
    expected: {
      supportedFiles: number;
      attachmentFiles: number;
      ignoredFiles: number;
      warningCount: number;
      parseErrors: number;
      attemptGroups: number;
      latestStatuses: string[];
    };
    replay: {
      deterministic: boolean;
      compatibleSources: string[];
      retryAware: boolean;
      duplicateAware: boolean;
      deniedFixture: boolean;
      closedArchiveStatusReadCompatible: boolean;
      closedArchiveDiagnosticsReadCompatible: boolean;
      mutationBoundary: string;
    };
    payload: {
      archivePayloadAvailable: boolean;
      manifestEntriesReturned: boolean;
      resultFilesReturned: boolean;
      resultContentReturned: boolean;
      rawPathsReturned: boolean;
      payloadBytesReturned: number;
      redacted: boolean;
    };
    digest: string;
  }>;
};

type ArchiveDiagnosticReplayMaterializedFixtureListResponse = {
  kind: "archive-diagnostic-replay-fixture-materialized-list";
  project: { id: string; scoped: boolean };
  actor: { id: string; scoped: boolean };
  access: {
    scope: "uploads:read";
    projectScoped: boolean;
    actorScoped: boolean;
    mutation: boolean;
    redacted: boolean;
  };
  availability: {
    status: "empty" | "ready" | "denied";
    projectScoped: boolean;
    actorScoped: boolean;
    redacted: boolean;
    partial: boolean;
    unavailable: string[];
  };
  materialization: {
    adapterKind: string;
    boundary: string;
    consistency: string;
    source: string;
    readOnly: boolean;
    mutation: boolean;
    rawArchivePayloadsIncluded: boolean;
    manifestEntriesIncluded: boolean;
    resultFilesIncluded: boolean;
    localPathsIncluded: boolean;
    storageRefsIncluded: boolean;
    signedUrlsIncluded: boolean;
    tokensIncluded: boolean;
    materializedAt: string;
    materializedRecordCount: number;
    materializationDigest: string;
    mutationBoundary: string;
  };
  page: {
    limit: number;
    cursor: string | null;
    offset: number;
    returned: number;
    total: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
  summary: {
    projectId: string;
    materializedRecordCount: number;
    fixtureNames: string[];
    retryAwareCount: number;
    duplicateAwareCount: number;
    deniedFixtureCount: number;
    deterministic: boolean;
    projectScoped: boolean;
    readOnly: boolean;
    mutation: boolean;
    rawArchivePayloadsIncluded: boolean;
    manifestEntriesIncluded: boolean;
    resultFilesIncluded: boolean;
    localPathsIncluded: boolean;
    storageRefsIncluded: boolean;
    signedUrlsIncluded: boolean;
    tokensIncluded: boolean;
    redactionPassed: boolean;
    materializationDigest: string;
  };
  items: Array<{
    kind: "archive-diagnostic-replay-fixture-materialized";
    projectId: string;
    fixtureRef: string;
    materializedRef: string;
    name: string;
    scenario: string;
    materializedAt: string;
    sourceDigest: string;
    recordDigest: string;
    status: "ready" | "partial" | "denied";
    evidence: {
      deterministic: boolean;
      retryAware: boolean;
      duplicateAware: boolean;
      deniedFixture: boolean;
      supportedFiles: number;
      attachmentFiles: number;
      ignoredFiles: number;
      warningCount: number;
      parseErrors: number;
      attemptGroups: number;
      latestStatusCount: number;
      compatibleSourceCount: number;
      closedArchiveStatusReadCompatible: boolean;
      closedArchiveDiagnosticsReadCompatible: boolean;
      redactionPassed: boolean;
    };
    materialization: {
      adapterKind: string;
      boundary: string;
      consistency: string;
      source: string;
      readOnly: boolean;
      rawArchivePayloadsIncluded: boolean;
      manifestEntriesIncluded: boolean;
      resultFilesIncluded: boolean;
      localPathsIncluded: boolean;
      storageRefsIncluded: boolean;
      signedUrlsIncluded: boolean;
      tokensIncluded: boolean;
      mutationBoundary: string;
    };
    execution: {
      replayStarted: boolean;
      workerJobEnqueued: boolean;
      archivePayloadOpened: boolean;
      mutation: boolean;
      deletionStarted: boolean;
      providerIntegration: boolean;
    };
  }>;
};

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("api app chunked-ingestion", () => {
  it("accepts allurectl-compatible session uploads", async () => {
    const store = createAppStore();
    app = await createApiApp(store);

    const launchResponse = await app.inject({
      method: "POST",
      url: "/api/rs/launch",
      headers: { authorization: "Bearer allurectl-session-token" },
      payload: { projectId: 1, launchName: "allurectl nightly" }
    });
    expect(launchResponse.statusCode).toBe(201);
    const launch = launchResponse.json<{ launchId: string; projectId: string; url: string }>();

    const sessionResponse = await app.inject({
      method: "POST",
      url: "/api/rs/session",
      headers: { authorization: "Bearer allurectl-session-token" },
      payload: { launchId: launch.launchId }
    });
    expect(sessionResponse.statusCode).toBe(201);
    const session = sessionResponse.json<{ sessionId: string; launchId: string }>();
    expect(session.launchId).toBe(launch.launchId);

    const fileResponse = await app.inject({
      method: "POST",
      url: `/api/rs/session/${session.sessionId}/file`,
      headers: { authorization: "Bearer allurectl-session-token" },
      payload: {
        path: "allurectl-result.json",
        content: JSON.stringify({
          uuid: "allurectl-result-1",
          name: "allurectl imports results",
          status: "passed"
        })
      }
    });
    expect(fileResponse.statusCode).toBe(200);
    expect(fileResponse.json()).toEqual(
      expect.objectContaining({
        kind: "allurectl-file-upload",
        accepted: true,
        imported: [{ path: "allurectl-result.json", uuid: "allurectl-result-1", warnings: [] }],
        launch: expect.objectContaining({
          id: launch.launchId,
          counters: expect.objectContaining({ passed: 1 })
        })
      })
    );

    const closeResponse = await app.inject({
      method: "POST",
      url: `/api/rs/session/${session.sessionId}/close`,
      headers: { authorization: "Bearer allurectl-session-token" }
    });
    expect(closeResponse.statusCode).toBe(200);
    expect(closeResponse.json()).toEqual(
      expect.objectContaining({
        sessionId: session.sessionId,
        launchId: launch.launchId,
        status: "completed"
      })
    );
    expect(store.projects.has("1")).toBe(true);
    expect(store.testCases.size).toBe(1);
    expect(
      JSON.stringify([launchResponse.json(), sessionResponse.json(), fileResponse.json()])
    ).not.toContain("allurectl-session-token");
  });

  it("blocks allurectl-compatible launch close while upload sessions are pending", async () => {
    app = await createApiApp();

    const launchResponse = await app.inject({
      method: "POST",
      url: "/api/rs/launch",
      payload: { projectId: 7, launchName: "allurectl pending close" }
    });
    expect(launchResponse.statusCode).toBe(201);
    const launch = launchResponse.json<{ launchId: string }>();

    const sessionResponse = await app.inject({
      method: "POST",
      url: "/api/rs/session",
      payload: { launchId: launch.launchId }
    });
    expect(sessionResponse.statusCode).toBe(201);

    const closeResponse = await app.inject({
      method: "POST",
      url: `/api/rs/launch/${launch.launchId}/close`
    });

    expect(closeResponse.statusCode).toBe(409);
    expect(closeResponse.json()).toEqual(
      expect.objectContaining({
        message: "Launch has pending uploads",
        status: "open",
        closePipeline: expect.objectContaining({
          status: "pending_uploads",
          pendingUploads: [
            expect.objectContaining({
              kind: "session",
              status: "open"
            })
          ]
        })
      })
    );
  });

  it("accepts one-shot allurectl-compatible uploads with path project ids", async () => {
    const store = createAppStore();
    app = await createApiApp(store);

    const response = await app.inject({
      method: "POST",
      url: "/api/rs/import/42",
      headers: { authorization: "Bearer allurectl-import-token" },
      payload: {
        launchName: "allurectl one shot",
        closeLaunch: true,
        files: [
          {
            path: "one-shot-result.json",
            content: JSON.stringify({
              uuid: "allurectl-result-2",
              name: "allurectl one shot import",
              status: "failed"
            })
          },
          {
            path: "executor.json",
            content: JSON.stringify({ name: "allurectl", buildName: "build-17" })
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        kind: "allurectl-upload",
        accepted: true,
        launch: expect.objectContaining({
          projectId: "42",
          status: "closed",
          counters: expect.objectContaining({ failed: 1 })
        }),
        upload: expect.objectContaining({
          status: "completed",
          importedResults: 1,
          storedArtifacts: 2
        })
      })
    );
    expect(store.projects.has("42")).toBe(true);
    expect(store.testCases.size).toBe(1);
    expect(JSON.stringify(response.json())).not.toContain("allurectl-import-token");
  });

  it("documents allurectl-compatible runtime routes in static OpenAPI without secret wording", () => {
    const openApi = readFileSync(
      new URL("../../../docs/openapi/openapi.yaml", import.meta.url),
      "utf8"
    );
    const routes = [
      {
        method: "post",
        operationId: "createAllureCtlCompatibleLaunch",
        path: "/api/rs/launch"
      },
      {
        method: "post",
        operationId: "closeAllureCtlCompatibleLaunch",
        path: "/api/rs/launch/{launchId}/close"
      },
      {
        method: "post",
        operationId: "createAllureCtlCompatibleSession",
        path: "/api/rs/session"
      },
      {
        method: "post",
        operationId: "uploadAllureCtlCompatibleSessionFile",
        path: "/api/rs/session/{sessionId}/file"
      },
      {
        method: "post",
        operationId: "closeAllureCtlCompatibleSession",
        path: "/api/rs/session/{sessionId}/close"
      },
      {
        method: "get",
        operationId: "getAllureCtlCompatibleSession",
        path: "/api/rs/session/{sessionId}"
      },
      {
        method: "post",
        operationId: "importAllureCtlCompatibleProjectFiles",
        path: "/api/rs/import/{projectId}"
      },
      {
        method: "post",
        operationId: "uploadAllureCtlCompatibleBatch",
        path: "/api/allurectl/upload"
      }
    ];

    for (const route of routes) {
      const section = extractOpenApiPathSection(openApi, route.path);

      expect(section, `${route.path} should be documented`).toContain(`    ${route.method}:`);
      expect(section, `${route.path} should have an operation id`).toContain(
        `      operationId: ${route.operationId}`
      );
      expect(section, `${route.path} should not document raw credentials`).not.toMatch(
        /\b(Bearer|authorization|secret|token)\b/i
      );
    }

    expect(openApi).toContain("AllureCtlCompatibilityRequest:");
    expect(openApi).toContain("AllureCtlLaunchResponse:");
    expect(openApi).toContain("AllureCtlSessionResponse:");
    expect(openApi).toContain("AllureCtlUploadResponse:");
    expect(openApi).toContain("AllureCtlError:");
  });

  it("rejects oversized synchronous JSON batches with upload backpressure", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);
    const files = Array.from({ length: 5001 }, (_, index) => ({
      path: `high-volume-${index}-result.json`,
      content: JSON.stringify({
        uuid: `high-volume-${index}`,
        name: `high volume ${index}`,
        status: "passed"
      })
    }));

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: { files }
    });
    const launchResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}`
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual(
      expect.objectContaining({
        kind: "upload-backpressure",
        code: "upload.backpressure.batch_too_large",
        accepted: false,
        retryable: true,
        redacted: true,
        observed: expect.objectContaining({ files: 5001 }),
        limits: expect.objectContaining({ files: 5000 }),
        recommendation: expect.stringContaining("chunked upload or archive upload")
      })
    );
    expect(launchResponse.json<LaunchResponse>()).toEqual(
      expect.objectContaining({
        counters: {
          failed: 0,
          broken: 0,
          passed: 0,
          skipped: 0,
          unknown: 0
        }
      })
    );
  });

  it("keeps result uploads idempotent for the same source path and result uuid", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);
    const payload = {
      files: [
        {
          path: "idempotent-upload-result.json",
          content: JSON.stringify({
            uuid: "idempotent-upload",
            name: "idempotent upload",
            status: "passed"
          })
        }
      ]
    };

    const firstResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload
    });
    const retryResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload
    });
    const launchResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}`
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(retryResponse.statusCode).toBe(200);
    expect(retryResponse.json()).toEqual(
      expect.objectContaining({
        job: expect.objectContaining({
          importedResults: 0,
          duplicateResults: 1,
          storedArtifacts: 0
        }),
        imported: [],
        compatibilityFiles: [
          expect.objectContaining({
            path: "idempotent-upload-result.json",
            kind: "result",
            status: "duplicate",
            uuid: "idempotent-upload"
          })
        ],
        artifacts: [],
        launch: expect.objectContaining({
          counters: expect.objectContaining({ passed: 1 })
        })
      })
    );
    expect(launchResponse.statusCode).toBe(200);
    expect(launchResponse.json<{ results: unknown[]; counters: Record<string, number> }>()).toEqual(
      expect.objectContaining({
        counters: expect.objectContaining({ passed: 1 }),
        results: [expect.objectContaining({ uuid: "idempotent-upload" })]
      })
    );
  });

  it("accepts mixed Allure result side files with diagnostics and artifact summaries", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "mixed-result.json",
            content: JSON.stringify({
              uuid: "mixed-result",
              name: "mixed result",
              status: "failed"
            })
          },
          {
            path: "mixed-container.json",
            content: JSON.stringify({
              uuid: "mixed-container",
              children: ["mixed-result"],
              befores: [{ name: "setup", attachments: [{ name: "log", source: "setup.log" }] }]
            })
          },
          {
            path: "environment.properties",
            content: "Browser=Chromium\nMalformedLine\nBrowser=Firefox"
          },
          {
            path: "executor.json",
            content: JSON.stringify({ name: "synthetic-ci", buildUrl: "https://ci.example/build" })
          },
          {
            path: "categories.json",
            content: JSON.stringify([{ name: "Product defects", matchedStatuses: ["failed"] }])
          },
          {
            path: "history/history-trend.json",
            content: JSON.stringify([{ buildOrder: 1, failed: 1 }])
          },
          {
            path: "mixed-attachment.txt",
            content: "synthetic attachment"
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        job: expect.objectContaining({
          status: "completed",
          receivedFiles: 7,
          importedResults: 1,
          storedArtifacts: 7
        }),
        imported: [{ path: "mixed-result.json", uuid: "mixed-result", warnings: [] }],
        compatibilityFiles: expect.arrayContaining([
          expect.objectContaining({
            path: "mixed-result.json",
            kind: "result",
            status: "imported"
          }),
          expect.objectContaining({
            path: "mixed-container.json",
            kind: "container",
            status: "imported"
          }),
          expect.objectContaining({
            path: "environment.properties",
            kind: "environment",
            status: "imported",
            warnings: expect.arrayContaining([
              "environment.properties: Line 2 was ignored because it has no delimiter",
              "environment.properties: Line 3 overrides key 'Browser'"
            ])
          }),
          expect.objectContaining({ path: "executor.json", kind: "executor", status: "imported" }),
          expect.objectContaining({
            path: "categories.json",
            kind: "categories",
            status: "imported"
          }),
          expect.objectContaining({
            path: "history/history-trend.json",
            kind: "history",
            status: "imported"
          })
        ]),
        artifacts: expect.arrayContaining([
          expect.objectContaining({ path: "mixed-result.json", kind: "allure-result" }),
          expect.objectContaining({ path: "mixed-container.json", kind: "allure-container" }),
          expect.objectContaining({ path: "environment.properties", kind: "environment" }),
          expect.objectContaining({ path: "executor.json", kind: "executor" }),
          expect.objectContaining({ path: "categories.json", kind: "unknown" }),
          expect.objectContaining({ path: "history/history-trend.json", kind: "unknown" }),
          expect.objectContaining({ path: "mixed-attachment.txt", kind: "attachment" })
        ]),
        launch: expect.objectContaining({
          counters: expect.objectContaining({ failed: 1 })
        })
      })
    );
  });

  it("imports a scrubbed retry corpus with corrupt partial files and idempotent duplicates", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);
    const forbiddenValues = [
      "synthetic-secret-token",
      "synthetic-password-value",
      "C:\\synthetic\\allure-results\\raw.json"
    ];
    const corpusPayload = {
      files: [
        {
          path: "scrubbed/auth-login-first-result.json",
          content: JSON.stringify({
            uuid: "scrubbed-login-first",
            historyId: "history-scrubbed-login",
            testCaseId: "case-scrubbed-login",
            fullName: "web.auth.SignInTest.login",
            name: "login accepts valid user",
            status: "failed",
            start: 100,
            stop: 240,
            statusDetails: {
              message: "Expected dashboard after sign in",
              trace:
                "Authorization: Bearer synthetic-secret-token password=synthetic-password-value C:\\synthetic\\allure-results\\raw.json"
            },
            parameters: [
              { name: "browser", value: "chromium" },
              { name: "password", value: "synthetic-password-value", mode: "masked" },
              { name: "session", value: "synthetic-secret-token", mode: "hidden" }
            ],
            attachments: [
              {
                name: "failure screenshot",
                source: "attachments/login-first.png",
                type: "image/png"
              }
            ]
          })
        },
        {
          path: "scrubbed/auth-login-retry-result.json",
          content: JSON.stringify({
            uuid: "scrubbed-login-retry",
            historyId: "history-scrubbed-login",
            testCaseId: "case-scrubbed-login",
            fullName: "web.auth.SignInTest.login",
            name: "login accepts valid user",
            retry: true,
            status: "passed",
            start: 300,
            stop: 390,
            statusDetails: { flaky: true, message: "Recovered on retry" },
            parameters: [
              { name: "browser", value: "chromium" },
              { name: "password", value: "synthetic-password-value", mode: "masked" },
              { name: "session", value: "synthetic-secret-token", mode: "hidden" }
            ]
          })
        },
        {
          path: "scrubbed/partial-missing-name-result.json",
          content: JSON.stringify({
            uuid: "scrubbed-partial-missing-name",
            status: "broken"
          })
        },
        {
          path: "attachments/login-first.png",
          content: "synthetic binary screenshot body; metadata only"
        }
      ]
    };

    const uploadResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: corpusPayload
    });
    expect(uploadResponse.statusCode).toBe(207);
    expect(uploadResponse.json()).toEqual(
      expect.objectContaining({
        job: expect.objectContaining({
          status: "completed_with_errors",
          receivedFiles: 4,
          importedResults: 2,
          storedArtifacts: 4
        }),
        imported: expect.arrayContaining([
          expect.objectContaining({
            path: "scrubbed/auth-login-first-result.json",
            uuid: "scrubbed-login-first"
          }),
          expect.objectContaining({
            path: "scrubbed/auth-login-retry-result.json",
            uuid: "scrubbed-login-retry"
          })
        ]),
        compatibilityFiles: expect.arrayContaining([
          expect.objectContaining({
            path: "scrubbed/partial-missing-name-result.json",
            kind: "result",
            status: "diagnostic",
            errors: expect.arrayContaining([
              "scrubbed/partial-missing-name-result.json: Field `name` is required and must be a non-empty string"
            ])
          })
        ]),
        launch: expect.objectContaining({
          counters: expect.objectContaining({ failed: 1, passed: 1 })
        })
      })
    );
    expectSafeArtifactMetadata(uploadResponse.json(), forbiddenValues);

    const duplicateResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [corpusPayload.files[1]]
      }
    });
    expect(duplicateResponse.statusCode).toBe(200);
    expect(duplicateResponse.json()).toEqual(
      expect.objectContaining({
        job: expect.objectContaining({
          importedResults: 0,
          duplicateResults: 1,
          storedArtifacts: 0
        }),
        compatibilityFiles: [
          expect.objectContaining({
            path: "scrubbed/auth-login-retry-result.json",
            kind: "result",
            status: "duplicate",
            uuid: "scrubbed-login-retry"
          })
        ]
      })
    );
    expectSafeArtifactMetadata(duplicateResponse.json(), forbiddenValues);

    const closeResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/close`
    });
    expect(closeResponse.statusCode).toBe(200);
    expect(closeResponse.json()).toEqual(
      expect.objectContaining({
        status: "closed",
        processedTestCases: 2,
        processingSummary: expect.objectContaining({
          totalResults: 2,
          processedTestCases: 2,
          uploadJobs: expect.objectContaining({
            completedWithErrors: 1,
            duplicateResults: 1,
            importedResults: 2
          })
        }),
        errors: [
          expect.objectContaining({
            path: "scrubbed/partial-missing-name-result.json",
            scope: "upload"
          })
        ]
      })
    );

    const detailResponse = await app.inject({
      method: "GET",
      url: `/api/v1/test-cases/case-scrubbed-login`
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toEqual(
      expect.objectContaining({
        history: expect.arrayContaining([
          expect.objectContaining({ launchId: launch.id, status: "passed" })
        ]),
        testCase: expect.objectContaining({
          historyVersions: expect.arrayContaining([
            expect.objectContaining({
              launchId: launch.id,
              resultUuid: "scrubbed-login-retry",
              status: "passed"
            })
          ])
        })
      })
    );
    expectSafeArtifactMetadata(detailResponse.json(), forbiddenValues);
  });
});
