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

describe("api app archive-diagnostics", () => {
  it("applies project artifact retention settings to uploaded artifacts", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const ownerHeaders = {
      "x-testhistory-actor-id": "project-owner",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-scopes": "settings:read settings:write"
    };

    const settingsResponse = await app.inject({
      headers: ownerHeaders,
      method: "GET",
      url: `/api/v1/projects/${project.id}/settings/artifacts`
    });
    const patchResponse = await app.inject({
      headers: ownerHeaders,
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/settings/artifacts`,
      payload: {
        attachmentRetentionDays: 3,
        cleanupGraceDays: 1,
        compressRetainedTextArtifacts: false,
        deleteBinaryArtifactsAfterRetention: true,
        retentionPolicies: [
          {
            artifact: "Скриншоты",
            failedDays: 91,
            id: "screenshots",
            maxSizeMb: 30,
            passedDays: 15,
            quarantinedDays: 121
          }
        ]
      }
    });
    const launchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Retention override" }
    });
    const launch = launchResponse.json<LaunchResponse>();
    const content = JSON.stringify({
      uuid: "project-retention-result",
      name: "project retention import",
      status: "passed"
    });
    const sessionResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/uploads/chunked`,
      payload: {
        path: "project-retention-result.json",
        totalChunks: 1,
        totalBytes: Buffer.byteLength(content)
      }
    });

    expect(settingsResponse.statusCode).toBe(200);
    expect(settingsResponse.json()).toEqual(
      expect.objectContaining({
        kind: "project-artifact-settings",
        projectId: project.id,
        source: "project",
        retention: expect.objectContaining({
          attachmentRetentionDays: 14,
          cleanupGraceDays: 7
        })
      })
    );
    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json()).toEqual(
      expect.objectContaining({
        retention: expect.objectContaining({
          attachmentRetentionDays: 3,
          cleanupGraceDays: 1,
          compressRetainedTextArtifacts: false,
          deleteBinaryArtifactsAfterRetention: true,
          retentionPolicies: [
            expect.objectContaining({
              artifact: "Скриншоты",
              failedDays: 91,
              id: "screenshots",
              maxSizeMb: 30,
              passedDays: 15,
              quarantinedDays: 121
            })
          ]
        }),
        retentionPolicies: [
          expect.objectContaining({
            failedDays: 91,
            maxSizeMb: 30,
            passedDays: 15,
            quarantinedDays: 121
          })
        ],
        effectivePolicy: expect.objectContaining({
          retentionDays: 3,
          cleanupGraceDays: 1
        })
      })
    );
    expect(sessionResponse.statusCode).toBe(201);
    const session = sessionResponse.json<{ id: string }>();
    const chunkResponse = await app.inject({
      method: "PUT",
      url: `/api/v1/uploads/${session.id}/chunks/0`,
      payload: { content }
    });
    const completeResponse = await app.inject({
      method: "POST",
      url: `/api/v1/uploads/${session.id}/complete`
    });

    expect(chunkResponse.statusCode).toBe(200);
    expect(completeResponse.statusCode).toBe(202);
    const job = completeResponse.json<{ job: { id: string } }>().job;
    const processResponse = await app.inject({
      method: "POST",
      url: `/api/v1/uploads/${job.id}/process`
    });

    expect(processResponse.statusCode).toBe(200);
    const artifact = Array.from(store.artifacts.values()).find(
      (candidate) => candidate.path === "project-retention-result.json"
    );
    expect(artifact).toEqual(
      expect.objectContaining({
        projectId: project.id,
        retention: expect.objectContaining({
          days: 3,
          cleanupEligibleAt: expect.any(String)
        })
      })
    );
  });

  it("enforces project membership roles on artifact settings management", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    const ownerHeaders = {
      "x-testhistory-actor-id": "project-owner",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-scopes": "settings:read settings:write"
    };

    const membershipResponse = await app.inject({
      headers: ownerHeaders,
      method: "PATCH",
      payload: {
        memberships: [
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Project Owner",
            id: "artifact-owner",
            role: "owner",
            source: "manual",
            status: "active",
            subject: "project-owner",
            updatedAt: "2026-06-03T00:00:00.000Z"
          },
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Release Maintainer",
            id: "artifact-maintainer",
            role: "maintainer",
            source: "manual",
            status: "active",
            subject: "release-maintainer",
            updatedAt: "2026-06-03T00:00:00.000Z"
          },
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Audit Viewer",
            id: "artifact-viewer",
            role: "viewer",
            source: "manual",
            status: "active",
            subject: "audit-viewer",
            updatedAt: "2026-06-03T00:00:00.000Z"
          }
        ]
      },
      url: `/api/v1/projects/${project.id}/settings/access`
    });
    const maintainerReadResponse = await app.inject({
      headers: {
        "x-testhistory-actor-id": "release-maintainer",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-scopes": "settings:read"
      },
      method: "GET",
      url: `/api/v1/projects/${project.id}/settings/artifacts`
    });
    const maintainerWriteResponse = await app.inject({
      headers: {
        "x-testhistory-actor-id": "release-maintainer",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-scopes": "settings:write"
      },
      method: "PATCH",
      payload: { attachmentRetentionDays: 30 },
      url: `/api/v1/projects/${project.id}/settings/artifacts`
    });
    const viewerReadResponse = await app.inject({
      headers: {
        "x-testhistory-actor-id": "audit-viewer",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-scopes": "settings:read"
      },
      method: "GET",
      url: `/api/v1/projects/${project.id}/settings/artifacts`
    });

    expect(membershipResponse.statusCode).toBe(200);
    expect(maintainerReadResponse.statusCode).toBe(200);
    expect(maintainerWriteResponse.statusCode).toBe(403);
    expect(maintainerWriteResponse.json()).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        message: "Actor role is not allowed to manage project settings",
        projectId: project.id,
        redacted: true,
        requiredRoles: ["owner"],
        requiredScopes: ["settings:write"]
      })
    );
    expect(viewerReadResponse.statusCode).toBe(403);
    expect(viewerReadResponse.json()).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        message: "Actor role is not allowed to read project settings",
        projectId: project.id,
        redacted: true,
        requiredRoles: ["owner", "maintainer"],
        requiredScopes: ["settings:read"]
      })
    );
  });

  it("enforces project roles and visibility on dashboard management", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    const ownerHeaders = {
      "x-testhistory-actor-id": "project-owner",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-scopes": "settings:write dashboards:read dashboards:write"
    };

    const membershipResponse = await app.inject({
      headers: ownerHeaders,
      method: "PATCH",
      payload: {
        memberships: [
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Project Owner",
            id: "dashboard-owner",
            role: "owner",
            source: "manual",
            status: "active",
            subject: "project-owner",
            updatedAt: "2026-06-03T00:00:00.000Z"
          },
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Release Maintainer",
            id: "dashboard-maintainer",
            role: "maintainer",
            source: "manual",
            status: "active",
            subject: "release-maintainer",
            updatedAt: "2026-06-03T00:00:00.000Z"
          },
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Audit Viewer",
            id: "dashboard-viewer",
            role: "viewer",
            source: "manual",
            status: "active",
            subject: "audit-viewer",
            updatedAt: "2026-06-03T00:00:00.000Z"
          }
        ]
      },
      url: `/api/v1/projects/${project.id}/settings/access`
    });
    const createResponse = await app.inject({
      headers: ownerHeaders,
      method: "POST",
      payload: {
        description: "Private project dashboard",
        name: "Team quality",
        projectId: project.id
      },
      url: "/api/v1/dashboards"
    });
    const dashboard = createResponse.json<{ id: string }>();
    const viewerReadResponse = await app.inject({
      headers: {
        "x-testhistory-actor-id": "audit-viewer",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-scopes": "dashboards:read"
      },
      method: "GET",
      url: `/api/v1/dashboards/${dashboard.id}`
    });
    const viewerWriteResponse = await app.inject({
      headers: {
        "x-testhistory-actor-id": "audit-viewer",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-scopes": "dashboards:write"
      },
      method: "PATCH",
      payload: { name: "Viewer edit" },
      url: `/api/v1/dashboards/${dashboard.id}`
    });
    const maintainerWriteResponse = await app.inject({
      headers: {
        "x-testhistory-actor-id": "release-maintainer",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-scopes": "dashboards:write"
      },
      method: "PATCH",
      payload: { name: "Maintainer edit" },
      url: `/api/v1/dashboards/${dashboard.id}`
    });
    const outsiderListResponse = await app.inject({
      headers: {
        "x-testhistory-actor-id": "outsider",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-scopes": "dashboards:read"
      },
      method: "GET",
      url: "/api/v1/dashboards"
    });

    expect(membershipResponse.statusCode).toBe(200);
    expect(createResponse.statusCode).toBe(201);
    expect(viewerReadResponse.statusCode).toBe(200);
    expect(viewerWriteResponse.statusCode).toBe(403);
    expect(viewerWriteResponse.json()).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        message: "Actor role is not allowed to manage dashboards",
        projectId: project.id,
        redacted: true,
        requiredRoles: ["owner", "maintainer", "editor"],
        requiredScopes: ["dashboards:write"]
      })
    );
    expect(maintainerWriteResponse.statusCode).toBe(200);
    expect(maintainerWriteResponse.json()).toEqual(
      expect.objectContaining({
        name: "Maintainer edit"
      })
    );
    expect(outsiderListResponse.statusCode).toBe(200);
    expect(outsiderListResponse.json()).toEqual(
      expect.objectContaining({
        items: []
      })
    );
  });

  it("filters analytics rows by project visibility and analytics scope", async () => {
    app = await createApiApp();
    const firstProject = await createProject(app);
    const secondProject = await createProject(app);
    await createProjectLaunch(app, firstProject.id, "Visible launch");
    await createProjectLaunch(app, secondProject.id, "Hidden launch");
    const ownerHeaders = (projectId: string) => ({
      "x-testhistory-actor-id": "project-owner",
      "x-testhistory-project-scope": projectId,
      "x-testhistory-scopes": "settings:write"
    });

    const membershipResponse = await app.inject({
      headers: ownerHeaders(firstProject.id),
      method: "PATCH",
      payload: {
        memberships: [
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Project Owner",
            id: "analytics-owner",
            role: "owner",
            source: "manual",
            status: "active",
            subject: "project-owner",
            updatedAt: "2026-06-03T00:00:00.000Z"
          },
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Analytics Viewer",
            id: "analytics-viewer",
            role: "viewer",
            source: "manual",
            status: "active",
            subject: "analytics-viewer",
            updatedAt: "2026-06-03T00:00:00.000Z"
          }
        ]
      },
      url: `/api/v1/projects/${firstProject.id}/settings/access`
    });
    const previewResponse = await app.inject({
      headers: {
        "x-testhistory-actor-id": "analytics-viewer",
        "x-testhistory-project-scope": "*",
        "x-testhistory-scopes": "analytics:read"
      },
      method: "POST",
      payload: { query: { entity: "launches" } },
      url: "/api/v1/query/preview"
    });
    const missingScopeResponse = await app.inject({
      headers: {
        "x-testhistory-actor-id": "analytics-viewer",
        "x-testhistory-project-scope": "*",
        "x-testhistory-scopes": "dashboards:read"
      },
      method: "POST",
      payload: { query: { entity: "launches", projectId: firstProject.id } },
      url: "/api/v1/analytics/run"
    });

    expect(membershipResponse.statusCode).toBe(200);
    expect(previewResponse.statusCode).toBe(200);
    expect(previewResponse.json()).toEqual(
      expect.objectContaining({
        rows: [
          expect.objectContaining({
            name: "Visible launch",
            projectId: firstProject.id
          })
        ]
      })
    );
    expect(JSON.stringify(previewResponse.json())).not.toContain(secondProject.id);
    expect(missingScopeResponse.statusCode).toBe(403);
    expect(missingScopeResponse.json()).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        message: "Missing required analytics:read scope",
        projectId: firstProject.id,
        redacted: true,
        requiredScopes: ["analytics:read"]
      })
    );
  });

  it("filters test case reads by project visibility and test case read scope", async () => {
    app = await createApiApp();
    const firstProject = await createProject(app);
    const secondProject = await createProject(app);
    const firstLaunch = await createProjectLaunch(app, firstProject.id, "Visible cases");
    const secondLaunch = await createProjectLaunch(app, secondProject.id, "Hidden cases");
    const targetApp = app;
    const uploadResult = async (launchId: string, uuid: string, testCaseId: string, name: string) =>
      targetApp.inject({
        method: "POST",
        payload: {
          files: [
            {
              content: JSON.stringify({
                fullName: `web.${testCaseId}`,
                historyId: `history-${testCaseId}`,
                name,
                status: "passed",
                testCaseId,
                uuid
              }),
              path: `${uuid}-result.json`
            }
          ]
        },
        url: `/api/v1/launches/${launchId}/results/json`
      });

    const visibleUploadResponse = await uploadResult(
      firstLaunch.id,
      "visible-case-result",
      "visible-case",
      "Visible checkout case"
    );
    const hiddenUploadResponse = await uploadResult(
      secondLaunch.id,
      "hidden-case-result",
      "hidden-case",
      "Hidden checkout case"
    );
    const membershipResponse = await app.inject({
      headers: {
        "x-testhistory-actor-id": "project-owner",
        "x-testhistory-project-scope": firstProject.id,
        "x-testhistory-scopes": "settings:write"
      },
      method: "PATCH",
      payload: {
        memberships: [
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Project Owner",
            id: "test-case-read-owner",
            role: "owner",
            source: "manual",
            status: "active",
            subject: "project-owner",
            updatedAt: "2026-06-03T00:00:00.000Z"
          },
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Case Reader",
            id: "test-case-reader",
            role: "viewer",
            source: "manual",
            status: "active",
            subject: "case-reader",
            updatedAt: "2026-06-03T00:00:00.000Z"
          }
        ]
      },
      url: `/api/v1/projects/${firstProject.id}/settings/access`
    });
    const listResponse = await app.inject({
      headers: {
        "x-testhistory-actor-id": "case-reader",
        "x-testhistory-project-scope": "*",
        "x-testhistory-scopes": "test-cases:read"
      },
      method: "GET",
      url: "/api/v1/test-cases"
    });
    const missingScopeResponse = await app.inject({
      headers: {
        "x-testhistory-actor-id": "case-reader",
        "x-testhistory-project-scope": firstProject.id,
        "x-testhistory-scopes": "launches:read"
      },
      method: "GET",
      url: `/api/v1/test-cases/visible-case/history?projectId=${firstProject.id}`
    });

    expect(visibleUploadResponse.statusCode).toBe(200);
    expect(hiddenUploadResponse.statusCode).toBe(200);
    expect(membershipResponse.statusCode).toBe(200);
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual(
      expect.objectContaining({
        items: [expect.objectContaining({ id: "visible-case", name: "Visible checkout case" })]
      })
    );
    expect(JSON.stringify(listResponse.json())).not.toContain("hidden-case");
    expect(missingScopeResponse.statusCode).toBe(403);
    expect(missingScopeResponse.json()).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        message: "Missing required test-cases:read scope",
        projectId: firstProject.id,
        redacted: true,
        requiredScopes: ["test-cases:read"]
      })
    );
  });

  it("creates launches for an existing project", async () => {
    app = await createApiApp();
    const project = await createProject(app);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Nightly", branch: "main", commitSha: "abc123" }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<LaunchResponse>()).toEqual(
      expect.objectContaining({
        projectId: project.id,
        name: "Nightly",
        counters: {
          failed: 0,
          broken: 0,
          passed: 0,
          skipped: 0,
          unknown: 0
        }
      })
    );
  });

  it("imports Allure result JSON uploads into a launch", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "checkout-result.json",
            content: JSON.stringify({
              uuid: "result-1",
              name: "checkout succeeds",
              status: "passed",
              start: 100,
              stop: 175
            })
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        job: expect.objectContaining({
          status: "completed",
          receivedFiles: 1,
          importedResults: 1,
          storedArtifacts: 1
        }),
        imported: [{ path: "checkout-result.json", uuid: "result-1", warnings: [] }],
        compatibilityFiles: [
          {
            path: "checkout-result.json",
            kind: "result",
            status: "imported",
            uuid: "result-1",
            warnings: [],
            errors: []
          }
        ],
        artifacts: [
          expect.objectContaining({ path: "checkout-result.json", kind: "allure-result" })
        ],
        launch: expect.objectContaining({
          id: launch.id,
          counters: expect.objectContaining({ passed: 1 })
        })
      })
    );
  });
});
