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

describe("api app part-13", () => {
  it("validates synthetic upload inspect close flow with retry attempts, attachments, history counters, and quality gate", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);
    const retryAttempt = {
      uuid: "m1-close-retry-attempt",
      testCaseId: "case-m1-close-flow",
      historyId: "history-m1-close-flow",
      fullName: "checkout.synthetic.closeFlow",
      name: "checkout close flow preserves retry metadata",
      status: "passed",
      stage: "finished",
      start: 250,
      stop: 390,
      retry: true,
      statusDetails: {
        flaky: true,
        message: "Recovered on synthetic retry"
      },
      adapterRetryMetadata: {
        attempt: 2,
        reason: "synthetic retry"
      },
      parameters: [{ name: "browser", value: "chromium" }],
      labels: [
        { name: "tag", value: "m1-close-flow" },
        { name: "owner", value: "qa-fixture-agent" }
      ],
      attachments: [
        {
          name: "retry log",
          source: "attachments/retry-log.txt",
          type: "text/plain"
        }
      ],
      steps: [
        {
          name: "Retry checkout submit",
          status: "passed",
          attachments: [
            {
              name: "synthetic screenshot descriptor",
              source: "attachments/retry-screen.png",
              type: "image/png"
            }
          ]
        }
      ]
    };

    const uploadResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "m1-close-first-attempt-result.json",
            content: JSON.stringify({
              uuid: "m1-close-first-attempt",
              testCaseId: "case-m1-close-flow",
              historyId: "history-m1-close-flow",
              fullName: "checkout.synthetic.closeFlow",
              name: "checkout close flow preserves retry metadata",
              status: "failed",
              stage: "finished",
              start: 100,
              stop: 180,
              statusDetails: {
                message: "Synthetic first attempt failure"
              },
              adapterRetryMetadata: {
                attempt: 1,
                reason: "synthetic first attempt"
              },
              parameters: [{ name: "browser", value: "chromium" }],
              attachments: [
                {
                  name: "first attempt log",
                  source: "attachments/first-attempt-log.txt",
                  type: "text/plain"
                }
              ]
            })
          },
          {
            path: "m1-close-retry-attempt-result.json",
            content: JSON.stringify(retryAttempt)
          },
          {
            path: "m1-close-container-container.json",
            content: JSON.stringify({
              uuid: "m1-close-container",
              children: ["m1-close-first-attempt", "m1-close-retry-attempt"],
              befores: [
                {
                  name: "synthetic setup",
                  attachments: [
                    {
                      name: "fixture setup log",
                      source: "attachments/setup-log.txt"
                    }
                  ]
                }
              ]
            })
          },
          {
            path: "attachments/first-attempt-log.txt",
            content: "synthetic first attempt attachment body"
          },
          {
            path: "attachments/retry-log.txt",
            content: "synthetic retry attachment body"
          },
          {
            path: "attachments/retry-screen.png",
            content: "synthetic png descriptor only; no real screenshot bytes"
          }
        ]
      }
    });

    expect(uploadResponse.statusCode).toBe(200);
    const upload = uploadResponse.json<{
      job: {
        id: string;
        status: string;
        receivedFiles: number;
        importedResults: number;
        storedArtifacts: number;
      };
      imported: Array<{ path: string; uuid: string }>;
      artifacts: Array<{ path: string; kind: string; sha256: string; storageKey?: string }>;
      launch: { counters: Record<string, number> };
    }>();
    expect(upload).toEqual(
      expect.objectContaining({
        job: expect.objectContaining({
          status: "completed",
          receivedFiles: 6,
          importedResults: 2,
          storedArtifacts: 6
        }),
        imported: [
          expect.objectContaining({ path: "m1-close-first-attempt-result.json" }),
          expect.objectContaining({ path: "m1-close-retry-attempt-result.json" })
        ],
        artifacts: expect.arrayContaining([
          expect.objectContaining({
            path: "attachments/retry-log.txt",
            sha256: expect.any(String)
          }),
          expect.objectContaining({
            path: "attachments/retry-screen.png",
            sha256: expect.any(String)
          })
        ]),
        launch: expect.objectContaining({
          counters: expect.objectContaining({ failed: 1, passed: 1 })
        })
      })
    );
    expectSafeArtifactMetadata(upload);

    const uploadRetryResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "m1-close-retry-attempt-result.json",
            content: JSON.stringify(retryAttempt)
          }
        ]
      }
    });
    expect(uploadRetryResponse.statusCode).toBe(200);
    expect(uploadRetryResponse.json()).toEqual(
      expect.objectContaining({
        job: expect.objectContaining({
          duplicateResults: 1,
          importedResults: 0,
          storedArtifacts: 0
        }),
        launch: expect.objectContaining({
          counters: expect.objectContaining({ failed: 1, passed: 1 })
        })
      })
    );

    const launchResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}`
    });
    expect(launchResponse.statusCode).toBe(200);
    expect(
      launchResponse.json<{
        status: string;
        results: unknown[];
        counters: Record<string, number>;
      }>()
    ).toEqual(
      expect.objectContaining({
        status: "open",
        counters: expect.objectContaining({ failed: 1, passed: 1 }),
        results: expect.arrayContaining([
          expect.objectContaining({ uuid: "m1-close-first-attempt", status: "failed" }),
          expect.objectContaining({ uuid: "m1-close-retry-attempt", status: "passed" })
        ])
      })
    );

    const detailResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/results/m1-close-retry-attempt`
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toEqual(
      expect.objectContaining({
        uuid: "m1-close-retry-attempt",
        testCaseId: "case-m1-close-flow",
        historyId: "history-m1-close-flow",
        status: "passed",
        attachments: [
          expect.objectContaining({
            name: "retry log",
            source: "attachments/retry-log.txt",
            type: "text/plain",
            scope: "result"
          }),
          expect.objectContaining({
            name: "synthetic screenshot descriptor",
            source: "attachments/retry-screen.png",
            type: "image/png",
            scope: "step",
            stepPath: ["Retry checkout submit"]
          })
        ],
        raw: expect.objectContaining({
          retry: true,
          statusDetails: expect.objectContaining({ flaky: true }),
          adapterRetryMetadata: expect.objectContaining({
            attempt: 2,
            reason: "synthetic retry"
          })
        })
      })
    );

    const closeResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/close`
    });
    expect(closeResponse.statusCode).toBe(200);
    expect(closeResponse.json()).toEqual(
      expect.objectContaining({
        status: "closed",
        counters: expect.objectContaining({ failed: 1, passed: 1 }),
        processedTestCases: 2,
        processingSummary: expect.objectContaining({
          totalResults: 2,
          counters: expect.objectContaining({ failed: 1, passed: 1 }),
          uploadJobs: expect.objectContaining({
            total: 2,
            completed: 2,
            receivedFiles: 7,
            importedResults: 2,
            duplicateResults: 1,
            storedArtifacts: 6
          })
        }),
        closePipeline: expect.objectContaining({
          status: "closed",
          pendingUploads: [],
          errors: []
        })
      })
    );

    const historyResponse = await app.inject({
      method: "GET",
      url: "/api/v1/test-cases/case-m1-close-flow/history"
    });
    expect(historyResponse.statusCode).toBe(200);
    expect(historyResponse.json()).toEqual(
      expect.objectContaining({
        kind: "test-case-history",
        testCaseId: "case-m1-close-flow",
        totalPoints: 2,
        points: [
          expect.objectContaining({
            launchId: launch.id,
            resultUuid: "m1-close-first-attempt",
            status: "failed",
            historyId: "history-m1-close-flow",
            retry: false,
            attemptNumber: 1,
            parameters: [expect.objectContaining({ name: "browser", value: "chromium" })]
          }),
          expect.objectContaining({
            launchId: launch.id,
            resultUuid: "m1-close-retry-attempt",
            status: "passed",
            historyId: "history-m1-close-flow",
            retry: true,
            flaky: true,
            attemptNumber: 2,
            parameters: [expect.objectContaining({ name: "browser", value: "chromium" })]
          })
        ]
      })
    );

    const qualityGateResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/quality-gate`
    });
    expect(qualityGateResponse.statusCode).toBe(200);
    expect(qualityGateResponse.json()).toEqual(
      expect.objectContaining({
        status: "failed",
        statusCounters: expect.objectContaining({ failed: 1, passed: 1 }),
        metrics: expect.objectContaining({
          total: 2,
          failed: 1,
          passed: 1,
          passRate: 50
        }),
        reasons: expect.arrayContaining([
          expect.objectContaining({
            code: "quality_gate.failedBrokenTotal",
            passed: false,
            actual: 1
          })
        ])
      })
    );
  });

  it("returns deterministic machine-readable quality gate explanations", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);

    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "critical-result.json",
            content: JSON.stringify({
              uuid: "critical-result",
              testCaseId: "case-critical",
              historyId: "history-critical",
              name: "critical checkout",
              status: "failed",
              labels: [{ name: "severity", value: "critical" }]
            })
          },
          {
            path: "broken-result.json",
            content: JSON.stringify({
              uuid: "broken-result",
              testCaseId: "case-broken",
              historyId: "history-broken",
              name: "broken payment",
              status: "broken"
            })
          },
          {
            path: "unknown-result.json",
            content: JSON.stringify({
              uuid: "unknown-result",
              testCaseId: "case-unknown",
              historyId: "history-unknown",
              name: "unknown order state",
              status: "unknown"
            })
          },
          {
            path: "passed-result.json",
            content: JSON.stringify({
              uuid: "passed-result",
              testCaseId: "case-passed",
              historyId: "history-passed",
              name: "passed login",
              status: "passed"
            })
          }
        ]
      }
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/quality-gate`
    });

    expect(response.statusCode).toBe(200);
    const evaluation = response.json<QualityGateEvaluationResponse>();
    expect(evaluation.status).toBe("failed");
    expect(evaluation.statusCounters).toEqual({
      failed: 1,
      broken: 1,
      passed: 1,
      skipped: 0,
      unknown: 1
    });
    expect(evaluation.metrics).toEqual(
      expect.objectContaining({
        total: 4,
        failed: 1,
        broken: 1,
        unknown: 1,
        passed: 1,
        passRate: 25,
        newFailures: 2,
        failedBrokenTotal: 2,
        criticalFailures: 1,
        flakyTests: 0,
        durationRegressions: 0
      })
    );
    expect(evaluation.reasons.map((reason) => reason.code)).toEqual([
      "quality_gate.newFailures",
      "quality_gate.failedBrokenTotal",
      "quality_gate.criticalFailures",
      "quality_gate.flakyTests",
      "quality_gate.durationRegressions",
      "quality_gate.unknown",
      "quality_gate.passRate",
      "quality_gate.rule.failed.lte",
      "quality_gate.rule.broken.lte",
      "quality_gate.rule.unknown.lte",
      "quality_gate.rule.passRate.gte"
    ]);
    expect(evaluation.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "quality_gate.newFailures",
          severity: "fail",
          passed: false,
          actual: 2,
          op: "lte",
          threshold: 0,
          explanation: "New failures failed: actual 2 lte threshold 0.",
          affectedTestCaseIds: expect.arrayContaining(["case-critical", "case-broken"]),
          affectedResultUuids: []
        }),
        expect.objectContaining({
          code: "quality_gate.criticalFailures",
          severity: "fail",
          passed: false,
          actual: 1,
          op: "lte",
          threshold: 0,
          explanation: "Critical labelled failures failed: actual 1 lte threshold 0.",
          affectedTestCaseIds: ["case-critical"],
          affectedResultUuids: ["critical-result"]
        })
      ])
    );
    expect(evaluation.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actual: 1, expected: 0 }),
        expect.objectContaining({ actual: 25, expected: 95 })
      ])
    );
  });

  it("lists launches by project and filters status and branch", async () => {
    app = await createApiApp();
    const project = await createProject(app);

    const mainLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Main", branch: "main" }
    });
    const releaseLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Release", branch: "release" }
    });
    const releaseLaunch = releaseLaunchResponse.json<LaunchResponse>();

    await app.inject({ method: "POST", url: `/api/v1/launches/${releaseLaunch.id}/close` });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/launches?status=open&branch=main`
    });

    expect(mainLaunchResponse.statusCode).toBe(201);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        kind: "launch-list",
        page: expect.objectContaining({ total: 1, returned: 1 }),
        items: [
          expect.objectContaining({
            name: "Main",
            status: "open",
            branch: "main",
            createdAt: expect.any(String)
          })
        ]
      })
    );
  });
});
