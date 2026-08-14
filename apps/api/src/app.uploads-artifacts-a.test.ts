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

describe("api app uploads-artifacts-a", () => {
  it("enforces project visibility and memberships on project and launch reads", async () => {
    app = await createApiApp();
    const privateProject = await createProject(app);
    const deniedProject = await createProject(app);
    const internalProject = await createProject(app);
    const ownerHeaders = (projectId: string) => ({
      "x-testhistory-actor-id": "project-owner",
      "x-testhistory-project-scope": projectId,
      "x-testhistory-scopes": "settings:write"
    });
    const readerHeaders = (projectId: string, scopes: string) => ({
      "x-testhistory-actor-id": "launch-reader",
      "x-testhistory-project-scope": projectId,
      "x-testhistory-scopes": scopes
    });
    const wildcardProjectHeaders = {
      "x-testhistory-actor-id": "launch-reader",
      "x-testhistory-project-scope": "*",
      "x-testhistory-scopes": "projects:read"
    };

    const privateSettingsResponse = await app.inject({
      headers: ownerHeaders(privateProject.id),
      method: "PATCH",
      payload: {
        memberships: [
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Project Owner",
            id: "private-owner",
            role: "owner",
            source: "manual",
            status: "active",
            subject: "project-owner",
            updatedAt: "2026-06-03T00:00:00.000Z"
          },
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Launch Reader",
            id: "private-reader",
            role: "viewer",
            source: "manual",
            status: "active",
            subject: "launch-reader",
            updatedAt: "2026-06-03T00:00:00.000Z"
          }
        ],
        visibility: "private"
      },
      url: `/api/v1/projects/${privateProject.id}/settings/access`
    });
    const deniedSettingsResponse = await app.inject({
      headers: ownerHeaders(deniedProject.id),
      method: "PATCH",
      payload: { visibility: "private" },
      url: `/api/v1/projects/${deniedProject.id}/settings/access`
    });
    const internalSettingsResponse = await app.inject({
      headers: ownerHeaders(internalProject.id),
      method: "PATCH",
      payload: { visibility: "internal" },
      url: `/api/v1/projects/${internalProject.id}/settings/access`
    });
    const privateLaunch = await createProjectLaunch(app, privateProject.id, "Private Nightly");
    const deniedLaunch = await createProjectLaunch(app, deniedProject.id, "Denied Nightly");
    const internalLaunch = await createProjectLaunch(app, internalProject.id, "Internal Nightly");

    const projectListResponse = await app.inject({
      headers: wildcardProjectHeaders,
      method: "GET",
      url: "/api/v1/projects"
    });
    const allowedLaunchListResponse = await app.inject({
      headers: readerHeaders(privateProject.id, "launches:read"),
      method: "GET",
      url: `/api/v1/projects/${privateProject.id}/launches`
    });
    const deniedLaunchListResponse = await app.inject({
      headers: readerHeaders(deniedProject.id, "launches:read"),
      method: "GET",
      url: `/api/v1/projects/${deniedProject.id}/launches`
    });
    const deniedLaunchDetailResponse = await app.inject({
      headers: readerHeaders(deniedProject.id, "launches:read"),
      method: "GET",
      url: `/api/v1/launches/${deniedLaunch.id}`
    });
    const internalLaunchDetailResponse = await app.inject({
      headers: readerHeaders(internalProject.id, "launches:read"),
      method: "GET",
      url: `/api/v1/launches/${internalLaunch.id}`
    });

    expect(privateSettingsResponse.statusCode).toBe(200);
    expect(deniedSettingsResponse.statusCode).toBe(200);
    expect(internalSettingsResponse.statusCode).toBe(200);
    expect(projectListResponse.statusCode).toBe(200);
    expect(projectListResponse.json<ProjectResponse[]>().map((project) => project.id)).toEqual(
      expect.arrayContaining([privateProject.id, internalProject.id])
    );
    expect(
      projectListResponse.json<ProjectResponse[]>().map((project) => project.id)
    ).not.toContain(deniedProject.id);
    expect(allowedLaunchListResponse.statusCode).toBe(200);
    expect(allowedLaunchListResponse.json<ListResponse<LaunchResponse>>().items).toEqual([
      expect.objectContaining({ id: privateLaunch.id })
    ]);
    expect(deniedLaunchListResponse.statusCode).toBe(403);
    expect(deniedLaunchListResponse.json()).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        projectId: deniedProject.id,
        redacted: true,
        requiredRoles: ["owner", "maintainer", "editor", "viewer", "ci"],
        requiredScopes: ["launches:read"]
      })
    );
    expect(deniedLaunchDetailResponse.statusCode).toBe(403);
    expect(internalLaunchDetailResponse.statusCode).toBe(200);
  });

  it("requires project authentication in production auth mode", async () => {
    const previousRequireAuth = process.env.TESTHISTORY_REQUIRE_PROJECT_AUTH;
    try {
      app = await createApiApp();
      const project = await createProject(app);
      const launch = await createProjectLaunch(app, project.id, "Production auth launch");
      process.env.TESTHISTORY_REQUIRE_PROJECT_AUTH = "true";
      const noAuthProjectsResponse = await app.inject({
        method: "GET",
        url: "/api/v1/projects"
      });
      const noAuthCreateProjectResponse = await app.inject({
        method: "POST",
        payload: { key: "DENY", name: "Denied project" },
        url: "/api/v1/projects"
      });
      const scopedCreateProjectResponse = await app.inject({
        headers: {
          "x-testhistory-actor-id": "platform-owner",
          "x-testhistory-scopes": "projects:write"
        },
        method: "POST",
        payload: { key: "ALLOW", name: "Allowed project" },
        url: "/api/v1/projects"
      });
      const noAuthLaunchesResponse = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${project.id}/launches`
      });
      const noAuthIngestionResponse = await app.inject({
        method: "GET",
        url: `/api/v1/launches/${launch.id}/ingestion/status`
      });
      const scopedLaunchesResponse = await app.inject({
        headers: {
          "x-testhistory-actor-id": "project-owner",
          "x-testhistory-project-scope": project.id,
          "x-testhistory-scopes": "launches:read"
        },
        method: "GET",
        url: `/api/v1/projects/${project.id}/launches`
      });
      const scopedIngestionResponse = await app.inject({
        headers: {
          "x-testhistory-actor-id": "project-owner",
          "x-testhistory-project-scope": project.id,
          "x-testhistory-scopes": "uploads:read launches:read"
        },
        method: "GET",
        url: `/api/v1/launches/${launch.id}/ingestion/status`
      });

      expect(launch.projectId).toBe(project.id);
      expect(noAuthProjectsResponse.statusCode).toBe(403);
      expect(noAuthProjectsResponse.json()).toEqual(
        expect.objectContaining({
          error: "PermissionDeniedError",
          message: "Authentication is required to list projects",
          redacted: true,
          requiredScopes: ["projects:read"]
        })
      );
      expect(noAuthCreateProjectResponse.statusCode).toBe(403);
      expect(noAuthCreateProjectResponse.json()).toEqual(
        expect.objectContaining({
          error: "PermissionDeniedError",
          message: "Authentication is required to create projects",
          redacted: true,
          requiredScopes: ["projects:write"]
        })
      );
      expect(scopedCreateProjectResponse.statusCode).toBe(201);
      expect(noAuthLaunchesResponse.statusCode).toBe(403);
      expect(noAuthLaunchesResponse.json()).toEqual(
        expect.objectContaining({
          error: "PermissionDeniedError",
          message: "Authentication is required to read this project",
          projectId: project.id,
          redacted: true,
          requiredScopes: ["launches:read"]
        })
      );
      expect(scopedLaunchesResponse.statusCode).toBe(200);
      expect(noAuthIngestionResponse.statusCode).toBe(403);
      expect(noAuthIngestionResponse.json()).toEqual(
        expect.objectContaining({
          error: "PermissionDeniedError",
          message: "Authentication is required to read archive status",
          projectId: project.id,
          redacted: true,
          requiredScopes: ["uploads:read", "launches:read"]
        })
      );
      expect(scopedIngestionResponse.statusCode).toBe(200);
    } finally {
      if (previousRequireAuth === undefined) {
        delete process.env.TESTHISTORY_REQUIRE_PROJECT_AUTH;
      } else {
        process.env.TESTHISTORY_REQUIRE_PROJECT_AUTH = previousRequireAuth;
      }
    }
  });

  it("enforces project membership roles on launch mutations", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    const ownerHeaders = {
      "x-testhistory-actor-id": "project-owner",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-scopes": "settings:write"
    };
    const actorHeaders = (actorId: string) => ({
      "x-testhistory-actor-id": actorId,
      "x-testhistory-project-scope": project.id,
      "x-testhistory-scopes": "launches:write"
    });

    const membershipResponse = await app.inject({
      headers: ownerHeaders,
      method: "PATCH",
      payload: {
        memberships: [
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Project Owner",
            id: "launch-owner",
            role: "owner",
            source: "manual",
            status: "active",
            subject: "project-owner",
            updatedAt: "2026-06-03T00:00:00.000Z"
          },
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Launch Viewer",
            id: "launch-viewer",
            role: "viewer",
            source: "manual",
            status: "active",
            subject: "launch-viewer",
            updatedAt: "2026-06-03T00:00:00.000Z"
          },
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Launch Editor",
            id: "launch-editor",
            role: "editor",
            source: "manual",
            status: "active",
            subject: "launch-editor",
            updatedAt: "2026-06-03T00:00:00.000Z"
          }
        ]
      },
      url: `/api/v1/projects/${project.id}/settings/access`
    });
    const viewerCreateResponse = await app.inject({
      headers: actorHeaders("launch-viewer"),
      method: "POST",
      payload: { name: "Viewer attempt" },
      url: `/api/v1/projects/${project.id}/launches`
    });
    const editorCreateResponse = await app.inject({
      headers: actorHeaders("launch-editor"),
      method: "POST",
      payload: { name: "Editor launch" },
      url: `/api/v1/projects/${project.id}/launches`
    });
    const editorLaunch = editorCreateResponse.json<LaunchResponse>();
    const viewerCloseResponse = await app.inject({
      headers: actorHeaders("launch-viewer"),
      method: "POST",
      url: `/api/v1/launches/${editorLaunch.id}/close`
    });
    const editorCloseResponse = await app.inject({
      headers: actorHeaders("launch-editor"),
      method: "POST",
      url: `/api/v1/launches/${editorLaunch.id}/close`
    });
    const viewerArchiveResponse = await app.inject({
      headers: actorHeaders("launch-viewer"),
      method: "POST",
      url: `/api/v1/launches/${editorLaunch.id}/archive`
    });
    const editorArchiveResponse = await app.inject({
      headers: actorHeaders("launch-editor"),
      method: "POST",
      url: `/api/v1/launches/${editorLaunch.id}/archive`
    });

    expect(membershipResponse.statusCode).toBe(200);
    expect(viewerCreateResponse.statusCode).toBe(403);
    expect(viewerCreateResponse.json()).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        projectId: project.id,
        redacted: true,
        requiredRoles: ["owner", "maintainer", "editor", "ci"],
        requiredScopes: ["launches:write"]
      })
    );
    expect(editorCreateResponse.statusCode).toBe(201);
    expect(viewerCloseResponse.statusCode).toBe(403);
    expect(editorCloseResponse.statusCode).toBe(200);
    expect(viewerArchiveResponse.statusCode).toBe(403);
    expect(editorArchiveResponse.statusCode).toBe(200);
  });

  it("enforces project membership roles on launch uploads", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    const launch = await createProjectLaunch(app, project.id, "Upload auth launch");
    const ownerHeaders = {
      "x-testhistory-actor-id": "project-owner",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-scopes": "settings:write"
    };
    const actorHeaders = (actorId: string) => ({
      "x-testhistory-actor-id": actorId,
      "x-testhistory-project-scope": project.id,
      "x-testhistory-scopes": "uploads:write"
    });
    const resultPayload = {
      files: [
        {
          content: JSON.stringify({
            name: "upload auth result",
            start: 100,
            status: "passed",
            stop: 150,
            uuid: "upload-auth-result"
          }),
          path: "upload-auth-result.json"
        }
      ]
    };

    const membershipResponse = await app.inject({
      headers: ownerHeaders,
      method: "PATCH",
      payload: {
        memberships: [
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Project Owner",
            id: "upload-owner",
            role: "owner",
            source: "manual",
            status: "active",
            subject: "project-owner",
            updatedAt: "2026-06-03T00:00:00.000Z"
          },
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Upload Viewer",
            id: "upload-viewer",
            role: "viewer",
            source: "manual",
            status: "active",
            subject: "upload-viewer",
            updatedAt: "2026-06-03T00:00:00.000Z"
          },
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "CI Uploader",
            id: "upload-ci",
            role: "ci",
            source: "manual",
            status: "active",
            subject: "upload-ci",
            updatedAt: "2026-06-03T00:00:00.000Z"
          }
        ]
      },
      url: `/api/v1/projects/${project.id}/settings/access`
    });
    const viewerUploadResponse = await app.inject({
      headers: actorHeaders("upload-viewer"),
      method: "POST",
      payload: resultPayload,
      url: `/api/v1/launches/${launch.id}/results/json`
    });
    const ciUploadResponse = await app.inject({
      headers: actorHeaders("upload-ci"),
      method: "POST",
      payload: resultPayload,
      url: `/api/v1/launches/${launch.id}/results/json`
    });
    const ciArchiveResponse = await app.inject({
      headers: actorHeaders("upload-ci"),
      method: "POST",
      payload: { archiveName: "upload-auth.zip", entries: [] },
      url: `/api/v1/launches/${launch.id}/uploads/archive`
    });
    const viewerChunkedResponse = await app.inject({
      headers: actorHeaders("upload-viewer"),
      method: "POST",
      payload: { path: "viewer-denied.json", totalChunks: 1 },
      url: `/api/v1/launches/${launch.id}/uploads/chunked`
    });
    const ciChunkedResponse = await app.inject({
      headers: actorHeaders("upload-ci"),
      method: "POST",
      payload: { path: "ci-allowed.json", totalChunks: 1 },
      url: `/api/v1/launches/${launch.id}/uploads/chunked`
    });

    expect(membershipResponse.statusCode).toBe(200);
    expect(viewerUploadResponse.statusCode).toBe(403);
    expect(viewerUploadResponse.json()).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        projectId: project.id,
        redacted: true,
        requiredRoles: ["owner", "maintainer", "editor", "ci"],
        requiredScopes: ["uploads:write"]
      })
    );
    expect(ciUploadResponse.statusCode).toBe(200);
    expect(ciArchiveResponse.statusCode).toBe(202);
    expect(viewerChunkedResponse.statusCode).toBe(403);
    expect(viewerChunkedResponse.json()).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        projectId: project.id,
        redacted: true,
        requiredRoles: ["owner", "maintainer", "editor", "ci"],
        requiredScopes: ["uploads:write"]
      })
    );
    expect(ciChunkedResponse.statusCode).toBe(201);
  });

  it("enforces project membership roles on test case mutations", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    const launch = await createProjectLaunch(app, project.id, "Test case auth launch");
    const ownerHeaders = {
      "x-testhistory-actor-id": "project-owner",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-scopes": "settings:write"
    };
    const actorHeaders = (actorId: string) => ({
      "x-testhistory-actor-id": actorId,
      "x-testhistory-project-scope": project.id,
      "x-testhistory-scopes": "test-cases:write"
    });

    await app.inject({
      method: "POST",
      payload: {
        files: [
          {
            content: JSON.stringify({
              fullName: "shop.auth.patch",
              historyId: "history-auth-patch",
              name: "auth patch",
              start: 100,
              status: "passed",
              stop: 125,
              testCaseId: "case-auth-patch",
              uuid: "auth-patch-result"
            }),
            path: "auth-patch-result.json"
          }
        ]
      },
      url: `/api/v1/launches/${launch.id}/results/json`
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/close`
    });

    const membershipResponse = await app.inject({
      headers: ownerHeaders,
      method: "PATCH",
      payload: {
        memberships: [
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Project Owner",
            id: "case-owner",
            role: "owner",
            source: "manual",
            status: "active",
            subject: "project-owner",
            updatedAt: "2026-06-03T00:00:00.000Z"
          },
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Case Viewer",
            id: "case-viewer",
            role: "viewer",
            source: "manual",
            status: "active",
            subject: "case-viewer",
            updatedAt: "2026-06-03T00:00:00.000Z"
          },
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Case Editor",
            id: "case-editor",
            role: "editor",
            source: "manual",
            status: "active",
            subject: "case-editor",
            updatedAt: "2026-06-03T00:00:00.000Z"
          }
        ]
      },
      url: `/api/v1/projects/${project.id}/settings/access`
    });
    const viewerPatchResponse = await app.inject({
      headers: actorHeaders("case-viewer"),
      method: "PATCH",
      payload: { workflowStatus: "draft" },
      url: "/api/v1/test-cases/case-auth-patch"
    });
    const editorPatchResponse = await app.inject({
      headers: actorHeaders("case-editor"),
      method: "PATCH",
      payload: { tags: ["authz"], workflowStatus: "draft" },
      url: "/api/v1/test-cases/case-auth-patch"
    });

    expect(membershipResponse.statusCode).toBe(200);
    expect(viewerPatchResponse.statusCode).toBe(403);
    expect(viewerPatchResponse.json()).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        projectId: project.id,
        redacted: true,
        requiredRoles: ["owner", "maintainer", "editor"],
        requiredScopes: ["test-cases:write"]
      })
    );
    expect(editorPatchResponse.statusCode).toBe(200);
    expect(editorPatchResponse.json()).toEqual(
      expect.objectContaining({
        tags: ["authz"],
        workflowStatus: "draft"
      })
    );
  });

  it("validates project integration providers before saving access settings", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    const authHeaders = {
      "x-testhistory-actor-id": "project-owner",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-scopes": "settings:write"
    };

    const rejectedResponse = await app.inject({
      headers: authHeaders,
      method: "PATCH",
      payload: {
        integrationProviders: [
          {
            baseUrl: "https://jira.example.test/browse/?token=raw",
            enabled: true,
            encodeSuffix: true,
            id: "jira",
            name: "Jira",
            preset: "jira",
            source: { kind: "issue", matchMode: "all", name: "issue" },
            suffixTemplate: "{value}",
            updatedAt: "2026-06-03T00:00:00.000Z"
          }
        ]
      },
      url: `/api/v1/projects/${project.id}/settings/access`
    });
    const savedResponse = await app.inject({
      headers: authHeaders,
      method: "PATCH",
      payload: {
        integrationProviders: [
          {
            baseUrl: "https://jira.example.test/browse/",
            enabled: true,
            encodeSuffix: true,
            id: "jira",
            name: "Jira",
            preset: "jira",
            source: { kind: "issue", matchMode: "all", name: "issue" },
            suffixTemplate: "{value}",
            updatedAt: "2026-06-03T00:00:00.000Z"
          }
        ]
      },
      url: `/api/v1/projects/${project.id}/settings/access`
    });

    expect(rejectedResponse.statusCode).toBe(400);
    expect(rejectedResponse.json()).toEqual(
      expect.objectContaining({
        message: "integration provider baseUrl must not include token-like query parameters",
        redacted: true
      })
    );
    expect(savedResponse.statusCode).toBe(200);
    expect(savedResponse.json()).toEqual(
      expect.objectContaining({
        integrationProviders: [
          expect.objectContaining({
            baseUrl: "https://jira.example.test/browse/",
            suffixTemplate: "{value}"
          })
        ]
      })
    );
  });
});
