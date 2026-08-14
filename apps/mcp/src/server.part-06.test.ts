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

describe("MCP tools part-06", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("masks denied materialized defect mute replay invariant reads and rejects mutation tools", async () => {
    const fetchMock = vi.fn(async () =>
      deniedResponse({
        error: "PermissionDeniedError",
        message: "Denied token=synthetic-secret",
        requiredScopes: ["defects:read"],
        projectId: "project-1",
        availability: {
          status: "denied",
          reason: "missing_scope",
          projectScoped: true,
          actorScoped: true,
          redacted: true,
          partial: false,
          unavailable: ["defect-mute-replay-invariant-materialized-read"]
        },
        rawFailurePayload: "Authorization: Bearer synthetic-secret",
        path: "synthetic://local/materialized.json",
        storageKey: "synthetic-storage-key",
        signedUrl: "https://storage.example.test/signed?token=synthetic-secret"
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const deniedRead = await handle({
      jsonrpc: "2.0",
      id: 560,
      method: "tools/call",
      params: {
        name: "testhistory.defect-mute-projection.replay.invariants.materialized.read",
        arguments: { apiUrl: "http://api.test", projectId: "project-1", actorId: "actor-1" }
      }
    });
    const missingScope = await handle({
      jsonrpc: "2.0",
      id: 561,
      method: "tools/call",
      params: {
        name: "testhistory.defect-mute-projection.replay.invariants.materialized.read",
        arguments: {}
      }
    });
    const refreshTool = await handle({
      jsonrpc: "2.0",
      id: 562,
      method: "tools/call",
      params: {
        name: "testhistory.defect-mute-projection.replay.invariants.materialized.refresh",
        arguments: { projectId: "project-1" }
      }
    });
    const deleteTool = await handle({
      jsonrpc: "2.0",
      id: 563,
      method: "tools/call",
      params: {
        name: "testhistory.defect-mute-projection.replay.invariants.materialized.delete",
        arguments: { projectId: "project-1" }
      }
    });

    const payload = JSON.parse(firstText(deniedRead)) as {
      status: string;
      code: number;
      availability: { status: string; unavailable: string[] };
      policy: {
        mutationAllowed: boolean;
        mcpReplayExecution: boolean;
        mcpWorkerExecution: boolean;
        materializedInvariantReadModel: boolean;
        rawFailurePayloadsIncluded: boolean;
      };
    };
    const serialized = firstText(deniedRead);

    expect(payload.status).toBe("error");
    expect(payload.code).toBe(403);
    expect(payload.availability).toEqual(
      expect.objectContaining({
        status: "denied",
        unavailable: ["defect-mute-replay-invariant-materialized-read"]
      })
    );
    expect(payload.policy).toEqual(
      expect.objectContaining({
        mutationAllowed: false,
        mcpReplayExecution: false,
        mcpWorkerExecution: false,
        materializedInvariantReadModel: true,
        rawFailurePayloadsIncluded: false
      })
    );
    expect(missingScope.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "projectId is required for materialized defect mute replay invariant reads"
      })
    );
    expect(refreshTool.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message:
          "Unknown tool: testhistory.defect-mute-projection.replay.invariants.materialized.refresh"
      })
    );
    expect(deleteTool.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message:
          "Unknown tool: testhistory.defect-mute-projection.replay.invariants.materialized.delete"
      })
    );
    expect(serialized).not.toContain("synthetic-secret");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("synthetic://");
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("signedUrl");
    expect(serialized).not.toContain("Authorization:");
  });

  it("keeps materialized defect mute invariant transcript read-only, stable, paginated, and redacted", async () => {
    const restTranscript: Array<{
      method: string;
      url: string;
      headers: Record<string, string>;
    }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      restTranscript.push({
        method: init?.method ?? "GET",
        url: input.toString(),
        headers: (init?.headers ?? {}) as Record<string, string>
      });

      if (input.searchParams.get("actorId") === "actor-denied") {
        return deniedResponse({
          error: "PermissionDeniedError",
          message: "Denied raw materialized payload token=transcript-secret",
          requiredScopes: ["defects:read"],
          availability: {
            status: "denied",
            projectScoped: true,
            actorScoped: true,
            redacted: false,
            partial: false,
            unavailable: [
              "defect-mute-replay-invariant-materialized-read",
              "rawFailurePayload:transcript-secret"
            ]
          },
          rawFailurePayload: "Authorization: Bearer transcript-secret",
          rawFailureHistory: { trace: "transcript-secret" },
          path: "C:\\Users\\tester\\Downloads\\materialized-transcript.json",
          storageKey: "project-1/raw/materialized-transcript.json",
          signedUrl: "https://storage.example.test/materialized?token=transcript-secret"
        });
      }

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
          unavailable: ["rawFailurePayload:transcript-secret"]
        },
        query: { projectId: "project-1", actorId: "actor-1", limit: 2, cursor: "page-1" },
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
          materializationDigest: "digest-transcript",
          replayExecution: "node replay.js",
          workerMutationHandle: "refresh materialized invariant"
        },
        summary: {
          projectId: "project-1",
          materializedRecordCount: 2,
          deterministic: true,
          recomputable: true,
          projectScoped: true,
          appendOnlyUniqueProjectedEventIds: true,
          redactionPassed: false,
          effectiveStateExcludesRawFailureHistory: true,
          rawFailureHistoryPreserved: true,
          rawFailureHistoryNotMutatedByUnmute: true,
          rawFailureOccurrenceCount: 11,
          effectiveRecordCount: 2,
          materializationDigest: "digest-transcript",
          projectedMuteStateCompatible: false,
          mutationBoundary: "unsafe-mutation",
          plannedOperations: [
            "defect_mute.replay_invariant.summarize",
            "defect_mute.replay_invariant.materialized_read",
            "defect_mute.replay_invariant.refresh",
            "defect_mute.replay_invariant.delete"
          ],
          rawFailurePayload: "Authorization: Bearer transcript-secret"
        },
        page: {
          limit: 2,
          cursor: "page-1",
          offset: 0,
          returned: 2,
          total: 3,
          nextCursor: "page-2",
          hasMore: true
        },
        items: [
          {
            invariantRef: "defect-mute-replay-invariant:111111111111111111111111",
            projectId: "project-1",
            deterministic: true,
            recomputable: true,
            projectScoped: true,
            appendOnly: {
              uniqueProjectedEventIds: true,
              projectedEventCount: 2,
              duplicateEventCount: 0,
              duplicateEventIdHashes: []
            },
            redaction: {
              passed: false,
              leakedMarkerCount: 1,
              leakedMarkerHashes: ["222222222222222222222222"]
            },
            rawEffectiveSeparation: {
              effectiveStateExcludesRawFailureHistory: true,
              rawFailureHistoryPreserved: true,
              rawFailureHistoryNotMutatedByUnmute: true,
              rawFailureOccurrenceCount: 11,
              effectiveRecordCount: 2,
              rawFailurePayloadIncluded: true,
              documentation: "C:\\Users\\tester\\Downloads\\raw-failure.json"
            },
            projectionDigest: "projection-digest-1",
            recomputedDigest: "projection-digest-1",
            evidenceDigest: "111111111111111111111111",
            rawFailurePayload: "Authorization: Bearer transcript-secret",
            rawFailureHistory: { token: "transcript-secret" },
            storageKey: "project-1/raw/failure.json",
            signedUrl: "https://storage.example.test/failure?token=transcript-secret",
            workerMutationHandle: "delete materialized invariant"
          }
        ],
        rawFailurePayload: "Authorization: Bearer transcript-secret",
        signedUrl: "https://storage.example.test/root?token=transcript-secret"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const beforeTools = await handle({ jsonrpc: "2.0", id: 564, method: "tools/list" });
    const beforeResources = await handle({ jsonrpc: "2.0", id: 565, method: "resources/list" });
    const allowedRead = await handle({
      jsonrpc: "2.0",
      id: 566,
      method: "tools/call",
      params: {
        name: "testhistory.defect-mute-projection.replay.invariants.materialized.read",
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
      id: 567,
      method: "tools/call",
      params: {
        name: "testhistory.defect-mute-projection.replay.invariants.materialized.read",
        arguments: {
          apiUrl: "http://api.test",
          projectId: "project-1",
          actorId: "actor-denied"
        }
      }
    });
    const attemptedRefresh = await handle({
      jsonrpc: "2.0",
      id: 568,
      method: "tools/call",
      params: {
        name: "testhistory.defect-mute-projection.replay.invariants.materialized.refresh",
        arguments: { apiUrl: "http://api.test", projectId: "project-1", actorId: "actor-1" }
      }
    });
    const attemptedDelete = await handle({
      jsonrpc: "2.0",
      id: 569,
      method: "tools/call",
      params: {
        name: "testhistory.defect-mute-projection.replay.invariants.materialized.delete",
        arguments: { apiUrl: "http://api.test", projectId: "project-1", actorId: "actor-1" }
      }
    });
    const afterTools = await handle({ jsonrpc: "2.0", id: 570, method: "tools/list" });
    const afterResources = await handle({ jsonrpc: "2.0", id: 571, method: "resources/list" });

    const beforeToolNames = (beforeTools.result as { tools: Array<{ name: string }> }).tools.map(
      (tool) => tool.name
    );
    const afterToolNames = (afterTools.result as { tools: Array<{ name: string }> }).tools.map(
      (tool) => tool.name
    );
    const beforeResourceUris = (
      beforeResources.result as { resources: Array<{ uri: string }> }
    ).resources.map((resource) => resource.uri);
    const afterResourceUris = (
      afterResources.result as { resources: Array<{ uri: string }> }
    ).resources.map((resource) => resource.uri);
    const allowedPayload = JSON.parse(firstText(allowedRead)) as {
      access: { mutation: boolean; redacted: boolean };
      availability: { unavailable: string[]; redacted: boolean };
      materialization: {
        readOnly: boolean;
        rawFailurePayloadsIncluded: boolean;
        mutationBoundary: string;
      };
      summary: { plannedOperations: string[]; mutationBoundary: string };
      page: {
        limit: number;
        cursor: string;
        returned: number;
        nextCursor: string;
        hasMore: boolean;
      };
      items: Array<{
        rawFailurePayload?: unknown;
        rawFailureHistory?: unknown;
        rawEffectiveSeparation: { rawFailurePayloadIncluded: boolean; documentation?: string };
      }>;
      policy: {
        equalOrNarrowerThanRest: boolean;
        mutationAllowed: boolean;
        mcpReplayExecution: boolean;
        mcpWorkerExecution: boolean;
        materializedInvariantReadModel: boolean;
        rawFailurePayloadsIncluded: boolean;
        deniedStateMasked: boolean;
      };
    };
    const deniedPayload = JSON.parse(firstText(deniedRead)) as {
      status: string;
      code: number;
      availability: { status: string; redacted: boolean; unavailable: string[] };
      policy: {
        equalOrNarrowerThanRest: boolean;
        mutationAllowed: boolean;
        rawFailurePayloadsIncluded: boolean;
        deniedStateMasked: boolean;
      };
    };
    const transcript = [
      { step: "tools-before", toolNames: beforeToolNames },
      { step: "resources-before", resourceUris: beforeResourceUris },
      { step: "allowed-read", response: allowedRead },
      { step: "denied-read", response: deniedRead },
      { step: "attempted-refresh", response: attemptedRefresh },
      { step: "attempted-delete", response: attemptedDelete },
      { step: "tools-after", toolNames: afterToolNames },
      { step: "resources-after", resourceUris: afterResourceUris }
    ];
    const serializedTranscript = JSON.stringify(transcript);

    expect(beforeToolNames).toEqual(afterToolNames);
    expect(beforeResourceUris).toEqual(afterResourceUris);
    expect(
      beforeToolNames.filter((name) =>
        name.startsWith("testhistory.defect-mute-projection.replay.invariants.materialized")
      )
    ).toEqual(["testhistory.defect-mute-projection.replay.invariants.materialized.read"]);
    expect(beforeToolNames).not.toEqual(
      expect.arrayContaining([
        "testhistory.defect-mute-projection.replay.invariants.materialized.refresh",
        "testhistory.defect-mute-projection.replay.invariants.materialized.delete",
        "testhistory.defect-mute-projection.replay.invariants.materialized.create"
      ])
    );
    expect(
      beforeResourceUris.filter((uri) =>
        uri.includes("/defect-mutes/projection/replay/invariants/materialized")
      )
    ).toEqual([
      "testhistory://projects/{projectId}/defect-mutes/projection/replay/invariants/materialized"
    ]);

    expect(restTranscript).toEqual([
      {
        method: "GET",
        url: "http://api.test/api/v1/projects/project-1/defect-mutes/projection/replay/invariants/materialized?actorId=actor-1&limit=2&cursor=page-1",
        headers: {
          "X-TestHistory-Scopes": "defects:read",
          "X-TestHistory-Project-Scope": "project-1",
          "X-TestHistory-Actor-Id": "actor-1"
        }
      },
      {
        method: "GET",
        url: "http://api.test/api/v1/projects/project-1/defect-mutes/projection/replay/invariants/materialized?actorId=actor-denied&limit=100",
        headers: {
          "X-TestHistory-Scopes": "defects:read",
          "X-TestHistory-Project-Scope": "project-1",
          "X-TestHistory-Actor-Id": "actor-denied"
        }
      }
    ]);
    expect(restTranscript.every((entry) => entry.method === "GET")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect(allowedPayload.access).toEqual(
      expect.objectContaining({ mutation: false, redacted: true })
    );
    expect(allowedPayload.availability).toEqual(
      expect.objectContaining({ redacted: true, unavailable: ["[redacted]"] })
    );
    expect(allowedPayload.materialization).toEqual(
      expect.objectContaining({
        readOnly: true,
        rawFailurePayloadsIncluded: false,
        mutationBoundary: "rest-read-only-no-worker-or-replay-mutation"
      })
    );
    expect(allowedPayload.summary.plannedOperations).toEqual([
      "defect_mute.replay_invariant.summarize",
      "defect_mute.replay_invariant.materialized_read"
    ]);
    expect(allowedPayload.summary.mutationBoundary).toBe(
      "api-materialized-read-only-no-rest-or-worker-mutation"
    );
    expect(allowedPayload.page).toEqual(
      expect.objectContaining({
        limit: 2,
        cursor: "page-1",
        returned: 2,
        nextCursor: "page-2",
        hasMore: true
      })
    );
    expect(allowedPayload.items[0]?.rawFailurePayload).toBeUndefined();
    expect(allowedPayload.items[0]?.rawFailureHistory).toBeUndefined();
    expect(allowedPayload.items[0]?.rawEffectiveSeparation).toEqual(
      expect.objectContaining({ rawFailurePayloadIncluded: false })
    );
    expect(allowedPayload.items[0]?.rawEffectiveSeparation.documentation).toBeUndefined();
    expect(allowedPayload.policy).toEqual(
      expect.objectContaining({
        equalOrNarrowerThanRest: true,
        mutationAllowed: false,
        mcpReplayExecution: false,
        mcpWorkerExecution: false,
        materializedInvariantReadModel: true,
        rawFailurePayloadsIncluded: false,
        deniedStateMasked: true
      })
    );

    expect(deniedPayload).toEqual(
      expect.objectContaining({
        status: "error",
        code: 403,
        availability: expect.objectContaining({
          status: "denied",
          redacted: true,
          unavailable: ["defect-mute-replay-invariant-materialized-read", "[redacted]"]
        }),
        policy: expect.objectContaining({
          equalOrNarrowerThanRest: true,
          mutationAllowed: false,
          rawFailurePayloadsIncluded: false,
          deniedStateMasked: true
        })
      })
    );
    expect(attemptedRefresh.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message:
          "Unknown tool: testhistory.defect-mute-projection.replay.invariants.materialized.refresh"
      })
    );
    expect(attemptedDelete.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message:
          "Unknown tool: testhistory.defect-mute-projection.replay.invariants.materialized.delete"
      })
    );
    expect(serializedTranscript).not.toContain("transcript-secret");
    expect(serializedTranscript).not.toContain("Bearer");
    expect(serializedTranscript).not.toContain("Downloads");
    expect(serializedTranscript).not.toContain('"rawFailurePayload":');
    expect(serializedTranscript).not.toContain('"rawFailureHistory":');
    expect(serializedTranscript).not.toContain("storageKey");
    expect(serializedTranscript).not.toContain("signedUrl");
    expect(serializedTranscript).not.toContain("workerMutationHandle");
    expect(serializedTranscript).not.toContain("replayExecution");
  });

  it("reads launch quality-gate mute effects without exposing raw failures", async () => {
    const fetchedUrls: URL[] = [];
    const fetchMock = vi.fn(async (input: URL) => {
      fetchedUrls.push(input);
      return jsonResponse({
        status: "passed",
        rawStatus: "failed",
        raw: { failure: "raw-gate-payload" },
        reasons: [
          {
            code: "quality_gate.failedBrokenTotal",
            metric: "failedBrokenTotal",
            severity: "fail",
            passed: false,
            effectivePassed: true,
            actual: 1,
            effectiveActual: 0,
            affectedTestCaseIds: ["case-muted"],
            affectedResultUuids: ["result-muted"],
            statusDetails: { trace: "cookie=synthetic-cookie" },
            effects: [
              {
                type: "defect_mute",
                ruleCode: "mute-failed-broken-total",
                reasonCode: "quality_gate.failedBrokenTotal",
                muteIds: ["mute-1"],
                affectedTestCaseIds: ["case-muted"],
                affectedSignatureHashes: ["signature-muted"],
                originalActual: 1,
                effectiveActual: 0,
                explanation: "Explicit mute applied"
              }
            ]
          }
        ],
        effects: [
          {
            type: "defect_mute",
            ruleCode: "mute-failed-broken-total",
            reasonCode: "quality_gate.failedBrokenTotal",
            muteIds: ["mute-1"],
            affectedTestCaseIds: ["case-muted"],
            affectedSignatureHashes: ["signature-muted"],
            originalActual: 1,
            effectiveActual: 0,
            explanation: "Explicit mute applied",
            payload: "raw-effect-payload"
          }
        ]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 51,
      method: "resources/read",
      params: {
        uri: "testhistory://launches/launch-1/quality-gate/mute-effects?apiUrl=http%3A%2F%2Fapi.test&limit=1"
      }
    });

    const payload = JSON.parse(firstResourceText(response)) as {
      kind: string;
      scope: { launchId: string };
      status: string;
      rawStatus: string;
      effects: Array<{ type: string; payload?: unknown }>;
      reasons: Array<{ code: string; statusDetails?: unknown; effects: Array<{ type: string }> }>;
      policy: { equalOrNarrowerThanRest: boolean; rawFailurePayloadsIncluded: boolean };
    };
    const serialized = firstResourceText(response);

    expect(fetchedUrls[0]?.toString()).toBe(
      "http://api.test/api/v1/launches/launch-1/quality-gate"
    );
    expect(payload.kind).toBe("defect-mute-effects");
    expect(payload.scope.launchId).toBe("launch-1");
    expect(payload.status).toBe("passed");
    expect(payload.rawStatus).toBe("failed");
    expect(payload.effects).toEqual([
      expect.objectContaining({ type: "defect_mute", ruleCode: "mute-failed-broken-total" })
    ]);
    expect(payload.effects[0]?.payload).toBeUndefined();
    expect(payload.reasons[0]?.code).toBe("quality_gate.failedBrokenTotal");
    expect(payload.reasons[0]?.statusDetails).toBeUndefined();
    expect(payload.policy).toEqual(
      expect.objectContaining({
        equalOrNarrowerThanRest: true,
        rawFailurePayloadsIncluded: false
      })
    );
    expect(serialized).not.toContain("raw-gate-payload");
    expect(serialized).not.toContain("raw-effect-payload");
    expect(serialized).not.toContain("synthetic-cookie");
  });

  it("reads archive status through REST with project headers, pagination, and MCP redaction", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return jsonResponse({
        kind: "archive-upload-status-list",
        launch: {
          id: "launch-1",
          projectId: "project-1",
          name: "Nightly",
          status: "processing"
        },
        processing: {
          mode: "archive-manifest-intake",
          extraction: "deferred",
          storesArchivePayload: false,
          payloadsAcceptedOnThisEndpoint: false,
          queue: "ingestion.parse",
          workerBoundary: "archive-unpack-planned",
          bounded: { maxEntries: 10000, maxDiagnostics: 100 }
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
        summary: {
          total: 3,
          queued: 0,
          processing: 1,
          completed: 1,
          completedWithErrors: 1,
          failed: 0,
          acceptedEntries: 2,
          ignoredEntries: 1,
          importedResults: 1,
          storedArtifacts: 0,
          diagnostics: 2,
          warnings: 1,
          errors: 1
        },
        diagnostics: {
          page: {
            limit: 2,
            cursor: "2",
            offset: 2,
            returned: 1,
            total: 3,
            nextCursor: null,
            hasMore: false
          },
          items: [
            {
              scope: "entry",
              severity: "error",
              code: "archive.entry.error",
              path: "C:\\Users\\tester\\Downloads\\synthetic-results\\secret.json",
              message:
                "worker failed token=synthetic-token storageKey=project-1/raw signedUrl=https://example.test/download?X-Amz-Signature=secret"
            }
          ]
        },
        items: [
          {
            kind: "archive-upload-status",
            id: "upload-1",
            launchId: "launch-1",
            status: "completed_with_errors",
            phase: "partial_success",
            progress: {
              receivedFiles: 2,
              importedResults: 1,
              duplicateResults: 0,
              storedArtifacts: 0,
              errors: 1
            },
            archive: {
              name: "nightly-allure.zip",
              format: "allure-results-archive-manifest",
              totalEntries: 2,
              supportedFiles: 1,
              attachmentFiles: 0,
              ignoredFiles: 1,
              totalUncompressedBytes: 2048,
              totalCompressedBytes: 512,
              storesArchivePayload: false,
              payloadsAcceptedOnThisEndpoint: false,
              storageKey: "project-1/archive/raw"
            },
            worker: {
              queue: "ingestion.parse",
              boundary: "archive-unpack-planned",
              retryable: false,
              persistence: "synthetic-in-memory-read-model",
              payloadsAvailable: false
            },
            diagnostics: {
              page: {
                limit: 2,
                cursor: null,
                offset: 0,
                returned: 1,
                total: 1,
                nextCursor: null,
                hasMore: false
              },
              items: [
                {
                  scope: "entry",
                  severity: "warning",
                  code: "archive.entry.warning",
                  path: "../private/result.json",
                  message: "Authorization: Bearer archive-status-denied-marker"
                }
              ]
            },
            links: {
              self: "/api/v1/uploads/upload-1/archive/status",
              signedUrl: "https://example.test/archive?token=synthetic-token"
            },
            payload: "raw-payload",
            createdAt: "2026-05-30T10:00:00.000Z",
            updatedAt: "2026-05-30T10:01:00.000Z"
          }
        ]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 55,
      method: "tools/call",
      params: {
        name: "testhistory.archive-status.read",
        arguments: {
          apiUrl: "http://api.test",
          projectId: "project-1",
          actorId: "actor-1",
          launchId: "launch-1",
          status: "completed_with_errors",
          limit: 1,
          cursor: "1",
          diagnosticsLimit: 2,
          diagnosticsCursor: "2"
        }
      }
    });

    const payload = JSON.parse(firstText(response)) as {
      kind: string;
      scope: { projectId: string; actorId: string; launchId: string };
      access: { mutation: boolean; redacted: boolean };
      query: {
        status: string;
        limit: number;
        cursor: string;
        diagnosticsLimit: number;
        diagnosticsCursor: string;
      };
      launch: { projectId: string };
      processing: { storesArchivePayload?: boolean; payloadsAcceptedOnThisEndpoint?: boolean };
      page: { limit: number; cursor: string; nextCursor: string };
      diagnostics: { items: Array<{ path?: string; message: string }> };
      items: Array<{
        archive: { storageKey?: string; storesArchivePayload?: boolean };
        worker: { payloadsAvailable?: boolean };
        links?: unknown;
        payload?: unknown;
        diagnostics: { items: Array<{ path?: string; message: string }> };
      }>;
      policy: {
        restParity: { method: string; path: string };
        mutationAllowed: boolean;
        rawPayloadsIncluded: boolean;
        rawPathsIncluded: boolean;
        storageKeysIncluded: boolean;
        signedUrlsIncluded: boolean;
      };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;
    const serialized = firstText(response);

    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/launches/launch-1/uploads/archive/status?status=completed_with_errors&limit=1&cursor=1&diagnosticsLimit=2&diagnosticsCursor=2"
    );
    expect(fetchedRequests[0]?.init?.method).toBeUndefined();
    expect(fetchedRequests[0]?.init?.body).toBeUndefined();
    expect(headers["X-TestHistory-Scopes"]).toBe("uploads:read,launches:read");
    expect(headers["X-TestHistory-Project-Scope"]).toBe("project-1");
    expect(headers["X-TestHistory-Actor-Id"]).toBe("actor-1");
    expect(payload.kind).toBe("archive-upload-status-list");
    expect(payload.scope).toEqual({
      projectId: "project-1",
      actorId: "actor-1",
      launchId: "launch-1"
    });
    expect(payload.access).toEqual(expect.objectContaining({ mutation: false, redacted: true }));
    expect(payload.query).toEqual({
      status: "completed_with_errors",
      limit: 1,
      cursor: "1",
      diagnosticsLimit: 2,
      diagnosticsCursor: "2"
    });
    expect(payload.launch.projectId).toBe("project-1");
    expect(payload.processing.storesArchivePayload).toBeUndefined();
    expect(payload.processing.payloadsAcceptedOnThisEndpoint).toBeUndefined();
    expect(payload.page).toEqual(
      expect.objectContaining({ limit: 1, cursor: "1", nextCursor: "2" })
    );
    expect(payload.diagnostics.items[0]?.path).toBeUndefined();
    expect(payload.diagnostics.items[0]?.message).toBe("[REDACTED]");
    expect(payload.items[0]?.diagnostics.items[0]?.path).toBeUndefined();
    expect(payload.items[0]?.diagnostics.items[0]?.message).toBe("[REDACTED]");
    expect(payload.items[0]?.archive.storageKey).toBeUndefined();
    expect(payload.items[0]?.archive.storesArchivePayload).toBeUndefined();
    expect(payload.items[0]?.worker.payloadsAvailable).toBeUndefined();
    expect(payload.items[0]?.links).toBeUndefined();
    expect(payload.items[0]?.payload).toBeUndefined();
    expect(payload.policy).toEqual(
      expect.objectContaining({
        restParity: {
          method: "GET",
          path: "/api/v1/launches/{launchId}/uploads/archive/status"
        },
        mutationAllowed: false,
        rawPayloadsIncluded: false,
        rawPathsIncluded: false,
        storageKeysIncluded: false,
        signedUrlsIncluded: false
      })
    );
    expect(serialized).not.toContain("synthetic-token");
    expect(serialized).not.toContain("archive-status-denied-marker");
    expect(serialized).not.toContain("C:\\Users");
    expect(serialized).not.toContain("../private");
    expect(serialized).not.toContain("project-1/raw");
    expect(serialized).not.toContain("project-1/archive/raw");
    expect(serialized).not.toContain("storesArchivePayload");
    expect(serialized).not.toContain("payloadsAcceptedOnThisEndpoint");
    expect(serialized).not.toContain("payloadsAvailable");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("raw-payload");
  });

  it("reads single archive upload status resources with diagnostics pagination", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return jsonResponse({
        kind: "archive-upload-status",
        id: "upload-1",
        launchId: "launch-1",
        status: "failed",
        phase: "failed",
        progress: { receivedFiles: 1, importedResults: 0, duplicateResults: 0, errors: 1 },
        archive: { format: "allure-results-archive-manifest", totalEntries: 1 },
        worker: { queue: "ingestion.parse", boundary: "archive-unpack-planned", retryable: true },
        diagnostics: {
          page: {
            limit: 3,
            cursor: "3",
            offset: 3,
            returned: 1,
            total: 4,
            nextCursor: null,
            hasMore: false
          },
          items: [{ scope: "archive", severity: "error", code: "archive.worker.failed" }]
        },
        createdAt: "2026-05-30T10:00:00.000Z",
        updatedAt: "2026-05-30T10:01:00.000Z"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 56,
      method: "resources/read",
      params: {
        uri: "testhistory://uploads/upload-1/archive/status?apiUrl=http%3A%2F%2Fapi.test&projectId=project-1&diagnosticsLimit=3&diagnosticsCursor=3"
      }
    });

    const payload = JSON.parse(firstResourceText(response)) as {
      kind: string;
      scope: { projectId: string; uploadId: string };
      query: { diagnosticsLimit: number; diagnosticsCursor: string };
      status: { diagnostics: { page: { limit: number; cursor: string } } };
      policy: { restParity: { method: string; path: string }; mutationAllowed: boolean };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;

    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/uploads/upload-1/archive/status?limit=3&cursor=3"
    );
    expect(fetchedRequests[0]?.init?.method).toBeUndefined();
    expect(fetchedRequests[0]?.init?.body).toBeUndefined();
    expect(headers["X-TestHistory-Project-Scope"]).toBe("project-1");
    expect(payload.kind).toBe("archive-upload-status");
    expect(payload.scope).toEqual({ projectId: "project-1", uploadId: "upload-1" });
    expect(payload.query).toEqual(
      expect.objectContaining({ diagnosticsLimit: 3, diagnosticsCursor: "3" })
    );
    expect(payload.status.diagnostics.page).toEqual(
      expect.objectContaining({ limit: 3, cursor: "3" })
    );
    expect(payload.policy).toEqual(
      expect.objectContaining({
        restParity: { method: "GET", path: "/api/v1/uploads/{uploadId}/archive/status" },
        mutationAllowed: false
      })
    );
  });

  it("requires archive status project scope, preserves REST permission denial shape, and exposes no mutation tool", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return deniedResponse({
        error: "permission_denied",
        message: "Archive status access denied",
        reason: "project_access_denied",
        requiredScopes: ["uploads:read"],
        projectId: "project-locked",
        token: "synthetic-token"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const missingProjectResponse = await handle({
      jsonrpc: "2.0",
      id: 57,
      method: "tools/call",
      params: {
        name: "testhistory.archive-status.read",
        arguments: { apiUrl: "http://api.test", launchId: "launch-1" }
      }
    });
    const missingTargetResponse = await handle({
      jsonrpc: "2.0",
      id: 58,
      method: "tools/call",
      params: {
        name: "testhistory.archive-status.read",
        arguments: { apiUrl: "http://api.test", projectId: "project-1" }
      }
    });
    const deniedResourceResponse = await handle({
      jsonrpc: "2.0",
      id: 59,
      method: "resources/read",
      params: {
        uri: "testhistory://launches/launch-locked/uploads/archive/status?apiUrl=http%3A%2F%2Fapi.test&projectId=project-locked"
      }
    });
    const mutationResponse = await handle({
      jsonrpc: "2.0",
      id: 60,
      method: "tools/call",
      params: {
        name: "testhistory.archive-status.retry",
        arguments: { projectId: "project-1", uploadId: "upload-1" }
      }
    });

    const denied = JSON.parse(firstResourceText(deniedResourceResponse)) as {
      status: string;
      code: number;
      permissionDenied: { requiredScopes: string[]; token?: string };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;

    expect(missingProjectResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "projectId is required for archive status reads"
      })
    );
    expect(missingTargetResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "exactly one of launchId or uploadId is required for archive status reads"
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/launches/launch-locked/uploads/archive/status?limit=20&diagnosticsLimit=20"
    );
    expect(headers["X-TestHistory-Project-Scope"]).toBe("project-locked");
    expect(denied).toEqual(
      expect.objectContaining({
        status: "error",
        code: 403,
        permissionDenied: expect.objectContaining({
          requiredScopes: ["uploads:read"],
          token: "[redacted]"
        })
      })
    );
    expect(mutationResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "Unknown tool: testhistory.archive-status.retry"
      })
    );
    expect(firstResourceText(deniedResourceResponse)).not.toContain("synthetic-token");
  });
});
