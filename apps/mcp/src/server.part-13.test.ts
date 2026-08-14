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

describe("MCP tools part-13", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("denies unsupported artifact resources and mutation tools instead of claiming auth", async () => {
    const artifactResponse = await handle({
      jsonrpc: "2.0",
      id: 44,
      method: "resources/read",
      params: {
        uri: "testhistory://artifacts/artifact-1?apiUrl=http%3A%2F%2Fapi.test"
      }
    });
    const mutationResponse = await handle({
      jsonrpc: "2.0",
      id: 45,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.mutate",
        arguments: { testCaseId: "case-1", patch: { tags: ["smoke"] } }
      }
    });
    const compareRefreshResponse = await handle({
      jsonrpc: "2.0",
      id: 45,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history.compare.refresh",
        arguments: { testCaseId: "case-1" }
      }
    });
    const permissionAuditRefreshResponse = await handle({
      jsonrpc: "2.0",
      id: 45,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.history.compare.permission-audit.refresh",
        arguments: { testCaseId: "case-1", projectId: "project-1" }
      }
    });
    const correctionMutationResponse = await handle({
      jsonrpc: "2.0",
      id: 46,
      method: "tools/call",
      params: {
        name: "testhistory.identity-corrections.correct",
        arguments: { projectId: "project-1", beforeIds: ["a"], afterIds: ["b"] }
      }
    });
    const defectProjectionMutationResponse = await handle({
      jsonrpc: "2.0",
      id: 47,
      method: "tools/call",
      params: {
        name: "testhistory.defect-mute-projection.replay.refresh",
        arguments: { projectId: "project-1" }
      }
    });

    expect(artifactResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: expect.stringContaining("Unsupported TestHistory resource URI")
      })
    );
    expect(mutationResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "Unknown tool: testhistory.test-case.mutate"
      })
    );
    expect(compareRefreshResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "Unknown tool: testhistory.test-case.history.compare.refresh"
      })
    );
    expect(permissionAuditRefreshResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "Unknown tool: testhistory.test-case.history.compare.permission-audit.refresh"
      })
    );
    expect(correctionMutationResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "Unknown tool: testhistory.identity-corrections.correct"
      })
    );
    expect(defectProjectionMutationResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "Unknown tool: testhistory.defect-mute-projection.replay.refresh"
      })
    );
  });

  it("returns unavailable payload when a resource cannot reach backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED");
      })
    );

    const response = await handle({
      jsonrpc: "2.0",
      id: 35,
      method: "resources/read",
      params: { uri: "testhistory://projects" }
    });

    const payload = JSON.parse(firstResourceText(response)) as {
      status: string;
      backendRequirement: string;
      url: string;
    };

    expect(payload.status).toBe("unavailable");
    expect(payload.backendRequirement).toContain("requires a running");
    expect(payload.url).toBe("http://127.0.0.1:18080/api/v1/projects");
  });

  it("returns unavailable payload when a dynamic API tool cannot reach backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED");
      })
    );

    const response = await handle({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "testhistory.projects.find", arguments: {} }
    });

    const payload = JSON.parse(firstText(response)) as {
      status: string;
      backendRequirement: string;
      url: string;
    };

    expect(payload.status).toBe("unavailable");
    expect(payload.backendRequirement).toContain("requires a running");
    expect(payload.url).toBe("http://127.0.0.1:18080/api/v1/projects");
  });
});
