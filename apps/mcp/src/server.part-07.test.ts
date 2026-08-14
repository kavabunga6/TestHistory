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

describe("MCP tools part-07", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads archive diagnostic replay summaries through REST with scope, pagination, and MCP redaction", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return jsonResponse({
        kind: "archive-diagnostic-replay-summary-list",
        launch: {
          id: "launch-1",
          projectId: "project-1",
          name: "Archive diagnostics",
          status: "closed"
        },
        access: {
          scope: "uploads:read",
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        worker: {
          queue: "archive.diagnostics.replay",
          boundary: "worker-local-archive-diagnostics-replay",
          adapterKind: "in-memory-archive-diagnostics-replay-wip",
          consistency: "append-only-idempotent-replay",
          payloadsAvailable: true,
          storageRef: "storage://project-1/raw/archive.zip"
        },
        query: {
          projectId: "project-1",
          launchId: "launch-1",
          archiveRef: "archive:upload-1",
          limit: 1,
          cursor: "1"
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
          totalProjections: 2,
          eventCount: 4,
          acceptedEventCount: 3,
          duplicateEventCount: 1,
          rejectedOpenLaunchEventCount: 0,
          rejectedOutOfScopeEventCount: 0,
          invalidEventCount: 0,
          retryableEventCount: 1,
          severityCounts: { info: 1, warn: 1, error: 1 },
          sourceCounts: { "archive.status.read": 1, "archive.diagnostics.read": 2 },
          readOnly: true,
          mutation: false,
          deleteRequestedCount: 0,
          rawMaterialReturned: false
        },
        items: [
          {
            kind: "archive-diagnostic-replay-summary",
            projectId: "project-1",
            launchId: "launch-1",
            archiveRef: "archive:upload-1",
            uploadId: "upload-1",
            status: "completed_with_errors",
            phase: "partial_success",
            worker: {
              queue: "archive.diagnostics.replay",
              boundary: "worker-local-archive-diagnostics-replay",
              adapterKind: "in-memory-archive-diagnostics-replay-wip",
              consistency: "append-only-idempotent-replay",
              payloadsAvailable: true,
              storageRef: "minio://bucket/raw"
            },
            execution: {
              readOnly: true,
              mutation: false,
              deletionStarted: true,
              deleteRequestedCount: 3,
              rawMaterialReturned: true,
              replayRefreshUrl: "https://storage.example/replay?X-Amz-Signature=secret"
            },
            summary: {
              projectId: "project-1",
              launchId: "launch-1",
              archiveRef: "archive:upload-1",
              eventCount: 2,
              acceptedEventCount: 2,
              duplicateEventCount: 0,
              rejectedOpenLaunchEventCount: 0,
              rejectedOutOfScopeEventCount: 0,
              invalidEventCount: 0,
              retryableEventCount: 1,
              severityCounts: { info: 1, warn: 0, error: 1 },
              sourceCounts: { "archive.status.read": 1, "archive.diagnostics.read": 1 },
              replayDigest: "digest-1",
              closedArchiveStatusReadCompatible: true,
              closedArchiveDiagnosticsReadCompatible: true,
              mutationBoundary: "worker-replay-only-no-rest-or-ui-claims"
            },
            records: [
              {
                eventRef: "event:1",
                projectId: "project-1",
                launchId: "launch-1",
                archiveRef: "archive:upload-1",
                source: "archive.diagnostics.read",
                code: "entry-processing-error",
                severity: "error",
                retryable: false,
                occurredAt: "2026-05-30T10:00:00.000Z",
                entryRef: "entry:1",
                chunkRef: "chunk:1",
                path: "allure-results/secret-result.json",
                storageKey: "project-1/archive/raw",
                signedUrl: "https://storage.example/raw?token=synthetic-token",
                token: "synthetic-token",
                payload: "raw-payload"
              }
            ],
            links: {
              storage: "blob://project-1/raw"
            }
          }
        ],
        links: {
          self: "/api/v1/launches/launch-1/archive/diagnostics/replay",
          signedUrl: "https://storage.example/list?X-Amz-Signature=secret"
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 61,
      method: "tools/call",
      params: {
        name: "testhistory.archive-diagnostics.replay.read",
        arguments: {
          apiUrl: "http://api.test",
          projectId: "project-1",
          actorId: "actor-1",
          launchId: "launch-1",
          archiveRef: "archive:upload-1",
          limit: 1,
          cursor: "1"
        }
      }
    });

    const payload = JSON.parse(firstText(response)) as {
      kind: string;
      scope: { projectId: string; actorId: string; launchId: string; archiveRef: string };
      access: { mutation: boolean; redacted: boolean };
      query: { archiveRef: string; limit: number; cursor: string };
      worker: { payloadsAvailable: boolean; storageRef?: string };
      page: { limit: number; cursor: string };
      summary: { deleteRequestedCount?: number; rawMaterialReturned: boolean };
      items: Array<{
        execution: { readOnly: boolean; mutation: boolean; rawMaterialReturned: boolean };
        records: Array<{ path?: string; storageKey?: string; signedUrl?: string; token?: string }>;
        links?: unknown;
      }>;
      policy: {
        restParity: { method: string; path: string };
        mutationAllowed: boolean;
        workerExecutionAllowed: boolean;
        rawPathsIncluded: boolean;
        storageRefsIncluded: boolean;
        signedUrlsIncluded: boolean;
        tokensIncluded: boolean;
      };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;
    const serialized = firstText(response);

    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/launches/launch-1/archive/diagnostics/replay?archiveRef=archive%3Aupload-1&limit=1&cursor=1"
    );
    expect(fetchedRequests[0]?.init?.method).toBeUndefined();
    expect(fetchedRequests[0]?.init?.body).toBeUndefined();
    expect(headers["X-TestHistory-Scopes"]).toBe("uploads:read,launches:read");
    expect(headers["X-TestHistory-Project-Scope"]).toBe("project-1");
    expect(headers["X-TestHistory-Actor-Id"]).toBe("actor-1");
    expect(payload.kind).toBe("archive-diagnostic-replay-summary-list");
    expect(payload.scope).toEqual({
      projectId: "project-1",
      actorId: "actor-1",
      launchId: "launch-1",
      archiveRef: "archive:upload-1"
    });
    expect(payload.access).toEqual(expect.objectContaining({ mutation: false, redacted: true }));
    expect(payload.query).toEqual({ archiveRef: "archive:upload-1", limit: 1, cursor: "1" });
    expect(payload.worker.payloadsAvailable).toBe(false);
    expect(payload.worker.storageRef).toBeUndefined();
    expect(payload.page).toEqual(expect.objectContaining({ limit: 1, cursor: "1" }));
    expect(payload.summary.deleteRequestedCount).toBeUndefined();
    expect(payload.summary.rawMaterialReturned).toBe(false);
    expect(payload.items[0]?.execution).toEqual({
      readOnly: true,
      mutation: false,
      rawMaterialReturned: false
    });
    expect(payload.items[0]?.records[0]?.path).toBeUndefined();
    expect(payload.items[0]?.records[0]?.storageKey).toBeUndefined();
    expect(payload.items[0]?.records[0]?.signedUrl).toBeUndefined();
    expect(payload.items[0]?.records[0]?.token).toBeUndefined();
    expect(payload.items[0]?.links).toBeUndefined();
    expect(payload.policy).toEqual(
      expect.objectContaining({
        restParity: {
          method: "GET",
          path: "/api/v1/launches/{launchId}/archive/diagnostics/replay"
        },
        mutationAllowed: false,
        workerExecutionAllowed: false,
        rawPathsIncluded: false,
        storageRefsIncluded: false,
        signedUrlsIncluded: false,
        tokensIncluded: false
      })
    );
    expect(serialized).not.toContain("synthetic-token");
    expect(serialized).not.toContain("allure-results/secret-result.json");
    expect(serialized).not.toContain("project-1/archive/raw");
    expect(serialized).not.toContain("storage://");
    expect(serialized).not.toContain("minio://");
    expect(serialized).not.toContain("blob://");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("raw-payload");
    expect(serialized).not.toContain("deleteRequestedCount");
    expect(serialized).not.toContain("deletionStarted");
    expect(serialized).not.toContain("replayRefreshUrl");
  });

  it("reads archive diagnostic replay resources and preserves denied-state masking", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return deniedResponse({
        error: "permission_denied",
        message: "Archive diagnostic replay access denied",
        reason: "project_access_denied",
        requiredScopes: ["uploads:read", "launches:read"],
        projectId: "project-locked",
        actor: { type: "actor", actorId: "actor-1" },
        rawHistory: [{ token: "archive-replay-denied-token" }],
        storageRef: "storage://project-locked/raw",
        signedUrl: "https://storage.example/private?X-Amz-Signature=raw",
        token: "archive-replay-denied-token"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const missingProjectResponse = await handle({
      jsonrpc: "2.0",
      id: 62,
      method: "tools/call",
      params: {
        name: "testhistory.archive-diagnostics.replay.read",
        arguments: { apiUrl: "http://api.test", launchId: "launch-1" }
      }
    });
    const deniedResourceResponse = await handle({
      jsonrpc: "2.0",
      id: 63,
      method: "resources/read",
      params: {
        uri: "testhistory://launches/launch-locked/archive/diagnostics/replay?apiUrl=http%3A%2F%2Fapi.test&projectId=project-locked&actorId=actor-1&limit=2&cursor=2"
      }
    });
    const mutationResponse = await handle({
      jsonrpc: "2.0",
      id: 64,
      method: "tools/call",
      params: {
        name: "testhistory.archive-diagnostics.replay.refresh",
        arguments: { projectId: "project-1", launchId: "launch-1" }
      }
    });

    const denied = JSON.parse(firstResourceText(deniedResourceResponse)) as {
      status: string;
      code: number;
      scope: { projectId: string; launchId: string; actorId: string };
      permissionDenied: {
        requiredScopes: string[];
        token?: string;
        rawHistory?: unknown;
        storageRef?: unknown;
        signedUrl?: unknown;
      };
      policy: { mutationAllowed: boolean; workerExecutionAllowed: boolean };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;

    expect(missingProjectResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "projectId is required for archive diagnostic replay reads"
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/launches/launch-locked/archive/diagnostics/replay?limit=2&cursor=2"
    );
    expect(headers["X-TestHistory-Scopes"]).toBe("uploads:read,launches:read");
    expect(headers["X-TestHistory-Project-Scope"]).toBe("project-locked");
    expect(headers["X-TestHistory-Actor-Id"]).toBe("actor-1");
    expect(denied.status).toBe("error");
    expect(denied.code).toBe(403);
    expect(denied.scope).toEqual({
      projectId: "project-locked",
      launchId: "launch-locked",
      actorId: "actor-1"
    });
    expect(denied.permissionDenied).toEqual(
      expect.objectContaining({
        requiredScopes: ["uploads:read", "launches:read"],
        token: "[redacted]"
      })
    );
    expect(denied.permissionDenied.rawHistory).toBeUndefined();
    expect(denied.permissionDenied.storageRef).toBeUndefined();
    expect(denied.permissionDenied.signedUrl).toBeUndefined();
    expect(denied.policy).toEqual(
      expect.objectContaining({ mutationAllowed: false, workerExecutionAllowed: false })
    );
    expect(mutationResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "Unknown tool: testhistory.archive-diagnostics.replay.refresh"
      })
    );
    expect(firstResourceText(deniedResourceResponse)).not.toContain("archive-replay-denied-token");
    expect(firstResourceText(deniedResourceResponse)).not.toContain("project-locked/raw");
    expect(firstResourceText(deniedResourceResponse)).not.toContain("storage.example");
    expect(firstResourceText(deniedResourceResponse)).not.toContain("X-Amz-Signature");
  });

  it("reads archive diagnostic replay fixture contracts through REST with scope, pagination, and MCP redaction", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return jsonResponse({
        kind: "archive-diagnostic-replay-fixture-list",
        project: { id: "project-1", scoped: true },
        actor: { id: "actor-1", scoped: true },
        access: {
          scope: "uploads:read",
          requiredScopes: ["uploads:read", "launches:read"],
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        query: { projectId: "project-1", limit: 1, cursor: "1" },
        page: {
          limit: 1,
          cursor: "1",
          offset: 1,
          returned: 1,
          total: 6,
          nextCursor: "2",
          hasMore: true
        },
        summary: {
          totalFixtures: 6,
          fixtureNames: ["corrupt", "empty", "denied", "partial", "duplicate", "retry"],
          supportedFiles: 10,
          attachmentFiles: 3,
          ignoredFiles: 2,
          warningCount: 6,
          parseErrors: 1,
          attemptGroups: 4,
          readOnly: true,
          mutation: false,
          archivePayloadAvailable: true,
          rawManifestEntriesReturned: true,
          rawResultFilesReturned: true,
          resultContentReturned: true,
          rawPathsReturned: true,
          payloadBytesReturned: 999,
          redacted: true,
          mutationUrl: "https://storage.example/replay?X-Amz-Signature=fixture-secret"
        },
        items: [
          {
            kind: "archive-diagnostic-replay-fixture",
            projectId: "project-1",
            fixtureRef: "fixture:abcdef",
            name: "retry",
            scenario: "retry-history",
            expected: {
              supportedFiles: 2,
              attachmentFiles: 0,
              ignoredFiles: 0,
              warningCount: 0,
              parseErrors: 0,
              attemptGroups: 1,
              latestStatuses: ["passed"],
              rawPath: "D:\\synthetic\\archive-fixture\\retry-result.json"
            },
            replay: {
              deterministic: true,
              compatibleSources: [
                "archive.status.read",
                "archive.diagnostics.read",
                "archive.cleanup.preview"
              ],
              retryAware: true,
              duplicateAware: false,
              deniedFixture: false,
              closedArchiveStatusReadCompatible: true,
              closedArchiveDiagnosticsReadCompatible: true,
              mutationBoundary: "fixture-read-only-no-replay-mutation",
              replayRefreshUrl: "https://storage.example/replay?token=synthetic-fixture-token"
            },
            payload: {
              archivePayloadAvailable: true,
              manifestEntriesReturned: true,
              resultFilesReturned: true,
              resultContentReturned: true,
              rawPathsReturned: true,
              payloadBytesReturned: 1024,
              redacted: false,
              storageRef: "storage://synthetic-fixture/raw"
            },
            digest: "digest-retry",
            manifestEntries: [{ path: "D:\\synthetic\\archive-fixture\\retry-result.json" }],
            resultFiles: [
              {
                path: "allure-results/replay/retry-result.json",
                content: "Authorization: Bearer synthetic-fixture-token"
              }
            ],
            archivePayloadBytes: "raw-archive-bytes",
            storageKey: "project-1/archive/fixture/raw",
            signedUrl: "https://storage.example/raw?X-Amz-Signature=fixture-secret",
            token: "synthetic-fixture-token"
          }
        ],
        links: {
          self: "/api/v1/projects/project-1/archive/diagnostics/replay/fixtures",
          signedUrl: "https://storage.example/list?X-Amz-Signature=fixture-secret"
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 65,
      method: "tools/call",
      params: {
        name: "testhistory.archive-diagnostics.replay.fixtures.read",
        arguments: {
          apiUrl: "http://api.test",
          projectId: "project-1",
          actorId: "actor-1",
          limit: 1,
          cursor: "1"
        }
      }
    });

    const payload = JSON.parse(firstText(response)) as {
      kind: string;
      project: { id: string; scoped: boolean };
      actor: { id: string; scoped: boolean };
      access: { mutation: boolean; redacted: boolean };
      query: { projectId: string; limit: number; cursor: string };
      page: { limit: number; cursor: string };
      summary: {
        archivePayloadAvailable: boolean;
        rawManifestEntriesReturned: boolean;
        rawResultFilesReturned: boolean;
        resultContentReturned: boolean;
        rawPathsReturned: boolean;
        payloadBytesReturned: number;
      };
      items: Array<{
        payload: {
          archivePayloadAvailable: boolean;
          manifestEntriesReturned: boolean;
          resultFilesReturned: boolean;
          resultContentReturned: boolean;
          rawPathsReturned: boolean;
          payloadBytesReturned: number;
          redacted: boolean;
        };
        manifestEntries?: unknown;
        resultFiles?: unknown;
        archivePayloadBytes?: unknown;
        storageKey?: unknown;
        signedUrl?: unknown;
        token?: unknown;
      }>;
      policy: {
        restParity: { method: string; path: string };
        syntheticOnly: boolean;
        mutationAllowed: boolean;
        workerExecutionAllowed: boolean;
        rawManifestEntriesIncluded: boolean;
        rawResultFilesIncluded: boolean;
        resultContentIncluded: boolean;
        rawPathsIncluded: boolean;
        storageRefsIncluded: boolean;
        signedUrlsIncluded: boolean;
        tokensIncluded: boolean;
      };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;
    const serialized = firstText(response);

    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/projects/project-1/archive/diagnostics/replay/fixtures?limit=1&cursor=1"
    );
    expect(fetchedRequests[0]?.init?.method).toBeUndefined();
    expect(fetchedRequests[0]?.init?.body).toBeUndefined();
    expect(headers["X-TestHistory-Scopes"]).toBe("uploads:read,launches:read");
    expect(headers["X-TestHistory-Project-Scope"]).toBe("project-1");
    expect(headers["X-TestHistory-Actor-Id"]).toBe("actor-1");
    expect(payload.kind).toBe("archive-diagnostic-replay-fixture-list");
    expect(payload.project).toEqual({ id: "project-1", scoped: true });
    expect(payload.actor).toEqual({ id: "actor-1", scoped: true });
    expect(payload.access).toEqual(expect.objectContaining({ mutation: false, redacted: true }));
    expect(payload.query).toEqual({ projectId: "project-1", limit: 1, cursor: "1" });
    expect(payload.page).toEqual(expect.objectContaining({ limit: 1, cursor: "1" }));
    expect(payload.summary).toEqual(
      expect.objectContaining({
        archivePayloadAvailable: false,
        rawManifestEntriesReturned: false,
        rawResultFilesReturned: false,
        resultContentReturned: false,
        rawPathsReturned: false,
        payloadBytesReturned: 0
      })
    );
    expect(payload.items[0]?.payload).toEqual({
      archivePayloadAvailable: false,
      manifestEntriesReturned: false,
      resultFilesReturned: false,
      resultContentReturned: false,
      rawPathsReturned: false,
      payloadBytesReturned: 0,
      redacted: true
    });
    expect(payload.items[0]?.manifestEntries).toBeUndefined();
    expect(payload.items[0]?.resultFiles).toBeUndefined();
    expect(payload.items[0]?.archivePayloadBytes).toBeUndefined();
    expect(payload.items[0]?.storageKey).toBeUndefined();
    expect(payload.items[0]?.signedUrl).toBeUndefined();
    expect(payload.items[0]?.token).toBeUndefined();
    expect(payload.policy).toEqual(
      expect.objectContaining({
        restParity: {
          method: "GET",
          path: "/api/v1/projects/{projectId}/archive/diagnostics/replay/fixtures"
        },
        syntheticOnly: true,
        mutationAllowed: false,
        workerExecutionAllowed: false,
        rawManifestEntriesIncluded: false,
        rawResultFilesIncluded: false,
        resultContentIncluded: false,
        rawPathsIncluded: false,
        storageRefsIncluded: false,
        signedUrlsIncluded: false,
        tokensIncluded: false
      })
    );
    expect(serialized).not.toContain("synthetic-fixture-token");
    expect(serialized).not.toContain("D:\\synthetic");
    expect(serialized).not.toContain('"manifestEntries":');
    expect(serialized).not.toContain('"resultFiles":');
    expect(serialized).not.toContain("raw-archive-bytes");
    expect(serialized).not.toContain("project-1/archive/fixture/raw");
    expect(serialized).not.toContain("storage://");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("replayRefreshUrl");
    expect(serialized).not.toContain("mutationUrl");
  });

  it("reads archive diagnostic replay fixture resources and rejects mutation-shaped fixture tools", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return deniedResponse({
        error: "permission_denied",
        message: "Archive diagnostic replay fixture access denied",
        reason: "project_scope_denied",
        requiredScopes: ["uploads:read", "launches:read"],
        projectId: "project-locked",
        actor: { type: "actor", actorId: "actor-1" },
        manifestEntries: [{ path: "D:\\synthetic\\denied\\secret-result.json" }],
        resultFiles: [{ content: "token=archive-fixture-denied-token" }],
        storageRef: "storage://project-locked/archive-fixture/raw",
        signedUrl: "https://storage.example/private?X-Amz-Signature=raw",
        token: "archive-fixture-denied-token"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const missingProjectResponse = await handle({
      jsonrpc: "2.0",
      id: 66,
      method: "tools/call",
      params: {
        name: "testhistory.archive-diagnostics.replay.fixtures.read",
        arguments: { apiUrl: "http://api.test" }
      }
    });
    const deniedResourceResponse = await handle({
      jsonrpc: "2.0",
      id: 67,
      method: "resources/read",
      params: {
        uri: "testhistory://projects/project-locked/archive/diagnostics/replay/fixtures?apiUrl=http%3A%2F%2Fapi.test&actorId=actor-1&limit=2&cursor=2"
      }
    });
    const refreshResponse = await handle({
      jsonrpc: "2.0",
      id: 68,
      method: "tools/call",
      params: {
        name: "testhistory.archive-diagnostics.replay.fixtures.refresh",
        arguments: { projectId: "project-1" }
      }
    });
    const deleteResponse = await handle({
      jsonrpc: "2.0",
      id: 69,
      method: "tools/call",
      params: {
        name: "testhistory.archive-diagnostics.replay.fixtures.delete",
        arguments: { projectId: "project-1" }
      }
    });

    const denied = JSON.parse(firstResourceText(deniedResourceResponse)) as {
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
        message: "projectId is required for archive diagnostic replay fixture reads"
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/projects/project-locked/archive/diagnostics/replay/fixtures?limit=2&cursor=2"
    );
    expect(headers["X-TestHistory-Scopes"]).toBe("uploads:read,launches:read");
    expect(headers["X-TestHistory-Project-Scope"]).toBe("project-locked");
    expect(headers["X-TestHistory-Actor-Id"]).toBe("actor-1");
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
        message: "Unknown tool: testhistory.archive-diagnostics.replay.fixtures.refresh"
      })
    );
    expect(deleteResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "Unknown tool: testhistory.archive-diagnostics.replay.fixtures.delete"
      })
    );
    expect(firstResourceText(deniedResourceResponse)).not.toContain("archive-fixture-denied-token");
    expect(firstResourceText(deniedResourceResponse)).not.toContain("D:\\synthetic");
    expect(firstResourceText(deniedResourceResponse)).not.toContain(
      "project-locked/archive-fixture/raw"
    );
    expect(firstResourceText(deniedResourceResponse)).not.toContain("storage.example");
    expect(firstResourceText(deniedResourceResponse)).not.toContain("X-Amz-Signature");
  });

  it("reads materialized archive diagnostic replay fixtures through REST with scope, pagination, and MCP redaction", async () => {
    const fetchedRequests: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetchedRequests.push({ url: input, init });
      return jsonResponse({
        kind: "archive-diagnostic-replay-fixture-materialized-list",
        project: { id: "project-1", scoped: true },
        actor: { id: "actor-1", scoped: true },
        access: {
          scope: "uploads:read",
          requiredScopes: ["uploads:read", "launches:read"],
          projectScoped: true,
          actorScoped: true,
          mutation: false,
          redacted: true
        },
        query: { projectId: "project-1", limit: 1, cursor: "1" },
        materialization: {
          adapterKind: "api-read-model-archive-diagnostic-replay-fixture-materialized-wip",
          boundary: "worker-compatible-archive-diagnostic-replay-fixture-materialized-read",
          consistency: "synthetic-fixture-contracts-idempotent",
          source: "synthetic-archive-diagnostic-replay-fixture-contracts",
          readOnly: true,
          mutation: false,
          rawArchivePayloadsIncluded: true,
          storageRefsIncluded: true,
          signedUrlsIncluded: true,
          tokensIncluded: true,
          materializedAt: "2026-05-30T00:00:00.000Z",
          materializedRecordCount: 6,
          materializationDigest: "digest-materialized-list",
          mutationBoundary: "rest-materialized-read-only-no-archive-or-worker-mutation",
          signedUrl: "https://storage.example/materialized?X-Amz-Signature=materialized-secret"
        },
        page: {
          limit: 1,
          cursor: "1",
          offset: 1,
          returned: 1,
          total: 6,
          nextCursor: "2",
          hasMore: true
        },
        summary: {
          projectId: "project-1",
          materializedRecordCount: 6,
          fixtureNames: ["corrupt", "empty", "denied", "partial", "duplicate", "retry"],
          supportedFiles: 10,
          attachmentFiles: 3,
          ignoredFiles: 2,
          warningCount: 6,
          parseErrors: 1,
          attemptGroups: 4,
          retryAwareCount: 1,
          duplicateAwareCount: 1,
          deniedFixtureCount: 1,
          rawArchivePayloadsIncluded: true,
          storageRefsIncluded: true,
          signedUrlsIncluded: true,
          tokensIncluded: true,
          redactionPassed: true,
          materializationDigest: "digest-materialized-list",
          mutationBoundary: "api-materialized-fixture-read-only-no-rest-or-worker-mutation",
          storageRef: "storage://synthetic-fixture/materialized"
        },
        items: [
          {
            kind: "archive-diagnostic-replay-fixture-materialized",
            projectId: "project-1",
            fixtureRef: "fixture:abcdef",
            materializedRef: "materialized:abcdef",
            name: "retry",
            scenario: "retry-history",
            materializedAt: "2026-05-30T00:00:00.000Z",
            sourceDigest: "digest-source",
            recordDigest: "digest-record",
            status: "ready",
            evidence: {
              supportedFiles: 2,
              attachmentFiles: 0,
              ignoredFiles: 0,
              warningCount: 0,
              parseErrors: 0,
              attemptGroups: 1,
              retryAware: true,
              duplicateAware: false,
              deniedFixture: false,
              rawArchivePayloadsIncluded: true,
              storageRefsIncluded: true,
              signedUrlsIncluded: true,
              tokensIncluded: true,
              redactionPassed: true,
              mutationBoundary: "rest-materialized-read-only-no-archive-or-worker-mutation",
              rawPath: "D:\\synthetic\\archive-fixture\\retry-result.json",
              storageRef: "storage://synthetic-fixture/raw",
              token: "synthetic-materialized-token"
            },
            materialization: {
              adapterKind: "api-read-model-archive-diagnostic-replay-fixture-materialized-wip",
              boundary: "worker-compatible-archive-diagnostic-replay-fixture-materialized-read",
              consistency: "synthetic-fixture-contracts-idempotent",
              source: "synthetic-archive-diagnostic-replay-fixture-contract",
              readOnly: true,
              rawArchivePayloadsIncluded: true,
              storageRefsIncluded: true,
              signedUrlsIncluded: true,
              tokensIncluded: true,
              mutationBoundary: "rest-materialized-read-only-no-archive-or-worker-mutation"
            },
            execution: {
              replayStarted: true,
              workerJobEnqueued: true,
              storageMutationStarted: true,
              readOnly: false,
              mutation: true,
              workerUrl: "https://storage.example/worker?token=synthetic-materialized-token"
            },
            manifestEntries: [{ path: "D:\\synthetic\\archive-fixture\\retry-result.json" }],
            resultFiles: [{ content: "Authorization: Bearer synthetic-materialized-token" }],
            archivePayloadBytes: "raw-materialized-archive-bytes",
            storageKey: "project-1/archive/materialized/raw",
            signedUrl: "https://storage.example/raw?X-Amz-Signature=materialized-secret",
            token: "synthetic-materialized-token"
          }
        ],
        links: {
          self: "/api/v1/projects/project-1/archive/diagnostics/replay/fixtures/materialized",
          fixtureContracts: "/api/v1/projects/project-1/archive/diagnostics/replay/fixtures",
          signedUrl: "https://storage.example/list?X-Amz-Signature=materialized-secret"
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const toolResponse = await handle({
      jsonrpc: "2.0",
      id: 70,
      method: "tools/call",
      params: {
        name: "testhistory.archive-diagnostics.replay.fixtures.materialized.read",
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
      id: 71,
      method: "resources/read",
      params: {
        uri: "testhistory://projects/project-1/archive/diagnostics/replay/fixtures/materialized?apiUrl=http%3A%2F%2Fapi.test&actorId=actor-1&limit=1&cursor=1"
      }
    });

    const payload = JSON.parse(firstText(toolResponse)) as {
      kind: string;
      project: { id: string; scoped: boolean };
      actor: { id: string; scoped: boolean };
      query: { projectId: string; limit: number; cursor: string };
      materialization: {
        rawArchivePayloadsIncluded: boolean;
        storageRefsIncluded: boolean;
        signedUrlsIncluded: boolean;
        tokensIncluded: boolean;
      };
      summary: {
        rawArchivePayloadsIncluded: boolean;
        storageRefsIncluded: boolean;
        signedUrlsIncluded: boolean;
        tokensIncluded: boolean;
      };
      items: Array<{
        evidence: {
          rawArchivePayloadsIncluded: boolean;
          storageRefsIncluded: boolean;
          signedUrlsIncluded: boolean;
          tokensIncluded: boolean;
        };
        materialization: {
          rawArchivePayloadsIncluded: boolean;
          storageRefsIncluded: boolean;
          signedUrlsIncluded: boolean;
          tokensIncluded: boolean;
        };
        execution: {
          replayStarted: boolean;
          workerJobEnqueued: boolean;
          storageMutationStarted: boolean;
          mutation: boolean;
        };
        manifestEntries?: unknown;
        resultFiles?: unknown;
        archivePayloadBytes?: unknown;
        storageKey?: unknown;
        signedUrl?: unknown;
        token?: unknown;
      }>;
      policy: {
        restParity: { method: string; path: string };
        syntheticOnly: boolean;
        mutationAllowed: boolean;
        workerExecutionAllowed: boolean;
        storageMutationAllowed: boolean;
        rawManifestEntriesIncluded: boolean;
        rawResultFilesIncluded: boolean;
        resultContentIncluded: boolean;
        rawPayloadsIncluded: boolean;
        rawPathsIncluded: boolean;
        storageRefsIncluded: boolean;
        signedUrlsIncluded: boolean;
        tokensIncluded: boolean;
        credentialsIncluded: boolean;
      };
    };
    const headers = fetchedRequests[0]?.init?.headers as Record<string, string>;
    const serialized = firstText(toolResponse);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchedRequests[0]?.url.toString()).toBe(
      "http://api.test/api/v1/projects/project-1/archive/diagnostics/replay/fixtures/materialized?limit=1&cursor=1"
    );
    expect(fetchedRequests[0]?.init?.method).toBeUndefined();
    expect(fetchedRequests[0]?.init?.body).toBeUndefined();
    expect(headers["X-TestHistory-Scopes"]).toBe("uploads:read,launches:read");
    expect(headers["X-TestHistory-Project-Scope"]).toBe("project-1");
    expect(headers["X-TestHistory-Actor-Id"]).toBe("actor-1");
    expect(payload.kind).toBe("archive-diagnostic-replay-fixture-materialized-list");
    expect(payload.project).toEqual({ id: "project-1", scoped: true });
    expect(payload.actor).toEqual({ id: "actor-1", scoped: true });
    expect(payload.query).toEqual({ projectId: "project-1", limit: 1, cursor: "1" });
    expect(payload.materialization).toEqual(
      expect.objectContaining({
        rawArchivePayloadsIncluded: false,
        storageRefsIncluded: false,
        signedUrlsIncluded: false,
        tokensIncluded: false
      })
    );
    expect(payload.summary).toEqual(
      expect.objectContaining({
        rawArchivePayloadsIncluded: false,
        storageRefsIncluded: false,
        signedUrlsIncluded: false,
        tokensIncluded: false
      })
    );
    expect(payload.items[0]?.evidence).toEqual(
      expect.objectContaining({
        rawArchivePayloadsIncluded: false,
        storageRefsIncluded: false,
        signedUrlsIncluded: false,
        tokensIncluded: false
      })
    );
    expect(payload.items[0]?.materialization).toEqual(
      expect.objectContaining({
        rawArchivePayloadsIncluded: false,
        storageRefsIncluded: false,
        signedUrlsIncluded: false,
        tokensIncluded: false
      })
    );
    expect(payload.items[0]?.execution).toEqual({
      replayStarted: false,
      workerJobEnqueued: false,
      storageMutationStarted: false,
      readOnly: true,
      mutation: false
    });
    expect(payload.items[0]?.manifestEntries).toBeUndefined();
    expect(payload.items[0]?.resultFiles).toBeUndefined();
    expect(payload.items[0]?.archivePayloadBytes).toBeUndefined();
    expect(payload.items[0]?.storageKey).toBeUndefined();
    expect(payload.items[0]?.signedUrl).toBeUndefined();
    expect(payload.items[0]?.token).toBeUndefined();
    expect(payload.policy).toEqual(
      expect.objectContaining({
        restParity: {
          method: "GET",
          path: "/api/v1/projects/{projectId}/archive/diagnostics/replay/fixtures/materialized"
        },
        syntheticOnly: true,
        mutationAllowed: false,
        workerExecutionAllowed: false,
        storageMutationAllowed: false,
        rawManifestEntriesIncluded: false,
        rawResultFilesIncluded: false,
        resultContentIncluded: false,
        rawPayloadsIncluded: false,
        rawPathsIncluded: false,
        storageRefsIncluded: false,
        signedUrlsIncluded: false,
        tokensIncluded: false,
        credentialsIncluded: false
      })
    );
    expect(firstResourceText(resourceResponse)).toContain(
      "archive-diagnostic-replay-fixture-materialized-list"
    );
    expect(serialized).not.toContain("synthetic-materialized-token");
    expect(serialized).not.toContain("D:\\synthetic");
    expect(serialized).not.toContain('"manifestEntries":');
    expect(serialized).not.toContain('"resultFiles":');
    expect(serialized).not.toContain("raw-materialized-archive-bytes");
    expect(serialized).not.toContain("project-1/archive/materialized/raw");
    expect(serialized).not.toContain("storage://");
    expect(serialized).not.toContain("storage.example");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("workerUrl");
  });
});
