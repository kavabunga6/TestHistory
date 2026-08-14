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

describe("MCP tools security-errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads defect mute projection through REST with scope headers, pagination, raw/effective split, and MCP redaction", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return jsonResponse({
        kind: "defect-mute-projection",
        projectId: "project-1",
        actor: { type: "actor", actorId: "actor-1", scoped: true },
        access: {
          scope: "defects:read",
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        projection: {
          adapterKind: "in-memory-defect-mute-projection-wip",
          boundary: "worker-local-mute-projection",
          consistency: "append-only-replay",
          replayStatus: "replayed",
          projectionDigest: "digest-1",
          mutationBoundary: "worker-projection-only-no-rest-mutation",
          eventCount: 2,
          mutedEventCount: 1,
          unmutedEventCount: 1,
          activeMuteCount: 1,
          inactiveMuteCount: 1,
          rawFailureOccurrenceCount: 2,
          firstOccurredAt: "2026-05-30T10:00:00.000Z",
          lastOccurredAt: "2026-05-30T10:01:00.000Z",
          replayScriptPath: "C:\\Users\\tester\\Downloads\\replay.js"
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
        rawFailureHistory: {
          totalOccurrences: 2,
          statusCounters: { failed: 1, broken: 1 },
          byTestId: { "case-muted": 2 },
          bySignatureHash: { "signature-muted": 2 },
          raw: [{ trace: "authorization: Bearer synthetic-token" }],
          storageKey: "project-1/raw/failures.json"
        },
        qualityGate: {
          launchId: "launch-1",
          raw: {
            status: "failed",
            metrics: { failedBrokenTotal: 2 },
            statusCounters: { failed: 1, broken: 1 },
            trace: "cookie=synthetic-cookie"
          },
          effective: {
            status: "passed",
            effects: [
              {
                type: "defect_mute",
                ruleCode: "worker-mute-failed-broken-total",
                reasonCode: "quality_gate.failedBrokenTotal",
                muteIds: ["mute-1"],
                affectedTestCaseIds: ["case-muted"],
                affectedSignatureHashes: ["signature-muted"],
                originalActual: 2,
                effectiveActual: 0,
                explanation: "worker projection applied"
              }
            ],
            reasons: [
              {
                code: "quality_gate.failedBrokenTotal",
                metric: "failedBrokenTotal",
                severity: "fail",
                passed: false,
                effectivePassed: true,
                actual: 2,
                effectiveActual: 0,
                affectedTestCaseIds: ["case-muted"],
                affectedResultUuids: ["result-muted"],
                statusDetails: { trace: "token=synthetic-token" },
                effects: [
                  {
                    type: "defect_mute",
                    ruleCode: "worker-mute-failed-broken-total",
                    reasonCode: "quality_gate.failedBrokenTotal",
                    muteIds: ["mute-1"]
                  }
                ]
              }
            ],
            raw: "raw-effective-payload"
          },
          distinction:
            "Raw failure counters remain unchanged; effective gate fields show explicit defect mute projection effects."
        },
        items: [
          {
            id: "mute-1",
            projectId: "project-1",
            status: "active",
            origin: { type: "actor", actorId: "actor-1" },
            mutedAt: "2026-05-30T10:00:00.000Z",
            reason: "secret=synthetic-secret",
            scope: { signatureHashes: ["signature-muted"], testCaseIds: ["case-muted"] },
            affectedSignatureHashes: ["signature-muted"],
            affectedTestIds: ["case-muted"],
            rawFailureHistory: {
              totalOccurrences: 2,
              statusCounters: { failed: 1, broken: 1 },
              byTestId: { "case-muted": 2 },
              bySignatureHash: { "signature-muted": 2 },
              raw: "raw-record-payload"
            },
            audit: { eventCount: 1, mutedEventCount: 1, unmutedEventCount: 0 },
            storageKey: "project-1/defect-mutes/mute-1",
            path: "C:\\Users\\tester\\Downloads\\mute.json",
            token: "synthetic-token"
          }
        ]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 54,
      method: "tools/call",
      params: {
        name: "testhistory.defect-mute-projection.read",
        arguments: {
          apiUrl: "http://api.test",
          projectId: "project-1",
          actorId: "actor-1",
          launchId: "launch-1",
          status: "active",
          limit: 1
        }
      }
    });

    const payload = JSON.parse(firstText(response)) as {
      kind: string;
      scope: { projectId: string; actorId: string; launchId: string };
      access: { scope: string; projectScoped: boolean; actorScoped: boolean; mutation: boolean };
      query: { projectId: string; actorId: string; limit: number; cursor: null };
      projection: {
        restReplayStatus: string;
        mcpReplayExecution: boolean;
        mutationBoundary: string;
        replayScriptPath?: string;
      };
      page: { limit: number; returned: number; nextCursor: string };
      rawFailureHistory: { totalOccurrences: number; byTestId: Record<string, number> };
      qualityGate: {
        raw: { status: string; metrics: { failedBrokenTotal: number } };
        effective: { status: string; effects: Array<{ explanation: string }> };
      };
      items: Array<{ id: string; reason?: string; storageKey?: string; path?: string }>;
      policy: {
        equalOrNarrowerThanRest: boolean;
        mutationAllowed: boolean;
        mcpReplayExecution: boolean;
        rawFailurePayloadsIncluded: boolean;
        rawEffectiveSeparation: boolean;
      };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;
    const serialized = firstText(response);

    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/projects/project-1/defect-mutes/projection?actorId=actor-1&launchId=launch-1&status=active&limit=1"
    );
    expect(headers).toEqual({
      "X-TestHistory-Scopes": "defects:read",
      "X-TestHistory-Project-Scope": "project-1",
      "X-TestHistory-Actor-Id": "actor-1"
    });
    expect(payload.kind).toBe("defect-mute-projection");
    expect(payload.scope).toEqual({
      projectId: "project-1",
      actorId: "actor-1",
      launchId: "launch-1"
    });
    expect(payload.access).toEqual(
      expect.objectContaining({
        scope: "defects:read",
        projectScoped: true,
        actorScoped: true,
        mutation: false
      })
    );
    expect(payload.query).toEqual(
      expect.objectContaining({
        projectId: "project-1",
        actorId: "actor-1",
        limit: 1,
        cursor: null
      })
    );
    expect(payload.projection.restReplayStatus).toBe("replayed");
    expect(payload.projection.mcpReplayExecution).toBe(false);
    expect(payload.projection.mutationBoundary).toBe("worker-projection-only-no-rest-mutation");
    expect(payload.projection.replayScriptPath).toBeUndefined();
    expect(payload.page).toEqual(
      expect.objectContaining({ limit: 1, returned: 1, nextCursor: "1" })
    );
    expect(payload.rawFailureHistory.totalOccurrences).toBe(2);
    expect(payload.rawFailureHistory.byTestId["case-muted"]).toBe(2);
    expect(payload.qualityGate.raw.status).toBe("failed");
    expect(payload.qualityGate.raw.metrics.failedBrokenTotal).toBe(2);
    expect(payload.qualityGate.effective.status).toBe("passed");
    expect(payload.qualityGate.effective.effects[0]?.explanation).toBe("worker projection applied");
    expect(payload.items[0]?.id).toBe("mute-1");
    expect(payload.items[0]?.reason).toBeUndefined();
    expect(payload.items[0]?.storageKey).toBeUndefined();
    expect(payload.items[0]?.path).toBeUndefined();
    expect(payload.policy).toEqual(
      expect.objectContaining({
        equalOrNarrowerThanRest: true,
        mutationAllowed: false,
        mcpReplayExecution: false,
        rawFailurePayloadsIncluded: false,
        rawEffectiveSeparation: true
      })
    );
    expect(serialized).not.toContain("synthetic-token");
    expect(serialized).not.toContain("synthetic-secret");
    expect(serialized).not.toContain("synthetic-cookie");
    expect(serialized).not.toContain("Downloads");
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("raw-record-payload");
    expect(serialized).not.toContain("raw-effective-payload");
    expect(serialized).not.toContain("replayScriptPath");
  });

  it("reads replay-derived defect mute projection alias with REST routing, scope headers, pagination, and redaction", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return jsonResponse({
        kind: "defect-mute-projection",
        projection: {
          replayStatus: "replayed",
          projectionDigest: "digest-replay",
          eventCount: 3,
          activeMuteCount: 1,
          inactiveMuteCount: 2,
          rawFailureOccurrenceCount: 7,
          replayCommand: "node C:\\Users\\tester\\Downloads\\projection-replay.js"
        },
        page: {
          limit: 2,
          cursor: "2",
          offset: 2,
          returned: 1,
          total: 3,
          nextCursor: null,
          hasMore: false
        },
        rawFailureHistory: {
          totalOccurrences: 7,
          byTestId: { "case-1": 7 },
          raw: [{ trace: "Authorization: Bearer synthetic-token" }]
        },
        items: [
          {
            id: "mute-replay-1",
            projectId: "project-1",
            status: "inactive",
            affectedTestIds: ["case-1"],
            rawFailureHistory: {
              totalOccurrences: 7,
              rawPayload: "synthetic-raw-failure"
            },
            path: "C:\\Users\\tester\\Downloads\\mute-replay.json",
            signedUrl: "https://storage.example.test/signed?token=synthetic-token"
          }
        ]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 541,
      method: "tools/call",
      params: {
        name: "testhistory.defect-mute-projection.replay.read",
        arguments: {
          apiUrl: "http://api.test",
          projectId: "project-1",
          actorId: "actor-1",
          launchId: "launch-1",
          status: "inactive",
          limit: 2,
          cursor: "2"
        }
      }
    });

    const payload = JSON.parse(firstText(response)) as {
      kind: string;
      access: { scope: string; projectScoped: boolean; actorScoped: boolean; mutation: boolean };
      page: { limit: number; cursor: string; returned: number; hasMore: boolean };
      projection: { restReplayStatus: string; mcpReplayExecution: boolean };
      rawFailureHistory: { totalOccurrences: number; byTestId: Record<string, number> };
      items: Array<{ id: string; path?: string; signedUrl?: string }>;
      policy: {
        mutationAllowed: boolean;
        mcpReplayExecution: boolean;
        replayDerivedReadModel: boolean;
        rawFailurePayloadsIncluded: boolean;
      };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;
    const serialized = firstText(response);

    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/projects/project-1/defect-mutes/projection?actorId=actor-1&launchId=launch-1&status=inactive&limit=2&cursor=2"
    );
    expect(headers).toEqual({
      "X-TestHistory-Scopes": "defects:read",
      "X-TestHistory-Project-Scope": "project-1",
      "X-TestHistory-Actor-Id": "actor-1"
    });
    expect(payload.kind).toBe("defect-mute-projection");
    expect(payload.access).toEqual(
      expect.objectContaining({
        scope: "defects:read",
        projectScoped: true,
        actorScoped: true,
        mutation: false
      })
    );
    expect(payload.page).toEqual(
      expect.objectContaining({ limit: 2, cursor: "2", returned: 1, hasMore: false })
    );
    expect(payload.projection.restReplayStatus).toBe("replayed");
    expect(payload.projection.mcpReplayExecution).toBe(false);
    expect(payload.rawFailureHistory.totalOccurrences).toBe(7);
    expect(payload.rawFailureHistory.byTestId["case-1"]).toBe(7);
    expect(payload.items[0]?.id).toBe("mute-replay-1");
    expect(payload.items[0]?.path).toBeUndefined();
    expect(payload.items[0]?.signedUrl).toBeUndefined();
    expect(payload.policy).toEqual(
      expect.objectContaining({
        mutationAllowed: false,
        mcpReplayExecution: false,
        replayDerivedReadModel: true,
        rawFailurePayloadsIncluded: false
      })
    );
    expect(serialized).not.toContain("synthetic-token");
    expect(serialized).not.toContain("Downloads");
    expect(serialized).not.toContain("signedUrl");
    expect(serialized).not.toContain("synthetic-raw-failure");
    expect(serialized).not.toContain("replayCommand");
  });

  it("preserves denied defect mute projection shape while redacting unsafe fields", async () => {
    const fetchMock = vi.fn(async () =>
      deniedResponse({
        error: "permission_denied",
        message: "Project access denied for token=synthetic-token",
        reason: "project_access_denied",
        requiredScopes: ["defects:read"],
        redacted: true,
        token: "synthetic-token",
        path: "C:\\Users\\tester\\Downloads\\projection.json",
        storageKey: "project-locked/projection.json"
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 55,
      method: "resources/read",
      params: {
        uri: "testhistory://projects/project-locked/defect-mutes/projection?apiUrl=http%3A%2F%2Fapi.test&actorId=actor-1&limit=1"
      }
    });

    const denied = JSON.parse(firstResourceText(response)) as {
      status: string;
      code: number;
      permissionDenied: { error: string; message: string; reason: string; token?: string };
      policy: { mutationAllowed: boolean; mcpReplayExecution: boolean };
    };
    const serialized = firstResourceText(response);

    expect(denied.status).toBe("error");
    expect(denied.code).toBe(403);
    expect(denied.permissionDenied).toEqual(
      expect.objectContaining({
        error: "permission_denied",
        message: "[redacted]",
        reason: "project_access_denied"
      })
    );
    expect(denied.permissionDenied.token).toBeUndefined();
    expect(denied.policy).toEqual(
      expect.objectContaining({ mutationAllowed: false, mcpReplayExecution: false })
    );
    expect(serialized).not.toContain("synthetic-token");
    expect(serialized).not.toContain("Downloads");
    expect(serialized).not.toContain("storageKey");
  });

  it("masks denied replay-derived defect mute projection reads without raw failure data", async () => {
    const fetchMock = vi.fn(async () =>
      deniedResponse({
        error: "permission_denied",
        message: "Denied token=synthetic-token",
        reason: "insufficient_scope",
        requiredScopes: ["defects:read"],
        rawFailureHistory: {
          byTestId: { "case-secret": 1 },
          raw: [{ trace: "Authorization: Bearer synthetic-token" }]
        },
        failure: { trace: "secret=synthetic-secret" },
        path: "C:\\Users\\tester\\Downloads\\projection.json",
        storageKey: "project-1/raw/projection.json",
        signedUrl: "https://storage.example.test/signed?token=synthetic-token"
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 551,
      method: "resources/read",
      params: {
        uri: "testhistory://projects/project-1/defect-mutes/projection/replay?apiUrl=http%3A%2F%2Fapi.test&actorId=actor-1&limit=1"
      }
    });

    const denied = JSON.parse(firstResourceText(response)) as {
      status: string;
      code: number;
      permissionDenied: {
        error: string;
        reason: string;
        rawFailureHistory?: unknown;
        failure?: unknown;
      };
      policy: {
        mutationAllowed: boolean;
        mcpReplayExecution: boolean;
        replayDerivedReadModel: boolean;
        rawFailurePayloadsIncluded: boolean;
      };
    };
    const serialized = firstResourceText(response);

    expect(denied.status).toBe("error");
    expect(denied.code).toBe(403);
    expect(denied.permissionDenied).toEqual(
      expect.objectContaining({
        error: "permission_denied",
        reason: "insufficient_scope"
      })
    );
    expect(denied.permissionDenied.rawFailureHistory).toBeUndefined();
    expect(denied.permissionDenied.failure).toBeUndefined();
    expect(denied.policy).toEqual(
      expect.objectContaining({
        mutationAllowed: false,
        mcpReplayExecution: false,
        replayDerivedReadModel: true,
        rawFailurePayloadsIncluded: false
      })
    );
    expect(serialized).not.toContain("synthetic-token");
    expect(serialized).not.toContain("synthetic-secret");
    expect(serialized).not.toContain("Downloads");
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("signedUrl");
    expect(serialized).not.toContain("rawFailureHistory");
  });

  it("reads defect mute replay invariant evidence with REST routing, scope headers, pagination, and redaction", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return jsonResponse({
        kind: "defect-mute-replay-invariant",
        projectId: "project-1",
        actor: { type: "actor", actorId: "actor-1", scoped: true },
        access: {
          scope: "defects:read",
          projectScoped: true,
          actorScoped: true,
          mutation: true,
          redacted: false
        },
        query: { projectId: "project-1", actorId: "actor-1", limit: 1, cursor: "1" },
        invariant: {
          boundary: "read-only-defect-mute-replay-invariant",
          source: "worker-local-mute-projection",
          consistency: "append-only-replay",
          mutationBoundary: "rest-read-only-no-replay-mutation",
          mcpReplayExecution: true,
          deterministic: true,
          recomputable: true,
          projectScoped: true,
          projectionDigest: "projection-digest-1",
          recomputedDigest: "projection-digest-1",
          replayCommand: "node C:\\Users\\tester\\Downloads\\replay.js"
        },
        rawEffectiveSeparation: {
          effectiveStateExcludesRawFailureHistory: true,
          rawFailureHistoryPreserved: true,
          rawFailureHistoryNotMutatedByUnmute: true,
          rawFailureOccurrenceCount: 3,
          effectiveRecordCount: 1,
          documentation:
            "No local C:\\Users\\tester\\Downloads\\synthetic-results payloads included"
        },
        appendOnly: {
          uniqueProjectedEventIds: true,
          duplicateEventIds: ["event-duplicate-token=synthetic-token"],
          totalProjectedEventIds: 2
        },
        redaction: {
          passed: false,
          leakedMarkers: ["C:\\Users\\tester\\Downloads\\synthetic-results\\raw.json"],
          policy: "token=synthetic-token must not leak"
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
            eventId: "event-2",
            rawFailurePayload: "Authorization: Bearer synthetic-token",
            path: "C:\\Users\\tester\\Downloads\\failure.json",
            storageKey: "project-1/raw/failure.json",
            signedUrl: "https://storage.example.test/failure?token=synthetic-token"
          }
        ],
        rawFailurePayload: "secret raw failure payload",
        storageRef: "storage://bucket/raw-failure"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const toolResponse = await handle({
      jsonrpc: "2.0",
      id: 552,
      method: "tools/call",
      params: {
        name: "testhistory.defect-mute-projection.replay.invariants.read",
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
      id: 553,
      method: "resources/read",
      params: {
        uri: "testhistory://projects/project-1/defect-mutes/projection/replay/invariants?apiUrl=http%3A%2F%2Fapi.test&actorId=actor-1&limit=1&cursor=1"
      }
    });

    const payload = JSON.parse(firstText(toolResponse)) as {
      kind: string;
      scope: { projectId: string; actorId: string };
      access: { scope: string; projectScoped: boolean; actorScoped: boolean; mutation: boolean };
      query: { projectId: string; actorId: string; limit: number; cursor: string };
      invariant: {
        deterministic: boolean;
        recomputable: boolean;
        projectScoped: boolean;
        mcpReplayExecution: boolean;
        projectionDigest: string;
      };
      rawEffectiveSeparation: {
        rawFailureOccurrenceCount: number;
        effectiveRecordCount: number;
      };
      appendOnly: { duplicateEventIds: string[]; totalProjectedEventIds: number };
      redaction: { leakedMarkers: string[]; policy: string };
      page: { limit: number; cursor: string; returned: number };
      items: Array<{ ordinal: number; eventId: string; rawFailurePayload?: string }>;
      policy: {
        mutationAllowed: boolean;
        mcpReplayExecution: boolean;
        replayInvariantReadModel: boolean;
        rawFailurePayloadsIncluded: boolean;
        deniedStateMasked: boolean;
      };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;
    const serialized = firstText(toolResponse);

    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/projects/project-1/defect-mutes/projection/replay/invariants?actorId=actor-1&limit=1&cursor=1"
    );
    expect(headers).toEqual({
      "X-TestHistory-Scopes": "defects:read",
      "X-TestHistory-Project-Scope": "project-1",
      "X-TestHistory-Actor-Id": "actor-1"
    });
    expect(JSON.parse(firstResourceText(resourceResponse))).toEqual(
      expect.objectContaining({ kind: "defect-mute-replay-invariant" })
    );
    expect(payload.kind).toBe("defect-mute-replay-invariant");
    expect(payload.scope).toEqual({ projectId: "project-1", actorId: "actor-1" });
    expect(payload.access).toEqual(
      expect.objectContaining({
        scope: "defects:read",
        projectScoped: true,
        actorScoped: true,
        mutation: false
      })
    );
    expect(payload.query).toEqual({
      projectId: "project-1",
      actorId: "actor-1",
      limit: 1,
      cursor: "1"
    });
    expect(payload.invariant).toEqual(
      expect.objectContaining({
        deterministic: true,
        recomputable: true,
        projectScoped: true,
        mcpReplayExecution: false,
        projectionDigest: "projection-digest-1"
      })
    );
    expect(payload.rawEffectiveSeparation.rawFailureOccurrenceCount).toBe(3);
    expect(payload.rawEffectiveSeparation.effectiveRecordCount).toBe(1);
    expect(payload.appendOnly.totalProjectedEventIds).toBe(2);
    expect(payload.appendOnly.duplicateEventIds).toEqual(["[redacted]"]);
    expect(payload.redaction.leakedMarkers).toEqual(["[redacted]"]);
    expect(payload.redaction.policy).toBe("[redacted]");
    expect(payload.page).toEqual(expect.objectContaining({ limit: 1, cursor: "1", returned: 1 }));
    expect(payload.items).toEqual([{ ordinal: 1, eventId: "event-2" }]);
    expect(payload.policy).toEqual(
      expect.objectContaining({
        mutationAllowed: false,
        mcpReplayExecution: false,
        replayInvariantReadModel: true,
        rawFailurePayloadsIncluded: false,
        deniedStateMasked: true
      })
    );
    expect(serialized).not.toContain("synthetic-token");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("Downloads");
    expect(serialized).not.toContain("allure-results");
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("storage://");
    expect(serialized).not.toContain("signedUrl");
    expect(serialized).not.toContain("secret raw failure payload");
    expect(serialized).not.toContain("replayCommand");
  });

  it("masks denied defect mute replay invariant reads and rejects mutation tools", async () => {
    const fetchMock = vi.fn(async () =>
      deniedResponse({
        error: "permission_denied",
        message: "Denied token=synthetic-token",
        reason: "insufficient_scope",
        requiredScopes: ["defects:read"],
        rawFailureHistory: {
          byTestId: { "case-secret": 1 },
          raw: [{ trace: "Authorization: Bearer synthetic-token" }]
        },
        rawFailurePayload: "secret raw failure payload",
        path: "C:\\Users\\tester\\Downloads\\projection.json",
        storageKey: "project-1/raw/projection.json",
        signedUrl: "https://storage.example.test/signed?token=synthetic-token"
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const deniedRead = await handle({
      jsonrpc: "2.0",
      id: 554,
      method: "tools/call",
      params: {
        name: "testhistory.defect-mute-projection.replay.invariants.read",
        arguments: { apiUrl: "http://api.test", projectId: "project-1", actorId: "actor-1" }
      }
    });
    const missingScope = await handle({
      jsonrpc: "2.0",
      id: 555,
      method: "tools/call",
      params: {
        name: "testhistory.defect-mute-projection.replay.invariants.read",
        arguments: {}
      }
    });
    const refreshTool = await handle({
      jsonrpc: "2.0",
      id: 556,
      method: "tools/call",
      params: {
        name: "testhistory.defect-mute-projection.replay.invariants.refresh",
        arguments: { projectId: "project-1" }
      }
    });
    const deleteTool = await handle({
      jsonrpc: "2.0",
      id: 557,
      method: "tools/call",
      params: {
        name: "testhistory.defect-mute-projection.replay.invariants.delete",
        arguments: { projectId: "project-1" }
      }
    });

    const payload = JSON.parse(firstText(deniedRead)) as {
      status: string;
      code: number;
      permissionDenied: { error: string; reason: string; rawFailureHistory?: unknown };
      policy: {
        mutationAllowed: boolean;
        mcpReplayExecution: boolean;
        replayInvariantReadModel: boolean;
        rawFailurePayloadsIncluded: boolean;
      };
    };
    const serialized = firstText(deniedRead);

    expect(payload.status).toBe("error");
    expect(payload.code).toBe(403);
    expect(payload.permissionDenied).toEqual(
      expect.objectContaining({ error: "permission_denied", reason: "insufficient_scope" })
    );
    expect(payload.permissionDenied.rawFailureHistory).toBeUndefined();
    expect(payload.policy).toEqual(
      expect.objectContaining({
        mutationAllowed: false,
        mcpReplayExecution: false,
        replayInvariantReadModel: true,
        rawFailurePayloadsIncluded: false
      })
    );
    expect(missingScope.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "projectId is required for defect mute replay invariant reads"
      })
    );
    expect(refreshTool.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "Unknown tool: testhistory.defect-mute-projection.replay.invariants.refresh"
      })
    );
    expect(deleteTool.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "Unknown tool: testhistory.defect-mute-projection.replay.invariants.delete"
      })
    );
    expect(serialized).not.toContain("synthetic-token");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("Downloads");
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("signedUrl");
    expect(serialized).not.toContain("rawFailureHistory");
    expect(serialized).not.toContain("secret raw failure payload");
  });

  it("reads materialized defect mute replay invariant MCP parity as scoped redacted pages", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return jsonResponse({
        kind: "defect-mute-replay-invariant-materialized-read",
        projectId: "project-1",
        actor: { type: "actor", actorId: "actor-1", scoped: true },
        access: {
          scope: "defects:read",
          projectScoped: true,
          actorScoped: true,
          mutation: true,
          redacted: false
        },
        availability: {
          status: "ready",
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          partial: false,
          unavailable: ["synthetic://blocked/raw-failure-payload"]
        },
        query: { projectId: "project-1", actorId: "actor-1", limit: 1, cursor: "1" },
        materialization: {
          adapterKind: "api-read-model-defect-mute-replay-invariant-materialized-wip",
          boundary: "worker-compatible-defect-mute-replay-invariant-materialized-read",
          consistency: "retry-safe-idempotent-projected-mute-state",
          source: "projected-defect-mute-state",
          readOnly: false,
          rawFailurePayloadsIncluded: true,
          mutationBoundary: "unsafe-mutation",
          materializedAt: "2026-05-30T00:00:00.000Z",
          materializedRecordCount: 2,
          materializationDigest: "digest-1",
          workerCommand: "node synthetic://worker/replay-mutation"
        },
        summary: {
          projectId: "project-1",
          materializedRecordCount: 2,
          deterministic: true,
          recomputable: true,
          projectScoped: true,
          appendOnlyUniqueProjectedEventIds: true,
          redactionPassed: true,
          effectiveStateExcludesRawFailureHistory: true,
          rawFailureHistoryPreserved: true,
          rawFailureHistoryNotMutatedByUnmute: true,
          rawFailureOccurrenceCount: 7,
          effectiveRecordCount: 2,
          materializationDigest: "digest-1",
          projectedMuteStateCompatible: false,
          mutationBoundary: "unsafe-mutation",
          plannedOperations: [
            "defect_mute.replay_invariant.summarize",
            "defect_mute.replay_invariant.materialized_read",
            "defect_mute.replay_invariant.refresh"
          ],
          rawFailurePayload: "synthetic-secret"
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
            invariantRef: "defect-mute-replay-invariant:abcdefabcdefabcdefabcdef",
            projectId: "project-1",
            source: "projected-defect-mute-state",
            materializedAt: "2026-05-30T00:00:00.000Z",
            deterministic: true,
            recomputable: true,
            projectScoped: true,
            appendOnly: {
              uniqueProjectedEventIds: true,
              projectedEventCount: 4,
              duplicateEventCount: 1,
              duplicateEventIdHashes: ["abcdefabcdefabcdefabcdef"]
            },
            redaction: {
              passed: true,
              leakedMarkerCount: 1,
              leakedMarkerHashes: ["bbbbbbbbbbbbbbbbbbbbbbbb"]
            },
            rawEffectiveSeparation: {
              effectiveStateExcludesRawFailureHistory: true,
              rawFailureHistoryPreserved: true,
              rawFailureHistoryNotMutatedByUnmute: true,
              rawFailureOccurrenceCount: 7,
              effectiveRecordCount: 2,
              rawFailurePayloadIncluded: true,
              documentation: "synthetic://fixtures/raw-failure-payload"
            },
            projectionDigest: "projection-digest-1",
            recomputedDigest: "projection-digest-1",
            evidenceDigest: "abcdefabcdefabcdefabcdef",
            rawFailurePayload: "Authorization: Bearer synthetic-secret",
            path: "synthetic://local/raw-failure.json",
            storageKey: "synthetic-storage-key",
            signedUrl: "https://storage.example.test/failure?token=synthetic-secret",
            providerMutationHandle: "delete synthetic object"
          }
        ],
        rawFailurePayload: "synthetic-secret",
        signedUrl: "https://storage.example.test/root?token=synthetic-secret"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const toolResponse = await handle({
      jsonrpc: "2.0",
      id: 558,
      method: "tools/call",
      params: {
        name: "testhistory.defect-mute-projection.replay.invariants.materialized.read",
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
      id: 559,
      method: "resources/read",
      params: {
        uri: "testhistory://projects/project-1/defect-mutes/projection/replay/invariants/materialized?apiUrl=http%3A%2F%2Fapi.test&actorId=actor-1&limit=1&cursor=1"
      }
    });

    const payload = JSON.parse(firstText(toolResponse)) as {
      kind: string;
      projectId: string;
      actor: { actorId: string; scoped: boolean };
      access: { scope: string; projectScoped: boolean; actorScoped: boolean; mutation: boolean };
      query: { projectId: string; actorId: string; limit: number; cursor: string };
      materialization: {
        readOnly: boolean;
        rawFailurePayloadsIncluded: boolean;
        mutationBoundary: string;
        materializedRecordCount: number;
      };
      summary: {
        projectedMuteStateCompatible: boolean;
        mutationBoundary: string;
        plannedOperations: string[];
      };
      page: { limit: number; cursor: string; returned: number };
      items: Array<{
        redaction: { leakedMarkerHashes: string[] };
        rawEffectiveSeparation: { rawFailurePayloadIncluded: boolean; documentation?: string };
        rawFailurePayload?: string;
      }>;
      policy: {
        mutationAllowed: boolean;
        mcpReplayExecution: boolean;
        mcpWorkerExecution: boolean;
        materializedInvariantReadModel: boolean;
        rawFailurePayloadsIncluded: boolean;
      };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;
    const serialized = firstText(toolResponse);

    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/projects/project-1/defect-mutes/projection/replay/invariants/materialized?actorId=actor-1&limit=1&cursor=1"
    );
    expect(headers).toEqual({
      "X-TestHistory-Scopes": "defects:read",
      "X-TestHistory-Project-Scope": "project-1",
      "X-TestHistory-Actor-Id": "actor-1"
    });
    expect(JSON.parse(firstResourceText(resourceResponse))).toEqual(
      expect.objectContaining({ kind: "defect-mute-replay-invariant-materialized-read" })
    );
    expect(payload.kind).toBe("defect-mute-replay-invariant-materialized-read");
    expect(payload.projectId).toBe("project-1");
    expect(payload.actor).toEqual({ type: "actor", actorId: "actor-1", scoped: true });
    expect(payload.access).toEqual(
      expect.objectContaining({
        scope: "defects:read",
        projectScoped: true,
        actorScoped: true,
        mutation: false
      })
    );
    expect(payload.query).toEqual({
      projectId: "project-1",
      actorId: "actor-1",
      limit: 1,
      cursor: "1"
    });
    expect(payload.materialization).toEqual(
      expect.objectContaining({
        readOnly: true,
        rawFailurePayloadsIncluded: false,
        mutationBoundary: "rest-read-only-no-worker-or-replay-mutation",
        materializedRecordCount: 2
      })
    );
    expect(payload.summary.projectedMuteStateCompatible).toBe(true);
    expect(payload.summary.mutationBoundary).toBe(
      "api-materialized-read-only-no-rest-or-worker-mutation"
    );
    expect(payload.summary.plannedOperations).toEqual([
      "defect_mute.replay_invariant.summarize",
      "defect_mute.replay_invariant.materialized_read"
    ]);
    expect(payload.page).toEqual(expect.objectContaining({ limit: 1, cursor: "1", returned: 1 }));
    expect(payload.items[0]?.rawFailurePayload).toBeUndefined();
    expect(payload.items[0]?.rawEffectiveSeparation.rawFailurePayloadIncluded).toBe(false);
    expect(payload.items[0]?.rawEffectiveSeparation.documentation).toBeUndefined();
    expect(payload.policy).toEqual(
      expect.objectContaining({
        mutationAllowed: false,
        mcpReplayExecution: false,
        mcpWorkerExecution: false,
        materializedInvariantReadModel: true,
        rawFailurePayloadsIncluded: false
      })
    );
    expect(serialized).not.toContain("synthetic-secret");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("synthetic://");
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("signedUrl");
    expect(serialized).not.toContain("providerMutationHandle");
    expect(serialized).not.toContain("delete synthetic object");
    expect(serialized).not.toContain("workerCommand");
  });
});
