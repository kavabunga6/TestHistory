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
import { afterEach, describe, expect, it, vi } from "vitest";
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
  try {
    await app?.close();
  } finally {
    app = undefined;
    vi.useRealTimers();
  }
});

describe("api app quality-launches", () => {
  it("returns metadata-only artifact descriptors and safe checksum duplicates through API responses", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const launch = await createLaunch(app);
    const duplicateBody = "synthetic duplicate checksum body; descriptor must not expose this";
    const duplicateSha = createHash("sha256").update(duplicateBody).digest("hex");

    const uploadResponse = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/json`,
      payload: {
        files: [
          {
            path: "safe-descriptor-result.json",
            content: JSON.stringify({
              uuid: "safe-descriptor-result",
              name: "safe artifact descriptor",
              status: "passed",
              attachments: [
                {
                  name: "duplicate a",
                  source: "attachments/duplicate-a.txt",
                  type: "text/plain"
                },
                {
                  name: "duplicate b",
                  source: "attachments/duplicate-b.txt",
                  type: "text/plain"
                }
              ]
            })
          },
          {
            path: "attachments/duplicate-a.txt",
            content: duplicateBody
          },
          {
            path: "attachments/duplicate-b.txt",
            content: duplicateBody
          }
        ]
      }
    });

    expect(uploadResponse.statusCode).toBe(200);
    const upload = uploadResponse.json<{
      artifacts: Array<{
        id: string;
        path: string;
        kind: string;
        sha256: string;
        storageKey?: string;
        storage?: unknown;
        payload?: unknown;
        content?: unknown;
      }>;
      checksumDuplicates: Array<{ sha256: string; artifactIds: string[]; count: number }>;
    }>();
    const duplicateArtifactIds = upload.artifacts
      .filter((artifact) => artifact.sha256 === duplicateSha)
      .map((artifact) => artifact.id);

    expect(upload.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "safe-descriptor-result.json",
          kind: "allure-result"
        }),
        expect.objectContaining({
          path: "attachments/duplicate-a.txt",
          kind: "unknown",
          sha256: duplicateSha
        }),
        expect.objectContaining({
          path: "attachments/duplicate-b.txt",
          kind: "unknown",
          sha256: duplicateSha
        })
      ])
    );
    expect(upload.checksumDuplicates).toEqual([
      {
        sha256: duplicateSha,
        artifactIds: expect.arrayContaining(duplicateArtifactIds),
        count: 2
      }
    ]);
    expectSafeArtifactMetadata(upload, [duplicateBody]);
    const persistedDuplicate = store.artifacts.get(duplicateArtifactIds[0]!);
    expect(persistedDuplicate).toBeDefined();
    const persistedDuplicateObject = await store.artifactObjects.getObject(
      persistedDuplicate!.storageKey
    );
    expect(persistedDuplicateObject?.body.toString("utf8")).toBe(duplicateBody);

    const resultResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/results/safe-descriptor-result`
    });
    expect(resultResponse.statusCode).toBe(200);
    const resultDetails = resultResponse.json<{
      artifacts: Array<{ path: string; sha256: string }>;
      checksumDuplicates: Array<{ sha256: string; artifactIds: string[]; count: number }>;
    }>();
    expect(resultDetails.artifacts.map((artifact) => artifact.path)).toEqual(
      expect.arrayContaining([
        "safe-descriptor-result.json",
        "attachments/duplicate-a.txt",
        "attachments/duplicate-b.txt"
      ])
    );
    expect(resultDetails.checksumDuplicates).toEqual([
      expect.objectContaining({ sha256: duplicateSha, count: 2 })
    ]);
    expectSafeArtifactMetadata(resultDetails, [duplicateBody]);

    const launchResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}`
    });
    expect(launchResponse.statusCode).toBe(200);
    const launchDetails = launchResponse.json<{
      artifacts: Array<{ path: string; sha256: string }>;
      checksumDuplicates: Array<{ sha256: string; artifactIds: string[]; count: number }>;
    }>();
    expect(launchDetails.artifacts).toHaveLength(3);
    expect(launchDetails.checksumDuplicates).toEqual([
      expect.objectContaining({ sha256: duplicateSha, count: 2 })
    ]);
    expectSafeArtifactMetadata(launchDetails, [duplicateBody]);

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/v1/artifacts?launchId=${launch.id}`
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json<Array<{ path: string; sha256: string }>>()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "attachments/duplicate-a.txt", sha256: duplicateSha }),
        expect.objectContaining({ path: "attachments/duplicate-b.txt", sha256: duplicateSha })
      ])
    );
    expectSafeArtifactMetadata(listResponse.json(), [duplicateBody]);

    const pagedListResponse = await app.inject({
      method: "GET",
      url: `/api/v1/artifacts?launchId=${launch.id}&limit=2`
    });
    expect(pagedListResponse.statusCode).toBe(200);
    expect(pagedListResponse.json<ListResponse<{ path: string; sha256: string }>>()).toEqual(
      expect.objectContaining({
        kind: "artifact-list",
        page: expect.objectContaining({
          limit: 2,
          returned: 2,
          total: 3,
          nextCursor: "2",
          hasMore: true
        }),
        items: expect.arrayContaining([
          expect.objectContaining({ path: "attachments/duplicate-a.txt", sha256: duplicateSha })
        ])
      })
    );
    expectSafeArtifactMetadata(pagedListResponse.json(), [duplicateBody]);
  });

  it("previews attachment descriptor retention eligibility as paginated redacted read models", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);

    const closedLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Closed retention launch" }
    });
    const openLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Open retention launch" }
    });
    expect(closedLaunchResponse.statusCode).toBe(201);
    expect(openLaunchResponse.statusCode).toBe(201);

    const closedLaunch = closedLaunchResponse.json<LaunchResponse>();
    const openLaunch = openLaunchResponse.json<LaunchResponse>();
    const storedClosedLaunch = store.launches.get(closedLaunch.id) as Launch;
    storedClosedLaunch.status = "closed";
    storedClosedLaunch.closedAt = "2026-05-30T00:00:00.000Z";

    const descriptors = [
      previewRetentionArtifact({
        id: "eligible-preview-artifact",
        launchId: closedLaunch.id,
        projectId: project.id,
        resultStatus: "passed",
        retentionClass: "passed-short",
        observedAt: "2026-05-01T00:00:00.000Z",
        content:
          "eligible preview token=preview-retention-secret C:\\Users\\tester\\Downloads\\eligible.log"
      }),
      previewRetentionArtifact({
        id: "evidence-preview-artifact",
        launchId: closedLaunch.id,
        projectId: project.id,
        resultStatus: "failed",
        retentionClass: "failure-diagnostic",
        observedAt: "2026-05-20T00:00:00.000Z",
        content: "failure evidence preview token=preview-retention-secret"
      }),
      previewRetentionArtifact({
        id: "held-preview-artifact",
        launchId: closedLaunch.id,
        projectId: project.id,
        resultStatus: "failed",
        retentionClass: "failure-diagnostic",
        retentionPolicyClass: "legal-hold-placeholder",
        retentionHorizonDays: 3650,
        observedAt: "2026-01-01T00:00:00.000Z",
        content: "legal hold preview token=preview-retention-secret"
      }),
      previewRetentionArtifact({
        id: "open-launch-preview-artifact",
        launchId: openLaunch.id,
        projectId: project.id,
        resultStatus: "passed",
        retentionClass: "passed-short",
        observedAt: "2026-05-01T00:00:00.000Z",
        content: "open launch preview token=preview-retention-secret"
      })
    ];
    for (const artifact of descriptors) {
      store.artifacts.set(artifact.id, artifact);
    }
    const beforeStoreState = {
      artifacts: store.artifacts.size,
      uploadJobs: store.uploadJobs.size,
      launches: store.launches.size
    };

    const firstPageResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${closedLaunch.id}/attachment-previews/retention/preview?limit=1&batchSize=1`,
      headers: {
        "x-testhistory-scopes": "artifacts:read",
        "x-testhistory-project-scope": project.id
      }
    });
    const secondPageResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${closedLaunch.id}/attachment-previews/retention/preview?cursor=1&limit=2`,
      headers: {
        "x-testhistory-scopes": "artifacts:read",
        "x-testhistory-project-scope": project.id
      }
    });
    const retainedOnlyResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${closedLaunch.id}/attachment-previews/retention/preview?status=retained`,
      headers: {
        "x-testhistory-scopes": "artifacts:read",
        "x-testhistory-project-scope": project.id
      }
    });

    expect(firstPageResponse.statusCode).toBe(200);
    const firstPage = firstPageResponse.json<{
      kind: string;
      query: { status: string | null; limit: number; cursor: string | null; batchSize: number };
      access: { scope: string; mutation: boolean; redacted: boolean };
      execution: {
        dryRun: boolean;
        executionMode: string;
        deletionStarted: boolean;
        deletionMutation: boolean;
        deletionExecution: boolean;
        providerActions: boolean;
        objectStorageTouched: boolean;
        deleteRequestedCount: number;
      };
      boundary: {
        scope: string;
        eligibleLaunchStatus: string;
        closedLaunchScoped: boolean;
        rawMaterialReturned: boolean;
      };
      page: { limit: number; returned: number; total: number; nextCursor: string | null };
      summary: {
        descriptorCount: number;
        cleanupEligibleDescriptorCount: number;
        retainedDescriptorCount: number;
        preservedDescriptorCount: number;
      };
      items: Array<{
        artifactId: string;
        previewDescriptorId: string;
        status: string;
        cleanupEligibleAt: string | null;
        descriptor: { previewBytes: number; originalBytes: number };
        retention: { policyClass: string; cleanupEligibility: { eligible: boolean } };
        deletion: {
          planned: boolean;
          executed: boolean;
          requested: boolean;
          providerAction: boolean;
        };
      }>;
      dryRunPlan: {
        pageScoped: boolean;
        candidateCount: number;
        batchSize: number;
        batchCount: number;
        totalCandidateBytes: number;
        planDigest: string | null;
        deleteRequestedCount: number;
        batches: Array<{
          index: number;
          candidateCount: number;
          candidateRefs: string[];
          batchDigest: string;
          deletionExecution: boolean;
        }>;
      };
      policy: {
        mutationAllowed: boolean;
        deletionExecution: boolean;
        providerActions: boolean;
        rawPayloadsIncluded: boolean;
        pathsIncluded: boolean;
        storageLocationsIncluded: boolean;
        signedUrlsIncluded: boolean;
        tokensIncluded: boolean;
        paginationRequired: boolean;
        redacted: boolean;
      };
    }>();
    expect(firstPage).toEqual(
      expect.objectContaining({
        kind: "attachment-preview-retention-preview",
        query: { status: null, limit: 1, cursor: null, batchSize: 1 },
        access: { scope: "artifacts:read", projectScoped: true, mutation: false, redacted: true },
        execution: {
          dryRun: true,
          executionMode: "dry-run",
          deletionStarted: false,
          deletionMutation: false,
          deletionExecution: false,
          providerActions: false,
          objectStorageTouched: false,
          deleteRequestedCount: 0
        },
        boundary: expect.objectContaining({
          scope: "closed-launch",
          eligibleLaunchStatus: "closed",
          closedLaunchScoped: true,
          rawMaterialReturned: false
        }),
        page: expect.objectContaining({ limit: 1, returned: 1, total: 3, nextCursor: "1" }),
        summary: expect.objectContaining({
          descriptorCount: 3,
          cleanupEligibleDescriptorCount: 1,
          retainedDescriptorCount: 1,
          preservedDescriptorCount: 1
        }),
        items: [
          expect.objectContaining({
            artifactId: "eligible-preview-artifact",
            status: "cleanup_eligible",
            cleanupEligibleAt: "2026-05-08T00:00:00.000Z",
            retention: expect.objectContaining({
              policyClass: "short-lived-preview",
              cleanupEligibility: { eligible: true, reason: "preview-retention-horizon-applies" }
            }),
            deletion: { planned: false, executed: false, requested: false, providerAction: false }
          })
        ],
        dryRunPlan: expect.objectContaining({
          pageScoped: true,
          candidateCount: 1,
          batchSize: 1,
          batchCount: 1,
          deleteRequestedCount: 0,
          batches: [
            expect.objectContaining({
              index: 0,
              candidateCount: 1,
              deletionExecution: false,
              candidateRefs: [expect.stringMatching(/^preview-retention-candidate:[a-f0-9]{64}$/)]
            })
          ]
        }),
        policy: {
          mutationAllowed: false,
          deletionExecution: false,
          providerActions: false,
          rawPayloadsIncluded: false,
          pathsIncluded: false,
          storageLocationsIncluded: false,
          signedUrlsIncluded: false,
          tokensIncluded: false,
          paginationRequired: true,
          redacted: true
        }
      })
    );
    expect(firstPage.dryRunPlan.planDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(firstPage.dryRunPlan.batches[0]?.batchDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(secondPageResponse.statusCode).toBe(200);
    expect(secondPageResponse.json<{ items: Array<{ status: string }> }>()).toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({ status: "retained" }),
          expect.objectContaining({ status: "preserved" })
        ]
      })
    );
    expect(retainedOnlyResponse.statusCode).toBe(200);
    expect(
      retainedOnlyResponse.json<{ page: { total: number }; items: Array<{ status: string }> }>()
    ).toEqual(
      expect.objectContaining({
        page: expect.objectContaining({ total: 1 }),
        items: [expect.objectContaining({ status: "retained" })]
      })
    );

    const serialized = JSON.stringify([
      firstPageResponse.json(),
      secondPageResponse.json(),
      retainedOnlyResponse.json()
    ]);
    expect(serialized).not.toContain("preview-retention-secret");
    expect(serialized).not.toContain("Downloads");
    expect(serialized).not.toContain("eligible.log");
    expect(serialized).not.toContain("raw/");
    expect(serialized).not.toContain("token=");
    expect(serialized).not.toContain('"body"');
    expect(serialized).not.toContain('"path"');
    expect(serialized).not.toContain('"sha256"');
    expect(serialized).not.toContain('"storageKey"');
    expect(serialized).not.toContain('"signedUrl"');
    expect(serialized).not.toContain('"deletionPlan"');
    expect(serialized).not.toContain('"artifactIds"');
    expect(store.artifacts.size).toBe(beforeStoreState.artifacts);
    expect(store.uploadJobs.size).toBe(beforeStoreState.uploadJobs);
    expect(store.launches.size).toBe(beforeStoreState.launches);

    const staticOpenApi = readFileSync(
      new URL("../../../docs/openapi/openapi.yaml", import.meta.url),
      "utf8"
    );
    expect(staticOpenApi).toContain(
      "/api/v1/launches/{launchId}/attachment-previews/retention/dry-run/schedule:"
    );
    expect(staticOpenApi).toContain(
      "operationId: readAttachmentPreviewRetentionDryRunScheduleDescriptors"
    );
    expect(staticOpenApi).toContain("AttachmentPreviewRetentionDryRunScheduleDescriptorRead");
    expect(staticOpenApi).toContain("providerMutationHandlesIncluded");
  });

  it("executes artifact retention cleanup as bounded closed-launch batches", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const closedLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Closed cleanup launch" }
    });
    const openLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Open cleanup launch" }
    });
    const closedLaunch = closedLaunchResponse.json<LaunchResponse>();
    const openLaunch = openLaunchResponse.json<LaunchResponse>();
    const mutableClosedLaunch = store.launches.get(closedLaunch.id) as Launch;
    mutableClosedLaunch.status = "closed";
    mutableClosedLaunch.closedAt = "2026-05-30T00:00:00.000Z";
    const cleanupExpiredArtifact = previewRetentionArtifact({
      id: "cleanup-expired-artifact",
      launchId: closedLaunch.id,
      projectId: project.id,
      resultStatus: "passed",
      retentionClass: "passed-short",
      observedAt: "2026-05-01T00:00:00.000Z",
      content: "cleanup expired token=cleanup-secret"
    });
    store.artifacts.set("cleanup-expired-artifact", cleanupExpiredArtifact);
    await store.artifactObjects.putObject({
      key: cleanupExpiredArtifact.storageKey,
      body: Buffer.from("cleanup expired", "utf8"),
      originalBytes: cleanupExpiredArtifact.originalBytes,
      storedBytes: cleanupExpiredArtifact.storedBytes,
      sha256: cleanupExpiredArtifact.sha256,
      compression: cleanupExpiredArtifact.compression,
      ...(cleanupExpiredArtifact.contentType !== undefined
        ? { contentType: cleanupExpiredArtifact.contentType }
        : {})
    });
    store.artifacts.set(
      "cleanup-open-artifact",
      previewRetentionArtifact({
        id: "cleanup-open-artifact",
        launchId: openLaunch.id,
        projectId: project.id,
        resultStatus: "passed",
        retentionClass: "passed-short",
        observedAt: "2026-05-01T00:00:00.000Z",
        content: "cleanup open token=cleanup-secret"
      })
    );

    const dryRunResponse = await app.inject({
      method: "POST",
      url: "/api/v1/artifacts/retention/execute",
      payload: { projectId: project.id, dryRun: true, batchSize: 1 }
    });

    expect(dryRunResponse.statusCode).toBe(200);
    expect(dryRunResponse.json()).toEqual(
      expect.objectContaining({
        kind: "artifact-retention-cleanup-execution",
        projectId: project.id,
        dryRun: true,
        stagedCandidateCount: 1,
        skippedOpenLaunchRecords: 1,
        deleteRequestedCount: 0,
        deletedCount: 0,
        mutation: expect.objectContaining({
          descriptorRecordsRemoved: 0,
          objectStoreDeleteExecuted: false,
          rawTargetsReturned: false,
          storageKeysReturned: false
        })
      })
    );
    expect(store.artifacts.has("cleanup-expired-artifact")).toBe(true);
    expect(store.artifacts.has("cleanup-open-artifact")).toBe(true);
    const executeResponse = await app.inject({
      method: "POST",
      url: "/api/v1/artifacts/retention/execute",
      payload: { projectId: project.id, dryRun: false, batchSize: 1 }
    });

    expect(executeResponse.statusCode).toBe(200);
    expect(executeResponse.json()).toEqual(
      expect.objectContaining({
        kind: "artifact-retention-cleanup-execution",
        projectId: project.id,
        dryRun: false,
        stagedCandidateCount: 1,
        deleteRequestedCount: 1,
        deletedCount: 1,
        mutation: expect.objectContaining({
          descriptorRecordsRemoved: 1,
          objectStoreDeleteExecuted: true,
          rawTargetsReturned: false,
          storageKeysReturned: false
        })
      })
    );
    expect(store.artifacts.has("cleanup-expired-artifact")).toBe(false);
    expect(store.artifacts.has("cleanup-open-artifact")).toBe(true);
    expect(
      await store.artifactObjects.headObject(cleanupExpiredArtifact.storageKey)
    ).toBeUndefined();
    expect(JSON.stringify(dryRunResponse.json())).not.toContain("synthetic-preview-retention");
    expect(JSON.stringify(executeResponse.json())).not.toContain("cleanup-secret");
  });

  it("returns an empty attachment preview retention dry-run for closed launches without descriptors", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const launchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Empty closed retention launch" }
    });
    expect(launchResponse.statusCode).toBe(201);
    const launch = launchResponse.json<LaunchResponse>();
    const storedLaunch = store.launches.get(launch.id) as Launch;
    storedLaunch.status = "closed";
    storedLaunch.closedAt = "2026-05-30T00:00:00.000Z";

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/attachment-previews/retention/preview?limit=5&cursor=999`,
      headers: {
        "x-testhistory-scopes": "artifacts:read",
        "x-testhistory-project-scope": project.id
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        launch: expect.objectContaining({
          id: launch.id,
          projectId: project.id,
          status: "closed"
        }),
        page: {
          limit: 5,
          cursor: null,
          offset: 0,
          returned: 0,
          total: 0,
          nextCursor: null,
          hasMore: false
        },
        summary: {
          descriptorCount: 0,
          cleanupEligibleDescriptorCount: 0,
          retainedDescriptorCount: 0,
          preservedDescriptorCount: 0,
          evidenceDescriptorCount: 0,
          legalHoldPlaceholderCount: 0,
          invalidDescriptorCount: 0
        },
        items: [],
        dryRunPlan: {
          pageScoped: true,
          candidateCount: 0,
          batchSize: 100,
          batchCount: 0,
          totalCandidateBytes: 0,
          planDigest: null,
          deleteRequestedCount: 0,
          batches: []
        }
      })
    );
  });
});
