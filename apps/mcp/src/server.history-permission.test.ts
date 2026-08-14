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

describe("MCP tools history-permission", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("guards attachment preview retention descriptor transcripts with scoped GET-only reads", async () => {
    const restTranscript: Array<{
      method: string;
      url: string;
      headers: Record<string, string>;
    }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      restTranscript.push({
        method: init?.method ?? "GET",
        url: input.toString(),
        headers
      });

      const launchId = input.pathname.split("/")[4] ?? "";
      const projectId = headers["X-TestHistory-Project-Scope"] ?? "";
      const actorId = headers["X-TestHistory-Actor-Id"] ?? "";
      const scheduleRead = input.pathname.endsWith("/dry-run/schedule");

      if (launchId === "launch-open") {
        return deniedResponse(
          {
            error: "launch_open",
            message: "Open launch retention reads are not represented in REST",
            token: "open-launch-preview-retention-token",
            storageKey: "launch-open/raw/preview-retention-open.log",
            signedUrl:
              "https://object.test/open?X-Amz-Signature=open-launch-preview-retention-token"
          },
          409,
          "Conflict"
        );
      }

      if (projectId !== "project-1" || actorId !== "actor-1") {
        const marker =
          projectId !== "project-1"
            ? "wrong-project-preview-retention-token"
            : "denied-preview-retention-token";
        return deniedResponse({
          error: "PermissionDeniedError",
          message: "Missing required artifact preview retention read scope",
          requiredScopes: ["artifacts:read"],
          projectId,
          actorId,
          token: marker,
          storageKey: `launch-closed/raw/preview-retention/${marker}.log`,
          signedUrl: `https://object.test/denied?X-Amz-Signature=${marker}`,
          storageRef: `storage://bucket/${marker}`
        });
      }

      if (scheduleRead) {
        return jsonResponse({
          kind: "attachment-preview-retention-dry-run-schedule",
          boundary: {
            scope: "closed-launch",
            rawMaterialReturned: true
          },
          dryRun: true,
          readOnly: true,
          deletionExecution: true,
          page: {
            limit: 2,
            cursor: null,
            offset: 0,
            returned: 1,
            total: 1,
            nextCursor: null,
            hasMore: false
          },
          summary: {
            sourceDescriptorCount: 1,
            closedLaunchDescriptorCount: 1,
            cleanupEligibleDescriptorCount: 1,
            scheduledDescriptorCount: 1,
            deleteRequestedCount: 1,
            scheduleDigest: "schedule-digest-1",
            plannedOperations: [
              "artifact.preview.retention.classify",
              "artifact.preview.retention.dry-run.schedule",
              "object.storage.delete"
            ],
            provider: "s3"
          },
          batches: [
            {
              index: 0,
              descriptorCount: 1,
              scheduledAfterMinutes: 0,
              maxCount: 250,
              descriptorRefs: [
                "preview-retention-descriptor:allowed",
                "C:\\Users\\tester\\Downloads\\schedule-token.txt"
              ],
              batchDigest: "batch-digest-1",
              deletionExecution: true,
              deleteRequestedCount: 1,
              storageKey: "launch-closed/raw/schedule/allowed-preview-retention-token.log",
              signedUrl:
                "https://object.test/schedule?X-Amz-Signature=allowed-preview-retention-token",
              providerAction: "delete-object"
            }
          ],
          diagnostics: [
            {
              code: "open-launch-descriptor-skipped",
              severity: "info",
              retryable: false,
              descriptorRef: "preview-retention-descriptor:open",
              message:
                "Skipped C:\\Users\\tester\\Downloads\\open.log token=allowed-preview-retention-token"
            }
          ],
          rawPayload: "allowed-preview-retention-token",
          providerRuntime: { storageRef: "storage://bucket/allowed-preview-retention-token" }
        });
      }

      return jsonResponse({
        kind: "attachment-preview-retention-preview",
        launch: {
          id: "launch-closed",
          projectId: "project-1",
          status: "closed",
          closedAt: "2026-05-30T00:00:00.000Z"
        },
        access: {
          scope: "artifacts:read",
          projectScoped: true,
          mutation: true,
          redacted: false
        },
        boundary: {
          scope: "closed-launch",
          eligibleLaunchStatus: "closed",
          descriptorSource: "artifact-preview-descriptor-read-model",
          rawMaterialReturned: true
        },
        execution: {
          deletionStarted: true,
          deletionMutation: true,
          providerActions: true,
          objectStorageTouched: true
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
          descriptorCount: 1,
          cleanupEligibleDescriptorCount: 1,
          retainedDescriptorCount: 0,
          preservedDescriptorCount: 0,
          evidenceDescriptorCount: 0,
          legalHoldPlaceholderCount: 0,
          invalidDescriptorCount: 0
        },
        items: [
          {
            id: "artifact-1:preview-1",
            launchId: "launch-closed",
            projectId: "project-1",
            artifactId: "artifact-1",
            previewDescriptorId: "preview-1",
            status: "cleanup_eligible",
            observedAt: "2026-05-01T00:00:00.000Z",
            evaluatedAt: "2026-05-30T12:00:00.000Z",
            cleanupEligibleAt: "2026-05-08T00:00:00.000Z",
            descriptor: {
              kind: "text",
              flavor: "log",
              support: "inline",
              status: "ready",
              reason: "eligible",
              contentType: "text/plain",
              originalBytes: 1200,
              previewBytes: 128,
              maxPreviewBytes: 4096,
              body: "Authorization: Bearer allowed-preview-retention-token",
              path: "C:\\Users\\tester\\Downloads\\preview-retention.log",
              storageKey: "launch-closed/raw/preview-retention/allowed.log",
              signedUrl:
                "https://object.test/preview?X-Amz-Signature=allowed-preview-retention-token"
            },
            retention: {
              retentionClass: "passed-short",
              policyClass: "short-lived-preview",
              auditReason: "preview retention",
              retentionHorizonDays: 7,
              cleanupEligibility: {
                eligible: true,
                reason: "preview-retention-horizon-applies"
              }
            },
            deletion: {
              planned: true,
              executed: true,
              providerAction: true
            },
            rawPayload: "allowed-preview-retention-token",
            storageRef: "storage://bucket/allowed-preview-retention-token"
          }
        ]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const beforeTools = await handle({ jsonrpc: "2.0", id: 660, method: "tools/list" });
    const beforeResources = await handle({ jsonrpc: "2.0", id: 661, method: "resources/list" });
    const allowedPreviewTool = await handle({
      jsonrpc: "2.0",
      id: 662,
      method: "tools/call",
      params: {
        name: "testhistory.attachment-preview-retention.preview",
        arguments: {
          apiUrl: "http://api.test",
          launchId: "launch-closed",
          projectId: "project-1",
          actorId: "actor-1",
          status: "cleanup_eligible",
          limit: 1,
          cursor: "1",
          batchSize: 1
        }
      }
    });
    const allowedPreviewResource = await handle({
      jsonrpc: "2.0",
      id: 663,
      method: "resources/read",
      params: {
        uri: "testhistory://launches/launch-closed/attachment-previews/retention/preview?apiUrl=http%3A%2F%2Fapi.test&projectId=project-1&actorId=actor-1&status=retained&limit=1&batchSize=1"
      }
    });
    const allowedScheduleTool = await handle({
      jsonrpc: "2.0",
      id: 664,
      method: "tools/call",
      params: {
        name: "testhistory.attachment-preview-retention.dry-run.schedule.read",
        arguments: {
          apiUrl: "http://api.test",
          launchId: "launch-closed",
          projectId: "project-1",
          actorId: "actor-1",
          scheduleDigest: "schedule-digest-1",
          limit: 2
        }
      }
    });
    const allowedScheduleResource = await handle({
      jsonrpc: "2.0",
      id: 665,
      method: "resources/read",
      params: {
        uri: "testhistory://launches/launch-closed/attachment-previews/retention/dry-run/schedule?apiUrl=http%3A%2F%2Fapi.test&projectId=project-1&actorId=actor-1&scheduleDigest=schedule-digest-1&limit=2&cursor=2"
      }
    });
    const deniedPreview = await handle({
      jsonrpc: "2.0",
      id: 666,
      method: "tools/call",
      params: {
        name: "testhistory.attachment-preview-retention.preview",
        arguments: {
          apiUrl: "http://api.test",
          launchId: "launch-closed",
          projectId: "project-1",
          actorId: "actor-denied",
          limit: 1
        }
      }
    });
    const wrongProjectSchedule = await handle({
      jsonrpc: "2.0",
      id: 667,
      method: "tools/call",
      params: {
        name: "testhistory.attachment-preview-retention.dry-run.schedule.read",
        arguments: {
          apiUrl: "http://api.test",
          launchId: "launch-closed",
          projectId: "project-other",
          actorId: "actor-1",
          limit: 1
        }
      }
    });
    const openPreview = await handle({
      jsonrpc: "2.0",
      id: 668,
      method: "resources/read",
      params: {
        uri: "testhistory://launches/launch-open/attachment-previews/retention/preview?apiUrl=http%3A%2F%2Fapi.test&projectId=project-1&actorId=actor-1&limit=1"
      }
    });
    const openSchedule = await handle({
      jsonrpc: "2.0",
      id: 669,
      method: "tools/call",
      params: {
        name: "testhistory.attachment-preview-retention.dry-run.schedule.read",
        arguments: {
          apiUrl: "http://api.test",
          launchId: "launch-open",
          projectId: "project-1",
          actorId: "actor-1",
          limit: 1
        }
      }
    });
    const mutationResponses = await Promise.all(
      [
        "testhistory.attachment-preview-retention.delete",
        "testhistory.attachment-preview-retention.execute",
        "testhistory.attachment-preview-retention.preview.write",
        "testhistory.attachment-preview-retention.dry-run.schedule.refresh",
        "testhistory.attachment-preview-retention.dry-run.schedule.delete",
        "testhistory.attachment-preview-retention.dry-run.schedule.execute",
        "testhistory.attachment-preview-retention.dry-run.schedule.materialized.write"
      ].map((name, index) =>
        handle({
          jsonrpc: "2.0",
          id: 670 + index,
          method: "tools/call",
          params: {
            name,
            arguments: {
              apiUrl: "http://api.test",
              launchId: "launch-closed",
              projectId: "project-1",
              actorId: "actor-1",
              deletionExecution: true,
              authorization: "Bearer mutation-preview-retention-token",
              signedUrl:
                "https://object.test/mutation?X-Amz-Signature=mutation-preview-retention-token",
              storageRef: "storage://bucket/mutation-preview-retention-token"
            }
          }
        })
      )
    );
    const afterTools = await handle({ jsonrpc: "2.0", id: 677, method: "tools/list" });
    const afterResources = await handle({ jsonrpc: "2.0", id: 678, method: "resources/list" });

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
    const retentionTools = beforeToolNames.filter((name) =>
      name.startsWith("testhistory.attachment-preview-retention")
    );
    const retentionResources = beforeResourceUris.filter((uri) =>
      uri.includes("/attachment-previews/retention/")
    );
    const allowedPreviewPayload = JSON.parse(firstText(allowedPreviewTool)) as {
      access: { scope: string; projectScoped: boolean; actorScoped: boolean; mutation: boolean };
      boundary: { closedLaunchScoped: boolean; rawMaterialReturned: boolean };
      execution: {
        dryRun: boolean;
        deletionMutation: boolean;
        deletionExecution: boolean;
        providerActions: boolean;
        objectStorageTouched: boolean;
        deleteRequestedCount: number;
      };
      items: Array<{
        descriptor: { body?: unknown; path?: unknown; storageKey?: unknown; signedUrl?: unknown };
        deletion: { planned: boolean; executed: boolean; providerAction: boolean };
      }>;
      dryRunPlan: { pageScoped: boolean; deleteRequestedCount: number };
      policy: {
        restParity: { method: string; path: string };
        equalOrNarrowerThanRest: boolean;
        closedLaunchScoped: boolean;
        mutationAllowed: boolean;
        deletionExecution: boolean;
        signedUrlsIncluded: boolean;
        tokensIncluded: boolean;
      };
    };
    const allowedSchedulePayload = JSON.parse(firstText(allowedScheduleTool)) as {
      access: { scope: string; projectScoped: boolean; actorScoped: boolean; mutation: boolean };
      boundary: {
        workerScheduled: boolean;
        closedLaunchScoped: boolean;
        rawMaterialReturned: boolean;
      };
      execution: {
        dryRun: boolean;
        readOnly: boolean;
        workerExecutionAllowed: boolean;
        deletionMutation: boolean;
        deletionExecution: boolean;
        providerActions: boolean;
        objectStorageTouched: boolean;
        deleteRequestedCount: number;
      };
      summary: { plannedOperations: string[]; deleteRequestedCount: number };
      batches: Array<{
        descriptorRefs: string[];
        deletionExecution: boolean;
        deleteRequestedCount: number;
        storageKey?: unknown;
        signedUrl?: unknown;
      }>;
      policy: {
        restParity: { method: string; path: string };
        equalOrNarrowerThanRest: boolean;
        descriptorOnly: boolean;
        mutationAllowed: boolean;
        refreshAllowed: boolean;
        deletionExecution: boolean;
        signedUrlsIncluded: boolean;
        tokensIncluded: boolean;
      };
    };
    const deniedPayloads = [deniedPreview, wrongProjectSchedule].map(
      (response) =>
        JSON.parse(firstText(response)) as {
          status: string;
          code: number;
          permissionDenied: {
            requiredScopes: string[];
            token?: unknown;
            storageKey?: unknown;
            signedUrl?: unknown;
            providerRuntime?: unknown;
            deletionExecution?: unknown;
          };
          policy: { restParity: { method: string }; mutationAllowed: boolean };
        }
    );
    const openPayloads = [openPreview, openSchedule].map(
      (response) =>
        JSON.parse(
          "contents" in ((response.result as Record<string, unknown>) ?? {})
            ? firstResourceText(response)
            : firstText(response)
        ) as {
          status: string;
          code: number;
          policy: {
            restParity: { method: string };
            closedLaunchScoped: boolean;
            mutationAllowed: boolean;
            deletionExecution: boolean;
          };
        }
    );
    const transcript = {
      toolsBefore: beforeToolNames,
      toolsAfter: afterToolNames,
      resourcesBefore: beforeResourceUris,
      resourcesAfter: afterResourceUris,
      allowedPreviewTool,
      allowedPreviewResource,
      allowedScheduleTool,
      allowedScheduleResource,
      deniedPreview,
      wrongProjectSchedule,
      openPreview,
      openSchedule,
      mutations: mutationResponses
    };
    const serializedTranscript = JSON.stringify(transcript);

    expect(beforeToolNames).toEqual(afterToolNames);
    expect(beforeResourceUris).toEqual(afterResourceUris);
    expect(retentionTools).toEqual([
      "testhistory.attachment-preview-retention.preview",
      "testhistory.attachment-preview-retention.dry-run.schedule.read"
    ]);
    expect(retentionResources).toEqual([
      "testhistory://launches/{launchId}/attachment-previews/retention/preview",
      "testhistory://launches/{launchId}/attachment-previews/retention/dry-run/schedule"
    ]);
    expect(beforeToolNames).not.toEqual(
      expect.arrayContaining([
        "testhistory.attachment-preview-retention.delete",
        "testhistory.attachment-preview-retention.execute",
        "testhistory.attachment-preview-retention.preview.write",
        "testhistory.attachment-preview-retention.dry-run.schedule.refresh",
        "testhistory.attachment-preview-retention.dry-run.schedule.delete",
        "testhistory.attachment-preview-retention.dry-run.schedule.execute"
      ])
    );

    expect(restTranscript).toEqual([
      {
        method: "GET",
        url: "http://api.test/api/v1/launches/launch-closed/attachment-previews/retention/preview?status=cleanup_eligible&limit=1&cursor=1",
        headers: {
          "X-TestHistory-Scopes": "artifacts:read",
          "X-TestHistory-Project-Scope": "project-1",
          "X-TestHistory-Actor-Id": "actor-1"
        }
      },
      {
        method: "GET",
        url: "http://api.test/api/v1/launches/launch-closed/attachment-previews/retention/preview?status=retained&limit=1",
        headers: {
          "X-TestHistory-Scopes": "artifacts:read",
          "X-TestHistory-Project-Scope": "project-1",
          "X-TestHistory-Actor-Id": "actor-1"
        }
      },
      {
        method: "GET",
        url: "http://api.test/api/v1/launches/launch-closed/attachment-previews/retention/dry-run/schedule?scheduleDigest=schedule-digest-1&limit=2",
        headers: {
          "X-TestHistory-Scopes": "artifacts:read",
          "X-TestHistory-Project-Scope": "project-1",
          "X-TestHistory-Actor-Id": "actor-1"
        }
      },
      {
        method: "GET",
        url: "http://api.test/api/v1/launches/launch-closed/attachment-previews/retention/dry-run/schedule?scheduleDigest=schedule-digest-1&limit=2&cursor=2",
        headers: {
          "X-TestHistory-Scopes": "artifacts:read",
          "X-TestHistory-Project-Scope": "project-1",
          "X-TestHistory-Actor-Id": "actor-1"
        }
      },
      {
        method: "GET",
        url: "http://api.test/api/v1/launches/launch-closed/attachment-previews/retention/preview?limit=1",
        headers: {
          "X-TestHistory-Scopes": "artifacts:read",
          "X-TestHistory-Project-Scope": "project-1",
          "X-TestHistory-Actor-Id": "actor-denied"
        }
      },
      {
        method: "GET",
        url: "http://api.test/api/v1/launches/launch-closed/attachment-previews/retention/dry-run/schedule?limit=1",
        headers: {
          "X-TestHistory-Scopes": "artifacts:read",
          "X-TestHistory-Project-Scope": "project-other",
          "X-TestHistory-Actor-Id": "actor-1"
        }
      },
      {
        method: "GET",
        url: "http://api.test/api/v1/launches/launch-open/attachment-previews/retention/preview?limit=1",
        headers: {
          "X-TestHistory-Scopes": "artifacts:read",
          "X-TestHistory-Project-Scope": "project-1",
          "X-TestHistory-Actor-Id": "actor-1"
        }
      },
      {
        method: "GET",
        url: "http://api.test/api/v1/launches/launch-open/attachment-previews/retention/dry-run/schedule?limit=1",
        headers: {
          "X-TestHistory-Scopes": "artifacts:read",
          "X-TestHistory-Project-Scope": "project-1",
          "X-TestHistory-Actor-Id": "actor-1"
        }
      }
    ]);
    expect(restTranscript.every((entry) => entry.method === "GET")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(8);

    expect(allowedPreviewPayload.access).toEqual({
      scope: "artifacts:read",
      projectScoped: true,
      actorScoped: true,
      mutation: false,
      redacted: true
    });
    expect(allowedPreviewPayload.boundary).toEqual(
      expect.objectContaining({ closedLaunchScoped: true, rawMaterialReturned: false })
    );
    expect(allowedPreviewPayload.execution).toEqual(
      expect.objectContaining({
        dryRun: true,
        deletionMutation: false,
        deletionExecution: false,
        providerActions: false,
        objectStorageTouched: false,
        deleteRequestedCount: 0
      })
    );
    expect(allowedPreviewPayload.items[0]?.deletion).toEqual({
      planned: false,
      executed: false,
      providerAction: false
    });
    expect(allowedPreviewPayload.items[0]?.descriptor.body).toBeUndefined();
    expect(allowedPreviewPayload.items[0]?.descriptor.path).toBeUndefined();
    expect(allowedPreviewPayload.items[0]?.descriptor.storageKey).toBeUndefined();
    expect(allowedPreviewPayload.items[0]?.descriptor.signedUrl).toBeUndefined();
    expect(allowedPreviewPayload.dryRunPlan).toEqual(
      expect.objectContaining({ pageScoped: true, deleteRequestedCount: 0 })
    );
    expect(allowedPreviewPayload.policy).toEqual(
      expect.objectContaining({
        restParity: {
          method: "GET",
          path: "/api/v1/launches/{launchId}/attachment-previews/retention/preview"
        },
        equalOrNarrowerThanRest: true,
        closedLaunchScoped: true,
        mutationAllowed: false,
        deletionExecution: false,
        signedUrlsIncluded: false,
        tokensIncluded: false
      })
    );
    expect(JSON.parse(firstResourceText(allowedPreviewResource))).toEqual(
      expect.objectContaining({
        kind: "attachment-preview-retention-dry-run-preview",
        policy: expect.objectContaining({ equalOrNarrowerThanRest: true })
      })
    );

    expect(allowedSchedulePayload.access).toEqual({
      scope: "artifacts:read",
      projectScoped: true,
      actorScoped: true,
      mutation: false,
      redacted: true
    });
    expect(allowedSchedulePayload.boundary).toEqual(
      expect.objectContaining({
        workerScheduled: false,
        closedLaunchScoped: true,
        descriptorSource: "artifact-schedule-descriptor-read-model",
        rawMaterialReturned: false
      })
    );
    expect(allowedSchedulePayload.execution).toEqual(
      expect.objectContaining({
        dryRun: true,
        readOnly: true,
        workerExecutionAllowed: false,
        deletionMutation: false,
        deletionExecution: false,
        providerActions: false,
        objectStorageTouched: false,
        deleteRequestedCount: 0
      })
    );
    expect(allowedSchedulePayload.summary).toEqual(
      expect.objectContaining({
        plannedOperations: [
          "artifact.preview.retention.classify",
          "artifact.preview.retention.dry-run.schedule"
        ],
        deleteRequestedCount: 0
      })
    );
    expect(allowedSchedulePayload.batches[0]).toEqual(
      expect.objectContaining({
        descriptorRefs: ["preview-retention-descriptor:allowed"],
        deletionExecution: false,
        deleteRequestedCount: 0
      })
    );
    expect(allowedSchedulePayload.batches[0]?.storageKey).toBeUndefined();
    expect(allowedSchedulePayload.batches[0]?.signedUrl).toBeUndefined();
    expect(allowedSchedulePayload.policy).toEqual(
      expect.objectContaining({
        restParity: {
          method: "GET",
          path: "/api/v1/launches/{launchId}/attachment-previews/retention/dry-run/schedule"
        },
        equalOrNarrowerThanRest: true,
        descriptorOnly: true,
        mutationAllowed: false,
        refreshAllowed: false,
        deletionExecution: false,
        signedUrlsIncluded: false,
        tokensIncluded: false
      })
    );
    expect(JSON.parse(firstResourceText(allowedScheduleResource))).toEqual(
      expect.objectContaining({
        kind: "attachment-preview-retention-dry-run-schedule",
        policy: expect.objectContaining({ equalOrNarrowerThanRest: true })
      })
    );

    for (const deniedPayload of deniedPayloads) {
      expect(deniedPayload).toEqual(
        expect.objectContaining({
          status: "error",
          code: 403,
          permissionDenied: expect.objectContaining({
            requiredScopes: ["artifacts:read"],
            token: "[redacted]"
          }),
          policy: expect.objectContaining({
            restParity: expect.objectContaining({ method: "GET" }),
            mutationAllowed: false
          })
        })
      );
      expect(deniedPayload.permissionDenied.storageKey).toBeUndefined();
      expect(deniedPayload.permissionDenied.signedUrl).toBeUndefined();
      expect(deniedPayload.permissionDenied.providerRuntime).toBeUndefined();
      expect(deniedPayload.permissionDenied.deletionExecution).toBeUndefined();
    }
    for (const openPayload of openPayloads) {
      expect(openPayload).toEqual(
        expect.objectContaining({
          status: "error",
          code: 409,
          policy: expect.objectContaining({
            restParity: expect.objectContaining({ method: "GET" }),
            closedLaunchScoped: true,
            mutationAllowed: false,
            deletionExecution: false
          })
        })
      );
    }
    expect(mutationResponses.map((response) => response.error)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Unknown tool: testhistory.attachment-preview-retention.delete"
        }),
        expect.objectContaining({
          message: "Unknown tool: testhistory.attachment-preview-retention.execute"
        }),
        expect.objectContaining({
          message: "Unknown tool: testhistory.attachment-preview-retention.preview.write"
        }),
        expect.objectContaining({
          message: "Unknown tool: testhistory.attachment-preview-retention.dry-run.schedule.refresh"
        }),
        expect.objectContaining({
          message: "Unknown tool: testhistory.attachment-preview-retention.dry-run.schedule.delete"
        }),
        expect.objectContaining({
          message: "Unknown tool: testhistory.attachment-preview-retention.dry-run.schedule.execute"
        }),
        expect.objectContaining({
          message:
            "Unknown tool: testhistory.attachment-preview-retention.dry-run.schedule.materialized.write"
        })
      ])
    );
    expectNoAttachmentPreviewRetentionSensitiveTranscriptLeak(serializedTranscript);
  });

  it("routes resource reads for projects, cases, gates, and defects through REST", async () => {
    const fetchedUrls: URL[] = [];
    const fetchMock = vi.fn(async (input: URL) => {
      fetchedUrls.push(input);
      if (input.pathname === "/api/v1/launches/launch-1") {
        return jsonResponse({ id: "launch-1", status: "closed", results: [] });
      }
      if (input.pathname === "/api/v1/test-cases/case-1") {
        return jsonResponse({ id: "case-1", history: [] });
      }
      return jsonResponse([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    for (const uri of [
      "testhistory://projects?apiUrl=http%3A%2F%2Fapi.test",
      "testhistory://projects/project-1/launches?apiUrl=http%3A%2F%2Fapi.test&status=closed",
      "testhistory://launches/launch-1/results?apiUrl=http%3A%2F%2Fapi.test",
      "testhistory://test-cases?apiUrl=http%3A%2F%2Fapi.test&projectId=project-1",
      "testhistory://test-cases/case-1?apiUrl=http%3A%2F%2Fapi.test&projectId=project-1",
      "testhistory://test-cases/case-1/history?apiUrl=http%3A%2F%2Fapi.test&projectId=project-1",
      "testhistory://test-cases/case-1/history/compare?apiUrl=http%3A%2F%2Fapi.test&projectId=project-1&baseResultUuid=result-1&targetResultUuid=result-2&actorId=actor-1&limit=1",
      "testhistory://test-cases/case-1/history/compare/permission-audit?apiUrl=http%3A%2F%2Fapi.test&projectId=project-1&baseResultUuid=result-1&targetResultUuid=result-2&actorId=actor-1&limit=1",
      "testhistory://launches/launch-1/quality-gate?apiUrl=http%3A%2F%2Fapi.test",
      "testhistory://launches/launch-1/quality-gate/mute-effects?apiUrl=http%3A%2F%2Fapi.test",
      "testhistory://defect-mutes?apiUrl=http%3A%2F%2Fapi.test&projectId=project-1",
      "testhistory://projects/project-1/defect-mutes/projection?apiUrl=http%3A%2F%2Fapi.test&actorId=actor-1&launchId=launch-1&status=active&limit=1",
      "testhistory://projects/project-1/defect-mutes/projection/replay?apiUrl=http%3A%2F%2Fapi.test&actorId=actor-1&launchId=launch-1&status=inactive&limit=2&cursor=2",
      "testhistory://projects/project-1/defect-mutes/projection/replay/invariants?apiUrl=http%3A%2F%2Fapi.test&actorId=actor-1&limit=2&cursor=2",
      "testhistory://security/audit?apiUrl=http%3A%2F%2Fapi.test&projectId=project-1&limit=1",
      "testhistory://launches/launch-1/uploads/archive/status?apiUrl=http%3A%2F%2Fapi.test&projectId=project-1&actorId=actor-1&limit=1&diagnosticsLimit=2",
      "testhistory://launches/launch-1/archive/diagnostics/replay?apiUrl=http%3A%2F%2Fapi.test&projectId=project-1&actorId=actor-1&archiveRef=archive%3Aupload-1&limit=1",
      "testhistory://projects/project-1/archive/diagnostics/replay/fixtures?apiUrl=http%3A%2F%2Fapi.test&actorId=actor-1&limit=2&cursor=2",
      "testhistory://uploads/upload-1/archive/status?apiUrl=http%3A%2F%2Fapi.test&projectId=project-1&diagnosticsLimit=2&diagnosticsCursor=2",
      "testhistory://defects?apiUrl=http%3A%2F%2Fapi.test"
    ]) {
      await handle({
        jsonrpc: "2.0",
        id: 36,
        method: "resources/read",
        params: { uri }
      });
    }

    expect(fetchedUrls.map((url) => url.toString())).toEqual([
      "http://api.test/api/v1/projects",
      "http://api.test/api/v1/projects/project-1/launches?status=closed",
      "http://api.test/api/v1/launches/launch-1",
      "http://api.test/api/v1/test-cases?projectId=project-1",
      "http://api.test/api/v1/test-cases/case-1?projectId=project-1",
      "http://api.test/api/v1/test-cases/case-1/history?projectId=project-1&limit=20",
      "http://api.test/api/v1/test-cases/case-1/history/compare?projectId=project-1&baseResultUuid=result-1&targetResultUuid=result-2&limit=1",
      "http://api.test/api/v1/test-cases/case-1/history/compare/permission-audit?projectId=project-1&baseResultUuid=result-1&targetResultUuid=result-2&limit=1",
      "http://api.test/api/v1/launches/launch-1/quality-gate",
      "http://api.test/api/v1/launches/launch-1/quality-gate",
      "http://api.test/api/v1/defects?projectId=project-1",
      "http://api.test/api/v1/projects/project-1/defect-mutes/projection?actorId=actor-1&launchId=launch-1&status=active&limit=1",
      "http://api.test/api/v1/projects/project-1/defect-mutes/projection?actorId=actor-1&launchId=launch-1&status=inactive&limit=2&cursor=2",
      "http://api.test/api/v1/projects/project-1/defect-mutes/projection/replay/invariants?actorId=actor-1&limit=2&cursor=2",
      "http://api.test/api/v1/security/audit?projectId=project-1&limit=1",
      "http://api.test/api/v1/launches/launch-1/uploads/archive/status?limit=1&diagnosticsLimit=2",
      "http://api.test/api/v1/launches/launch-1/archive/diagnostics/replay?archiveRef=archive%3Aupload-1&limit=1",
      "http://api.test/api/v1/projects/project-1/archive/diagnostics/replay/fixtures?limit=2&cursor=2",
      "http://api.test/api/v1/uploads/upload-1/archive/status?limit=2&cursor=2",
      "http://api.test/api/v1/defects"
    ]);
  });

  it("reads defect mute status as equal-or-narrower MCP metadata without raw failure leakage", async () => {
    const fetchedUrls: URL[] = [];
    const fetchMock = vi.fn(async (input: URL) => {
      fetchedUrls.push(input);
      return jsonResponse([
        {
          id: "defect-1",
          projectId: "project-1",
          testCaseId: "case-muted",
          status: "open",
          muted: true,
          raw: { failure: "raw-failure-payload" },
          payload: "raw-payload",
          trace: "authorization: Bearer synthetic-token",
          activeMute: {
            id: "mute-1",
            status: "active",
            scope: { testCaseIds: ["case-muted"], signatureHashes: ["signature-muted"] },
            reason: "Muted while token=synthetic-token is investigated",
            origin: { type: "actor", actorId: "qa-agent" },
            mutedAt: "2026-05-30T10:00:00.000Z",
            affectedSignatureHashes: ["signature-muted"],
            affectedTestIds: ["case-muted"],
            storageKey: "project-1/defects/mute-1",
            auditEvents: [
              {
                id: "event-1",
                type: "defect.muted",
                muteId: "mute-1",
                occurredAt: "2026-05-30T10:00:00.000Z",
                origin: { type: "actor", actorId: "qa-agent" },
                scope: { testCaseIds: ["case-muted"] },
                reason: "operator note password=synthetic-hidden",
                affectedSignatureHashes: ["signature-muted"],
                affectedTestIds: ["case-muted"],
                raw: "raw-event-payload"
              }
            ]
          },
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
              explanation: "reduced after secret=synthetic-secret"
            }
          ]
        }
      ]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 50,
      method: "tools/call",
      params: {
        name: "testhistory.defect-mutes.find",
        arguments: { apiUrl: "http://api.test", projectId: "project-1", limit: 1 }
      }
    });

    const payload = JSON.parse(firstText(response)) as {
      kind: string;
      scope: { projectId: string };
      defects: Array<{
        id: string;
        muted: boolean;
        activeMute: { reason: string; storageKey?: string; auditEvents: Array<{ reason: string }> };
        effects: Array<{ explanation: string; raw?: unknown }>;
        raw?: unknown;
        payload?: unknown;
        trace?: unknown;
      }>;
      policy: {
        equalOrNarrowerThanRest: boolean;
        mutationAllowed: boolean;
        rawFailurePayloadsIncluded: boolean;
      };
    };
    const serialized = firstText(response);

    expect(fetchedUrls[0]?.toString()).toBe("http://api.test/api/v1/defects?projectId=project-1");
    expect(payload.kind).toBe("defect-mute-status");
    expect(payload.scope.projectId).toBe("project-1");
    expect(payload.defects[0]?.id).toBe("defect-1");
    expect(payload.defects[0]?.muted).toBe(true);
    expect(payload.defects[0]?.activeMute.reason).toBe("[redacted]");
    expect(payload.defects[0]?.activeMute.auditEvents[0]?.reason).toBe("[redacted]");
    expect(payload.defects[0]?.activeMute.storageKey).toBeUndefined();
    expect(payload.defects[0]?.effects[0]?.explanation).toBe("[redacted]");
    expect(payload.defects[0]?.raw).toBeUndefined();
    expect(payload.defects[0]?.payload).toBeUndefined();
    expect(payload.defects[0]?.trace).toBeUndefined();
    expect(payload.policy).toEqual(
      expect.objectContaining({
        equalOrNarrowerThanRest: true,
        mutationAllowed: false,
        rawFailurePayloadsIncluded: false
      })
    );
    expect(serialized).not.toContain("synthetic-token");
    expect(serialized).not.toContain("synthetic-hidden");
    expect(serialized).not.toContain("synthetic-secret");
    expect(serialized).not.toContain("raw-failure-payload");
    expect(serialized).not.toContain("raw-payload");
    expect(serialized).not.toContain("raw-event-payload");
    expect(serialized).not.toContain("storageKey");
  });

  it("requires project scope for defect mute status reads", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const toolResponse = await handle({
      jsonrpc: "2.0",
      id: 52,
      method: "tools/call",
      params: {
        name: "testhistory.defect-mutes.find",
        arguments: { apiUrl: "http://api.test" }
      }
    });
    const resourceResponse = await handle({
      jsonrpc: "2.0",
      id: 53,
      method: "resources/read",
      params: {
        uri: "testhistory://defect-mutes?apiUrl=http%3A%2F%2Fapi.test"
      }
    });

    expect(toolResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "projectId is required for defect mute status reads"
      })
    );
    expect(resourceResponse.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "projectId is required for defect mute status reads"
      })
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
