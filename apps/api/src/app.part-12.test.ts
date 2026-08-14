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

describe("api app part-12", () => {
  it("keeps concurrent chunked upload read models bounded after complete abort and pending flows", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const launch = await createLaunch(app);
    const completedContent = JSON.stringify({
      uuid: "pressure-completed-result",
      name: "pressure completed import",
      status: "passed"
    });
    const incompleteContent = JSON.stringify({
      uuid: "pressure-incomplete-result",
      name: "pressure incomplete import",
      status: "passed",
      statusDetails: {
        trace:
          "Bearer chunked-incomplete-body-token C:\\Users\\tester\\Downloads\\private.log signedUrl=https://object.test/raw?X-Amz-Signature=chunked"
      }
    });
    const abortedContent =
      "aborted buffered body token=chunked-abort-token storageKey=chunked-abort-storage";

    const [completedSessionResponse, abortedSessionResponse, incompleteSessionResponse] =
      await Promise.all([
        app.inject({
          method: "POST",
          url: `/api/v1/launches/${launch.id}/uploads/chunked`,
          payload: {
            path: "pressure\\completed-result.json",
            totalChunks: 2,
            totalBytes: Buffer.byteLength(completedContent)
          }
        }),
        app.inject({
          method: "POST",
          url: `/api/v1/launches/${launch.id}/uploads/chunked`,
          payload: {
            path: "pressure-aborted-attachment.txt",
            totalChunks: 1,
            totalBytes: Buffer.byteLength(abortedContent)
          }
        }),
        app.inject({
          method: "POST",
          url: `/api/v1/launches/${launch.id}/uploads/chunked`,
          payload: {
            files: [
              {
                path: "pressure-incomplete-result.json",
                totalChunks: 1,
                totalBytes: Buffer.byteLength(incompleteContent)
              },
              {
                path: "pressure-incomplete-attachment.txt",
                totalChunks: 1,
                totalBytes: Buffer.byteLength("missing")
              }
            ]
          }
        })
      ]);
    expect(completedSessionResponse.statusCode).toBe(201);
    expect(abortedSessionResponse.statusCode).toBe(201);
    expect(incompleteSessionResponse.statusCode).toBe(201);
    const completedSession = completedSessionResponse.json<{ id: string }>();
    const abortedSession = abortedSessionResponse.json<{ id: string }>();
    const incompleteSession = incompleteSessionResponse.json<{ id: string }>();
    const completedSplitAt = Math.floor(completedContent.length / 2);

    const unsafeCreateResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/uploads/chunked`,
      payload: {
        path: "C:\\Users\\tester\\Downloads\\token=chunked-path-secret\\signedUrl=https://object.test/private?X-Amz-Signature=secret",
        totalChunks: 1
      }
    });
    const unsafeChunkPathResponse = await app.inject({
      method: "PUT",
      url: `/api/v1/uploads/${incompleteSession.id}/chunks/0`,
      payload: {
        path: "C:\\Users\\tester\\Downloads\\token=chunked-chunk-path-secret\\signedUrl=https://object.test/private?X-Amz-Signature=secret",
        content: incompleteContent
      }
    });

    await Promise.all([
      app.inject({
        method: "PUT",
        url: `/api/v1/uploads/${completedSession.id}/chunks/1`,
        payload: {
          path: "pressure/completed-result.json",
          content: completedContent.slice(completedSplitAt)
        }
      }),
      app.inject({
        method: "PUT",
        url: `/api/v1/uploads/${completedSession.id}/chunks/0`,
        payload: {
          path: "pressure\\completed-result.json",
          content: completedContent.slice(0, completedSplitAt)
        }
      }),
      app.inject({
        method: "PUT",
        url: `/api/v1/uploads/${abortedSession.id}/chunks/0`,
        payload: { content: abortedContent }
      }),
      app.inject({
        method: "PUT",
        url: `/api/v1/uploads/${incompleteSession.id}/chunks/0`,
        payload: { path: "pressure-incomplete-result.json", content: incompleteContent }
      })
    ]);

    const [completeResponse, abortResponse] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/api/v1/uploads/${completedSession.id}/complete`
      }),
      app.inject({
        method: "POST",
        url: `/api/v1/uploads/${abortedSession.id}/abort`
      })
    ]);
    expect(completeResponse.statusCode).toBe(202);
    const queuedCompletedJob = completeResponse.json<{ job: { id: string } }>().job;
    const processCompletedResponse = await app.inject({
      method: "POST",
      url: `/api/v1/uploads/${queuedCompletedJob.id}/process`
    });
    const [completedStatusResponse, abortedStatusResponse, incompleteStatusResponse, launchStatus] =
      await Promise.all([
        app.inject({
          method: "GET",
          url: `/api/v1/uploads/${completedSession.id}/status`
        }),
        app.inject({
          method: "GET",
          url: `/api/v1/uploads/${abortedSession.id}/status`
        }),
        app.inject({
          method: "GET",
          url: `/api/v1/uploads/${incompleteSession.id}/status`
        }),
        app.inject({
          method: "GET",
          url: `/api/v1/launches/${launch.id}/ingestion/status`
        })
      ]);

    expect(unsafeCreateResponse.statusCode).toBe(400);
    expect(unsafeCreateResponse.json()).toEqual({
      message: "Upload file path must be a safe relative path"
    });
    expect(unsafeChunkPathResponse.statusCode).toBe(400);
    expect(unsafeChunkPathResponse.json()).toEqual({
      message: "Chunk path must be a safe relative path"
    });
    expect(processCompletedResponse.statusCode).toBe(200);
    expect(abortResponse.statusCode).toBe(200);
    expect(completedStatusResponse.statusCode).toBe(200);
    expect(abortedStatusResponse.statusCode).toBe(200);
    expect(incompleteStatusResponse.statusCode).toBe(200);
    expect(launchStatus.statusCode).toBe(200);
    expect(completedStatusResponse.json()).toEqual(
      expect.objectContaining({
        kind: "session",
        status: "completed",
        session: expect.objectContaining({
          path: "pressure/completed-result.json",
          progress: 100,
          cleanup: expect.objectContaining({ reason: "completed" }),
          completedJobId: expect.any(String)
        }),
        job: expect.objectContaining({
          status: "completed",
          importedResults: 1,
          storedArtifacts: 1
        })
      })
    );
    expect(abortedStatusResponse.json()).toEqual(
      expect.objectContaining({
        kind: "session",
        status: "aborted",
        session: expect.objectContaining({
          status: "aborted",
          cleanup: expect.objectContaining({ reason: "aborted" })
        }),
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: "upload.session.aborted" }),
          expect.objectContaining({ code: "upload.session.cleanup" })
        ])
      })
    );
    expect(incompleteStatusResponse.json()).toEqual(
      expect.objectContaining({
        kind: "session",
        status: "open",
        progress: expect.objectContaining({
          totalUnits: 2,
          processedUnits: 1,
          percent: 50
        }),
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "upload.file.awaiting_chunks",
            path: "pressure-incomplete-attachment.txt"
          })
        ])
      })
    );
    expect(launchStatus.json()).toEqual(
      expect.objectContaining({
        totals: expect.objectContaining({
          sessions: 3,
          jobs: 1,
          openSessions: 1,
          completedJobs: 1,
          storedArtifacts: 1,
          importedResults: 1
        }),
        sessions: expect.arrayContaining([
          expect.objectContaining({ id: completedSession.id, status: "completed" }),
          expect.objectContaining({ id: abortedSession.id, status: "aborted" }),
          expect.objectContaining({ id: incompleteSession.id, status: "open" })
        ])
      })
    );
    expect(
      Array.from(store.uploadSessions.get(completedSession.id)?.files.values() ?? []).every(
        (file) => file.chunks.size === 0
      )
    ).toBe(true);
    expect(
      Array.from(store.uploadSessions.get(abortedSession.id)?.files.values() ?? []).every(
        (file) => file.chunks.size === 0
      )
    ).toBe(true);
    expect(
      Array.from(store.uploadSessions.get(incompleteSession.id)?.files.values() ?? []).some(
        (file) => file.chunks.size > 0
      )
    ).toBe(true);
    expectSafeChunkedUploadReadModel([
      unsafeCreateResponse.json(),
      unsafeChunkPathResponse.json(),
      completedStatusResponse.json(),
      abortedStatusResponse.json(),
      incompleteStatusResponse.json(),
      launchStatus.json()
    ]);
  });

  it("reports launch and session ingestion progress for incomplete large uploads", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);
    const content = JSON.stringify({
      uuid: "observable-chunked-result",
      name: "observable chunked import",
      status: "passed"
    });

    const sessionResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/uploads/chunked`,
      payload: {
        path: "observable-chunked-result.json",
        totalChunks: 2,
        totalBytes: Buffer.byteLength(content)
      }
    });
    expect(sessionResponse.statusCode).toBe(201);
    const session = sessionResponse.json<{ id: string }>();

    const splitAt = Math.floor(content.length / 2);
    const chunkResponse = await app.inject({
      method: "PUT",
      url: `/api/v1/uploads/${session.id}/chunks/0`,
      payload: { content: content.slice(0, splitAt) }
    });
    expect(chunkResponse.statusCode).toBe(200);

    const sessionStatusResponse = await app.inject({
      method: "GET",
      url: `/api/v1/uploads/${session.id}/status`
    });
    const launchStatusResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/ingestion/status`
    });

    expect(sessionStatusResponse.statusCode).toBe(200);
    expect(sessionStatusResponse.json()).toEqual(
      expect.objectContaining({
        id: session.id,
        kind: "session",
        status: "open",
        progress: expect.objectContaining({
          totalUnits: 2,
          processedUnits: 1,
          percent: 50,
          totalBytes: Buffer.byteLength(content),
          processedBytes: Buffer.byteLength(content.slice(0, splitAt))
        }),
        session: expect.objectContaining({
          progress: 50,
          files: [
            expect.objectContaining({
              path: "observable-chunked-result.json",
              progress: 50
            })
          ]
        }),
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            scope: "file",
            severity: "info",
            code: "upload.file.awaiting_chunks",
            path: "observable-chunked-result.json"
          })
        ])
      })
    );
    expect(launchStatusResponse.statusCode).toBe(200);
    expect(launchStatusResponse.json()).toEqual(
      expect.objectContaining({
        launchId: launch.id,
        launchStatus: "open",
        totals: expect.objectContaining({
          sessions: 1,
          jobs: 0,
          openSessions: 1,
          processingJobs: 0
        }),
        progress: expect.objectContaining({
          totalUnits: 2,
          processedUnits: 1,
          percent: 50
        }),
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: "upload.file.awaiting_chunks",
            path: "observable-chunked-result.json"
          })
        ]),
        queue: expect.objectContaining({
          mode: "queue",
          capacity: expect.objectContaining({
            targetUsers: 1000,
            targetResults: 100000,
            targetWindowHours: 6,
            status: "ok"
          }),
          backpressure: expect.objectContaining({
            enabled: true,
            accepting: true,
            queueDepthWatermark: 50000
          }),
          limits: expect.objectContaining({
            defaultArtifactRetentionDays: 14
          }),
          workers: expect.arrayContaining([
            expect.objectContaining({
              name: "parser-worker-pool"
            })
          ])
        })
      })
    );
  });

  it("reports enterprise ingestion readiness with queue capacity and upload limits", async () => {
    app = await createApiApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/ingestion/readiness"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        kind: "enterprise-ingestion-readiness",
        status: "accepting",
        profile: expect.objectContaining({
          users: 1000,
          resultCount: 100000,
          windowHours: 6,
          targetResultsPerHour: expect.any(Number),
          targetResultsPerSecond: expect.any(Number)
        }),
        queue: expect.objectContaining({
          mode: "queue",
          queue: expect.objectContaining({
            name: "ingestion.parse",
            status: "idle",
            depth: 0,
            inFlight: 0,
            deadLetters: 0
          }),
          capacity: expect.objectContaining({
            estimatedResultsPerHourCapacity: expect.any(Number),
            capacityMargin: expect.any(Number),
            status: "ok"
          }),
          backpressure: expect.objectContaining({
            enabled: true,
            accepting: true,
            reason: "below_watermark",
            retryAfterMs: 0
          }),
          limits: expect.objectContaining({
            jsonBatchSyncFileLimit: 5000,
            jsonBatchSyncByteLimit: 25 * 1024 * 1024,
            defaultArtifactRetentionDays: 14
          }),
          workers: expect.arrayContaining([
            expect.objectContaining({
              name: "parser-worker-pool",
              concurrency: 8
            }),
            expect.objectContaining({
              name: "artifact-worker-pool",
              concurrency: 16
            })
          ])
        }),
        uploadModes: expect.objectContaining({
          jsonBatch: expect.objectContaining({ enterpriseRecommended: false }),
          chunked: expect.objectContaining({ enterpriseRecommended: true }),
          archive: expect.objectContaining({ enterpriseRecommended: true })
        }),
        recommendations: expect.arrayContaining([
          "Use chunked or archive upload for enterprise-scale CI ingestion."
        ])
      })
    );
  });

  it("blocks enterprise ingestion readiness when failed jobs need replay", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const launch = await createLaunch(app);
    store.uploadJobs.set("failed-enterprise-job", {
      id: "failed-enterprise-job",
      launchId: launch.id,
      status: "failed",
      receivedFiles: 1000,
      importedResults: 900,
      duplicateResults: 0,
      storedArtifacts: 900,
      errors: [],
      createdAt: "2026-05-30T00:00:00.000Z",
      updatedAt: "2026-05-30T00:05:00.000Z"
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/ingestion/readiness"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        status: "blocked",
        queue: expect.objectContaining({
          queue: expect.objectContaining({
            status: "blocked",
            deadLetters: 1
          }),
          backpressure: expect.objectContaining({
            accepting: false,
            reason: "dead_letters",
            retryAfterMs: 5000
          })
        }),
        totals: expect.objectContaining({
          failedJobs: 1,
          receivedFiles: 1000,
          importedResults: 900,
          storedArtifacts: 900
        }),
        recommendations: expect.arrayContaining([
          "Drain or replay failed ingestion jobs before accepting full load."
        ])
      })
    );
  });

  it("rejects chunks larger than upload policy", async () => {
    const previousChunkBytes = process.env.UPLOAD_CHUNK_BYTES;
    process.env.UPLOAD_CHUNK_BYTES = "2";
    try {
      app = await createApiApp();
      const launch = await createLaunch(app);
      const sessionResponse = await app.inject({
        method: "POST",
        url: `/api/v1/launches/${launch.id}/uploads/chunked`,
        payload: { path: "too-large-attachment.txt", totalChunks: 1, totalBytes: 3 }
      });
      const session = sessionResponse.json<{ id: string }>();

      const chunkResponse = await app.inject({
        method: "PUT",
        url: `/api/v1/uploads/${session.id}/chunks/0`,
        payload: { content: "abc" }
      });

      expect(chunkResponse.statusCode).toBe(413);
    } finally {
      if (previousChunkBytes === undefined) {
        delete process.env.UPLOAD_CHUNK_BYTES;
      } else {
        process.env.UPLOAD_CHUNK_BYTES = previousChunkBytes;
      }
    }
  });

  it("rejects chunk writes when a launch no longer accepts uploads", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const launch = await createLaunch(app);
    const sessionResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/uploads/chunked`,
      payload: { path: "closed-chunk-result.json", totalChunks: 1 }
    });
    expect(sessionResponse.statusCode).toBe(201);
    const session = sessionResponse.json<{ id: string }>();
    const storedLaunch = store.launches.get(launch.id) as Launch;
    storedLaunch.status = "closed";
    storedLaunch.closedAt = new Date().toISOString();

    const chunkResponse = await app.inject({
      method: "PUT",
      url: `/api/v1/uploads/${session.id}/chunks/0`,
      payload: {
        content: JSON.stringify({
          uuid: "closed-chunk",
          name: "closed chunk",
          status: "passed"
        })
      }
    });

    expect(chunkResponse.statusCode).toBe(409);
    expect(chunkResponse.json()).toEqual(
      expect.objectContaining({
        message: "Launch does not accept uploads while closed",
        launch: expect.objectContaining({
          id: launch.id,
          status: "closed"
        })
      })
    );
  });

  it("evaluates quality gates from imported launch results", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const launch = await createLaunch(app);

    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "passed-result.json",
            content: JSON.stringify({ uuid: "passed-result", name: "passes", status: "passed" })
          },
          {
            path: "failed-result.json",
            content: JSON.stringify({ uuid: "failed-result", name: "fails", status: "failed" })
          }
        ]
      }
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/quality-gate`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        status: "failed",
        metrics: expect.objectContaining({
          total: 2,
          passed: 1,
          failed: 1,
          passRate: 50
        }),
        violations: expect.arrayContaining([
          expect.objectContaining({
            actual: 1,
            expected: 0
          })
        ])
      })
    );
  });
});
