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

describe("api app part-14", () => {
  it("keeps search/list endpoints bounded across synthetic 10k launch and result sets", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = {
      id: "scale-project",
      key: "SCALE",
      name: "Scale project",
      createdAt: "2026-05-30T00:00:00.000Z"
    };
    store.projects.set(project.id, project);

    for (let index = 0; index < 10_000; index += 1) {
      store.launches.set(`scale-launch-${index.toString().padStart(5, "0")}`, {
        id: `scale-launch-${index.toString().padStart(5, "0")}`,
        projectId: project.id,
        name: `Scale Launch ${index.toString().padStart(5, "0")}`,
        status: index % 3 === 0 ? "closed" : "open",
        branch: index % 2 === 0 ? "main" : "release",
        createdAt: new Date(Date.UTC(2026, 4, 30, 0, 0, index % 60)).toISOString(),
        results: []
      } as unknown as DomainLaunch);
    }

    const longSecret = `synthetic-scale-secret-${"x".repeat(12_000)}`;
    const statuses: Launch["results"][number]["status"][] = [
      "failed",
      "broken",
      "passed",
      "skipped",
      "unknown"
    ];
    const resultLaunch: Launch = {
      id: "scale-results-launch",
      projectId: project.id,
      name: "Scale Results Launch",
      status: "open",
      branch: "main",
      createdAt: "2026-05-30T01:00:00.000Z",
      results: Array.from({ length: 10_000 }, (_, index) => {
        const padded = index.toString().padStart(5, "0");
        const status = statuses[index % statuses.length]!;
        const name = index === 4242 ? "Needle customer checkout result" : `Result ${padded}`;
        return {
          uuid: `result-${padded}`,
          historyId: `history-${(index % 250).toString().padStart(3, "0")}`,
          testCaseId: `case-${padded}`,
          fullName: `scale.suite.Case${padded}`,
          name,
          status,
          durationMs: index,
          labels: {},
          parameters: [
            { name: "browser", value: "chromium" },
            { name: "apiToken", value: "never-list-me", mode: "hidden" },
            { name: "password", value: "never-list-me-either", mode: "masked" }
          ],
          attachments: [],
          steps: [],
          raw: {
            uuid: `result-${padded}`,
            historyId: `history-${(index % 250).toString().padStart(3, "0")}`,
            testCaseId: `case-${padded}`,
            fullName: `scale.suite.Case${padded}`,
            name,
            status,
            description: index === 4242 ? longSecret : "synthetic load record",
            parameters: [
              { name: "apiToken", value: "never-list-me", mode: "hidden" },
              { name: "password", value: "never-list-me-either", mode: "masked" }
            ],
            start: index,
            stop: index + 1
          }
        };
      })
    };
    store.launches.set(resultLaunch.id, resultLaunch as unknown as DomainLaunch);
    store.testCases.set("case-00042", {
      id: "case-00042",
      projectId: project.id,
      name: "Result 00042",
      fullName: "scale.suite.Case00042",
      workflowStatus: "active",
      tags: ["smoke"],
      customFields: {},
      members: [],
      links: [],
      issues: [],
      testKeys: [],
      relations: [],
      historyVersions: [],
      createdAt: "2026-05-30T00:00:00.000Z",
      updatedAt: "2026-05-30T00:00:00.000Z"
    });

    const launchListResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/launches?branch=main&q=scale&sort=name&order=asc&limit=5&offset=5`
    });
    const resultListResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${resultLaunch.id}/results?status=failed&sort=durationMs&order=desc&limit=25`
    });
    const resultCursorResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${resultLaunch.id}/results?status=passed&sort=uuid&order=asc&limit=3&cursor=3`
    });
    const resultSearchResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${resultLaunch.id}/results?q=needle&limit=10`
    });
    const launchDetailResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${resultLaunch.id}`
    });
    const testCaseListResponse = await app.inject({
      method: "GET",
      url: `/api/v1/test-cases?projectId=${project.id}&status=failed&sort=name&order=asc&limit=11`
    });
    const taggedTestCaseResponse = await app.inject({
      method: "GET",
      url: `/api/v1/test-cases?projectId=${project.id}&tag=smoke&workflowStatus=active&limit=10`
    });

    expect(launchListResponse.statusCode).toBe(200);
    expect(resultListResponse.statusCode).toBe(200);
    expect(resultCursorResponse.statusCode).toBe(200);
    expect(resultSearchResponse.statusCode).toBe(200);
    expect(launchDetailResponse.statusCode).toBe(200);
    expect(testCaseListResponse.statusCode).toBe(200);
    expect(taggedTestCaseResponse.statusCode).toBe(200);

    const launches = launchListResponse.json<ListResponse<{ id: string; branch: string }>>();
    expect(launches).toEqual(
      expect.objectContaining({
        kind: "launch-list",
        page: expect.objectContaining({
          limit: 5,
          cursor: "5",
          offset: 5,
          returned: 5,
          hasMore: true
        })
      })
    );
    expect(launches.items).toHaveLength(5);
    expect(launches.items.every((item) => item.branch === "main")).toBe(true);

    const results =
      resultListResponse.json<
        ListResponse<{ uuid: string; status: string; durationMs: number; raw?: unknown }>
      >();
    expect(results.page).toEqual(
      expect.objectContaining({ limit: 25, returned: 25, total: 2000, nextCursor: "25" })
    );
    expect(results.items).toHaveLength(25);
    expect(results.items[0]).toEqual(
      expect.objectContaining({ uuid: "result-09995", status: "failed", durationMs: 9995 })
    );
    expect(results.items.some((item) => "raw" in item)).toBe(false);

    const cursorResults = resultCursorResponse.json<ListResponse<{ uuid: string }>>();
    expect(cursorResults.page).toEqual(
      expect.objectContaining({ cursor: "3", offset: 3, returned: 3 })
    );
    expect(cursorResults.items.map((item) => item.uuid)).toEqual([
      "result-00017",
      "result-00022",
      "result-00027"
    ]);

    const needleResults = resultSearchResponse.json<ListResponse<{ uuid: string; name: string }>>();
    expect(needleResults.page).toEqual(expect.objectContaining({ total: 1, returned: 1 }));
    expect(needleResults.items[0]).toEqual(
      expect.objectContaining({ uuid: "result-04242", name: "Needle customer checkout result" })
    );
    expect(resultSearchResponse.body.length).toBeLessThan(20_000);
    expect(resultSearchResponse.body).not.toContain(longSecret);
    expect(resultSearchResponse.body).not.toContain("never-list-me");
    expect(resultSearchResponse.body).not.toContain("never-list-me-either");

    const launchDetails = launchDetailResponse.json<{
      results: Array<{ uuid: string; raw?: unknown }>;
      resultsPage: { limit: number; returned: number; total: number; nextCursor: string | null };
      artifacts: unknown[];
      artifactsPage: { limit: number; returned: number; total: number; nextCursor: string | null };
      links: { results: string; artifacts: string };
    }>();
    expect(launchDetails.resultsPage).toEqual(
      expect.objectContaining({ limit: 100, returned: 100, total: 10_000, nextCursor: "100" })
    );
    expect(launchDetails.results).toHaveLength(100);
    expect(launchDetails.results.some((item) => "raw" in item)).toBe(false);
    expect(launchDetails.artifactsPage).toEqual(
      expect.objectContaining({ limit: 100, returned: 0, total: 0, nextCursor: null })
    );
    expect(launchDetails.links.results).toBe(
      `/api/v1/launches/${resultLaunch.id}/results?limit=100`
    );
    expect(launchDetailResponse.body.length).toBeLessThan(80_000);
    expect(launchDetailResponse.body).not.toContain(longSecret);
    expect(launchDetailResponse.body).not.toContain("never-list-me");
    expect(launchDetailResponse.body).not.toContain("never-list-me-either");

    const testCases = testCaseListResponse.json<ListResponse<{ id: string; lastStatus: string }>>();
    expect(testCases.page).toEqual(
      expect.objectContaining({ limit: 11, returned: 11, total: 2000, nextCursor: "11" })
    );
    expect(testCases.items).toHaveLength(11);
    expect(testCases.items.every((item) => item.lastStatus === "failed")).toBe(true);

    const taggedCases = taggedTestCaseResponse.json<ListResponse<{ id: string }>>();
    expect(taggedCases.page).toEqual(expect.objectContaining({ total: 1, returned: 1 }));
    expect(taggedCases.items[0]?.id).toBe("case-00042");
  });

  it("redacts malformed launch list and result pagination without mutating launch data", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const launchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Pagination guard", branch: "main" }
    });
    expect(launchResponse.statusCode).toBe(201);
    const launch = launchResponse.json<LaunchResponse>();
    const uploadResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "pagination-guard-result.json",
            content: JSON.stringify({
              uuid: "pagination-guard-result",
              name: "pagination guard",
              status: "passed"
            })
          }
        ]
      }
    });
    expect(uploadResponse.statusCode).toBe(200);
    const beforeLaunches = store.launches.size;
    const beforeResults = (store.launches.get(launch.id) as Launch | undefined)?.results.length;
    const hostileValue =
      "token=raw-launch-cursor-secret&signedUrl=https://object.test/private?X-Amz-Signature=raw-launch-cursor-secret";
    const rejectionCases = [
      new URLSearchParams({ cursor: hostileValue }).toString(),
      new URLSearchParams({ cursor: "" }).toString(),
      new URLSearchParams({ offset: `storage://private/${hostileValue}` }).toString(),
      new URLSearchParams({ limit: "0" }).toString(),
      new URLSearchParams({ limit: "501" }).toString(),
      new URLSearchParams({ sort: hostileValue }).toString(),
      new URLSearchParams({ order: `sideways&${hostileValue}` }).toString()
    ];

    for (const path of [
      `/api/v1/projects/${project.id}/launches`,
      `/api/v1/launches/${launch.id}/results`
    ]) {
      for (const query of rejectionCases) {
        const response = await app.inject({
          method: "GET",
          url: `${path}?${query}`
        });
        const responseBody = response.json<{
          code: string;
          message: string;
          redacted: boolean;
        }>();
        const acceptedMessages = [
          "cursor/offset must be a non-negative integer offset",
          "limit must be an integer between 1 and 500",
          "sort must be one of the supported list fields",
          "order must be asc or desc",
          path.includes("/results")
            ? "invalid result list query controls"
            : "invalid launch list query controls"
        ];

        expect(response.statusCode).toBe(400);
        expect(responseBody.code).toBe("launch.pagination.invalid");
        expect(acceptedMessages).toContain(responseBody.message);
        expect(responseBody.redacted).toBe(true);
        expect(response.body).not.toContain("raw-launch-cursor-secret");
        expect(response.body).not.toContain("signedUrl");
        expect(response.body).not.toContain("token=");
        expect(response.body).not.toContain("X-Amz-Signature");
        expect(response.body).not.toContain("https://object.test");
        expect(response.body).not.toContain("storage://");
      }
      expect(store.launches.size).toBe(beforeLaunches);
      expect((store.launches.get(launch.id) as Launch | undefined)?.results.length).toBe(
        beforeResults
      );
    }
  });

  it("keeps launches open while uploads are pending and closes after reconciliation", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);
    const content = JSON.stringify({
      uuid: "pending-result",
      name: "pending close",
      status: "passed"
    });

    const sessionResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/uploads/chunked`,
      payload: {
        path: "pending-result.json",
        totalChunks: 1,
        totalBytes: Buffer.byteLength(content)
      }
    });
    expect(sessionResponse.statusCode).toBe(201);
    const session = sessionResponse.json<{ id: string }>();

    const pendingCloseResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/close`
    });

    expect(pendingCloseResponse.statusCode).toBe(409);
    expect(pendingCloseResponse.json()).toEqual(
      expect.objectContaining({
        message: "Launch has pending uploads",
        status: "open",
        closePipeline: expect.objectContaining({
          status: "pending_uploads",
          pendingUploads: [
            expect.objectContaining({
              kind: "session",
              id: session.id,
              status: "open",
              path: "pending-result.json"
            })
          ]
        })
      })
    );

    await app.inject({
      method: "PUT",
      url: `/api/v1/uploads/${session.id}/chunks/0`,
      payload: { content }
    });

    const pendingCompleteResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/close`
    });
    expect(pendingCompleteResponse.statusCode).toBe(409);
    expect(pendingCompleteResponse.json()).toEqual(
      expect.objectContaining({
        message: "Launch has pending uploads",
        closePipeline: expect.objectContaining({
          status: "pending_uploads",
          pendingUploads: [
            expect.objectContaining({
              kind: "session",
              id: session.id,
              status: "open",
              receivedChunks: 1,
              totalChunks: 1
            })
          ]
        })
      })
    );

    const completeResponse = await app.inject({
      method: "POST",
      url: `/api/v1/uploads/${session.id}/complete`
    });
    expect(completeResponse.statusCode).toBe(202);

    const queuedJob = completeResponse.json<{ job: { id: string } }>().job;
    const queuedCloseResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/close`
    });

    expect(queuedCloseResponse.statusCode).toBe(409);
    expect(queuedCloseResponse.json()).toEqual(
      expect.objectContaining({
        message: "Launch has pending uploads",
        closePipeline: expect.objectContaining({
          status: "pending_uploads",
          pendingUploads: [
            expect.objectContaining({
              kind: "job",
              id: queuedJob.id,
              status: "queued",
              receivedFiles: 1
            })
          ]
        })
      })
    );

    const processResponse = await app.inject({
      method: "POST",
      url: `/api/v1/uploads/${queuedJob.id}/process`
    });
    expect(processResponse.statusCode).toBe(200);

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
            completed: 1,
            importedResults: 1,
            storedArtifacts: 1
          })
        }),
        closePipeline: expect.objectContaining({
          status: "closed",
          pendingUploads: []
        })
      })
    );
  });

  it("exposes upload policy with TestOps-like field source rules", async () => {
    app = await createApiApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/artifacts/upload-policy"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        chunkedUploads: true,
        acceptedKinds: expect.arrayContaining(["allure-result", "attachment"]),
        fieldSources: expect.objectContaining({
          name: "from_result",
          layer: "from_result",
          expected_result: "from_result",
          custom_field: "from_result"
        })
      })
    );
  });

  it("syncs test cases when a launch is closed and allows metadata updates", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);

    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "checkout-result.json",
            content: JSON.stringify({
              uuid: "checkout-result",
              testCaseId: "case-checkout",
              historyId: "history-checkout",
              name: "checkout succeeds",
              fullName: "shop.checkout.succeeds",
              description: "Customer pays for a cart",
              status: "passed",
              labels: [
                { name: "tag", value: "smoke" },
                { name: "layer", value: "api" },
                { name: "owner", value: "qa-team" },
                { name: "issue", value: "BUG-12" },
                { name: "tms", value: "TMS-7" },
                { name: "expected_result", value: "Order is created" },
                { name: "custom_field:component", value: "checkout" }
              ],
              links: [{ name: "Spec", url: "https://example.test/spec", type: "spec" }]
            })
          }
        ]
      }
    });

    const closeResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/close`
    });

    expect(closeResponse.statusCode).toBe(200);
    expect(closeResponse.json()).toEqual(
      expect.objectContaining({ status: "closed", processedTestCases: 1 })
    );

    const detailResponse = await app.inject({
      method: "GET",
      url: "/api/v1/test-cases/case-checkout"
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toEqual(
      expect.objectContaining({
        id: "case-checkout",
        history: [
          expect.objectContaining({
            launchId: launch.id,
            status: "passed",
            historyId: "history-checkout"
          })
        ],
        testCase: expect.objectContaining({
          workflowStatus: "active",
          tags: ["smoke"],
          layer: "api",
          description: "Customer pays for a cart",
          members: ["qa-team"],
          issues: ["BUG-12"],
          testKeys: ["TMS-7"],
          expectedResult: "Order is created",
          customFields: { component: "checkout" },
          historyVersions: [
            expect.objectContaining({
              launchId: launch.id,
              resultUuid: "checkout-result",
              status: "passed",
              historyId: "history-checkout"
            })
          ]
        })
      })
    );

    const patchResponse = await app.inject({
      method: "PATCH",
      url: "/api/v1/test-cases/case-checkout",
      payload: {
        allureId: "1001",
        workflowStatus: "draft",
        tags: ["regression", "smoke"],
        members: ["lead-qa"],
        scenario: "Pay with a saved card"
      }
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json()).toEqual(
      expect.objectContaining({
        allureId: "1001",
        workflowStatus: "draft",
        tags: ["regression", "smoke"],
        members: ["lead-qa"],
        scenario: "Pay with a saved card"
      })
    );
  });
});
