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

describe("api app part-11", () => {
  it("returns launch result details with attachments and redacted raw metadata", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);

    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "details-result.json",
            content: JSON.stringify({
              uuid: "details-result",
              testCaseId: "case-details",
              historyId: "history-details",
              fullName: "shop.checkout.details",
              name: "checkout exposes details",
              status: "failed",
              stage: "finished",
              statusDetails: {
                message: "Synthetic assertion failure password=synthetic-status-password",
                trace: "Expected total to match after Authorization: Bearer synthetic-bearer-token"
              },
              description: "Synthetic details fixture token=synthetic-description-token",
              descriptionHtml:
                '<p data-api-key="synthetic-html-key">Synthetic details fixture signature=synthetic-html-signature</p>',
              start: 100,
              stop: 145,
              parameters: [
                { name: "browser", value: "chrome" },
                { name: "token", value: "synthetic-secret", mode: "masked" }
              ],
              labels: [
                { name: "tag", value: "smoke" },
                { name: "feature", value: "Checkout" },
                { name: "client_secret", value: "synthetic-label-secret" }
              ],
              links: [{ name: "Spec", url: "https://example.test/spec", type: "spec" }],
              attachments: [
                {
                  name: "result log",
                  source: "synthetic-result-attachment.txt",
                  type: "text/plain"
                }
              ],
              steps: [
                {
                  name: "Open checkout",
                  status: "failed",
                  attachments: [
                    {
                      name: "screen",
                      source: "synthetic-screen-attachment.png"
                    }
                  ],
                  parameters: [{ name: "password", value: "secret-value", mode: "hidden" }]
                }
              ]
            })
          }
        ]
      }
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/results/details-result`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        launchId: launch.id,
        projectId: launch.projectId,
        uuid: "details-result",
        testCaseId: "case-details",
        historyId: "history-details",
        fullName: "shop.checkout.details",
        name: "checkout exposes details",
        status: "failed",
        durationMs: 45,
        stage: "finished",
        statusDetails: {
          message: "Synthetic assertion failure password=***",
          trace: "Expected total to match after Authorization: Bearer ***"
        },
        description: "Synthetic details fixture token=***",
        descriptionHtml: '<p data-api-key="***">Synthetic details fixture signature=***</p>',
        labels: {
          tag: ["smoke"],
          feature: ["Checkout"],
          client_secret: ["***"]
        },
        parameters: [
          { name: "browser", value: "chrome" },
          { name: "token", value: "***", mode: "masked" }
        ],
        links: [{ name: "Spec", url: "https://example.test/spec", type: "spec" }],
        attachments: [
          {
            name: "result log",
            source: "synthetic-result-attachment.txt",
            type: "text/plain",
            scope: "result"
          },
          {
            name: "screen",
            source: "synthetic-screen-attachment.png",
            type: "image/png",
            scope: "step",
            stepPath: ["Open checkout"]
          }
        ],
        raw: expect.objectContaining({
          uuid: "details-result",
          parameters: [
            { name: "browser", value: "chrome" },
            { name: "token", value: "***", mode: "masked" }
          ],
          steps: [
            expect.objectContaining({
              name: "Open checkout",
              parameters: [{ name: "password", mode: "hidden" }]
            })
          ]
        })
      })
    );
    expect(JSON.stringify(response.json())).not.toContain("synthetic-secret");
    expect(JSON.stringify(response.json())).not.toContain("secret-value");
    expect(JSON.stringify(response.json())).not.toContain("synthetic-status-password");
    expect(JSON.stringify(response.json())).not.toContain("synthetic-bearer-token");
    expect(JSON.stringify(response.json())).not.toContain("synthetic-description-token");
    expect(JSON.stringify(response.json())).not.toContain("synthetic-html-key");
    expect(JSON.stringify(response.json())).not.toContain("synthetic-html-signature");
    expect(JSON.stringify(response.json())).not.toContain("synthetic-label-secret");
  });

  it("completes chunked uploads and imports assembled result JSON", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const launch = await createLaunch(app);
    const content = JSON.stringify({
      uuid: "chunked-result",
      name: "chunked import",
      status: "passed"
    });
    const splitAt = Math.floor(content.length / 2);

    const sessionResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/uploads/chunked`,
      payload: {
        path: "chunked-result.json",
        totalChunks: 2,
        totalBytes: Buffer.byteLength(content)
      }
    });
    expect(sessionResponse.statusCode).toBe(201);
    const session = sessionResponse.json<{ id: string }>();

    const firstChunkResponse = await app.inject({
      method: "PUT",
      url: `/api/v1/uploads/${session.id}/chunks/0`,
      payload: { content: content.slice(0, splitAt) }
    });
    const secondChunkResponse = await app.inject({
      method: "PUT",
      url: `/api/v1/uploads/${session.id}/chunks/1`,
      payload: { content: content.slice(splitAt) }
    });
    expect(firstChunkResponse.statusCode).toBe(200);
    expect(secondChunkResponse.statusCode).toBe(200);
    const storedChunk = Array.from(
      store.uploadSessions.get(session.id)?.files.values() ?? []
    )[0]?.chunks.get(0);
    expect(storedChunk).toEqual(
      expect.objectContaining({
        storage: "filesystem",
        bytes: Buffer.byteLength(content.slice(0, splitAt)),
        sha256: expect.any(String),
        storageKey: expect.not.stringContaining("chunked-result")
      })
    );
    expect(storedChunk).not.toHaveProperty("buffer");

    const completeResponse = await app.inject({
      method: "POST",
      url: `/api/v1/uploads/${session.id}/complete`
    });

    expect(completeResponse.statusCode).toBe(202);
    expect(completeResponse.json()).toEqual(
      expect.objectContaining({
        session: expect.objectContaining({
          id: session.id,
          status: "completed",
          receivedChunks: 2,
          progress: 100
        }),
        job: expect.objectContaining({
          status: "queued",
          importedResults: 0
        })
      })
    );
    const queuedJob = completeResponse.json<{ job: { id: string } }>().job;
    const processResponse = await app.inject({
      method: "POST",
      url: `/api/v1/uploads/${queuedJob.id}/process`
    });

    expect(processResponse.statusCode).toBe(200);
    expect(processResponse.json()).toEqual(
      expect.objectContaining({
        session: expect.objectContaining({
          id: session.id,
          status: "completed",
          cleanup: expect.objectContaining({ reason: "completed" })
        }),
        job: expect.objectContaining({
          status: "completed",
          importedResults: 1
        }),
        imported: [{ path: "chunked-result.json", uuid: "chunked-result", warnings: [] }]
      })
    );
  });

  it("lists queued chunked upload jobs as a bounded worker polling contract", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);
    const content = JSON.stringify({
      uuid: "worker-poll-result",
      name: "worker poll import",
      status: "passed"
    });

    const sessionResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/uploads/chunked`,
      payload: {
        path: "worker-poll-result.json",
        totalChunks: 1,
        totalBytes: Buffer.byteLength(content)
      }
    });
    const session = sessionResponse.json<{ id: string }>();
    await app.inject({
      method: "PUT",
      url: `/api/v1/uploads/${session.id}/chunks/0`,
      payload: { content }
    });
    const completeResponse = await app.inject({
      method: "POST",
      url: `/api/v1/uploads/${session.id}/complete`
    });
    const queuedJob = completeResponse.json<{ job: { id: string } }>().job;

    const queueResponse = await app.inject({
      method: "GET",
      url: "/api/v1/uploads/jobs?status=queued&source=chunked-session&limit=1"
    });

    expect(queueResponse.statusCode).toBe(200);
    expect(queueResponse.json()).toEqual(
      expect.objectContaining({
        kind: "upload-job-queue",
        workerBoundary: "chunked-session-import",
        safeForPolling: true,
        redacted: true,
        page: expect.objectContaining({
          limit: 1,
          returned: 1,
          total: 1,
          hasMore: false
        }),
        items: [
          expect.objectContaining({
            job: expect.objectContaining({
              id: queuedJob.id,
              status: "queued",
              receivedFiles: 1,
              importedResults: 0
            }),
            source: {
              mode: "chunked-session",
              payloadAvailable: true
            },
            links: expect.objectContaining({
              process: `/api/v1/uploads/${queuedJob.id}/process`
            })
          })
        ]
      })
    );
    expect(JSON.stringify(queueResponse.json())).not.toContain(content);
    expect(JSON.stringify(queueResponse.json())).not.toContain("testhistory-upload-buffer");
  });

  it("claims queued chunked upload jobs with worker leases before processing", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const launch = await createLaunch(app);
    const content = JSON.stringify({
      uuid: "worker-claim-result",
      name: "worker claim import",
      status: "passed"
    });

    const sessionResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/uploads/chunked`,
      payload: {
        path: "worker-claim-result.json",
        totalChunks: 1,
        totalBytes: Buffer.byteLength(content)
      }
    });
    const session = sessionResponse.json<{ id: string }>();
    await app.inject({
      method: "PUT",
      url: `/api/v1/uploads/${session.id}/chunks/0`,
      payload: { content }
    });
    const completeResponse = await app.inject({
      method: "POST",
      url: `/api/v1/uploads/${session.id}/complete`
    });
    const queuedJob = completeResponse.json<{ job: { id: string } }>().job;

    const claimResponse = await app.inject({
      method: "POST",
      url: "/api/v1/uploads/jobs/claim",
      payload: {
        source: "chunked-session",
        workerId: "worker-a",
        limit: 1,
        leaseMs: 60_000
      }
    });
    const secondClaimResponse = await app.inject({
      method: "POST",
      url: "/api/v1/uploads/jobs/claim",
      payload: {
        source: "chunked-session",
        workerId: "worker-b",
        limit: 1,
        leaseMs: 60_000
      }
    });
    const processWithoutTokenResponse = await app.inject({
      method: "POST",
      url: `/api/v1/uploads/${queuedJob.id}/process`
    });

    expect(claimResponse.statusCode).toBe(200);
    const claim = claimResponse.json<{
      items: Array<{
        job: { id: string; status: string; lease?: { claimedBy: string; expiresAt: string } };
        claim: { token: string; claimedBy: string; expiresAt: string };
      }>;
    }>();
    expect(claim.items).toEqual([
      expect.objectContaining({
        job: expect.objectContaining({
          id: queuedJob.id,
          status: "processing",
          lease: expect.objectContaining({ claimedBy: "worker-a" })
        }),
        claim: expect.objectContaining({
          token: expect.any(String),
          claimedBy: "worker-a",
          expiresAt: expect.any(String)
        })
      })
    ]);
    expect(JSON.stringify(claim)).not.toContain(content);
    expect(JSON.stringify(claim)).not.toContain("testhistory-upload-buffer");

    expect(secondClaimResponse.statusCode).toBe(200);
    expect(secondClaimResponse.json<{ items: unknown[]; claim: { returned: number } }>()).toEqual(
      expect.objectContaining({
        claim: expect.objectContaining({ returned: 0 }),
        items: []
      })
    );

    expect(processWithoutTokenResponse.statusCode).toBe(409);
    expect(processWithoutTokenResponse.json()).toEqual(
      expect.objectContaining({
        message: "Upload job is leased by another worker or the lease expired"
      })
    );

    const processWithTokenResponse = await app.inject({
      method: "POST",
      url: `/api/v1/uploads/${queuedJob.id}/process`,
      payload: { claimToken: claim.items[0]!.claim.token }
    });
    expect(processWithTokenResponse.statusCode).toBe(200);
    expect(processWithTokenResponse.json()).toEqual(
      expect.objectContaining({
        job: expect.objectContaining({
          id: queuedJob.id,
          status: "completed",
          importedResults: 1
        }),
        imported: [{ path: "worker-claim-result.json", uuid: "worker-claim-result", warnings: [] }]
      })
    );
    expect(store.uploadJobs.get(queuedJob.id)).not.toHaveProperty("lease");
  });

  it("handles parallel chunked upload sessions with retries and cleanup metadata", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const launch = await createLaunch(app);
    const resultContent = JSON.stringify({
      uuid: "parallel-result",
      name: "parallel import",
      status: "passed"
    });
    const attachmentContent = Buffer.from("parallel attachment").toString("base64");

    const sessionResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/uploads/chunked`,
      payload: {
        files: [
          {
            path: "parallel-result.json",
            totalChunks: 2,
            totalBytes: Buffer.byteLength(resultContent)
          },
          {
            path: "parallel-attachment.txt",
            totalChunks: 1,
            totalBytes: Buffer.byteLength("parallel attachment")
          }
        ]
      }
    });
    expect(sessionResponse.statusCode).toBe(201);
    const session = sessionResponse.json<{ id: string }>();
    const splitAt = Math.floor(resultContent.length / 2);
    const firstHalf = resultContent.slice(0, splitAt);

    const secondChunkResponse = await app.inject({
      method: "PUT",
      url: `/api/v1/uploads/${session.id}/chunks/1`,
      payload: { path: "parallel-result.json", content: resultContent.slice(splitAt) }
    });
    const firstChunkResponse = await app.inject({
      method: "PUT",
      url: `/api/v1/uploads/${session.id}/chunks/0`,
      payload: {
        path: "parallel-result.json",
        content: firstHalf,
        sha256: createHash("sha256").update(firstHalf).digest("hex")
      }
    });
    const retryChunkResponse = await app.inject({
      method: "PUT",
      url: `/api/v1/uploads/${session.id}/chunks/0`,
      payload: { path: "parallel-result.json", content: firstHalf }
    });
    const conflictingRetryResponse = await app.inject({
      method: "PUT",
      url: `/api/v1/uploads/${session.id}/chunks/0`,
      payload: { path: "parallel-result.json", content: "different" }
    });
    const attachmentResponse = await app.inject({
      method: "PUT",
      url: `/api/v1/uploads/${session.id}/chunks/0`,
      payload: {
        path: "parallel-attachment.txt",
        content: attachmentContent,
        contentEncoding: "base64"
      }
    });

    expect(secondChunkResponse.statusCode).toBe(200);
    expect(firstChunkResponse.statusCode).toBe(200);
    expect(retryChunkResponse.statusCode).toBe(200);
    expect(conflictingRetryResponse.statusCode).toBe(409);
    expect(attachmentResponse.statusCode).toBe(200);

    const completeResponse = await app.inject({
      method: "POST",
      url: `/api/v1/uploads/${session.id}/complete`
    });

    expect(completeResponse.statusCode).toBe(202);
    expect(completeResponse.json()).toEqual(
      expect.objectContaining({
        session: expect.objectContaining({
          id: session.id,
          path: "__parallel__",
          status: "completed",
          receivedChunks: 3,
          progress: 100
        }),
        job: expect.objectContaining({
          status: "queued",
          importedResults: 0,
          storedArtifacts: 0
        })
      })
    );
    const queuedJob = completeResponse.json<{ job: { id: string } }>().job;
    const processResponse = await app.inject({
      method: "POST",
      url: `/api/v1/uploads/${queuedJob.id}/process`
    });

    expect(processResponse.statusCode).toBe(200);
    expect(processResponse.json()).toEqual(
      expect.objectContaining({
        session: expect.objectContaining({
          id: session.id,
          path: "__parallel__",
          status: "completed",
          cleanup: expect.objectContaining({ reason: "completed" })
        }),
        job: expect.objectContaining({
          status: "completed",
          importedResults: 1,
          storedArtifacts: 2
        }),
        imported: [{ path: "parallel-result.json", uuid: "parallel-result", warnings: [] }]
      })
    );
    expect(
      Array.from(store.uploadSessions.get(session.id)?.files.values() ?? []).every(
        (file) => file.chunks.size === 0
      )
    ).toBe(true);
    expect(Array.from(store.artifacts.values())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "parallel-result.json",
          upload: expect.objectContaining({ resultStatus: "passed" }),
          storage: expect.objectContaining({ backend: "s3-compatible" })
        }),
        expect.objectContaining({
          path: "parallel-attachment.txt",
          upload: expect.objectContaining({ resultStatus: "other" })
        })
      ])
    );
  });
});
