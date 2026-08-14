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

describe("MCP tools discovery-schemas", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lists discovery, schema, and TestOps-aligned find tools", async () => {
    const response = await handle({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const result = response.result as { tools: Array<{ name: string }> };

    expect(result.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "testhistory.discovery",
        "testhistory.schemas",
        "testhistory.projects.find",
        "testhistory.test-cases.find",
        "testhistory.test-case.get",
        "testhistory.test-results.find",
        "testhistory.test-result.get",
        "testhistory.test-case.history",
        "testhistory.test-case.history.compare",
        "testhistory.test-case.history.compare.permission-audit",
        "testhistory.test-case.history.compare.permission-audit.replay.invariants.read",
        "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.read",
        "testhistory.identity-corrections.audit",
        "testhistory.defect-mutes.find",
        "testhistory.defect-mute-projection.read",
        "testhistory.defect-mute-projection.replay.read",
        "testhistory.defect-mute-projection.replay.invariants.read",
        "testhistory.defect-mute-projection.replay.invariants.materialized.read",
        "testhistory.security-audit.read",
        "testhistory.security-audit.export.evaluate",
        "testhistory.security-audit.export.lifecycle.replay.invariants.read",
        "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.read",
        "testhistory.archive-status.read",
        "testhistory.archive-diagnostics.replay.read",
        "testhistory.archive-diagnostics.replay.fixtures.read",
        "testhistory.archive-diagnostics.replay.fixtures.materialized.read",
        "testhistory.attachment-preview-retention.preview",
        "testhistory.attachment-preview-retention.dry-run.schedule.read",
        "testhistory.launch.summarize",
        "testhistory.failures.recent",
        "testhistory.upload.policy",
        "testhistory.upload.session.schema",
        "testhistory.quality-gate.rules"
      ])
    );
  });

  it("returns static discovery without backend calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "testhistory.discovery", arguments: {} }
    });

    const discovery = JSON.parse(firstText(response)) as {
      backendRequirement: string;
      api: { openapiJson: string; openapiYaml: string };
      schemaNames: string[];
      toolGroups: Array<{ group: string; tools: string[] }>;
      testOpsAlignment: { plannedFamilies: string[] };
      queryModel: { style: string; parameters: { aql: string } };
    };

    expect(discovery.backendRequirement).toContain("does not require");
    expect(discovery.api.openapiJson).toBe("/docs/json");
    expect(discovery.api.openapiYaml).toBe("docs/openapi/openapi.yaml");
    expect(discovery.schemaNames).toContain("defect-mute.projection.replay");
    expect(discovery.schemaNames).toContain("defect-mute.projection.replay.invariants");
    expect(discovery.schemaNames).toContain(
      "defect-mute.projection.replay.invariants.materialized"
    );
    expect(discovery.schemaNames).toContain("test-case.history.compare.permission-audit");
    expect(discovery.schemaNames).toContain(
      "test-case.history.compare.permission-audit.replay.invariants"
    );
    expect(discovery.schemaNames).toContain(
      "test-case.history.compare.permission-audit.replay.invariants.persisted"
    );
    expect(discovery.schemaNames).toContain("archive-diagnostics.replay");
    expect(discovery.schemaNames).toContain("archive-diagnostics.replay.fixtures");
    expect(discovery.schemaNames).toContain("archive-diagnostics.replay.fixtures.materialized");
    expect(discovery.schemaNames).toContain("attachment-preview-retention.dry-run.schedule");
    expect(discovery.schemaNames).toContain("security-audit-export.lifecycle.replay.invariants");
    expect(discovery.schemaNames).toContain(
      "security-audit-export.lifecycle.replay.invariants.materialized"
    );
    expect(discovery.toolGroups.find((group) => group.group === "test-history")?.tools).toContain(
      "testhistory.defect-mute-projection.replay.read"
    );
    expect(discovery.toolGroups.find((group) => group.group === "test-history")?.tools).toContain(
      "testhistory.defect-mute-projection.replay.invariants.read"
    );
    expect(discovery.toolGroups.find((group) => group.group === "test-history")?.tools).toContain(
      "testhistory.defect-mute-projection.replay.invariants.materialized.read"
    );
    expect(discovery.toolGroups.find((group) => group.group === "test-history")?.tools).toContain(
      "testhistory.test-case.history.compare.permission-audit"
    );
    expect(discovery.toolGroups.find((group) => group.group === "test-history")?.tools).toContain(
      "testhistory.test-case.history.compare.permission-audit.replay.invariants.read"
    );
    expect(discovery.toolGroups.find((group) => group.group === "test-history")?.tools).toContain(
      "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.read"
    );
    expect(discovery.toolGroups.find((group) => group.group === "test-history")?.tools).toContain(
      "testhistory.archive-diagnostics.replay.read"
    );
    expect(discovery.toolGroups.find((group) => group.group === "test-history")?.tools).toContain(
      "testhistory.archive-diagnostics.replay.fixtures.read"
    );
    expect(discovery.toolGroups.find((group) => group.group === "test-history")?.tools).toContain(
      "testhistory.archive-diagnostics.replay.fixtures.materialized.read"
    );
    expect(discovery.toolGroups.find((group) => group.group === "test-history")?.tools).toContain(
      "testhistory.attachment-preview-retention.dry-run.schedule.read"
    );
    expect(discovery.toolGroups.find((group) => group.group === "test-history")?.tools).toContain(
      "testhistory.security-audit.export.lifecycle.replay.invariants.read"
    );
    expect(discovery.toolGroups.find((group) => group.group === "test-history")?.tools).toContain(
      "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.read"
    );
    expect(discovery.testOpsAlignment.plannedFamilies).toContain(
      "create/update/find/delete/restore test cases"
    );
    expect(discovery.queryModel.style).toBe("AQL-like");
    expect(discovery.queryModel.parameters.aql).toContain("Structured filter");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps discovery tool groups limited to advertised MCP tools", async () => {
    const listResponse = await handle({ jsonrpc: "2.0", id: 20, method: "tools/list" });
    const list = listResponse.result as { tools: Array<{ name: string }> };
    const advertisedTools = new Set(list.tools.map((tool) => tool.name));

    const discoveryResponse = await handle({
      jsonrpc: "2.0",
      id: 21,
      method: "tools/call",
      params: { name: "testhistory.discovery", arguments: {} }
    });
    const discovery = JSON.parse(firstText(discoveryResponse)) as {
      toolGroups: Array<{ tools: string[] }>;
    };
    const groupedTools = discovery.toolGroups.flatMap((group) => group.tools);

    expect(groupedTools.every((tool) => advertisedTools.has(tool))).toBe(true);
    expect(groupedTools).not.toEqual(
      expect.arrayContaining(["testhistory.test-case.create", "testhistory.mute.create"])
    );
    expect(groupedTools).not.toEqual(
      expect.arrayContaining(["testhistory.identity-corrections.correct"])
    );
  });

  it("advertises MCP auth parity without broader artifact or mutation access", async () => {
    const listResponse = await handle({ jsonrpc: "2.0", id: 24, method: "tools/list" });
    const list = listResponse.result as { tools: Array<{ name: string }> };
    const advertisedTools = new Set(list.tools.map((tool) => tool.name));

    const discoveryResponse = await handle({
      jsonrpc: "2.0",
      id: 25,
      method: "tools/call",
      params: { name: "testhistory.discovery", arguments: {} }
    });
    const discovery = JSON.parse(firstText(discoveryResponse)) as {
      auth: {
        tokenTransport: string;
        noSecretsInManifest: boolean;
        capabilities: Array<{
          name: string;
          access: string;
          requiredScopes: string[];
          restParity?: { method: string; path: string };
        }>;
        unsupported: Array<{ name: string; access: string; restParity?: { path: string } }>;
      };
    };

    expect(discovery.auth.tokenTransport).toBe("rest-authorization-header");
    expect(discovery.auth.noSecretsInManifest).toBe(true);
    expect(
      discovery.auth.capabilities.every((capability) => advertisedTools.has(capability.name))
    ).toBe(true);
    expect(
      discovery.auth.capabilities
        .filter((capability) => capability.access === "rest-authorized")
        .every((capability) => capability.restParity?.path.startsWith("/api/v1/"))
    ).toBe(true);
    expect(discovery.auth.unsupported).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "testhistory.artifacts.read",
          access: "unsupported",
          restParity: expect.objectContaining({ path: "/api/v1/artifacts" })
        }),
        expect.objectContaining({
          name: "testhistory.test-case.mutate",
          access: "unsupported",
          restParity: expect.objectContaining({ path: "/api/v1/test-cases/{testCaseId}" })
        }),
        expect.objectContaining({
          name: "testhistory.identity-corrections.correct",
          access: "unsupported",
          restParity: expect.objectContaining({
            path: "/api/v1/projects/{projectId}/identity-corrections"
          })
        })
      ])
    );
    expect(discovery.auth.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "testhistory.security-audit.export.evaluate",
          access: "rest-authorized",
          requiredScopes: ["security:audit:read"],
          restParity: { method: "POST", path: "/api/v1/security/audit/export/evaluate" }
        }),
        expect.objectContaining({
          name: "testhistory.security-audit.export.lifecycle.replay.invariants.read",
          access: "rest-authorized",
          requiredScopes: ["security:audit:read"],
          restParity: {
            method: "GET",
            path: "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants"
          }
        }),
        expect.objectContaining({
          name: "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.read",
          access: "rest-authorized",
          requiredScopes: ["security:audit:read"],
          restParity: {
            method: "GET",
            path: "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized"
          }
        }),
        expect.objectContaining({
          name: "testhistory.attachment-preview-retention.preview",
          access: "rest-authorized",
          requiredScopes: ["artifacts:read"],
          restParity: {
            method: "GET",
            path: "/api/v1/launches/{launchId}/attachment-previews/retention/preview"
          }
        }),
        expect.objectContaining({
          name: "testhistory.defect-mute-projection.replay.read",
          access: "rest-authorized",
          requiredScopes: ["defects:read"],
          restParity: {
            method: "GET",
            path: "/api/v1/projects/{projectId}/defect-mutes/projection"
          }
        }),
        expect.objectContaining({
          name: "testhistory.defect-mute-projection.replay.invariants.read",
          access: "rest-authorized",
          requiredScopes: ["defects:read"],
          restParity: {
            method: "GET",
            path: "/api/v1/projects/{projectId}/defect-mutes/projection/replay/invariants"
          }
        }),
        expect.objectContaining({
          name: "testhistory.defect-mute-projection.replay.invariants.materialized.read",
          access: "rest-authorized",
          requiredScopes: ["defects:read"],
          restParity: {
            method: "GET",
            path: "/api/v1/projects/{projectId}/defect-mutes/projection/replay/invariants/materialized"
          }
        }),
        expect.objectContaining({
          name: "testhistory.test-case.history.compare.permission-audit",
          access: "rest-authorized",
          requiredScopes: ["test-cases:read"],
          restParity: {
            method: "GET",
            path: "/api/v1/test-cases/{testCaseId}/history/compare/permission-audit"
          }
        }),
        expect.objectContaining({
          name: "testhistory.test-case.history.compare.permission-audit.replay.invariants.read",
          access: "rest-authorized",
          requiredScopes: ["test-cases:read"],
          restParity: {
            method: "GET",
            path: "/api/v1/test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants"
          }
        }),
        expect.objectContaining({
          name: "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.read",
          access: "rest-authorized",
          requiredScopes: ["test-cases:read"],
          restParity: {
            method: "GET",
            path: "/api/v1/test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants/persisted"
          }
        }),
        expect.objectContaining({
          name: "testhistory.archive-diagnostics.replay.read",
          access: "rest-authorized",
          requiredScopes: ["uploads:read", "launches:read"],
          restParity: {
            method: "GET",
            path: "/api/v1/launches/{launchId}/archive/diagnostics/replay"
          }
        }),
        expect.objectContaining({
          name: "testhistory.archive-diagnostics.replay.fixtures.read",
          access: "rest-authorized",
          requiredScopes: ["uploads:read", "launches:read"],
          restParity: {
            method: "GET",
            path: "/api/v1/projects/{projectId}/archive/diagnostics/replay/fixtures"
          }
        }),
        expect.objectContaining({
          name: "testhistory.archive-diagnostics.replay.fixtures.materialized.read",
          access: "rest-authorized",
          requiredScopes: ["uploads:read", "launches:read"],
          restParity: {
            method: "GET",
            path: "/api/v1/projects/{projectId}/archive/diagnostics/replay/fixtures/materialized"
          }
        }),
        expect.objectContaining({
          name: "testhistory.attachment-preview-retention.dry-run.schedule.read",
          access: "rest-authorized",
          requiredScopes: ["artifacts:read"],
          restParity: {
            method: "GET",
            path: "/api/v1/launches/{launchId}/attachment-previews/retention/dry-run/schedule"
          }
        })
      ])
    );
    expect([...advertisedTools]).not.toEqual(
      expect.arrayContaining([
        "testhistory.artifacts.read",
        "testhistory.test-case.mutate",
        "testhistory.identity-corrections.correct"
      ])
    );
  });

  it("returns named static schemas without backend calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "testhistory.schemas", arguments: { schema: "test-case.mutation" } }
    });

    const schema = JSON.parse(firstText(response)) as {
      title: string;
      properties: { aql: { description: string } };
      backendRequirement: string;
    };

    expect(schema.title).toBe("TestHistoryTestCaseMutation");
    expect(schema.properties.aql.description).toContain("AQL-like");
    expect(schema.backendRequirement).toContain("planned");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("advertises attachment preview retention dry-run schema as read-only and redacted", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 27,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: { schema: "attachment-preview-retention.preview" }
      }
    });

    const schema = JSON.parse(firstText(response)) as {
      title: string;
      properties: { policy: { $ref: string } };
      $defs: {
        execution: {
          properties: {
            dryRun: { const: boolean };
            deletionExecution: { const: boolean };
            providerActions: { const: boolean };
            deleteRequestedCount: { const: number };
          };
        };
        policy: {
          properties: {
            closedLaunchScoped: { const: boolean };
            mutationAllowed: { const: boolean };
            pathsIncluded: { const: boolean };
            storageLocationsIncluded: { const: boolean };
            signedUrlsIncluded: { const: boolean };
            tokensIncluded: { const: boolean };
          };
        };
      };
    };

    expect(schema.title).toBe("TestHistoryAttachmentPreviewRetentionDryRunPreview");
    expect(schema.$defs.execution.properties.dryRun.const).toBe(true);
    expect(schema.$defs.execution.properties.deletionExecution.const).toBe(false);
    expect(schema.$defs.execution.properties.providerActions.const).toBe(false);
    expect(schema.$defs.execution.properties.deleteRequestedCount.const).toBe(0);
    expect(schema.$defs.policy.properties.closedLaunchScoped.const).toBe(true);
    expect(schema.$defs.policy.properties.mutationAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.pathsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.storageLocationsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.signedUrlsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.tokensIncluded.const).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("advertises attachment preview retention dry-run schedule schema as read-only and redacted", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 28,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: { schema: "attachment-preview-retention.dry-run.schedule" }
      }
    });

    const schema = JSON.parse(firstText(response)) as {
      title: string;
      $defs: {
        boundary: {
          properties: {
            workerScheduled: { const: boolean };
            descriptorSource: { const: string };
            closedLaunchScoped: { const: boolean };
            rawMaterialReturned: { const: boolean };
          };
        };
        execution: {
          properties: {
            dryRun: { const: boolean };
            readOnly: { const: boolean };
            workerExecutionAllowed: { const: boolean };
            deletionExecution: { const: boolean };
            providerActions: { const: boolean };
            deleteRequestedCount: { const: number };
          };
        };
        policy: {
          properties: {
            closedLaunchScoped: { const: boolean };
            equalOrNarrowerThanRest: { const: boolean };
            descriptorOnly: { const: boolean };
            mutationAllowed: { const: boolean };
            refreshAllowed: { const: boolean };
            rawPayloadsIncluded: { const: boolean };
            pathsIncluded: { const: boolean };
            storageLocationsIncluded: { const: boolean };
            signedUrlsIncluded: { const: boolean };
            tokensIncluded: { const: boolean };
            paginationRequired: { const: boolean };
          };
        };
      };
    };

    expect(schema.title).toBe("TestHistoryAttachmentPreviewRetentionDryRunScheduleRead");
    expect(schema.$defs.boundary.properties.workerScheduled.const).toBe(false);
    expect(schema.$defs.boundary.properties.descriptorSource.const).toBe(
      "artifact-schedule-descriptor-read-model"
    );
    expect(schema.$defs.boundary.properties.closedLaunchScoped.const).toBe(true);
    expect(schema.$defs.boundary.properties.rawMaterialReturned.const).toBe(false);
    expect(schema.$defs.execution.properties.dryRun.const).toBe(true);
    expect(schema.$defs.execution.properties.readOnly.const).toBe(true);
    expect(schema.$defs.execution.properties.workerExecutionAllowed.const).toBe(false);
    expect(schema.$defs.execution.properties.deletionExecution.const).toBe(false);
    expect(schema.$defs.execution.properties.providerActions.const).toBe(false);
    expect(schema.$defs.execution.properties.deleteRequestedCount.const).toBe(0);
    expect(schema.$defs.policy.properties.closedLaunchScoped.const).toBe(true);
    expect(schema.$defs.policy.properties.equalOrNarrowerThanRest.const).toBe(true);
    expect(schema.$defs.policy.properties.descriptorOnly.const).toBe(true);
    expect(schema.$defs.policy.properties.mutationAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.refreshAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.rawPayloadsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.pathsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.storageLocationsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.signedUrlsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.tokensIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.paginationRequired.const).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns auth contract schemas without backend calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const deniedResponse = await handle({
      jsonrpc: "2.0",
      id: 26,
      method: "tools/call",
      params: { name: "testhistory.schemas", arguments: { schema: "auth.permission-denied" } }
    });
    const capabilitiesResponse = await handle({
      jsonrpc: "2.0",
      id: 27,
      method: "tools/call",
      params: { name: "testhistory.schemas", arguments: { schema: "mcp.auth-capabilities" } }
    });

    const deniedSchema = JSON.parse(firstText(deniedResponse)) as {
      title: string;
      required: string[];
      properties: { error: { const: string } };
    };
    const capabilitiesSchema = JSON.parse(firstText(capabilitiesResponse)) as {
      title: string;
      properties: { tokenTransport: { const: string } };
    };

    expect(deniedSchema.title).toBe("TestHistoryPermissionDeniedError");
    expect(deniedSchema.required).toEqual(["error", "message", "reason"]);
    expect(deniedSchema.properties.error.const).toBe("permission_denied");
    expect(capabilitiesSchema.title).toBe("TestHistoryMcpAuthCapabilities");
    expect(capabilitiesSchema.properties.tokenTransport.const).toBe("rest-authorization-header");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns identity correction audit read schema with boundary and redaction rules", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 28,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: { schema: "identity-correction.audit" }
      }
    });

    const schema = JSON.parse(firstText(response)) as {
      title: string;
      $defs: {
        policy: {
          properties: {
            projectIdRequired: { const: boolean };
            actorOriginRequiresActorId: { const: boolean };
            mutationAllowed: { const: boolean };
            redactionRules: { items: { properties: { field: { enum: string[] } } } };
          };
        };
      };
    };

    expect(schema.title).toBe("TestHistoryIdentityCorrectionAuditPage");
    expect(schema.$defs.policy.properties.projectIdRequired.const).toBe(true);
    expect(schema.$defs.policy.properties.actorOriginRequiresActorId.const).toBe(true);
    expect(schema.$defs.policy.properties.mutationAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.redactionRules.items.properties.field.enum).toEqual(
      expect.arrayContaining([
        "origin",
        "reason",
        "beforeIds",
        "afterIds",
        "scope.parameterVariantSignature",
        "evidence.parameterVariantSignature"
      ])
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns defect mute read schema as read-only MCP parity metadata", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 29,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: { schema: "defect-mute.read" }
      }
    });

    const schema = JSON.parse(firstText(response)) as {
      title: string;
      properties: { kind: { enum: string[] } };
      $defs: {
        policy: {
          properties: {
            equalOrNarrowerThanRest: { const: boolean };
            mutationAllowed: { const: boolean };
            rawFailurePayloadsIncluded: { const: boolean };
          };
        };
      };
    };

    expect(schema.title).toBe("TestHistoryDefectMuteRead");
    expect(schema.properties.kind.enum).toEqual(["defect-mute-status", "defect-mute-effects"]);
    expect(schema.$defs.policy.properties.equalOrNarrowerThanRest.const).toBe(true);
    expect(schema.$defs.policy.properties.mutationAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.rawFailurePayloadsIncluded.const).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns defect mute projection schema as read-only REST replay parity metadata", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 33,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: { schema: "defect-mute.projection" }
      }
    });

    const schema = JSON.parse(firstText(response)) as {
      title: string;
      properties: { kind: { const: string } };
      $defs: {
        access: { properties: { scope: { const: string }; mutation: { const: boolean } } };
        projection: { properties: { mcpReplayExecution: { const: boolean } } };
        policy: {
          properties: {
            equalOrNarrowerThanRest: { const: boolean };
            mutationAllowed: { const: boolean };
            mcpReplayExecution: { const: boolean };
            replayDerivedReadModel: { const: boolean };
            rawFailurePayloadsIncluded: { const: boolean };
            rawEffectiveSeparation: { const: boolean };
          };
        };
      };
    };

    expect(schema.title).toBe("TestHistoryDefectMuteProjectionRead");
    expect(schema.properties.kind.const).toBe("defect-mute-projection");
    expect(schema.$defs.access.properties.scope.const).toBe("defects:read");
    expect(schema.$defs.access.properties.mutation.const).toBe(false);
    expect(schema.$defs.projection.properties.mcpReplayExecution.const).toBe(false);
    expect(schema.$defs.policy.properties.equalOrNarrowerThanRest.const).toBe(true);
    expect(schema.$defs.policy.properties.mutationAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.mcpReplayExecution.const).toBe(false);
    expect(schema.$defs.policy.properties.replayDerivedReadModel.const).toBe(true);
    expect(schema.$defs.policy.properties.rawFailurePayloadsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.rawEffectiveSeparation.const).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("advertises replay-derived defect mute projection schema as read-only MCP parity", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 331,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: { schema: "defect-mute.projection.replay" }
      }
    });

    const schema = JSON.parse(firstText(response)) as {
      title: string;
      properties: { kind: { const: string } };
      $defs: {
        access: { properties: { scope: { const: string }; mutation: { const: boolean } } };
        projection: { properties: { mcpReplayExecution: { const: boolean } } };
        policy: {
          properties: {
            equalOrNarrowerThanRest: { const: boolean };
            mutationAllowed: { const: boolean };
            mcpReplayExecution: { const: boolean };
            replayDerivedReadModel: { const: boolean };
            rawFailurePayloadsIncluded: { const: boolean };
            rawEffectiveSeparation: { const: boolean };
          };
        };
      };
    };

    expect(schema.title).toBe("TestHistoryDefectMuteProjectionReplayRead");
    expect(schema.properties.kind.const).toBe("defect-mute-projection");
    expect(schema.$defs.access.properties.scope.const).toBe("defects:read");
    expect(schema.$defs.access.properties.mutation.const).toBe(false);
    expect(schema.$defs.projection.properties.mcpReplayExecution.const).toBe(false);
    expect(schema.$defs.policy.properties.equalOrNarrowerThanRest.const).toBe(true);
    expect(schema.$defs.policy.properties.mutationAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.mcpReplayExecution.const).toBe(false);
    expect(schema.$defs.policy.properties.replayDerivedReadModel.const).toBe(true);
    expect(schema.$defs.policy.properties.rawFailurePayloadsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.rawEffectiveSeparation.const).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("advertises defect mute replay invariant schema as read-only REST parity metadata", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 332,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: { schema: "defect-mute.projection.replay.invariants" }
      }
    });

    const schema = JSON.parse(firstText(response)) as {
      title: string;
      properties: { kind: { const: string } };
      $defs: {
        access: { properties: { scope: { const: string }; mutation: { const: boolean } } };
        invariant: {
          properties: {
            mutationBoundary: { const: string };
            mcpReplayExecution: { const: boolean };
          };
        };
        policy: {
          properties: {
            equalOrNarrowerThanRest: { const: boolean };
            mutationAllowed: { const: boolean };
            mcpReplayExecution: { const: boolean };
            replayInvariantReadModel: { const: boolean };
            rawFailurePayloadsIncluded: { const: boolean };
            deniedStateMasked: { const: boolean };
          };
        };
      };
    };

    expect(schema.title).toBe("TestHistoryDefectMuteReplayInvariantRead");
    expect(schema.properties.kind.const).toBe("defect-mute-replay-invariant");
    expect(schema.$defs.access.properties.scope.const).toBe("defects:read");
    expect(schema.$defs.access.properties.mutation.const).toBe(false);
    expect(schema.$defs.invariant.properties.mutationBoundary.const).toBe(
      "rest-read-only-no-replay-mutation"
    );
    expect(schema.$defs.invariant.properties.mcpReplayExecution.const).toBe(false);
    expect(schema.$defs.policy.properties.equalOrNarrowerThanRest.const).toBe(true);
    expect(schema.$defs.policy.properties.mutationAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.mcpReplayExecution.const).toBe(false);
    expect(schema.$defs.policy.properties.replayInvariantReadModel.const).toBe(true);
    expect(schema.$defs.policy.properties.rawFailurePayloadsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.deniedStateMasked.const).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("advertises materialized defect mute replay invariant schema as read-only REST parity metadata", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 333,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: { schema: "defect-mute.projection.replay.invariants.materialized" }
      }
    });

    const schema = JSON.parse(firstText(response)) as {
      title: string;
      properties: { kind: { const: string } };
      $defs: {
        access: { properties: { scope: { const: string }; mutation: { const: boolean } } };
        materialization: {
          properties: {
            readOnly: { const: boolean };
            rawFailurePayloadsIncluded: { const: boolean };
            mutationBoundary: { const: string };
          };
        };
        policy: {
          properties: {
            equalOrNarrowerThanRest: { const: boolean };
            mutationAllowed: { const: boolean };
            mcpReplayExecution: { const: boolean };
            mcpWorkerExecution: { const: boolean };
            materializedInvariantReadModel: { const: boolean };
            rawFailurePayloadsIncluded: { const: boolean };
            deniedStateMasked: { const: boolean };
          };
        };
      };
    };

    expect(schema.title).toBe("TestHistoryDefectMuteReplayInvariantMaterializedRead");
    expect(schema.properties.kind.const).toBe("defect-mute-replay-invariant-materialized-read");
    expect(schema.$defs.access.properties.scope.const).toBe("defects:read");
    expect(schema.$defs.access.properties.mutation.const).toBe(false);
    expect(schema.$defs.materialization.properties.readOnly.const).toBe(true);
    expect(schema.$defs.materialization.properties.rawFailurePayloadsIncluded.const).toBe(false);
    expect(schema.$defs.materialization.properties.mutationBoundary.const).toBe(
      "rest-read-only-no-worker-or-replay-mutation"
    );
    expect(schema.$defs.policy.properties.equalOrNarrowerThanRest.const).toBe(true);
    expect(schema.$defs.policy.properties.mutationAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.mcpReplayExecution.const).toBe(false);
    expect(schema.$defs.policy.properties.mcpWorkerExecution.const).toBe(false);
    expect(schema.$defs.policy.properties.materializedInvariantReadModel.const).toBe(true);
    expect(schema.$defs.policy.properties.rawFailurePayloadsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.deniedStateMasked.const).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns security audit read schema as project-scoped read-only MCP parity metadata", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 32,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: { schema: "security-audit.read" }
      }
    });

    const schema = JSON.parse(firstText(response)) as {
      title: string;
      properties: { kind: { const: string } };
      $defs: {
        access: {
          properties: {
            scope: { const: string };
            projectScoped: { const: boolean };
            mutation: { const: boolean };
          };
        };
        policy: {
          properties: {
            projectIdRequired: { const: boolean };
            equalOrNarrowerThanRest: { const: boolean };
            mutationAllowed: { const: boolean };
            rawPayloadsIncluded: { const: boolean };
          };
        };
      };
    };

    expect(schema.title).toBe("TestHistorySecurityAuditRead");
    expect(schema.properties.kind.const).toBe("security-audit-list");
    expect(schema.$defs.access.properties.scope.const).toBe("security:audit:read");
    expect(schema.$defs.access.properties.projectScoped.const).toBe(true);
    expect(schema.$defs.access.properties.mutation.const).toBe(false);
    expect(schema.$defs.policy.properties.projectIdRequired.const).toBe(true);
    expect(schema.$defs.policy.properties.equalOrNarrowerThanRest.const).toBe(true);
    expect(schema.$defs.policy.properties.mutationAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.rawPayloadsIncluded.const).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns security audit export evaluation schema as read-only provider-neutral MCP parity metadata", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 34,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: { schema: "security-audit-export.evaluate" }
      }
    });

    const schema = JSON.parse(firstText(response)) as {
      title: string;
      properties: { kind: { const: string }; execution?: unknown };
      $defs: {
        access: {
          properties: {
            scope: { const: string };
            actorScoped: { const: boolean };
            mutation: { const: boolean };
          };
        };
        policy: {
          properties: {
            providerNeutral: { const: boolean };
            mutationAllowed: { const: boolean };
            credentialReferencesIncluded: { const: boolean };
            providerRuntimeMetadataIncluded: { const: boolean };
          };
        };
      };
    };

    expect(schema.title).toBe("TestHistorySecurityAuditExportEvaluationRead");
    expect(schema.properties.kind.const).toBe("security-audit-export-policy-evaluation");
    expect(schema.properties.execution).toBeUndefined();
    expect(schema.$defs.access.properties.scope.const).toBe("security:audit:read");
    expect(schema.$defs.access.properties.actorScoped.const).toBe(true);
    expect(schema.$defs.access.properties.mutation.const).toBe(false);
    expect(schema.$defs.policy.properties.providerNeutral.const).toBe(true);
    expect(schema.$defs.policy.properties.mutationAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.credentialReferencesIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.providerRuntimeMetadataIncluded.const).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns security audit export lifecycle replay invariant schema as read-only MCP parity metadata", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 340,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: { schema: "security-audit-export.lifecycle.replay.invariants" }
      }
    });

    const schema = JSON.parse(firstText(response)) as {
      title: string;
      properties: { kind: { const: string } };
      $defs: {
        access: {
          properties: {
            scope: { const: string };
            actorScoped: { const: boolean };
            mutation: { const: boolean };
          };
        };
        execution: {
          properties: {
            exportStarted: { const: boolean };
            providerEndpointContacted: { const: boolean };
            signedUrlsIssued: { const: boolean };
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
          };
        };
      };
    };

    expect(schema.title).toBe("TestHistorySecurityAuditExportLifecycleReplayInvariantRead");
    expect(schema.properties.kind.const).toBe("security-audit-export-lifecycle-replay-invariants");
    expect(schema.$defs.access.properties.scope.const).toBe("security:audit:read");
    expect(schema.$defs.access.properties.actorScoped.const).toBe(true);
    expect(schema.$defs.access.properties.mutation.const).toBe(false);
    expect(schema.$defs.execution.properties.exportStarted.const).toBe(false);
    expect(schema.$defs.execution.properties.providerEndpointContacted.const).toBe(false);
    expect(schema.$defs.execution.properties.signedUrlsIssued.const).toBe(false);
    expect(schema.$defs.policy.properties.equalOrNarrowerThanRest.const).toBe(true);
    expect(schema.$defs.policy.properties.providerNeutral.const).toBe(true);
    expect(schema.$defs.policy.properties.mutationAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.mcpReplayExecution.const).toBe(false);
    expect(schema.$defs.policy.properties.rawLifecycleEventsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.rawRequestPayloadsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.providerEndpointsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.signedUrlsIncluded.const).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns archive status read schema as project-scoped read-only MCP parity metadata", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 33,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: { schema: "archive-status.read" }
      }
    });

    const schema = JSON.parse(firstText(response)) as {
      title: string;
      properties: { kind: { enum: string[] } };
      $defs: {
        access: {
          properties: {
            scope: { const: string };
            projectScoped: { const: boolean };
            mutation: { const: boolean };
          };
        };
        policy: {
          properties: {
            projectIdRequired: { const: boolean };
            equalOrNarrowerThanRest: { const: boolean };
            mutationAllowed: { const: boolean };
            rawPayloadsIncluded: { const: boolean };
            rawPathsIncluded: { const: boolean };
            storageKeysIncluded: { const: boolean };
            signedUrlsIncluded: { const: boolean };
            diagnosticsBounded: { const: boolean };
          };
        };
      };
    };

    expect(schema.title).toBe("TestHistoryArchiveStatusRead");
    expect(schema.properties.kind.enum).toEqual([
      "archive-upload-status-list",
      "archive-upload-status"
    ]);
    expect(schema.$defs.access.properties.scope.const).toBe("uploads:read");
    expect(schema.$defs.access.properties.projectScoped.const).toBe(true);
    expect(schema.$defs.access.properties.mutation.const).toBe(false);
    expect(schema.$defs.policy.properties.projectIdRequired.const).toBe(true);
    expect(schema.$defs.policy.properties.equalOrNarrowerThanRest.const).toBe(true);
    expect(schema.$defs.policy.properties.mutationAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.rawPayloadsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.rawPathsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.storageKeysIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.signedUrlsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.diagnosticsBounded.const).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
