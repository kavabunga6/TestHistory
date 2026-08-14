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

describe("api app history-compare-b", () => {
  it("rejects malformed attachment preview retention pagination without echoing hostile query data", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const launchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Closed retention pagination guard launch" }
    });
    expect(launchResponse.statusCode).toBe(201);

    const launch = launchResponse.json<LaunchResponse>();
    const storedLaunch = store.launches.get(launch.id) as Launch;
    storedLaunch.status = "closed";
    storedLaunch.closedAt = "2026-05-30T00:00:00.000Z";
    store.artifacts.set(
      "closed-retention-pagination-guard-preview",
      previewRetentionArtifact({
        id: "closed-retention-pagination-guard-preview",
        launchId: launch.id,
        projectId: project.id,
        resultStatus: "passed",
        retentionClass: "passed-short",
        observedAt: "2026-05-01T00:00:00.000Z",
        content:
          "closed retention pagination guard token=preview-secret X-Amz-Signature=preview-signature"
      })
    );
    const beforeStoreState = {
      artifacts: store.artifacts.size,
      uploadJobs: store.uploadJobs.size,
      launches: store.launches.size
    };
    const hostileValue = encodeURIComponent(
      "token=preview-secret&signedUrl=https://objects.example/bucket/key?X-Amz-Signature=preview-signature&C:\\Users\\example-user\\Downloads\\allure-results\\secret.png"
    );
    const commonHeaders = {
      "x-testhistory-scopes": "artifacts:read",
      "x-testhistory-project-scope": project.id
    };

    const previewLimitResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/attachment-previews/retention/preview?limit=${hostileValue}&cursor=${hostileValue}`,
      headers: commonHeaders
    });
    const previewBatchResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/attachment-previews/retention/preview?limit=1&batchSize=${hostileValue}&cursor=${hostileValue}`,
      headers: commonHeaders
    });
    const scheduleLimitResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/attachment-previews/retention/dry-run/schedule?limit=${hostileValue}&cursor=${hostileValue}`,
      headers: commonHeaders
    });
    const scheduleSizeResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/attachment-previews/retention/dry-run/schedule?limit=1&scheduleSize=${hostileValue}&cursor=${hostileValue}`,
      headers: commonHeaders
    });
    const previewCursorResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/attachment-previews/retention/preview?limit=1&batchSize=1&cursor=${hostileValue}`,
      headers: commonHeaders
    });
    const scheduleCursorResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/attachment-previews/retention/dry-run/schedule?limit=1&scheduleSize=1&cursor=${hostileValue}`,
      headers: commonHeaders
    });
    const scheduleDigestResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/attachment-previews/retention/dry-run/schedule?limit=1&scheduleSize=1&scheduleDigest=${hostileValue}`,
      headers: commonHeaders
    });

    expect(previewLimitResponse.statusCode).toBe(400);
    expect(previewBatchResponse.statusCode).toBe(400);
    expect(scheduleLimitResponse.statusCode).toBe(400);
    expect(scheduleSizeResponse.statusCode).toBe(400);
    expect(previewCursorResponse.statusCode).toBe(400);
    expect(scheduleCursorResponse.statusCode).toBe(400);
    expect(scheduleDigestResponse.statusCode).toBe(400);
    expect(previewLimitResponse.json()).toEqual({
      message: "limit must be an integer between 1 and 100",
      redacted: true
    });
    expect(previewBatchResponse.json()).toEqual({
      message: "batchSize must be an integer between 1 and 100",
      redacted: true
    });
    expect(scheduleLimitResponse.json()).toEqual({
      message: "limit must be an integer between 1 and 100",
      redacted: true
    });
    expect(scheduleSizeResponse.json()).toEqual({
      message: "scheduleSize must be an integer between 1 and 100",
      redacted: true
    });
    expect(previewCursorResponse.json()).toEqual({
      message: "cursor must be a non-negative integer offset",
      redacted: true
    });
    expect(scheduleCursorResponse.json()).toEqual({
      message: "cursor must be a non-negative integer offset",
      redacted: true
    });
    expect(scheduleDigestResponse.json()).toEqual({
      message: "scheduleDigest must be a 24 character lowercase hexadecimal digest",
      redacted: true
    });

    const serialized = JSON.stringify([
      previewLimitResponse.json(),
      previewBatchResponse.json(),
      scheduleLimitResponse.json(),
      scheduleSizeResponse.json(),
      previewCursorResponse.json(),
      scheduleCursorResponse.json(),
      scheduleDigestResponse.json()
    ]);
    expect(serialized).not.toContain("preview-secret");
    expect(serialized).not.toContain("signedUrl");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("objects.example");
    expect(serialized).not.toContain("Downloads");
    expect(serialized).not.toContain("allure-results");
    expect(serialized).not.toContain("C:\\");
    expect(serialized).not.toContain('"path"');
    expect(serialized).not.toContain('"storageKey"');
    expect(serialized).not.toContain('"deletionPlan"');
    expect(store.artifacts.size).toBe(beforeStoreState.artifacts);
    expect(store.uploadJobs.size).toBe(beforeStoreState.uploadJobs);
    expect(store.launches.size).toBe(beforeStoreState.launches);
  });

  it("accepts archive upload manifests as bounded async intake contracts", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/uploads/archive`,
      payload: {
        archiveName: "C:\\workspace\\synthetic\\synthetic-allure.zip",
        advertisedCompressedBytes: 512,
        entries: [
          {
            path: "login-result.json",
            size: 250,
            compressedSizeBytes: 120
          },
          {
            path: "synthetic-screen-attachment.png",
            size: 1024,
            compressedSizeBytes: 420
          },
          {
            path: "tmp/debug.bin",
            size: 10,
            compressedSizeBytes: 8
          }
        ]
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual(
      expect.objectContaining({
        kind: "archive-upload-intake",
        accepted: true,
        archive: {
          name: "synthetic-allure.zip",
          format: "allure-results-archive-manifest"
        },
        job: expect.objectContaining({
          status: "queued",
          receivedFiles: 2,
          importedResults: 0,
          storedArtifacts: 0
        }),
        manifest: expect.objectContaining({
          supportedFiles: 2,
          attachmentFiles: 1,
          ignoredFiles: 1,
          totalUncompressedBytes: 1274
        }),
        processing: expect.objectContaining({
          mode: "archive-manifest-intake",
          extraction: "deferred",
          storesArchivePayload: false,
          payloadsAcceptedOnThisEndpoint: false,
          bounded: expect.objectContaining({
            maxEntries: 10000,
            maxDiagnostics: 100,
            maxUploadConcurrency: expect.any(Number)
          })
        }),
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            scope: "entry",
            severity: "info",
            code: "archive_entry.accepted",
            path: "login-result.json",
            kind: "result"
          }),
          expect.objectContaining({
            scope: "entry",
            severity: "warning",
            code: "archive_entry.ignored",
            path: "tmp/debug.bin",
            kind: "unsupported"
          })
        ])
      })
    );
    expect(JSON.stringify(response.json())).not.toContain("C:\\workspace\\synthetic");
  });

  it("rejects unsafe archive manifest metadata with redacted per-entry diagnostics", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/uploads/archive`,
      payload: {
        archiveName: "redacted.zip",
        entries: [
          { path: "safe-result.json", size: 10 },
          { path: "../outside-result.json", size: 20 },
          { path: "C:\\workspace\\synthetic\\private-result.json", size: 30 }
        ]
      }
    });

    const body = response.json<{
      message: string;
      diagnostics: Array<{ code: string; message: string; path?: string }>;
      manifest: { entries: Array<{ path: string }> };
    }>();

    expect(response.statusCode).toBe(400);
    expect(body.message).toBe("Archive manifest contains unsafe entry metadata");
    expect(body.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "entry",
          severity: "error",
          code: "archive_entry.unsafe_path"
        })
      ])
    );
    expect(body.manifest.entries).toEqual([expect.objectContaining({ path: "safe-result.json" })]);
    expect(JSON.stringify(body)).not.toContain("outside-result.json");
    expect(JSON.stringify(body)).not.toContain("C:\\workspace\\synthetic");
  });

  it("returns paginated archive status projections with redacted worker diagnostics", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const launch = await createLaunch(app);

    const intakeResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/uploads/archive`,
      payload: {
        archiveName: "C:\\workspace\\synthetic\\nightly-allure.zip",
        advertisedCompressedBytes: 512,
        entries: [
          { path: "login-result.json", size: 200, compressedSizeBytes: 80 },
          { path: "checkout-result.json", size: 220, compressedSizeBytes: 90 },
          { path: "attachments/screen.png", size: 4096, compressedSizeBytes: 512 },
          { path: "debug/raw.bin", size: 42, compressedSizeBytes: 12 }
        ]
      }
    });
    const failedIntakeResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/uploads/archive`,
      payload: {
        archiveName: "failed-allure.zip",
        entries: [{ path: "failed-result.json", size: 100, compressedSizeBytes: 50 }]
      }
    });
    const resultUploadResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "plain-result.json",
            content: JSON.stringify({ uuid: "plain-result", name: "plain", status: "passed" })
          }
        ]
      }
    });

    expect(intakeResponse.statusCode).toBe(202);
    expect(failedIntakeResponse.statusCode).toBe(202);
    expect(resultUploadResponse.statusCode).toBe(200);

    const partialJobId = intakeResponse.json<{ job: { id: string } }>().job.id;
    const failedJobId = failedIntakeResponse.json<{ job: { id: string } }>().job.id;
    const partialJob = store.uploadJobs.get(partialJobId) as UploadJob;
    const failedJob = store.uploadJobs.get(failedJobId) as UploadJob;
    partialJob.status = "completed_with_errors";
    partialJob.importedResults = 1;
    partialJob.storedArtifacts = 2;
    partialJob.createdAt = "2026-05-30T12:00:00.000Z";
    partialJob.updatedAt = "2026-05-30T12:00:00.000Z";
    partialJob.errors = Array.from({ length: 12 }, (_, index) => ({
      path:
        index === 0
          ? "C:\\workspace\\synthetic\\private-entry.json"
          : `entries/worker-${index}-result.json`,
      warnings: [
        `worker retry ${index} token=archive-status-marker-${index} C:\\workspace\\synthetic\\private.log`
      ],
      errors:
        index % 2 === 0
          ? [`worker parse error ${index} storageKey=archive-storage-marker-${index}`]
          : []
    }));
    failedJob.status = "failed";
    failedJob.createdAt = "2026-05-30T12:01:00.000Z";
    failedJob.updatedAt = "2026-05-30T12:01:00.000Z";
    failedJob.errors = [
      {
        path: "failed-result.json",
        warnings: [],
        errors: ["Authorization: Bearer archive-status-denied-marker"]
      }
    ];
    const archiveReadHeaders = {
      "x-testhistory-scopes": "uploads:read,launches:read",
      "x-testhistory-project-scope": launch.projectId,
      "x-testhistory-actor-id": "archive-status-reader"
    };
    const tokenResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${launch.projectId}/settings/access/tokens`,
      headers: {
        "x-testhistory-scopes": "settings:write",
        "x-testhistory-project-scope": launch.projectId,
        "x-testhistory-actor-id": "project-owner"
      },
      payload: {
        name: "Archive status reader",
        ownerSubject: "ci/archive-status",
        scopes: ["uploads:read", "launches:read"]
      }
    });
    expect(tokenResponse.statusCode).toBe(201);
    const apiToken = tokenResponse.json<{ secret: string }>();

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/uploads/archive/status?limit=1&diagnosticsLimit=5`,
      headers: archiveReadHeaders
    });
    const detailResponse = await app.inject({
      method: "GET",
      url: `/api/v1/uploads/${partialJobId}/archive/status?limit=3&cursor=3`,
      headers: archiveReadHeaders
    });
    const failedOnlyResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/uploads/archive/status?status=failed`,
      headers: archiveReadHeaders
    });
    const bearerListResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/uploads/archive/status?limit=1&diagnosticsLimit=5`,
      headers: {
        authorization: `Bearer ${apiToken.secret}`
      }
    });
    const bearerDetailResponse = await app.inject({
      method: "GET",
      url: `/api/v1/uploads/${partialJobId}/archive/status?limit=3&cursor=3`,
      headers: {
        authorization: `Bearer ${apiToken.secret}`
      }
    });

    expect(listResponse.statusCode).toBe(200);
    expect(bearerListResponse.statusCode).toBe(200);
    expect(bearerDetailResponse.statusCode).toBe(200);
    const list = listResponse.json<{
      kind: string;
      page: { limit: number; returned: number; total: number; nextCursor: string | null };
      summary: Record<string, number>;
      diagnostics: { page: { limit: number; returned: number; total: number; hasMore: boolean } };
      access: { actorScoped: boolean; mutation: boolean; redacted: boolean };
      items: Array<{
        id: string;
        phase: string;
        archive: { storesArchivePayload: boolean; payloadsAcceptedOnThisEndpoint: boolean };
        access: { actorScoped: boolean; mutation: boolean; redacted: boolean };
        diagnostics: {
          page: { limit: number; returned: number; hasMore: boolean };
          items: Array<{ path?: string }>;
        };
      }>;
    }>();
    expect(list).toEqual(
      expect.objectContaining({
        kind: "archive-upload-status-list",
        page: expect.objectContaining({ limit: 1, returned: 1, total: 2, nextCursor: "1" }),
        summary: expect.objectContaining({
          total: 2,
          completedWithErrors: 1,
          failed: 1,
          acceptedEntries: 3,
          ignoredEntries: 2,
          importedResults: 1,
          storedArtifacts: 2
        }),
        diagnostics: expect.objectContaining({
          page: expect.objectContaining({ limit: 5, returned: 5, hasMore: true })
        }),
        access: expect.objectContaining({
          actorScoped: true,
          mutation: false,
          redacted: true
        }),
        items: [
          expect.objectContaining({
            id: partialJobId,
            phase: "partial_success",
            access: expect.objectContaining({ actorScoped: true, mutation: false }),
            archive: expect.objectContaining({
              storesArchivePayload: false,
              payloadsAcceptedOnThisEndpoint: false
            }),
            diagnostics: expect.objectContaining({
              page: expect.objectContaining({ limit: 5, returned: 5, hasMore: true })
            })
          })
        ]
      })
    );
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toEqual(
      expect.objectContaining({
        id: partialJobId,
        projectId: launch.projectId,
        phase: "partial_success",
        access: expect.objectContaining({ actorScoped: true, mutation: false, redacted: true }),
        progress: expect.objectContaining({ totalUnits: 2, processedUnits: 2, percent: 100 }),
        worker: expect.objectContaining({
          boundary: "archive-unpack-planned",
          persistence: "synthetic-in-memory-read-model",
          payloadsAvailable: false
        }),
        diagnostics: expect.objectContaining({
          page: expect.objectContaining({ limit: 3, cursor: "3", returned: 3, hasMore: true })
        })
      })
    );
    expect(failedOnlyResponse.statusCode).toBe(200);
    expect(failedOnlyResponse.json()).toEqual(
      expect.objectContaining({
        page: expect.objectContaining({ total: 1 }),
        items: [expect.objectContaining({ id: failedJobId, phase: "failed" })]
      })
    );
    expect(JSON.stringify(listResponse.json())).not.toContain("archive-status-marker");
    expect(JSON.stringify(listResponse.json())).not.toContain("archive-storage-marker");
    expect(JSON.stringify(listResponse.json())).not.toContain("archive-status-denied-marker");
    expect(JSON.stringify(listResponse.json())).not.toContain("C:\\workspace\\synthetic");
    expect(JSON.stringify(listResponse.json())).not.toContain("entries/worker-");
    expect(JSON.stringify(listResponse.json())).not.toContain("failed-result.json");
    expect(JSON.stringify(detailResponse.json())).not.toContain("archive-status-marker");
    expect(JSON.stringify(detailResponse.json())).not.toContain("archive-storage-marker");
    expect(JSON.stringify(detailResponse.json())).not.toContain("C:\\workspace\\synthetic");
    expect(JSON.stringify(detailResponse.json())).not.toContain("entries/worker-");
    expect(bearerListResponse.body).not.toContain(apiToken.secret);
    expect(bearerDetailResponse.body).not.toContain(apiToken.secret);
  });

  it("keeps archive status reads project isolated and read-only", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const otherProject = await createProject(app);
    const launchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Scoped archive launch" }
    });
    const otherLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${otherProject.id}/launches`,
      payload: { name: "Other scoped archive launch" }
    });
    const launch = launchResponse.json<LaunchResponse>();
    const otherLaunch = otherLaunchResponse.json<LaunchResponse>();

    const intakeResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/uploads/archive`,
      payload: {
        archiveName: "scoped-allure.zip",
        entries: [{ path: "scoped-result.json", size: 100, compressedSizeBytes: 40 }]
      }
    });
    const otherIntakeResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${otherLaunch.id}/uploads/archive`,
      payload: {
        archiveName: "other-project-leak-marker.zip",
        entries: [{ path: "other-result.json", size: 100, compressedSizeBytes: 40 }]
      }
    });

    expect(intakeResponse.statusCode).toBe(202);
    expect(otherIntakeResponse.statusCode).toBe(202);
    const uploadId = intakeResponse.json<{ job: { id: string } }>().job.id;
    const otherUploadId = otherIntakeResponse.json<{ job: { id: string } }>().job.id;
    const archiveReadHeaders = {
      "x-testhistory-scopes": "uploads:read,launches:read",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-actor-id": "scoped-archive-reader"
    };
    const beforeReads = archiveJobReadSnapshot(store);

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/uploads/archive/status?limit=10&diagnosticsLimit=10`,
      headers: archiveReadHeaders
    });
    const detailResponse = await app.inject({
      method: "GET",
      url: `/api/v1/uploads/${uploadId}/archive/status?limit=10`,
      headers: archiveReadHeaders
    });
    const missingScopeResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/uploads/archive/status`,
      headers: {
        authorization: "Bearer archive-read-denied-token",
        "x-testhistory-scopes": "launches:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "scoped-archive-reader"
      }
    });
    const wrongProjectResponse = await app.inject({
      method: "GET",
      url: `/api/v1/uploads/${uploadId}/archive/status`,
      headers: {
        "x-testhistory-scopes": "uploads:read,launches:read",
        "x-testhistory-project-scope": otherProject.id,
        "x-testhistory-actor-id": "wrong-archive-reader"
      }
    });
    const afterReads = archiveJobReadSnapshot(store);

    expect(listResponse.statusCode).toBe(200);
    expect(detailResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual(
      expect.objectContaining({
        launch: expect.objectContaining({ id: launch.id, projectId: project.id }),
        access: expect.objectContaining({ actorScoped: true, mutation: false, redacted: true }),
        page: expect.objectContaining({ total: 1 }),
        summary: expect.objectContaining({ total: 1 }),
        items: [expect.objectContaining({ id: uploadId, launchId: launch.id })]
      })
    );
    expect(detailResponse.json()).toEqual(
      expect.objectContaining({
        id: uploadId,
        launchId: launch.id,
        projectId: project.id,
        access: expect.objectContaining({ actorScoped: true, mutation: false, redacted: true }),
        archive: expect.objectContaining({
          storesArchivePayload: false,
          payloadsAcceptedOnThisEndpoint: false
        }),
        worker: expect.objectContaining({ payloadsAvailable: false })
      })
    );
    expect(afterReads).toEqual(beforeReads);
    expect(missingScopeResponse.statusCode).toBe(403);
    expect(missingScopeResponse.json()).toEqual(
      expect.objectContaining({
        kind: "archive-upload-status",
        error: "PermissionDeniedError",
        requiredScopes: ["uploads:read", "launches:read"],
        projectId: project.id,
        actor: { type: "actor", actorId: "scoped-archive-reader", scoped: true },
        access: {
          scope: "uploads:read",
          requiredScopes: ["uploads:read", "launches:read"],
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        availability: expect.objectContaining({
          status: "denied",
          reason: "invalid_token",
          redacted: true
        }),
        message: "API token is invalid",
        redacted: true
      })
    );
    expect(wrongProjectResponse.statusCode).toBe(403);
    expect(wrongProjectResponse.json()).toEqual(
      expect.objectContaining({
        kind: "archive-upload-status",
        error: "PermissionDeniedError",
        requiredScopes: ["uploads:read", "launches:read"],
        projectId: project.id,
        actor: { type: "actor", actorId: "wrong-archive-reader", scoped: true },
        availability: expect.objectContaining({
          status: "denied",
          reason: "project_scope_denied",
          redacted: true
        }),
        redacted: true
      })
    );
    expect(missingScopeResponse.body).not.toContain("archive-read-denied-token");

    const listSerialized = JSON.stringify(listResponse.json());
    const detailSerialized = JSON.stringify(detailResponse.json());
    expect(listSerialized).not.toContain(otherProject.id);
    expect(listSerialized).not.toContain(otherLaunch.id);
    expect(listSerialized).not.toContain(otherUploadId);
    expect(listSerialized).not.toContain("other-project-leak-marker");
    expect(detailSerialized).not.toContain(otherProject.id);
    expect(detailSerialized).not.toContain(otherLaunch.id);
    expect(detailSerialized).not.toContain(otherUploadId);
    for (const serialized of [listSerialized, detailSerialized]) {
      expect(serialized).not.toContain("storageKey");
      expect(serialized).not.toContain("signedUrl");
      expect(serialized).not.toContain('"payload":');
      expect(serialized).not.toContain("C:\\Users\\tester\\Downloads");
    }
  });

  it("rejects invalid archive status cursors and does not expose non-archive jobs as archive status", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);
    const uploadResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "not-archive-result.json",
            content: JSON.stringify({ uuid: "not-archive-result", name: "not archive" })
          }
        ]
      }
    });
    const uploadId = uploadResponse.json<{ job: { id: string } }>().job.id;

    const invalidLaunchStatusResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/uploads/archive/status?limit=101`
    });
    const invalidDetailStatusResponse = await app.inject({
      method: "GET",
      url: `/api/v1/uploads/${uploadId}/archive/status?cursor=-1`
    });
    const notArchiveResponse = await app.inject({
      method: "GET",
      url: `/api/v1/uploads/${uploadId}/archive/status`
    });

    expect(invalidLaunchStatusResponse.statusCode).toBe(400);
    expect(invalidLaunchStatusResponse.json()).toEqual(
      expect.objectContaining({ message: "querystring/limit must be <= 100" })
    );
    expect(invalidDetailStatusResponse.statusCode).toBe(404);
    expect(notArchiveResponse.statusCode).toBe(404);
  });
});
