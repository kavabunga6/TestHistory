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

describe("api app part-18", () => {
  it("guards persisted history compare permission audit invariant denied and empty read states", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const otherProject = await createProject(app);
    const deniedWindowsSourceRoot = buildSyntheticWindowsDownloadRoot();
    const deniedPosixHistoryPath = buildSyntheticPosixArtifactPath("raw-history.json");
    for (let index = 0; index < 3; index += 1) {
      const launchResponse = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${project.id}/launches`,
        payload: {
          name: `Persisted permission audit guard ${index}`,
          branch: "guard",
          buildNumber: `320${index}`,
          commitSha: `guard${index}`
        }
      });
      const launch = launchResponse.json<LaunchResponse>();
      await app.inject({
        method: "POST",
        url: `/api/v1/launches/${launch.id}/results/json`,
        payload: {
          files: [
            {
              path: `${deniedWindowsSourceRoot}\\permission-persisted-denied-${index}-result.json`,
              content: JSON.stringify({
                uuid: `permission-persisted-denied-invariant-${index}`,
                testCaseId: "case-permission-audit-persisted-denied",
                historyId: "history-permission-audit-persisted-denied",
                name: "permission audit persisted denied guard",
                status: index === 0 ? "failed" : "passed",
                statusDetails: {
                  message: `raw-compare-base-payload raw-compare-target-payload raw-history-payload Bearer persisted-denied-token storageKey=persisted-denied-storage signedUrl=https://storage.example/private?X-Amz-Signature=denied ${deniedPosixHistoryPath}`
                },
                parameters: [
                  { name: "guard-token", value: "persisted-denied-token", mode: "hidden" }
                ],
                start: index,
                stop: index + 10
              })
            },
            {
              path: `permission-persisted-cross-scope-${index}-result.json`,
              content: JSON.stringify({
                uuid: `permission-persisted-cross-scope-${index}`,
                testCaseId: "case-permission-audit-cross-scope",
                historyId: "history-permission-audit-cross-scope",
                name: "permission audit persisted cross scope",
                status: "passed",
                statusDetails: {
                  message:
                    "cross-scope-raw-history Bearer cross-scope-token signedUrl=https://storage.example/cross?X-Amz-Signature=cross"
                }
              })
            },
            ...(index === 0
              ? [
                  {
                    path: "permission-persisted-empty-result.json",
                    content: JSON.stringify({
                      uuid: "permission-persisted-empty-0",
                      testCaseId: "case-permission-audit-persisted-empty",
                      historyId: "history-permission-audit-persisted-empty",
                      name: "permission audit persisted empty",
                      status: "passed",
                      statusDetails: {
                        message:
                          "empty-state-raw-history Bearer empty-state-token signedUrl=https://storage.example/empty?X-Amz-Signature=empty"
                      }
                    })
                  }
                ]
              : [])
          ]
        }
      });
    }

    const snapshotStore = () => ({
      projects: store.projects.size,
      launches: store.launches.size,
      uploadJobs: store.uploadJobs.size,
      uploadSessions: store.uploadSessions.size,
      artifacts: store.artifacts.size,
      testCases: store.testCases.size,
      cleanupRules: store.cleanupRules.size
    });
    const beforeReadsAndRejectedMutations = snapshotStore();
    const url =
      `/api/v1/test-cases/case-permission-audit-persisted-denied/history/compare/permission-audit/replay/invariants/persisted?projectId=${project.id}` +
      "&limit=1";
    const headers = {
      "x-testhistory-scopes": "test-cases:read",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-actor-id": "permission-persisted-denied-reader"
    };

    const firstResponse = await app.inject({ method: "GET", url, headers });
    const secondResponse = await app.inject({
      method: "GET",
      url: `${url}&cursor=1`,
      headers
    });
    const exhaustedPageResponse = await app.inject({
      method: "GET",
      url: `${url}&cursor=2`,
      headers
    });
    const emptyResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-permission-audit-persisted-empty/history/compare/permission-audit/replay/invariants/persisted?projectId=${project.id}` +
        "&limit=5",
      headers
    });
    const wrongActorResponse = await app.inject({
      method: "GET",
      url,
      headers: {
        ...headers,
        "x-testhistory-actor-id": "permission-persisted-wrong-actor"
      }
    });
    const missingScopeResponse = await app.inject({
      method: "GET",
      url,
      headers: {
        authorization: "Bearer persisted-denied-token",
        "x-testhistory-scopes": "launches:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "permission-persisted-denied-reader"
      }
    });
    const wrongProjectScopeResponse = await app.inject({
      method: "GET",
      url,
      headers: {
        authorization: "Bearer persisted-denied-token",
        "x-testhistory-scopes": "test-cases:read",
        "x-testhistory-project-scope": otherProject.id,
        "x-testhistory-actor-id": "permission-persisted-wrong-project-reader"
      }
    });
    const wrongProjectTestCaseResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-permission-audit-persisted-denied/history/compare/permission-audit/replay/invariants/persisted?projectId=${otherProject.id}` +
        "&limit=1",
      headers: {
        ...headers,
        "x-testhistory-project-scope": otherProject.id
      }
    });
    const wrongTestCaseResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-permission-audit-missing/history/compare/permission-audit/replay/invariants/persisted?projectId=${project.id}` +
        "&limit=1",
      headers
    });
    const mutationResponses = [];
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      mutationResponses.push(
        await app.inject({
          method,
          url,
          headers,
          payload: {
            rawCompareInputs: "raw-compare-base-payload raw-compare-target-payload",
            rawHistory: "raw-history-payload",
            token: "persisted-denied-token",
            signedUrl: "https://storage.example/private?X-Amz-Signature=mutation"
          }
        })
      );
    }

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(exhaustedPageResponse.statusCode).toBe(200);
    expect(emptyResponse.statusCode).toBe(200);
    expect(wrongActorResponse.statusCode).toBe(200);
    expect(missingScopeResponse.statusCode).toBe(403);
    expect(wrongProjectScopeResponse.statusCode).toBe(403);
    expect(wrongProjectTestCaseResponse.statusCode).toBe(404);
    expect(wrongTestCaseResponse.statusCode).toBe(404);
    for (const mutationResponse of mutationResponses) {
      expect(mutationResponse.statusCode).toBeGreaterThanOrEqual(400);
    }

    const first = firstResponse.json<{
      projectId: string;
      testCaseId: string;
      actor: { actorId: string; scoped: boolean };
      access: { mutation: boolean; actorScoped: boolean; redacted: boolean };
      availability: { status: string; partial: boolean };
      query: {
        projectId: string;
        actorId: string;
        testCaseId: string;
        pagination: { limit: number; cursor: string | null; offset: number };
      };
      persistence: {
        readOnly: boolean;
        rawHistoryIncluded: boolean;
        rawCompareInputsIncluded: boolean;
        hiddenOrMaskedValuesIncluded: boolean;
        localPathsIncluded: boolean;
        storageRefsIncluded: boolean;
        signedUrlsIncluded: boolean;
        tokensIncluded: boolean;
        persistedRecordCount: number;
      };
      summary: {
        persistedRecordCount: number;
        actorScoped: boolean;
        rawCompareInputsIncluded: boolean;
        rawHistoryIncluded: boolean;
        hiddenOrMaskedValuesIncluded: boolean;
      };
      execution: {
        compareStarted: boolean;
        replayStarted: boolean;
        workerJobEnqueued: boolean;
        persistenceWriteStarted: boolean;
        mutation: boolean;
      };
      page: {
        limit: number;
        cursor: string | null;
        offset: number;
        returned: number;
        total: number;
        nextCursor: string | null;
      };
      items: Array<{
        projectId: string;
        testCaseId: string;
        actor: { actorId: string; scoped: boolean };
        ordinal: number;
        rawCompareInputs: { included: boolean };
        redaction: {
          rawHistoryIncluded: boolean;
          rawCompareInputsIncluded: boolean;
          hiddenOrMaskedValuesIncluded: boolean;
          tokensIncluded: boolean;
          pathsIncluded: boolean;
          storageLocationsIncluded: boolean;
          artifactUrlsIncluded: boolean;
        };
        persistence: { readOnly: boolean };
        execution: {
          compareStarted: boolean;
          replayStarted: boolean;
          workerJobEnqueued: boolean;
          mutation: boolean;
        };
      }>;
    }>();
    const second = secondResponse.json<{
      query: { pagination: { cursor: string | null; offset: number } };
      page: { returned: number; nextCursor: string | null };
      items: Array<{ ordinal: number }>;
    }>();
    const exhaustedPage = exhaustedPageResponse.json<{
      page: { returned: number; total: number; nextCursor: string | null };
      items: unknown[];
    }>();
    const empty = emptyResponse.json<{
      availability: { status: string; partial: boolean; unavailable: string[] };
      persistence: { persistedRecordCount: number; persistedAt: string };
      summary: { persistedRecordCount: number };
      page: { returned: number; total: number; nextCursor: string | null };
      items: unknown[];
    }>();
    const wrongActor = wrongActorResponse.json<{
      actor: { actorId: string; scoped: boolean };
      query: { actorId: string };
      items: Array<{ actor: { actorId: string; scoped: boolean } }>;
    }>();

    expect(first).toEqual(
      expect.objectContaining({
        projectId: project.id,
        testCaseId: "case-permission-audit-persisted-denied",
        actor: expect.objectContaining({
          actorId: "permission-persisted-denied-reader",
          scoped: true
        }),
        access: expect.objectContaining({
          mutation: false,
          actorScoped: true,
          redacted: true
        }),
        availability: expect.objectContaining({ status: "ready", partial: false }),
        execution: {
          compareStarted: false,
          replayStarted: false,
          workerJobEnqueued: false,
          persistenceWriteStarted: false,
          mutation: false
        }
      })
    );
    expect(first.query).toEqual(
      expect.objectContaining({
        projectId: project.id,
        actorId: "permission-persisted-denied-reader",
        testCaseId: "case-permission-audit-persisted-denied",
        pagination: { limit: 1, cursor: null, offset: 0 }
      })
    );
    expect(first.persistence).toEqual(
      expect.objectContaining({
        readOnly: true,
        rawHistoryIncluded: false,
        rawCompareInputsIncluded: false,
        hiddenOrMaskedValuesIncluded: false,
        localPathsIncluded: false,
        storageRefsIncluded: false,
        signedUrlsIncluded: false,
        tokensIncluded: false,
        persistedRecordCount: 2
      })
    );
    expect(first.summary).toEqual(
      expect.objectContaining({
        persistedRecordCount: 2,
        actorScoped: true,
        rawCompareInputsIncluded: false,
        rawHistoryIncluded: false,
        hiddenOrMaskedValuesIncluded: false
      })
    );
    expect(first.page).toEqual(
      expect.objectContaining({
        limit: 1,
        cursor: null,
        offset: 0,
        returned: 1,
        total: 2,
        nextCursor: "1"
      })
    );
    expect(first.items).toEqual([
      expect.objectContaining({
        projectId: project.id,
        testCaseId: "case-permission-audit-persisted-denied",
        actor: expect.objectContaining({
          actorId: "permission-persisted-denied-reader",
          scoped: true
        }),
        ordinal: 0,
        rawCompareInputs: expect.objectContaining({ included: false }),
        redaction: expect.objectContaining({
          rawHistoryIncluded: false,
          rawCompareInputsIncluded: false,
          hiddenOrMaskedValuesIncluded: false,
          tokensIncluded: false,
          pathsIncluded: false,
          storageLocationsIncluded: false,
          artifactUrlsIncluded: false
        }),
        persistence: expect.objectContaining({ readOnly: true }),
        execution: {
          compareStarted: false,
          replayStarted: false,
          workerJobEnqueued: false,
          mutation: false
        }
      })
    ]);
    expect(second.query.pagination).toEqual(expect.objectContaining({ cursor: "1", offset: 1 }));
    expect(second.page).toEqual(expect.objectContaining({ returned: 1, nextCursor: null }));
    expect(second.items[0]?.ordinal).toBe(1);
    expect(exhaustedPage.page).toEqual(
      expect.objectContaining({ returned: 0, total: 2, nextCursor: null })
    );
    expect(exhaustedPage.items).toEqual([]);
    expect(empty.availability).toEqual(
      expect.objectContaining({ status: "empty", partial: false, unavailable: [] })
    );
    expect(empty.persistence).toEqual(
      expect.objectContaining({
        persistedRecordCount: 0,
        persistedAt: "1970-01-01T00:00:00.000Z"
      })
    );
    expect(empty.summary).toEqual(expect.objectContaining({ persistedRecordCount: 0 }));
    expect(empty.page).toEqual(
      expect.objectContaining({ returned: 0, total: 0, nextCursor: null })
    );
    expect(empty.items).toEqual([]);
    expect(wrongActor.actor).toEqual(
      expect.objectContaining({
        actorId: "permission-persisted-wrong-actor",
        scoped: true
      })
    );
    expect(wrongActor.query.actorId).toBe("permission-persisted-wrong-actor");
    expect(wrongActor.items[0]?.actor).toEqual(
      expect.objectContaining({
        actorId: "permission-persisted-wrong-actor",
        scoped: true
      })
    );
    expect(missingScopeResponse.json()).toEqual(
      expect.objectContaining({
        kind: "test-case-history-compare-permission-audit-replay-invariant-persisted-read",
        error: "PermissionDeniedError",
        projectId: project.id,
        actor: expect.objectContaining({
          type: "actor",
          actorId: "permission-persisted-denied-reader",
          scoped: true
        }),
        access: expect.objectContaining({ mutation: false, redacted: true }),
        availability: expect.objectContaining({
          status: "denied",
          reason: "invalid_token",
          unavailable: ["history-compare-permission-audit-replay-invariant-persisted-read"],
          redacted: true
        }),
        message: "API token is invalid",
        redacted: true
      })
    );
    expect(wrongProjectScopeResponse.json()).toEqual(
      expect.objectContaining({
        kind: "test-case-history-compare-permission-audit-replay-invariant-persisted-read",
        error: "PermissionDeniedError",
        projectId: project.id,
        actor: expect.objectContaining({
          type: "actor",
          actorId: "permission-persisted-wrong-project-reader",
          scoped: true
        }),
        availability: expect.objectContaining({
          status: "denied",
          reason: "invalid_token",
          unavailable: ["history-compare-permission-audit-replay-invariant-persisted-read"],
          redacted: true
        })
      })
    );
    expect(wrongProjectTestCaseResponse.json()).toEqual({ message: "Test case not found" });
    expect(wrongTestCaseResponse.json()).toEqual({ message: "Test case not found" });
    expectPersistedInvariantNoLeakage([
      first,
      second,
      exhaustedPage,
      empty,
      wrongActor,
      missingScopeResponse.json(),
      wrongProjectScopeResponse.json(),
      wrongProjectTestCaseResponse.json(),
      wrongTestCaseResponse.json(),
      ...mutationResponses.map((response) => response.json())
    ]);
    expect(JSON.stringify(wrongActor)).not.toContain("permission-persisted-denied-reader");
    expect(snapshotStore()).toEqual(beforeReadsAndRejectedMutations);
  });

  it("denies history compare permission audit reads and advertises the OpenAPI contract", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    const missingScopeResponse = await app.inject({
      method: "GET",
      url: `/api/v1/test-cases/case-permission-audit-denied/history/compare/permission-audit?projectId=${project.id}`,
      headers: {
        authorization: "Bearer permission-audit-denied-token",
        "x-testhistory-scopes": "launches:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "denied-permission-reader"
      }
    });
    const wrongProjectResponse = await app.inject({
      method: "GET",
      url: `/api/v1/test-cases/case-permission-audit-denied/history/compare/permission-audit?projectId=${project.id}`,
      headers: {
        authorization: "Bearer permission-audit-denied-token",
        "x-testhistory-scopes": "test-cases:read",
        "x-testhistory-project-scope": "other-project",
        "x-testhistory-actor-id": "wrong-project-permission-reader"
      }
    });
    const invariantMissingScopeResponse = await app.inject({
      method: "GET",
      url: `/api/v1/test-cases/case-permission-audit-denied/history/compare/permission-audit/replay/invariants?projectId=${project.id}`,
      headers: {
        authorization: "Bearer permission-audit-denied-token",
        "x-testhistory-scopes": "launches:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "denied-permission-reader"
      }
    });
    const persistedInvariantMissingScopeResponse = await app.inject({
      method: "GET",
      url: `/api/v1/test-cases/case-permission-audit-denied/history/compare/permission-audit/replay/invariants/persisted?projectId=${project.id}`,
      headers: {
        authorization: "Bearer permission-audit-denied-token",
        "x-testhistory-scopes": "launches:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "denied-permission-reader"
      }
    });
    const staticOpenApi = readFileSync(
      new URL("../../../docs/openapi/openapi.yaml", import.meta.url),
      "utf8"
    );

    expect(missingScopeResponse.statusCode).toBe(403);
    expect(wrongProjectResponse.statusCode).toBe(403);
    expect(invariantMissingScopeResponse.statusCode).toBe(403);
    expect(persistedInvariantMissingScopeResponse.statusCode).toBe(403);
    expect(missingScopeResponse.json()).toEqual(
      expect.objectContaining({
        kind: "test-case-history-compare-permission-audit",
        error: "PermissionDeniedError",
        message: "API token is invalid",
        requiredScopes: ["test-cases:read"],
        projectId: project.id,
        actor: { type: "actor", actorId: "denied-permission-reader", scoped: true },
        availability: expect.objectContaining({
          status: "denied",
          reason: "invalid_token",
          redacted: true
        }),
        redacted: true
      })
    );
    expect(wrongProjectResponse.json()).toEqual(
      expect.objectContaining({
        kind: "test-case-history-compare-permission-audit",
        message: "API token is invalid",
        actor: { type: "actor", actorId: "wrong-project-permission-reader", scoped: true },
        availability: expect.objectContaining({
          status: "denied",
          reason: "invalid_token",
          redacted: true
        })
      })
    );
    expect(invariantMissingScopeResponse.json()).toEqual(
      expect.objectContaining({
        kind: "test-case-history-compare-permission-audit-replay-invariants",
        message: "API token is invalid",
        requiredScopes: ["test-cases:read"],
        projectId: project.id,
        actor: { type: "actor", actorId: "denied-permission-reader", scoped: true },
        access: expect.objectContaining({
          mutation: false,
          redacted: true
        }),
        availability: expect.objectContaining({
          status: "denied",
          reason: "invalid_token",
          unavailable: ["history-compare-permission-audit-replay-invariants"],
          redacted: true
        }),
        redacted: true
      })
    );
    expect(persistedInvariantMissingScopeResponse.json()).toEqual(
      expect.objectContaining({
        kind: "test-case-history-compare-permission-audit-replay-invariant-persisted-read",
        message: "API token is invalid",
        requiredScopes: ["test-cases:read"],
        projectId: project.id,
        actor: { type: "actor", actorId: "denied-permission-reader", scoped: true },
        access: expect.objectContaining({
          mutation: false,
          redacted: true
        }),
        availability: expect.objectContaining({
          status: "denied",
          reason: "invalid_token",
          unavailable: ["history-compare-permission-audit-replay-invariant-persisted-read"],
          redacted: true
        }),
        redacted: true
      })
    );
    expect(missingScopeResponse.body).not.toContain("permission-audit-denied-token");
    expect(wrongProjectResponse.body).not.toContain("permission-audit-denied-token");
    expect(invariantMissingScopeResponse.body).not.toContain("permission-audit-denied-token");
    expect(persistedInvariantMissingScopeResponse.body).not.toContain(
      "permission-audit-denied-token"
    );
    expect(staticOpenApi).toContain(
      "/api/v1/test-cases/{testCaseId}/history/compare/permission-audit:"
    );
    expect(staticOpenApi).toContain(
      "/api/v1/test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants:"
    );
    expect(staticOpenApi).toContain(
      "/api/v1/test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants/persisted:"
    );
    expect(staticOpenApi).toContain("operationId: readTestCaseHistoryComparePermissionAudit");
    expect(staticOpenApi).toContain(
      "operationId: readTestCaseHistoryComparePermissionAuditReplayInvariants"
    );
    expect(staticOpenApi).toContain(
      "operationId: readTestCaseHistoryComparePermissionAuditReplayInvariantPersisted"
    );
    expect(staticOpenApi).toContain("TestCaseHistoryComparePermissionAuditPage");
    expect(staticOpenApi).toContain("TestCaseHistoryComparePermissionAuditReplayInvariantPage");
    expect(staticOpenApi).toContain(
      "TestCaseHistoryComparePermissionAuditReplayInvariantPersistedRead"
    );
    expect(staticOpenApi).toContain("rawCompareInputsIncluded");
  });

  it("limits unpaginated large test case history by default", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);

    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: Array.from({ length: 105 }, (_, index) => ({
          path: `history-large-${index}-result.json`,
          content: JSON.stringify({
            uuid: `history-large-${index}`,
            testCaseId: "case-history-large",
            name: "large history",
            status: index % 2 === 0 ? "passed" : "failed",
            start: index,
            stop: index + 1
          })
        }))
      }
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/test-cases/case-history-large/history?projectId=${launch.projectId}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        totalPoints: 105,
        returnedPoints: 100,
        omittedPoints: 5,
        page: expect.objectContaining({
          limit: 100,
          returned: 100,
          nextCursor: "100",
          hasMore: true
        })
      })
    );
  });

  it("returns stable errors for unknown history project and test case", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);

    const unknownProjectResponse = await app.inject({
      method: "GET",
      url: "/api/v1/test-cases/anything/history?projectId=missing-project"
    });
    const unknownCaseResponse = await app.inject({
      method: "GET",
      url: `/api/v1/test-cases/missing-case/history?projectId=${launch.projectId}`
    });

    expect(unknownProjectResponse.statusCode).toBe(404);
    expect(unknownProjectResponse.json()).toEqual({ message: "Project not found" });
    expect(unknownCaseResponse.statusCode).toBe(404);
    expect(unknownCaseResponse.json()).toEqual({ message: "Test case not found" });
  });
});
