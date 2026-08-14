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

describe("api app access-visibility", () => {
  it("enforces project membership roles on access settings management", async () => {
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
            id: "bootstrap-owner",
            role: "owner",
            source: "manual",
            status: "active",
            subject: "project-owner",
            updatedAt: "2026-06-03T00:00:00.000Z"
          },
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Release Maintainer",
            id: "member-maintainer",
            role: "maintainer",
            source: "manual",
            status: "active",
            subject: "release-maintainer",
            updatedAt: "2026-06-03T00:00:00.000Z"
          },
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Audit Viewer",
            id: "member-viewer",
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
      url: `/api/v1/projects/${project.id}/settings/access`
    });
    const maintainerWriteResponse = await app.inject({
      headers: {
        "x-testhistory-actor-id": "release-maintainer",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-scopes": "settings:write"
      },
      method: "PATCH",
      payload: { visibility: "internal" },
      url: `/api/v1/projects/${project.id}/settings/access`
    });
    const viewerReadResponse = await app.inject({
      headers: {
        "x-testhistory-actor-id": "audit-viewer",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-scopes": "settings:read"
      },
      method: "GET",
      url: `/api/v1/projects/${project.id}/settings/access`
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

  it.each([
    {
      actorId: "admin",
      bearerLogin: { email: "admin", password: "admin" },
      method: "GET" as const,
      payload: undefined,
      scopes: "",
      expectedStatus: 200
    },
    {
      actorId: "project-owner",
      bearerLogin: undefined,
      method: "GET" as const,
      payload: undefined,
      scopes: "settings:read",
      expectedStatus: 200
    },
    {
      actorId: "release-maintainer",
      bearerLogin: undefined,
      method: "GET" as const,
      payload: undefined,
      scopes: "settings:read",
      expectedStatus: 200
    },
    {
      actorId: "project-owner",
      bearerLogin: undefined,
      method: "PATCH" as const,
      payload: { visibility: "internal" },
      scopes: "settings:write",
      expectedStatus: 200
    },
    {
      actorId: "release-maintainer",
      bearerLogin: undefined,
      method: "PATCH" as const,
      payload: { visibility: "internal" },
      scopes: "settings:write",
      expectedStatus: 403
    },
    {
      actorId: "audit-viewer",
      bearerLogin: undefined,
      method: "GET" as const,
      payload: undefined,
      scopes: "settings:read",
      expectedStatus: 403
    },
    {
      actorId: "anonymous",
      bearerLogin: undefined,
      method: "GET" as const,
      payload: undefined,
      scopes: "",
      expectedStatus: 403
    }
  ])(
    "applies project settings access contract for $actorId $method with status $expectedStatus",
    async ({ actorId, bearerLogin, expectedStatus, method, payload, scopes }) => {
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
              id: "settings-owner",
              role: "owner",
              source: "manual",
              status: "active",
              subject: "project-owner",
              updatedAt: "2026-06-03T00:00:00.000Z"
            },
            {
              createdAt: "2026-06-03T00:00:00.000Z",
              displayName: "Release Maintainer",
              id: "settings-maintainer",
              role: "maintainer",
              source: "manual",
              status: "active",
              subject: "release-maintainer",
              updatedAt: "2026-06-03T00:00:00.000Z"
            },
            {
              createdAt: "2026-06-03T00:00:00.000Z",
              displayName: "Audit Viewer",
              id: "settings-viewer",
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
      let authorization: string | undefined;
      if (bearerLogin !== undefined) {
        const loginResponse = await app.inject({
          method: "POST",
          payload: bearerLogin,
          url: "/api/v1/auth/login"
        });
        authorization = `Bearer ${loginResponse.json<{ session: { token: string } }>().session.token}`;
      }

      const response = await app.inject({
        headers: {
          ...(authorization !== undefined ? { authorization } : {}),
          ...(actorId !== "anonymous" ? { "x-testhistory-actor-id": actorId } : {}),
          ...(actorId !== "anonymous" ? { "x-testhistory-project-scope": project.id } : {}),
          ...(scopes.length > 0 ? { "x-testhistory-scopes": scopes } : {})
        },
        method,
        ...(payload !== undefined ? { payload } : {}),
        url: `/api/v1/projects/${project.id}/settings/access`
      });

      expect(membershipResponse.statusCode).toBe(200);
      expect(response.statusCode).toBe(expectedStatus);
      if (expectedStatus === 200) {
        expect(response.json()).toEqual(
          expect.objectContaining({
            kind: "project-access-settings",
            customFieldMappings: expect.any(Array),
            integrationProviders: expect.any(Array),
            project: expect.objectContaining({ id: project.id }),
            visibilityPolicies: expect.any(Array)
          })
        );
      } else {
        expect(response.json()).toEqual(
          expect.objectContaining({
            error: "PermissionDeniedError",
            projectId: project.id,
            redacted: true
          })
        );
      }
    }
  );

  it.each([
    {
      name: "integrations and fields",
      payload: {
        customFieldMappings: [
          {
            field: "requirement",
            id: "requirement",
            required: false,
            source: "custom_field:Requirement",
            updatedAt: "2026-06-03T00:00:00.000Z"
          }
        ],
        integrationProviders: [
          {
            baseUrl: "https://jira.example.test/browse/",
            enabled: true,
            encodeSuffix: true,
            id: "jira",
            name: "Jira",
            preset: "jira",
            source: { kind: "issue", matchMode: "all" },
            suffixTemplate: "{value}",
            updatedAt: "2026-06-03T00:00:00.000Z"
          },
          {
            baseUrl: "https://github.example.test/org/repo/issues/",
            enabled: true,
            encodeSuffix: true,
            id: "github",
            name: "GitHub Issues",
            preset: "github",
            source: { kind: "label", matchMode: "regex", name: "issue", regex: "GH-(\\d+)" },
            suffixTemplate: "{value}",
            updatedAt: "2026-06-03T00:00:00.000Z"
          }
        ]
      },
      expected: {
        customFieldMappings: [
          expect.objectContaining({ field: "requirement", source: "custom_field:Requirement" })
        ],
        integrationProviders: [
          expect.objectContaining({ id: "jira", preset: "jira" }),
          expect.objectContaining({ id: "github", preset: "github" })
        ]
      }
    },
    {
      name: "visibility policies",
      payload: {
        visibility: "public-demo",
        visibilityPolicies: [
          {
            description: "Issue links can render, secrets cannot.",
            id: "integration-link-redaction",
            label: "Integration link redaction",
            mode: "enabled",
            owner: "Security",
            updatedAt: "2026-06-03T00:00:00.000Z"
          }
        ]
      },
      expected: {
        project: expect.objectContaining({ visibility: "public-demo" }),
        visibilityPolicies: [
          expect.objectContaining({ id: "integration-link-redaction", mode: "enabled" })
        ]
      }
    }
  ])("persists project access settings section: $name", async ({ expected, payload }) => {
    app = await createApiApp();
    const project = await createProject(app);
    const ownerHeaders = {
      "x-testhistory-actor-id": "project-owner",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-scopes": "settings:read settings:write"
    };

    const patchResponse = await app.inject({
      headers: ownerHeaders,
      method: "PATCH",
      payload,
      url: `/api/v1/projects/${project.id}/settings/access`
    });
    const readResponse = await app.inject({
      headers: ownerHeaders,
      method: "GET",
      url: `/api/v1/projects/${project.id}/settings/access`
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(readResponse.statusCode).toBe(200);
    expect(readResponse.json()).toEqual(expect.objectContaining(expected));
  });

  it.each([
    {
      name: "plaintext provider URL",
      payload: {
        integrationProviders: [
          {
            baseUrl: "http://jira.example.test/browse/",
            enabled: true,
            encodeSuffix: true,
            id: "jira",
            name: "Jira",
            preset: "jira",
            source: { kind: "issue", matchMode: "all" },
            suffixTemplate: "{value}",
            updatedAt: "2026-06-03T00:00:00.000Z"
          }
        ]
      },
      message: "integration provider baseUrl must use https"
    },
    {
      name: "credential provider URL",
      payload: {
        integrationProviders: [
          {
            baseUrl: "https://user:password@jira.example.test/browse/",
            enabled: true,
            encodeSuffix: true,
            id: "jira",
            name: "Jira",
            preset: "jira",
            source: { kind: "issue", matchMode: "all" },
            suffixTemplate: "{value}",
            updatedAt: "2026-06-03T00:00:00.000Z"
          }
        ]
      },
      message: "integration provider baseUrl must not include credentials"
    },
    {
      name: "token query provider URL",
      payload: {
        integrationProviders: [
          {
            baseUrl: "https://jira.example.test/browse/?token=secret-value",
            enabled: true,
            encodeSuffix: true,
            id: "jira",
            name: "Jira",
            preset: "jira",
            source: { kind: "issue", matchMode: "all" },
            suffixTemplate: "{value}",
            updatedAt: "2026-06-03T00:00:00.000Z"
          }
        ]
      },
      message: "integration provider baseUrl must not include token-like query parameters"
    },
    {
      name: "suffix without value",
      payload: {
        integrationProviders: [
          {
            baseUrl: "https://jira.example.test/browse/",
            enabled: true,
            encodeSuffix: true,
            id: "jira",
            name: "Jira",
            preset: "jira",
            source: { kind: "issue", matchMode: "all" },
            suffixTemplate: "static",
            updatedAt: "2026-06-03T00:00:00.000Z"
          }
        ]
      },
      message: "integration provider suffixTemplate must include {value}"
    },
    {
      name: "invalid regex",
      payload: {
        integrationProviders: [
          {
            baseUrl: "https://jira.example.test/browse/",
            enabled: true,
            encodeSuffix: true,
            id: "jira",
            name: "Jira",
            preset: "jira",
            source: { kind: "issue", matchMode: "regex", regex: "[" },
            suffixTemplate: "{value}",
            updatedAt: "2026-06-03T00:00:00.000Z"
          }
        ]
      },
      message: "integration provider regex must compile"
    },
    {
      name: "blank member identity",
      payload: {
        memberships: [
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: " ",
            id: "blank-member",
            role: "owner",
            source: "manual",
            status: "active",
            subject: " ",
            updatedAt: "2026-06-03T00:00:00.000Z"
          }
        ]
      },
      message: "membership subject and displayName are required"
    }
  ])("validates project settings patch: $name", async ({ message, payload }) => {
    app = await createApiApp();
    const project = await createProject(app);

    const response = await app.inject({
      headers: {
        "x-testhistory-actor-id": "project-owner",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-scopes": "settings:write"
      },
      method: "PATCH",
      payload,
      url: `/api/v1/projects/${project.id}/settings/access`
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(expect.objectContaining({ message, redacted: true }));
    expect(response.body).not.toContain("secret-value");
    expect(response.body).not.toContain("password");
  });

  it.each([
    {
      name: "owner can read artifact settings",
      actorId: "project-owner",
      method: "GET" as const,
      payload: undefined,
      scopes: "settings:read",
      expectedStatus: 200
    },
    {
      name: "owner can patch artifact settings",
      actorId: "project-owner",
      method: "PATCH" as const,
      payload: { attachmentRetentionDays: 30, cleanupGraceDays: 2 },
      scopes: "settings:write",
      expectedStatus: 200
    },
    {
      name: "maintainer can read artifact settings",
      actorId: "release-maintainer",
      method: "GET" as const,
      payload: undefined,
      scopes: "settings:read",
      expectedStatus: 200
    },
    {
      name: "maintainer cannot patch artifact settings",
      actorId: "release-maintainer",
      method: "PATCH" as const,
      payload: { attachmentRetentionDays: 30 },
      scopes: "settings:write",
      expectedStatus: 403
    },
    {
      name: "anonymous cannot read artifact settings",
      actorId: "anonymous",
      method: "GET" as const,
      payload: undefined,
      scopes: "",
      expectedStatus: 403
    }
  ])("$name", async ({ actorId, expectedStatus, method, payload, scopes }) => {
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
          }
        ]
      },
      url: `/api/v1/projects/${project.id}/settings/access`
    });

    const response = await app.inject({
      headers: {
        ...(actorId !== "anonymous" ? { "x-testhistory-actor-id": actorId } : {}),
        ...(actorId !== "anonymous" ? { "x-testhistory-project-scope": project.id } : {}),
        ...(scopes.length > 0 ? { "x-testhistory-scopes": scopes } : {})
      },
      method,
      ...(payload !== undefined ? { payload } : {}),
      url: `/api/v1/projects/${project.id}/settings/artifacts`
    });

    expect(membershipResponse.statusCode).toBe(200);
    expect(response.statusCode).toBe(expectedStatus);
    if (expectedStatus === 200) {
      expect(response.json()).toEqual(
        expect.objectContaining({
          kind: "project-artifact-settings",
          projectId: project.id,
          retention: expect.any(Object)
        })
      );
    } else {
      expect(response.json()).toEqual(
        expect.objectContaining({
          error: "PermissionDeniedError",
          projectId: project.id,
          redacted: true
        })
      );
    }
  });

  it.each([
    {
      name: "unknown project settings read",
      method: "GET" as const,
      payload: undefined,
      url: "/api/v1/projects/missing-project/settings/access"
    },
    {
      name: "unknown artifact settings patch",
      method: "PATCH" as const,
      payload: { attachmentRetentionDays: 30 },
      url: "/api/v1/projects/missing-project/settings/artifacts"
    },
    {
      name: "unknown project token create",
      method: "POST" as const,
      payload: { name: "CI", ownerSubject: "ci", scopes: ["settings:read"] },
      url: "/api/v1/projects/missing-project/settings/access/tokens"
    },
    {
      name: "unknown project token revoke",
      method: "DELETE" as const,
      payload: undefined,
      url: "/api/v1/projects/missing-project/settings/access/tokens/missing-token"
    }
  ])("guards missing project mutation/read path: $name", async ({ method, payload, url }) => {
    app = await createApiApp();

    const response = await app.inject({
      headers: {
        "x-testhistory-actor-id": "project-owner",
        "x-testhistory-project-scope": "missing-project",
        "x-testhistory-scopes": "settings:read settings:write"
      },
      method,
      ...(payload !== undefined ? { payload } : {}),
      url
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Project not found" });
  });
});
