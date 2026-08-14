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

describe("api app defects-security-a", () => {
  it("returns paginated worker-compatible archive diagnostic replay summaries without raw targets", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const launch = await createLaunch(app);

    const firstIntakeResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/uploads/archive`,
      payload: {
        archiveName: "synthetic://unsafe/archive/private.zip",
        entries: [
          { path: "login-result.json", size: 200, compressedSizeBytes: 80 },
          { path: "attachments/screen.png", size: 4096, compressedSizeBytes: 512 }
        ]
      }
    });
    const secondIntakeResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/uploads/archive`,
      payload: {
        archiveName: "second.zip",
        entries: [{ path: "checkout-result.json", size: 200, compressedSizeBytes: 80 }]
      }
    });
    expect(firstIntakeResponse.statusCode).toBe(202);
    expect(secondIntakeResponse.statusCode).toBe(202);

    const firstUploadId = firstIntakeResponse.json<{ job: { id: string } }>().job.id;
    const secondUploadId = secondIntakeResponse.json<{ job: { id: string } }>().job.id;
    const firstJob = store.uploadJobs.get(firstUploadId) as UploadJob;
    const secondJob = store.uploadJobs.get(secondUploadId) as UploadJob;
    firstJob.status = "completed_with_errors";
    firstJob.importedResults = 1;
    firstJob.storedArtifacts = 1;
    firstJob.createdAt = "2026-05-30T12:10:00.000Z";
    firstJob.updatedAt = "2026-05-30T12:11:00.000Z";
    firstJob.errors = [
      {
        path: "synthetic://unsafe/archive/secret-result.json",
        warnings: [
          "Unsafe synthetic archive path synthetic://unsafe/archive/secret.json token=api-replay-secret"
        ],
        errors: [
          "storageRef=storage://private-bucket/raw/archive-secret signedUrl=https://object.test/raw?X-Amz-Signature=api-replay-signature"
        ]
      }
    ];
    secondJob.status = "completed";
    secondJob.importedResults = 1;
    secondJob.createdAt = "2026-05-30T12:12:00.000Z";
    secondJob.updatedAt = "2026-05-30T12:12:00.000Z";

    const closeResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/close`
    });
    expect(closeResponse.statusCode).toBe(200);

    const headers = {
      "x-testhistory-scopes": "uploads:read,launches:read",
      "x-testhistory-project-scope": launch.projectId,
      "x-testhistory-actor-id": "archive-diagnostic-reader"
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
        name: "Archive diagnostic reader",
        ownerSubject: "ci/archive-diagnostics",
        scopes: ["uploads:read", "launches:read"]
      }
    });
    expect(tokenResponse.statusCode).toBe(201);
    const apiToken = tokenResponse.json<{ secret: string }>();
    const beforeReads = archiveJobReadSnapshot(store);
    const firstPageResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/archive/diagnostics/replay?limit=1`,
      headers
    });
    const secondPageResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/archive/diagnostics/replay?limit=1&cursor=1`,
      headers
    });
    const filteredResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/archive/diagnostics/replay?archiveRef=${encodeURIComponent(
        `archive:${firstUploadId}`
      )}`,
      headers
    });
    const bearerResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/archive/diagnostics/replay?limit=1`,
      headers: {
        authorization: `Bearer ${apiToken.secret}`
      }
    });
    const afterReads = archiveJobReadSnapshot(store);

    expect(firstPageResponse.statusCode).toBe(200);
    expect(secondPageResponse.statusCode).toBe(200);
    expect(filteredResponse.statusCode).toBe(200);
    expect(bearerResponse.statusCode).toBe(200);
    expect(afterReads).toEqual(beforeReads);

    const firstPage = firstPageResponse.json<{
      kind: string;
      page: { limit: number; returned: number; total: number; nextCursor: string | null };
      access: { actorScoped: boolean; mutation: boolean; redacted: boolean };
      worker: { queue: string; boundary: string; payloadsAvailable: boolean };
      summary: {
        totalProjections: number;
        acceptedEventCount: number;
        deleteRequestedCount: number;
        rawMaterialReturned: boolean;
      };
      items: Array<{
        uploadId: string;
        archiveRef: string;
        worker: { boundary: string; adapterKind: string; payloadsAvailable: boolean };
        execution: {
          readOnly: boolean;
          mutation: boolean;
          deletionStarted: boolean;
          deleteRequestedCount: number;
          rawMaterialReturned: boolean;
        };
        summary: {
          projectId: string;
          launchId: string;
          archiveRef: string;
          eventCount: number;
          acceptedEventCount: number;
          duplicateEventCount: number;
          rejectedOpenLaunchEventCount: number;
          rejectedOutOfScopeEventCount: number;
          invalidEventCount: number;
          retryableEventCount: number;
          severityCounts: { info: number; warn: number; error: number };
          sourceCounts: {
            "archive.status.read": number;
            "archive.diagnostics.read": number;
            "archive.cleanup.preview": number;
          };
          replayDigest: string;
          closedArchiveStatusReadCompatible: boolean;
          closedArchiveDiagnosticsReadCompatible: boolean;
          mutationBoundary: string;
        };
        records: Array<{ eventRef: string; entryRef?: string; chunkRef?: string }>;
      }>;
    }>();
    const filtered = filteredResponse.json<{
      page: { total: number };
      items: typeof firstPage.items;
    }>();

    expect(firstPage).toEqual(
      expect.objectContaining({
        kind: "archive-diagnostic-replay-summary-list",
        page: expect.objectContaining({ limit: 1, returned: 1, total: 2, nextCursor: "1" }),
        access: expect.objectContaining({
          actorScoped: true,
          mutation: false,
          redacted: true
        }),
        worker: expect.objectContaining({
          queue: "archive.diagnostics.replay",
          boundary: "worker-local-archive-diagnostics-replay",
          payloadsAvailable: false
        }),
        summary: expect.objectContaining({
          totalProjections: 2,
          deleteRequestedCount: 0,
          rawMaterialReturned: false
        })
      })
    );
    expect(firstPage.items[0]).toEqual(
      expect.objectContaining({
        uploadId: firstUploadId,
        archiveRef: `archive:${firstUploadId}`,
        worker: expect.objectContaining({
          boundary: "worker-local-archive-diagnostics-replay",
          adapterKind: "in-memory-archive-diagnostics-replay-wip",
          payloadsAvailable: false
        }),
        execution: {
          readOnly: true,
          mutation: false,
          deletionStarted: false,
          deleteRequestedCount: 0,
          rawMaterialReturned: false
        },
        summary: expect.objectContaining({
          projectId: launch.projectId,
          launchId: launch.id,
          archiveRef: `archive:${firstUploadId}`,
          eventCount: 4,
          acceptedEventCount: 4,
          duplicateEventCount: 0,
          rejectedOpenLaunchEventCount: 0,
          rejectedOutOfScopeEventCount: 0,
          invalidEventCount: 0,
          closedArchiveStatusReadCompatible: true,
          closedArchiveDiagnosticsReadCompatible: true,
          mutationBoundary: "worker-replay-only-no-rest-or-ui-claims"
        })
      })
    );
    expect(firstPage.items[0]?.summary.severityCounts).toEqual({ info: 0, warn: 2, error: 2 });
    expect(firstPage.items[0]?.summary.sourceCounts).toEqual({
      "archive.status.read": 1,
      "archive.diagnostics.read": 3,
      "archive.cleanup.preview": 0
    });
    expect(firstPage.items[0]?.summary.replayDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(firstPage.items[0]?.records[0]?.eventRef).toMatch(/^event:[a-f0-9]{64}$/);
    expect(secondPageResponse.json()).toEqual(
      expect.objectContaining({
        page: expect.objectContaining({ cursor: "1", returned: 1, total: 2 }),
        items: [expect.objectContaining({ uploadId: secondUploadId })]
      })
    );
    expect(filtered).toEqual(
      expect.objectContaining({
        page: expect.objectContaining({ total: 1 }),
        items: [expect.objectContaining({ uploadId: firstUploadId })]
      })
    );

    const serialized = JSON.stringify(firstPageResponse.json());
    expect(serialized).not.toContain("C:\\Users\\tester\\Downloads");
    expect(serialized).not.toContain("secret-result.json");
    expect(serialized).not.toContain("storage://");
    expect(serialized).not.toContain("archive-secret");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("api-replay-secret");
    expect(serialized).not.toContain("api-replay-signature");
    expect(serialized).not.toContain("UI route");
    expect(serialized).not.toContain("MCP");
    expect(bearerResponse.body).not.toContain(apiToken.secret);

    const openApi = readFileSync(
      new URL("../../../docs/openapi/openapi.yaml", import.meta.url),
      "utf8"
    );
    expect(openApi).toContain("/api/v1/launches/{launchId}/archive/diagnostics/replay");
    expect(openApi).toContain("ArchiveDiagnosticReplaySummaryListResponse");
    expect(openApi).toContain("worker-replay-only-no-rest-or-ui-claims");
  });

  it("returns empty archive diagnostic replay summaries for closed launches without archive evidence", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);
    await app.inject({ method: "POST", url: `/api/v1/launches/${launch.id}/close` });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/archive/diagnostics/replay`,
      headers: {
        "x-testhistory-scopes": "uploads:read,launches:read",
        "x-testhistory-project-scope": launch.projectId,
        "x-testhistory-actor-id": "empty-archive-diagnostic-reader"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        kind: "archive-diagnostic-replay-summary-list",
        page: expect.objectContaining({ returned: 0, total: 0, hasMore: false }),
        summary: expect.objectContaining({
          totalProjections: 0,
          eventCount: 0,
          acceptedEventCount: 0,
          rejectedOpenLaunchEventCount: 0,
          retryableEventCount: 0,
          severityCounts: { info: 0, warn: 0, error: 0 },
          sourceCounts: {
            "archive.status.read": 0,
            "archive.diagnostics.read": 0,
            "archive.cleanup.preview": 0
          },
          readOnly: true,
          mutation: false,
          deleteRequestedCount: 0,
          rawMaterialReturned: false
        }),
        items: []
      })
    );
  });

  it("denies archive diagnostic replay summary reads with redacted actor/project scope metadata", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    const otherProject = await createProject(app);
    const launchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Denied archive diagnostics replay" }
    });
    const launch = launchResponse.json<LaunchResponse>();

    const missingScopeResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/archive/diagnostics/replay`,
      headers: {
        authorization: "Bearer archive-diagnostic-denied-token",
        "x-testhistory-scopes": "launches:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "denied-archive-diagnostic-reader"
      }
    });
    const wrongProjectResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/archive/diagnostics/replay`,
      headers: {
        authorization: "Bearer archive-diagnostic-denied-token",
        "x-testhistory-scopes": "uploads:read,launches:read",
        "x-testhistory-project-scope": otherProject.id,
        "x-testhistory-actor-id": "wrong-project-archive-diagnostic-reader"
      }
    });

    expect(missingScopeResponse.statusCode).toBe(403);
    expect(wrongProjectResponse.statusCode).toBe(403);
    expect(missingScopeResponse.json()).toEqual(
      expect.objectContaining({
        kind: "archive-diagnostic-replay-summary-list",
        error: "PermissionDeniedError",
        requiredScopes: ["uploads:read", "launches:read"],
        projectId: project.id,
        actor: {
          type: "actor",
          actorId: "denied-archive-diagnostic-reader",
          scoped: true
        },
        access: expect.objectContaining({
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        }),
        availability: expect.objectContaining({
          status: "denied",
          reason: "invalid_token",
          redacted: true
        }),
        message: "API token is invalid",
        redacted: true
      })
    );
    expect(wrongProjectResponse.json()).toEqual(
      expect.objectContaining({
        availability: expect.objectContaining({
          status: "denied",
          reason: "invalid_token",
          redacted: true
        }),
        message: "API token is invalid",
        redacted: true
      })
    );
    expect(missingScopeResponse.body).not.toContain("archive-diagnostic-denied-token");
    expect(wrongProjectResponse.body).not.toContain("archive-diagnostic-denied-token");
  });

  it("returns paginated synthetic archive diagnostic replay fixture contracts without raw payloads", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const headers = {
      "x-testhistory-scopes": "uploads:read,launches:read",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-actor-id": "archive-fixture-reader"
    };
    const beforeReads = archiveJobReadSnapshot(store);

    const firstPageResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/archive/diagnostics/replay/fixtures?limit=2`,
      headers
    });
    const secondPageResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/archive/diagnostics/replay/fixtures?limit=2&cursor=2`,
      headers
    });
    const invalidLimitResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/archive/diagnostics/replay/fixtures?limit=101`,
      headers
    });
    const afterReads = archiveJobReadSnapshot(store);

    expect(firstPageResponse.statusCode).toBe(200);
    expect(secondPageResponse.statusCode).toBe(200);
    expect(invalidLimitResponse.statusCode).toBe(400);
    expect(afterReads).toEqual(beforeReads);

    const firstPage = firstPageResponse.json<ArchiveDiagnosticReplayFixtureListResponse>();
    const secondPage = secondPageResponse.json<ArchiveDiagnosticReplayFixtureListResponse>();

    expect(firstPage).toEqual(
      expect.objectContaining({
        kind: "archive-diagnostic-replay-fixture-list",
        project: { id: project.id, scoped: true },
        actor: { id: "archive-fixture-reader", scoped: true },
        access: expect.objectContaining({
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        }),
        page: expect.objectContaining({
          limit: 2,
          returned: 2,
          total: 6,
          nextCursor: "2",
          hasMore: true
        }),
        summary: expect.objectContaining({
          totalFixtures: 6,
          fixtureNames: ["corrupt", "empty", "denied", "partial", "duplicate", "retry"],
          readOnly: true,
          mutation: false,
          archivePayloadAvailable: false,
          rawManifestEntriesReturned: false,
          rawResultFilesReturned: false,
          resultContentReturned: false,
          rawPathsReturned: false,
          payloadBytesReturned: 0,
          redacted: true
        })
      })
    );
    expect(firstPage.items).toEqual([
      expect.objectContaining({
        kind: "archive-diagnostic-replay-fixture",
        projectId: project.id,
        fixtureRef: expect.stringMatching(/^fixture:[a-f0-9]{64}$/),
        name: "corrupt",
        scenario: "corrupt-result-json",
        expected: expect.objectContaining({
          supportedFiles: 2,
          attachmentFiles: 1,
          parseErrors: 1,
          attemptGroups: 0
        }),
        replay: expect.objectContaining({
          deterministic: true,
          compatibleSources: [
            "archive.status.read",
            "archive.diagnostics.read",
            "archive.cleanup.preview"
          ],
          retryAware: false,
          duplicateAware: false,
          deniedFixture: false,
          closedArchiveStatusReadCompatible: true,
          closedArchiveDiagnosticsReadCompatible: true,
          mutationBoundary: "fixture-read-only-no-replay-mutation"
        }),
        payload: {
          archivePayloadAvailable: false,
          manifestEntriesReturned: false,
          resultFilesReturned: false,
          resultContentReturned: false,
          rawPathsReturned: false,
          payloadBytesReturned: 0,
          redacted: true
        },
        digest: expect.stringMatching(/^[a-f0-9]{64}$/)
      }),
      expect.objectContaining({ name: "empty" })
    ]);
    expect(secondPage).toEqual(
      expect.objectContaining({
        page: expect.objectContaining({ cursor: "2", returned: 2, total: 6 }),
        items: [
          expect.objectContaining({
            name: "denied",
            replay: expect.objectContaining({ deniedFixture: true })
          }),
          expect.objectContaining({ name: "partial" })
        ]
      })
    );

    const serialized = JSON.stringify(firstPageResponse.json());
    expect(serialized).not.toContain('"manifestEntries":');
    expect(serialized).not.toContain('"resultFiles":');
    expect(serialized).not.toContain('"content"');
    expect(serialized).not.toContain("C:\\");
    expect(serialized).not.toContain("/tmp/");
    expect(serialized).not.toContain("storage://");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("synthetic-fixture-token");
    expect(serialized).not.toContain("synthetic-partial-token");
    expect(serialized).not.toContain("synthetic-retry-token");

    const openApi = readFileSync(
      new URL("../../../docs/openapi/openapi.yaml", import.meta.url),
      "utf8"
    );
    expect(openApi).toContain("/api/v1/projects/{projectId}/archive/diagnostics/replay/fixtures");
    expect(openApi).toContain("ArchiveDiagnosticReplayFixtureListResponse");
    expect(openApi).toContain("fixture-read-only-no-replay-mutation");
  });
});
