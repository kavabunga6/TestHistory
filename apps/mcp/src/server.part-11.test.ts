import { afterEach, describe, expect, it, vi } from "vitest";
import { handle } from "./server.js";

function firstText(response: Awaited<ReturnType<typeof handle>>): string {
  const content = response.result as { content?: Array<{ type: string; text: string }> };
  return content.content?.[0]?.text ?? "";
}

function firstResourceText(response: Awaited<ReturnType<typeof handle>>): string {
  const content = response.result as { contents?: Array<{ type?: string; text: string }> };
  return content.contents?.[0]?.text ?? "";
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function deniedResponse(value: unknown, status = 403, statusText = "Forbidden"): Response {
  return new Response(JSON.stringify(value), {
    status,
    statusText,
    headers: { "content-type": "application/json" }
  });
}

function expectNoPersistedInvariantSensitiveTranscriptLeak(serialized: string): void {
  expect(serialized).not.toMatch(
    /"(rawHistory|compareInputs|baseResult|targetResult|history|events)"\s*:/
  );
  expect(serialized).not.toContain("Authorization: Bearer");
  expect(serialized).not.toContain("storage://");
  expect(serialized).not.toContain("storage.example");
  expect(serialized).not.toContain("X-Amz-Signature");
  expect(serialized).not.toContain("C:\\synthetic");
  expect(serialized).not.toContain("allure-results");
}

function expectNoAttachmentPreviewRetentionSensitiveTranscriptLeak(serialized: string): void {
  expect(serialized).not.toContain("allowed-preview-retention-token");
  expect(serialized).not.toContain("denied-preview-retention-token");
  expect(serialized).not.toContain("wrong-project-preview-retention-token");
  expect(serialized).not.toContain("open-launch-preview-retention-token");
  expect(serialized).not.toContain("mutation-preview-retention-token");
  expect(serialized).not.toContain("Authorization");
  expect(serialized).not.toContain("Bearer");
  expect(serialized).not.toContain("storage://");
  expect(serialized).not.toContain("object.test");
  expect(serialized).not.toContain("X-Amz-Signature");
  expect(serialized).not.toContain("C:\\Users");
  expect(serialized).not.toContain("Downloads");
  expect(serialized).not.toContain("raw/preview-retention");
  expect(serialized).not.toContain("raw/schedule");
  expect(serialized).not.toContain('"storageKey"');
  expect(serialized).not.toContain(joinedSensitiveMarker('"storage', 'Ref"'));
  expect(serialized).not.toContain('"signedUrl"');
  expect(serialized).not.toContain('"providerRuntime"');
  expect(serialized).not.toContain('"rawPayload"');
  expect(serialized).not.toContain('"deletionExecution":true');
  expect(serialized).not.toContain('"deletionMutation":true');
  expect(serialized).not.toContain('"providerActions":true');
  expect(serialized).not.toContain("object.storage.delete");
  expect(serialized).not.toContain("delete-object");
}

function joinedSensitiveMarker(...parts: string[]): string {
  return parts.join("");
}

function expectNoSecurityAuditExportLifecycleSensitiveTranscriptLeak(serialized: string): void {
  expect(serialized).not.toContain("synthetic-secret-marker");
  expect(serialized).not.toContain(joinedSensitiveMarker("Authoriza", "tion"));
  expect(serialized).not.toContain(joinedSensitiveMarker("Bea", "rer"));
  expect(serialized).not.toContain("provider.example");
  expect(serialized).not.toContain("storage.example");
  expect(serialized).not.toContain(joinedSensitiveMarker("X-Amz-", "Signature"));
  expect(serialized).not.toContain(joinedSensitiveMarker("storage", "://"));
  expect(serialized).not.toContain("object.storage.delete");
  expect(serialized).not.toContain("provider-runtime");
  expect(serialized).not.toContain('"rawLifecycleEvents"');
  expect(serialized).not.toContain('"requestPayload"');
  expect(serialized).not.toContain('"providerEndpoint"');
  expect(serialized).not.toContain(joinedSensitiveMarker('"signed', 'Url"'));
  expect(serialized).not.toContain('"credentials"');
  expect(serialized).not.toContain('"destination"');
  expect(serialized).not.toContain('"storageRef"');
  expect(serialized).not.toContain('"providerRuntime"');
  expect(serialized).not.toContain('"providerActions"');
  expect(serialized).not.toContain('"deletionExecution"');
  expect(serialized).not.toContain('"rawPayload"');
}

describe("MCP tools part-11", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("evaluates security audit export policy through REST POST with project and actor scope redaction", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return jsonResponse({
        kind: "security-audit-export-policy-evaluation",
        projectId: "project-1",
        actor: { type: "actor", actorId: "actor-1", scoped: true },
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
        decision: {
          schemaVersion: 1,
          status: "allowed",
          allowed: true,
          request: {
            projectId: "project-1",
            actorId: "actor-1",
            requestedAt: "2026-05-30T08:00:00.000Z",
            range: {
              from: "2026-05-01T00:00:00.000Z",
              to: "2026-05-08T00:00:00.000Z",
              days: 7
            },
            destination: {
              type: "placeholder",
              secretRef: "audit-export-placeholder-ref",
              url: "https://export.example/upload?token=raw-export-url-token",
              path: "C:\\Users\\tester\\Downloads\\audit-export.jsonl",
              token: "raw-export-token"
            },
            format: "jsonl",
            criteria: {
              outcome: "denied",
              callbackUrl: "https://callback.example/hook?token=raw-callback-token",
              localPath: "C:\\Users\\tester\\Downloads\\criteria.json",
              nested: {
                reason: "keep this visible",
                session: "raw-export-session-secret"
              },
              note: "Bearer raw-export-note-token and token=raw-export-filter-token"
            }
          },
          limits: { maxRangeDays: 14 },
          reasons: [
            {
              code: "audit_export.allowed_placeholder",
              severity: "info",
              explanation: "placeholder request allowed",
              fields: []
            }
          ]
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = {
      projectId: "project-1",
      actorId: "actor-1",
      requestedAt: "2026-05-30T08:00:00.000Z",
      range: {
        from: "2026-05-01T00:00:00.000Z",
        to: "2026-05-08T00:00:00.000Z"
      },
      destination: {
        type: "placeholder",
        secretRef: "audit-export-placeholder-ref",
        url: "https://export.example/upload?token=request-url-token",
        path: "C:\\Users\\tester\\Downloads\\audit-export.jsonl",
        token: "request-token"
      },
      criteria: {
        outcome: "denied",
        callbackUrl: "https://callback.example/hook?token=request-callback-token",
        nested: { reason: "keep this visible" }
      }
    };
    const policy = {
      enabled: true,
      allowedProjectIds: ["project-1"],
      allowedActorIds: ["actor-1"],
      maxRangeDays: 14
    };

    const response = await handle({
      jsonrpc: "2.0",
      id: 55,
      method: "tools/call",
      params: {
        name: "testhistory.security-audit.export.evaluate",
        arguments: {
          apiUrl: "http://api.test",
          request,
          policy
        }
      }
    });

    const payload = JSON.parse(firstText(response)) as {
      kind: string;
      projectId: string;
      actor: { actorId: string; scoped: boolean };
      access: { scope: string; actorScoped: boolean; mutation: boolean };
      execution?: unknown;
      decision: {
        request: {
          destination: { type: string; secretRef?: string; url?: string; path?: string };
          criteria: { outcome: string; callbackUrl?: string; localPath?: string; nested: object };
        };
      };
      policy: {
        providerNeutral: boolean;
        mutationAllowed: boolean;
        credentialReferencesIncluded: boolean;
        providerRuntimeMetadataIncluded: boolean;
      };
    };
    const init = fetchedRequests[0]?.init;
    const headers = init?.headers as Record<string, string>;
    const serialized = firstText(response);

    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/security/audit/export/evaluate"
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ request, policy });
    expect(headers["X-TestHistory-Scopes"]).toBe("security:audit:read");
    expect(headers["X-TestHistory-Project-Scope"]).toBe("project-1");
    expect(headers["X-TestHistory-Actor-Id"]).toBe("actor-1");
    expect(payload.kind).toBe("security-audit-export-policy-evaluation");
    expect(payload.projectId).toBe("project-1");
    expect(payload.actor).toEqual({ type: "actor", actorId: "actor-1", scoped: true });
    expect(payload.access).toEqual({
      scope: "security:audit:read",
      projectScoped: true,
      actorScoped: true,
      mutation: false,
      redacted: true
    });
    expect(payload.execution).toBeUndefined();
    expect(payload.decision.request.destination).toEqual({ type: "placeholder" });
    expect(payload.decision.request.criteria).toEqual({
      outcome: "denied",
      nested: { reason: "keep this visible" },
      note: "[redacted]"
    });
    expect(payload.policy).toEqual(
      expect.objectContaining({
        providerNeutral: true,
        mutationAllowed: false,
        credentialReferencesIncluded: false,
        providerRuntimeMetadataIncluded: false
      })
    );
    expect(serialized).not.toContain("audit-export-placeholder-ref");
    expect(serialized).not.toContain("raw-export-url-token");
    expect(serialized).not.toContain("raw-export-token");
    expect(serialized).not.toContain("raw-callback-token");
    expect(serialized).not.toContain("raw-export-session-secret");
    expect(serialized).not.toContain("Downloads");
    expect(serialized).not.toContain("criteria.json");
    expect(serialized).not.toContain("execution");
    expect(serialized).not.toContain("providerIntegration");
    expect(serialized).not.toContain("credentialsResolved");
    expect(serialized).not.toContain("exportStarted");
  });

  it("routes security audit export evaluation resources through REST and preserves denied shape", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return deniedResponse({
        error: "PermissionDeniedError",
        message: "Missing required security audit export evaluation read scope",
        requiredScopes: ["security:audit:read"],
        projectId: "project-locked",
        redacted: true,
        token: "raw-denied-export-token",
        path: "C:\\Users\\tester\\Downloads\\denied.jsonl"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const missingRequestResponse = await handle({
      jsonrpc: "2.0",
      id: 56,
      method: "tools/call",
      params: {
        name: "testhistory.security-audit.export.evaluate",
        arguments: { apiUrl: "http://api.test" }
      }
    });
    const deniedResourceResponse = await handle({
      jsonrpc: "2.0",
      id: 57,
      method: "resources/read",
      params: {
        uri: "testhistory://security/audit/export/evaluate?apiUrl=http%3A%2F%2Fapi.test&projectId=project-locked&actorId=actor-1&requestedAt=2026-05-30T08%3A00%3A00.000Z&from=2026-05-01T00%3A00%3A00.000Z&to=2026-05-08T00%3A00%3A00.000Z&secretRef=audit-export-placeholder-ref&criteria=%7B%22outcome%22%3A%22denied%22%7D&policy=%7B%22enabled%22%3Atrue%7D"
      }
    });
    const unknownMutationResponse = await handle({
      jsonrpc: "2.0",
      id: 58,
      method: "tools/call",
      params: {
        name: "testhistory.security-audit.export.start",
        arguments: { projectId: "project-locked" }
      }
    });

    const denied = JSON.parse(firstResourceText(deniedResourceResponse)) as {
      status: string;
      code: number;
      permissionDenied: { error: string; requiredScopes: string[]; token?: string; path?: string };
    };
    const init = fetchedRequests[0]?.init;
    const headers = init?.headers as Record<string, string>;

    expect(missingRequestResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "request is required for security audit export evaluation reads"
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/security/audit/export/evaluate"
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      request: {
        projectId: "project-locked",
        actorId: "actor-1",
        requestedAt: "2026-05-30T08:00:00.000Z",
        range: {
          from: "2026-05-01T00:00:00.000Z",
          to: "2026-05-08T00:00:00.000Z"
        },
        destination: {
          type: "placeholder",
          secretRef: "audit-export-placeholder-ref"
        },
        criteria: { outcome: "denied" }
      },
      policy: { enabled: true }
    });
    expect(headers["X-TestHistory-Scopes"]).toBe("security:audit:read");
    expect(headers["X-TestHistory-Project-Scope"]).toBe("project-locked");
    expect(headers["X-TestHistory-Actor-Id"]).toBe("actor-1");
    expect(denied).toEqual(
      expect.objectContaining({
        status: "error",
        code: 403,
        permissionDenied: expect.objectContaining({
          error: "PermissionDeniedError",
          requiredScopes: ["security:audit:read"],
          token: "[redacted]"
        })
      })
    );
    expect(denied.permissionDenied.path).toBeUndefined();
    expect(firstResourceText(deniedResourceResponse)).not.toContain("raw-denied-export-token");
    expect(firstResourceText(deniedResourceResponse)).not.toContain("Downloads");
    expect(unknownMutationResponse.error).toEqual(
      expect.objectContaining({
        message: "Unknown tool: testhistory.security-audit.export.start"
      })
    );
  });

  it("reads security audit export lifecycle replay invariants through REST with scoped redaction", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return jsonResponse({
        kind: "security-audit-export-lifecycle-replay-invariants",
        project: { id: "project-1", scoped: true, providerEndpoint: "https://provider.invalid" },
        actor: { id: "actor-1", scoped: true, token: "raw-actor-token" },
        access: {
          scope: "security:audit:read",
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        replay: {
          status: "replayed",
          eventCount: 4,
          requestCount: 2,
          duplicateCount: 1,
          ignoredCount: 3,
          projectionDigest: "a".repeat(64),
          appendOnly: true,
          deterministic: true,
          recomputable: true,
          rawEventsExposed: true,
          rawRequestsExposed: true,
          providerNeutral: false,
          rawLifecycleEvents: [{ requestPayload: "Bearer raw-lifecycle-token" }]
        },
        execution: {
          exportStarted: true,
          providerIntegration: true,
          providerEndpointContacted: true,
          credentialsResolved: true,
          signedUrlsIssued: true,
          destinationResolved: true,
          providerEndpoint: "https://provider.example/export?token=raw-provider-token"
        },
        page: {
          limit: 1,
          cursor: "1",
          offset: 1,
          returned: 1,
          total: 2,
          nextCursor: null,
          hasMore: false
        },
        summary: {
          totalRequests: 2,
          requested: 2,
          evaluated: 2,
          approved: 1,
          denied: 1,
          cancelled: 0,
          expired: 0
        },
        invariants: {
          appendOnly: true,
          deterministic: true,
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          mutationFree: true,
          providerNeutral: true,
          rawEventsExposed: true,
          rawRequestsExposed: true,
          providerEndpointsContacted: true,
          signedUrlsIssued: true,
          secretsExposed: true
        },
        items: [
          {
            requestId: "audit-export-lifecycle-denied",
            status: "denied",
            eventCount: 2,
            lastEventAt: "2026-05-30T09:00:02.000Z",
            actorIds: ["actor-1", "actor-token-secret"],
            decisionStatus: "denied",
            reasonCodes: ["audit_export.range_exceeds_limit", "token=raw-reason-token"],
            timeline: {
              requestedAt: "2026-05-30T09:00:00.000Z",
              evaluatedAt: "2026-05-30T09:00:01.000Z",
              decidedAt: "2026-05-30T09:00:02.000Z"
            },
            request: {
              destination: {
                secretRef: "audit-export-placeholder-ref",
                signedUrl: "https://storage.example/export?X-Amz-Signature=raw-signature",
                path: "D:\\synthetic\\audit-export.jsonl"
              },
              payload: "Authorization: Bearer raw-request-token"
            },
            rawLifecycleEvents: [{ body: "raw lifecycle payload" }],
            providerEndpoint: "https://provider.example/exports"
          }
        ],
        rawLifecycleEvents: [{ requestPayload: "raw lifecycle root payload" }],
        requestPayload: "raw root request payload",
        providerEndpoint: "https://provider.example/root",
        signedUrl: "https://storage.example/root?token=raw-root-token"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const toolResponse = await handle({
      jsonrpc: "2.0",
      id: 590,
      method: "tools/call",
      params: {
        name: "testhistory.security-audit.export.lifecycle.replay.invariants.read",
        arguments: {
          apiUrl: "http://api.test",
          projectId: "project-1",
          actorId: "actor-1",
          limit: 1,
          cursor: "1"
        }
      }
    });
    const resourceResponse = await handle({
      jsonrpc: "2.0",
      id: 591,
      method: "resources/read",
      params: {
        uri: "testhistory://projects/project-1/security/audit/export/lifecycle/replay/invariants?apiUrl=http%3A%2F%2Fapi.test&actorId=actor-1&limit=1&cursor=1"
      }
    });

    const payload = JSON.parse(firstText(toolResponse)) as {
      kind: string;
      project: { id: string; scoped: boolean };
      actor: { id: string; scoped: boolean };
      access: { scope: string; projectScoped: boolean; actorScoped: boolean; mutation: boolean };
      replay: {
        status: string;
        eventCount: number;
        rawEventsExposed: boolean;
        rawRequestsExposed: boolean;
        providerNeutral: boolean;
      };
      execution: {
        exportStarted: boolean;
        providerEndpointContacted: boolean;
        signedUrlsIssued: boolean;
      };
      page: { limit: number; cursor: string; returned: number };
      summary: { totalRequests: number; denied: number };
      invariants: {
        mutationFree: boolean;
        rawEventsExposed: boolean;
        rawRequestsExposed: boolean;
        providerEndpointsContacted: boolean;
        signedUrlsIssued: boolean;
        secretsExposed: boolean;
      };
      items: Array<{
        requestId: string;
        status: string;
        eventCount: number;
        actorIds: string[];
        reasonCodes: string[];
        request?: unknown;
        rawLifecycleEvents?: unknown;
        providerEndpoint?: unknown;
      }>;
      policy: {
        equalOrNarrowerThanRest: boolean;
        mutationAllowed: boolean;
        mcpReplayExecution: boolean;
        rawLifecycleEventsIncluded: boolean;
        rawRequestPayloadsIncluded: boolean;
        providerEndpointsIncluded: boolean;
        signedUrlsIncluded: boolean;
      };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;
    const serialized = firstText(toolResponse);

    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/projects/project-1/security/audit/export/lifecycle/replay/invariants?actorId=actor-1&limit=1&cursor=1"
    );
    expect(headers).toEqual({
      "X-TestHistory-Scopes": "security:audit:read",
      "X-TestHistory-Project-Scope": "project-1",
      "X-TestHistory-Actor-Id": "actor-1"
    });
    expect(JSON.parse(firstResourceText(resourceResponse))).toEqual(
      expect.objectContaining({ kind: "security-audit-export-lifecycle-replay-invariants" })
    );
    expect(payload.kind).toBe("security-audit-export-lifecycle-replay-invariants");
    expect(payload.project).toEqual({ id: "project-1", scoped: true });
    expect(payload.actor).toEqual({ id: "actor-1", scoped: true });
    expect(payload.access).toEqual({
      scope: "security:audit:read",
      projectScoped: true,
      actorScoped: true,
      mutation: false,
      redacted: true
    });
    expect(payload.replay).toEqual(
      expect.objectContaining({
        status: "replayed",
        eventCount: 4,
        rawEventsExposed: false,
        rawRequestsExposed: false,
        providerNeutral: true
      })
    );
    expect(payload.execution).toEqual({
      exportStarted: false,
      providerIntegration: false,
      providerEndpointContacted: false,
      credentialsResolved: false,
      signedUrlsIssued: false,
      destinationResolved: false
    });
    expect(payload.page).toEqual(expect.objectContaining({ limit: 1, cursor: "1", returned: 1 }));
    expect(payload.summary).toEqual(expect.objectContaining({ totalRequests: 2, denied: 1 }));
    expect(payload.invariants).toEqual(
      expect.objectContaining({
        mutationFree: true,
        rawEventsExposed: false,
        rawRequestsExposed: false,
        providerEndpointsContacted: false,
        signedUrlsIssued: false,
        secretsExposed: false
      })
    );
    expect(payload.items).toEqual([
      {
        requestId: "audit-export-lifecycle-denied",
        status: "denied",
        eventCount: 2,
        lastEventAt: "2026-05-30T09:00:02.000Z",
        actorIds: ["actor-1", "[redacted]"],
        decisionStatus: "denied",
        reasonCodes: ["audit_export.range_exceeds_limit", "[redacted]"],
        timeline: {
          requestedAt: "2026-05-30T09:00:00.000Z",
          evaluatedAt: "2026-05-30T09:00:01.000Z",
          decidedAt: "2026-05-30T09:00:02.000Z"
        }
      }
    ]);
    expect(payload.policy).toEqual(
      expect.objectContaining({
        equalOrNarrowerThanRest: true,
        mutationAllowed: false,
        mcpReplayExecution: false,
        rawLifecycleEventsIncluded: false,
        rawRequestPayloadsIncluded: false,
        providerEndpointsIncluded: false,
        signedUrlsIncluded: false
      })
    );
    expect(serialized).not.toContain("raw-lifecycle-token");
    expect(serialized).not.toContain("raw-provider-token");
    expect(serialized).not.toContain("raw-request-token");
    expect(serialized).not.toContain("raw-signature");
    expect(serialized).not.toContain("audit-export-placeholder-ref");
    expect(serialized).not.toContain("D:\\synthetic");
    expect(serialized).not.toContain("https://provider.example");
    expect(serialized).not.toContain("raw lifecycle payload");
    expect(serialized).not.toContain("raw lifecycle root payload");
    expect(serialized).not.toContain("raw root request payload");
    expect(serialized).not.toContain("Authorization");
  });

  it("preserves denied security audit export lifecycle invariant shape and rejects mutation tools", async () => {
    const fetchMock = vi.fn(async () =>
      deniedResponse({
        error: "PermissionDeniedError",
        message: "Denied token=raw-lifecycle-denied-token",
        requiredScopes: ["security:audit:read"],
        projectId: "project-locked",
        actorId: "actor-1",
        rawLifecycleEvents: [{ requestPayload: "Bearer raw-denied-token" }],
        requestPayload: "raw denied request payload",
        providerEndpoint: "https://provider.example/denied",
        signedUrl: "https://storage.example/denied?token=raw-denied-url-token",
        path: "D:\\synthetic\\denied-audit-export.jsonl"
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const deniedRead = await handle({
      jsonrpc: "2.0",
      id: 592,
      method: "tools/call",
      params: {
        name: "testhistory.security-audit.export.lifecycle.replay.invariants.read",
        arguments: { apiUrl: "http://api.test", projectId: "project-locked", actorId: "actor-1" }
      }
    });
    const missingActor = await handle({
      jsonrpc: "2.0",
      id: 593,
      method: "tools/call",
      params: {
        name: "testhistory.security-audit.export.lifecycle.replay.invariants.read",
        arguments: { apiUrl: "http://api.test", projectId: "project-locked" }
      }
    });
    const refreshTool = await handle({
      jsonrpc: "2.0",
      id: 594,
      method: "tools/call",
      params: {
        name: "testhistory.security-audit.export.lifecycle.replay.invariants.refresh",
        arguments: { projectId: "project-locked", actorId: "actor-1" }
      }
    });
    const startTool = await handle({
      jsonrpc: "2.0",
      id: 595,
      method: "tools/call",
      params: {
        name: "testhistory.security-audit.export.lifecycle.start",
        arguments: { projectId: "project-locked", actorId: "actor-1" }
      }
    });

    const payload = JSON.parse(firstText(deniedRead)) as {
      status: string;
      code: number;
      permissionDenied: {
        error: string;
        requiredScopes: string[];
        rawLifecycleEvents?: unknown;
        requestPayload?: unknown;
        providerEndpoint?: unknown;
        signedUrl?: unknown;
        path?: unknown;
      };
      policy: {
        mutationAllowed: boolean;
        mcpReplayExecution: boolean;
        rawLifecycleEventsIncluded: boolean;
        rawRequestPayloadsIncluded: boolean;
      };
    };
    const serialized = firstText(deniedRead);

    expect(payload.status).toBe("error");
    expect(payload.code).toBe(403);
    expect(payload.permissionDenied).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        requiredScopes: ["security:audit:read"]
      })
    );
    expect(payload.permissionDenied.rawLifecycleEvents).toBeUndefined();
    expect(payload.permissionDenied.requestPayload).toBeUndefined();
    expect(payload.permissionDenied.providerEndpoint).toBeUndefined();
    expect(payload.permissionDenied.signedUrl).toBeUndefined();
    expect(payload.permissionDenied.path).toBeUndefined();
    expect(payload.policy).toEqual(
      expect.objectContaining({
        mutationAllowed: false,
        mcpReplayExecution: false,
        rawLifecycleEventsIncluded: false,
        rawRequestPayloadsIncluded: false
      })
    );
    expect(missingActor.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "actorId is required for security audit export lifecycle replay invariant reads"
      })
    );
    expect(refreshTool.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message:
          "Unknown tool: testhistory.security-audit.export.lifecycle.replay.invariants.refresh"
      })
    );
    expect(startTool.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "Unknown tool: testhistory.security-audit.export.lifecycle.start"
      })
    );
    expect(serialized).not.toContain("raw-lifecycle-denied-token");
    expect(serialized).not.toContain("raw-denied-token");
    expect(serialized).not.toContain("raw-denied-url-token");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("D:\\synthetic");
    expect(serialized).not.toContain("https://provider.example");
    expect(serialized).not.toContain("raw denied request payload");
  });

  it("reads materialized security audit export lifecycle invariants without provider execution", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return jsonResponse({
        kind: "security-audit-export-lifecycle-replay-invariants-materialized",
        project: { id: "project-1", scoped: true },
        actor: { id: "actor-1", scoped: true },
        replay: {
          status: "replayed",
          eventCount: 3,
          requestCount: 1,
          duplicateCount: 0,
          ignoredCount: 0,
          projectionDigest: "b".repeat(64),
          providerNeutral: false,
          rawLifecycleEvents: [{ payload: "Bearer materialized-lifecycle-token" }]
        },
        execution: {
          exportStarted: true,
          providerEndpointContacted: true,
          credentialsResolved: true,
          signedUrlsIssued: true,
          destinationResolved: true
        },
        page: {
          limit: 1,
          cursor: null,
          offset: 0,
          returned: 1,
          total: 1,
          nextCursor: null,
          hasMore: false
        },
        summary: {
          totalRequests: 1,
          requested: 1,
          evaluated: 1,
          approved: 0,
          denied: 1,
          cancelled: 0,
          expired: 0
        },
        items: [
          {
            requestId: "audit-export-materialized-1",
            status: "denied",
            eventCount: 3,
            actorIds: ["actor-1", "token=materialized-lifecycle-token"],
            reasonCodes: ["audit_export.policy_denied"],
            requestPayload: "raw materialized request payload",
            providerEndpoint: "https://provider.example/materialized",
            signedUrl: "https://storage.example/export?token=materialized-lifecycle-token",
            destination: { secretRef: "materialized-destination-secret" }
          }
        ],
        rawLifecycleEvents: [{ payload: "raw materialized lifecycle payload" }],
        credentials: { token: "materialized-lifecycle-token" },
        destination: { path: "D:\\synthetic\\materialized-export.jsonl" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const toolResponse = await handle({
      jsonrpc: "2.0",
      id: 596,
      method: "tools/call",
      params: {
        name: "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.read",
        arguments: {
          apiUrl: "http://api.test",
          projectId: "project-1",
          actorId: "actor-1",
          limit: 1
        }
      }
    });
    const resourceResponse = await handle({
      jsonrpc: "2.0",
      id: 597,
      method: "resources/read",
      params: {
        uri: "testhistory://projects/project-1/security/audit/export/lifecycle/replay/invariants/materialized?apiUrl=http%3A%2F%2Fapi.test&actorId=actor-1&limit=1"
      }
    });
    const schemaResponse = await handle({
      jsonrpc: "2.0",
      id: 598,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: { schema: "security-audit-export.lifecycle.replay.invariants.materialized" }
      }
    });
    const providerTool = await handle({
      jsonrpc: "2.0",
      id: 599,
      method: "tools/call",
      params: {
        name: "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.refresh",
        arguments: { projectId: "project-1", actorId: "actor-1" }
      }
    });

    const payload = JSON.parse(firstText(toolResponse)) as {
      kind: string;
      execution: {
        exportStarted: boolean;
        providerEndpointContacted: boolean;
        credentialsResolved: boolean;
        signedUrlsIssued: boolean;
        destinationResolved: boolean;
      };
      policy: {
        restParity: { method: string; path: string };
        providerNeutral: boolean;
        mutationAllowed: boolean;
        mcpReplayExecution: boolean;
        signedUrlsIncluded: boolean;
        credentialReferencesIncluded: boolean;
      };
    };
    const schema = JSON.parse(firstText(schemaResponse)) as {
      properties: { kind: { const: string } };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;
    const serialized = firstText(toolResponse);

    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/projects/project-1/security/audit/export/lifecycle/replay/invariants/materialized?actorId=actor-1&limit=1"
    );
    expect(headers).toEqual({
      "X-TestHistory-Scopes": "security:audit:read",
      "X-TestHistory-Project-Scope": "project-1",
      "X-TestHistory-Actor-Id": "actor-1"
    });
    expect(payload.kind).toBe("security-audit-export-lifecycle-replay-invariants-materialized");
    expect(payload.execution).toEqual({
      exportStarted: false,
      providerIntegration: false,
      providerEndpointContacted: false,
      credentialsResolved: false,
      signedUrlsIssued: false,
      destinationResolved: false
    });
    expect(payload.policy).toEqual(
      expect.objectContaining({
        restParity: {
          method: "GET",
          path: "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized"
        },
        providerNeutral: true,
        mutationAllowed: false,
        mcpReplayExecution: false,
        signedUrlsIncluded: false,
        credentialReferencesIncluded: false
      })
    );
    expect(JSON.parse(firstResourceText(resourceResponse))).toEqual(payload);
    expect(schema.properties.kind.const).toBe(
      "security-audit-export-lifecycle-replay-invariants-materialized"
    );
    expect(providerTool.error).toEqual(
      expect.objectContaining({
        message:
          "Unknown tool: testhistory.security-audit.export.lifecycle.replay.invariants.materialized.refresh"
      })
    );
    expect(serialized).not.toContain("materialized-lifecycle-token");
    expect(serialized).not.toContain("raw materialized request payload");
    expect(serialized).not.toContain("raw materialized lifecycle payload");
    expect(serialized).not.toContain("provider.example");
    expect(serialized).not.toContain("storage.example");
    expect(serialized).not.toContain("materialized-destination-secret");
    expect(serialized).not.toContain("D:\\synthetic");
  });
});
