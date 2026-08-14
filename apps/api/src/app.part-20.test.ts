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

describe("api app part-20", () => {
  it("paginates defect mute projection records while keeping replay totals project scoped", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    const launchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Projection pagination source" }
    });
    const launch = launchResponse.json<LaunchResponse>();

    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "projection-page-a-result.json",
            content: JSON.stringify({
              uuid: "projection-page-a",
              testCaseId: "case-projection-page-a",
              name: "projection page a",
              status: "failed",
              statusDetails: { message: "projection page unique failure a" }
            })
          },
          {
            path: "projection-page-b-result.json",
            content: JSON.stringify({
              uuid: "projection-page-b",
              testCaseId: "case-projection-page-b",
              name: "projection page b",
              status: "broken",
              statusDetails: { message: "projection page unique failure b" }
            })
          },
          {
            path: "projection-page-c-result.json",
            content: JSON.stringify({
              uuid: "projection-page-c",
              testCaseId: "case-projection-page-c",
              name: "projection page c",
              status: "failed",
              statusDetails: { message: "projection page unique failure c" }
            })
          }
        ]
      }
    });

    const firstPageResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/defect-mutes/projection?limit=2`,
      headers: {
        "x-testhistory-scopes": "defects:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "qa-api-agent"
      }
    });
    const secondPageResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/defect-mutes/projection?limit=2&cursor=2&status=active`,
      headers: {
        "x-testhistory-scopes": "defects:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "qa-api-agent"
      }
    });

    expect(firstPageResponse.statusCode).toBe(200);
    expect(secondPageResponse.statusCode).toBe(200);
    expect(firstPageResponse.json()).toEqual(
      expect.objectContaining({
        actor: { type: "actor", actorId: "qa-api-agent", scoped: true },
        query: {
          projectId: project.id,
          actorId: "qa-api-agent",
          limit: 2,
          cursor: null
        },
        projection: expect.objectContaining({
          eventCount: 3,
          activeMuteCount: 3,
          rawFailureOccurrenceCount: 3
        }),
        page: {
          limit: 2,
          cursor: null,
          offset: 0,
          returned: 2,
          total: 3,
          nextCursor: "2",
          hasMore: true
        },
        rawFailureHistory: expect.objectContaining({
          totalOccurrences: 3,
          statusCounters: { failed: 2, broken: 1 }
        })
      })
    );
    expect(
      firstPageResponse.json<{ items: Array<{ rawFailureHistory: unknown }> }>().items
    ).toHaveLength(2);
    expect(
      firstPageResponse.json<{ items: Array<{ rawFailureHistory: unknown }> }>().items[0]
    ).toEqual(
      expect.objectContaining({
        rawFailureHistory: expect.objectContaining({
          totalOccurrences: 1,
          statusCounters: expect.any(Object),
          byTestId: expect.any(Object),
          bySignatureHash: expect.any(Object)
        })
      })
    );
    expect(secondPageResponse.json()).toEqual(
      expect.objectContaining({
        query: {
          projectId: project.id,
          actorId: "qa-api-agent",
          status: "active",
          limit: 2,
          cursor: "2"
        },
        projection: expect.objectContaining({ eventCount: 3, activeMuteCount: 3 }),
        page: {
          limit: 2,
          cursor: "2",
          offset: 2,
          returned: 1,
          total: 3,
          nextCursor: null,
          hasMore: false
        }
      })
    );
  });

  it("permission-checks defect mute projection reads without leaking credentials", async () => {
    app = await createApiApp();
    const project = await createProject(app);

    const missingScopeResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/defect-mutes/projection?actorId=denied-projection-reader`,
      headers: {
        "x-testhistory-project-scope": project.id,
        authorization: "Bearer defect-projection-secret"
      }
    });
    const wrongProjectResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/defect-mutes/projection`,
      headers: {
        "x-testhistory-scopes": "defects:read",
        "x-testhistory-project-scope": "other-project",
        authorization: "Bearer defect-projection-secret"
      }
    });

    expect(missingScopeResponse.statusCode).toBe(403);
    expect(wrongProjectResponse.statusCode).toBe(403);
    expect(missingScopeResponse.json()).toEqual(
      expect.objectContaining({
        kind: "defect-mute-projection",
        error: "PermissionDeniedError",
        message: "API token is invalid",
        requiredScopes: ["defects:read"],
        projectId: project.id,
        actor: { type: "actor", actorId: "denied-projection-reader", scoped: true },
        access: {
          scope: "defects:read",
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
        redacted: true
      })
    );
    expect(wrongProjectResponse.json()).toEqual(
      expect.objectContaining({
        kind: "defect-mute-projection",
        error: "PermissionDeniedError",
        requiredScopes: ["defects:read"],
        projectId: project.id,
        availability: expect.objectContaining({
          status: "denied",
          reason: "invalid_token",
          partial: false
        }),
        message: "API token is invalid",
        redacted: true
      })
    );
    expect(JSON.stringify(missingScopeResponse.json())).not.toContain("defect-projection-secret");
    expect(JSON.stringify(wrongProjectResponse.json())).not.toContain("defect-projection-secret");
  });

  it("returns paginated read-only defect mute replay invariant evidence without raw payload leakage", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const launchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Projection invariant source" }
    });
    const launch = launchResponse.json<LaunchResponse>();

    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "projection-invariant-a-result.json",
            content: JSON.stringify({
              uuid: "projection-invariant-a",
              testCaseId: "case-projection-invariant-a",
              name: "projection invariant a",
              status: "failed",
              statusDetails: {
                message:
                  "Authorization: Bearer invariant-token token=invariant-query-token C:\\Users\\tester\\Downloads\\invariant.txt storageKey=invariant-storage signedUrl=https://object.test/file?X-Amz-Signature=invariant"
              }
            })
          },
          {
            path: "projection-invariant-b-result.json",
            content: JSON.stringify({
              uuid: "projection-invariant-b",
              testCaseId: "case-projection-invariant-b",
              name: "projection invariant b",
              status: "broken",
              statusDetails: {
                message:
                  "storage://raw-invariant minio://raw-invariant blob://raw-invariant token=raw-invariant-token"
              }
            })
          }
        ]
      }
    });

    const beforeStoreState = {
      launches: store.launches.size,
      uploadJobs: store.uploadJobs.size,
      artifacts: store.artifacts.size,
      launchResultCount: (store.launches.get(launch.id) as Launch | undefined)?.results.length
    };
    const firstPageResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/defect-mutes/projection/replay/invariants?limit=1`,
      headers: {
        "x-testhistory-scopes": "defects:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "qa-api-agent"
      }
    });
    const secondPageResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/defect-mutes/projection/replay/invariants?limit=1&cursor=1`,
      headers: {
        "x-testhistory-scopes": "defects:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "qa-api-agent"
      }
    });

    expect(firstPageResponse.statusCode).toBe(200);
    expect(secondPageResponse.statusCode).toBe(200);
    const invariant = firstPageResponse.json<{
      kind: string;
      projectId: string;
      actor: { type: "actor"; actorId: string; scoped: boolean };
      access: {
        mutation: boolean;
        redacted: boolean;
        projectScoped: boolean;
        actorScoped: boolean;
      };
      query: { projectId: string; actorId: string; limit: number; cursor: null | string };
      invariant: {
        boundary: string;
        source: string;
        consistency: string;
        mutationBoundary: string;
        deterministic: boolean;
        recomputable: boolean;
        projectScoped: boolean;
        projectionDigest: string;
        recomputedDigest: string;
      };
      rawEffectiveSeparation: {
        effectiveStateExcludesRawFailureHistory: boolean;
        rawFailureHistoryPreserved: boolean;
        rawFailureHistoryNotMutatedByUnmute: boolean;
        rawFailureOccurrenceCount: number;
        effectiveRecordCount: number;
        documentation: string;
      };
      appendOnly: {
        uniqueProjectedEventIds: boolean;
        duplicateEventIds: string[];
        totalProjectedEventIds: number;
      };
      redaction: { passed: boolean; leakedMarkers: string[]; policy: string };
      page: {
        limit: number;
        cursor: null | string;
        offset: number;
        returned: number;
        total: number;
        nextCursor: null | string;
        hasMore: boolean;
      };
      items: Array<{ ordinal: number; eventId: string }>;
    }>();
    expect(invariant).toEqual(
      expect.objectContaining({
        kind: "defect-mute-replay-invariant",
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
          limit: 1,
          cursor: null
        },
        invariant: expect.objectContaining({
          boundary: "read-only-defect-mute-replay-invariant",
          source: "worker-local-mute-projection",
          consistency: "append-only-replay",
          mutationBoundary: "rest-read-only-no-replay-mutation",
          deterministic: true,
          recomputable: true,
          projectScoped: true,
          projectionDigest: expect.any(String),
          recomputedDigest: expect.any(String)
        }),
        rawEffectiveSeparation: expect.objectContaining({
          effectiveStateExcludesRawFailureHistory: true,
          rawFailureHistoryPreserved: true,
          rawFailureHistoryNotMutatedByUnmute: true,
          rawFailureOccurrenceCount: 2,
          effectiveRecordCount: 2
        }),
        appendOnly: {
          uniqueProjectedEventIds: true,
          duplicateEventIds: [],
          totalProjectedEventIds: 2
        },
        redaction: expect.objectContaining({
          passed: true,
          leakedMarkers: []
        }),
        page: {
          limit: 1,
          cursor: null,
          offset: 0,
          returned: 1,
          total: 2,
          nextCursor: "1",
          hasMore: true
        }
      })
    );
    expect(invariant.rawEffectiveSeparation.documentation).toContain(
      "Raw failure history is preserved only as bounded counters"
    );
    expect(invariant.items).toHaveLength(1);
    expect(invariant.items[0]).toEqual(
      expect.objectContaining({
        ordinal: 0,
        eventId: expect.stringContaining("defect-mute-event:")
      })
    );
    expect(secondPageResponse.json()).toEqual(
      expect.objectContaining({
        query: {
          projectId: project.id,
          actorId: "qa-api-agent",
          limit: 1,
          cursor: "1"
        },
        page: {
          limit: 1,
          cursor: "1",
          offset: 1,
          returned: 1,
          total: 2,
          nextCursor: null,
          hasMore: false
        }
      })
    );
    const serialized = JSON.stringify(invariant);
    expect(serialized).not.toContain("invariant-token");
    expect(serialized).not.toContain("invariant-query-token");
    expect(serialized).not.toContain("raw-invariant-token");
    expect(serialized).not.toContain("invariant-storage");
    expect(serialized).not.toContain("signedUrl");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("Downloads");
    expect(serialized).not.toContain("storage://");
    expect(serialized).not.toContain("minio://");
    expect(serialized).not.toContain("blob://");
    expect(store.launches.size).toBe(beforeStoreState.launches);
    expect(store.uploadJobs.size).toBe(beforeStoreState.uploadJobs);
    expect(store.artifacts.size).toBe(beforeStoreState.artifacts);
    expect((store.launches.get(launch.id) as Launch | undefined)?.results.length).toBe(
      beforeStoreState.launchResultCount
    );
  });

  it("returns empty defect mute replay invariant evidence for an actor without projection events", async () => {
    app = await createApiApp();
    const project = await createProject(app);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/defect-mutes/projection/replay/invariants?actorId=other-actor`,
      headers: {
        "x-testhistory-scopes": "defects:read",
        "x-testhistory-project-scope": project.id
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        kind: "defect-mute-replay-invariant",
        actor: { type: "actor", actorId: "other-actor", scoped: true },
        invariant: expect.objectContaining({
          deterministic: true,
          recomputable: true,
          projectScoped: true
        }),
        rawEffectiveSeparation: expect.objectContaining({
          rawFailureOccurrenceCount: 0,
          effectiveRecordCount: 0
        }),
        appendOnly: expect.objectContaining({
          uniqueProjectedEventIds: true,
          duplicateEventIds: [],
          totalProjectedEventIds: 0
        }),
        page: expect.objectContaining({ total: 0, returned: 0 }),
        items: []
      })
    );
  });

  it("permission-checks defect mute replay invariant reads without leaking requested credentials", async () => {
    app = await createApiApp();
    const project = await createProject(app);

    const missingScopeResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/defect-mutes/projection/replay/invariants?actorId=denied-invariant-reader`,
      headers: {
        "x-testhistory-project-scope": project.id,
        authorization: "Bearer defect-invariant-secret"
      }
    });

    expect(missingScopeResponse.statusCode).toBe(403);
    expect(missingScopeResponse.json()).toEqual(
      expect.objectContaining({
        kind: "defect-mute-replay-invariant",
        error: "PermissionDeniedError",
        message: "API token is invalid",
        requiredScopes: ["defects:read"],
        projectId: project.id,
        actor: { type: "actor", actorId: "denied-invariant-reader", scoped: true },
        access: {
          scope: "defects:read",
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        availability: expect.objectContaining({
          status: "denied",
          reason: "invalid_token",
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          partial: false
        }),
        redacted: true
      })
    );
    expect(JSON.stringify(missingScopeResponse.json())).not.toContain("defect-invariant-secret");
  });
});
