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

describe("api app health-auth-settings", () => {
  it("reports health", async () => {
    app = await createApiApp();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "testhistory-api",
      persistence: {
        driver: "memory",
        migrated: true,
        migrationVersion: "memory",
        writable: true
      }
    });
  });

  it("advertises implemented MCP tools and static planned schemas", async () => {
    app = await createApiApp();

    const manifestResponse = await app.inject({
      method: "GET",
      url: "/api/v1/mcp/manifest"
    });
    const capabilitiesResponse = await app.inject({
      method: "GET",
      url: "/api/v1/capabilities"
    });

    expect(manifestResponse.statusCode).toBe(200);
    expect(capabilitiesResponse.statusCode).toBe(200);

    const manifest = manifestResponse.json<{
      version: string;
      tools: string[];
      toolCatalog: Array<{ name: string; mode: string; deprecated?: boolean }>;
      auth: {
        noSecretsInManifest: true;
        capabilities: Array<{
          name: string;
          access: "anonymous" | "rest-authorized" | "unsupported";
          requiredScopes: string[];
          restParity?: { method: string; path: string };
        }>;
        unsupported: Array<{ name: string; access: string; requiredScopes: string[] }>;
      };
      plannedStatic: { schemaNames: string[]; note: string };
    }>();
    const capabilities = capabilitiesResponse.json<{
      mcp: { tools: string[] };
      openapiJson: string;
      swagger: string;
    }>();

    expect(manifest.tools).toEqual(capabilities.mcp.tools);
    expect(capabilities.swagger).toBe("/docs");
    expect(capabilities.openapiJson).toBe("/docs/json");
    const advertisedOpenApiResponse = await app.inject({
      method: "GET",
      url: capabilities.openapiJson
    });
    expect(advertisedOpenApiResponse.statusCode).toBe(200);
    expect(advertisedOpenApiResponse.headers["content-type"]).toContain("application/json");
    expect(advertisedOpenApiResponse.json()).toEqual(
      expect.objectContaining({
        openapi: expect.stringMatching(/^3\./),
        info: expect.objectContaining({ title: "TestHistory API" })
      })
    );
    const staticOpenApi = await readFile(
      new URL("../../../docs/openapi/openapi.yaml", import.meta.url),
      "utf8"
    );
    expect(staticOpenApi).toContain("operationId: getRuntimeOpenApiJson");
    expect(staticOpenApi).toContain("/docs/json:");
    expect(manifest.tools).toEqual(
      expect.arrayContaining([
        "testhistory.discovery",
        "testhistory.test-case.get",
        "testhistory.test-result.get",
        "testhistory.upload.policy"
      ])
    );
    expect(manifest.toolCatalog).toContainEqual({
      name: "testhistory.test-cases.list",
      mode: "live-api",
      deprecated: true
    });
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.auth.noSecretsInManifest).toBe(true);
    expect(manifest.auth.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "testhistory.test-case.history",
          access: "rest-authorized",
          requiredScopes: ["test-cases:read"],
          restParity: { method: "GET", path: "/api/v1/test-cases/{testCaseId}/history" }
        }),
        expect.objectContaining({
          name: "testhistory.launch.quality-gate",
          requiredScopes: ["quality-gates:evaluate"]
        })
      ])
    );
    expect(manifest.auth.unsupported).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "testhistory.artifacts.read",
          access: "unsupported",
          requiredScopes: ["artifacts:read"]
        })
      ])
    );
    expect(JSON.stringify(manifest.auth)).not.toContain("replace-with");
    expect(JSON.stringify(manifest.auth)).not.toContain("token=");
    expect(manifest.plannedStatic.schemaNames).toEqual([
      "test-case.mutation",
      "shared-step.mutation",
      "mute.mutation"
    ]);
    expect(manifest.tools).not.toEqual(
      expect.arrayContaining(["testhistory.test-case.create", "testhistory.mute.create"])
    );
  });

  it("creates projects", async () => {
    app = await createApiApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      payload: { key: "SHOP", name: "Shop" }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<ProjectResponse>()).toEqual(
      expect.objectContaining({
        key: "SHOP",
        name: "Shop"
      })
    );
  });

  it("rejects anonymous delete requests before route mutation logic", async () => {
    app = await createApiApp();

    const response = await app.inject({
      method: "DELETE",
      url: "/api/v1/dashboards/missing-dashboard"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(
      expect.objectContaining({
        error: "AuthenticationRequiredError",
        redacted: true
      })
    );
  });

  it("registers users, logs in, shows current user, and manages personal API tokens", async () => {
    app = await createApiApp();

    const adminLoginResponse = await app.inject({
      method: "POST",
      payload: {
        email: "admin",
        password: "admin"
      },
      url: "/api/v1/auth/login"
    });
    const userLoginResponse = await app.inject({
      method: "POST",
      payload: {
        email: "user",
        password: "user"
      },
      url: "/api/v1/auth/login"
    });
    const registerResponse = await app.inject({
      method: "POST",
      payload: {
        email: "qa.lead@example.test",
        name: "QA Lead",
        password: "correct-password"
      },
      url: "/api/v1/auth/register"
    });
    const registered = registerResponse.json<{
      session: { token: string };
      user: { email: string; id: string; role: string };
    }>();
    const duplicateResponse = await app.inject({
      method: "POST",
      payload: {
        email: "QA.LEAD@example.test",
        name: "QA Lead",
        password: "correct-password"
      },
      url: "/api/v1/auth/register"
    });
    const loginResponse = await app.inject({
      method: "POST",
      payload: {
        email: "qa.lead@example.test",
        password: "correct-password"
      },
      url: "/api/v1/auth/login"
    });
    const loggedIn = loginResponse.json<{ session: { token: string } }>();
    const meResponse = await app.inject({
      headers: { authorization: `Bearer ${loggedIn.session.token}` },
      method: "GET",
      url: "/api/v1/auth/me"
    });
    const tokenCreateResponse = await app.inject({
      headers: { authorization: `Bearer ${loggedIn.session.token}` },
      method: "POST",
      payload: {
        name: "Local CLI",
        scopes: ["profile:read", "tokens:read", "tokens:write"]
      },
      url: "/api/v1/auth/tokens"
    });
    const createdToken = tokenCreateResponse.json<{
      secret: string;
      token: { id: string; prefix: string; status: string };
    }>();
    const tokenListResponse = await app.inject({
      headers: { authorization: `Bearer ${loggedIn.session.token}` },
      method: "GET",
      url: "/api/v1/auth/tokens"
    });
    const personalTokenMeResponse = await app.inject({
      headers: { authorization: `Bearer ${createdToken.secret}` },
      method: "GET",
      url: "/api/v1/auth/me"
    });
    const revokeResponse = await app.inject({
      headers: { authorization: `Bearer ${loggedIn.session.token}` },
      method: "DELETE",
      url: `/api/v1/auth/tokens/${createdToken.token.id}`
    });

    expect(adminLoginResponse.statusCode).toBe(200);
    expect(adminLoginResponse.json()).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ email: "admin", role: "admin" })
      })
    );
    expect(userLoginResponse.statusCode).toBe(200);
    expect(userLoginResponse.json()).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ email: "user", role: "user" })
      })
    );
    expect(registerResponse.statusCode).toBe(201);
    expect(registered.user).toEqual(
      expect.objectContaining({
        email: "qa.lead@example.test",
        role: "user"
      })
    );
    expect(registered.session.token).toMatch(/^ts_session_/);
    expect(duplicateResponse.statusCode).toBe(409);
    expect(loginResponse.statusCode).toBe(200);
    expect(meResponse.json()).toEqual(
      expect.objectContaining({
        auth: { method: "session" },
        user: expect.objectContaining({ id: registered.user.id, email: "qa.lead@example.test" })
      })
    );
    expect(tokenCreateResponse.statusCode).toBe(201);
    expect(createdToken.secret).toMatch(/^tu_live_/);
    expect(createdToken.token.prefix).toMatch(/^tu_live_/);
    expect(JSON.stringify(createdToken.token)).not.toContain(createdToken.secret);
    expect(JSON.stringify(createdToken.token)).not.toContain("secretHash");
    expect(tokenListResponse.statusCode).toBe(200);
    expect(JSON.stringify(tokenListResponse.json())).not.toContain(createdToken.secret);
    expect(personalTokenMeResponse.statusCode).toBe(200);
    expect(personalTokenMeResponse.json()).toEqual(
      expect.objectContaining({
        auth: { method: "personal-token" },
        user: expect.objectContaining({ email: "qa.lead@example.test" })
      })
    );
    expect(revokeResponse.statusCode).toBe(200);
    expect(revokeResponse.json()).toEqual(
      expect.objectContaining({
        token: expect.objectContaining({ id: createdToken.token.id, status: "revoked" })
      })
    );
  });

  it.each([
    {
      method: "GET" as const,
      url: "/api/v1/auth/me",
      payload: undefined,
      expectedStatus: 401
    },
    {
      method: "GET" as const,
      url: "/api/v1/auth/tokens",
      payload: undefined,
      expectedStatus: 401
    },
    {
      method: "POST" as const,
      url: "/api/v1/auth/tokens",
      payload: { name: "Blocked token", scopes: ["profile:read"] },
      expectedStatus: 401
    },
    {
      method: "DELETE" as const,
      url: "/api/v1/auth/tokens/missing-token",
      payload: undefined,
      expectedStatus: 401
    },
    {
      method: "POST" as const,
      url: "/api/v1/auth/login",
      payload: { email: "admin", password: "wrong-password" },
      expectedStatus: 401
    },
    {
      method: "POST" as const,
      url: "/api/v1/auth/register",
      payload: { email: "not-an-email", name: "Q", password: "short" },
      expectedStatus: 400
    }
  ])(
    "guards auth endpoint $method $url with status $expectedStatus",
    async ({ expectedStatus, method, payload, url }) => {
      app = await createApiApp();

      const response = await app.inject({
        method,
        url,
        ...(payload !== undefined ? { payload } : {})
      });

      expect(response.statusCode).toBe(expectedStatus);
      expect(response.json()).toEqual(expect.objectContaining({ redacted: true }));
      expect(response.body).not.toContain("wrong-password");
    }
  );

  it("requires profile:read personal token scope for auth sessions", async () => {
    app = await createApiApp();

    const loginResponse = await app.inject({
      method: "POST",
      payload: { email: "user", password: "user" },
      url: "/api/v1/auth/login"
    });
    const session = loginResponse.json<{ session: { token: string } }>();
    const tokenCreateResponse = await app.inject({
      headers: { authorization: `Bearer ${session.session.token}` },
      method: "POST",
      payload: { name: "Token manager", scopes: ["tokens:read"] },
      url: "/api/v1/auth/tokens"
    });
    const createdToken = tokenCreateResponse.json<{ secret: string }>();
    const meResponse = await app.inject({
      headers: { authorization: `Bearer ${createdToken.secret}` },
      method: "GET",
      url: "/api/v1/auth/me"
    });

    expect(tokenCreateResponse.statusCode).toBe(201);
    expect(meResponse.statusCode).toBe(401);
    expect(meResponse.json()).toEqual(expect.objectContaining({ redacted: true }));
    expect(meResponse.body).not.toContain(createdToken.secret);
  });

  it("manages project access settings without leaking API token secrets", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    const authHeaders = {
      "x-testhistory-actor-id": "project-owner",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-scopes": "settings:read settings:write"
    };

    const deniedResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/settings/access`
    });
    const initialResponse = await app.inject({
      headers: authHeaders,
      method: "GET",
      url: `/api/v1/projects/${project.id}/settings/access`
    });
    const tokenCreateResponse = await app.inject({
      headers: authHeaders,
      method: "POST",
      payload: {
        expiresAt: "2099-09-01T00:00:00.000Z",
        name: "CI upload",
        ownerSubject: "svc-ci",
        scopes: ["launches:write", "results:write", "settings:read", "security:audit:read"]
      },
      url: `/api/v1/projects/${project.id}/settings/access/tokens`
    });
    const createdToken = tokenCreateResponse.json<{
      secret: string;
      token: { id: string; prefix: string; status: string };
    }>();
    const afterCreateResponse = await app.inject({
      headers: authHeaders,
      method: "GET",
      url: `/api/v1/projects/${project.id}/settings/access`
    });
    const bearerReadResponse = await app.inject({
      headers: {
        authorization: `Bearer ${createdToken.secret}`
      },
      method: "GET",
      url: `/api/v1/projects/${project.id}/settings/access`
    });
    const invalidBearerResponse = await app.inject({
      headers: {
        authorization: "Bearer raw-invalid-token"
      },
      method: "GET",
      url: `/api/v1/projects/${project.id}/settings/access`
    });
    const afterCreateBody = afterCreateResponse.json();
    const serializedAfterCreate = JSON.stringify(afterCreateBody);
    const bearerAuditResponse = await app.inject({
      headers: {
        authorization: `Bearer ${createdToken.secret}`
      },
      method: "GET",
      url: `/api/v1/security/audit?projectId=${project.id}&limit=20`
    });
    const revokeResponse = await app.inject({
      headers: authHeaders,
      method: "DELETE",
      url: `/api/v1/projects/${project.id}/settings/access/tokens/${createdToken.token.id}`
    });
    const rolePatchResponse = await app.inject({
      headers: authHeaders,
      method: "PATCH",
      payload: {
        memberships: [
          {
            createdAt: "2026-06-03T00:00:00.000Z",
            displayName: "Checkout Lead",
            id: "member-checkout",
            role: "maintainer",
            source: "manual",
            status: "active",
            subject: "checkout-lead",
            updatedAt: "2026-06-03T00:00:00.000Z"
          }
        ]
      },
      url: `/api/v1/projects/${project.id}/settings/access`
    });
    const auditResponse = await app.inject({
      headers: {
        "x-testhistory-actor-id": "project-owner",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-scopes": "security:audit:read"
      },
      method: "GET",
      url: `/api/v1/security/audit?projectId=${project.id}&limit=20`
    });
    const auditBody = auditResponse.json<{
      items: Array<{
        metadata?: unknown;
        resource?: { id?: string; type?: string };
        type: string;
      }>;
    }>();

    expect(deniedResponse.statusCode).toBe(403);
    expect(deniedResponse.json()).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        projectId: project.id,
        redacted: true,
        requiredScopes: ["settings:read"]
      })
    );
    expect(initialResponse.statusCode).toBe(200);
    expect(initialResponse.json()).toEqual(
      expect.objectContaining({
        kind: "project-access-settings",
        project: expect.objectContaining({ id: project.id, visibility: "private" })
      })
    );
    expect(tokenCreateResponse.statusCode).toBe(201);
    expect(createdToken.secret).toMatch(/^th_live_[a-f0-9]{8}_/);
    expect(createdToken.token.prefix).toMatch(/^th_live_[a-f0-9]{8}$/);
    expect(createdToken.token.status).toBe("active");
    expect(JSON.stringify(createdToken.token)).not.toContain("secretHash");
    expect(JSON.stringify(createdToken.token)).not.toContain(createdToken.secret);
    expect(afterCreateResponse.statusCode).toBe(200);
    expect(afterCreateBody.apiTokens).toHaveLength(1);
    expect(serializedAfterCreate).not.toContain("secretHash");
    expect(serializedAfterCreate).not.toContain(createdToken.secret);
    expect(bearerReadResponse.statusCode).toBe(200);
    expect(bearerAuditResponse.statusCode).toBe(200);
    expect(bearerReadResponse.json()).toEqual(
      expect.objectContaining({
        kind: "project-access-settings",
        apiTokens: [
          expect.objectContaining({ id: createdToken.token.id, lastUsedAt: expect.any(String) })
        ]
      })
    );
    expect(JSON.stringify(bearerReadResponse.json())).not.toContain(createdToken.secret);
    expect(invalidBearerResponse.statusCode).toBe(403);
    expect(JSON.stringify(invalidBearerResponse.json())).not.toContain("raw-invalid-token");
    expect(revokeResponse.statusCode).toBe(200);
    expect(revokeResponse.json()).toEqual(
      expect.objectContaining({
        kind: "project-api-token-revoked",
        token: expect.objectContaining({ id: createdToken.token.id, status: "revoked" })
      })
    );
    expect(rolePatchResponse.statusCode).toBe(200);
    expect(auditResponse.statusCode).toBe(200);
    expect(auditBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resource: expect.objectContaining({ id: createdToken.token.id, type: "api-token" }),
          type: "auth.token.created"
        }),
        expect.objectContaining({
          resource: expect.objectContaining({ id: createdToken.token.id, type: "api-token" }),
          type: "auth.token.revoked"
        }),
        expect.objectContaining({
          resource: expect.objectContaining({
            id: "checkout-lead",
            type: "project-membership"
          }),
          type: "auth.role.changed"
        })
      ])
    );
    expect(JSON.stringify(auditBody)).not.toContain(createdToken.secret);
    expect(JSON.stringify(auditBody)).not.toContain("secretHash");
  });
});
