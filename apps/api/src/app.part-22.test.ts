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

describe("api app part-22", () => {
  it("returns paginated project-scoped redacted security audit events", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const beforeStoreState = {
      launches: store.launches.size,
      uploadJobs: store.uploadJobs.size,
      artifacts: store.artifacts.size
    };

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/security/audit?projectId=${project.id}&limit=2`,
      headers: {
        "x-testhistory-scopes": "security:audit:read",
        "x-testhistory-project-scope": project.id
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        kind: "security-audit-list",
        projectId: project.id,
        access: {
          scope: "security:audit:read",
          projectScoped: true,
          mutation: false,
          redacted: true
        },
        page: expect.objectContaining({
          limit: 2,
          returned: 2,
          total: 3,
          nextCursor: "2",
          hasMore: true
        }),
        summary: expect.objectContaining({
          total: 3,
          allowed: 2,
          denied: 1,
          failed: 0
        }),
        items: [
          expect.objectContaining({
            projectId: project.id,
            type: "auth.login.succeeded",
            outcome: "allowed",
            metadata: expect.objectContaining({ token: "[redacted]" })
          }),
          expect.objectContaining({
            projectId: project.id,
            type: "auth.access.denied",
            outcome: "denied",
            metadata: expect.objectContaining({
              authorization: "[redacted]",
              payload: "[redacted]"
            })
          })
        ]
      })
    );
    expect(JSON.stringify(response.json())).not.toContain("redact-me-audit-token");
    expect(JSON.stringify(response.json())).not.toContain("redact-me-audit-header");
    expect(JSON.stringify(response.json())).not.toContain("redact-me-storage");
    expect(store.launches.size).toBe(beforeStoreState.launches);
    expect(store.uploadJobs.size).toBe(beforeStoreState.uploadJobs);
    expect(store.artifacts.size).toBe(beforeStoreState.artifacts);

    const nextResponse = await app.inject({
      method: "GET",
      url: `/api/v1/security/audit?projectId=${project.id}&cursor=2&outcome=allowed`,
      headers: {
        "x-testhistory-scopes": "security:audit:read",
        "x-testhistory-project-scope": project.id
      }
    });
    expect(nextResponse.statusCode).toBe(200);
    expect(
      nextResponse.json<{ items: Array<{ outcome: string }>; page: { total: number } }>()
    ).toEqual(
      expect.objectContaining({
        page: expect.objectContaining({ total: 2, returned: 0 }),
        items: []
      })
    );
  });

  it("evaluates security audit export policy as a disabled-by-default read contract", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const basePayload = {
      request: {
        projectId: project.id,
        actorId: "security-audit-actor",
        requestedAt: "2026-05-30T08:00:00.000Z",
        range: {
          from: "2026-05-01T00:00:00.000Z",
          to: "2026-05-08T00:00:00.000Z"
        },
        destination: {
          type: "placeholder",
          secretRef: "audit-export-placeholder-ref"
        },
        criteria: {
          eventTypes: ["auth.login.failed", "auth.access.denied"],
          note: "Bearer raw-export-note-token and token=raw-export-filter-token",
          nested: {
            reason: "keep this visible",
            session: "raw-export-session-secret"
          }
        }
      }
    };
    const beforeStoreState = {
      launches: store.launches.size,
      uploadJobs: store.uploadJobs.size,
      artifacts: store.artifacts.size
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
        name: "Security audit export reader",
        ownerSubject: "ci/security-audit-export",
        scopes: ["security:audit:read"]
      }
    });
    expect(tokenResponse.statusCode).toBe(201);
    const apiToken = tokenResponse.json<{ secret: string }>();

    const disabledResponse = await app.inject({
      method: "POST",
      url: "/api/v1/security/audit/export/evaluate",
      headers: {
        "x-testhistory-scopes": "security:audit:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "security-audit-actor"
      },
      payload: basePayload
    });
    const allowedResponse = await app.inject({
      method: "POST",
      url: "/api/v1/security/audit/export/evaluate",
      headers: {
        "x-testhistory-scopes": "security:audit:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "security-audit-actor"
      },
      payload: {
        ...basePayload,
        policy: {
          enabled: true,
          allowedProjectIds: [project.id],
          allowedActorIds: ["security-audit-actor"],
          maxRangeDays: 14
        }
      }
    });
    const bearerAllowedResponse = await app.inject({
      method: "POST",
      url: "/api/v1/security/audit/export/evaluate",
      headers: {
        authorization: `Bearer ${apiToken.secret}`,
        "x-testhistory-actor-id": "security-audit-actor"
      },
      payload: {
        ...basePayload,
        policy: {
          enabled: true,
          allowedProjectIds: [project.id],
          allowedActorIds: ["security-audit-actor"],
          maxRangeDays: 14
        }
      }
    });

    expect(disabledResponse.statusCode).toBe(200);
    expect(disabledResponse.json<SecurityAuditExportEvaluationResponse>()).toEqual(
      expect.objectContaining({
        kind: "security-audit-export-policy-evaluation",
        projectId: project.id,
        actor: { type: "actor", actorId: "security-audit-actor", scoped: true },
        access: {
          scope: "security:audit:read",
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        execution: {
          exportStarted: false,
          providerIntegration: false,
          credentialsResolved: false,
          destinationType: "placeholder"
        },
        decision: expect.objectContaining({
          allowed: false,
          status: "denied",
          reasons: [expect.objectContaining({ code: "audit_export.disabled" })]
        })
      })
    );
    expect(allowedResponse.statusCode).toBe(200);
    expect(bearerAllowedResponse.statusCode).toBe(200);
    const allowed = allowedResponse.json<SecurityAuditExportEvaluationResponse>();
    const bearerAllowed = bearerAllowedResponse.json<SecurityAuditExportEvaluationResponse>();
    expect(allowed.decision).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        allowed: true,
        status: "allowed",
        limits: { maxRangeDays: 14 }
      })
    );
    expect(bearerAllowed.decision).toEqual(
      expect.objectContaining({
        allowed: true,
        status: "allowed"
      })
    );
    expect(allowed.decision.request).toEqual(
      expect.objectContaining({
        projectId: project.id,
        actorId: "security-audit-actor",
        range: expect.objectContaining({ days: 7 }),
        destination: { type: "placeholder", secretRef: "audit-export-placeholder-ref" },
        criteria: {
          eventTypes: ["auth.login.failed", "auth.access.denied"],
          nested: {
            reason: "keep this visible",
            session: "[redacted]"
          },
          note: "Bearer [redacted] and token=[redacted]"
        }
      })
    );
    expect(allowed.decision.reasons.map((reason) => reason.code)).toEqual([
      "audit_export.allowed_placeholder"
    ]);
    expect(JSON.stringify(allowed)).not.toContain("raw-export-note-token");
    expect(JSON.stringify(allowed)).not.toContain("raw-export-filter-token");
    expect(bearerAllowedResponse.body).not.toContain(apiToken.secret);
    expect(JSON.stringify(allowed)).not.toContain("raw-export-session-secret");
    expect(store.launches.size).toBe(beforeStoreState.launches);
    expect(store.uploadJobs.size).toBe(beforeStoreState.uploadJobs);
    expect(store.artifacts.size).toBe(beforeStoreState.artifacts);
  });

  it("denies security audit export policy evaluations for missing secretRef, range, and policy scope", async () => {
    app = await createApiApp();
    const project = await createProject(app);
    const headers = {
      "x-testhistory-scopes": "security:audit:read",
      "x-testhistory-project-scope": project.id,
      "x-testhistory-actor-id": "security-audit-actor"
    };
    const baseRequest = {
      projectId: project.id,
      actorId: "security-audit-actor",
      requestedAt: "2026-05-30T08:00:00.000Z",
      range: {
        from: "2026-05-01T00:00:00.000Z",
        to: "2026-06-10T00:00:00.000Z"
      },
      destination: { type: "placeholder" },
      criteria: { severity: "critical" }
    };

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/security/audit/export/evaluate",
      headers,
      payload: {
        request: baseRequest,
        policy: {
          enabled: true,
          maxRangeDays: 31,
          allowedProjectIds: ["other-project"],
          allowedActorIds: ["other-actor"]
        }
      }
    });

    expect(response.statusCode).toBe(200);
    const evaluation = response.json<SecurityAuditExportEvaluationResponse>();
    expect(evaluation.decision.allowed).toBe(false);
    expect(evaluation.decision.request.range.days).toBe(40);
    expect(evaluation.decision.reasons.map((reason) => reason.code)).toEqual([
      "audit_export.secret_ref_required",
      "audit_export.range_exceeds_limit",
      "audit_export.project_scope_denied",
      "audit_export.actor_scope_denied"
    ]);

    const wrongActorResponse = await app.inject({
      method: "POST",
      url: "/api/v1/security/audit/export/evaluate",
      headers: {
        ...headers,
        "x-testhistory-actor-id": "other-actor",
        authorization: "Bearer raw-export-denied-token"
      },
      payload: {
        request: {
          ...baseRequest,
          range: {
            from: "2026-05-01T00:00:00.000Z",
            to: "2026-05-08T00:00:00.000Z"
          },
          destination: { type: "placeholder", secretRef: "audit-export-placeholder-ref" }
        },
        policy: { enabled: true }
      }
    });
    expect(wrongActorResponse.statusCode).toBe(403);
    expect(wrongActorResponse.json()).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        requiredScopes: ["security:audit:read"],
        projectId: project.id,
        redacted: true
      })
    );
    expect(JSON.stringify(wrongActorResponse.json())).not.toContain("raw-export-denied-token");
  });

  it("redacts unsafe security audit export criteria and advertises the OpenAPI contract", async () => {
    app = await createApiApp();
    const project = await createProject(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/security/audit/export/evaluate",
      headers: {
        "x-testhistory-scopes": "security:audit:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "security-audit-actor"
      },
      payload: {
        request: {
          projectId: project.id,
          actorId: "security-audit-actor",
          requestedAt: "2026-05-30T08:00:00.000Z",
          range: {
            from: "2026-05-01T00:00:00.000Z",
            to: "2026-05-08T00:00:00.000Z"
          },
          destination: {
            type: "placeholder",
            secretRef: "audit-export-placeholder-ref",
            url: "https://export.example/upload?token=raw-export-url-token",
            path: "C:\\Users\\tester\\Downloads\\audit-export.jsonl",
            token: "raw-export-token",
            rawSecret: "raw-export-secret"
          },
          criteria: {
            callbackUrl: "https://callback.example/hook?token=raw-callback-token",
            localPath: "C:\\Users\\tester\\Downloads\\criteria.json",
            status: "denied"
          }
        },
        policy: { enabled: true }
      }
    });

    expect(response.statusCode).toBe(200);
    const evaluation = response.json<SecurityAuditExportEvaluationResponse>();
    expect(evaluation.decision.allowed).toBe(false);
    expect(evaluation.decision.reasons).toEqual([
      expect.objectContaining({
        code: "audit_export.unsafe_field",
        fields: [
          "request.criteria.callbackUrl",
          "request.criteria.localPath",
          "request.destination.path",
          "request.destination.rawSecret",
          "request.destination.token",
          "request.destination.url"
        ]
      })
    ]);
    const serialized = JSON.stringify(evaluation);
    expect(serialized).not.toContain("raw-export-url-token");
    expect(serialized).not.toContain("raw-export-token");
    expect(serialized).not.toContain("raw-export-secret");
    expect(serialized).not.toContain("raw-callback-token");
    expect(serialized).not.toContain("Downloads");
    expect(serialized).not.toContain("criteria.json");

    const staticOpenApi = readFileSync(
      new URL("../../../docs/openapi/openapi.yaml", import.meta.url),
      "utf8"
    );
    expect(staticOpenApi).toContain("/api/v1/security/audit/export/evaluate:");
    expect(staticOpenApi).toContain("operationId: evaluateSecurityAuditExportPolicy");
    expect(staticOpenApi).toContain("SecurityAuditExportPolicyEvaluation");
  });

  it("returns paginated project and actor scoped security audit export lifecycle replay invariants", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const beforeStoreState = {
      launches: store.launches.size,
      uploadJobs: store.uploadJobs.size,
      artifacts: store.artifacts.size
    };

    const response = await app.inject({
      method: "GET",
      url:
        `/api/v1/projects/${project.id}/security/audit/export/lifecycle/replay/invariants` +
        "?actorId=security-audit-actor&limit=1",
      headers: {
        "x-testhistory-scopes": "security:audit:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "security-audit-actor"
      }
    });
    const nextResponse = await app.inject({
      method: "GET",
      url:
        `/api/v1/projects/${project.id}/security/audit/export/lifecycle/replay/invariants` +
        "?actorId=security-audit-actor&limit=1&cursor=1",
      headers: {
        "x-testhistory-scopes": "security:audit:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "security-audit-actor"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(nextResponse.statusCode).toBe(200);
    const replay = response.json<SecurityAuditExportLifecycleReplayInvariantResponse>();
    const nextReplay = nextResponse.json<SecurityAuditExportLifecycleReplayInvariantResponse>();
    expect(replay).toEqual(
      expect.objectContaining({
        kind: "security-audit-export-lifecycle-replay-invariants",
        project: { id: project.id, scoped: true },
        actor: { id: "security-audit-actor", scoped: true },
        access: {
          scope: "security:audit:read",
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        replay: expect.objectContaining({
          status: "replayed",
          eventCount: 6,
          requestCount: 2,
          ignoredCount: 4,
          appendOnly: true,
          deterministic: true,
          recomputable: true,
          rawEventsExposed: false,
          rawRequestsExposed: false,
          providerNeutral: true
        }),
        execution: {
          exportStarted: false,
          providerIntegration: false,
          providerEndpointContacted: false,
          credentialsResolved: false,
          signedUrlsIssued: false,
          destinationResolved: false
        },
        page: expect.objectContaining({
          limit: 1,
          returned: 1,
          total: 2,
          nextCursor: "1",
          hasMore: true
        }),
        summary: expect.objectContaining({
          totalRequests: 2,
          approved: 1,
          denied: 1
        }),
        invariants: expect.objectContaining({
          appendOnly: true,
          deterministic: true,
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          mutationFree: true,
          providerNeutral: true,
          rawEventsExposed: false,
          rawRequestsExposed: false,
          signedUrlsIssued: false,
          secretsExposed: false
        }),
        items: [
          expect.objectContaining({
            requestId: "audit-export-lifecycle-approved",
            status: "approved",
            eventCount: 3,
            actorIds: ["security-audit-actor"],
            decisionStatus: "allowed",
            reasonCodes: ["audit_export.allowed_placeholder"]
          })
        ]
      })
    );
    expect(nextReplay.items).toEqual([
      expect.objectContaining({
        requestId: "audit-export-lifecycle-denied",
        status: "denied",
        eventCount: 3,
        actorIds: ["security-audit-actor"],
        decisionStatus: "denied",
        reasonCodes: ["audit_export.range_exceeds_limit"]
      })
    ]);
    expect(replay.replay.projectionDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(nextReplay.replay.projectionDigest).toBe(replay.replay.projectionDigest);
    const serialized = JSON.stringify([replay, nextReplay]);
    expect(serialized).not.toContain("raw-lifecycle-token");
    expect(serialized).not.toContain("raw-export-filter-token");
    expect(serialized).not.toContain("raw-denied-lifecycle-token");
    expect(serialized).not.toContain("raw-request-reason-token");
    expect(serialized).not.toContain("Downloads");
    expect(serialized).not.toContain("storage.example");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("audit-export-placeholder-ref");
    expect(serialized).not.toContain("security-audit-other-actor");
    expect(serialized).not.toContain("audit-export-lifecycle-cross-project");
    expect(store.launches.size).toBe(beforeStoreState.launches);
    expect(store.uploadJobs.size).toBe(beforeStoreState.uploadJobs);
    expect(store.artifacts.size).toBe(beforeStoreState.artifacts);
  });

  it("returns an empty security audit export lifecycle replay invariant read without widening scope", async () => {
    app = await createApiApp();
    const project = await createProject(app);

    const response = await app.inject({
      method: "GET",
      url:
        `/api/v1/projects/${project.id}/security/audit/export/lifecycle/replay/invariants` +
        "?actorId=security-audit-empty-actor&limit=5",
      headers: {
        "x-testhistory-scopes": "security:audit:read",
        "x-testhistory-project-scope": project.id,
        "x-testhistory-actor-id": "security-audit-empty-actor"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<SecurityAuditExportLifecycleReplayInvariantResponse>()).toEqual(
      expect.objectContaining({
        actor: { id: "security-audit-empty-actor", scoped: true },
        replay: expect.objectContaining({
          status: "empty",
          eventCount: 0,
          requestCount: 0,
          rawEventsExposed: false,
          providerNeutral: true
        }),
        page: expect.objectContaining({
          returned: 0,
          total: 0,
          hasMore: false
        }),
        summary: expect.objectContaining({
          totalRequests: 0,
          requested: 0,
          evaluated: 0,
          approved: 0,
          denied: 0,
          cancelled: 0,
          expired: 0
        }),
        items: []
      })
    );
  });
});
