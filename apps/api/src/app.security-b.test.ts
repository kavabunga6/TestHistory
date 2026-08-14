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

describe("api app security-b", () => {
  it("returns materialized archive diagnostic replay fixture reads without raw archive payloads", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const otherProject = await createProject(app);
    const headers = {
      "x-testhistory-scopes": "uploads:read,launches:read",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-actor-id": "archive-materialized-fixture-reader"
    };
    const materializedPath = `/api/v1/projects/${project.id}/archive/diagnostics/replay/fixtures/materialized`;
    const beforeReads = archiveJobReadSnapshot(store);

    const firstPageResponse = await app.inject({
      method: "GET",
      url: `${materializedPath}?limit=2`,
      headers
    });
    const secondPageResponse = await app.inject({
      method: "GET",
      url: `${materializedPath}?limit=2&cursor=2`,
      headers
    });
    const retryResponse = await app.inject({
      method: "GET",
      url: `${materializedPath}?name=retry&actorId=query-archive-fixture-actor`,
      headers
    });
    const emptyDigestResponse = await app.inject({
      method: "GET",
      url: `${materializedPath}?digest=not-a-known-digest`,
      headers
    });
    const invalidLimitResponse = await app.inject({
      method: "GET",
      url: `${materializedPath}?limit=101`,
      headers
    });
    const exhaustedPageResponse = await app.inject({
      method: "GET",
      url: `${materializedPath}?limit=2&cursor=6`,
      headers
    });
    const missingScopeResponse = await app.inject({
      method: "GET",
      url: materializedPath,
      headers: {
        authorization: "Bearer archive-materialized-fixture-missing-scope-secret",
        "x-testhistory-scopes": "launches:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "archive-materialized-fixture-missing-scope"
      }
    });
    const mismatchedActorResponse = await app.inject({
      method: "GET",
      url: `${materializedPath}?actorId=query-archive-fixture-actor`,
      headers
    });
    const wrongProjectResponse = await app.inject({
      method: "GET",
      url: materializedPath,
      headers: {
        authorization: "Bearer archive-materialized-fixture-secret",
        "x-testhistory-scopes": "uploads:read,launches:read",
        "x-testhistory-project-scope": otherProject.id,
        "x-testhistory-actor-id": "archive-materialized-fixture-denied"
      }
    });
    const methodGuardResponses = await Promise.all(
      (["POST", "PUT", "PATCH", "DELETE"] as const).map((method) =>
        app!.inject({
          method,
          url: materializedPath,
          headers: {
            ...headers,
            authorization: "Bearer archive-materialized-fixture-method-secret"
          },
          payload: {
            rawArchivePayload: "Authorization: Bearer archive-materialized-fixture-raw-token",
            manifestEntries: [{ path: "C:\\raw\\manifest.json" }],
            resultFiles: [{ path: "/tmp/raw-result.json", content: "token=raw-result-token" }],
            localPath: "C:\\raw\\archive.zip",
            storageKey: "storage://archive-materialized-fixture-private",
            signedUrl: "https://object.example/archive?X-Amz-Signature=raw-signature",
            token: "archive-materialized-fixture-method-token"
          }
        })
      )
    );
    const afterReads = archiveJobReadSnapshot(store);

    expect(firstPageResponse.statusCode).toBe(200);
    expect(secondPageResponse.statusCode).toBe(200);
    expect(retryResponse.statusCode).toBe(200);
    expect(emptyDigestResponse.statusCode).toBe(200);
    expect(invalidLimitResponse.statusCode).toBe(400);
    expect(exhaustedPageResponse.statusCode).toBe(200);
    expect(missingScopeResponse.statusCode).toBe(403);
    expect(mismatchedActorResponse.statusCode).toBe(200);
    expect(wrongProjectResponse.statusCode).toBe(403);
    for (const methodGuardResponse of methodGuardResponses) {
      expect(methodGuardResponse.statusCode).toBe(404);
    }
    expect(afterReads).toEqual(beforeReads);

    const firstPage =
      firstPageResponse.json<ArchiveDiagnosticReplayMaterializedFixtureListResponse>();
    const secondPage =
      secondPageResponse.json<ArchiveDiagnosticReplayMaterializedFixtureListResponse>();
    const retry = retryResponse.json<ArchiveDiagnosticReplayMaterializedFixtureListResponse>();
    const emptyDigest =
      emptyDigestResponse.json<ArchiveDiagnosticReplayMaterializedFixtureListResponse>();
    const exhaustedPage =
      exhaustedPageResponse.json<ArchiveDiagnosticReplayMaterializedFixtureListResponse>();
    const mismatchedActor =
      mismatchedActorResponse.json<ArchiveDiagnosticReplayMaterializedFixtureListResponse>();

    expect(firstPage).toEqual(
      expect.objectContaining({
        kind: "archive-diagnostic-replay-fixture-materialized-list",
        project: { id: project.id, scoped: true },
        actor: { id: "archive-materialized-fixture-reader", scoped: true },
        access: expect.objectContaining({
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        }),
        availability: {
          status: "ready",
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          partial: false,
          unavailable: []
        },
        materialization: expect.objectContaining({
          adapterKind: "api-read-model-archive-diagnostic-replay-fixture-materialized-wip",
          boundary: "worker-compatible-archive-diagnostic-replay-fixture-materialized-read",
          consistency: "synthetic-fixture-contracts-idempotent",
          readOnly: true,
          mutation: false,
          rawArchivePayloadsIncluded: false,
          manifestEntriesIncluded: false,
          resultFilesIncluded: false,
          localPathsIncluded: false,
          storageRefsIncluded: false,
          signedUrlsIncluded: false,
          tokensIncluded: false,
          materializedRecordCount: 6,
          materializationDigest: expect.stringMatching(/^[a-f0-9]{64}$/)
        }),
        page: expect.objectContaining({
          limit: 2,
          returned: 2,
          total: 6,
          nextCursor: "2",
          hasMore: true
        }),
        summary: expect.objectContaining({
          projectId: project.id,
          materializedRecordCount: 6,
          fixtureNames: ["corrupt", "empty", "denied", "partial", "duplicate", "retry"],
          retryAwareCount: 1,
          duplicateAwareCount: 1,
          deniedFixtureCount: 1,
          deterministic: true,
          projectScoped: true,
          readOnly: true,
          mutation: false,
          rawArchivePayloadsIncluded: false,
          manifestEntriesIncluded: false,
          resultFilesIncluded: false,
          localPathsIncluded: false,
          storageRefsIncluded: false,
          signedUrlsIncluded: false,
          tokensIncluded: false,
          redactionPassed: true
        })
      })
    );
    expect(firstPage.items).toEqual([
      expect.objectContaining({
        kind: "archive-diagnostic-replay-fixture-materialized",
        projectId: project.id,
        fixtureRef: expect.stringMatching(/^fixture:[a-f0-9]{64}$/),
        materializedRef: expect.stringMatching(/^materialized:[a-f0-9]{64}$/),
        name: "corrupt",
        scenario: "corrupt-result-json",
        materializedAt: "2026-05-30T00:00:00.000Z",
        sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        recordDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        status: "ready",
        evidence: expect.objectContaining({
          deterministic: true,
          retryAware: false,
          duplicateAware: false,
          deniedFixture: false,
          supportedFiles: 2,
          attachmentFiles: 1,
          parseErrors: 1,
          compatibleSourceCount: 3,
          closedArchiveStatusReadCompatible: true,
          closedArchiveDiagnosticsReadCompatible: true,
          redactionPassed: true
        }),
        materialization: expect.objectContaining({
          readOnly: true,
          rawArchivePayloadsIncluded: false,
          manifestEntriesIncluded: false,
          resultFilesIncluded: false,
          localPathsIncluded: false,
          storageRefsIncluded: false,
          signedUrlsIncluded: false,
          tokensIncluded: false,
          mutationBoundary: "rest-materialized-read-only-no-archive-or-worker-mutation"
        }),
        execution: {
          replayStarted: false,
          workerJobEnqueued: false,
          archivePayloadOpened: false,
          mutation: false,
          deletionStarted: false,
          providerIntegration: false
        }
      }),
      expect.objectContaining({ name: "empty" })
    ]);
    expect(secondPage).toEqual(
      expect.objectContaining({
        page: expect.objectContaining({ cursor: "2", returned: 2, total: 6 }),
        items: [
          expect.objectContaining({ name: "denied", status: "denied" }),
          expect.objectContaining({ name: "partial" })
        ]
      })
    );
    expect(retry).toEqual(
      expect.objectContaining({
        actor: { id: "query-archive-fixture-actor", scoped: true },
        page: expect.objectContaining({ returned: 1, total: 1 }),
        items: [
          expect.objectContaining({
            name: "retry",
            evidence: expect.objectContaining({ retryAware: true })
          })
        ]
      })
    );
    expect(emptyDigest).toEqual(
      expect.objectContaining({
        availability: expect.objectContaining({ status: "empty" }),
        page: expect.objectContaining({ returned: 0, total: 0 }),
        items: []
      })
    );
    expect(exhaustedPage).toEqual(
      expect.objectContaining({
        availability: expect.objectContaining({ status: "ready" }),
        page: expect.objectContaining({
          limit: 2,
          cursor: "6",
          offset: 6,
          returned: 0,
          total: 6,
          nextCursor: null,
          hasMore: false
        }),
        items: []
      })
    );
    expect(mismatchedActor).toEqual(
      expect.objectContaining({
        project: { id: project.id, scoped: true },
        actor: { id: "query-archive-fixture-actor", scoped: true },
        access: expect.objectContaining({
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        }),
        page: expect.objectContaining({ returned: 6, total: 6 })
      })
    );
    expect(missingScopeResponse.json()).toEqual(
      expect.objectContaining({
        kind: "archive-diagnostic-replay-fixture-materialized-list",
        error: "PermissionDeniedError",
        message: "API token is invalid",
        requiredScopes: ["uploads:read", "launches:read"],
        projectId: project.id,
        actor: {
          type: "actor",
          actorId: "archive-materialized-fixture-missing-scope",
          scoped: true
        },
        availability: expect.objectContaining({
          status: "denied",
          reason: "invalid_token",
          unavailable: ["archive-diagnostic-replay-fixture-materialized-read"],
          redacted: true
        }),
        redacted: true
      })
    );
    expect(wrongProjectResponse.json()).toEqual(
      expect.objectContaining({
        kind: "archive-diagnostic-replay-fixture-materialized-list",
        error: "PermissionDeniedError",
        requiredScopes: ["uploads:read", "launches:read"],
        projectId: project.id,
        actor: {
          type: "actor",
          actorId: "archive-materialized-fixture-denied",
          scoped: true
        },
        availability: expect.objectContaining({
          status: "denied",
          reason: "invalid_token",
          unavailable: ["archive-diagnostic-replay-fixture-materialized-read"],
          redacted: true
        }),
        message: "API token is invalid",
        redacted: true
      })
    );

    const serialized = JSON.stringify({
      firstPage: firstPageResponse.json(),
      retry: retryResponse.json(),
      emptyDigest: emptyDigestResponse.json(),
      exhaustedPage: exhaustedPageResponse.json(),
      mismatchedActor: mismatchedActorResponse.json(),
      missingScope: missingScopeResponse.json(),
      denied: wrongProjectResponse.json(),
      methodGuards: methodGuardResponses.map((response) => response.body)
    });
    expect(serialized).not.toContain('"rawArchivePayload":');
    expect(serialized).not.toContain('"manifestEntries":');
    expect(serialized).not.toContain('"resultFiles":');
    expect(serialized).not.toContain('"content"');
    expect(serialized).not.toContain('"localPath"');
    expect(serialized).not.toContain('"storageKey"');
    expect(serialized).not.toContain("C:\\");
    expect(serialized).not.toContain("/tmp/");
    expect(serialized).not.toContain("synthetic://unsafe");
    expect(serialized).not.toContain("storage://");
    expect(serialized).not.toContain("minio://");
    expect(serialized).not.toContain("blob://");
    expect(serialized).not.toContain('"signedUrl":');
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("token=");
    expect(serialized).not.toContain("archive-materialized-fixture-secret");
    expect(serialized).not.toContain("archive-materialized-fixture-missing-scope-secret");
    expect(serialized).not.toContain("archive-materialized-fixture-method-secret");
    expect(serialized).not.toContain("archive-materialized-fixture-method-token");
    expect(serialized).not.toContain("archive-materialized-fixture-raw-token");
    expect(serialized).not.toContain("raw-result-token");
    expect(serialized).not.toContain("UI route");
    expect(serialized).not.toContain("MCP");

    const openApi = readFileSync(
      new URL("../../../docs/openapi/openapi.yaml", import.meta.url),
      "utf8"
    );
    expect(openApi).toContain(
      "/api/v1/projects/{projectId}/archive/diagnostics/replay/fixtures/materialized"
    );
    expect(openApi).toContain("ArchiveDiagnosticReplayMaterializedFixtureListResponse");
    expect(openApi).toContain(
      "worker-compatible-archive-diagnostic-replay-fixture-materialized-read"
    );
    const materializedOpenApiPath =
      "/api/v1/projects/{projectId}/archive/diagnostics/replay/fixtures/materialized:";
    expect(openApi.split(materializedOpenApiPath)).toHaveLength(2);
    const materializedOpenApiStart = openApi.indexOf(materializedOpenApiPath);
    const nextPathStart = openApi.indexOf("\n  /", materializedOpenApiStart + 1);
    const materializedOpenApiSection = openApi.slice(materializedOpenApiStart, nextPathStart);
    expect(materializedOpenApiSection).toContain("\n    get:");
    expect(materializedOpenApiSection).not.toContain("\n    post:");
    expect(materializedOpenApiSection).not.toContain("\n    put:");
    expect(materializedOpenApiSection).not.toContain("\n    patch:");
    expect(materializedOpenApiSection).not.toContain("\n    delete:");
    expect(openApi).not.toContain("/api/v1/archive/diagnostics/replay/fixtures/materialized:");
    expect(openApi).not.toContain(
      "/api/v1/projects/{projectId}/archive/diagnostics/replay/fixtures/materialized/execute:"
    );
  });

  it("denies archive diagnostic replay fixture reads with redacted scope metadata", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    const otherProject = await createProject(app);

    const missingScopeResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/archive/diagnostics/replay/fixtures`,
      headers: {
        authorization: "Bearer archive-fixture-denied-token",
        "x-testhistory-scopes": "launches:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "denied-archive-fixture-reader"
      }
    });
    const wrongProjectResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/archive/diagnostics/replay/fixtures`,
      headers: {
        authorization: "Bearer archive-fixture-denied-token",
        "x-testhistory-scopes": "uploads:read,launches:read",
        "x-testhistory-project-scope": otherProject.id,
        "x-testhistory-actor-id": "wrong-project-archive-fixture-reader"
      }
    });

    expect(missingScopeResponse.statusCode).toBe(403);
    expect(wrongProjectResponse.statusCode).toBe(403);
    expect(missingScopeResponse.json()).toEqual(
      expect.objectContaining({
        kind: "archive-diagnostic-replay-fixture-list",
        error: "PermissionDeniedError",
        requiredScopes: ["uploads:read", "launches:read"],
        projectId: project.id,
        actor: {
          type: "actor",
          actorId: "denied-archive-fixture-reader",
          scoped: true
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
    expect(missingScopeResponse.body).not.toContain("archive-fixture-denied-token");
    expect(wrongProjectResponse.body).not.toContain("archive-fixture-denied-token");
  });

  it("reports malformed supported Allure side files without rejecting the whole upload", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "valid-result.json",
            content: JSON.stringify({
              uuid: "valid-result",
              name: "valid result",
              status: "passed"
            })
          },
          {
            path: "bad-container.json",
            content: "{"
          }
        ]
      }
    });

    expect(response.statusCode).toBe(207);
    expect(response.json()).toEqual(
      expect.objectContaining({
        job: expect.objectContaining({
          status: "completed_with_errors",
          importedResults: 1,
          storedArtifacts: 2,
          errors: [
            expect.objectContaining({
              path: "bad-container.json",
              errors: [expect.stringContaining("Invalid JSON")]
            })
          ]
        }),
        compatibilityFiles: expect.arrayContaining([
          expect.objectContaining({ path: "valid-result.json", status: "imported" }),
          expect.objectContaining({
            path: "bad-container.json",
            kind: "container",
            status: "diagnostic",
            errors: [expect.stringContaining("Invalid JSON")]
          })
        ]),
        artifacts: expect.arrayContaining([
          expect.objectContaining({ path: "valid-result.json" }),
          expect.objectContaining({ path: "bad-container.json" })
        ])
      })
    );
  });

  it("reports upload job status progress and diagnostics", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);

    const uploadResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "diagnostic-result.json",
            content: JSON.stringify({
              uuid: "diagnostic-result",
              name: "diagnostic",
              status: "passed"
            })
          },
          {
            path: "diagnostic-container.json",
            content: "{"
          }
        ]
      }
    });
    expect(uploadResponse.statusCode).toBe(207);
    const upload = uploadResponse.json<{ job: { id: string } }>();

    const statusResponse = await app.inject({
      method: "GET",
      url: `/api/v1/uploads/${upload.job.id}/status`
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toEqual(
      expect.objectContaining({
        id: upload.job.id,
        kind: "job",
        launchId: launch.id,
        status: "completed_with_errors",
        progress: expect.objectContaining({
          totalUnits: 2,
          processedUnits: 2,
          percent: 100
        }),
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            scope: "file",
            severity: "error",
            code: "upload.file.error",
            path: "diagnostic-container.json",
            message: expect.stringContaining("Invalid JSON")
          })
        ]),
        queue: expect.objectContaining({
          mode: "queue",
          queue: expect.objectContaining({
            name: "ingestion.parse",
            depth: 0,
            inFlight: 0
          }),
          capacity: expect.objectContaining({
            targetResults: 100000,
            status: "ok"
          }),
          backpressure: expect.objectContaining({
            accepting: true,
            reason: "below_watermark"
          })
        }),
        links: expect.objectContaining({
          self: `/api/v1/uploads/${upload.job.id}/status`,
          launch: `/api/v1/launches/${launch.id}`,
          job: `/api/v1/uploads/${upload.job.id}`
        })
      })
    );
  });
});
