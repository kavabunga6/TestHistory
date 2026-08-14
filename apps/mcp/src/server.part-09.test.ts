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

describe("MCP tools part-09", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("preserves REST permission denial shape for history compare without leaking tokens", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return deniedResponse({
        error: "PermissionDeniedError",
        message: "Missing required test case history compare read scope",
        requiredScopes: ["test-cases:read"],
        projectId: "project-locked",
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
          unavailable: []
        },
        redacted: true,
        token: "synthetic-token",
        storageKey: "project-locked/raw/compare.json",
        signedUrl: "https://storage.example/compare?signature=synthetic-signature"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 55,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history.compare",
        arguments: {
          apiUrl: "http://api.test",
          testCaseId: "case-locked",
          projectId: "project-locked",
          baseResultUuid: "result-1",
          targetResultUuid: "result-2",
          actorId: "actor-denied"
        }
      }
    });

    const denied = JSON.parse(firstText(response)) as {
      status: string;
      code: number;
      permissionDenied: {
        error: string;
        requiredScopes: string[];
        token?: string;
        actor: { actorId: string; scoped: boolean };
        access: { actorScoped: boolean; mutation: boolean; redacted: boolean };
        availability: { status: string; reason: string; actorScoped: boolean; partial: boolean };
      };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;

    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/test-cases/case-locked/history/compare?projectId=project-locked&baseResultUuid=result-1&targetResultUuid=result-2&limit=20"
    );
    expect(headers["X-TestHistory-Scopes"]).toBe("test-cases:read");
    expect(headers["X-TestHistory-Project-Scope"]).toBe("project-locked");
    expect(headers["X-TestHistory-Actor-Id"]).toBe("actor-denied");
    expect(denied).toEqual(
      expect.objectContaining({
        status: "error",
        code: 403,
        permissionDenied: expect.objectContaining({
          error: "PermissionDeniedError",
          requiredScopes: ["test-cases:read"],
          actor: { type: "actor", actorId: "actor-denied", scoped: true },
          access: expect.objectContaining({
            actorScoped: true,
            mutation: false,
            redacted: true
          }),
          availability: expect.objectContaining({
            status: "denied",
            reason: "missing_scope",
            actorScoped: true,
            partial: false
          }),
          token: "[redacted]"
        })
      })
    );
    expect(firstText(response)).not.toContain("synthetic-token");
    expect(firstText(response)).not.toContain("project-locked/raw/compare.json");
    expect(firstText(response)).not.toContain("synthetic-signature");
  });

  it("mirrors history compare permission audit reads with scope headers, pagination, and MCP redaction", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return jsonResponse({
        kind: "test-case-history-compare-permission-audit",
        projectId: "project-1",
        testCaseId: "case-audit",
        actor: { type: "actor", actorId: "actor-1", scoped: true, displayName: "Ada" },
        access: {
          scope: "test-cases:read",
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        availability: {
          status: "partial",
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          partial: true,
          unavailable: [
            "executor.name",
            "storageKey=project-1/raw/history.json",
            "C:\\Users\\tester\\Downloads\\synthetic-results\\permission.json"
          ]
        },
        query: {
          projectId: "project-1",
          actorId: "actor-1",
          testCaseScoped: true,
          projectScoped: true,
          actorScoped: true,
          comparePairScoped: true,
          pagination: { limit: 1, cursor: "1", offset: 1 },
          redacted: true
        },
        audit: {
          adapterKind: "in-memory-history-compare-permission-audit-wip",
          boundary: "read-only-permission-audit-projection",
          projectId: "project-1",
          actorScoped: true,
          projectionDigest: "digest-1",
          mutationBoundary: "read-only-no-rest-mutation",
          replayedEventCount: 3,
          recordCount: 2,
          byDecision: { denied: 1, partial: 1, ready: 0 },
          actorCount: 1,
          compareCount: 2,
          testCaseCount: 1,
          rawHistory: {
            included: false,
            preserved: true,
            digests: ["digest-a", "digest-b"],
            itemCount: 4,
            items: [{ token: "permission-audit-token" }]
          },
          firstOccurredAt: "2026-05-30T08:00:00.000Z",
          lastOccurredAt: "2026-05-30T09:00:00.000Z"
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
        redaction: {
          rawHistoryIncluded: false,
          rawCompareInputsIncluded: false,
          hiddenOrMaskedValuesIncluded: false,
          tokensIncluded: false,
          pathsIncluded: false,
          storageLocationsIncluded: false,
          artifactUrlsIncluded: false
        },
        diagnostics: [
          {
            code: "history_compare_permission.field_hidden",
            compareId: "compare-1",
            message: "authorization: Bearer permission-audit-token",
            storageKey: "project-1/raw/history.json"
          }
        ],
        items: [
          {
            compareId: "compare-1",
            testCaseId: "case-audit",
            actor: { type: "actor", actorId: "actor-1", scoped: true },
            decision: "partial",
            reasons: [
              {
                code: "history_compare_permission.field_hidden",
                severity: "warn",
                explanation:
                  "Bearer permission-audit-token at https://storage.example/private?X-Amz-Signature=raw",
                fields: [
                  "executor.name",
                  "C:\\Users\\tester\\Downloads\\synthetic-results\\permission.json"
                ]
              }
            ],
            unavailable: ["executor.name", "storageKey=project-1/raw/history.json"],
            rawHistory: {
              included: false,
              preserved: true,
              digest: "digest-a",
              itemCount: 2,
              items: [{ uuid: "raw-base-uuid", token: "permission-audit-token" }]
            },
            rawCompareInputs: { baseResultUuid: "raw-base-uuid" },
            events: [{ rawHistory: "permission-audit-token" }],
            eventCount: 2,
            sourcePage: { limit: 10, cursor: "0", offset: 0, returned: 2, total: 2 },
            firstOccurredAt: "2026-05-30T08:00:00.000Z",
            lastOccurredAt: "2026-05-30T09:00:00.000Z",
            redacted: true
          }
        ]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 56,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history.compare.permission-audit",
        arguments: {
          apiUrl: "http://api.test",
          testCaseId: "case-audit",
          projectId: "project-1",
          baseResultUuid: "result-1",
          targetResultUuid: "result-2",
          actorId: "actor-1",
          limit: 1,
          cursor: "1"
        }
      }
    });

    const payload = JSON.parse(firstText(response)) as {
      kind: string;
      projectId: string;
      testCaseId: string;
      actorId: string;
      access: { scope: string; actorScoped: boolean; mutation: boolean; redacted: boolean };
      availability: { status: string; partial: boolean; unavailable: string[] };
      query: {
        actorId: string;
        comparePairScoped: boolean;
        pagination: { limit: number; cursor: string; offset: number };
      };
      audit: {
        mutationBoundary: string;
        replayedEventCount: number;
        recordCount: number;
        byDecision: { denied: number; partial: number; ready: number };
        rawHistory: { included: false; preserved: true; digests: string[]; itemCount: number };
      };
      page: { limit: number; cursor: string; returned: number; total: number; nextCursor: null };
      redaction: {
        rawHistoryIncluded: boolean;
        rawCompareInputsIncluded: boolean;
        tokensIncluded: boolean;
        pathsIncluded: boolean;
        storageLocationsIncluded: boolean;
        artifactUrlsIncluded: boolean;
      };
      diagnostics: Array<{ code: string; compareId: string; redacted: boolean; message?: string }>;
      items: Array<{
        compareId: string;
        decision: string;
        reasons: Array<{ code: string; explanation: string; fields: string[] }>;
        unavailable: string[];
        rawHistory: { included: false; preserved: true; digest: string; itemCount: number };
        rawCompareInputs?: unknown;
        events?: unknown;
      }>;
      policy: {
        mutationAllowed: boolean;
        equalOrNarrowerThanRest: boolean;
        rawHistoryIncluded: boolean;
        rawCompareInputsIncluded: boolean;
        deniedStateMasked: boolean;
      };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;
    const serialized = firstText(response);

    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/test-cases/case-audit/history/compare/permission-audit?projectId=project-1&baseResultUuid=result-1&targetResultUuid=result-2&limit=1&cursor=1"
    );
    expect(headers["X-TestHistory-Scopes"]).toBe("test-cases:read");
    expect(headers["X-TestHistory-Project-Scope"]).toBe("project-1");
    expect(headers["X-TestHistory-Actor-Id"]).toBe("actor-1");
    expect(payload.kind).toBe("test-case-history-compare-permission-audit");
    expect(payload.projectId).toBe("project-1");
    expect(payload.testCaseId).toBe("case-audit");
    expect(payload.actorId).toBe("actor-1");
    expect(payload.access).toEqual(
      expect.objectContaining({
        scope: "test-cases:read",
        actorScoped: true,
        mutation: false,
        redacted: true
      })
    );
    expect(payload.availability).toEqual(
      expect.objectContaining({
        status: "partial",
        partial: true,
        unavailable: ["executor.name", "[redacted]", "[REDACTED_PATH]"]
      })
    );
    expect(payload.query).toEqual(
      expect.objectContaining({
        actorId: "actor-1",
        comparePairScoped: true,
        pagination: { limit: 1, cursor: "1", offset: 1 }
      })
    );
    expect(payload.audit).toEqual(
      expect.objectContaining({
        mutationBoundary: "read-only-no-rest-mutation",
        replayedEventCount: 3,
        recordCount: 2,
        byDecision: { denied: 1, partial: 1, ready: 0 },
        rawHistory: {
          included: false,
          preserved: true,
          digests: ["digest-a", "digest-b"],
          itemCount: 4
        }
      })
    );
    expect(payload.page).toEqual(
      expect.objectContaining({ limit: 1, cursor: "1", returned: 1, total: 2, nextCursor: null })
    );
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
    expect(payload.diagnostics).toEqual([
      {
        code: "history_compare_permission.field_hidden",
        compareId: "compare-1",
        projectScoped: true,
        actorScoped: true,
        redacted: true
      }
    ]);
    expect(payload.items[0]).toEqual(
      expect.objectContaining({
        compareId: "compare-1",
        decision: "partial",
        rawHistory: expect.objectContaining({
          included: false,
          preserved: true,
          digest: "digest-a",
          itemCount: 2
        })
      })
    );
    expect(payload.items[0]?.reasons[0]).toEqual(
      expect.objectContaining({
        code: "history_compare_permission.field_hidden",
        explanation: "[REDACTED]",
        fields: ["executor.name", "[REDACTED_PATH]"]
      })
    );
    expect(payload.items[0]?.unavailable).toEqual(["executor.name", "[redacted]"]);
    expect(payload.items[0]?.rawCompareInputs).toBeUndefined();
    expect(payload.items[0]?.events).toBeUndefined();
    expect(payload.policy).toEqual(
      expect.objectContaining({
        mutationAllowed: false,
        equalOrNarrowerThanRest: true,
        rawHistoryIncluded: false,
        rawCompareInputsIncluded: false,
        deniedStateMasked: true
      })
    );
    expect(serialized).not.toContain("permission-audit-token");
    expect(serialized).not.toContain("raw-base-uuid");
    expect(serialized).not.toContain('"rawCompareInputs":');
    expect(serialized).not.toContain('"events":');
    expect(serialized).not.toContain("storage.example");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("Downloads");
    expect(serialized).not.toContain("allure-results");
    expect(serialized).not.toContain("project-1/raw/history.json");
  });

  it("routes permission audit resources, validates paired compare args, and masks denied reads", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      if (input.pathname.includes("case-locked")) {
        return deniedResponse({
          kind: "test-case-history-compare-permission-audit",
          error: "PermissionDeniedError",
          message: "Missing required test case history compare permission audit read scope",
          requiredScopes: ["test-cases:read"],
          projectId: "project-locked",
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
            unavailable: []
          },
          token: "permission-audit-denied-token",
          rawHistory: [{ token: "permission-audit-denied-token" }],
          compareInputs: { base: "raw-denied-base" },
          storageKey: "project-locked/raw/permission-audit.json",
          signedUrl: "https://storage.example/private?X-Amz-Signature=denied"
        });
      }
      return jsonResponse({
        kind: "test-case-history-compare-permission-audit",
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
          testCaseScoped: true,
          projectScoped: true,
          actorScoped: true,
          comparePairScoped: false,
          pagination: { limit: 2, cursor: null, offset: 0 },
          redacted: true
        },
        audit: {
          adapterKind: "in-memory-history-compare-permission-audit-wip",
          boundary: "read-only-permission-audit-projection",
          projectId: "project-1",
          actorScoped: true,
          projectionDigest: "digest-ready",
          mutationBoundary: "read-only-no-rest-mutation",
          replayedEventCount: 1,
          recordCount: 1,
          byDecision: { denied: 0, partial: 0, ready: 1 },
          rawHistory: { included: false, preserved: true, itemCount: 2 }
        },
        page: {
          limit: 2,
          cursor: null,
          offset: 0,
          returned: 1,
          total: 1,
          nextCursor: null,
          hasMore: false
        },
        items: []
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const missingProjectResponse = await handle({
      jsonrpc: "2.0",
      id: 57,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history.compare.permission-audit",
        arguments: { apiUrl: "http://api.test", testCaseId: "case-audit" }
      }
    });
    const missingPairResponse = await handle({
      jsonrpc: "2.0",
      id: 58,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history.compare.permission-audit",
        arguments: {
          apiUrl: "http://api.test",
          testCaseId: "case-audit",
          projectId: "project-1",
          baseResultUuid: "result-1"
        }
      }
    });
    const resourceResponse = await handle({
      jsonrpc: "2.0",
      id: 59,
      method: "resources/read",
      params: {
        uri: "testhistory://test-cases/case-audit/history/compare/permission-audit?apiUrl=http%3A%2F%2Fapi.test&projectId=project-1&actorId=actor-1&limit=2"
      }
    });
    const deniedResponseValue = await handle({
      jsonrpc: "2.0",
      id: 60,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history.compare.permission-audit",
        arguments: {
          apiUrl: "http://api.test",
          testCaseId: "case-locked",
          projectId: "project-locked",
          actorId: "actor-denied"
        }
      }
    });

    const resourcePayload = JSON.parse(firstResourceText(resourceResponse)) as {
      kind: string;
      query: { actorId: string; comparePairScoped: boolean };
      page: { limit: number; returned: number };
    };
    const denied = JSON.parse(firstText(deniedResponseValue)) as {
      status: string;
      code: number;
      permissionDenied: {
        kind: string;
        error: string;
        requiredScopes: string[];
        token?: string;
        actor: { actorId: string; scoped: boolean };
        availability: { status: string; reason: string };
      };
      policy: { deniedStateMasked: boolean; rawHistoryIncluded: boolean };
    };
    const resourceHeaders = fetchedRequests[0]?.init?.headers as Record<string, string>;
    const deniedHeaders = fetchedRequests[1]?.init?.headers as Record<string, string>;

    expect(missingProjectResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "projectId is required for history compare permission audit reads"
      })
    );
    expect(missingPairResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "targetResultUuid is required when baseResultUuid is provided"
      })
    );
    expect(fetchedRequests.map((request) => request.url.toString())).toEqual([
      "http://api.test/api/v1/test-cases/case-audit/history/compare/permission-audit?projectId=project-1&limit=2",
      "http://api.test/api/v1/test-cases/case-locked/history/compare/permission-audit?projectId=project-locked&limit=20"
    ]);
    expect(resourceHeaders["X-TestHistory-Scopes"]).toBe("test-cases:read");
    expect(resourceHeaders["X-TestHistory-Project-Scope"]).toBe("project-1");
    expect(resourceHeaders["X-TestHistory-Actor-Id"]).toBe("actor-1");
    expect(resourcePayload).toEqual(
      expect.objectContaining({
        kind: "test-case-history-compare-permission-audit",
        query: expect.objectContaining({ actorId: "actor-1", comparePairScoped: false }),
        page: expect.objectContaining({ limit: 2, returned: 1 })
      })
    );
    expect(deniedHeaders["X-TestHistory-Scopes"]).toBe("test-cases:read");
    expect(deniedHeaders["X-TestHistory-Project-Scope"]).toBe("project-locked");
    expect(deniedHeaders["X-TestHistory-Actor-Id"]).toBe("actor-denied");
    expect(denied).toEqual(
      expect.objectContaining({
        status: "error",
        code: 403,
        permissionDenied: expect.objectContaining({
          kind: "test-case-history-compare-permission-audit",
          error: "PermissionDeniedError",
          requiredScopes: ["test-cases:read"],
          token: "[redacted]",
          actor: { type: "actor", actorId: "actor-denied", scoped: true },
          availability: expect.objectContaining({
            status: "denied",
            reason: "missing_scope"
          })
        }),
        policy: expect.objectContaining({
          deniedStateMasked: true,
          rawHistoryIncluded: false
        })
      })
    );
    expect(firstText(deniedResponseValue)).not.toContain("permission-audit-denied-token");
    expect(firstText(deniedResponseValue)).not.toContain("raw-denied-base");
    expect(firstText(deniedResponseValue)).not.toContain("project-locked/raw");
    expect(firstText(deniedResponseValue)).not.toContain("storage.example");
    expect(firstText(deniedResponseValue)).not.toContain("X-Amz-Signature");
  });

  it("reads history compare permission audit replay invariants with scoped pagination and redaction", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return jsonResponse({
        kind: "test-case-history-compare-permission-audit-replay-invariants",
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
          status: "partial",
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          partial: true,
          unavailable: [
            "redaction",
            "storageKey=project-1/raw/history.json",
            "C:\\synthetic\\allure-results\\permission.json"
          ]
        },
        query: {
          projectId: "project-1",
          actorId: "actor-1",
          testCaseId: "case-audit",
          testCaseScoped: true,
          projectScoped: true,
          actorScoped: true,
          comparePairScoped: true,
          pagination: { limit: 1, cursor: "1", offset: 1 },
          redacted: true
        },
        invariant: {
          boundary: "read-only-history-compare-permission-audit-replay-invariant",
          source: "in-memory-history-compare-permission-audit-wip",
          consistency: "append-only-replay",
          mutationBoundary: "rest-read-only-no-replay-mutation",
          deterministic: true,
          recomputable: true,
          projectScoped: true,
          actorScoped: {
            requested: true,
            passed: true,
            actorId: "actor-1",
            leakedActorIds: ["actor-token=synthetic-invariant-token"]
          },
          projectionDigest: "digest-1",
          recomputedDigest: "digest-1"
        },
        appendOnly: {
          uniqueProjectedEventIds: true,
          duplicateEventIds: ["duplicate-token=synthetic-invariant-token"],
          totalProjectedEventIds: 2,
          projectedEventIds: ["raw-result-uuid-1"]
        },
        rawCompareInputs: {
          included: false,
          preserved: true,
          digestCount: 2,
          itemCount: 4,
          raw: [{ token: "synthetic-invariant-token" }]
        },
        redaction: {
          passed: false,
          leakedMarkerCount: 2,
          leakedMarkers: ["token=synthetic-invariant-token", "storage://project-1/raw/history"],
          rawHistoryIncluded: false,
          rawCompareInputsIncluded: false,
          hiddenOrMaskedValuesIncluded: false,
          tokensIncluded: false,
          pathsIncluded: false,
          storageLocationsIncluded: false,
          artifactUrlsIncluded: false,
          policy:
            "Bearer synthetic-invariant-token signedUrl=https://storage.example/private?X-Amz-Signature=raw"
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
        items: [
          {
            ordinal: 1,
            eventId: "history-compare-permission:event-2",
            redacted: true,
            rawHistory: { token: "synthetic-invariant-token" }
          }
        ],
        events: [{ rawHistory: "synthetic-invariant-token" }]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 61,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history.compare.permission-audit.replay.invariants.read",
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
      id: 62,
      method: "resources/read",
      params: {
        uri: "testhistory://test-cases/case-audit/history/compare/permission-audit/replay/invariants?apiUrl=http%3A%2F%2Fapi.test&projectId=project-1&actorId=actor-1&baseResultUuid=result-1&targetResultUuid=result-2&limit=1&cursor=1"
      }
    });

    const payload = JSON.parse(firstText(response)) as {
      kind: string;
      projectId: string;
      testCaseId: string;
      actor: { actorId: string; scoped: boolean };
      access: { scope: string; actorScoped: boolean; mutation: boolean; redacted: boolean };
      query: {
        actorId: string;
        testCaseId: string;
        comparePairScoped: boolean;
        pagination: { limit: number; cursor: string; offset: number };
      };
      invariant: {
        mutationBoundary: string;
        deterministic: boolean;
        recomputable: boolean;
        actorScoped: { requested: boolean; passed: boolean; actorId: string };
      };
      appendOnly: {
        uniqueProjectedEventIds: boolean;
        duplicateEventIds: string[];
        totalProjectedEventIds: number;
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
      items: Array<{ ordinal: number; eventId: string; redacted: boolean; rawHistory?: unknown }>;
      policy: {
        actorIdRequired: boolean;
        mutationAllowed: boolean;
        equalOrNarrowerThanRest: boolean;
        mcpReplayExecution: boolean;
      };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;
    const serialized = firstText(response);

    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/test-cases/case-audit/history/compare/permission-audit/replay/invariants?projectId=project-1&baseResultUuid=result-1&targetResultUuid=result-2&limit=1&cursor=1"
    );
    expect(headers["X-TestHistory-Scopes"]).toBe("test-cases:read");
    expect(headers["X-TestHistory-Project-Scope"]).toBe("project-1");
    expect(headers["X-TestHistory-Actor-Id"]).toBe("actor-1");
    expect(payload.kind).toBe("test-case-history-compare-permission-audit-replay-invariants");
    expect(payload.projectId).toBe("project-1");
    expect(payload.testCaseId).toBe("case-audit");
    expect(payload.actor).toEqual({ type: "actor", actorId: "actor-1", scoped: true });
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
    expect(payload.invariant).toEqual(
      expect.objectContaining({
        mutationBoundary: "rest-read-only-no-replay-mutation",
        deterministic: true,
        recomputable: true,
        actorScoped: expect.objectContaining({
          requested: true,
          passed: true,
          actorId: "actor-1"
        })
      })
    );
    expect(payload.appendOnly).toEqual(
      expect.objectContaining({
        uniqueProjectedEventIds: true,
        duplicateEventIds: ["[REDACTED]"],
        totalProjectedEventIds: 2
      })
    );
    expect(payload.rawCompareInputs).toEqual({
      included: false,
      preserved: true,
      digestCount: 2,
      itemCount: 4
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
    expect(payload.items).toEqual([
      { ordinal: 1, eventId: "history-compare-permission:event-2", redacted: true }
    ]);
    expect(payload.policy).toEqual(
      expect.objectContaining({
        actorIdRequired: true,
        mutationAllowed: false,
        equalOrNarrowerThanRest: true,
        mcpReplayExecution: false
      })
    );
    expect(JSON.parse(firstResourceText(resourceResponse))).toEqual(payload);
    expect(serialized).not.toContain("synthetic-invariant-token");
    expect(serialized).not.toContain("raw-result-uuid-1");
    expect(serialized).not.toContain('"rawHistory":');
    expect(serialized).not.toContain('"events":');
    expect(serialized).not.toContain("storage://");
    expect(serialized).not.toContain("storage.example");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("C:\\synthetic");
    expect(serialized).not.toContain("allure-results");
  });

  it("validates and masks permission audit replay invariant reads while rejecting mutations", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return deniedResponse({
        kind: "test-case-history-compare-permission-audit-replay-invariants",
        error: "PermissionDeniedError",
        message: "Missing required test case history compare permission audit invariant read scope",
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
          unavailable: ["history-compare-permission-audit-replay-invariants"]
        },
        token: "synthetic-denied-token",
        rawHistory: [{ token: "synthetic-denied-token" }],
        rawCompareInputs: { baseResultUuid: "raw-denied-base" },
        storageRef: "storage://project-locked/raw/permission-audit",
        signedUrl: "https://storage.example/private?X-Amz-Signature=denied"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const missingActorResponse = await handle({
      jsonrpc: "2.0",
      id: 63,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history.compare.permission-audit.replay.invariants.read",
        arguments: { apiUrl: "http://api.test", testCaseId: "case-audit", projectId: "project-1" }
      }
    });
    const missingPairResponse = await handle({
      jsonrpc: "2.0",
      id: 64,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history.compare.permission-audit.replay.invariants.read",
        arguments: {
          apiUrl: "http://api.test",
          testCaseId: "case-audit",
          projectId: "project-1",
          actorId: "actor-1",
          targetResultUuid: "result-2"
        }
      }
    });
    const deniedRead = await handle({
      jsonrpc: "2.0",
      id: 65,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history.compare.permission-audit.replay.invariants.read",
        arguments: {
          apiUrl: "http://api.test",
          testCaseId: "case-locked",
          projectId: "project-locked",
          actorId: "actor-denied"
        }
      }
    });
    const refreshResponse = await handle({
      jsonrpc: "2.0",
      id: 66,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history.compare.permission-audit.replay.invariants.refresh",
        arguments: {}
      }
    });
    const deleteResponse = await handle({
      jsonrpc: "2.0",
      id: 67,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history.compare.permission-audit.replay.invariants.delete",
        arguments: {}
      }
    });

    const denied = JSON.parse(firstText(deniedRead)) as {
      status: string;
      code: number;
      permissionDenied: {
        kind: string;
        token?: string;
        actor: { actorId: string; scoped: boolean };
        availability: { status: string; reason: string };
      };
      policy: { deniedStateMasked: boolean; rawCompareInputsIncluded: boolean };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;

    expect(missingActorResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "actorId is required for history compare permission audit invariant reads"
      })
    );
    expect(missingPairResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "baseResultUuid is required when targetResultUuid is provided"
      })
    );
    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/test-cases/case-locked/history/compare/permission-audit/replay/invariants?projectId=project-locked&limit=20"
    );
    expect(headers["X-TestHistory-Scopes"]).toBe("test-cases:read");
    expect(headers["X-TestHistory-Project-Scope"]).toBe("project-locked");
    expect(headers["X-TestHistory-Actor-Id"]).toBe("actor-denied");
    expect(denied).toEqual(
      expect.objectContaining({
        status: "error",
        code: 403,
        permissionDenied: expect.objectContaining({
          kind: "test-case-history-compare-permission-audit-replay-invariants",
          token: "[redacted]",
          actor: { type: "actor", actorId: "actor-denied", scoped: true },
          availability: expect.objectContaining({
            status: "denied",
            reason: "missing_scope"
          })
        }),
        policy: expect.objectContaining({
          deniedStateMasked: true,
          rawCompareInputsIncluded: false
        })
      })
    );
    expect(refreshResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message:
          "Unknown tool: testhistory.test-case.history.compare.permission-audit.replay.invariants.refresh"
      })
    );
    expect(deleteResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message:
          "Unknown tool: testhistory.test-case.history.compare.permission-audit.replay.invariants.delete"
      })
    );
    expect(firstText(deniedRead)).not.toContain("synthetic-denied-token");
    expect(firstText(deniedRead)).not.toContain("raw-denied-base");
    expect(firstText(deniedRead)).not.toContain("storage://");
    expect(firstText(deniedRead)).not.toContain("storage.example");
    expect(firstText(deniedRead)).not.toContain("X-Amz-Signature");
  });
});
