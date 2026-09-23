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

describe("api app history-compare-a", () => {
  it("permission-checks attachment preview retention reads and rejects open launches", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const launchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Open retention launch" }
    });
    expect(launchResponse.statusCode).toBe(201);
    const launch = launchResponse.json<LaunchResponse>();
    const tokenResponse = await app.inject({
      headers: {
        "x-testhistory-actor-id": "project-owner",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-scopes": "settings:write"
      },
      method: "POST",
      payload: {
        expiresAt: "2099-09-01T00:00:00.000Z",
        name: "Artifact retention reader",
        ownerSubject: "svc-artifacts",
        scopes: ["artifacts:read"]
      },
      url: `/api/v1/projects/${project.id}/settings/access/tokens`
    });
    const artifactReadToken = tokenResponse.json<{ secret: string }>();
    store.artifacts.set(
      "open-denied-preview-artifact",
      previewRetentionArtifact({
        id: "open-denied-preview-artifact",
        launchId: launch.id,
        projectId: project.id,
        resultStatus: "passed",
        retentionClass: "passed-short",
        observedAt: "2026-05-01T00:00:00.000Z",
        content: "denied open preview token=preview-retention-secret"
      })
    );

    const missingScopeResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/attachment-previews/retention/preview`,
      headers: {
        "x-testhistory-project-scope": project.id,
        authorization: "Bearer preview-retention-secret"
      }
    });
    const wrongProjectResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/attachment-previews/retention/preview`,
      headers: {
        "x-testhistory-scopes": "artifacts:read",
        "x-testhistory-project-scope": "other-project",
        authorization: "Bearer preview-retention-secret"
      }
    });
    const openLaunchResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${launch.id}/attachment-previews/retention/preview`,
      headers: {
        "x-testhistory-scopes": "artifacts:read",
        "x-testhistory-project-scope": project.id
      }
    });
    const bearerOpenLaunchResponse = await app.inject({
      headers: {
        authorization: `Bearer ${artifactReadToken.secret}`
      },
      method: "GET",
      url: `/api/v1/launches/${launch.id}/attachment-previews/retention/preview`
    });

    expect(missingScopeResponse.statusCode).toBe(403);
    expect(wrongProjectResponse.statusCode).toBe(403);
    expect(missingScopeResponse.json()).toEqual({
      error: "PermissionDeniedError",
      message: "API token is invalid",
      requiredScopes: ["artifacts:read"],
      projectId: project.id,
      redacted: true
    });
    expect(wrongProjectResponse.json()).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        requiredScopes: ["artifacts:read"],
        projectId: project.id,
        redacted: true
      })
    );
    expect(openLaunchResponse.statusCode).toBe(409);
    expect(bearerOpenLaunchResponse.statusCode).toBe(409);
    expect(openLaunchResponse.json()).toEqual(
      expect.objectContaining({
        error: "LaunchStateError",
        requiredLaunchStatus: "closed",
        actualLaunchStatus: "open",
        redacted: true
      })
    );
    expect(
      JSON.stringify([
        missingScopeResponse.json(),
        wrongProjectResponse.json(),
        bearerOpenLaunchResponse.json()
      ])
    ).not.toContain("preview-retention-secret");
    expect(JSON.stringify(bearerOpenLaunchResponse.json())).not.toContain(artifactReadToken.secret);

    const staticOpenApi = readFileSync(
      new URL("../../../docs/openapi/openapi.yaml", import.meta.url),
      "utf8"
    );
    expect(staticOpenApi).toContain(
      "/api/v1/launches/{launchId}/attachment-previews/retention/preview:"
    );
    expect(staticOpenApi).toContain("operationId: previewAttachmentPreviewRetention");
    expect(staticOpenApi).toContain("AttachmentPreviewRetentionPreview");
    expect(staticOpenApi).toContain("AttachmentPreviewRetentionDryRunPlan");
    expect(staticOpenApi).toContain("deleteRequestedCount");
    expect(staticOpenApi).toContain("AttachmentPreviewRetentionLaunchStateError");
  });

  it("reads attachment preview retention dry-run schedule descriptors as paginated redacted metadata", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);

    const closedLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Closed schedule descriptor launch" }
    });
    const openLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Open schedule descriptor launch" }
    });
    expect(closedLaunchResponse.statusCode).toBe(201);
    expect(openLaunchResponse.statusCode).toBe(201);

    const closedLaunch = closedLaunchResponse.json<LaunchResponse>();
    const openLaunch = openLaunchResponse.json<LaunchResponse>();
    const storedClosedLaunch = store.launches.get(closedLaunch.id) as Launch;
    storedClosedLaunch.status = "closed";
    storedClosedLaunch.closedAt = "2026-05-30T00:00:00.000Z";

    const closedArtifacts = [
      previewRetentionArtifact({
        id: "schedule-preview-a",
        launchId: closedLaunch.id,
        projectId: project.id,
        resultStatus: "passed",
        retentionClass: "passed-short",
        observedAt: "2026-05-01T00:00:00.000Z",
        content: "synthetic schedule descriptor token=schedule-secret-a"
      }),
      previewRetentionArtifact({
        id: "schedule-preview-b",
        launchId: closedLaunch.id,
        projectId: project.id,
        resultStatus: "failed",
        retentionClass: "failure-diagnostic",
        observedAt: "2026-05-01T00:00:00.000Z",
        content: "synthetic schedule descriptor token=schedule-secret-b"
      }),
      {
        ...previewRetentionArtifact({
          id: "schedule-non-attachment",
          launchId: closedLaunch.id,
          projectId: project.id,
          resultStatus: "passed",
          retentionClass: "passed-short",
          observedAt: "2026-05-01T00:00:00.000Z",
          content: "synthetic non-attachment token=schedule-secret-c"
        }),
        kind: "allure-result" as const
      }
    ];
    const openArtifact = previewRetentionArtifact({
      id: "open-schedule-preview",
      launchId: openLaunch.id,
      projectId: project.id,
      resultStatus: "passed",
      retentionClass: "passed-short",
      observedAt: "2026-05-01T00:00:00.000Z",
      content: "synthetic open launch token=schedule-secret-open"
    });
    for (const artifact of [...closedArtifacts, openArtifact]) {
      store.artifacts.set(artifact.id, artifact);
    }
    const beforeStoreState = {
      artifacts: store.artifacts.size,
      uploadJobs: store.uploadJobs.size,
      launches: store.launches.size
    };

    const firstPageResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${closedLaunch.id}/attachment-previews/retention/dry-run/schedule?limit=1&scheduleSize=1`,
      headers: {
        "x-testhistory-scopes": "artifacts:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "retention-schedule-api"
      }
    });
    expect(firstPageResponse.statusCode).toBe(200);
    const firstPage = firstPageResponse.json<{
      kind: string;
      scope: { projectId: string; launchId: string; actorId: string };
      access: { mutation: boolean; redacted: boolean; actorScoped: boolean };
      boundary: {
        scope: string;
        closedLaunchScoped: boolean;
        descriptorSource: string;
        rawMaterialReturned: boolean;
      };
      execution: {
        dryRun: boolean;
        readOnly: boolean;
        workerExecutionAllowed: boolean;
        deletionMutation: boolean;
        deletionExecution: boolean;
        providerActions: boolean;
        providerMutationHandles: boolean;
        objectStorageTouched: boolean;
        deleteRequestedCount: number;
      };
      page: { limit: number; returned: number; total: number; nextCursor: string | null };
      summary: {
        sourceDescriptorCount: number;
        closedLaunchDescriptorCount: number;
        skippedNonAttachmentDescriptorCount: number;
        scheduledDescriptorCount: number;
        scheduleDescriptorCount: number;
        scheduleDigest: string;
        plannedOperations: string[];
        deleteRequestedCount: number;
      };
      batches: Array<{
        scheduleRef: string;
        index: number;
        descriptorCount: number;
        maxCount: number;
        descriptorRefs: string[];
        descriptorDigests: string[];
        batchDigest: string;
        dryRun: boolean;
        mutationAllowed: boolean;
        deletionExecution: boolean;
        deleteRequestedCount: number;
        safety: {
          descriptorOnly: boolean;
          closedLaunchScope: boolean;
          pathIncluded: boolean;
          storageKeyIncluded: boolean;
          providerMutationHandleIncluded: boolean;
          rawPayloadIncluded: boolean;
          blobIncluded: boolean;
          signedUrlIncluded: boolean;
          credentialIncluded: boolean;
          mutationAllowed: boolean;
        };
      }>;
      policy: {
        mutationAllowed: boolean;
        refreshAllowed: boolean;
        deletionExecution: boolean;
        providerActions: boolean;
        providerMutationHandlesIncluded: boolean;
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
        kind: "attachment-preview-retention-dry-run-schedule",
        scope: {
          projectId: project.id,
          launchId: closedLaunch.id,
          actorId: "retention-schedule-api"
        },
        access: expect.objectContaining({
          mutation: false,
          redacted: true,
          actorScoped: true
        }),
        boundary: {
          scope: "closed-launch",
          eligibleLaunchStatus: "closed",
          workerScheduled: false,
          closedLaunchScoped: true,
          descriptorSource: "artifact-schedule-descriptor-read-model",
          rawMaterialReturned: false
        },
        execution: {
          dryRun: true,
          executionMode: "dry-run",
          readOnly: true,
          workerExecutionAllowed: false,
          deletionMutation: false,
          deletionExecution: false,
          providerActions: false,
          providerMutationHandles: false,
          objectStorageTouched: false,
          deleteRequestedCount: 0
        },
        page: expect.objectContaining({ limit: 1, returned: 1, total: 2, nextCursor: "1" }),
        summary: expect.objectContaining({
          sourceDescriptorCount: 3,
          closedLaunchDescriptorCount: 2,
          skippedNonAttachmentDescriptorCount: 1,
          scheduledDescriptorCount: 2,
          scheduleDescriptorCount: 2,
          plannedOperations: [
            "artifact.preview.retention.dry-run.schedule.describe",
            "artifact.preview.retention.dry-run.schedule.read"
          ],
          deleteRequestedCount: 0
        }),
        policy: {
          mutationAllowed: false,
          refreshAllowed: false,
          deletionExecution: false,
          providerActions: false,
          providerMutationHandlesIncluded: false,
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
    expect(firstPage.summary.scheduleDigest).toMatch(/^[a-f0-9]{24}$/);
    expect(firstPage.batches).toHaveLength(1);
    expect(firstPage.batches[0]).toEqual(
      expect.objectContaining({
        index: 0,
        descriptorCount: 1,
        maxCount: 1,
        dryRun: true,
        mutationAllowed: false,
        deletionExecution: false,
        deleteRequestedCount: 0,
        safety: expect.objectContaining({
          descriptorOnly: true,
          closedLaunchScope: true,
          pathIncluded: false,
          storageKeyIncluded: false,
          providerMutationHandleIncluded: false,
          rawPayloadIncluded: false,
          blobIncluded: false,
          signedUrlIncluded: false,
          credentialIncluded: false,
          mutationAllowed: false
        })
      })
    );
    expect(firstPage.batches[0]?.scheduleRef).toMatch(
      /^artifact-preview-retention-schedule:[a-f0-9]{24}$/
    );
    expect(firstPage.batches[0]?.batchDigest).toMatch(/^[a-f0-9]{24}$/);
    expect(firstPage.batches[0]?.descriptorRefs).toEqual([
      expect.stringMatching(/^artifact-preview-retention-descriptor:[a-f0-9]{24}$/)
    ]);
    expect(firstPage.batches[0]?.descriptorDigests).toEqual([
      expect.stringMatching(/^[a-f0-9]{24}$/)
    ]);

    const secondPageResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${closedLaunch.id}/attachment-previews/retention/dry-run/schedule?cursor=1&limit=1&scheduleSize=1`,
      headers: {
        "x-testhistory-scopes": "artifacts:read",
        "x-testhistory-project-scope": project.id
      }
    });
    expect(secondPageResponse.statusCode).toBe(200);
    expect(secondPageResponse.json<{ page: { returned: number; hasMore: boolean } }>()).toEqual(
      expect.objectContaining({
        page: expect.objectContaining({ returned: 1, hasMore: false })
      })
    );

    const filteredResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${closedLaunch.id}/attachment-previews/retention/dry-run/schedule?scheduleDigest=${firstPage.batches[0]?.batchDigest}&scheduleSize=1`,
      headers: {
        "x-testhistory-scopes": "artifacts:read",
        "x-testhistory-project-scope": project.id
      }
    });
    expect(filteredResponse.statusCode).toBe(200);
    expect(filteredResponse.json<{ page: { total: number }; batches: unknown[] }>()).toEqual(
      expect.objectContaining({
        page: expect.objectContaining({ total: 1 }),
        batches: [expect.objectContaining({ batchDigest: firstPage.batches[0]?.batchDigest })]
      })
    );

    const serialized = JSON.stringify([
      firstPageResponse.json(),
      secondPageResponse.json(),
      filteredResponse.json()
    ]);
    expect(serialized).not.toContain("schedule-secret");
    expect(serialized).not.toContain("open-schedule-preview");
    expect(serialized).not.toContain("synthetic://");
    expect(serialized).not.toContain("retention-marker.txt");
    expect(serialized).not.toContain('"storageKey"');
    expect(serialized).not.toContain('"signedUrl"');
    expect(serialized).not.toContain("token=");
    expect(serialized).not.toContain('"body"');
    expect(serialized).not.toContain('"path"');
    expect(serialized).not.toContain('"sha256"');
    expect(serialized).not.toContain('"deletionPlan"');
    expect(serialized).not.toContain('"storageKeys"');
    expect(store.artifacts.size).toBe(beforeStoreState.artifacts);
    expect(store.uploadJobs.size).toBe(beforeStoreState.uploadJobs);
    expect(store.launches.size).toBe(beforeStoreState.launches);
  });

  it("permission-checks attachment preview retention dry-run schedule descriptor reads and rejects open launches", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const closedLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Closed schedule descriptor guard launch" }
    });
    const openLaunchResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/launches`,
      payload: { name: "Open schedule descriptor guard launch" }
    });
    expect(closedLaunchResponse.statusCode).toBe(201);
    expect(openLaunchResponse.statusCode).toBe(201);

    const closedLaunch = closedLaunchResponse.json<LaunchResponse>();
    const openLaunch = openLaunchResponse.json<LaunchResponse>();
    const storedClosedLaunch = store.launches.get(closedLaunch.id) as Launch;
    storedClosedLaunch.status = "closed";
    storedClosedLaunch.closedAt = "2026-05-30T00:00:00.000Z";
    store.artifacts.set(
      "closed-schedule-guard-preview",
      previewRetentionArtifact({
        id: "closed-schedule-guard-preview",
        launchId: closedLaunch.id,
        projectId: project.id,
        resultStatus: "passed",
        retentionClass: "passed-short",
        observedAt: "2026-05-01T00:00:00.000Z",
        content: "closed schedule guard token=schedule-guard-secret"
      })
    );
    store.artifacts.set(
      "open-schedule-guard-preview",
      previewRetentionArtifact({
        id: "open-schedule-guard-preview",
        launchId: openLaunch.id,
        projectId: project.id,
        resultStatus: "passed",
        retentionClass: "passed-short",
        observedAt: "2026-05-01T00:00:00.000Z",
        content: "open schedule guard token=schedule-guard-secret"
      })
    );
    const beforeStoreState = {
      artifacts: store.artifacts.size,
      uploadJobs: store.uploadJobs.size,
      launches: store.launches.size
    };

    const missingScopeResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${closedLaunch.id}/attachment-previews/retention/dry-run/schedule`,
      headers: {
        "x-testhistory-project-scope": project.id,
        authorization: "Bearer schedule-guard-secret"
      }
    });
    const wrongProjectResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${closedLaunch.id}/attachment-previews/retention/dry-run/schedule`,
      headers: {
        "x-testhistory-scopes": "artifacts:read",
        "x-testhistory-project-scope": "other-project",
        authorization: "Bearer schedule-guard-secret"
      }
    });
    const openLaunchScheduleResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${openLaunch.id}/attachment-previews/retention/dry-run/schedule`,
      headers: {
        "x-testhistory-scopes": "artifacts:read",
        "x-testhistory-project-scope": project.id
      }
    });
    const redactedActorResponse = await app.inject({
      method: "GET",
      url: `/api/v1/launches/${closedLaunch.id}/attachment-previews/retention/dry-run/schedule?limit=1&scheduleSize=1`,
      headers: {
        "x-testhistory-scopes": "artifacts:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "token=schedule-guard-secret"
      }
    });

    expect(missingScopeResponse.statusCode).toBe(403);
    expect(wrongProjectResponse.statusCode).toBe(403);
    expect(openLaunchScheduleResponse.statusCode).toBe(409);
    expect(redactedActorResponse.statusCode).toBe(200);
    expect(missingScopeResponse.json()).toEqual({
      error: "PermissionDeniedError",
      message: "API token is invalid",
      requiredScopes: ["artifacts:read"],
      projectId: project.id,
      redacted: true
    });
    expect(wrongProjectResponse.json()).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        requiredScopes: ["artifacts:read"],
        projectId: project.id,
        redacted: true
      })
    );
    expect(openLaunchScheduleResponse.json()).toEqual(
      expect.objectContaining({
        error: "LaunchStateError",
        requiredLaunchStatus: "closed",
        actualLaunchStatus: "open",
        redacted: true
      })
    );
    expect(
      redactedActorResponse.json<{
        scope: { actorId: string };
        access: { mutation: boolean; redacted: boolean };
        execution: { readOnly: boolean; deletionExecution: boolean; deleteRequestedCount: number };
        boundary: { closedLaunchScoped: boolean; rawMaterialReturned: boolean };
        page: { limit: number; returned: number; total: number };
        batches: unknown[];
        policy: { paginationRequired: boolean; redacted: boolean; mutationAllowed: boolean };
      }>()
    ).toEqual(
      expect.objectContaining({
        scope: expect.objectContaining({
          actorId: expect.stringMatching(/^redacted:[a-f0-9]{12}$/)
        }),
        access: expect.objectContaining({ mutation: false, redacted: true }),
        execution: expect.objectContaining({
          readOnly: true,
          deletionExecution: false,
          deleteRequestedCount: 0
        }),
        boundary: expect.objectContaining({ closedLaunchScoped: true, rawMaterialReturned: false }),
        page: expect.objectContaining({ limit: 1, returned: 1, total: 1 }),
        batches: [expect.objectContaining({ mutationAllowed: false, deletionExecution: false })],
        policy: expect.objectContaining({
          paginationRequired: true,
          redacted: true,
          mutationAllowed: false
        })
      })
    );

    const serialized = JSON.stringify([
      missingScopeResponse.json(),
      wrongProjectResponse.json(),
      openLaunchScheduleResponse.json(),
      redactedActorResponse.json()
    ]);
    expect(serialized).not.toContain("schedule-guard-secret");
    expect(serialized).not.toContain("open-schedule-guard-preview");
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
  });
});
