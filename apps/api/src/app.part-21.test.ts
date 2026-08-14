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

describe("api app part-21", () => {
  it("returns materialized defect mute replay invariant summaries without raw payload leakage", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const otherProject = await createProject(app);
    const launchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Materialized defect mute invariant source" }
    });
    const otherLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${otherProject.id}/launches`,
      payload: { name: "Other materialized defect mute invariant source" }
    });
    const launch = launchResponse.json<LaunchResponse>();
    const otherLaunch = otherLaunchResponse.json<LaunchResponse>();

    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "materialized-defect-invariant-a-result.json",
            content: JSON.stringify({
              uuid: "materialized-defect-invariant-a",
              testCaseId: "case-materialized-defect-invariant-a",
              name: "materialized defect invariant a",
              status: "failed",
              statusDetails: {
                message:
                  "Authorization: Bearer materialized-defect-token token=materialized-query-token synthetic://private/materialized.txt storageKey=materialized-storage signedUrl=https://object.test/file?X-Amz-Signature=materialized"
              }
            })
          },
          {
            path: "materialized-defect-invariant-b-result.json",
            content: JSON.stringify({
              uuid: "materialized-defect-invariant-b",
              testCaseId: "case-materialized-defect-invariant-b",
              name: "materialized defect invariant b",
              status: "broken",
              statusDetails: {
                message:
                  "storage://materialized-raw minio://materialized-raw blob://materialized-raw token=raw-materialized-token"
              }
            })
          }
        ]
      }
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${otherLaunch.id}/results/json`,
      payload: {
        files: [
          {
            path: "other-materialized-defect-invariant-result.json",
            content: JSON.stringify({
              uuid: "other-materialized-defect-invariant",
              testCaseId: "case-other-materialized-defect-invariant",
              name: "other materialized defect invariant",
              status: "failed",
              statusDetails: { message: "other project payload must not leak" }
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
    const materializedPath = `/api/v1/projects/${project.id}/defect-mutes/projection/replay/invariants/materialized`;
    const materializedReadHeaders = {
      "x-testhistory-scopes": "defects:read",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-actor-id": "qa-api-agent"
    };

    const malformedPaginationCases = [
      {
        expectedMessage: "limit must be an integer between 1 and 500",
        query: "limit=0"
      },
      {
        expectedMessage: "limit must be an integer between 1 and 500",
        query: "limit=501"
      },
      {
        expectedMessage: "cursor must be a non-negative integer offset",
        query: "cursor=-1"
      },
      {
        expectedMessage: "cursor must be a non-negative integer offset",
        query:
          "cursor=token%3Draw-cursor-secret%26signedUrl%3Dhttps%3A%2F%2Fobject.test%2Ffile%3FX-Amz-Signature%3Draw-cursor-secret"
      }
    ];
    for (const { expectedMessage, query } of malformedPaginationCases) {
      const malformedResponse = await app.inject({
        method: "GET",
        url: `${materializedPath}?${query}`,
        headers: materializedReadHeaders
      });

      expect(malformedResponse.statusCode).toBe(400);
      expect(malformedResponse.json()).toEqual({
        kind: "defect-mute-replay-invariant-materialized-read",
        message: expectedMessage,
        redacted: true
      });
      expect(malformedResponse.body).not.toContain("raw-cursor-secret");
      expect(malformedResponse.body).not.toContain("token=");
      expect(malformedResponse.body).not.toContain("signedUrl");
      expect(malformedResponse.body).not.toContain("X-Amz-Signature");
      expect(malformedResponse.body).not.toContain("https://object.test");
      expect(malformedResponse.body).not.toContain("storage://");
      expect(malformedResponse.body).not.toContain("C:\\");
    }
    expect(store.launches.size).toBe(beforeStoreState.launches);
    expect(store.uploadJobs.size).toBe(beforeStoreState.uploadJobs);
    expect(store.artifacts.size).toBe(beforeStoreState.artifacts);
    expect((store.launches.get(launch.id) as Launch | undefined)?.results.length).toBe(
      beforeStoreState.launchResultCount
    );

    const response = await app.inject({
      method: "GET",
      url: `${materializedPath}?limit=1`,
      headers: materializedReadHeaders
    });

    expect(response.statusCode).toBe(200);
    const read = response.json<{
      kind: string;
      projectId: string;
      actor: { type: "actor"; actorId: string; scoped: boolean };
      access: {
        scope: string;
        projectScoped: boolean;
        actorScoped: boolean;
        mutation: boolean;
        redacted: boolean;
      };
      availability: { status: string; partial: boolean; unavailable: string[] };
      query: { projectId: string; actorId: string; limit: number; cursor: null | string };
      materialization: {
        adapterKind: string;
        boundary: string;
        consistency: string;
        source: string;
        readOnly: boolean;
        rawFailurePayloadsIncluded: boolean;
        mutationBoundary: string;
        materializedRecordCount: number;
        materializationDigest: string;
      };
      summary: {
        materializedRecordCount: number;
        deterministic: boolean;
        recomputable: boolean;
        projectScoped: boolean;
        appendOnlyUniqueProjectedEventIds: boolean;
        redactionPassed: boolean;
        rawFailureOccurrenceCount: number;
        effectiveRecordCount: number;
        materializationDigest: string;
        projectedMuteStateCompatible: boolean;
        mutationBoundary: string;
        plannedOperations: string[];
      };
      page: {
        limit: number;
        cursor: null | string;
        offset: number;
        returned: number;
        total: number;
        nextCursor: null | string;
        hasMore: boolean;
      };
      items: Array<{
        invariantRef: string;
        projectId: string;
        source: string;
        deterministic: boolean;
        recomputable: boolean;
        projectScoped: boolean;
        appendOnly: {
          uniqueProjectedEventIds: boolean;
          projectedEventCount: number;
          duplicateEventCount: number;
          duplicateEventIdHashes: string[];
        };
        redaction: {
          passed: boolean;
          leakedMarkerCount: number;
          leakedMarkerHashes: string[];
        };
        rawEffectiveSeparation: {
          rawFailureOccurrenceCount: number;
          effectiveRecordCount: number;
          rawFailurePayloadIncluded: false;
        };
        projectionDigest: string;
        recomputedDigest: string;
        evidenceDigest: string;
      }>;
    }>();
    expect(read).toEqual(
      expect.objectContaining({
        kind: "defect-mute-replay-invariant-materialized-read",
        projectId: project.id,
        actor: { type: "actor", actorId: "qa-api-agent", scoped: true },
        access: {
          scope: "defects:read",
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
        query: {
          projectId: project.id,
          actorId: "qa-api-agent",
          limit: 1,
          cursor: null
        },
        materialization: expect.objectContaining({
          adapterKind: "api-read-model-defect-mute-replay-invariant-materialized-wip",
          boundary: "worker-compatible-defect-mute-replay-invariant-materialized-read",
          consistency: "retry-safe-idempotent-projected-mute-state",
          source: "projected-defect-mute-state",
          readOnly: true,
          rawFailurePayloadsIncluded: false,
          mutationBoundary: "rest-read-only-no-worker-or-replay-mutation",
          materializedRecordCount: 1,
          materializationDigest: expect.stringMatching(/^[a-f0-9]{24}$/)
        }),
        summary: expect.objectContaining({
          materializedRecordCount: 1,
          deterministic: true,
          recomputable: true,
          projectScoped: true,
          appendOnlyUniqueProjectedEventIds: true,
          redactionPassed: true,
          rawFailureOccurrenceCount: 2,
          effectiveRecordCount: 2,
          projectedMuteStateCompatible: true,
          mutationBoundary: "api-materialized-read-only-no-rest-or-worker-mutation",
          plannedOperations: [
            "defect_mute.replay_invariant.summarize",
            "defect_mute.replay_invariant.materialized_read"
          ]
        }),
        page: {
          limit: 1,
          cursor: null,
          offset: 0,
          returned: 1,
          total: 1,
          nextCursor: null,
          hasMore: false
        }
      })
    );
    expect(read.items).toEqual([
      expect.objectContaining({
        invariantRef: expect.stringMatching(/^defect-mute-replay-invariant:[a-f0-9]{24}$/),
        projectId: project.id,
        source: "projected-defect-mute-state",
        deterministic: true,
        recomputable: true,
        projectScoped: true,
        appendOnly: {
          uniqueProjectedEventIds: true,
          projectedEventCount: 2,
          duplicateEventCount: 0,
          duplicateEventIdHashes: []
        },
        redaction: {
          passed: true,
          leakedMarkerCount: 0,
          leakedMarkerHashes: []
        },
        rawEffectiveSeparation: expect.objectContaining({
          rawFailureOccurrenceCount: 2,
          effectiveRecordCount: 2,
          rawFailurePayloadIncluded: false
        }),
        projectionDigest: expect.any(String),
        recomputedDigest: expect.any(String),
        evidenceDigest: expect.stringMatching(/^[a-f0-9]{24}$/)
      })
    ]);
    expect(read.materialization.materializationDigest).toBe(read.summary.materializationDigest);

    const exhaustedPageResponse = await app.inject({
      method: "GET",
      url: `${materializedPath}?limit=1&cursor=10`,
      headers: materializedReadHeaders
    });
    expect(exhaustedPageResponse.statusCode).toBe(200);
    expect(exhaustedPageResponse.json()).toEqual(
      expect.objectContaining({
        kind: "defect-mute-replay-invariant-materialized-read",
        projectId: project.id,
        actor: { type: "actor", actorId: "qa-api-agent", scoped: true },
        access: expect.objectContaining({
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        }),
        availability: expect.objectContaining({
          status: "ready",
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          partial: false
        }),
        query: {
          projectId: project.id,
          actorId: "qa-api-agent",
          limit: 1,
          cursor: "1"
        },
        materialization: expect.objectContaining({
          readOnly: true,
          rawFailurePayloadsIncluded: false,
          materializedRecordCount: 1
        }),
        page: {
          limit: 1,
          cursor: "1",
          offset: 1,
          returned: 0,
          total: 1,
          nextCursor: null,
          hasMore: false
        },
        items: []
      })
    );

    const otherActorResponse = await app.inject({
      method: "GET",
      url: `${materializedPath}?actorId=other-actor`,
      headers: {
        "x-testhistory-scopes": "defects:read",
        "x-testhistory-project-scope": project.id
      }
    });
    expect(otherActorResponse.statusCode).toBe(200);
    expect(otherActorResponse.json()).toEqual(
      expect.objectContaining({
        kind: "defect-mute-replay-invariant-materialized-read",
        actor: { type: "actor", actorId: "other-actor", scoped: true },
        availability: expect.objectContaining({ status: "empty", partial: false }),
        materialization: expect.objectContaining({
          materializedRecordCount: 0,
          rawFailurePayloadsIncluded: false,
          readOnly: true
        }),
        summary: expect.objectContaining({
          materializedRecordCount: 0,
          rawFailureOccurrenceCount: 0,
          effectiveRecordCount: 0
        }),
        page: expect.objectContaining({ total: 0, returned: 0 }),
        items: []
      })
    );

    const deniedResponse = await app.inject({
      method: "GET",
      url: `${materializedPath}?actorId=denied-materialized-reader`,
      headers: {
        "x-testhistory-project-scope": project.id,
        authorization: "Bearer defect-materialized-secret"
      }
    });
    expect(deniedResponse.statusCode).toBe(403);
    expect(deniedResponse.json()).toEqual(
      expect.objectContaining({
        kind: "defect-mute-replay-invariant-materialized-read",
        error: "PermissionDeniedError",
        requiredScopes: ["defects:read"],
        projectId: project.id,
        availability: expect.objectContaining({
          status: "denied",
          reason: "invalid_token",
          unavailable: ["defect-mute-replay-invariant-materialized-read"]
        }),
        message: "API token is invalid",
        redacted: true
      })
    );
    expect(deniedResponse.body).not.toContain("defect-materialized-secret");

    const wrongProjectResponse = await app.inject({
      method: "GET",
      url: `${materializedPath}?actorId=wrong-project-materialized-reader`,
      headers: {
        "x-testhistory-scopes": "defects:read",
        "x-testhistory-project-scope": otherProject.id,
        "x-testhistory-actor-id": "wrong-project-materialized-reader"
      }
    });
    expect(wrongProjectResponse.statusCode).toBe(403);
    expect(wrongProjectResponse.json()).toEqual(
      expect.objectContaining({
        kind: "defect-mute-replay-invariant-materialized-read",
        error: "PermissionDeniedError",
        requiredScopes: ["defects:read"],
        projectId: project.id,
        actor: { type: "actor", actorId: "wrong-project-materialized-reader", scoped: true },
        access: expect.objectContaining({
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        }),
        availability: expect.objectContaining({
          status: "denied",
          reason: "project_scope_denied",
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          partial: false,
          unavailable: ["defect-mute-replay-invariant-materialized-read"]
        }),
        redacted: true
      })
    );
    expect(wrongProjectResponse.body).not.toContain(otherProject.id);

    const missingProjectScopeResponse = await app.inject({
      method: "GET",
      url: `${materializedPath}?actorId=missing-project-scope-materialized-reader`,
      headers: {
        "x-testhistory-scopes": "defects:read"
      }
    });
    expect(missingProjectScopeResponse.statusCode).toBe(403);
    expect(missingProjectScopeResponse.json()).toEqual(
      expect.objectContaining({
        kind: "defect-mute-replay-invariant-materialized-read",
        projectId: project.id,
        actor: {
          type: "actor",
          actorId: "missing-project-scope-materialized-reader",
          scoped: true
        },
        availability: expect.objectContaining({
          status: "denied",
          reason: "project_scope_denied",
          unavailable: ["defect-mute-replay-invariant-materialized-read"]
        }),
        redacted: true
      })
    );

    const targetApp = app as FastifyInstance;
    const mutationResponses = await Promise.all(
      (["POST", "PUT", "PATCH", "DELETE"] as const).map((method) =>
        targetApp.inject({
          method,
          url: materializedPath,
          headers: materializedReadHeaders,
          payload: {
            requestedOperation: `materialized-${method.toLowerCase()}-mutation`,
            privateDescriptor: `private-materialized-${method.toLowerCase()}-descriptor`,
            failureEvidence: `hidden-materialized-${method.toLowerCase()}-body`
          }
        })
      )
    );
    for (const mutationResponse of mutationResponses) {
      expect([404, 405]).toContain(mutationResponse.statusCode);
      expect(mutationResponse.body).not.toContain("private-materialized");
      expect(mutationResponse.body).not.toContain("hidden-materialized");
    }

    const serialized = JSON.stringify({
      read,
      exhaustedPage: exhaustedPageResponse.json(),
      otherActor: otherActorResponse.json(),
      denied: deniedResponse.json(),
      wrongProject: wrongProjectResponse.json(),
      missingProjectScope: missingProjectScopeResponse.json(),
      mutationResponses: mutationResponses.map((mutationResponse) => mutationResponse.json())
    });
    expect(serialized).not.toContain(otherProject.id);
    expect(serialized).not.toContain("case-other-materialized-defect-invariant");
    expect(serialized).not.toContain("materialized-defect-token");
    expect(serialized).not.toContain("materialized-query-token");
    expect(serialized).not.toContain("raw-materialized-token");
    expect(serialized).not.toContain("materialized-storage");
    expect(serialized).not.toContain("signedUrl");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("synthetic://private");
    expect(serialized).not.toContain("storage://");
    expect(serialized).not.toContain("minio://");
    expect(serialized).not.toContain("blob://");
    expect(serialized).not.toContain("defect-materialized-secret");
    expect(serialized).not.toContain("private-materialized");
    expect(serialized).not.toContain("hidden-materialized");
    expect(store.launches.size).toBe(beforeStoreState.launches);
    expect(store.uploadJobs.size).toBe(beforeStoreState.uploadJobs);
    expect(store.artifacts.size).toBe(beforeStoreState.artifacts);
    expect((store.launches.get(launch.id) as Launch | undefined)?.results.length).toBe(
      beforeStoreState.launchResultCount
    );

    const openApi = readFileSync(
      new URL("../../../docs/openapi/openapi.yaml", import.meta.url),
      "utf8"
    );
    expect(openApi).toContain(
      "/api/v1/projects/{projectId}/defect-mutes/projection/replay/invariants/materialized:"
    );
    expect(openApi).toContain("DefectMuteReplayInvariantMaterializedRead");
  });

  it("rejects malformed defect mute quality gate payloads without echoing secrets", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/quality-gate`,
      payload: {
        defectMutes: [
          {
            id: "mute-bad",
            status: "active",
            reason: "Authorization: Bearer synthetic-secret-token",
            origin: { type: "actor", actorId: "actor-secret-token" },
            mutedAt: "2026-05-30T10:00:00.000Z",
            affectedSignatureHashes: [],
            affectedTestIds: [],
            auditEvents: []
          }
        ],
        defectMuteRules: [
          {
            code: "mute-bad",
            reasonCode: "quality_gate.failedBrokenTotal",
            mode: "exclude_muted_affected_tests"
          }
        ]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain("synthetic-secret-token");
    expect(response.body).not.toContain("actor-secret-token");
  });

  it("evaluates quality gates with custom thresholds while preserving legacy violations", async () => {
    app = await createApiApp();
    const launch = await createLaunch(app);

    await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "unknown-result.json",
            content: JSON.stringify({
              uuid: "unknown-result",
              testCaseId: "case-unknown",
              name: "unknown result",
              status: "unknown"
            })
          }
        ]
      }
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/quality-gate`,
      payload: {
        rules: [{ metric: "unknown", op: "lte", value: 1, severity: "fail" }],
        thresholds: {
          unknown: { op: "lte", value: 0, severity: "fail" },
          passRate: { op: "gte", value: 0, severity: "warn" }
        }
      }
    });

    expect(response.statusCode).toBe(200);
    const evaluation = response.json<QualityGateEvaluationResponse>();
    expect(evaluation).toEqual(
      expect.objectContaining({
        status: "failed",
        metrics: expect.objectContaining({
          total: 1,
          unknown: 1,
          passRate: 0
        }),
        violations: []
      })
    );
    expect(evaluation.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "quality_gate.unknown",
          severity: "fail",
          passed: false,
          actual: 1,
          op: "lte",
          threshold: 0
        }),
        expect.objectContaining({
          code: "quality_gate.passRate",
          severity: "warn",
          passed: true,
          actual: 0,
          op: "gte",
          threshold: 0
        })
      ])
    );
  });
});
