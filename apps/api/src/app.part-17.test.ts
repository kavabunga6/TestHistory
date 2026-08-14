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

describe("api app part-17", () => {
  it("returns paginated history compare permission audit replay invariant evidence", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    for (let index = 0; index < 3; index += 1) {
      const launchResponse = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${project.id}/launches`,
        payload: {
          name: `Permission audit invariant ${index}`,
          branch: "main",
          buildNumber: `300${index}`,
          commitSha: `invariant${index}`
        }
      });
      const launch = launchResponse.json<LaunchResponse>();
      await app.inject({
        method: "POST",
        url: `/api/v1/launches/${launch.id}/results/json`,
        payload: {
          files: [
            {
              path: `permission-invariant-${index}-result.json`,
              content: JSON.stringify({
                uuid: `permission-invariant-${index}`,
                testCaseId: "case-permission-audit-invariant",
                historyId: "history-permission-audit-invariant",
                name: "permission audit invariant",
                status: index === 0 ? "failed" : "passed",
                statusDetails: {
                  message:
                    "Bearer synthetic-invariant-token token=synthetic-invariant-token storageKey=synthetic-storage-key signedUrl=https://storage.example/private?X-Amz-Signature=synthetic C:\\synthetic\\allure-results\\raw.json"
                },
                parameters: [{ name: "token", value: "synthetic-invariant-token", mode: "masked" }],
                start: index,
                stop: index + 10
              })
            },
            {
              path: `permission-invariant-other-${index}-result.json`,
              content: JSON.stringify({
                uuid: `permission-invariant-other-${index}`,
                testCaseId: "case-permission-audit-other",
                historyId: "history-permission-audit-other",
                name: "permission audit other",
                status: "passed"
              })
            },
            {
              path: "executor.json",
              content: JSON.stringify({
                name: "synthetic-runner",
                type: "ci",
                buildName: `invariant-build-${index}`,
                buildUrl: `https://ci.example/invariant/${index}`,
                reportUrl: `https://reports.example/invariant/${index}`
              })
            }
          ]
        }
      });
    }

    const headers = {
      "x-testhistory-scopes": "test-cases:read",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-actor-id": "permission-invariant-reader"
    };
    const response = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-permission-audit-invariant/history/compare/permission-audit/replay/invariants?projectId=${project.id}` +
        "&limit=1",
      headers
    });
    const secondResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-permission-audit-invariant/history/compare/permission-audit/replay/invariants?projectId=${project.id}` +
        "&limit=1&cursor=1",
      headers
    });

    expect(response.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    const invariant = response.json<{
      kind: string;
      projectId: string;
      testCaseId: string;
      actor: { type: string; actorId: string; scoped: boolean };
      access: { mutation: boolean; redacted: boolean; actorScoped: boolean };
      availability: { status: string; partial: boolean; unavailable: string[] };
      query: {
        projectId: string;
        actorId: string;
        testCaseId: string;
        testCaseScoped: boolean;
        projectScoped: boolean;
        actorScoped: boolean;
        comparePairScoped: boolean;
        pagination: { limit: number; cursor: string | null; offset: number };
        redacted: boolean;
      };
      invariant: {
        mutationBoundary: string;
        deterministic: boolean;
        recomputable: boolean;
        projectScoped: boolean;
        actorScoped: {
          requested: boolean;
          passed: boolean;
          actorId: string;
          leakedActorIds: string[];
        };
        projectionDigest: string;
        recomputedDigest: string;
      };
      appendOnly: {
        uniqueProjectedEventIds: boolean;
        duplicateEventIds: string[];
        totalProjectedEventIds: number;
      };
      rawCompareInputs: {
        included: false;
        preserved: boolean;
        digestCount: number;
        itemCount: number;
      };
      redaction: {
        passed: boolean;
        leakedMarkerCount: number;
        rawHistoryIncluded: boolean;
        rawCompareInputsIncluded: boolean;
        tokensIncluded: boolean;
        pathsIncluded: boolean;
        storageLocationsIncluded: boolean;
        artifactUrlsIncluded: boolean;
      };
      page: { limit: number; returned: number; total: number; nextCursor: string | null };
      items: Array<{ ordinal: number; eventId: string; redacted: boolean }>;
    }>();
    const second = secondResponse.json<{
      query: { pagination: { cursor: string | null; offset: number } };
      page: { returned: number; nextCursor: string | null };
      items: Array<{ ordinal: number; eventId: string }>;
    }>();

    expect(invariant).toEqual(
      expect.objectContaining({
        kind: "test-case-history-compare-permission-audit-replay-invariants",
        projectId: project.id,
        testCaseId: "case-permission-audit-invariant",
        actor: { type: "actor", actorId: "permission-invariant-reader", scoped: true },
        access: expect.objectContaining({
          mutation: false,
          redacted: true,
          actorScoped: true
        }),
        availability: expect.objectContaining({
          status: "ready",
          partial: false,
          unavailable: []
        })
      })
    );
    expect(invariant.query).toEqual(
      expect.objectContaining({
        projectId: project.id,
        actorId: "permission-invariant-reader",
        testCaseId: "case-permission-audit-invariant",
        testCaseScoped: true,
        projectScoped: true,
        actorScoped: true,
        comparePairScoped: false,
        pagination: { limit: 1, cursor: null, offset: 0 },
        redacted: true
      })
    );
    expect(invariant.invariant).toEqual(
      expect.objectContaining({
        mutationBoundary: "rest-read-only-no-replay-mutation",
        deterministic: true,
        recomputable: true,
        projectScoped: true,
        actorScoped: {
          requested: true,
          passed: true,
          actorId: "permission-invariant-reader",
          leakedActorIds: []
        },
        projectionDigest: expect.any(String),
        recomputedDigest: expect.any(String)
      })
    );
    expect(invariant.appendOnly).toEqual({
      uniqueProjectedEventIds: true,
      duplicateEventIds: [],
      totalProjectedEventIds: 2
    });
    expect(invariant.rawCompareInputs).toEqual(
      expect.objectContaining({
        included: false,
        preserved: true,
        digestCount: 2,
        itemCount: 4
      })
    );
    expect(invariant.redaction).toEqual(
      expect.objectContaining({
        passed: true,
        leakedMarkerCount: 0,
        rawHistoryIncluded: false,
        rawCompareInputsIncluded: false,
        tokensIncluded: false,
        pathsIncluded: false,
        storageLocationsIncluded: false,
        artifactUrlsIncluded: false
      })
    );
    expect(invariant.page).toEqual(
      expect.objectContaining({ limit: 1, returned: 1, total: 2, nextCursor: "1" })
    );
    expect(invariant.items).toEqual([
      expect.objectContaining({
        ordinal: 0,
        eventId: expect.stringMatching(/^history-compare-permission:/),
        redacted: true
      })
    ]);
    expect(second.query.pagination).toEqual(expect.objectContaining({ cursor: "1", offset: 1 }));
    expect(second.page).toEqual(expect.objectContaining({ returned: 1, nextCursor: null }));
    expect(second.items[0]?.ordinal).toBe(1);
    expectSafeArtifactMetadata(invariant, [
      "synthetic-invariant-token",
      "synthetic-storage-key",
      "permission-invariant-0",
      "permission-invariant-other",
      "invariant-build-0",
      "C:\\synthetic\\allure-results",
      "X-Amz-Signature",
      "storage.example"
    ]);
    expect(response.body).not.toContain("synthetic-invariant-token");
    expect(response.body).not.toContain("case-permission-audit-other");
  });

  it("returns persisted history compare permission audit invariant reads without raw compare input leakage", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    for (let index = 0; index < 3; index += 1) {
      const launchResponse = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${project.id}/launches`,
        payload: {
          name: `Persisted permission audit invariant ${index}`,
          branch: "main",
          buildNumber: `310${index}`,
          commitSha: `persisted${index}`
        }
      });
      const launch = launchResponse.json<LaunchResponse>();
      await app.inject({
        method: "POST",
        url: `/api/v1/launches/${launch.id}/results/json`,
        payload: {
          files: [
            {
              path: `permission-persisted-invariant-${index}-result.json`,
              content: JSON.stringify({
                uuid: `permission-persisted-invariant-${index}`,
                testCaseId: "case-permission-audit-persisted",
                historyId: "history-permission-audit-persisted",
                name: "permission audit persisted invariant",
                status: index === 0 ? "failed" : "passed",
                statusDetails: {
                  message:
                    "Bearer synthetic-persisted-token token=synthetic-persisted-token storageKey=synthetic-persisted-storage signedUrl=https://storage.example/private?X-Amz-Signature=persisted synthetic://allure-results/raw.json"
                },
                parameters: [
                  { name: "hidden-token", value: "synthetic-persisted-token", mode: "hidden" }
                ],
                start: index,
                stop: index + 10
              })
            },
            {
              path: `permission-persisted-other-${index}-result.json`,
              content: JSON.stringify({
                uuid: `permission-persisted-other-${index}`,
                testCaseId: "case-permission-audit-persisted-other",
                historyId: "history-permission-audit-persisted-other",
                name: "permission audit persisted other",
                status: "passed"
              })
            }
          ]
        }
      });
    }
    const beforeStoreState = {
      launches: store.launches.size,
      uploadJobs: store.uploadJobs.size,
      artifacts: store.artifacts.size,
      testCases: store.testCases.size
    };
    const headers = {
      "x-testhistory-scopes": "test-cases:read",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-actor-id": "permission-persisted-reader"
    };

    const response = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-permission-audit-persisted/history/compare/permission-audit/replay/invariants/persisted?projectId=${project.id}` +
        "&limit=1",
      headers
    });
    const nextResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-permission-audit-persisted/history/compare/permission-audit/replay/invariants/persisted?projectId=${project.id}` +
        "&limit=1&cursor=1",
      headers
    });
    const otherProjectResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/test-cases/case-permission-audit-persisted/history/compare/permission-audit/replay/invariants/persisted?projectId=${project.id}` +
        "&limit=1",
      headers: {
        ...headers,
        "x-testhistory-project-scope": "other-project"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(nextResponse.statusCode).toBe(200);
    expect(otherProjectResponse.statusCode).toBe(403);
    const persisted = response.json<{
      kind: string;
      projectId: string;
      testCaseId: string;
      actor: { type: string; actorId: string; scoped: boolean };
      access: { mutation: boolean; redacted: boolean; actorScoped: boolean };
      availability: { status: string; partial: boolean; unavailable: string[] };
      persistence: {
        adapterKind: string;
        boundary: string;
        readOnly: boolean;
        rawHistoryIncluded: boolean;
        rawCompareInputsIncluded: boolean;
        hiddenOrMaskedValuesIncluded: boolean;
        localPathsIncluded: boolean;
        storageRefsIncluded: boolean;
        signedUrlsIncluded: boolean;
        tokensIncluded: boolean;
        persistedRecordCount: number;
        persistenceDigest: string;
      };
      summary: {
        persistedRecordCount: number;
        actorScoped: boolean;
        rawCompareInputsIncluded: boolean;
        rawHistoryIncluded: boolean;
        hiddenOrMaskedValuesIncluded: boolean;
        redactionPassed: boolean;
      };
      execution: {
        compareStarted: boolean;
        replayStarted: boolean;
        workerJobEnqueued: boolean;
        persistenceWriteStarted: boolean;
        mutation: boolean;
      };
      page: { limit: number; returned: number; total: number; nextCursor: string | null };
      items: Array<{
        kind: string;
        persistedRef: string;
        eventIdHash: string;
        ordinal: number;
        rawCompareInputs: { included: false };
        redaction: {
          rawHistoryIncluded: false;
          rawCompareInputsIncluded: false;
          hiddenOrMaskedValuesIncluded: false;
          tokensIncluded: false;
          pathsIncluded: false;
        };
        execution: { compareStarted: boolean; replayStarted: boolean; mutation: boolean };
      }>;
    }>();
    const nextPersisted = nextResponse.json<{
      page: { returned: number; nextCursor: string | null };
      items: Array<{ ordinal: number }>;
    }>();

    expect(persisted).toEqual(
      expect.objectContaining({
        kind: "test-case-history-compare-permission-audit-replay-invariant-persisted-read",
        projectId: project.id,
        testCaseId: "case-permission-audit-persisted",
        actor: { type: "actor", actorId: "permission-persisted-reader", scoped: true },
        access: expect.objectContaining({
          mutation: false,
          redacted: true,
          actorScoped: true
        }),
        availability: expect.objectContaining({
          status: "ready",
          partial: false,
          unavailable: []
        })
      })
    );
    expect(persisted.persistence).toEqual(
      expect.objectContaining({
        adapterKind:
          "api-read-model-history-compare-permission-audit-replay-invariant-persisted-wip",
        boundary: "persistent-history-compare-permission-audit-replay-invariant-read",
        readOnly: true,
        rawHistoryIncluded: false,
        rawCompareInputsIncluded: false,
        hiddenOrMaskedValuesIncluded: false,
        localPathsIncluded: false,
        storageRefsIncluded: false,
        signedUrlsIncluded: false,
        tokensIncluded: false,
        persistedRecordCount: 2,
        persistenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    );
    expect(persisted.summary).toEqual(
      expect.objectContaining({
        persistedRecordCount: 2,
        actorScoped: true,
        rawCompareInputsIncluded: false,
        rawHistoryIncluded: false,
        hiddenOrMaskedValuesIncluded: false,
        redactionPassed: true
      })
    );
    expect(persisted.execution).toEqual({
      compareStarted: false,
      replayStarted: false,
      workerJobEnqueued: false,
      persistenceWriteStarted: false,
      mutation: false
    });
    expect(persisted.page).toEqual(
      expect.objectContaining({ limit: 1, returned: 1, total: 2, nextCursor: "1" })
    );
    expect(persisted.items).toEqual([
      expect.objectContaining({
        kind: "test-case-history-compare-permission-audit-replay-invariant-persisted-record",
        persistedRef: expect.stringMatching(
          /^history-compare-permission-audit-replay-invariant-persisted:[a-f0-9]{24}$/
        ),
        eventIdHash: expect.stringMatching(/^[a-f0-9]{24}$/),
        ordinal: 0,
        rawCompareInputs: expect.objectContaining({ included: false }),
        redaction: expect.objectContaining({
          rawHistoryIncluded: false,
          rawCompareInputsIncluded: false,
          hiddenOrMaskedValuesIncluded: false,
          tokensIncluded: false,
          pathsIncluded: false
        }),
        execution: {
          compareStarted: false,
          replayStarted: false,
          workerJobEnqueued: false,
          mutation: false
        }
      })
    ]);
    expect(nextPersisted.page).toEqual(expect.objectContaining({ returned: 1, nextCursor: null }));
    expect(nextPersisted.items[0]?.ordinal).toBe(1);
    const serialized = JSON.stringify([persisted, nextPersisted, otherProjectResponse.json()]);
    expect(serialized).not.toContain("synthetic-persisted-token");
    expect(serialized).not.toContain("synthetic-persisted-storage");
    expect(serialized).not.toContain("permission-persisted-invariant-0");
    expect(serialized).not.toContain("case-permission-audit-persisted-other");
    expect(serialized).not.toContain("storage.example");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("allure-results/raw.json");
    expect(store.launches.size).toBe(beforeStoreState.launches);
    expect(store.uploadJobs.size).toBe(beforeStoreState.uploadJobs);
    expect(store.artifacts.size).toBe(beforeStoreState.artifacts);
    expect(store.testCases.size).toBe(beforeStoreState.testCases);
  });
});
