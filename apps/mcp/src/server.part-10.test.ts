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

describe("MCP tools part-10", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads persisted history compare permission audit replay invariants with REST parity and redaction", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return jsonResponse({
        kind: "test-case-history-compare-permission-audit-replay-invariants-persisted",
        projectId: "project-1",
        testCaseId: "case-audit",
        actor: { type: "actor", actorId: "actor-1", scoped: true },
        access: {
          scope: "test-cases:read",
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        availability: {
          status: "ready",
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          partial: false,
          unavailable: []
        },
        query: {
          projectId: "project-1",
          actorId: "actor-1",
          testCaseId: "case-audit",
          comparePairScoped: true,
          pagination: { limit: 1, cursor: "1", offset: 1 }
        },
        invariant: {
          deterministic: true,
          recomputable: true,
          projectScoped: true,
          actorScoped: { passed: true, actorId: "actor-1", leakedActorIds: [] },
          projectionDigest: "persisted-digest",
          recomputedDigest: "persisted-digest"
        },
        appendOnly: {
          uniqueProjectedEventIds: true,
          duplicateEventIds: [],
          totalProjectedEventIds: 1,
          projectedEventIds: ["persisted-raw-result-uuid"]
        },
        rawCompareInputs: {
          included: false,
          preserved: true,
          digestCount: 1,
          itemCount: 2,
          raw: [{ token: "persisted-permission-token" }]
        },
        page: {
          limit: 1,
          cursor: "1",
          offset: 1,
          returned: 1,
          total: 3,
          nextCursor: "2",
          hasMore: true
        },
        items: [
          {
            ordinal: 0,
            eventId: "history-compare-permission:persisted-1",
            rawHistory: { path: "C:\\synthetic\\permission\\raw.json" }
          }
        ],
        redaction: {
          passed: false,
          leakedMarkerCount: 3,
          leakedMarkers: [
            "token=persisted-permission-token",
            "C:\\synthetic\\permission\\raw.json",
            "storage://project-1/permission/persisted"
          ],
          rawHistoryIncluded: false,
          rawCompareInputsIncluded: false,
          hiddenOrMaskedValuesIncluded: false,
          tokensIncluded: false,
          pathsIncluded: false,
          storageLocationsIncluded: false,
          artifactUrlsIncluded: false
        },
        baseResult: {
          uuid: "result-1",
          payload: "persisted-base-raw-payload"
        },
        targetResult: {
          uuid: "result-2",
          payload: "persisted-target-raw-payload"
        },
        history: [{ body: "persisted-history-raw-payload" }],
        rawHistory: [{ body: "Authorization: Bearer persisted-permission-token" }],
        compareInputs: { hidden: "persisted-permission-token" },
        localPath: "C:\\synthetic\\permission\\persisted.json",
        path: "C:\\synthetic\\permission\\persisted.json",
        storageKey: "project-1/permission/persisted.json",
        storageRef: "storage://project-1/permission/persisted",
        signedUrl: "https://storage.example/persisted?X-Amz-Signature=raw",
        downloadUrl: "https://storage.example/download?token=persisted-permission-token",
        token: "persisted-permission-token",
        authorization: "Bearer persisted-permission-token"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const toolResponse = await handle({
      jsonrpc: "2.0",
      id: 621,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.read",
        arguments: {
          apiUrl: "http://api.test",
          testCaseId: "case-audit",
          projectId: "project-1",
          actorId: "actor-1",
          baseResultUuid: "result-1",
          targetResultUuid: "result-2",
          limit: 1,
          cursor: "1"
        }
      }
    });
    const resourceResponse = await handle({
      jsonrpc: "2.0",
      id: 622,
      method: "resources/read",
      params: {
        uri: "testhistory://test-cases/case-audit/history/compare/permission-audit/replay/invariants/persisted?apiUrl=http%3A%2F%2Fapi.test&projectId=project-1&actorId=actor-1&baseResultUuid=result-1&targetResultUuid=result-2&limit=1&cursor=1"
      }
    });
    const schemaResponse = await handle({
      jsonrpc: "2.0",
      id: 623,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: {
          schema: "test-case.history.compare.permission-audit.replay.invariants.persisted"
        }
      }
    });
    const refreshResponse = await handle({
      jsonrpc: "2.0",
      id: 624,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.refresh",
        arguments: { projectId: "project-1" }
      }
    });

    const payload = JSON.parse(firstText(toolResponse)) as {
      kind: string;
      access: { scope: string; actorScoped: boolean; mutation: boolean; redacted: boolean };
      query: {
        actorId: string;
        testCaseId: string;
        comparePairScoped: boolean;
        pagination: { limit: number; cursor: string; offset: number };
      };
      rawCompareInputs: {
        included: false;
        preserved: boolean;
        digestCount: number;
        itemCount: number;
      };
      redaction: {
        rawHistoryIncluded: boolean;
        rawCompareInputsIncluded: boolean;
        tokensIncluded: boolean;
        pathsIncluded: boolean;
        storageLocationsIncluded: boolean;
        artifactUrlsIncluded: boolean;
      };
      page: { limit: number; cursor: string; returned: number; total: number; nextCursor: string };
      items: Array<{ ordinal: number; eventId: string; redacted: boolean; rawHistory?: unknown }>;
      policy: {
        restParity: { path: string };
        headersForwarded: string[];
        mutationAllowed: boolean;
        equalOrNarrowerThanRest: boolean;
        rawHistoryIncluded: boolean;
        rawCompareInputsIncluded: boolean;
        mcpReplayExecution: boolean;
        mcpWorkerExecution: boolean;
        providerRuntimeMetadataIncluded: boolean;
        providerRuntimeToolsAdvertised: boolean;
        persistedInvariantReadModel: boolean;
        deniedStateMasked: boolean;
      };
    };
    const schema = JSON.parse(firstText(schemaResponse)) as {
      properties: { kind: { const: string } };
      $defs: {
        policy: {
          required: string[];
          properties: {
            mutationAllowed: { const: boolean };
            equalOrNarrowerThanRest: { const: boolean };
            rawHistoryIncluded: { const: boolean };
            rawCompareInputsIncluded: { const: boolean };
            mcpReplayExecution: { const: boolean };
            mcpWorkerExecution: { const: boolean };
            providerRuntimeMetadataIncluded: { const: boolean };
            providerRuntimeToolsAdvertised: { const: boolean };
            persistedInvariantReadModel: { const: boolean };
          };
        };
      };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;
    const serialized = firstText(toolResponse);

    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/test-cases/case-audit/history/compare/permission-audit/replay/invariants/persisted?projectId=project-1&baseResultUuid=result-1&targetResultUuid=result-2&limit=1&cursor=1"
    );
    expect(fetchedRequests[0]?.init?.method ?? "GET").toBe("GET");
    expect(headers).toEqual({
      "X-TestHistory-Scopes": "test-cases:read",
      "X-TestHistory-Project-Scope": "project-1",
      "X-TestHistory-Actor-Id": "actor-1"
    });
    expect(payload.kind).toBe(
      "test-case-history-compare-permission-audit-replay-invariants-persisted"
    );
    expect(payload.access).toEqual(
      expect.objectContaining({
        scope: "test-cases:read",
        actorScoped: true,
        mutation: false,
        redacted: true
      })
    );
    expect(payload.query).toEqual(
      expect.objectContaining({
        actorId: "actor-1",
        testCaseId: "case-audit",
        comparePairScoped: true,
        pagination: { limit: 1, cursor: "1", offset: 1 }
      })
    );
    expect(payload.rawCompareInputs).toEqual({
      included: false,
      preserved: true,
      digestCount: 1,
      itemCount: 2
    });
    expect(payload.redaction).toEqual(
      expect.objectContaining({
        rawHistoryIncluded: false,
        rawCompareInputsIncluded: false,
        tokensIncluded: false,
        pathsIncluded: false,
        storageLocationsIncluded: false,
        artifactUrlsIncluded: false
      })
    );
    expect(payload.page).toEqual(
      expect.objectContaining({ limit: 1, cursor: "1", returned: 1, total: 3, nextCursor: "2" })
    );
    expect(payload.items).toEqual([
      { ordinal: 0, eventId: "history-compare-permission:persisted-1", redacted: true }
    ]);
    expect(payload.policy).toEqual(
      expect.objectContaining({
        restParity: {
          method: "GET",
          path: "/api/v1/test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants/persisted"
        },
        headersForwarded: [
          "X-TestHistory-Scopes",
          "X-TestHistory-Project-Scope",
          "X-TestHistory-Actor-Id"
        ],
        mutationAllowed: false,
        equalOrNarrowerThanRest: true,
        rawHistoryIncluded: false,
        rawCompareInputsIncluded: false,
        mcpReplayExecution: false,
        mcpWorkerExecution: false,
        providerRuntimeMetadataIncluded: false,
        providerRuntimeToolsAdvertised: false,
        persistedInvariantReadModel: true
      })
    );
    expect(JSON.parse(firstResourceText(resourceResponse))).toEqual(payload);
    expect(schema.properties.kind.const).toBe(
      "test-case-history-compare-permission-audit-replay-invariants-persisted"
    );
    expect(schema.$defs.policy.required).toContain("persistedInvariantReadModel");
    expect(schema.$defs.policy.properties).toEqual(
      expect.objectContaining({
        mutationAllowed: { type: "boolean", const: false },
        equalOrNarrowerThanRest: { type: "boolean", const: true },
        rawHistoryIncluded: { type: "boolean", const: false },
        rawCompareInputsIncluded: { type: "boolean", const: false },
        mcpReplayExecution: { type: "boolean", const: false },
        mcpWorkerExecution: { type: "boolean", const: false },
        providerRuntimeMetadataIncluded: { type: "boolean", const: false },
        providerRuntimeToolsAdvertised: { type: "boolean", const: false },
        persistedInvariantReadModel: { type: "boolean", const: true }
      })
    );
    expect(refreshResponse.error).toEqual(
      expect.objectContaining({
        message:
          "Unknown tool: testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.refresh"
      })
    );
    expect(serialized).not.toContain("persisted-base-raw-payload");
    expect(serialized).not.toContain("persisted-target-raw-payload");
    expect(serialized).not.toContain("persisted-history-raw-payload");
    expect(serialized).not.toContain("persisted-raw-result-uuid");
    expect(serialized).not.toContain("result-1");
    expect(serialized).not.toContain("result-2");
    expect(serialized).not.toContain("persisted-permission-token");
    expectNoPersistedInvariantSensitiveTranscriptLeak(serialized);
  });

  it("guards persisted history compare permission audit invariant transcripts against broader surface and denied leaks", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return deniedResponse({
        kind: "test-case-history-compare-permission-audit-replay-invariants-persisted",
        error: "PermissionDeniedError",
        message:
          "Missing persisted history compare invariant read scope for Authorization: Bearer denied-persisted-token",
        requiredScopes: ["test-cases:read"],
        projectId: "project-locked",
        testCaseId: "case-locked",
        actor: { type: "actor", actorId: "actor-denied", scoped: true },
        access: {
          scope: "test-cases:read",
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        availability: {
          status: "denied",
          reason: "missing_scope",
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          partial: false,
          unavailable: [
            "persisted-denied-history",
            "C:\\synthetic\\allure-results\\permission-denied.json",
            "storage://project-locked/permission-denied"
          ]
        },
        token: "denied-persisted-token",
        rawHistory: [{ body: "denied-persisted-history-raw-payload" }],
        rawCompareInputs: {
          baseResultUuid: "denied-base-result",
          targetResultUuid: "denied-target-result"
        },
        compareInputs: { hidden: "denied-persisted-token" },
        baseResult: { uuid: "denied-base-result", raw: "denied-base-raw-payload" },
        targetResult: { uuid: "denied-target-result", raw: "denied-target-raw-payload" },
        history: [{ raw: "denied-history-raw-payload" }],
        localPath: "C:\\synthetic\\allure-results\\permission-denied.json",
        storageKey: "project-locked/raw/permission-denied.json",
        storageRef: "storage://project-locked/raw/permission-denied",
        signedUrl: "https://storage.example/private?X-Amz-Signature=denied",
        downloadUrl: "https://storage.example/download?token=denied-persisted-token"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const listResponse = await handle({ jsonrpc: "2.0", id: 625, method: "tools/list" });
    const resourcesResponse = await handle({ jsonrpc: "2.0", id: 626, method: "resources/list" });
    const deniedRead = await handle({
      jsonrpc: "2.0",
      id: 627,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.read",
        arguments: {
          apiUrl: "http://api.test",
          testCaseId: "case-locked",
          projectId: "project-locked",
          actorId: "actor-denied",
          limit: 2,
          cursor: "2"
        }
      }
    });
    const mutationResponses = await Promise.all(
      [
        "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.refresh",
        "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.replay",
        "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.persist",
        "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.delete",
        "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.write",
        "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.provider.call",
        "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.runtime.execute",
        "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.worker.run"
      ].map((name, index) =>
        handle({
          jsonrpc: "2.0",
          id: 628 + index,
          method: "tools/call",
          params: { name, arguments: { projectId: "project-locked" } }
        })
      )
    );

    const tools = listResponse.result as {
      tools: Array<{ name: string; description?: string; inputSchema?: { properties?: object } }>;
    };
    const resources = resourcesResponse.result as {
      resources: Array<{ uri: string; description?: string }>;
    };
    const invariantToolNames = tools.tools
      .map((tool) => tool.name)
      .filter((name) =>
        name.startsWith("testhistory.test-case.history.compare.permission-audit.replay.invariants")
      );
    const invariantResourceUris = resources.resources
      .map((resource) => resource.uri)
      .filter((uri) =>
        uri.startsWith(
          "testhistory://test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants"
        )
      );
    const persistedTool = tools.tools.find(
      (tool) =>
        tool.name ===
        "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.read"
    );
    const persistedResource = resources.resources.find(
      (resource) =>
        resource.uri ===
        "testhistory://test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants/persisted"
    );
    const denied = JSON.parse(firstText(deniedRead)) as {
      status: string;
      code: number;
      url: string;
      permissionDenied: {
        kind: string;
        message: string;
        token?: string;
        actor: { actorId: string; scoped: boolean };
        availability: { status: string; reason: string; unavailable: string[] };
      };
      policy: {
        restParity: { method: string; path: string };
        mutationAllowed: boolean;
        equalOrNarrowerThanRest: boolean;
        rawHistoryIncluded: boolean;
        rawCompareInputsIncluded: boolean;
        mcpReplayExecution: boolean;
        mcpWorkerExecution: boolean;
        providerRuntimeMetadataIncluded: boolean;
        providerRuntimeToolsAdvertised: boolean;
        persistedInvariantReadModel: boolean;
        deniedStateMasked: boolean;
      };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;
    const serialized = firstText(deniedRead);

    expect(invariantToolNames).toEqual([
      "testhistory.test-case.history.compare.permission-audit.replay.invariants.read",
      "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.read"
    ]);
    expect(invariantResourceUris).toEqual([
      "testhistory://test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants",
      "testhistory://test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants/persisted"
    ]);
    expect(persistedTool?.description).toContain("provider/runtime tools");
    expect(persistedTool?.description).toContain("mutation access");
    expect(Object.keys(persistedTool?.inputSchema?.properties ?? {})).toEqual([
      "apiUrl",
      "testCaseId",
      "projectId",
      "actorId",
      "baseResultUuid",
      "targetResultUuid",
      "limit",
      "cursor"
    ]);
    expect(persistedResource?.description).toContain("provider/runtime tools");
    expect(persistedResource?.description).toContain("mutation access");
    expect(invariantToolNames.join("\n")).not.toMatch(
      /\.(?:refresh|persist|delete|write|provider|runtime|worker|execute|run|mutate)\b/
    );
    expect(fetchedRequests).toHaveLength(1);
    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/test-cases/case-locked/history/compare/permission-audit/replay/invariants/persisted?projectId=project-locked&limit=2&cursor=2"
    );
    expect(fetchedRequests[0]?.init?.method ?? "GET").toBe("GET");
    expect(headers).toEqual({
      "X-TestHistory-Scopes": "test-cases:read",
      "X-TestHistory-Project-Scope": "project-locked",
      "X-TestHistory-Actor-Id": "actor-denied"
    });
    expect(denied).toEqual(
      expect.objectContaining({
        status: "error",
        code: 403,
        permissionDenied: expect.objectContaining({
          kind: "test-case-history-compare-permission-audit-replay-invariants-persisted",
          token: "[redacted]",
          actor: { type: "actor", actorId: "actor-denied", scoped: true },
          availability: expect.objectContaining({
            status: "denied",
            reason: "missing_scope",
            unavailable: ["persisted-denied-history", "[REDACTED_PATH]", "[REDACTED_STORAGE_URL]"]
          })
        }),
        policy: expect.objectContaining({
          restParity: {
            method: "GET",
            path: "/api/v1/test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants/persisted"
          },
          mutationAllowed: false,
          equalOrNarrowerThanRest: true,
          rawHistoryIncluded: false,
          rawCompareInputsIncluded: false,
          mcpReplayExecution: false,
          mcpWorkerExecution: false,
          providerRuntimeMetadataIncluded: false,
          providerRuntimeToolsAdvertised: false,
          persistedInvariantReadModel: true,
          deniedStateMasked: true
        })
      })
    );
    expect(mutationResponses.map((response) => response.error)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            "Unknown tool: testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.refresh"
        }),
        expect.objectContaining({
          message:
            "Unknown tool: testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.replay"
        }),
        expect.objectContaining({
          message:
            "Unknown tool: testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.persist"
        }),
        expect.objectContaining({
          message:
            "Unknown tool: testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.delete"
        }),
        expect.objectContaining({
          message:
            "Unknown tool: testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.write"
        }),
        expect.objectContaining({
          message:
            "Unknown tool: testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.provider.call"
        }),
        expect.objectContaining({
          message:
            "Unknown tool: testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.runtime.execute"
        }),
        expect.objectContaining({
          message:
            "Unknown tool: testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.worker.run"
        })
      ])
    );
    expect(serialized).not.toContain("denied-persisted-token");
    expect(serialized).not.toContain("denied-base-result");
    expect(serialized).not.toContain("denied-target-result");
    expect(serialized).not.toContain("denied-base-raw-payload");
    expect(serialized).not.toContain("denied-target-raw-payload");
    expect(serialized).not.toContain("denied-history-raw-payload");
    expectNoPersistedInvariantSensitiveTranscriptLeak(serialized);
  });

  it("reads identity correction audit metadata with actor/project parity and MCP redaction", async () => {
    const fetchedUrls: URL[] = [];
    const tokenSignature = JSON.stringify([
      { name: "browser", value: "chromium" },
      { name: "token", value: "synthetic-token", mode: "masked" },
      { name: "password", value: "synthetic-hidden", mode: "hidden" }
    ]);
    const fetchMock = vi.fn(async (input: URL) => {
      fetchedUrls.push(input);
      return jsonResponse({
        kind: "identity-correction-audit",
        projectId: "project-1",
        page: {
          limit: 1,
          cursor: null,
          offset: 0,
          returned: 1,
          total: 2,
          nextCursor: "1",
          hasMore: true
        },
        events: [
          {
            id: "identity-audit:1",
            projectId: "project-1",
            kind: "correction",
            source: "manual",
            confidence: "high",
            origin: { type: "actor", actorId: "actor-1", displayName: "Ada" },
            reason: "manual correction mentioned synthetic-token",
            beforeIds: ["case-token"],
            afterIds: ["case-safe"],
            scope: {
              launchId: "launch-1",
              parameterVariantSignature: tokenSignature
            },
            evidence: [
              {
                launchId: "launch-1",
                resultUuid: "result-1",
                attemptIndex: 0,
                parameterVariantSignature: tokenSignature
              }
            ],
            occurredAt: "2026-05-30T00:00:00.000Z"
          }
        ]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 46,
      method: "tools/call",
      params: {
        name: "testhistory.identity-corrections.audit",
        arguments: {
          apiUrl: "http://api.test",
          projectId: "project-1",
          actorId: "actor-1",
          originType: "actor",
          kind: "correction",
          limit: 1
        }
      }
    });

    const payload = JSON.parse(firstText(response)) as {
      projectId: string;
      actorId: string;
      originType: string;
      page: { limit: number; nextCursor: string };
      events: Array<{
        reason: string;
        beforeIds: string[];
        afterIds: string[];
        scope: { parameterVariantSignature: string };
        evidence: Array<{ parameterVariantSignature: string }>;
      }>;
      policy: { actorOriginRequiresActorId: boolean; mutationAllowed: boolean };
    };

    expect(fetchedUrls[0]?.toString()).toBe(
      "http://api.test/api/v1/projects/project-1/identity-corrections/audit?actorId=actor-1&originType=actor&kind=correction&limit=1"
    );
    expect(payload.projectId).toBe("project-1");
    expect(payload.actorId).toBe("actor-1");
    expect(payload.originType).toBe("actor");
    expect(payload.page).toEqual(expect.objectContaining({ limit: 1, nextCursor: "1" }));
    expect(payload.events[0]?.reason).toBe("[redacted]");
    expect(payload.events[0]?.beforeIds).toEqual(["[redacted]"]);
    expect(payload.events[0]?.afterIds).toEqual(["case-safe"]);
    expect(JSON.parse(payload.events[0]?.scope.parameterVariantSignature ?? "[]")).toEqual([
      { name: "browser", value: "chromium" },
      { name: "token", value: "***", mode: "masked", redacted: true },
      { name: "password", mode: "hidden", redacted: true }
    ]);
    expect(JSON.parse(payload.events[0]?.evidence[0]?.parameterVariantSignature ?? "[]")).toEqual([
      { name: "browser", value: "chromium" },
      { name: "token", value: "***", mode: "masked", redacted: true },
      { name: "password", mode: "hidden", redacted: true }
    ]);
    expect(payload.policy.actorOriginRequiresActorId).toBe(true);
    expect(payload.policy.mutationAllowed).toBe(false);
    expect(firstText(response)).not.toContain("synthetic-token");
    expect(firstText(response)).not.toContain("synthetic-hidden");
    expect(firstText(response)).not.toContain("case-token");
  });

  it("enforces identity correction actor boundary and routes system reads by project resource", async () => {
    const fetchedUrls: URL[] = [];
    const fetchMock = vi.fn(async (input: URL) => {
      fetchedUrls.push(input);
      return jsonResponse([
        {
          id: "identity-audit:system-1",
          projectId: "project-1",
          kind: "conservative_link",
          source: "heuristic",
          confidence: "medium",
          origin: { type: "system", name: "identity-sync" },
          reason: "same history id",
          beforeIds: ["case-a"],
          afterIds: ["case-b"],
          evidence: [],
          occurredAt: "2026-05-30T00:00:00.000Z"
        },
        {
          id: "identity-audit:system-2",
          projectId: "project-1",
          kind: "split",
          source: "migration",
          confidence: "high",
          origin: { type: "system", name: "identity-sync" },
          reason: "migration split",
          beforeIds: ["case-c"],
          afterIds: ["case-d", "case-e"],
          evidence: [],
          occurredAt: "2026-05-30T00:01:00.000Z"
        }
      ]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const deniedActorResponse = await handle({
      jsonrpc: "2.0",
      id: 47,
      method: "tools/call",
      params: {
        name: "testhistory.identity-corrections.audit",
        arguments: {
          apiUrl: "http://api.test",
          projectId: "project-1",
          originType: "actor"
        }
      }
    });
    const systemResourceResponse = await handle({
      jsonrpc: "2.0",
      id: 48,
      method: "resources/read",
      params: {
        uri: "testhistory://projects/project-1/identity-corrections/audit?apiUrl=http%3A%2F%2Fapi.test&originType=system&limit=1&cursor=1"
      }
    });

    const payload = JSON.parse(firstResourceText(systemResourceResponse)) as {
      projectId: string;
      originType: string;
      page: { cursor: string | null; offset: number };
    };

    expect(deniedActorResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "actorId is required for actor-origin identity correction audit reads"
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchedUrls[0]?.toString()).toBe(
      "http://api.test/api/v1/projects/project-1/identity-corrections/audit?originType=system&limit=1&cursor=1"
    );
    expect(payload.projectId).toBe("project-1");
    expect(payload.originType).toBe("system");
    expect(payload.page).toEqual(expect.objectContaining({ cursor: "1", offset: 1 }));
  });

  it("reads security audit events with project headers, pagination, and MCP redaction", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return jsonResponse({
        kind: "security-audit-list",
        projectId: "project-1",
        access: {
          scope: "security:audit:read",
          projectScoped: true,
          mutation: false,
          redacted: true
        },
        page: {
          limit: 1,
          cursor: null,
          offset: 0,
          returned: 1,
          total: 2,
          nextCursor: "1",
          hasMore: true
        },
        summary: {
          total: 2,
          allowed: 1,
          denied: 1,
          failed: 0,
          byType: { "auth.access.denied": 1 },
          byOutcome: { denied: 1 },
          bySeverity: { warn: 1 },
          actorIds: ["actor-1", "token-actor"],
          resourceIds: ["launch-1"],
          firstOccurredAt: "2026-05-30T09:00:00.000Z",
          lastOccurredAt: "2026-05-30T09:01:00.000Z"
        },
        items: [
          {
            schemaVersion: 1,
            id: "audit-1",
            fingerprint: "fingerprint-1",
            projectId: "project-1",
            type: "auth.access.denied",
            outcome: "denied",
            severity: "warn",
            occurredAt: "2026-05-30T09:00:00.000Z",
            actor: { type: "actor", actorId: "actor-1", displayName: "Ada" },
            resource: { type: "launch", id: "launch-1", name: "Nightly" },
            request: {
              requestId: "req-1",
              traceId: "trace-1",
              method: "GET",
              route: "/api/v1/launches/launch-1",
              ipAddress: "192.0.2.10",
              userAgent: "Synthetic Browser"
            },
            reason: "authorization: Bearer synthetic-token",
            metadata: {
              attemptedScope: "launches:read",
              token: "synthetic-token",
              payload: "{ raw body }",
              storageKey: "project-1/audit/raw",
              nested: {
                password: "synthetic-hidden",
                safe: "kept"
              }
            }
          }
        ]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 52,
      method: "tools/call",
      params: {
        name: "testhistory.security-audit.read",
        arguments: {
          apiUrl: "http://api.test",
          projectId: "project-1",
          outcome: "denied",
          limit: 1
        }
      }
    });

    const payload = JSON.parse(firstText(response)) as {
      kind: string;
      projectId: string;
      access: { scope: string; projectScoped: boolean; mutation: boolean; redacted: boolean };
      query: { projectId: string; outcome: string; limit: number; cursor: string | null };
      page: { limit: number; returned: number; total: number; nextCursor: string };
      summary: { actorIds: string[] };
      items: Array<{
        request: { requestId: string; method: string; ipAddress?: string; userAgent?: string };
        reason: string;
        metadata: {
          attemptedScope: string;
          token: string;
          payload?: string;
          storageKey?: string;
          nested: { password: string; safe: string };
        };
      }>;
      policy: { equalOrNarrowerThanRest: boolean; mutationAllowed: boolean };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;
    const serialized = firstText(response);

    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/security/audit?projectId=project-1&outcome=denied&limit=1"
    );
    expect(headers["X-TestHistory-Scopes"]).toBe("security:audit:read");
    expect(headers["X-TestHistory-Project-Scope"]).toBe("project-1");
    expect(payload.kind).toBe("security-audit-list");
    expect(payload.projectId).toBe("project-1");
    expect(payload.access).toEqual({
      scope: "security:audit:read",
      projectScoped: true,
      mutation: false,
      redacted: true
    });
    expect(payload.query).toEqual({
      projectId: "project-1",
      outcome: "denied",
      limit: 1,
      cursor: null
    });
    expect(payload.page).toEqual(
      expect.objectContaining({ limit: 1, returned: 1, total: 2, nextCursor: "1" })
    );
    expect(payload.summary.actorIds).toEqual(["actor-1", "[redacted]"]);
    expect(payload.items[0]?.request).toEqual({
      requestId: "req-1",
      traceId: "trace-1",
      method: "GET",
      route: "/api/v1/launches/launch-1"
    });
    expect(payload.items[0]?.metadata.token).toBe("[redacted]");
    expect(payload.items[0]?.metadata.payload).toBeUndefined();
    expect(payload.items[0]?.metadata.storageKey).toBeUndefined();
    expect(payload.items[0]?.metadata.nested).toEqual({
      password: "[redacted]",
      safe: "kept"
    });
    expect(payload.policy).toEqual(
      expect.objectContaining({ equalOrNarrowerThanRest: true, mutationAllowed: false })
    );
    expect(serialized).not.toContain("synthetic-token");
    expect(serialized).not.toContain("synthetic-hidden");
    expect(serialized).not.toContain("192.0.2.10");
    expect(serialized).not.toContain("Synthetic Browser");
    expect(serialized).not.toContain("project-1/audit/raw");
    expect(serialized).not.toContain("raw body");
  });

  it("requires security audit project scope and preserves REST permission denial shape", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return deniedResponse({
        error: "PermissionDeniedError",
        message: "Missing required security audit read scope",
        requiredScopes: ["security:audit:read"],
        projectId: "project-locked",
        redacted: true,
        token: "synthetic-token"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const missingProjectResponse = await handle({
      jsonrpc: "2.0",
      id: 53,
      method: "tools/call",
      params: {
        name: "testhistory.security-audit.read",
        arguments: { apiUrl: "http://api.test" }
      }
    });
    const deniedResourceResponse = await handle({
      jsonrpc: "2.0",
      id: 54,
      method: "resources/read",
      params: {
        uri: "testhistory://security/audit?apiUrl=http%3A%2F%2Fapi.test&projectId=project-locked"
      }
    });

    const denied = JSON.parse(firstResourceText(deniedResourceResponse)) as {
      status: string;
      code: number;
      permissionDenied: { error: string; requiredScopes: string[]; token?: string };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;

    expect(missingProjectResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "projectId is required for security audit reads"
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/security/audit?projectId=project-locked&limit=20"
    );
    expect(headers["X-TestHistory-Scopes"]).toBe("security:audit:read");
    expect(headers["X-TestHistory-Project-Scope"]).toBe("project-locked");
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
    expect(firstResourceText(deniedResourceResponse)).not.toContain("synthetic-token");
  });
});
