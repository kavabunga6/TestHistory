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

describe("MCP tools part-08", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("masks denied materialized archive diagnostic replay fixture reads and rejects mutation-shaped tools", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return deniedResponse({
        error: "PermissionDeniedError",
        message: "Archive diagnostic replay materialized fixture access denied",
        reason: "project_scope_denied",
        requiredScopes: ["uploads:read", "launches:read"],
        projectId: "project-locked",
        actor: { type: "actor", actorId: "actor-1" },
        manifestEntries: [{ path: "D:\\synthetic\\denied\\secret-result.json" }],
        resultFiles: [{ content: "token=archive-materialized-fixture-denied-token" }],
        storageRef: "storage://project-locked/archive-fixture/materialized/raw",
        signedUrl: "https://storage.example/private?X-Amz-Signature=raw",
        token: "archive-materialized-fixture-denied-token"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const missingProjectResponse = await handle({
      jsonrpc: "2.0",
      id: 72,
      method: "tools/call",
      params: {
        name: "testhistory.archive-diagnostics.replay.fixtures.materialized.read",
        arguments: { apiUrl: "http://api.test" }
      }
    });
    const deniedResourceResponse = await handle({
      jsonrpc: "2.0",
      id: 73,
      method: "resources/read",
      params: {
        uri: "testhistory://projects/project-locked/archive/diagnostics/replay/fixtures/materialized?apiUrl=http%3A%2F%2Fapi.test&actorId=actor-1&limit=2&cursor=2"
      }
    });
    const refreshResponse = await handle({
      jsonrpc: "2.0",
      id: 74,
      method: "tools/call",
      params: {
        name: "testhistory.archive-diagnostics.replay.fixtures.materialized.refresh",
        arguments: { projectId: "project-1" }
      }
    });
    const workerResponse = await handle({
      jsonrpc: "2.0",
      id: 75,
      method: "tools/call",
      params: {
        name: "testhistory.archive-diagnostics.replay.fixtures.materialized.worker",
        arguments: { projectId: "project-1" }
      }
    });

    const denied = JSON.parse(firstResourceText(deniedResourceResponse)) as {
      kind: string;
      status: string;
      code: number;
      project: { id: string; scoped: boolean };
      actor: { id: string; scoped: boolean };
      permissionDenied: {
        requiredScopes: string[];
        token?: string;
        manifestEntries?: unknown;
        resultFiles?: unknown;
        storageRef?: unknown;
        signedUrl?: unknown;
      };
      policy: { mutationAllowed: boolean; workerExecutionAllowed: boolean };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;

    expect(missingProjectResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "projectId is required for archive diagnostic replay materialized fixture reads"
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/projects/project-locked/archive/diagnostics/replay/fixtures/materialized?limit=2&cursor=2"
    );
    expect(headers["X-TestHistory-Scopes"]).toBe("uploads:read,launches:read");
    expect(headers["X-TestHistory-Project-Scope"]).toBe("project-locked");
    expect(headers["X-TestHistory-Actor-Id"]).toBe("actor-1");
    expect(denied.kind).toBe("archive-diagnostic-replay-fixture-materialized-list");
    expect(denied.status).toBe("error");
    expect(denied.code).toBe(403);
    expect(denied.project).toEqual({ id: "project-locked", scoped: true });
    expect(denied.actor).toEqual({ id: "actor-1", scoped: true });
    expect(denied.permissionDenied).toEqual(
      expect.objectContaining({
        requiredScopes: ["uploads:read", "launches:read"],
        token: "[redacted]"
      })
    );
    expect(denied.permissionDenied.manifestEntries).toBeUndefined();
    expect(denied.permissionDenied.resultFiles).toBeUndefined();
    expect(denied.permissionDenied.storageRef).toBeUndefined();
    expect(denied.permissionDenied.signedUrl).toBeUndefined();
    expect(denied.policy).toEqual(
      expect.objectContaining({ mutationAllowed: false, workerExecutionAllowed: false })
    );
    expect(refreshResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message:
          "Unknown tool: testhistory.archive-diagnostics.replay.fixtures.materialized.refresh"
      })
    );
    expect(workerResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "Unknown tool: testhistory.archive-diagnostics.replay.fixtures.materialized.worker"
      })
    );
    expect(firstResourceText(deniedResourceResponse)).not.toContain(
      "archive-materialized-fixture-denied-token"
    );
    expect(firstResourceText(deniedResourceResponse)).not.toContain("D:\\synthetic");
    expect(firstResourceText(deniedResourceResponse)).not.toContain(
      "project-locked/archive-fixture/materialized/raw"
    );
    expect(firstResourceText(deniedResourceResponse)).not.toContain("storage.example");
    expect(firstResourceText(deniedResourceResponse)).not.toContain("X-Amz-Signature");
  });

  it("omits raw launch result resource payloads even when raw is requested", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        launchId: "launch-1",
        uuid: "result-1",
        name: "checkout",
        status: "failed",
        parameters: [{ name: "token", value: "***", mode: "masked" }],
        raw: {
          parameters: [{ name: "password", mode: "hidden" }]
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 32,
      method: "resources/read",
      params: {
        uri: "testhistory://launches/launch-1/results/result-1?apiUrl=http%3A%2F%2Fapi.test&includeRaw=true"
      }
    });

    const payload = JSON.parse(firstResourceText(response)) as {
      result: { parameters: Array<{ value?: string; mode: string; redacted?: boolean }> };
      raw?: unknown;
      rawRedacted?: boolean;
    };

    expect(payload.result.parameters[0]?.value).toBe("***");
    expect(payload.result.parameters[0]?.redacted).toBe(true);
    expect(payload.raw).toBeUndefined();
    expect(payload.rawRedacted).toBe(true);
    expect(firstResourceText(response)).not.toContain("synthetic-secret");
  });

  it("summarizes launches and recent failures with compact read tools", async () => {
    const fetchedUrls: URL[] = [];
    const fetchMock = vi.fn(async (input: URL) => {
      fetchedUrls.push(input);
      if (input.pathname === "/api/v1/projects/project-1/launches") {
        return jsonResponse([{ id: "launch-1", createdAt: "2026-05-30T00:00:00.000Z" }]);
      }
      return jsonResponse({
        id: "launch-1",
        projectId: "project-1",
        name: "main #1",
        status: "closed",
        counters: { failed: 1, broken: 1, passed: 1, skipped: 0, unknown: 0 },
        results: [
          { uuid: "result-1", name: "checkout", status: "failed", raw: { secret: "hidden" } },
          { uuid: "result-2", name: "api", status: "broken" },
          { uuid: "result-3", name: "login", status: "passed" }
        ]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const summaryResponse = await handle({
      jsonrpc: "2.0",
      id: 33,
      method: "tools/call",
      params: {
        name: "testhistory.launch.summarize",
        arguments: { apiUrl: "http://api.test", launchId: "launch-1", resultLimit: 1 }
      }
    });
    const failuresResponse = await handle({
      jsonrpc: "2.0",
      id: 34,
      method: "tools/call",
      params: {
        name: "testhistory.failures.recent",
        arguments: { apiUrl: "http://api.test", projectId: "project-1", limit: 1 }
      }
    });

    const summary = JSON.parse(firstText(summaryResponse)) as {
      failureCount: number;
      failures: unknown[];
      omittedFailures: number;
      raw?: unknown;
    };
    const failures = JSON.parse(firstText(failuresResponse)) as {
      count: number;
      failures: Array<{ result: { uuid: string; raw?: unknown } }>;
    };

    expect(fetchedUrls.map((url) => url.toString())).toEqual([
      "http://api.test/api/v1/launches/launch-1",
      "http://api.test/api/v1/projects/project-1/launches",
      "http://api.test/api/v1/launches/launch-1"
    ]);
    expect(summary.failureCount).toBe(2);
    expect(summary.failures).toHaveLength(1);
    expect(summary.omittedFailures).toBe(1);
    expect(summary.raw).toBeUndefined();
    expect(failures.count).toBe(1);
    expect(failures.failures[0]?.result.uuid).toBe("result-1");
    expect(failures.failures[0]?.result.raw).toBeUndefined();
    expect(firstText(summaryResponse)).not.toContain("hidden");
  });

  it("paginates recent failures deterministically with cursor metadata", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        id: "launch-1",
        projectId: "project-1",
        name: "main #1",
        status: "closed",
        results: [
          { uuid: "result-1", name: "checkout", status: "failed" },
          { uuid: "result-2", name: "api", status: "broken" },
          { uuid: "result-3", name: "mobile", status: "failed" },
          { uuid: "result-4", name: "login", status: "passed" }
        ]
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 37,
      method: "tools/call",
      params: {
        name: "testhistory.failures.recent",
        arguments: {
          apiUrl: "http://api.test",
          launchId: "launch-1",
          limit: 1,
          cursor: "1"
        }
      }
    });

    const payload = JSON.parse(firstText(response)) as {
      count: number;
      page: { limit: number; cursor: string; offset: number; nextCursor: string };
      failures: Array<{ result: { uuid: string } }>;
    };

    expect(payload.count).toBe(1);
    expect(payload.failures[0]?.result.uuid).toBe("result-2");
    expect(payload.page).toEqual(
      expect.objectContaining({ limit: 1, cursor: "1", offset: 1, nextCursor: "2" })
    );
  });

  it("mirrors paginated REST test case history with MCP-safe values", async () => {
    const fetchedUrls: URL[] = [];
    const fetchMock = vi.fn(async (input: URL) => {
      fetchedUrls.push(input);
      return jsonResponse({
        kind: "test-case-history",
        testCaseId: "case-1",
        projectId: "project-1",
        totalPoints: 3,
        returnedPoints: 1,
        omittedPoints: 1,
        page: {
          limit: 1,
          cursor: "1",
          offset: 1,
          returned: 1,
          total: 3,
          nextCursor: "2",
          hasMore: true
        },
        points: [
          {
            launchId: "launch-2",
            resultUuid: "result-2",
            status: "failed",
            attemptIndex: 1,
            attemptNumber: 2,
            retry: true,
            parameters: [
              { name: "browser", value: "chromium" },
              { name: "token", value: "synthetic-token", mode: "masked" },
              { name: "password", value: "synthetic-hidden", mode: "hidden" }
            ],
            raw: { secret: "synthetic-secret" }
          }
        ]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 38,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history",
        arguments: {
          apiUrl: "http://api.test",
          testCaseId: "case-1",
          projectId: "project-1",
          limit: 1,
          cursor: "1",
          includeDetails: true,
          includeRaw: true
        }
      }
    });

    const payload = JSON.parse(firstText(response)) as {
      page: { limit: number; cursor: string; offset: number; nextCursor: string };
      points: Array<{
        launchId: string;
        raw?: unknown;
        parameters?: Array<{ value?: string; mode?: string; redacted?: boolean }>;
      }>;
    };

    expect(fetchedUrls[0]?.toString()).toBe(
      "http://api.test/api/v1/test-cases/case-1/history?projectId=project-1&limit=1&cursor=1"
    );
    expect(payload.points).toHaveLength(1);
    expect(payload.points[0]?.launchId).toBe("launch-2");
    expect(payload.points[0]?.raw).toBeUndefined();
    expect(payload.points[0]?.parameters).toEqual([
      { name: "browser", value: "chromium" },
      { name: "token", value: "***", mode: "masked", redacted: true },
      { name: "password", mode: "hidden", redacted: true }
    ]);
    expect(payload.page).toEqual(
      expect.objectContaining({ limit: 1, cursor: "1", offset: 1, nextCursor: "2" })
    );
    expect(firstText(response)).not.toContain("synthetic-token");
    expect(firstText(response)).not.toContain("synthetic-hidden");
  });

  it("mirrors enriched REST history compare pages with project and actor scope plus MCP-safe values", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return jsonResponse({
        kind: "test-case-history-compare",
        id: "history-compare:case-1:result-1:result-2",
        testCaseId: "case-1",
        projectId: "project-1",
        actor: { type: "actor", actorId: "actor-1", scoped: true, displayName: "Ada" },
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
        identity: { state: "matched", confidence: "high" },
        base: {
          launchId: "launch-1",
          launchName: "Base",
          launchCreatedAt: "2026-05-30T08:00:00.000Z",
          resultUuid: "result-1",
          status: "failed",
          branch: "main",
          buildNumber: "100",
          commitSha: "abc123",
          durationMs: 120,
          identity: { state: "matched", confidence: "high" },
          attemptIndex: 0,
          attemptNumber: 1,
          parameterVariantSignature: "browser=chromium",
          raw: { secret: "synthetic-secret" },
          attachments: [{ storageKey: "project-1/secret.log" }]
        },
        target: {
          launchId: "launch-2",
          launchName: "Target",
          launchCreatedAt: "2026-05-30T09:00:00.000Z",
          resultUuid: "result-2",
          status: "passed",
          branch: "release/1.0",
          buildNumber: "101",
          commitSha: "def456",
          durationMs: 60,
          identity: { state: "matched", confidence: "high" },
          attemptIndex: 1,
          attemptNumber: 2,
          parameterVariantSignature: "browser=firefox"
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
        totalChanges: 5,
        returnedChanges: 1,
        omittedChanges: 0,
        summary: { total: 5, added: 1, removed: 1, changed: 3, unchanged: 0, risk: 0, signal: 2 },
        redaction: {
          rawResultsIncluded: false,
          rawStatusDetailsIncluded: false,
          hiddenOrMaskedValuesIncluded: false,
          tokensIncluded: false,
          pathsIncluded: false,
          storageLocationsIncluded: false,
          artifactUrlsIncluded: false
        },
        enrichment: {
          status: "ready",
          redacted: true,
          unavailable: [],
          fields: {
            "launch.branch": { status: "ready", base: true, target: true },
            "launch.buildNumber": { status: "ready", base: true, target: true },
            "executor.reportUrl": { status: "ready", base: true, target: true }
          }
        },
        changes: [
          {
            kind: "defect",
            subject: "failure-signature",
            change: "removed",
            severity: "signal",
            before: ["AssertionError token=synthetic-token"],
            after: [],
            context: {
              clusterIds: ["defect-1"],
              storageKey: "project-1/raw/secret.json",
              artifactPath: "/home/runner/work/allure-results/secret.log",
              downloadUrl: "https://storage.example/report?token=synthetic-token",
              signedUrl: "https://storage.example/download?signature=synthetic-signature",
              reason: "hidden synthetic-hidden"
            },
            explanation: "Failure signature removed after branch/build and executor change",
            redacted: true,
            raw: { payload: "synthetic-secret" }
          }
        ]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 49,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history.compare",
        arguments: {
          apiUrl: "http://api.test",
          testCaseId: "case-1",
          projectId: "project-1",
          baseResultUuid: "result-1",
          targetResultUuid: "result-2",
          includeUnchanged: true,
          actorId: "actor-1",
          limit: 1,
          cursor: "1"
        }
      }
    });

    const payload = JSON.parse(firstText(response)) as {
      id: string;
      kind: string;
      projectId: string;
      actorId: string;
      actor: { type: string; actorId: string; scoped: boolean; displayName: string };
      access: {
        scope: string;
        projectScoped: boolean;
        actorScoped: boolean;
        mutation: boolean;
        redacted: boolean;
      };
      availability: {
        status: string;
        projectScoped: boolean;
        actorScoped: boolean;
        partial: boolean;
        unavailable: string[];
        redacted: boolean;
      };
      base: {
        raw?: unknown;
        attachments?: unknown;
        resultUuid: string;
        branch: string;
        buildNumber: string;
        statusDetails?: unknown;
      };
      target: { resultUuid: string; branch: string; buildNumber: string };
      summary: { total: number; signal: number };
      redaction: {
        rawResultsIncluded: boolean;
        rawStatusDetailsIncluded: boolean;
        hiddenOrMaskedValuesIncluded: boolean;
        tokensIncluded: boolean;
        pathsIncluded: boolean;
        storageLocationsIncluded: boolean;
        artifactUrlsIncluded: boolean;
      };
      enrichment: {
        status: string;
        unavailable: string[];
        fields: Record<string, { status: string; base: boolean; target: boolean }>;
      };
      changes: Array<{
        raw?: unknown;
        kind: string;
        subject: string;
        before: string[];
        after: string[];
        context: {
          clusterIds: string[];
          reason: string;
          storageKey?: string;
          artifactPath?: string;
        };
        redacted: boolean;
      }>;
      page: { limit: number; cursor: string; total: number; nextCursor: null };
      policy: {
        projectIdRequired: boolean;
        resultPairRequired: boolean;
        equalOrNarrowerThanRest: boolean;
        mutationAllowed: boolean;
      };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;

    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/test-cases/case-1/history/compare?projectId=project-1&baseResultUuid=result-1&targetResultUuid=result-2&includeUnchanged=true&limit=1&cursor=1"
    );
    expect(headers["X-TestHistory-Scopes"]).toBe("test-cases:read");
    expect(headers["X-TestHistory-Project-Scope"]).toBe("project-1");
    expect(headers["X-TestHistory-Actor-Id"]).toBe("actor-1");
    expect(payload.id).toBe("history-compare:case-1:result-1:result-2");
    expect(payload.kind).toBe("test-case-history-compare");
    expect(payload.projectId).toBe("project-1");
    expect(payload.actorId).toBe("actor-1");
    expect(payload.actor).toEqual({
      type: "actor",
      actorId: "actor-1",
      scoped: true,
      displayName: "Ada"
    });
    expect(payload.access).toEqual({
      scope: "test-cases:read",
      projectScoped: true,
      actorScoped: true,
      mutation: false,
      redacted: true
    });
    expect(payload.availability).toEqual({
      status: "ready",
      projectScoped: true,
      actorScoped: true,
      redacted: true,
      partial: false,
      unavailable: []
    });
    expect(payload.base.raw).toBeUndefined();
    expect(payload.base.attachments).toBeUndefined();
    expect(payload.base.statusDetails).toBeUndefined();
    expect(payload.base).toEqual(
      expect.objectContaining({
        resultUuid: "result-1",
        branch: "main",
        buildNumber: "100"
      })
    );
    expect(payload.target).toEqual(
      expect.objectContaining({
        resultUuid: "result-2",
        branch: "release/1.0",
        buildNumber: "101"
      })
    );
    expect(payload.summary).toEqual(expect.objectContaining({ total: 5, signal: 2 }));
    expect(payload.redaction).toEqual({
      rawResultsIncluded: false,
      rawStatusDetailsIncluded: false,
      hiddenOrMaskedValuesIncluded: false,
      tokensIncluded: false,
      pathsIncluded: false,
      storageLocationsIncluded: false,
      artifactUrlsIncluded: false
    });
    expect(payload.enrichment).toEqual({
      status: "ready",
      redacted: true,
      unavailable: [],
      fields: {
        "launch.branch": { status: "ready", base: true, target: true },
        "launch.buildNumber": { status: "ready", base: true, target: true },
        "executor.reportUrl": { status: "ready", base: true, target: true }
      }
    });
    expect(payload.changes[0]?.raw).toBeUndefined();
    expect(payload.changes[0]).toEqual(
      expect.objectContaining({
        kind: "defect",
        subject: "failure-signature",
        before: ["[REDACTED]"],
        after: [],
        context: { clusterIds: ["defect-1"], reason: "[redacted]" },
        redacted: true
      })
    );
    expect(payload.page).toEqual(
      expect.objectContaining({ limit: 1, cursor: "1", total: 2, nextCursor: null })
    );
    expect(payload.policy).toEqual(
      expect.objectContaining({
        projectIdRequired: true,
        resultPairRequired: true,
        equalOrNarrowerThanRest: true,
        mutationAllowed: false
      })
    );
    expect(firstText(response)).not.toContain("synthetic-token");
    expect(firstText(response)).not.toContain("synthetic-hidden");
    expect(firstText(response)).not.toContain("synthetic-secret");
    expect(firstText(response)).not.toContain("artifactPath");
    expect(firstText(response)).not.toContain("downloadUrl");
    expect(firstText(response)).not.toContain("signedUrl");
    expect(firstText(response)).not.toContain("project-1/raw/secret.json");
    expect(firstText(response)).not.toContain("allure-results");
  });

  it("preserves partial history compare availability and enrichment without broadening actor scope", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return jsonResponse({
        kind: "test-case-history-compare",
        id: "history-compare:partial",
        testCaseId: "case-partial",
        projectId: "project-1",
        access: {
          scope: "test-cases:read",
          projectScoped: true,
          actorScoped: false,
          mutation: false,
          redacted: true
        },
        availability: {
          status: "partial",
          projectScoped: true,
          actorScoped: false,
          redacted: true,
          partial: true,
          unavailable: [
            "launch.branch",
            "executor.name",
            "executor.reportUrl",
            "storageKey=raw-storage-key"
          ]
        },
        base: {
          launchId: "launch-1",
          launchName: "Base",
          launchCreatedAt: "2026-05-30T08:00:00.000Z",
          resultUuid: "partial-base",
          status: "failed",
          identity: { state: "matched" },
          attemptIndex: 0,
          attemptNumber: 1,
          parameterVariantSignature: "browser=chromium"
        },
        target: {
          launchId: "launch-2",
          launchName: "Target",
          launchCreatedAt: "2026-05-30T09:00:00.000Z",
          resultUuid: "partial-target",
          status: "passed",
          identity: { state: "matched" },
          attemptIndex: 1,
          attemptNumber: 2,
          parameterVariantSignature: "browser=firefox"
        },
        totalChanges: 2,
        returnedChanges: 1,
        omittedChanges: 1,
        page: {
          limit: 1,
          cursor: null,
          offset: 0,
          returned: 1,
          total: 2,
          nextCursor: "1",
          hasMore: true
        },
        summary: { total: 2, added: 1, removed: 0, changed: 1, unchanged: 0, risk: 0, signal: 1 },
        redaction: {
          rawResultsIncluded: false,
          rawStatusDetailsIncluded: false,
          hiddenOrMaskedValuesIncluded: false,
          tokensIncluded: false,
          pathsIncluded: false,
          storageLocationsIncluded: false,
          artifactUrlsIncluded: false
        },
        enrichment: {
          status: "partial",
          redacted: true,
          unavailable: [
            "launch.branch",
            "executor.name",
            "executor.reportUrl",
            "storageKey=raw-storage-key"
          ],
          fields: {
            "launch.branch": { status: "unavailable", base: false, target: false },
            "executor.name": { status: "unavailable", base: false, target: false },
            "executor.reportUrl": { status: "unavailable", base: false, target: false }
          }
        },
        changes: [
          {
            kind: "label",
            subject: "component",
            change: "added",
            severity: "signal",
            before: ["C:\\Users\\tester\\Downloads\\synthetic-results\\token.txt"],
            after: ["checkout"],
            context: {
              note: "signedUrl=https://storage.example/file?signature=synthetic-signature",
              path: "/home/runner/work/allure-results/raw.json",
              storageKey: "raw-storage-key"
            },
            explanation: "Label added while optional enrichment is partial",
            redacted: true
          }
        ]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 53,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history.compare",
        arguments: {
          apiUrl: "http://api.test",
          testCaseId: "case-partial",
          projectId: "project-1",
          baseResultUuid: "partial-base",
          targetResultUuid: "partial-target",
          limit: 1
        }
      }
    });

    const payload = JSON.parse(firstText(response)) as {
      access: { actorScoped: boolean };
      availability: {
        status: string;
        partial: boolean;
        actorScoped: boolean;
        unavailable: string[];
      };
      enrichment: {
        status: string;
        unavailable: string[];
        fields: Record<string, { status: string; base: boolean; target: boolean }>;
      };
      page: { limit: number; returned: number; nextCursor: string; hasMore: boolean };
      redaction: {
        tokensIncluded: boolean;
        pathsIncluded: boolean;
        storageLocationsIncluded: boolean;
        artifactUrlsIncluded: boolean;
      };
      changes: Array<{ before: string[]; context: Record<string, string | string[]> }>;
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;
    const serialized = firstText(response);

    expect(headers["X-TestHistory-Scopes"]).toBe("test-cases:read");
    expect(headers["X-TestHistory-Project-Scope"]).toBe("project-1");
    expect(headers["X-TestHistory-Actor-Id"]).toBeUndefined();
    expect(payload.access.actorScoped).toBe(false);
    expect(payload.availability).toEqual(
      expect.objectContaining({
        status: "partial",
        partial: true,
        actorScoped: false,
        unavailable: ["launch.branch", "executor.name", "executor.reportUrl", "[redacted]"]
      })
    );
    expect(payload.enrichment).toEqual(
      expect.objectContaining({
        status: "partial",
        unavailable: ["launch.branch", "executor.name", "executor.reportUrl", "[redacted]"],
        fields: expect.objectContaining({
          "launch.branch": { status: "unavailable", base: false, target: false },
          "executor.name": { status: "unavailable", base: false, target: false }
        })
      })
    );
    expect(payload.page).toEqual(
      expect.objectContaining({ limit: 1, returned: 1, nextCursor: "1", hasMore: true })
    );
    expect(payload.redaction).toEqual(
      expect.objectContaining({
        tokensIncluded: false,
        pathsIncluded: false,
        storageLocationsIncluded: false,
        artifactUrlsIncluded: false
      })
    );
    expect(payload.changes[0]?.before).toEqual(["[REDACTED_PATH]"]);
    expect(payload.changes[0]?.context).toEqual({ note: "[redacted]" });
    expect(serialized).not.toContain("synthetic-signature");
    expect(serialized).not.toContain("raw-storage-key");
    expect(serialized).not.toContain("Downloads");
    expect(serialized).not.toContain("allure-results");
    expect(serialized).not.toContain("storage.example");
  });

  it("requires scoped compare arguments and routes compare resources through REST", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return jsonResponse({
        kind: "test-case-history-compare",
        id: "history-compare:case-1",
        testCaseId: "case-1",
        projectId: "project-1",
        access: { scope: "test-cases:read", projectScoped: true, mutation: false, redacted: true },
        base: {
          launchId: "launch-1",
          launchName: "Base",
          launchCreatedAt: "2026-05-30T08:00:00.000Z",
          resultUuid: "result-1",
          status: "failed",
          identity: { state: "matched" },
          attemptIndex: 0,
          attemptNumber: 1,
          parameterVariantSignature: "browser=chromium"
        },
        target: {
          launchId: "launch-2",
          launchName: "Target",
          launchCreatedAt: "2026-05-30T09:00:00.000Z",
          resultUuid: "result-2",
          status: "passed",
          identity: { state: "matched" },
          attemptIndex: 1,
          attemptNumber: 2,
          parameterVariantSignature: "browser=chromium"
        },
        totalChanges: 1,
        returnedChanges: 1,
        omittedChanges: 0,
        summary: { total: 1, added: 0, removed: 0, changed: 1, unchanged: 0, risk: 0, signal: 1 },
        redaction: {
          rawResultsIncluded: false,
          rawStatusDetailsIncluded: false,
          hiddenOrMaskedValuesIncluded: false
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
        changes: [
          {
            kind: "branch",
            subject: "branch",
            change: "changed",
            severity: "signal",
            before: ["main"],
            after: ["release"],
            context: {},
            explanation: "Branch changed",
            redacted: true
          }
        ]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const missingProjectResponse = await handle({
      jsonrpc: "2.0",
      id: 50,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history.compare",
        arguments: {
          apiUrl: "http://api.test",
          testCaseId: "case-1",
          baseResultUuid: "result-1",
          targetResultUuid: "result-2"
        }
      }
    });
    const missingPairResponse = await handle({
      jsonrpc: "2.0",
      id: 50,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history.compare",
        arguments: {
          apiUrl: "http://api.test",
          testCaseId: "case-1",
          projectId: "project-1",
          targetResultUuid: "result-2"
        }
      }
    });
    const resourceResponse = await handle({
      jsonrpc: "2.0",
      id: 51,
      method: "resources/read",
      params: {
        uri: "testhistory://test-cases/case-1/history/compare?apiUrl=http%3A%2F%2Fapi.test&projectId=project-1&baseResultUuid=result-1&targetResultUuid=result-2&actorId=actor-1&limit=1"
      }
    });

    const payload = JSON.parse(firstResourceText(resourceResponse)) as {
      changes: Array<{ kind: string; subject: string }>;
      page: { limit: number; returned: number };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;

    expect(missingProjectResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "projectId is required for test case history compare reads"
      })
    );
    expect(missingPairResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "baseResultUuid is required for test case history compare reads"
      })
    );
    expect(fetchedRequests.map((request) => request.url.toString())).toEqual([
      "http://api.test/api/v1/test-cases/case-1/history/compare?projectId=project-1&baseResultUuid=result-1&targetResultUuid=result-2&limit=1"
    ]);
    expect(headers["X-TestHistory-Scopes"]).toBe("test-cases:read");
    expect(headers["X-TestHistory-Project-Scope"]).toBe("project-1");
    expect(headers["X-TestHistory-Actor-Id"]).toBe("actor-1");
    expect(payload.changes).toEqual([
      expect.objectContaining({ kind: "branch", subject: "branch" })
    ]);
    expect(payload.page).toEqual(expect.objectContaining({ limit: 1, returned: 1 }));
  });
});
