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

describe("api app part-19", () => {
  it("makes launch close idempotent without duplicating test case history", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);

    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "idempotent-result.json",
            content: JSON.stringify({
              uuid: "idempotent-result",
              testCaseId: "case-idempotent",
              name: "idempotent close",
              status: "passed"
            })
          }
        ]
      }
    });

    const firstCloseResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/close`
    });
    const secondCloseResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/close`
    });

    expect(firstCloseResponse.statusCode).toBe(200);
    expect(secondCloseResponse.statusCode).toBe(200);
    const firstClose = firstCloseResponse.json<{ closedAt: string; processedTestCases: number }>();
    expect(secondCloseResponse.json()).toEqual(
      expect.objectContaining({
        status: "closed",
        closedAt: firstClose.closedAt,
        processedTestCases: firstClose.processedTestCases,
        closePipeline: expect.objectContaining({
          status: "closed",
          processedTestCases: 1
        })
      })
    );

    const detailResponse = await app.inject({
      method: "GET",
      url: "/api/v1/test-cases/case-idempotent"
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(
      detailResponse.json<{ history: unknown[]; testCase: { historyVersions: unknown[] } }>()
    ).toEqual(
      expect.objectContaining({
        history: [expect.objectContaining({ launchId: launch.id, status: "passed" })],
        testCase: expect.objectContaining({
          historyVersions: [
            expect.objectContaining({ launchId: launch.id, resultUuid: "idempotent-result" })
          ]
        })
      })
    );
  });

  it("surfaces upload import errors in launch close processing summary", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);

    const uploadResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "valid-result.json",
            content: JSON.stringify({ uuid: "valid-result", name: "valid", status: "passed" })
          },
          {
            path: "invalid-result.json",
            content: JSON.stringify({ uuid: "invalid-result" })
          }
        ]
      }
    });
    expect(uploadResponse.statusCode).toBe(207);

    const closeResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/close`
    });

    expect(closeResponse.statusCode).toBe(200);
    expect(closeResponse.json()).toEqual(
      expect.objectContaining({
        status: "closed",
        processedTestCases: 1,
        processingSummary: expect.objectContaining({
          totalResults: 1,
          uploadJobs: expect.objectContaining({
            total: 1,
            completedWithErrors: 1,
            receivedFiles: 2,
            importedResults: 1,
            storedArtifacts: 2
          })
        }),
        errors: [
          expect.objectContaining({
            scope: "upload",
            path: "invalid-result.json"
          })
        ],
        closePipeline: expect.objectContaining({
          status: "closed",
          errors: [
            expect.objectContaining({
              scope: "upload",
              path: "invalid-result.json"
            })
          ]
        })
      })
    );
  });

  it("archives closed launches and rejects further uploads", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    const launchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Archive me", branch: "main" }
    });
    const launch = launchResponse.json<LaunchResponse>();

    const openArchiveResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/archive`
    });
    expect(openArchiveResponse.statusCode).toBe(409);

    await app.inject({ method: "POST", url: `/api/v1/launches/${launch.id}/close` });
    const closedUploadResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "after-close-result.json",
            content: JSON.stringify({ uuid: "after-close", name: "after", status: "passed" })
          }
        ]
      }
    });
    const closedChunkedResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/uploads/chunked`,
      payload: { path: "after-close-result.json", totalChunks: 1 }
    });
    expect(closedUploadResponse.statusCode).toBe(409);
    expect(closedChunkedResponse.statusCode).toBe(409);

    const archiveResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/archive`
    });

    expect(archiveResponse.statusCode).toBe(200);
    expect(archiveResponse.json()).toEqual(
      expect.objectContaining({
        launch: expect.objectContaining({
          id: launch.id,
          status: "archived",
          archivedAt: expect.any(String)
        })
      })
    );

    const uploadResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "after-archive-result.json",
            content: JSON.stringify({ uuid: "after-archive", name: "after", status: "passed" })
          }
        ]
      }
    });
    const archivedChunkedResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/uploads/chunked`,
      payload: { path: "after-archive-result.json", totalChunks: 1 }
    });
    const archivedListResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/launches?status=archived`
    });

    expect(uploadResponse.statusCode).toBe(409);
    expect(archivedChunkedResponse.statusCode).toBe(409);
    expect(archivedListResponse.statusCode).toBe(200);
    expect(archivedListResponse.json()).toEqual(
      expect.objectContaining({
        kind: "launch-list",
        page: expect.objectContaining({ total: 1, returned: 1 }),
        items: [
          expect.objectContaining({
            id: launch.id,
            status: "archived"
          })
        ]
      })
    );
  });

  it("evaluates quality gates with custom rules", async () => {
    app = await createApiApp();
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
      url: `/api/v1/launches/${launch.id}/quality-gate`,
      payload: {
        rules: [
          { metric: "failed", op: "lte", value: 1, severity: "fail" },
          { metric: "passRate", op: "gte", value: 50, severity: "warn" }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        status: "passed",
        metrics: expect.objectContaining({ total: 2, passRate: 50 }),
        violations: []
      })
    );
  });

  it("exposes mute-aware quality gate effects without hiding raw failures", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);

    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "muted-api-result.json",
            content: JSON.stringify({
              uuid: "muted-api-result",
              testCaseId: "case-muted-api",
              historyId: "history-muted-api",
              name: "muted API failure",
              status: "failed",
              statusDetails: {
                message: "Synthetic product failure without private values"
              }
            })
          }
        ]
      }
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/quality-gate`,
      payload: {
        rules: [],
        thresholds: {
          newFailures: { op: "lte", value: 1, severity: "fail" },
          failedBrokenTotal: { op: "lte", value: 0, severity: "fail" },
          passRate: { op: "gte", value: 0, severity: "warn" }
        },
        defectMutes: [
          {
            id: "mute-api-1",
            status: "active",
            scope: { testCaseIds: ["case-muted-api"] },
            reason: "Synthetic incident mute",
            origin: { type: "actor", actorId: "qa-api-agent" },
            mutedAt: "2026-05-30T10:00:00.000Z",
            affectedSignatureHashes: ["signature-muted-api"],
            affectedTestIds: ["case-muted-api"],
            auditEvents: [
              {
                id: "defect-mute-event:mute-api-1:defect.muted:2026-05-30T10:00:00.000Z",
                type: "defect.muted",
                muteId: "mute-api-1",
                occurredAt: "2026-05-30T10:00:00.000Z",
                origin: { type: "actor", actorId: "qa-api-agent" },
                scope: { testCaseIds: ["case-muted-api"] },
                reason: "Synthetic incident mute",
                affectedSignatureHashes: ["signature-muted-api"],
                affectedTestIds: ["case-muted-api"]
              }
            ]
          }
        ],
        defectMuteRules: [
          {
            code: "mute-failed-broken-total",
            reasonCode: "quality_gate.failedBrokenTotal",
            mode: "exclude_muted_affected_tests"
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    const evaluation = response.json<QualityGateEvaluationResponse>();
    expect(evaluation).toEqual(
      expect.objectContaining({
        status: "passed",
        rawStatus: "failed",
        metrics: expect.objectContaining({
          total: 1,
          failed: 1,
          failedBrokenTotal: 1,
          passRate: 0
        }),
        statusCounters: expect.objectContaining({ failed: 1 })
      })
    );
    expect(evaluation.violations).toEqual([]);
    expect(evaluation.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "quality_gate.failedBrokenTotal",
          passed: false,
          effectivePassed: true,
          actual: 1,
          effectiveActual: 0,
          affectedTestCaseIds: ["case-muted-api"],
          affectedResultUuids: ["muted-api-result"],
          effects: [
            expect.objectContaining({
              type: "defect_mute",
              ruleCode: "mute-failed-broken-total",
              reasonCode: "quality_gate.failedBrokenTotal",
              muteIds: ["mute-api-1"],
              affectedTestCaseIds: ["case-muted-api"],
              affectedSignatureHashes: ["signature-muted-api"],
              originalActual: 1,
              effectiveActual: 0
            })
          ]
        })
      ])
    );
    expect(evaluation.effects).toEqual([
      expect.objectContaining({
        type: "defect_mute",
        ruleCode: "mute-failed-broken-total",
        originalActual: 1,
        effectiveActual: 0
      })
    ]);
  });

  it("returns project- and actor-scoped defect mute projections with raw and effective gate values", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    const tokenResponse = await app.inject({
      headers: {
        "x-testhistory-actor-id": "project-owner",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-scopes": "settings:write"
      },
      method: "POST",
      payload: {
        expiresAt: "2099-09-01T00:00:00.000Z",
        name: "Defect projection reader",
        ownerSubject: "svc-defects",
        scopes: ["defects:read"]
      },
      url: `/api/v1/projects/${project.id}/settings/access/tokens`
    });
    const defectReadToken = tokenResponse.json<{ secret: string }>();
    const launchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Projection source" }
    });
    const otherProject = await createProject(app);
    const otherLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${otherProject.id}/launches`,
      payload: { name: "Other projection source" }
    });
    const launch = launchResponse.json<LaunchResponse>();
    const otherLaunch = otherLaunchResponse.json<LaunchResponse>();

    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "projection-muted-result.json",
            content: JSON.stringify({
              uuid: "projection-muted-result",
              testCaseId: "case-projection-muted",
              name: "projection muted failure",
              status: "failed",
              statusDetails: {
                message:
                  "Authorization: Bearer raw-projection-token C:\\Users\\tester\\Downloads\\secret.txt storageKey=raw-storage signedUrl=https://object.test/file?token=raw"
              }
            })
          }
        ]
      }
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${otherLaunch.id}/results/json`,
      payload: {
        files: [
          {
            path: "other-projection-result.json",
            content: JSON.stringify({
              uuid: "other-projection-result",
              testCaseId: "case-other-projection",
              name: "other projection failure",
              status: "failed"
            })
          }
        ]
      }
    });

    const response = await app.inject({
      method: "GET",
      url:
        `/api/v1/projects/${project.id}/defect-mutes/projection` +
        `?launchId=${launch.id}&actorId=qa-api-agent&limit=1`,
      headers: {
        "x-testhistory-scopes": "defects:read",
        "x-testhistory-project-scope": project.id
      }
    });
    const bearerResponse = await app.inject({
      headers: {
        authorization: `Bearer ${defectReadToken.secret}`
      },
      method: "GET",
      url:
        `/api/v1/projects/${project.id}/defect-mutes/projection` +
        `?launchId=${launch.id}&actorId=qa-api-agent&limit=1`
    });

    expect(response.statusCode).toBe(200);
    expect(bearerResponse.statusCode).toBe(200);
    expect(JSON.stringify(bearerResponse.json())).not.toContain(defectReadToken.secret);
    const projection = response.json<{
      kind: string;
      projectId: string;
      actor: { actorId: string; scoped: boolean };
      access: {
        projectScoped: boolean;
        actorScoped: boolean;
        mutation: boolean;
        redacted: boolean;
      };
      query: { projectId: string; actorId: string; launchId: string; limit: number; cursor: null };
      projection: {
        boundary: string;
        consistency: string;
        replayStatus: string;
        mutationBoundary: string;
        eventCount: number;
        activeMuteCount: number;
        rawFailureOccurrenceCount: number;
        projectionDigest: string;
      };
      page: { limit: number; returned: number; total: number; hasMore: boolean };
      rawFailureHistory: {
        totalOccurrences: number;
        statusCounters: { failed: number; broken: number };
        byTestId: Record<string, number>;
      };
      effectiveState: {
        projectId: string;
        activeMuteIds: string[];
        inactiveMuteIds: string[];
        records: Array<{ id: string; projectId: string; status: "active" | "inactive" }>;
      };
      qualityGate: {
        launchId: string;
        raw: {
          status: "passed" | "warning" | "failed";
          metrics: Record<string, number>;
          statusCounters: Record<string, number>;
        };
        effective: {
          status: "passed" | "warning" | "failed";
          effects: Array<{
            type: "defect_mute";
            originalActual: number;
            effectiveActual: number;
          }>;
          reasons: Array<{
            code: string;
            actual: number;
            effectiveActual: number;
            passed: boolean;
            effectivePassed: boolean;
          }>;
        };
      };
      items: Array<{
        id: string;
        projectId: string;
        status: "active" | "inactive";
        origin: { type: "actor"; actorId: string };
        rawFailureHistory: {
          totalOccurrences: number;
          statusCounters: { failed: number; broken: number };
          byTestId: Record<string, number>;
          bySignatureHash: Record<string, number>;
        };
        audit: { eventCount: number; mutedEventCount: number; unmutedEventCount: number };
      }>;
    }>();
    expect(projection).toEqual(
      expect.objectContaining({
        kind: "defect-mute-projection",
        projectId: project.id,
        actor: { type: "actor", actorId: "qa-api-agent", scoped: true },
        access: {
          scope: "defects:read",
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        query: {
          projectId: project.id,
          actorId: "qa-api-agent",
          launchId: launch.id,
          limit: 1,
          cursor: null
        },
        projection: expect.objectContaining({
          boundary: "worker-local-mute-projection",
          consistency: "append-only-replay",
          replayStatus: "replayed",
          mutationBoundary: "worker-projection-only-no-rest-mutation",
          eventCount: 1,
          activeMuteCount: 1,
          rawFailureOccurrenceCount: 1,
          projectionDigest: expect.any(String)
        }),
        page: expect.objectContaining({ limit: 1, returned: 1, total: 1, hasMore: false })
      })
    );
    expect(projection.items).toEqual([
      expect.objectContaining({
        projectId: project.id,
        status: "active",
        origin: { type: "actor", actorId: "qa-api-agent" },
        rawFailureHistory: expect.objectContaining({
          totalOccurrences: 1,
          statusCounters: { failed: 1, broken: 0 }
        }),
        audit: { eventCount: 1, mutedEventCount: 1, unmutedEventCount: 0 }
      })
    ]);
    expect(projection.rawFailureHistory).toEqual(
      expect.objectContaining({
        totalOccurrences: 1,
        statusCounters: { failed: 1, broken: 0 },
        byTestId: { "case-projection-muted": 1 }
      })
    );
    expect(projection.effectiveState).toEqual(
      expect.objectContaining({
        projectId: project.id,
        activeMuteIds: [projection.items[0]!.id],
        inactiveMuteIds: [],
        records: [
          expect.objectContaining({
            id: projection.items[0]!.id,
            projectId: project.id,
            status: "active"
          })
        ]
      })
    );
    expect(projection.qualityGate.raw).toEqual(
      expect.objectContaining({
        status: "failed",
        metrics: expect.objectContaining({ failed: 1, failedBrokenTotal: 1 }),
        statusCounters: expect.objectContaining({ failed: 1 })
      })
    );
    expect(projection.qualityGate.effective).toEqual(
      expect.objectContaining({
        status: "passed",
        effects: expect.arrayContaining([
          expect.objectContaining({
            type: "defect_mute",
            originalActual: 1,
            effectiveActual: 0
          })
        ]),
        reasons: expect.arrayContaining([
          expect.objectContaining({
            code: "quality_gate.failedBrokenTotal",
            actual: 1,
            effectiveActual: 0,
            passed: false,
            effectivePassed: true
          })
        ])
      })
    );
    expect(JSON.stringify(projection)).not.toContain(otherProject.id);
    expect(JSON.stringify(projection)).not.toContain("case-other-projection");
    expect(JSON.stringify(projection)).not.toContain("raw-projection-token");
    expect(JSON.stringify(projection)).not.toContain("raw-storage");
    expect(JSON.stringify(projection)).not.toContain("signedUrl");
    expect(JSON.stringify(projection)).not.toContain("Downloads");

    const otherActorResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/projects/${project.id}/defect-mutes/projection` +
        `?launchId=${launch.id}&actorId=other-actor`,
      headers: {
        "x-testhistory-scopes": "defects:read",
        "x-testhistory-project-scope": project.id
      }
    });
    expect(otherActorResponse.statusCode).toBe(200);
    expect(otherActorResponse.json()).toEqual(
      expect.objectContaining({
        actor: { type: "actor", actorId: "other-actor", scoped: true },
        projection: expect.objectContaining({ eventCount: 0, activeMuteCount: 0 }),
        page: expect.objectContaining({ total: 0, returned: 0 }),
        effectiveState: expect.objectContaining({
          projectId: project.id,
          activeMuteIds: [],
          inactiveMuteIds: []
        }),
        qualityGate: expect.objectContaining({
          raw: expect.objectContaining({ status: "failed" }),
          effective: expect.objectContaining({ status: "failed", effects: [] })
        }),
        items: []
      })
    );
  });
});
