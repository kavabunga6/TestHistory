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

describe("api app part-24", () => {
  it("denies security audit export lifecycle invariant reads without leaking actor or provider data", async () => {
    app = await createApiApp();
    const project = await createProject(app);

    const missingScopeResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/projects/${project.id}/security/audit/export/lifecycle/replay/invariants` +
        "?actorId=security-audit-actor",
      headers: {
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "security-audit-actor",
        authorization: "Bearer lifecycle-denied-token"
      }
    });
    const wrongActorResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/projects/${project.id}/security/audit/export/lifecycle/replay/invariants` +
        "?actorId=security-audit-actor",
      headers: {
        "x-testhistory-scopes": "security:audit:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "other-actor",
        authorization: "Bearer lifecycle-denied-token"
      }
    });
    const materializedMissingScopeResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/projects/${project.id}/security/audit/export/lifecycle/replay/invariants/materialized` +
        "?actorId=security-audit-actor",
      headers: {
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "security-audit-actor",
        authorization: "Bearer lifecycle-denied-token"
      }
    });
    const materializedWrongActorResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/projects/${project.id}/security/audit/export/lifecycle/replay/invariants/materialized` +
        "?actorId=security-audit-actor",
      headers: {
        "x-testhistory-scopes": "security:audit:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "other-actor",
        authorization: "Bearer lifecycle-denied-token"
      }
    });
    const materializedWrongProjectResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/projects/${project.id}/security/audit/export/lifecycle/replay/invariants/materialized` +
        "?actorId=security-audit-actor",
      headers: {
        "x-testhistory-scopes": "security:audit:read",
        "x-testhistory-project-scope": "other-security-audit-project",
        "x-testhistory-actor-id": "security-audit-actor",
        authorization: "Bearer lifecycle-denied-token"
      }
    });

    expect(missingScopeResponse.statusCode).toBe(403);
    expect(wrongActorResponse.statusCode).toBe(403);
    expect(materializedMissingScopeResponse.statusCode).toBe(403);
    expect(materializedWrongActorResponse.statusCode).toBe(403);
    expect(materializedWrongProjectResponse.statusCode).toBe(403);
    expect(missingScopeResponse.json()).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        message: "API token is invalid",
        requiredScopes: ["security:audit:read"],
        projectId: project.id,
        redacted: true
      })
    );
    expect(wrongActorResponse.json()).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        message: "API token is invalid",
        requiredScopes: ["security:audit:read"],
        projectId: project.id,
        redacted: true
      })
    );
    expect(materializedMissingScopeResponse.json()).toEqual(
      expect.objectContaining({
        kind: "security-audit-export-lifecycle-replay-invariant-materialized-read",
        error: "PermissionDeniedError",
        message: "API token is invalid",
        requiredScopes: ["security:audit:read"],
        projectId: project.id,
        redacted: true,
        availability: expect.objectContaining({
          status: "denied",
          reason: "invalid_token",
          unavailable: ["security-audit-export-lifecycle-replay-invariant-materialized-read"]
        })
      })
    );
    expect(materializedWrongActorResponse.json()).toEqual(
      expect.objectContaining({
        kind: "security-audit-export-lifecycle-replay-invariant-materialized-read",
        error: "PermissionDeniedError",
        message: "API token is invalid",
        requiredScopes: ["security:audit:read"],
        projectId: project.id,
        redacted: true,
        availability: expect.objectContaining({
          status: "denied",
          reason: "invalid_token",
          unavailable: ["security-audit-export-lifecycle-replay-invariant-materialized-read"]
        })
      })
    );
    expect(materializedWrongProjectResponse.json()).toEqual(
      expect.objectContaining({
        kind: "security-audit-export-lifecycle-replay-invariant-materialized-read",
        error: "PermissionDeniedError",
        message: "API token is invalid",
        requiredScopes: ["security:audit:read"],
        projectId: project.id,
        redacted: true,
        availability: expect.objectContaining({
          status: "denied",
          reason: "invalid_token",
          unavailable: ["security-audit-export-lifecycle-replay-invariant-materialized-read"]
        })
      })
    );
    const deniedSerialized = JSON.stringify([
      missingScopeResponse.json(),
      wrongActorResponse.json(),
      materializedMissingScopeResponse.json(),
      materializedWrongActorResponse.json(),
      materializedWrongProjectResponse.json()
    ]);
    expect(deniedSerialized).not.toContain("lifecycle-denied-token");
    expect(deniedSerialized).not.toContain("security-audit-actor");
    expect(deniedSerialized).not.toContain("other-security-audit-project");
    expect(deniedSerialized).not.toContain("providerEndpoint");
    expect(deniedSerialized).not.toContain("providerExecution");
    expect(deniedSerialized).not.toContain("provider.example");
    expect(deniedSerialized).not.toContain("signedUrl");
    expect(deniedSerialized).not.toContain("token=");

    const staticOpenApi = readFileSync(
      new URL("../../../docs/openapi/openapi.yaml", import.meta.url),
      "utf8"
    );
    expect(staticOpenApi).toContain(
      "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants:"
    );
    expect(staticOpenApi).toContain(
      "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized:"
    );
    expect(staticOpenApi).toContain(
      "operationId: readSecurityAuditExportLifecycleReplayInvariants"
    );
    expect(staticOpenApi).toContain(
      "operationId: readSecurityAuditExportLifecycleReplayInvariantMaterialized"
    );
    expect(staticOpenApi).toContain("SecurityAuditExportLifecycleReplayInvariantRead");
    expect(staticOpenApi).toContain("SecurityAuditExportLifecycleReplayInvariantMaterializedRead");
    const materializedOpenApiPath =
      "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized:";
    expect(staticOpenApi.match(new RegExp(materializedOpenApiPath, "g"))).toHaveLength(1);
    const materializedOpenApiStart = staticOpenApi.indexOf(materializedOpenApiPath);
    const nextPathStart = staticOpenApi.indexOf("\n  /", materializedOpenApiStart + 1);
    const materializedOpenApiSection = staticOpenApi.slice(materializedOpenApiStart, nextPathStart);
    expect(materializedOpenApiSection).toContain("\n    get:");
    expect(materializedOpenApiSection).not.toContain("\n    post:");
    expect(materializedOpenApiSection).not.toContain("\n    put:");
    expect(materializedOpenApiSection).not.toContain("\n    patch:");
    expect(materializedOpenApiSection).not.toContain("\n    delete:");
    expect(staticOpenApi).not.toContain(
      "/api/v1/security/audit/export/lifecycle/replay/invariants/materialized:"
    );
    expect(staticOpenApi).not.toContain(
      "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized/execute:"
    );
  });

  it("keeps the materialized security audit export OpenAPI surface provider-neutral and read-only", async () => {
    const staticOpenApi = readFileSync(
      new URL("../../../docs/openapi/openapi.yaml", import.meta.url),
      "utf8"
    );
    const materializedOpenApiPath =
      "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized:";
    const materializedOpenApiStart = staticOpenApi.indexOf(materializedOpenApiPath);
    expect(materializedOpenApiStart).toBeGreaterThanOrEqual(0);
    const nextPathStart = staticOpenApi.indexOf("\n  /", materializedOpenApiStart + 1);
    const materializedOpenApiSection = staticOpenApi.slice(materializedOpenApiStart, nextPathStart);
    const forbiddenPathFragments = [
      "/api/v1/security/audit/export/lifecycle/replay/invariants/materialized:",
      "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized/execute:",
      "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized/refresh:",
      "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized/provider:",
      "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized/destination:"
    ];
    const forbiddenOperationFragments = [
      "operationId: execute",
      "operationId: refresh",
      "operationId: createSecurityAuditExport",
      "operationId: deleteSecurityAuditExport",
      "operationId: resolveSecurityAuditExportDestination"
    ];
    const providerNeutralMarkers = [
      "project and actor scoped",
      "provider-neutral",
      "redacted",
      "paginated",
      "mutation-free",
      "never starts exports",
      "provider endpoints",
      "signed URLs",
      "raw lifecycle events",
      "required: true",
      "name: actorId",
      "name: X-TestHistory-Scopes",
      "name: X-TestHistory-Project-Scope",
      "name: X-TestHistory-Actor-Id",
      "SecurityAuditExportLifecycleReplayInvariantMaterializedRead",
      "SecurityAuditExportLifecycleReplayInvariantMaterializedDenied"
    ];

    expect(staticOpenApi.match(new RegExp(materializedOpenApiPath, "g"))).toHaveLength(1);
    expect(materializedOpenApiSection.match(/\n    get:/g)).toHaveLength(1);
    for (const method of ["post", "put", "patch", "delete"]) {
      expect(materializedOpenApiSection).not.toContain(`\n    ${method}:`);
    }
    for (const marker of providerNeutralMarkers) {
      expect(materializedOpenApiSection).toContain(marker);
    }
    for (const fragment of forbiddenPathFragments) {
      expect(staticOpenApi).not.toContain(fragment);
    }
    for (const fragment of forbiddenOperationFragments) {
      expect(materializedOpenApiSection).not.toContain(fragment);
    }
    expect(staticOpenApi).toContain(
      "enum: [api-materialized-read-only-no-export-provider-mutation]"
    );
    expect(staticOpenApi).toContain(
      "worker-compatible-security-audit-export-lifecycle-replay-invariant-materialized-read"
    );
    expect(staticOpenApi).toContain(
      "security_audit.export_lifecycle.replay_invariant.materialized_read"
    );
    expect(staticOpenApi).not.toContain("security_audit.export_lifecycle.provider_execute");
    expect(staticOpenApi).not.toContain("security_audit.export_lifecycle.destination_resolve");
  });

  it("permission-checks security audit reads without leaking requested credentials", async () => {
    app = await createApiApp();
    const project = await createProject(app);

    const missingScopeResponse = await app.inject({
      method: "GET",
      url: `/api/v1/security/audit?projectId=${project.id}`,
      headers: {
        "x-testhistory-project-scope": project.id,
        authorization: "Bearer redact-me-denied"
      }
    });
    const wrongProjectResponse = await app.inject({
      method: "GET",
      url: `/api/v1/security/audit?projectId=${project.id}`,
      headers: {
        "x-testhistory-scopes": "security:audit:read",
        "x-testhistory-project-scope": "other-project",
        authorization: "Bearer redact-me-denied"
      }
    });

    expect(missingScopeResponse.statusCode).toBe(403);
    expect(wrongProjectResponse.statusCode).toBe(403);
    expect(missingScopeResponse.json()).toEqual({
      error: "PermissionDeniedError",
      message: "API token is invalid",
      requiredScopes: ["security:audit:read"],
      projectId: project.id,
      redacted: true
    });
    expect(wrongProjectResponse.json()).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        requiredScopes: ["security:audit:read"],
        projectId: project.id,
        redacted: true
      })
    );
    expect(JSON.stringify(missingScopeResponse.json())).not.toContain("redact-me-denied");
    expect(JSON.stringify(wrongProjectResponse.json())).not.toContain("redact-me-denied");
  });
});
