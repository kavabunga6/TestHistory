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

describe("api app part-15", () => {
  it("returns paginated safe test case history with identity and retry attempts", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);

    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "history-attempt-1-result.json",
            content: JSON.stringify({
              uuid: "history-attempt-1",
              testCaseId: "case-history-parity",
              historyId: "history-parity",
              fullName: "shop.history.parity",
              name: "history parity",
              status: "failed",
              start: 100,
              stop: 140,
              parameters: [
                { name: "browser", value: "chromium" },
                { name: "token", value: "synthetic-token", mode: "masked" },
                { name: "apiToken", value: "synthetic-hidden-token", mode: "hidden" }
              ]
            })
          },
          {
            path: "history-attempt-2-result.json",
            content: JSON.stringify({
              uuid: "history-attempt-2",
              testCaseId: "case-history-parity",
              historyId: "history-parity",
              fullName: "shop.history.parity",
              name: "history parity",
              status: "passed",
              start: 150,
              stop: 175,
              retry: true,
              statusDetails: { flaky: true, message: "Recovered after retry" },
              parameters: [
                { name: "browser", value: "chromium" },
                { name: "token", value: "synthetic-token", mode: "masked" },
                { name: "apiToken", value: "synthetic-hidden-token", mode: "hidden" }
              ]
            })
          }
        ]
      }
    });

    const firstPageResponse = await app.inject({
      method: "GET",
      url: `/api/v1/test-cases/case-history-parity/history?projectId=${launch.projectId}&limit=1`
    });
    const secondPageResponse = await app.inject({
      method: "GET",
      url: `/api/v1/test-cases/case-history-parity/history?projectId=${launch.projectId}&limit=1&cursor=1`
    });
    const detailResponse = await app.inject({
      method: "GET",
      url: `/api/v1/test-cases/case-history-parity?projectId=${launch.projectId}`
    });

    expect(firstPageResponse.statusCode).toBe(200);
    expect(secondPageResponse.statusCode).toBe(200);
    expect(detailResponse.statusCode).toBe(200);

    const firstPage = firstPageResponse.json<{
      kind: string;
      totalPoints: number;
      returnedPoints: number;
      page: { limit: number; nextCursor: string };
      identity: { source: string; explanation: string };
      points: Array<{
        resultUuid: string;
        attemptIndex: number;
        attemptNumber: number;
        retry: boolean;
        identity: { source: string; explanation: string };
        parameters: Array<{ name: string; value?: string; mode?: string }>;
      }>;
    }>();
    const secondPage = secondPageResponse.json<{
      page: { cursor: string; nextCursor: string | null };
      points: Array<{
        resultUuid: string;
        attemptIndex: number;
        attemptNumber: number;
        retry: boolean;
        flaky: boolean;
        statusDetails?: { flaky?: boolean; message?: string };
        parameters: Array<{ name: string; value?: string; mode?: string }>;
      }>;
    }>();

    expect(firstPage).toEqual(
      expect.objectContaining({
        kind: "test-case-history",
        totalPoints: 2,
        returnedPoints: 1,
        page: expect.objectContaining({ limit: 1, nextCursor: "1" }),
        identity: expect.objectContaining({
          source: "testCaseId",
          explanation: expect.stringContaining("testCaseId")
        })
      })
    );
    expect(firstPage.points[0]).toEqual(
      expect.objectContaining({
        resultUuid: "history-attempt-1",
        attemptIndex: 0,
        attemptNumber: 1,
        retry: false,
        identity: expect.objectContaining({ source: "testCaseId" }),
        parameters: [
          { name: "browser", value: "chromium" },
          { name: "token", value: "***", mode: "masked" },
          { name: "apiToken", mode: "hidden" }
        ]
      })
    );
    expect(secondPage.points[0]).toEqual(
      expect.objectContaining({
        resultUuid: "history-attempt-2",
        attemptIndex: 1,
        attemptNumber: 2,
        retry: true,
        flaky: true,
        statusDetails: { flaky: true, message: "Recovered after retry" },
        parameters: [
          { name: "browser", value: "chromium" },
          { name: "token", value: "***", mode: "masked" },
          { name: "apiToken", mode: "hidden" }
        ]
      })
    );
    expect(secondPage.page).toEqual(expect.objectContaining({ cursor: "1", nextCursor: null }));
    expect(detailResponse.json<{ history: unknown[] }>().history).toHaveLength(2);
    expect(firstPageResponse.body).not.toContain("synthetic-token");
    expect(secondPageResponse.body).not.toContain("synthetic-hidden-token");
  });

  it("returns paginated actor-scoped redacted test case history comparisons", async () => {
    app = await createApiApp();
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      payload: { key: "CMP", name: "Compare project" }
    });
    expect(projectResponse.statusCode).toBe(201);
    const project = projectResponse.json<ProjectResponse>();

    const baseLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: {
        name: "Compare base",
        branch: "main",
        buildNumber: "100",
        commitSha: "abc123"
      }
    });
    const targetLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: {
        name: "Compare target",
        branch: "release/1.0",
        buildNumber: "101",
        commitSha: "def456"
      }
    });
    expect(baseLaunchResponse.statusCode).toBe(201);
    expect(targetLaunchResponse.statusCode).toBe(201);
    const baseLaunch = baseLaunchResponse.json<LaunchResponse>();
    const targetLaunch = targetLaunchResponse.json<LaunchResponse>();

    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${baseLaunch.id}/results/json`,
      payload: {
        files: [
          {
            path: "compare-base-result.json",
            content: JSON.stringify({
              uuid: "compare-base",
              testCaseId: "case-history-compare",
              historyId: "history-compare",
              fullName: "shop.history.compare",
              name: "history compare",
              status: "failed",
              start: 100,
              stop: 220,
              statusDetails: {
                message: "token: synthetic-compare-token",
                trace: "hidden synthetic-compare-hidden"
              },
              labels: [
                { name: "feature", value: "checkout" },
                { name: "layer", value: "api" },
                { name: "apiToken", value: "synthetic-compare-token" }
              ],
              parameters: [
                { name: "browser", value: "chromium" },
                { name: "token", value: "synthetic-compare-token", mode: "masked" },
                { name: "apiToken", value: "synthetic-compare-hidden", mode: "hidden" }
              ]
            })
          },
          {
            path: "executor.json",
            content: JSON.stringify({
              name: "GitHub Actions",
              type: "ci",
              buildName: "base-build",
              buildUrl: "https://ci.example/build/100?token=executor-secret",
              reportUrl: "https://reports.example/base?signature=executor-signature"
            })
          }
        ]
      }
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${targetLaunch.id}/results/json`,
      payload: {
        files: [
          {
            path: "compare-target-result.json",
            content: JSON.stringify({
              uuid: "compare-target",
              testCaseId: "case-history-compare",
              historyId: "history-compare",
              fullName: "shop.history.compare",
              name: "history compare",
              status: "passed",
              start: 300,
              stop: 360,
              retry: true,
              statusDetails: {
                flaky: true,
                message: "Recovered synthetic-compare-token",
                trace: "no hidden synthetic-compare-hidden after retry"
              },
              labels: [
                { name: "feature", value: "checkout" },
                { name: "layer", value: "web" },
                { name: "owner", value: "qa" }
              ],
              parameters: [
                { name: "browser", value: "firefox" },
                { name: "region", value: "eu" },
                { name: "token", value: "synthetic-compare-token", mode: "masked" },
                { name: "apiToken", value: "synthetic-compare-hidden", mode: "hidden" }
              ]
            })
          },
          {
            path: "executor.json",
            content: JSON.stringify({
              name: "Buildkite",
              type: "ci",
              buildName: "target-build",
              buildUrl: "https://ci.example/build/101?token=executor-secret",
              reportUrl: "https://reports.example/target?signature=executor-signature"
            })
          }
        ]
      }
    });

    const compareHeaders = {
      "x-testhistory-scopes": "test-cases:read",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-actor-id": "compare-reader"
    };
    const tokenResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/settings/access/tokens`,
      headers: {
        "x-testhistory-scopes": "settings:write",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "project-owner"
      },
      payload: {
        name: "History compare reader",
        ownerSubject: "ci/history-compare",
        scopes: ["test-cases:read"]
      }
    });
    expect(tokenResponse.statusCode).toBe(201);
    const apiToken = tokenResponse.json<{ secret: string }>();
    const response = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-history-compare/history/compare?projectId=${project.id}` +
        "&baseResultUuid=compare-base&targetResultUuid=compare-target&limit=50",
      headers: compareHeaders
    });
    const pagedResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-history-compare/history/compare?projectId=${project.id}` +
        "&baseResultUuid=compare-base&targetResultUuid=compare-target&limit=2",
      headers: compareHeaders
    });
    const repeatResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-history-compare/history/compare?projectId=${project.id}` +
        "&baseResultUuid=compare-base&targetResultUuid=compare-target&limit=50",
      headers: compareHeaders
    });
    const secondPageResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-history-compare/history/compare?projectId=${project.id}` +
        "&baseResultUuid=compare-base&targetResultUuid=compare-target&limit=2&cursor=2",
      headers: compareHeaders
    });
    const beyondPageResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-history-compare/history/compare?projectId=${project.id}` +
        "&baseResultUuid=compare-base&targetResultUuid=compare-target&limit=2&cursor=500",
      headers: compareHeaders
    });
    const bearerResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-history-compare/history/compare?projectId=${project.id}` +
        "&baseResultUuid=compare-base&targetResultUuid=compare-target&limit=50",
      headers: {
        authorization: `Bearer ${apiToken.secret}`
      }
    });

    expect(response.statusCode).toBe(200);
    expect(bearerResponse.statusCode).toBe(200);
    expect(pagedResponse.statusCode).toBe(200);
    expect(repeatResponse.statusCode).toBe(200);
    expect(secondPageResponse.statusCode).toBe(200);
    expect(beyondPageResponse.statusCode).toBe(200);
    const compare = response.json<{
      id: string;
      kind: string;
      projectId: string;
      actor: { type: string; actorId: string; scoped: boolean };
      access: {
        scope: string;
        projectScoped: boolean;
        actorScoped: boolean;
        mutation: boolean;
        redacted: boolean;
      };
      availability: {
        status: string;
        projectScoped: boolean;
        actorScoped: boolean;
        partial: boolean;
        unavailable: string[];
        redacted: boolean;
      };
      totalChanges: number;
      returnedChanges: number;
      base: { resultUuid: string; status: string; durationMs: number; branch: string };
      target: { resultUuid: string; status: string; durationMs: number; branch: string };
      enrichment: {
        status: string;
        redacted: boolean;
        fields: Record<string, { status: string; base: boolean; target: boolean }>;
        unavailable: string[];
      };
      summary: { total: number; risk: number; signal: number };
      redaction: {
        rawResultsIncluded: boolean;
        rawStatusDetailsIncluded: boolean;
        hiddenOrMaskedValuesIncluded: boolean;
        tokensIncluded: boolean;
        pathsIncluded: boolean;
        storageLocationsIncluded: boolean;
        artifactUrlsIncluded: boolean;
      };
      changes: Array<{
        kind: string;
        subject: string;
        change: string;
        severity: string;
        before: string[];
        after: string[];
        context: Record<string, string | string[]>;
        explanation: string;
        redacted: true;
      }>;
    }>();
    const paged = pagedResponse.json<{
      page: { limit: number; returned: number; nextCursor: string | null; hasMore: boolean };
      changes: unknown[];
    }>();
    const repeated = repeatResponse.json<{ id: string; changes: unknown[] }>();
    const secondPage = secondPageResponse.json<{
      page: { cursor: string | null; offset: number; returned: number; nextCursor: string | null };
      changes: unknown[];
    }>();
    const beyondPage = beyondPageResponse.json<{
      page: { cursor: string | null; offset: number; returned: number; nextCursor: string | null };
      returnedChanges: number;
      omittedChanges: number;
      changes: unknown[];
    }>();

    expect(compare).toEqual(
      expect.objectContaining({
        kind: "test-case-history-compare",
        projectId: project.id,
        actor: { type: "actor", actorId: "compare-reader", scoped: true },
        access: {
          scope: "test-cases:read",
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        availability: {
          status: "ready",
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          partial: false,
          unavailable: []
        },
        totalChanges: expect.any(Number),
        returnedChanges: expect.any(Number),
        base: expect.objectContaining({
          resultUuid: "compare-base",
          status: "failed",
          durationMs: 120,
          branch: "main",
          buildNumber: "100",
          commitSha: "abc123"
        }),
        target: expect.objectContaining({
          resultUuid: "compare-target",
          status: "passed",
          durationMs: 60,
          branch: "release/1.0",
          buildNumber: "101",
          commitSha: "def456"
        })
      })
    );
    expect(compare.id).toMatch(/^history-compare:/);
    expect(compare.summary).toEqual(
      expect.objectContaining({ total: compare.totalChanges, risk: 0, signal: expect.any(Number) })
    );
    expect(compare.redaction).toEqual({
      rawResultsIncluded: false,
      rawStatusDetailsIncluded: false,
      hiddenOrMaskedValuesIncluded: false,
      tokensIncluded: false,
      pathsIncluded: false,
      storageLocationsIncluded: false,
      artifactUrlsIncluded: false
    });
    expect(compare.enrichment).toEqual({
      status: "ready",
      redacted: true,
      unavailable: [],
      fields: expect.objectContaining({
        "launch.branch": { status: "ready", base: true, target: true },
        "launch.buildNumber": { status: "ready", base: true, target: true },
        "launch.commitSha": { status: "ready", base: true, target: true },
        "executor.buildUrl": { status: "ready", base: true, target: true },
        "executor.reportUrl": { status: "ready", base: true, target: true }
      })
    });
    expect(compare.totalChanges).toBeGreaterThan(5);
    expect(compare.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "branch",
          subject: "branch",
          change: "changed",
          before: ["main"],
          after: ["release/1.0"],
          redacted: true
        }),
        expect.objectContaining({
          kind: "build",
          subject: "buildNumber",
          change: "changed",
          before: ["100"],
          after: ["101"]
        }),
        expect.objectContaining({
          kind: "executor",
          subject: "executor.buildName",
          change: "changed",
          before: ["base-build"],
          after: ["target-build"]
        }),
        expect.objectContaining({
          kind: "label",
          subject: "layer",
          change: "changed",
          before: ["api"],
          after: ["web"]
        }),
        expect.objectContaining({
          kind: "defect",
          subject: "failure-signature",
          change: "removed",
          severity: "signal",
          after: []
        })
      ])
    );
    expect(repeated.id).toBe(compare.id);
    expect(repeated.changes).toEqual(compare.changes);
    expect(paged.page).toEqual(
      expect.objectContaining({ limit: 2, returned: 2, nextCursor: "2", hasMore: true })
    );
    expect(paged.changes).toHaveLength(2);
    expect(secondPage.page).toEqual(
      expect.objectContaining({ cursor: "2", offset: 2, returned: 2, nextCursor: "4" })
    );
    expect(secondPage.changes).toHaveLength(2);
    expect(beyondPage).toEqual(
      expect.objectContaining({
        returnedChanges: 0,
        omittedChanges: 0,
        page: expect.objectContaining({
          cursor: String(compare.totalChanges),
          offset: compare.totalChanges,
          returned: 0,
          nextCursor: null
        }),
        changes: []
      })
    );
    expectSafeArtifactMetadata(compare, [
      "compare-base-result.json",
      "compare-target-result.json",
      "executor.json",
      "synthetic-compare-token",
      "synthetic-compare-hidden",
      "executor-secret",
      "executor-signature"
    ]);
    expect(pagedResponse.body).not.toContain("synthetic-compare-token");
    expect(secondPageResponse.body).not.toContain("executor-secret");
    expect(beyondPageResponse.body).not.toContain("executor-signature");
    expect(bearerResponse.body).not.toContain(apiToken.secret);
  });
});
