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

describe("api app part-16", () => {
  it("keeps history comparison inside the requested project scope", async () => {
    app = await createApiApp();
    const firstProjectResponse = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      payload: { key: "CMA", name: "Compare A" }
    });
    const secondProjectResponse = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      payload: { key: "CMB", name: "Compare B" }
    });
    expect(firstProjectResponse.statusCode).toBe(201);
    expect(secondProjectResponse.statusCode).toBe(201);
    const firstProject = firstProjectResponse.json<ProjectResponse>();
    const secondProject = secondProjectResponse.json<ProjectResponse>();

    const firstLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${firstProject.id}/launches`,
      payload: { name: "Scope A" }
    });
    const secondLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${secondProject.id}/launches`,
      payload: { name: "Scope B" }
    });
    expect(firstLaunchResponse.statusCode).toBe(201);
    expect(secondLaunchResponse.statusCode).toBe(201);
    const firstLaunch = firstLaunchResponse.json<LaunchResponse>();
    const secondLaunch = secondLaunchResponse.json<LaunchResponse>();

    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${firstLaunch.id}/results/json`,
      payload: {
        files: [
          {
            path: "scope-a-result.json",
            content: JSON.stringify({
              uuid: "scope-a-result",
              testCaseId: "case-history-scope",
              name: "history scope",
              status: "failed"
            })
          }
        ]
      }
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${secondLaunch.id}/results/json`,
      payload: {
        files: [
          {
            path: "scope-b-result.json",
            content: JSON.stringify({
              uuid: "scope-b-result",
              testCaseId: "case-history-scope",
              name: "history scope",
              status: "passed"
            })
          }
        ]
      }
    });

    const missingScopeResponse = await app.inject({
      method: "GET",
      url:
        "/api/v1/test-cases/case-history-scope/history/compare" +
        "?baseResultUuid=scope-a-result&targetResultUuid=scope-b-result"
    });
    const deniedResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-history-scope/history/compare?projectId=${firstProject.id}` +
        "&baseResultUuid=scope-a-result&targetResultUuid=scope-b-result",
      headers: {
        authorization: "Bearer compare-denied-token",
        "x-testhistory-scopes": "launches:read",
        "x-testhistory-project-scope": firstProject.id,
        "x-testhistory-actor-id": "denied-reader"
      }
    });
    const wrongActorScopeResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-history-scope/history/compare?projectId=${firstProject.id}` +
        "&baseResultUuid=scope-a-result&targetResultUuid=scope-b-result",
      headers: {
        "x-testhistory-scopes": "test-cases:read",
        "x-testhistory-project-scope": secondProject.id,
        "x-testhistory-actor-id": "wrong-project-reader"
      }
    });
    const crossProjectResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-history-scope/history/compare?projectId=${firstProject.id}` +
        "&baseResultUuid=scope-a-result&targetResultUuid=scope-b-result",
      headers: {
        "x-testhistory-scopes": "test-cases:read",
        "x-testhistory-project-scope": firstProject.id
      }
    });
    const scopedResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-history-scope/history/compare?projectId=${firstProject.id}` +
        "&baseResultUuid=scope-a-result&targetResultUuid=scope-a-result",
      headers: {
        "x-testhistory-scopes": "test-cases:read",
        "x-testhistory-project-scope": firstProject.id
      }
    });

    expect(missingScopeResponse.statusCode).toBe(400);
    expect(missingScopeResponse.json()).toEqual({
      message: "projectId is required for history comparison"
    });
    expect(deniedResponse.statusCode).toBe(403);
    expect(deniedResponse.json()).toEqual(
      expect.objectContaining({
        kind: "test-case-history-compare",
        error: "PermissionDeniedError",
        requiredScopes: ["test-cases:read"],
        projectId: firstProject.id,
        actor: { type: "actor", actorId: "denied-reader", scoped: true },
        access: {
          scope: "test-cases:read",
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        availability: {
          status: "denied",
          reason: "invalid_token",
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          partial: false,
          unavailable: []
        },
        message: "API token is invalid",
        redacted: true
      })
    );
    expect(deniedResponse.body).not.toContain("compare-denied-token");
    expect(wrongActorScopeResponse.statusCode).toBe(403);
    expect(wrongActorScopeResponse.json()).toEqual(
      expect.objectContaining({
        kind: "test-case-history-compare",
        error: "PermissionDeniedError",
        requiredScopes: ["test-cases:read"],
        projectId: firstProject.id,
        actor: { type: "actor", actorId: "wrong-project-reader", scoped: true },
        availability: expect.objectContaining({
          status: "denied",
          reason: "project_scope_denied",
          redacted: true
        }),
        redacted: true
      })
    );
    expect(crossProjectResponse.statusCode).toBe(404);
    expect(crossProjectResponse.json()).toEqual({
      message: "History comparison point not found"
    });
    expect(scopedResponse.statusCode).toBe(400);
    expect(scopedResponse.json()).toEqual({
      message: "baseResultUuid and targetResultUuid must differ"
    });
  });

  it("marks history comparison enrichment as partial when optional fields are unavailable", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    const baseLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Partial base" }
    });
    const targetLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Partial target" }
    });
    const baseLaunch = baseLaunchResponse.json<LaunchResponse>();
    const targetLaunch = targetLaunchResponse.json<LaunchResponse>();

    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${baseLaunch.id}/results/json`,
      payload: {
        files: [
          {
            path: "partial-base-result.json",
            content: JSON.stringify({
              uuid: "partial-base",
              testCaseId: "case-history-partial",
              historyId: "history-partial",
              name: "partial compare",
              status: "failed",
              statusDetails: {
                message:
                  "token=partial-secret signedUrl=https://storage.example/base?sig=raw storageKey=raw-storage-key C:\\Users\\tester\\Downloads\\raw.txt"
              },
              labels: [{ name: "storageKey", value: "raw-storage-key" }],
              parameters: [{ name: "token", value: "partial-secret", mode: "masked" }]
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
            path: "partial-target-result.json",
            content: JSON.stringify({
              uuid: "partial-target",
              testCaseId: "case-history-partial",
              historyId: "history-partial",
              name: "partial compare",
              status: "passed",
              labels: [{ name: "component", value: "checkout" }],
              parameters: [{ name: "token", value: "partial-secret", mode: "masked" }]
            })
          }
        ]
      }
    });

    const response = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-history-partial/history/compare?projectId=${project.id}` +
        "&baseResultUuid=partial-base&targetResultUuid=partial-target&limit=1",
      headers: {
        "x-testhistory-scopes": "test-cases:read",
        "x-testhistory-project-scope": project.id
      }
    });

    expect(response.statusCode).toBe(200);
    const compare = response.json<{
      access: { actorScoped: boolean };
      availability: { status: string; partial: boolean; unavailable: string[] };
      enrichment: {
        status: string;
        fields: Record<string, { status: string; base: boolean; target: boolean }>;
        unavailable: string[];
      };
      page: { limit: number; returned: number; hasMore: boolean };
      redaction: {
        tokensIncluded: boolean;
        pathsIncluded: boolean;
        storageLocationsIncluded: boolean;
        artifactUrlsIncluded: boolean;
      };
      changes: Array<{ subject: string; before: string[]; after: string[]; redacted: boolean }>;
    }>();

    expect(compare.access.actorScoped).toBe(false);
    expect(compare.availability).toEqual(
      expect.objectContaining({
        status: "partial",
        partial: true,
        unavailable: expect.arrayContaining([
          "launch.branch",
          "launch.buildNumber",
          "launch.commitSha",
          "executor.name",
          "executor.buildUrl",
          "executor.reportUrl"
        ])
      })
    );
    expect(compare.enrichment).toEqual(
      expect.objectContaining({
        status: "partial",
        unavailable: compare.availability.unavailable,
        fields: expect.objectContaining({
          "launch.branch": { status: "unavailable", base: false, target: false },
          "executor.name": { status: "unavailable", base: false, target: false }
        })
      })
    );
    expect(compare.page).toEqual(expect.objectContaining({ limit: 1, returned: 1, hasMore: true }));
    expect(compare.redaction).toEqual(
      expect.objectContaining({
        tokensIncluded: false,
        pathsIncluded: false,
        storageLocationsIncluded: false,
        artifactUrlsIncluded: false
      })
    );
    expect(compare.changes[0]).toEqual(expect.objectContaining({ redacted: true }));
    expectSafeArtifactMetadata(compare, [
      "partial-base-result.json",
      "partial-target-result.json",
      "partial-secret",
      "raw-storage-key",
      "signedUrl=https://storage.example",
      "C:\\Users\\tester\\Downloads"
    ]);
    expect(response.body).not.toContain("partial-secret");
  });

  it("returns paginated actor-scoped history compare permission audit records", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    const launches: LaunchResponse[] = [];
    for (let index = 0; index < 4; index += 1) {
      const launchResponse = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${project.id}/launches`,
        payload: {
          name: `Permission audit ready ${index}`,
          branch: "main",
          buildNumber: `200${index}`,
          commitSha: `audit${index}`
        }
      });
      expect(launchResponse.statusCode).toBe(201);
      const launch = launchResponse.json<LaunchResponse>();
      launches.push(launch);
      await app.inject({
        method: "POST",
        url: `/api/v1/launches/${launch.id}/results/json`,
        payload: {
          files: [
            {
              path: `permission-ready-${index}-result.json`,
              content: JSON.stringify({
                uuid: `permission-ready-${index}`,
                testCaseId: "case-permission-audit-ready",
                historyId: "history-permission-audit-ready",
                name: "permission audit ready",
                status: index === 0 ? "failed" : "passed",
                start: index,
                stop: index + 10
              })
            },
            {
              path: "executor.json",
              content: JSON.stringify({
                name: "GitHub Actions",
                type: "ci",
                buildName: `ready-build-${index}`,
                buildUrl: `https://ci.example/build/${index}`,
                reportUrl: `https://reports.example/ready/${index}`
              })
            }
          ]
        }
      });
    }

    const headers = {
      "x-testhistory-scopes": "test-cases:read",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-actor-id": "permission-reader"
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
        name: "Permission audit reader",
        ownerSubject: "ci/permission-audit",
        scopes: ["test-cases:read"]
      }
    });
    expect(tokenResponse.statusCode).toBe(201);
    const apiToken = tokenResponse.json<{ secret: string }>();
    const response = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-permission-audit-ready/history/compare/permission-audit?projectId=${project.id}` +
        "&limit=2",
      headers
    });
    const secondPageResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-permission-audit-ready/history/compare/permission-audit?projectId=${project.id}` +
        "&limit=2&cursor=2",
      headers
    });
    const bearerResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-permission-audit-ready/history/compare/permission-audit?projectId=${project.id}` +
        "&limit=2",
      headers: {
        authorization: `Bearer ${apiToken.secret}`
      }
    });

    expect(response.statusCode).toBe(200);
    expect(bearerResponse.statusCode).toBe(200);
    expect(secondPageResponse.statusCode).toBe(200);
    const audit = response.json<{
      kind: string;
      projectId: string;
      testCaseId: string;
      actor: { type: string; actorId: string; scoped: boolean };
      access: {
        scope: string;
        projectScoped: boolean;
        actorScoped: boolean;
        mutation: boolean;
        redacted: boolean;
      };
      availability: { status: string; partial: boolean; unavailable: string[] };
      query: {
        comparePairScoped: boolean;
        pagination: { limit: number; cursor: string | null; offset: number };
        redacted: boolean;
      };
      audit: {
        mutationBoundary: string;
        replayedEventCount: number;
        recordCount: number;
        byDecision: { denied: number; partial: number; ready: number };
        rawHistory: { included: false; preserved: true; digests: string[]; itemCount: number };
        projectionDigest: string;
      };
      page: { limit: number; returned: number; total: number; nextCursor: string | null };
      redaction: {
        rawHistoryIncluded: boolean;
        rawCompareInputsIncluded: boolean;
        tokensIncluded: boolean;
        artifactUrlsIncluded: boolean;
      };
      items: Array<{
        compareId: string;
        decision: string;
        eventCount: number;
        rawHistory: { included: false; preserved: true; digest: string; itemCount: number };
        redacted: boolean;
      }>;
    }>();
    const secondPage = secondPageResponse.json<{
      page: { cursor: string | null; offset: number; returned: number; nextCursor: string | null };
      items: unknown[];
    }>();

    expect(audit).toEqual(
      expect.objectContaining({
        kind: "test-case-history-compare-permission-audit",
        projectId: project.id,
        testCaseId: "case-permission-audit-ready",
        actor: { type: "actor", actorId: "permission-reader", scoped: true },
        access: {
          scope: "test-cases:read",
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        availability: expect.objectContaining({
          status: "ready",
          partial: false,
          unavailable: []
        })
      })
    );
    expect(audit.query).toEqual(
      expect.objectContaining({
        comparePairScoped: false,
        pagination: { limit: 2, cursor: null, offset: 0 },
        redacted: true
      })
    );
    expect(audit.audit).toEqual(
      expect.objectContaining({
        mutationBoundary: "read-only-no-rest-mutation",
        replayedEventCount: 3,
        recordCount: 3,
        byDecision: { denied: 0, partial: 0, ready: 3 },
        rawHistory: expect.objectContaining({
          included: false,
          preserved: true,
          itemCount: 6
        }),
        projectionDigest: expect.any(String)
      })
    );
    expect(audit.page).toEqual(
      expect.objectContaining({ limit: 2, returned: 2, total: 3, nextCursor: "2" })
    );
    expect(audit.redaction).toEqual(
      expect.objectContaining({
        rawHistoryIncluded: false,
        rawCompareInputsIncluded: false,
        tokensIncluded: false,
        artifactUrlsIncluded: false
      })
    );
    expect(audit.items).toHaveLength(2);
    expect(audit.items[0]).toEqual(
      expect.objectContaining({
        decision: "ready",
        eventCount: 1,
        rawHistory: expect.objectContaining({
          included: false,
          preserved: true,
          digest: expect.any(String),
          itemCount: 2
        }),
        redacted: true
      })
    );
    expect(audit.items[0]?.compareId).toMatch(/^history-compare-permission:/);
    expect(JSON.stringify(audit)).not.toContain("permission-ready-0");
    expect(JSON.stringify(audit)).not.toContain("ready-build-0");
    expect(bearerResponse.body).not.toContain(apiToken.secret);
    expect(secondPage.page).toEqual(
      expect.objectContaining({ cursor: "2", offset: 2, returned: 1, nextCursor: null })
    );
    expect(secondPage.items).toHaveLength(1);
  });

  it("returns partial permission audit reads without exposing raw compare inputs", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    const baseLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Permission audit partial base" }
    });
    const targetLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Permission audit partial target" }
    });
    const baseLaunch = baseLaunchResponse.json<LaunchResponse>();
    const targetLaunch = targetLaunchResponse.json<LaunchResponse>();

    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${baseLaunch.id}/results/json`,
      payload: {
        files: [
          {
            path: "permission-partial-base-result.json",
            content: JSON.stringify({
              uuid: "permission-partial-base",
              testCaseId: "case-permission-audit-partial",
              historyId: "history-permission-audit-partial",
              name: "permission audit partial",
              status: "failed",
              statusDetails: {
                message:
                  "Bearer permission-partial-token failed at C:\\Users\\tester\\Downloads\\permission-audit.json signedUrl=https://storage.example/private?X-Amz-Signature=raw"
              },
              parameters: [{ name: "token", value: "permission-partial-token", mode: "masked" }]
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
            path: "permission-partial-target-result.json",
            content: JSON.stringify({
              uuid: "permission-partial-target",
              testCaseId: "case-permission-audit-partial",
              historyId: "history-permission-audit-partial",
              name: "permission audit partial",
              status: "passed",
              parameters: [{ name: "token", value: "permission-partial-token", mode: "masked" }]
            })
          }
        ]
      }
    });

    const response = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-permission-audit-partial/history/compare/permission-audit?projectId=${project.id}` +
        "&baseResultUuid=permission-partial-base&targetResultUuid=permission-partial-target",
      headers: {
        "x-testhistory-scopes": "test-cases:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "partial-reader"
      }
    });
    const compareResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-permission-audit-partial/history/compare?projectId=${project.id}` +
        "&baseResultUuid=permission-partial-base&targetResultUuid=permission-partial-target",
      headers: {
        "x-testhistory-scopes": "test-cases:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "partial-reader"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(compareResponse.statusCode).toBe(200);
    const audit = response.json<{
      availability: { status: string; partial: boolean; unavailable: string[] };
      query: { comparePairScoped: boolean };
      audit: {
        byDecision: { denied: number; partial: number; ready: number };
        rawHistory: { included: false; preserved: true; itemCount: number };
      };
      page: { total: number; returned: number };
      items: Array<{
        decision: string;
        reasons: Array<{ code: string; severity: string; explanation: string; fields: string[] }>;
        unavailable: string[];
        rawHistory: { included: false; preserved: true; digest: string; itemCount: number };
      }>;
    }>();
    const compare = compareResponse.json<Record<string, unknown>>();

    expect(audit.availability).toEqual(
      expect.objectContaining({
        status: "partial",
        partial: true,
        unavailable: expect.arrayContaining(["executor.name", "launch.branch"])
      })
    );
    expect(audit.query.comparePairScoped).toBe(true);
    expect(audit.audit).toEqual(
      expect.objectContaining({
        byDecision: { denied: 0, partial: 1, ready: 0 },
        rawHistory: expect.objectContaining({ included: false, preserved: true, itemCount: 2 })
      })
    );
    expect(audit.page).toEqual(expect.objectContaining({ total: 1, returned: 1 }));
    expect(audit.items).toEqual([
      expect.objectContaining({
        decision: "partial",
        reasons: [
          expect.objectContaining({
            code: "history_compare_permission.field_hidden",
            severity: "warn",
            fields: expect.arrayContaining(["executor.name", "launch.branch"])
          })
        ],
        rawHistory: expect.objectContaining({
          included: false,
          preserved: true,
          digest: expect.any(String),
          itemCount: 2
        })
      })
    ]);
    expect(compare).not.toHaveProperty("permissionAudit");
    expect(compare).not.toHaveProperty("audit");
    expectSafeArtifactMetadata(audit, [
      "permission-partial-token",
      "permission-audit.json",
      "X-Amz-Signature",
      "storage.example",
      "permission-partial-base-result.json",
      "permission-partial-target-result.json"
    ]);
    expect(response.body).not.toContain("permission-partial-token");
  });
});
