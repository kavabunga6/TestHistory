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

describe("MCP tools part-12", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("guards materialized security audit export lifecycle transcripts with scoped GET-only reads", async () => {
    const restTranscript: Array<{
      method: string;
      url: string;
      headers: Record<string, string>;
    }> = [];
    const materializedKind = "security-audit-export-lifecycle-replay-invariants-materialized";
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      restTranscript.push({
        method: init?.method ?? "GET",
        url: input.toString(),
        headers: (init?.headers ?? {}) as Record<string, string>
      });

      const projectId = input.pathname.split("/")[4] ?? "";
      const actorId = input.searchParams.get("actorId") ?? "";
      if (projectId !== "project-1" || actorId !== "actor-1") {
        const deniedMarker =
          projectId !== "project-1"
            ? "wrong-project-materialized-token"
            : actorId === "actor-denied"
              ? "denied-materialized-token"
              : "wrong-actor-materialized-token";
        return deniedResponse({
          kind: materializedKind,
          error: "PermissionDeniedError",
          message: `Materialized lifecycle denied Authorization: Bearer ${deniedMarker}`,
          requiredScopes: ["security:audit:read"],
          project: { id: projectId, scoped: false, secret: deniedMarker },
          actor: { id: actorId, scoped: false, token: deniedMarker },
          access: {
            scope: "security:audit:read",
            projectScoped: false,
            actorScoped: false,
            mutation: true,
            redacted: false
          },
          rawLifecycleEvents: [{ payload: `raw denied materialized lifecycle ${deniedMarker}` }],
          requestPayload: `token=${deniedMarker}`,
          providerEndpoint: `https://provider.example/${deniedMarker}`,
          signedUrl: `https://storage.example/export?X-Amz-Signature=${deniedMarker}`,
          credentials: { token: deniedMarker }
        });
      }

      return jsonResponse({
        kind: materializedKind,
        project: {
          id: "project-1",
          scoped: true,
          providerEndpoint: "https://provider.example/project"
        },
        actor: { id: "actor-1", scoped: true, token: "allowed-materialized-token" },
        access: {
          scope: "security:audit:read",
          projectScoped: true,
          actorScoped: true,
          mutation: true,
          redacted: false
        },
        replay: {
          status: "replayed",
          eventCount: 2,
          requestCount: 1,
          duplicateCount: 0,
          ignoredCount: 0,
          projectionDigest: "c".repeat(64),
          appendOnly: true,
          deterministic: true,
          recomputable: true,
          rawEventsExposed: true,
          rawRequestsExposed: true,
          providerNeutral: false,
          rawLifecycleEvents: [{ body: "raw allowed materialized lifecycle payload" }]
        },
        execution: {
          exportStarted: true,
          providerIntegration: true,
          providerEndpointContacted: true,
          credentialsResolved: true,
          signedUrlsIssued: true,
          destinationResolved: true,
          providerEndpoint: "https://provider.example/export"
        },
        page: {
          limit: 2,
          cursor: "page-1",
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
          approved: 1,
          denied: 0,
          cancelled: 0,
          expired: 0
        },
        invariants: {
          appendOnly: true,
          deterministic: true,
          projectScoped: false,
          actorScoped: false,
          redacted: false,
          mutationFree: false,
          providerNeutral: false,
          rawEventsExposed: true,
          rawRequestsExposed: true,
          providerEndpointsContacted: true,
          signedUrlsIssued: true,
          secretsExposed: true
        },
        items: [
          {
            requestId: "audit-export-materialized-transcript-1",
            status: "approved",
            eventCount: 2,
            lastEventAt: "2026-05-30T10:00:00.000Z",
            actorIds: ["actor-1", "token=allowed-materialized-token"],
            decisionStatus: "allowed",
            reasonCodes: ["audit_export.allowed", "secret=allowed-materialized-token"],
            timeline: {
              requestedAt: "2026-05-30T09:59:58.000Z",
              evaluatedAt: "2026-05-30T09:59:59.000Z",
              decidedAt: "2026-05-30T10:00:00.000Z"
            },
            rawLifecycleEvents: [{ body: "raw item materialized lifecycle payload" }],
            requestPayload: "Authorization: Bearer allowed-materialized-token",
            providerEndpoint: "https://provider.example/item",
            signedUrl: "https://storage.example/item?token=allowed-materialized-token",
            destination: {
              secretRef: "allowed-materialized-destination-secret",
              path: "D:\\synthetic\\allowed-materialized-export.jsonl"
            }
          }
        ],
        rawLifecycleEvents: [{ body: "raw root materialized lifecycle payload" }],
        requestPayload: "raw root materialized request payload",
        providerEndpoint: "https://provider.example/root",
        signedUrl: "https://storage.example/root?token=allowed-materialized-token",
        credentials: { token: "allowed-materialized-token" },
        destination: {
          secretRef: "allowed-materialized-destination-secret",
          path: "D:\\synthetic\\allowed-materialized-export.jsonl"
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const beforeTools = await handle({ jsonrpc: "2.0", id: 640, method: "tools/list" });
    const allowedRead = await handle({
      jsonrpc: "2.0",
      id: 641,
      method: "tools/call",
      params: {
        name: "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.read",
        arguments: {
          apiUrl: "http://api.test",
          projectId: "project-1",
          actorId: "actor-1",
          limit: 2,
          cursor: "page-1"
        }
      }
    });
    const deniedRead = await handle({
      jsonrpc: "2.0",
      id: 642,
      method: "tools/call",
      params: {
        name: "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.read",
        arguments: { apiUrl: "http://api.test", projectId: "project-1", actorId: "actor-denied" }
      }
    });
    const wrongProjectRead = await handle({
      jsonrpc: "2.0",
      id: 643,
      method: "tools/call",
      params: {
        name: "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.read",
        arguments: {
          apiUrl: "http://api.test",
          projectId: "project-other",
          actorId: "actor-1"
        }
      }
    });
    const wrongActorRead = await handle({
      jsonrpc: "2.0",
      id: 644,
      method: "tools/call",
      params: {
        name: "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.read",
        arguments: {
          apiUrl: "http://api.test",
          projectId: "project-1",
          actorId: "actor-other"
        }
      }
    });
    const mutationResponses = await Promise.all(
      [
        "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.refresh",
        "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.replay",
        "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.write",
        "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.delete",
        "testhistory.security-audit.export.lifecycle.start",
        "testhistory.security-audit.export.lifecycle.retry",
        "testhistory.security-audit.export.lifecycle.provider.call",
        "testhistory.security-audit.export.lifecycle.artifact.create"
      ].map((name, index) =>
        handle({
          jsonrpc: "2.0",
          id: 645 + index,
          method: "tools/call",
          params: {
            name,
            arguments: {
              apiUrl: "http://api.test",
              projectId: "project-1",
              actorId: "actor-1",
              requestPayload: "Authorization: Bearer mutation-shaped-token",
              providerEndpoint: "https://provider.example/mutation",
              signedUrl: "https://storage.example/mutation?token=mutation-shaped-token"
            }
          }
        })
      )
    );
    const afterTools = await handle({ jsonrpc: "2.0", id: 653, method: "tools/list" });

    const beforeToolNames = (beforeTools.result as { tools: Array<{ name: string }> }).tools.map(
      (tool) => tool.name
    );
    const afterToolNames = (afterTools.result as { tools: Array<{ name: string }> }).tools.map(
      (tool) => tool.name
    );
    const lifecycleMaterializedTools = beforeToolNames.filter((name) =>
      name.startsWith("testhistory.security-audit.export.lifecycle.replay.invariants.materialized")
    );
    const allowedPayload = JSON.parse(firstText(allowedRead)) as {
      project: { id: string; scoped: boolean };
      actor: { id: string; scoped: boolean };
      access: {
        scope: string;
        projectScoped: boolean;
        actorScoped: boolean;
        mutation: boolean;
        redacted: boolean;
      };
      execution: {
        exportStarted: boolean;
        providerIntegration: boolean;
        providerEndpointContacted: boolean;
        credentialsResolved: boolean;
        signedUrlsIssued: boolean;
        destinationResolved: boolean;
      };
      invariants: {
        projectScoped: boolean;
        actorScoped: boolean;
        redacted: boolean;
        mutationFree: boolean;
        providerNeutral: boolean;
        rawEventsExposed: boolean;
        rawRequestsExposed: boolean;
        providerEndpointsContacted: boolean;
        signedUrlsIssued: boolean;
        secretsExposed: boolean;
      };
      items: Array<{
        requestId: string;
        actorIds: string[];
        reasonCodes: string[];
        rawLifecycleEvents?: unknown;
        requestPayload?: unknown;
        providerEndpoint?: unknown;
        signedUrl?: unknown;
        destination?: unknown;
      }>;
      policy: {
        restParity: { method: string; path: string };
        equalOrNarrowerThanRest: boolean;
        providerNeutral: boolean;
        mutationAllowed: boolean;
        mcpReplayExecution: boolean;
        rawLifecycleEventsIncluded: boolean;
        rawRequestPayloadsIncluded: boolean;
        providerEndpointsIncluded: boolean;
        signedUrlsIncluded: boolean;
        credentialReferencesIncluded: boolean;
      };
    };
    const deniedPayloads = [deniedRead, wrongProjectRead, wrongActorRead].map(
      (response) =>
        JSON.parse(firstText(response)) as {
          status: string;
          code: number;
          permissionDenied: {
            kind: string;
            requiredScopes: string[];
            rawLifecycleEvents?: unknown;
            requestPayload?: unknown;
            providerEndpoint?: unknown;
            signedUrl?: unknown;
            credentials?: unknown;
          };
          policy: {
            restParity: { method: string };
            equalOrNarrowerThanRest: boolean;
            mutationAllowed: boolean;
            rawLifecycleEventsIncluded: boolean;
            rawRequestPayloadsIncluded: boolean;
            providerEndpointsIncluded: boolean;
            signedUrlsIncluded: boolean;
            credentialReferencesIncluded: boolean;
          };
        }
    );
    const transcript = {
      toolsBefore: beforeToolNames,
      toolsAfter: afterToolNames,
      allowed: allowedRead,
      denied: deniedRead,
      wrongProject: wrongProjectRead,
      wrongActor: wrongActorRead,
      mutations: mutationResponses
    };
    const serializedTranscript = JSON.stringify(transcript);

    expect(beforeToolNames).toEqual(afterToolNames);
    expect(lifecycleMaterializedTools).toEqual([
      "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.read"
    ]);
    expect(beforeToolNames).not.toEqual(
      expect.arrayContaining([
        "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.refresh",
        "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.write",
        "testhistory.security-audit.export.lifecycle.start",
        "testhistory.security-audit.export.lifecycle.provider.call",
        "testhistory.security-audit.export.lifecycle.artifact.create"
      ])
    );

    expect(restTranscript).toEqual([
      {
        method: "GET",
        url: "http://api.test/api/v1/projects/project-1/security/audit/export/lifecycle/replay/invariants/materialized?actorId=actor-1&limit=2&cursor=page-1",
        headers: {
          "X-TestHistory-Scopes": "security:audit:read",
          "X-TestHistory-Project-Scope": "project-1",
          "X-TestHistory-Actor-Id": "actor-1"
        }
      },
      {
        method: "GET",
        url: "http://api.test/api/v1/projects/project-1/security/audit/export/lifecycle/replay/invariants/materialized?actorId=actor-denied&limit=100",
        headers: {
          "X-TestHistory-Scopes": "security:audit:read",
          "X-TestHistory-Project-Scope": "project-1",
          "X-TestHistory-Actor-Id": "actor-denied"
        }
      },
      {
        method: "GET",
        url: "http://api.test/api/v1/projects/project-other/security/audit/export/lifecycle/replay/invariants/materialized?actorId=actor-1&limit=100",
        headers: {
          "X-TestHistory-Scopes": "security:audit:read",
          "X-TestHistory-Project-Scope": "project-other",
          "X-TestHistory-Actor-Id": "actor-1"
        }
      },
      {
        method: "GET",
        url: "http://api.test/api/v1/projects/project-1/security/audit/export/lifecycle/replay/invariants/materialized?actorId=actor-other&limit=100",
        headers: {
          "X-TestHistory-Scopes": "security:audit:read",
          "X-TestHistory-Project-Scope": "project-1",
          "X-TestHistory-Actor-Id": "actor-other"
        }
      }
    ]);
    expect(restTranscript.every((entry) => entry.method === "GET")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    expect(allowedPayload.project).toEqual({ id: "project-1", scoped: true });
    expect(allowedPayload.actor).toEqual({ id: "actor-1", scoped: true });
    expect(allowedPayload.access).toEqual({
      scope: "security:audit:read",
      projectScoped: true,
      actorScoped: true,
      mutation: false,
      redacted: true
    });
    expect(allowedPayload.execution).toEqual({
      exportStarted: false,
      providerIntegration: false,
      providerEndpointContacted: false,
      credentialsResolved: false,
      signedUrlsIssued: false,
      destinationResolved: false
    });
    expect(allowedPayload.invariants).toEqual(
      expect.objectContaining({
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
    expect(allowedPayload.items[0]).toEqual(
      expect.objectContaining({
        requestId: "audit-export-materialized-transcript-1",
        actorIds: ["actor-1", "[redacted]"],
        reasonCodes: ["audit_export.allowed", "[redacted]"]
      })
    );
    expect(allowedPayload.items[0]?.rawLifecycleEvents).toBeUndefined();
    expect(allowedPayload.items[0]?.requestPayload).toBeUndefined();
    expect(allowedPayload.items[0]?.providerEndpoint).toBeUndefined();
    expect(allowedPayload.items[0]?.signedUrl).toBeUndefined();
    expect(allowedPayload.items[0]?.destination).toBeUndefined();
    expect(allowedPayload.policy).toEqual(
      expect.objectContaining({
        restParity: {
          method: "GET",
          path: "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized"
        },
        equalOrNarrowerThanRest: true,
        providerNeutral: true,
        mutationAllowed: false,
        mcpReplayExecution: false,
        rawLifecycleEventsIncluded: false,
        rawRequestPayloadsIncluded: false,
        providerEndpointsIncluded: false,
        signedUrlsIncluded: false,
        credentialReferencesIncluded: false
      })
    );

    for (const deniedPayload of deniedPayloads) {
      expect(deniedPayload).toEqual(
        expect.objectContaining({
          status: "error",
          code: 403,
          permissionDenied: expect.objectContaining({
            kind: materializedKind,
            requiredScopes: ["security:audit:read"]
          }),
          policy: expect.objectContaining({
            restParity: expect.objectContaining({ method: "GET" }),
            equalOrNarrowerThanRest: true,
            mutationAllowed: false,
            rawLifecycleEventsIncluded: false,
            rawRequestPayloadsIncluded: false,
            providerEndpointsIncluded: false,
            signedUrlsIncluded: false,
            credentialReferencesIncluded: false
          })
        })
      );
      expect(deniedPayload.permissionDenied.rawLifecycleEvents).toBeUndefined();
      expect(deniedPayload.permissionDenied.requestPayload).toBeUndefined();
      expect(deniedPayload.permissionDenied.providerEndpoint).toBeUndefined();
      expect(deniedPayload.permissionDenied.signedUrl).toBeUndefined();
      expect(deniedPayload.permissionDenied.credentials).toBeUndefined();
    }
    expect(mutationResponses.map((response) => response.error)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            "Unknown tool: testhistory.security-audit.export.lifecycle.replay.invariants.materialized.refresh"
        }),
        expect.objectContaining({
          message:
            "Unknown tool: testhistory.security-audit.export.lifecycle.replay.invariants.materialized.replay"
        }),
        expect.objectContaining({
          message:
            "Unknown tool: testhistory.security-audit.export.lifecycle.replay.invariants.materialized.write"
        }),
        expect.objectContaining({
          message:
            "Unknown tool: testhistory.security-audit.export.lifecycle.replay.invariants.materialized.delete"
        }),
        expect.objectContaining({
          message: "Unknown tool: testhistory.security-audit.export.lifecycle.start"
        }),
        expect.objectContaining({
          message: "Unknown tool: testhistory.security-audit.export.lifecycle.retry"
        }),
        expect.objectContaining({
          message: "Unknown tool: testhistory.security-audit.export.lifecycle.provider.call"
        }),
        expect.objectContaining({
          message: "Unknown tool: testhistory.security-audit.export.lifecycle.artifact.create"
        })
      ])
    );
    expect(serializedTranscript).not.toContain("allowed-materialized-token");
    expect(serializedTranscript).not.toContain("denied-materialized-token");
    expect(serializedTranscript).not.toContain("wrong-project-materialized-token");
    expect(serializedTranscript).not.toContain("wrong-actor-materialized-token");
    expect(serializedTranscript).not.toContain("mutation-shaped-token");
    expect(serializedTranscript).not.toContain("Authorization");
    expect(serializedTranscript).not.toContain("Bearer");
    expect(serializedTranscript).not.toContain("provider.example");
    expect(serializedTranscript).not.toContain("storage.example");
    expect(serializedTranscript).not.toContain("X-Amz-Signature");
    expect(serializedTranscript).not.toContain("D:\\synthetic");
    expect(serializedTranscript).not.toContain("allowed-materialized-destination-secret");
    expect(serializedTranscript).not.toContain('"rawLifecycleEvents"');
    expect(serializedTranscript).not.toContain('"requestPayload"');
    expect(serializedTranscript).not.toContain('"providerEndpoint"');
    expect(serializedTranscript).not.toContain('"signedUrl"');
    expect(serializedTranscript).not.toContain('"credentials"');
    expect(serializedTranscript).not.toContain('"destination"');
  });

  it("keeps materialized security audit export lifecycle schema and transcript drift equal-or-narrower than REST", async () => {
    const sensitiveHeaderPayload = `${joinedSensitiveMarker("Authoriza", "tion")}: ${joinedSensitiveMarker(
      "Bea",
      "rer"
    )} synthetic-secret-marker`;
    const unsafeUrlField = joinedSensitiveMarker("signed", "Url");
    const unsafeUrlValue = joinedSensitiveMarker(
      "https://storage",
      ".example/export?",
      "X-Amz-",
      "Signature",
      "=synthetic-secret-marker"
    );
    const rootUnsafeUrlValue = joinedSensitiveMarker(
      "https://storage",
      ".example/root?",
      "X-Amz-",
      "Signature",
      "=synthetic-secret-marker"
    );
    const mutationUnsafeUrlValue = joinedSensitiveMarker(
      "https://storage",
      ".example/mutation?",
      "X-Amz-",
      "Signature",
      "=synthetic-secret-marker"
    );
    const storageRefField = joinedSensitiveMarker("storage", "Ref");
    const materializedStorageRef = joinedSensitiveMarker("storage", "://audit-export/materialized");
    const rootStorageRef = joinedSensitiveMarker("storage", "://audit-export/root");
    const restTranscript: Array<{
      method: string;
      url: string;
      headers: Record<string, string>;
      body?: unknown;
    }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      restTranscript.push({
        method: init?.method ?? "GET",
        url: input.toString(),
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: init?.body
      });

      return jsonResponse({
        kind: "security-audit-export-lifecycle-replay-invariants-materialized",
        project: {
          id: "project-1",
          scoped: true,
          providerRuntime: "provider-runtime"
        },
        actor: { id: "actor-1", scoped: true, credential: "synthetic-secret-marker" },
        replay: {
          status: "replayed",
          eventCount: 5,
          requestCount: 2,
          duplicateCount: 1,
          ignoredCount: 0,
          projectionDigest: "d".repeat(64),
          rawLifecycleEvents: [{ body: "synthetic-secret-marker" }],
          providerNeutral: false
        },
        execution: {
          exportStarted: true,
          providerIntegration: true,
          providerEndpointContacted: true,
          credentialsResolved: true,
          signedUrlsIssued: true,
          destinationResolved: true,
          providerActions: true,
          deletionExecution: true
        },
        page: {
          limit: 2,
          cursor: "page-2",
          offset: 2,
          returned: 1,
          total: 3,
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
        items: [
          {
            requestId: "audit-export-materialized-drift-1",
            status: "approved",
            eventCount: 5,
            lastEventAt: "2026-05-30T12:00:00.000Z",
            actorIds: ["actor-1", "credential=synthetic-secret-marker"],
            decisionStatus: "allowed",
            reasonCodes: ["audit_export.allowed", "secret=synthetic-secret-marker"],
            timeline: {
              requestedAt: "2026-05-30T11:59:58.000Z",
              evaluatedAt: "2026-05-30T11:59:59.000Z",
              decidedAt: "2026-05-30T12:00:00.000Z"
            },
            rawLifecycleEvents: [{ body: "synthetic-secret-marker" }],
            requestPayload: sensitiveHeaderPayload,
            providerEndpoint: "https://provider.example/export",
            [unsafeUrlField]: unsafeUrlValue,
            [storageRefField]: materializedStorageRef,
            credentials: { secret: "synthetic-secret-marker" },
            destination: { credentialRef: "synthetic-secret-marker" },
            providerRuntime: "provider-runtime",
            providerActions: true,
            deletionExecution: true,
            rawPayload: { marker: "synthetic-secret-marker" }
          }
        ],
        rawLifecycleEvents: [{ body: "synthetic-secret-marker" }],
        requestPayload: sensitiveHeaderPayload,
        providerEndpoint: "https://provider.example/root",
        [unsafeUrlField]: rootUnsafeUrlValue,
        [storageRefField]: rootStorageRef,
        credentials: { secret: "synthetic-secret-marker" },
        destination: { credentialRef: "synthetic-secret-marker" },
        providerRuntime: "provider-runtime",
        providerActions: true,
        deletionExecution: true,
        rawPayload: { marker: "synthetic-secret-marker" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const toolsResponse = await handle({ jsonrpc: "2.0", id: 654, method: "tools/list" });
    const resourcesResponse = await handle({ jsonrpc: "2.0", id: 655, method: "resources/list" });
    const schemaResponse = await handle({
      jsonrpc: "2.0",
      id: 656,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: { schema: "security-audit-export.lifecycle.replay.invariants.materialized" }
      }
    });
    const readResponse = await handle({
      jsonrpc: "2.0",
      id: 657,
      method: "tools/call",
      params: {
        name: "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.read",
        arguments: {
          apiUrl: "http://api.test",
          projectId: "project-1",
          actorId: "actor-1",
          limit: 2,
          cursor: "page-2"
        }
      }
    });
    const mutationResponses = await Promise.all(
      [
        "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.refresh",
        "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.write",
        "testhistory.security-audit.export.lifecycle.provider.call",
        "testhistory.security-audit.export.lifecycle.destination.resolve"
      ].map((name, index) =>
        handle({
          jsonrpc: "2.0",
          id: 658 + index,
          method: "tools/call",
          params: {
            name,
            arguments: {
              apiUrl: "http://api.test",
              projectId: "project-1",
              actorId: "actor-1",
              requestPayload: sensitiveHeaderPayload,
              [unsafeUrlField]: mutationUnsafeUrlValue
            }
          }
        })
      )
    );

    const tools = (toolsResponse.result as { tools: Array<{ name: string; inputSchema: unknown }> })
      .tools;
    const resources = (
      resourcesResponse.result as {
        resources: Array<{ uri: string; description: string }>;
      }
    ).resources;
    const materializedTools = tools.filter((tool) =>
      tool.name.startsWith(
        "testhistory.security-audit.export.lifecycle.replay.invariants.materialized"
      )
    );
    const materializedResources = resources.filter((resource) =>
      resource.uri.includes("/security/audit/export/lifecycle/replay/invariants/materialized")
    );
    const materializedTool = materializedTools[0] as {
      name: string;
      inputSchema: {
        additionalProperties: boolean;
        required: string[];
        properties: Record<string, unknown>;
      };
    };
    const schema = JSON.parse(firstText(schemaResponse)) as {
      title: string;
      properties: { kind: { const: string } };
      $defs: {
        execution: {
          properties: {
            exportStarted: { const: boolean };
            providerIntegration: { const: boolean };
            providerEndpointContacted: { const: boolean };
            credentialsResolved: { const: boolean };
            signedUrlsIssued: { const: boolean };
            destinationResolved: { const: boolean };
          };
        };
        policy: {
          properties: {
            equalOrNarrowerThanRest: { const: boolean };
            providerNeutral: { const: boolean };
            mutationAllowed: { const: boolean };
            mcpReplayExecution: { const: boolean };
            rawLifecycleEventsIncluded: { const: boolean };
            rawRequestPayloadsIncluded: { const: boolean };
            providerEndpointsIncluded: { const: boolean };
            signedUrlsIncluded: { const: boolean };
            credentialReferencesIncluded: { const: boolean };
          };
        };
      };
    };
    const payload = JSON.parse(firstText(readResponse)) as {
      kind: string;
      project: { id: string; scoped: boolean };
      actor: { id: string; scoped: boolean };
      replay: { providerNeutral: boolean; rawEventsExposed: boolean; rawRequestsExposed: boolean };
      execution: {
        exportStarted: boolean;
        providerIntegration: boolean;
        providerEndpointContacted: boolean;
        credentialsResolved: boolean;
        signedUrlsIssued: boolean;
        destinationResolved: boolean;
      };
      policy: {
        restParity: { method: string; path: string };
        equalOrNarrowerThanRest: boolean;
        providerNeutral: boolean;
        mutationAllowed: boolean;
        mcpReplayExecution: boolean;
        rawLifecycleEventsIncluded: boolean;
        rawRequestPayloadsIncluded: boolean;
        providerEndpointsIncluded: boolean;
        signedUrlsIncluded: boolean;
        credentialReferencesIncluded: boolean;
      };
      items: Array<Record<string, unknown>>;
    };
    const schemaText = JSON.stringify(schema);
    const transcript = JSON.stringify({
      schema,
      payload,
      mutations: mutationResponses,
      resources: materializedResources,
      tools: materializedTools.map((tool) => tool.name)
    });

    expect(materializedTools.map((tool) => tool.name)).toEqual([
      "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.read"
    ]);
    expect(materializedTool.inputSchema.additionalProperties).toBe(false);
    expect(materializedTool.inputSchema.required).toEqual(["projectId", "actorId"]);
    expect(Object.keys(materializedTool.inputSchema.properties).sort()).toEqual([
      "actorId",
      "apiUrl",
      "cursor",
      "limit",
      "projectId"
    ]);
    expect(materializedResources).toHaveLength(1);
    expect(materializedResources[0]?.uri).toBe(
      "testhistory://projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized"
    );
    expect(materializedResources[0]?.description).toContain("Read-only paginated materialized");
    expect(materializedResources[0]?.description).toContain("omits raw lifecycle events");

    expect(schema.title).toBe(
      "TestHistorySecurityAuditExportLifecycleReplayInvariantMaterializedRead"
    );
    expect(schema.properties.kind.const).toBe(
      "security-audit-export-lifecycle-replay-invariants-materialized"
    );
    expect(schema.$defs.execution.properties.exportStarted.const).toBe(false);
    expect(schema.$defs.execution.properties.providerIntegration.const).toBe(false);
    expect(schema.$defs.execution.properties.providerEndpointContacted.const).toBe(false);
    expect(schema.$defs.execution.properties.credentialsResolved.const).toBe(false);
    expect(schema.$defs.execution.properties.signedUrlsIssued.const).toBe(false);
    expect(schema.$defs.execution.properties.destinationResolved.const).toBe(false);
    expect(schema.$defs.policy.properties.equalOrNarrowerThanRest.const).toBe(true);
    expect(schema.$defs.policy.properties.providerNeutral.const).toBe(true);
    expect(schema.$defs.policy.properties.mutationAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.mcpReplayExecution.const).toBe(false);
    expect(schema.$defs.policy.properties.rawLifecycleEventsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.rawRequestPayloadsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.providerEndpointsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.signedUrlsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.credentialReferencesIncluded.const).toBe(false);
    expect(schemaText).not.toContain('"providerEndpoint"');
    expect(schemaText).not.toContain(joinedSensitiveMarker('"signed', 'Url"'));
    expect(schemaText).not.toContain(joinedSensitiveMarker('"storage', 'Ref"'));
    expect(schemaText).not.toContain('"rawPayload"');

    expect(restTranscript).toEqual([
      {
        method: "GET",
        url: "http://api.test/api/v1/projects/project-1/security/audit/export/lifecycle/replay/invariants/materialized?actorId=actor-1&limit=2&cursor=page-2",
        headers: {
          "X-TestHistory-Scopes": "security:audit:read",
          "X-TestHistory-Project-Scope": "project-1",
          "X-TestHistory-Actor-Id": "actor-1"
        },
        body: undefined
      }
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      mutationResponses.every((response) => response.error?.message.startsWith("Unknown tool: "))
    ).toBe(true);

    expect(payload.kind).toBe("security-audit-export-lifecycle-replay-invariants-materialized");
    expect(payload.project).toEqual({ id: "project-1", scoped: true });
    expect(payload.actor).toEqual({ id: "actor-1", scoped: true });
    expect(payload.replay).toEqual(
      expect.objectContaining({
        providerNeutral: true,
        rawEventsExposed: false,
        rawRequestsExposed: false
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
    expect(payload.policy).toEqual(
      expect.objectContaining({
        restParity: {
          method: "GET",
          path: "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized"
        },
        equalOrNarrowerThanRest: true,
        providerNeutral: true,
        mutationAllowed: false,
        mcpReplayExecution: false,
        rawLifecycleEventsIncluded: false,
        rawRequestPayloadsIncluded: false,
        providerEndpointsIncluded: false,
        signedUrlsIncluded: false,
        credentialReferencesIncluded: false
      })
    );
    expect(payload.items[0]).toEqual({
      requestId: "audit-export-materialized-drift-1",
      status: "approved",
      eventCount: 5,
      lastEventAt: "2026-05-30T12:00:00.000Z",
      actorIds: ["actor-1", "[redacted]"],
      decisionStatus: "allowed",
      reasonCodes: ["audit_export.allowed", "[redacted]"],
      timeline: {
        requestedAt: "2026-05-30T11:59:58.000Z",
        evaluatedAt: "2026-05-30T11:59:59.000Z",
        decidedAt: "2026-05-30T12:00:00.000Z"
      }
    });
    expectNoSecurityAuditExportLifecycleSensitiveTranscriptLeak(transcript);
  });

  it("returns structured error payloads consistently for missing REST entities", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "not used" }), {
          status: 404,
          statusText: "Not Found",
          headers: { "content-type": "application/json" }
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const launchResponse = await handle({
      jsonrpc: "2.0",
      id: 39,
      method: "resources/read",
      params: { uri: "testhistory://launches/missing?apiUrl=http%3A%2F%2Fapi.test" }
    });
    const historyResponse = await handle({
      jsonrpc: "2.0",
      id: 40,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history",
        arguments: { apiUrl: "http://api.test", testCaseId: "missing" }
      }
    });

    expect(JSON.parse(firstResourceText(launchResponse))).toEqual(
      expect.objectContaining({
        status: "error",
        code: 404,
        message: "Not Found",
        url: "http://api.test/api/v1/launches/missing"
      })
    );
    expect(JSON.parse(firstText(historyResponse))).toEqual(
      expect.objectContaining({
        status: "error",
        code: 404,
        message: "Not Found",
        url: "http://api.test/api/v1/test-cases/missing/history?limit=20"
      })
    );
  });

  it("passes REST permission denials through for project and launch reads", async () => {
    const fetchMock = vi.fn(async (input: URL) => {
      if (input.pathname === "/api/v1/projects") {
        return deniedResponse({
          error: "permission_denied",
          message: "Project access denied",
          reason: "project_access_denied",
          requiredScopes: ["projects:read"],
          projectId: "project-locked",
          resource: { type: "project", id: "project-locked" }
        });
      }
      if (input.pathname === "/api/v1/launches/launch-locked") {
        return deniedResponse({
          error: "permission_denied",
          message: "Launch access denied",
          reason: "insufficient_scope",
          requiredScopes: ["launches:read"],
          projectId: "project-locked",
          resource: { type: "launch", id: "launch-locked" }
        });
      }
      return jsonResponse([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const projectsResponse = await handle({
      jsonrpc: "2.0",
      id: 41,
      method: "tools/call",
      params: { name: "testhistory.projects.find", arguments: { apiUrl: "http://api.test" } }
    });
    const launchResponse = await handle({
      jsonrpc: "2.0",
      id: 42,
      method: "resources/read",
      params: {
        uri: "testhistory://launches/launch-locked?apiUrl=http%3A%2F%2Fapi.test"
      }
    });
    expect(JSON.parse(firstText(projectsResponse))).toEqual(
      expect.objectContaining({
        status: "error",
        code: 403,
        permissionDenied: expect.objectContaining({
          error: "permission_denied",
          reason: "project_access_denied",
          requiredScopes: ["projects:read"]
        })
      })
    );
    expect(JSON.parse(firstResourceText(launchResponse))).toEqual(
      expect.objectContaining({
        status: "error",
        code: 403,
        permissionDenied: expect.objectContaining({
          reason: "insufficient_scope",
          requiredScopes: ["launches:read"]
        })
      })
    );
  });
});
