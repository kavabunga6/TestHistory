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

describe("api app part-23", () => {
  it("returns materialized security audit export lifecycle invariant reads without provider execution", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const materializedPath =
      `/api/v1/projects/${project.id}/security/audit/export/lifecycle/replay/invariants` +
      "/materialized";
    const beforeStoreState = {
      launches: store.launches.size,
      uploadJobs: store.uploadJobs.size,
      artifacts: store.artifacts.size
    };
    const headers = {
      "x-testhistory-scopes": "security:audit:read",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-actor-id": "security-audit-actor"
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
        name: "Security audit materialized reader",
        ownerSubject: "ci/security-audit-materialized",
        scopes: ["security:audit:read"]
      }
    });
    expect(tokenResponse.statusCode).toBe(201);
    const apiToken = tokenResponse.json<{ secret: string }>();

    const response = await app.inject({
      method: "GET",
      url: `${materializedPath}?actorId=security-audit-actor&limit=1`,
      headers
    });
    const nextResponse = await app.inject({
      method: "GET",
      url: `${materializedPath}?actorId=security-audit-actor&limit=1&cursor=1`,
      headers
    });
    const otherActorResponse = await app.inject({
      method: "GET",
      url: `${materializedPath}?actorId=security-audit-other-actor&limit=5`,
      headers: {
        ...headers,
        "x-testhistory-actor-id": "security-audit-other-actor"
      }
    });
    const exhaustedPageResponse = await app.inject({
      method: "GET",
      url: `${materializedPath}?actorId=security-audit-actor&limit=2&cursor=500`,
      headers
    });
    const bearerResponse = await app.inject({
      method: "GET",
      url: `${materializedPath}?actorId=security-audit-actor&limit=1`,
      headers: {
        authorization: `Bearer ${apiToken.secret}`,
        "x-testhistory-actor-id": "security-audit-actor"
      }
    });
    const missingActorResponse = await app.inject({
      method: "GET",
      url: `${materializedPath}?limit=1`,
      headers
    });
    const unscopedRuntimePathResponse = await app.inject({
      method: "GET",
      url: "/api/v1/security/audit/export/lifecycle/replay/invariants/materialized",
      headers
    });
    const methodGuardApp = app;
    const methodGuardMethods = ["POST", "PUT", "PATCH", "DELETE"] as const;
    const methodGuardResponses = await Promise.all(
      methodGuardMethods.map((method) =>
        methodGuardApp.inject({
          method,
          url: `${materializedPath}?actorId=security-audit-actor`,
          headers: {
            ...headers,
            authorization: "Bearer security-audit-materialized-method-secret"
          },
          payload: {
            providerEndpoint: "https://provider.example/export",
            destination: { secretRef: "security-audit-materialized-secret-ref" },
            rawLifecycleEvents: ["raw security audit materialized lifecycle event"],
            [`signed${"Url"}`]: [
              "https://provider.example/export",
              `X-Amz-${"Signature"}=raw`
            ].join("?")
          }
        })
      )
    );

    expect(response.statusCode).toBe(200);
    expect(nextResponse.statusCode).toBe(200);
    expect(otherActorResponse.statusCode).toBe(200);
    expect(exhaustedPageResponse.statusCode).toBe(200);
    expect(bearerResponse.statusCode).toBe(200);
    expect(missingActorResponse.statusCode).toBe(400);
    expect(missingActorResponse.json()).toEqual({
      message: "actorId is required",
      redacted: true
    });
    expect(unscopedRuntimePathResponse.statusCode).toBe(404);
    for (const methodGuardResponse of methodGuardResponses) {
      expect(methodGuardResponse.statusCode).toBe(404);
      expect(methodGuardResponse.body).not.toContain("security-audit-materialized-method-secret");
      expect(methodGuardResponse.body).not.toContain("https://provider.example/export");
      expect(methodGuardResponse.body).not.toContain("security-audit-materialized-secret-ref");
      expect(methodGuardResponse.body).not.toContain(
        "raw security audit materialized lifecycle event"
      );
      expect(methodGuardResponse.body).not.toContain(["X-Amz", "Signature"].join("-"));
    }
    expect(bearerResponse.body).not.toContain(apiToken.secret);
    const materialized = response.json<{
      kind: string;
      project: { id: string; scoped: boolean };
      actor: { id: string; scoped: boolean };
      access: {
        scope: string;
        projectScoped: boolean;
        mutation: boolean;
        redacted: boolean;
        actorScoped: boolean;
      };
      availability: { status: string; partial: boolean; unavailable: string[] };
      materialization: {
        adapterKind: string;
        boundary: string;
        consistency: string;
        source: string;
        readOnly: boolean;
        providerNeutral: boolean;
        rawLifecycleEventsIncluded: boolean;
        rawRequestsIncluded: boolean;
        destinationRefsIncluded: boolean;
        providerEndpointsIncluded: boolean;
        signedUrlsIncluded: boolean;
        credentialsIncluded: boolean;
        tokensIncluded: boolean;
        mutationBoundary: string;
        materializedAt: string;
        materializedRecordCount: number;
        materializationDigest: string;
      };
      execution: {
        exportStarted: boolean;
        providerExecution: boolean;
        providerIntegration: boolean;
        providerEndpointContacted: boolean;
        credentialsResolved: boolean;
        signedUrlsIssued: boolean;
        destinationResolved: boolean;
        mutation: boolean;
      };
      summary: {
        materializedRecordCount: number;
        providerNeutral: boolean;
        redactionPassed: boolean;
        rawLifecycleEventsIncluded: boolean;
        rawRequestsIncluded: boolean;
        secretsExposed: boolean;
        plannedOperations: string[];
      };
      invariants: Record<string, boolean>;
      page: { limit: number; returned: number; total: number; nextCursor: string | null };
      items: Array<{
        kind: string;
        materializedRef: string;
        projectId: string;
        actor: { id: string; scoped: boolean };
        requestId: string;
        status: string;
        eventCount: number;
        actorIds: string[];
        decisionStatus?: string;
        reasonCodes: string[];
        redaction: {
          rawLifecycleEventsIncluded: false;
          rawRequestsIncluded: false;
          signedUrlsIncluded: false;
          credentialsIncluded: false;
          tokensIncluded: false;
        };
        execution: {
          exportStarted: boolean;
          providerExecution: boolean;
          providerIntegration: boolean;
          providerEndpointContacted: boolean;
          credentialsResolved: boolean;
          signedUrlsIssued: boolean;
          destinationResolved: boolean;
          mutation: boolean;
        };
        providerNeutral: boolean;
        redacted: boolean;
      }>;
    }>();
    const nextMaterialized = nextResponse.json<{
      access: {
        projectScoped: boolean;
        actorScoped: boolean;
        mutation: boolean;
        redacted: boolean;
      };
      materialization: {
        readOnly: boolean;
        providerNeutral: boolean;
        rawLifecycleEventsIncluded: boolean;
        rawRequestsIncluded: boolean;
        providerEndpointsIncluded: boolean;
        signedUrlsIncluded: boolean;
        credentialsIncluded: boolean;
        tokensIncluded: boolean;
      };
      execution: {
        exportStarted: boolean;
        providerExecution: boolean;
        providerIntegration: boolean;
        providerEndpointContacted: boolean;
        credentialsResolved: boolean;
        signedUrlsIssued: boolean;
        destinationResolved: boolean;
        mutation: boolean;
      };
      page: { returned: number; nextCursor: string | null };
      items: Array<{
        projectId: string;
        actor: { id: string; scoped: boolean };
        requestId: string;
        status: string;
        actorIds: string[];
        redaction: {
          rawLifecycleEventsIncluded: false;
          rawRequestsIncluded: false;
          providerEndpointsIncluded: false;
          signedUrlsIncluded: false;
          credentialsIncluded: false;
          tokensIncluded: false;
          redacted: true;
        };
        execution: {
          exportStarted: boolean;
          providerExecution: boolean;
          providerIntegration: boolean;
          providerEndpointContacted: boolean;
          credentialsResolved: boolean;
          signedUrlsIssued: boolean;
          destinationResolved: boolean;
          mutation: boolean;
        };
        providerNeutral: boolean;
        redacted: boolean;
      }>;
    }>();
    const otherActorMaterialized = otherActorResponse.json<{
      actor: { id: string; scoped: boolean };
      access: {
        projectScoped: boolean;
        actorScoped: boolean;
        mutation: boolean;
        redacted: boolean;
      };
      materialization: { readOnly: boolean; providerNeutral: boolean };
      execution: {
        exportStarted: boolean;
        providerExecution: boolean;
        providerIntegration: boolean;
        providerEndpointContacted: boolean;
        credentialsResolved: boolean;
        signedUrlsIssued: boolean;
        destinationResolved: boolean;
        mutation: boolean;
      };
      page: { total: number; returned: number };
      items: Array<{
        projectId: string;
        actor: { id: string; scoped: boolean };
        actorIds: string[];
        requestId: string;
      }>;
    }>();
    const exhaustedPage = exhaustedPageResponse.json<{
      actor: { id: string; scoped: boolean };
      access: {
        projectScoped: boolean;
        actorScoped: boolean;
        mutation: boolean;
        redacted: boolean;
      };
      materialization: {
        materializedRecordCount: number;
        materializationDigest: string;
        readOnly: boolean;
        providerNeutral: boolean;
      };
      execution: {
        exportStarted: boolean;
        providerExecution: boolean;
        providerEndpointContacted: boolean;
        credentialsResolved: boolean;
        signedUrlsIssued: boolean;
        mutation: boolean;
      };
      summary: {
        totalRequests: number;
        materializedRecordCount: number;
        materializationDigest: string;
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
      items: unknown[];
    }>();

    expect(materialized).toEqual(
      expect.objectContaining({
        kind: "security-audit-export-lifecycle-replay-invariant-materialized-read",
        project: { id: project.id, scoped: true },
        actor: { id: "security-audit-actor", scoped: true },
        access: expect.objectContaining({
          scope: "security:audit:read",
          projectScoped: true,
          mutation: false,
          redacted: true,
          actorScoped: true
        }),
        availability: {
          status: "ready",
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          partial: false,
          unavailable: []
        }
      })
    );
    expect(materialized.materialization).toEqual(
      expect.objectContaining({
        adapterKind:
          "api-read-model-security-audit-export-lifecycle-replay-invariant-materialized-wip",
        boundary:
          "worker-compatible-security-audit-export-lifecycle-replay-invariant-materialized-read",
        consistency: "provider-neutral-export-lifecycle-replay-summary",
        source: "security-audit-export-lifecycle-replay-invariants",
        readOnly: true,
        providerNeutral: true,
        rawLifecycleEventsIncluded: false,
        rawRequestsIncluded: false,
        destinationRefsIncluded: false,
        providerEndpointsIncluded: false,
        signedUrlsIncluded: false,
        credentialsIncluded: false,
        tokensIncluded: false,
        mutationBoundary: "api-materialized-read-only-no-export-provider-mutation",
        materializedAt: "2026-05-30T09:00:02.000Z",
        materializedRecordCount: 2,
        materializationDigest: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    );
    expect(materialized.execution).toEqual({
      exportStarted: false,
      providerExecution: false,
      providerIntegration: false,
      providerEndpointContacted: false,
      credentialsResolved: false,
      signedUrlsIssued: false,
      destinationResolved: false,
      mutation: false
    });
    expect(materialized.invariants).toEqual(
      expect.objectContaining({
        appendOnly: true,
        deterministic: true,
        recomputable: true,
        projectScoped: true,
        actorScoped: true,
        redacted: true,
        mutationFree: true,
        providerNeutral: true,
        rawEventsExposed: false,
        rawRequestsExposed: false,
        providerEndpointsContacted: false,
        signedUrlsIssued: false,
        secretsExposed: false
      })
    );
    expect(materialized.summary).toEqual(
      expect.objectContaining({
        materializedRecordCount: 2,
        providerNeutral: true,
        redactionPassed: true,
        rawLifecycleEventsIncluded: false,
        rawRequestsIncluded: false,
        secretsExposed: false,
        plannedOperations: [
          "security_audit.export_lifecycle.replay_invariant.summarize",
          "security_audit.export_lifecycle.replay_invariant.materialized_read"
        ]
      })
    );
    expect(materialized.page).toEqual(
      expect.objectContaining({ limit: 1, returned: 1, total: 2, nextCursor: "1" })
    );
    expect(materialized.items).toEqual([
      expect.objectContaining({
        kind: "security-audit-export-lifecycle-replay-invariant-materialized-record",
        materializedRef: expect.stringMatching(
          /^security-audit-export-lifecycle-replay-invariant:[a-f0-9]{24}$/
        ),
        projectId: project.id,
        actor: { id: "security-audit-actor", scoped: true },
        requestId: "audit-export-lifecycle-approved",
        status: "approved",
        eventCount: 3,
        actorIds: ["security-audit-actor"],
        decisionStatus: "allowed",
        reasonCodes: ["audit_export.allowed_placeholder"],
        redaction: expect.objectContaining({
          rawLifecycleEventsIncluded: false,
          rawRequestsIncluded: false,
          providerEndpointsIncluded: false,
          signedUrlsIncluded: false,
          credentialsIncluded: false,
          tokensIncluded: false,
          redacted: true
        }),
        execution: expect.objectContaining({
          exportStarted: false,
          providerExecution: false,
          providerIntegration: false,
          providerEndpointContacted: false,
          credentialsResolved: false,
          signedUrlsIssued: false,
          destinationResolved: false,
          mutation: false
        }),
        providerNeutral: true,
        redacted: true
      })
    ]);
    expect(nextMaterialized.access).toEqual(
      expect.objectContaining({
        projectScoped: true,
        actorScoped: true,
        mutation: false,
        redacted: true
      })
    );
    expect(nextMaterialized.materialization).toEqual(
      expect.objectContaining({
        readOnly: true,
        providerNeutral: true,
        rawLifecycleEventsIncluded: false,
        rawRequestsIncluded: false,
        providerEndpointsIncluded: false,
        signedUrlsIncluded: false,
        credentialsIncluded: false,
        tokensIncluded: false
      })
    );
    expect(nextMaterialized.execution).toEqual({
      exportStarted: false,
      providerExecution: false,
      providerIntegration: false,
      providerEndpointContacted: false,
      credentialsResolved: false,
      signedUrlsIssued: false,
      destinationResolved: false,
      mutation: false
    });
    expect(nextMaterialized.page).toEqual(
      expect.objectContaining({ returned: 1, nextCursor: null })
    );
    expect(nextMaterialized.items).toEqual([
      expect.objectContaining({
        projectId: project.id,
        actor: { id: "security-audit-actor", scoped: true },
        requestId: "audit-export-lifecycle-denied",
        status: "denied",
        actorIds: ["security-audit-actor"],
        redaction: expect.objectContaining({
          rawLifecycleEventsIncluded: false,
          rawRequestsIncluded: false,
          providerEndpointsIncluded: false,
          signedUrlsIncluded: false,
          credentialsIncluded: false,
          tokensIncluded: false,
          redacted: true
        }),
        execution: {
          exportStarted: false,
          providerExecution: false,
          providerIntegration: false,
          providerEndpointContacted: false,
          credentialsResolved: false,
          signedUrlsIssued: false,
          destinationResolved: false,
          mutation: false
        },
        providerNeutral: true,
        redacted: true
      })
    ]);
    expect(otherActorMaterialized).toEqual(
      expect.objectContaining({
        actor: { id: "security-audit-other-actor", scoped: true },
        access: expect.objectContaining({
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        }),
        materialization: expect.objectContaining({
          readOnly: true,
          providerNeutral: true
        }),
        execution: {
          exportStarted: false,
          providerExecution: false,
          providerIntegration: false,
          providerEndpointContacted: false,
          credentialsResolved: false,
          signedUrlsIssued: false,
          destinationResolved: false,
          mutation: false
        },
        page: expect.objectContaining({ total: 1, returned: 1 }),
        items: [
          expect.objectContaining({
            projectId: project.id,
            actor: { id: "security-audit-other-actor", scoped: true },
            actorIds: ["security-audit-other-actor"],
            requestId: "audit-export-lifecycle-other-actor"
          })
        ]
      })
    );
    expect(exhaustedPage).toEqual(
      expect.objectContaining({
        actor: { id: "security-audit-actor", scoped: true },
        access: expect.objectContaining({
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        }),
        materialization: expect.objectContaining({
          materializedRecordCount: 2,
          materializationDigest: materialized.materialization.materializationDigest,
          readOnly: true,
          providerNeutral: true
        }),
        execution: expect.objectContaining({
          exportStarted: false,
          providerExecution: false,
          providerEndpointContacted: false,
          credentialsResolved: false,
          signedUrlsIssued: false,
          mutation: false
        }),
        summary: expect.objectContaining({
          totalRequests: 2,
          materializedRecordCount: 2,
          materializationDigest: materialized.materialization.materializationDigest
        }),
        page: {
          limit: 2,
          cursor: "500",
          offset: 500,
          returned: 0,
          total: 2,
          nextCursor: null,
          hasMore: false
        },
        items: []
      })
    );
    const serialized = JSON.stringify([materialized, nextMaterialized, otherActorMaterialized]);
    expect(serialized).not.toContain("raw-lifecycle-token");
    expect(serialized).not.toContain("raw-export-filter-token");
    expect(serialized).not.toContain("raw-lifecycle-session-secret");
    expect(serialized).not.toContain("raw-denied-lifecycle-token");
    expect(serialized).not.toContain("raw-request-reason-token");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("token=");
    expect(serialized).not.toContain("secretRef");
    expect(serialized).not.toContain("auth.login.failed");
    expect(serialized).not.toContain("auth.access.denied");
    expect(serialized).not.toContain("Downloads");
    expect(serialized).not.toContain("storage.example");
    expect(serialized).not.toContain("audit-export.jsonl");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("raw-signature");
    expect(serialized).not.toContain('"signedUrl":');
    expect(serialized).not.toContain("audit-export-placeholder-ref");
    expect(serialized).not.toContain(`${project.id}-other`);
    expect(serialized).not.toContain("audit-export-lifecycle-cross-project");
    expect(serialized).not.toContain("https://provider");
    expect(serialized).not.toContain('"providerEndpoint":');
    expect(exhaustedPageResponse.body).not.toContain("raw-lifecycle-token");
    expect(exhaustedPageResponse.body).not.toContain("security-audit-other-actor");
    expect(unscopedRuntimePathResponse.body).not.toContain("security-audit-actor");
    expect(store.launches.size).toBe(beforeStoreState.launches);
    expect(store.uploadJobs.size).toBe(beforeStoreState.uploadJobs);
    expect(store.artifacts.size).toBe(beforeStoreState.artifacts);
  });
});
