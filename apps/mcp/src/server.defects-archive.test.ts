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

describe("MCP tools defects-archive", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads paged attachment preview resources without raw blobs or storage leakage", async () => {
    const fetchedUrls: URL[] = [];
    const fetchMock = vi.fn(async (input: URL) => {
      fetchedUrls.push(input);
      return jsonResponse({
        launchId: "launch-1",
        projectId: "project-1",
        uuid: "result-1",
        name: "checkout",
        status: "failed",
        attachments: [
          {
            id: "attachment-1",
            artifactId: "artifact-1",
            name: "execution.log",
            contentType: "text/plain",
            originalBytes: 2048,
            sha256: "a".repeat(64),
            path: "C:\\Users\\tester\\Downloads\\allure-results\\execution.log",
            source: "execution.log",
            storageKey: "project-1/launch-1/result-1/execution.log",
            content: "raw-blob synthetic-token",
            payload: "raw-blob",
            metadata: {
              parameters: [
                { name: "browser", value: "chromium" },
                { name: "token", value: "synthetic-token", mode: "masked" },
                { name: "password", value: "synthetic-hidden", mode: "hidden" }
              ],
              signedUrl: "https://object-store.test/file?X-Amz-Signature=abcdef"
            },
            preview: {
              id: "preview-1",
              artifactId: "artifact-1",
              kind: "text",
              flavor: "log",
              status: "ready",
              reason: "eligible",
              originalBytes: 2048,
              previewBytes: 190,
              maxPreviewBytes: 4096,
              contentType: "text/plain",
              sha256: "a".repeat(64),
              body: {
                type: "redacted-text",
                encoding: "utf8",
                value:
                  "authorization: Bearer synthetic-token\nfile=C:\\Users\\tester\\secret.log\nsafe tail",
                lineCount: 3,
                truncated: false,
                redacted: false
              },
              safety: {
                descriptorVersion: 1,
                bounded: true,
                pathIncluded: true,
                storageKeyIncluded: true,
                rawPayloadIncluded: true,
                redactionApplied: false
              }
            }
          },
          {
            id: "attachment-2",
            artifactId: "artifact-2",
            name: "screen.png",
            contentType: "image/png",
            originalBytes: 1024,
            preview: {
              id: "preview-2",
              artifactId: "artifact-2",
              kind: "image",
              flavor: "image",
              status: "metadata-only",
              reason: "image-metadata-only",
              originalBytes: 1024,
              previewBytes: 0,
              maxPreviewBytes: 4096,
              contentType: "image/png",
              sha256: "b".repeat(64),
              body: {
                type: "image-metadata",
                mediaType: "image/png",
                inline: true,
                downloadRequired: false,
                signedUrl: "https://object-store.test/screen.png?token=synthetic-token"
              },
              safety: {
                descriptorVersion: 1,
                bounded: true,
                pathIncluded: false,
                storageKeyIncluded: false,
                rawPayloadIncluded: false,
                redactionApplied: false
              }
            }
          },
          {
            id: "attachment-3",
            artifactId: "artifact-3",
            name: "heap.bin",
            contentType: "application/octet-stream",
            payload: "raw-blob-third"
          }
        ]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 49,
      method: "resources/read",
      params: {
        uri: "testhistory://launches/launch-1/results/result-1/attachments?apiUrl=http%3A%2F%2Fapi.test&limit=2"
      }
    });

    const payload = JSON.parse(firstResourceText(response)) as {
      kind: string;
      page: { limit: number; returned: number; total: number; nextCursor: string };
      attachments: Array<{
        id: string;
        path?: string;
        source?: string;
        storageKey?: string;
        content?: string;
        payload?: string;
        metadata?: {
          parameters: Array<{ name: string; value?: string; mode?: string; redacted?: boolean }>;
        };
        preview: {
          body: { type: string; value?: string; inline?: boolean; downloadRequired?: boolean };
          safety: {
            pathIncluded: boolean;
            storageKeyIncluded: boolean;
            rawPayloadIncluded: boolean;
            redactionApplied: boolean;
          };
        };
      }>;
      policy: { equalOrNarrowerThanRest: boolean; pageLimited: boolean };
    };
    const serialized = firstResourceText(response);

    expect(fetchedUrls[0]?.toString()).toBe(
      "http://api.test/api/v1/launches/launch-1/results/result-1"
    );
    expect(payload.kind).toBe("attachment-previews");
    expect(payload.page).toEqual(
      expect.objectContaining({ limit: 2, returned: 2, total: 3, nextCursor: "2" })
    );
    expect(payload.policy).toEqual(
      expect.objectContaining({ equalOrNarrowerThanRest: true, pageLimited: true })
    );
    expect(payload.attachments).toHaveLength(2);
    expect(payload.attachments[0]?.metadata?.parameters).toEqual([
      { name: "browser", value: "chromium" },
      { name: "token", value: "***", mode: "masked", redacted: true },
      { name: "password", mode: "hidden", redacted: true }
    ]);
    expect(payload.attachments[0]?.preview.safety).toEqual(
      expect.objectContaining({
        pathIncluded: false,
        storageKeyIncluded: false,
        rawPayloadIncluded: false,
        redactionApplied: true
      })
    );
    expect(payload.attachments[0]?.preview.body.value).toContain("[REDACTED]");
    expect(payload.attachments[0]?.path).toBeUndefined();
    expect(payload.attachments[0]?.source).toBeUndefined();
    expect(payload.attachments[0]?.storageKey).toBeUndefined();
    expect(payload.attachments[0]?.content).toBeUndefined();
    expect(payload.attachments[0]?.payload).toBeUndefined();
    expect(payload.attachments[1]?.preview.body).toEqual(
      expect.objectContaining({
        type: "image-metadata",
        inline: false,
        downloadRequired: true
      })
    );
    expect(serialized).not.toContain("synthetic-token");
    expect(serialized).not.toContain("synthetic-hidden");
    expect(serialized).not.toContain("C:\\Users");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("project-1/launch-1/result-1/execution.log");
    expect(serialized).not.toContain("raw-blob");
    expect(serialized).not.toContain("raw-blob-third");
  });

  it("reads attachment preview retention dry-run previews through REST with scope headers and pagination", async () => {
    const fetched: Array<{ url: URL; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetched.push(init === undefined ? { url: input } : { url: input, init });
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
          mutation: false,
          redacted: true
        },
        execution: {
          deletionStarted: false,
          deletionMutation: false,
          providerActions: false,
          objectStorageTouched: false
        },
        boundary: {
          scope: "closed-launch",
          eligibleLaunchStatus: "closed",
          descriptorSource: "artifact-preview-descriptor-read-model",
          rawMaterialReturned: false
        },
        page: {
          limit: 2,
          cursor: null,
          offset: 0,
          returned: 2,
          total: 3,
          nextCursor: "2",
          hasMore: true
        },
        summary: {
          descriptorCount: 3,
          cleanupEligibleDescriptorCount: 2,
          retainedDescriptorCount: 1,
          preservedDescriptorCount: 0,
          evidenceDescriptorCount: 1,
          legalHoldPlaceholderCount: 0,
          invalidDescriptorCount: 0
        },
        items: [
          {
            id: "eligible-preview-artifact:preview-1",
            launchId: "launch-closed",
            projectId: "project-1",
            artifactId: "eligible-preview-artifact",
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
              originalBytes: 1000,
              previewBytes: 80,
              maxPreviewBytes: 4096,
              body: "token=preview-retention-secret",
              path: "C:\\Users\\tester\\Downloads\\synthetic-results\\secret.log",
              storageKey: "launch-closed/raw/preview-retention-secret.log",
              signedUrl: "https://object.test/file?token=preview-retention-secret"
            },
            retention: {
              retentionClass: "passed-short",
              policyClass: "short-lived-preview",
              auditReason: "preview retention",
              retentionHorizonDays: 7,
              cleanupEligibility: {
                eligible: true,
                reason: "preview-retention-horizon-applies"
              },
              horizon: {
                startsAt: "2026-05-01T00:00:00.000Z",
                endsAt: "2026-05-08T00:00:00.000Z",
                basis: "observedAt"
              }
            },
            evidencePreserved: false,
            legalHoldPlaceholder: false,
            deletion: {
              planned: true,
              executed: true,
              providerAction: true
            },
            raw: "preview-retention-secret",
            storageKey: "launch-closed/raw/item-secret.log"
          },
          {
            id: "retained-preview-artifact:preview-2",
            launchId: "launch-closed",
            projectId: "project-1",
            artifactId: "retained-preview-artifact",
            previewDescriptorId: "preview-2",
            status: "retained",
            observedAt: "2026-05-20T00:00:00.000Z",
            evaluatedAt: "2026-05-30T12:00:00.000Z",
            cleanupEligibleAt: "2026-08-18T00:00:00.000Z",
            descriptor: {
              kind: "text",
              flavor: "log",
              support: "inline",
              status: "ready",
              reason: "eligible",
              previewBytes: 120
            },
            retention: {
              retentionClass: "failure-diagnostic",
              policyClass: "evidence-retained",
              retentionHorizonDays: 90,
              cleanupEligibility: { eligible: true, reason: "failure-diagnostic-evidence" }
            },
            evidencePreserved: true,
            legalHoldPlaceholder: false
          }
        ]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const toolResponse = await handle({
      jsonrpc: "2.0",
      id: 47,
      method: "tools/call",
      params: {
        name: "testhistory.attachment-preview-retention.preview",
        arguments: {
          apiUrl: "http://api.test",
          launchId: "launch-closed",
          projectId: "project-1",
          actorId: "actor-1",
          status: "cleanup_eligible",
          limit: 2,
          batchSize: 1
        }
      }
    });
    const resourceResponse = await handle({
      jsonrpc: "2.0",
      id: 48,
      method: "resources/read",
      params: {
        uri: "testhistory://launches/launch-closed/attachment-previews/retention/preview?apiUrl=http%3A%2F%2Fapi.test&projectId=project-1&actorId=actor-1&status=cleanup_eligible&limit=2&batchSize=1"
      }
    });

    const payload = JSON.parse(firstText(toolResponse)) as {
      kind: string;
      scope: { projectId: string; launchId: string; actorId: string };
      access: { scope: string; mutation: boolean; actorScoped: boolean };
      boundary: { closedLaunchScoped: boolean; eligibleLaunchStatus: string };
      execution: {
        dryRun: boolean;
        deletionStarted: boolean;
        deletionMutation: boolean;
        deletionExecution: boolean;
        providerActions: boolean;
        objectStorageTouched: boolean;
        deleteRequestedCount: number;
      };
      page: { limit: number; returned: number; total: number; nextCursor: string };
      dryRunPlan: {
        pageScoped: boolean;
        candidateCount: number;
        batchSize: number;
        batchCount: number;
        totalCandidateBytes: number;
        deleteRequestedCount: number;
        batches: Array<{
          candidateCount: number;
          candidateRefs: string[];
          deletionExecution: boolean;
        }>;
      };
      items: Array<{
        status: string;
        deletion: { planned: boolean; executed: boolean; providerAction: boolean };
      }>;
      policy: {
        equalOrNarrowerThanRest: boolean;
        mutationAllowed: boolean;
        deletionExecution: boolean;
        providerActions: boolean;
        pathsIncluded: boolean;
        storageLocationsIncluded: boolean;
        signedUrlsIncluded: boolean;
        tokensIncluded: boolean;
      };
    };
    const serialized = firstText(toolResponse);

    expect(fetched[0]?.url.toString()).toBe(
      "http://api.test/api/v1/launches/launch-closed/attachment-previews/retention/preview?status=cleanup_eligible&limit=2"
    );
    expect(fetched[0]?.init?.headers).toEqual({
      "X-TestHistory-Scopes": "artifacts:read",
      "X-TestHistory-Project-Scope": "project-1",
      "X-TestHistory-Actor-Id": "actor-1"
    });
    expect(payload.kind).toBe("attachment-preview-retention-dry-run-preview");
    expect(payload.scope).toEqual({
      projectId: "project-1",
      launchId: "launch-closed",
      actorId: "actor-1"
    });
    expect(payload.access).toEqual(
      expect.objectContaining({ scope: "artifacts:read", mutation: false, actorScoped: true })
    );
    expect(payload.boundary).toEqual(
      expect.objectContaining({ closedLaunchScoped: true, eligibleLaunchStatus: "closed" })
    );
    expect(payload.execution).toEqual(
      expect.objectContaining({
        dryRun: true,
        deletionStarted: false,
        deletionMutation: false,
        deletionExecution: false,
        providerActions: false,
        objectStorageTouched: false,
        deleteRequestedCount: 0
      })
    );
    expect(payload.page).toEqual(
      expect.objectContaining({ limit: 2, returned: 2, total: 3, nextCursor: "2" })
    );
    expect(payload.dryRunPlan).toEqual(
      expect.objectContaining({
        pageScoped: true,
        candidateCount: 1,
        batchSize: 1,
        batchCount: 1,
        totalCandidateBytes: 80,
        deleteRequestedCount: 0
      })
    );
    expect(payload.dryRunPlan.batches[0]).toEqual(
      expect.objectContaining({
        candidateCount: 1,
        candidateRefs: [expect.stringMatching(/^preview-retention-candidate:/)],
        deletionExecution: false
      })
    );
    expect(payload.items[0]?.deletion).toEqual({
      planned: false,
      executed: false,
      providerAction: false
    });
    expect(payload.policy).toEqual(
      expect.objectContaining({
        equalOrNarrowerThanRest: true,
        mutationAllowed: false,
        deletionExecution: false,
        providerActions: false,
        pathsIncluded: false,
        storageLocationsIncluded: false,
        signedUrlsIncluded: false,
        tokensIncluded: false
      })
    );
    expect(JSON.parse(firstResourceText(resourceResponse))).toEqual(
      expect.objectContaining({
        kind: "attachment-preview-retention-dry-run-preview",
        dryRunPlan: expect.objectContaining({ deleteRequestedCount: 0 })
      })
    );
    expect(serialized).not.toContain("preview-retention-secret");
    expect(serialized).not.toContain("Downloads");
    expect(serialized).not.toContain("allure-results");
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain('"signedUrl":');
    expect(serialized).not.toContain("https://object.test");
    expect(serialized).not.toContain('"raw"');
  });

  it("preserves denied attachment preview retention shape and does not advertise deletion tools", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        deniedResponse({
          error: "PermissionDeniedError",
          message: "Missing required artifact preview retention read scope",
          requiredScopes: ["artifacts:read"],
          projectId: "project-1",
          token: "synthetic-token",
          storageKey: "launch-closed/raw/secret.log"
        })
      )
    );

    const deniedRead = await handle({
      jsonrpc: "2.0",
      id: 50,
      method: "tools/call",
      params: {
        name: "testhistory.attachment-preview-retention.preview",
        arguments: {
          apiUrl: "http://api.test",
          launchId: "launch-closed",
          projectId: "project-1"
        }
      }
    });
    const missingScope = await handle({
      jsonrpc: "2.0",
      id: 51,
      method: "tools/call",
      params: {
        name: "testhistory.attachment-preview-retention.preview",
        arguments: { launchId: "launch-closed" }
      }
    });
    const deleteTool = await handle({
      jsonrpc: "2.0",
      id: 52,
      method: "tools/call",
      params: {
        name: "testhistory.attachment-preview-retention.delete",
        arguments: { launchId: "launch-closed", projectId: "project-1" }
      }
    });
    const executeTool = await handle({
      jsonrpc: "2.0",
      id: 53,
      method: "tools/call",
      params: {
        name: "testhistory.attachment-preview-retention.execute",
        arguments: { launchId: "launch-closed", projectId: "project-1" }
      }
    });

    const payload = JSON.parse(firstText(deniedRead)) as {
      status: string;
      code: number;
      permissionDenied: { error: string; requiredScopes: string[]; token?: string };
      policy: {
        mutationAllowed: boolean;
        deletionExecution: boolean;
        providerActions: boolean;
      };
    };

    expect(payload.status).toBe("error");
    expect(payload.code).toBe(403);
    expect(payload.permissionDenied).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        requiredScopes: ["artifacts:read"],
        token: "[redacted]"
      })
    );
    expect(payload.policy).toEqual(
      expect.objectContaining({
        mutationAllowed: false,
        deletionExecution: false,
        providerActions: false
      })
    );
    expect(missingScope.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "projectId is required for attachment preview retention reads"
      })
    );
    expect(deleteTool.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "Unknown tool: testhistory.attachment-preview-retention.delete"
      })
    );
    expect(executeTool.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "Unknown tool: testhistory.attachment-preview-retention.execute"
      })
    );
    expect(firstText(deniedRead)).not.toContain("synthetic-token");
    expect(firstText(deniedRead)).not.toContain("storageKey");
    expect(firstText(deniedRead)).not.toContain("raw/secret");
  });

  it("reads worker-scheduled attachment preview retention dry-run schedules through REST", async () => {
    const fetched: Array<{ url: URL; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: URL, init?: RequestInit) => {
      fetched.push(init === undefined ? { url: input } : { url: input, init });
      return jsonResponse({
        kind: "attachment-preview-retention-dry-run-schedule",
        boundary: {
          scope: "closed-launch",
          workerScheduled: false,
          closedLaunchScoped: true,
          descriptorSource: "artifact-schedule-descriptor-read-model",
          rawMaterialReturned: false
        },
        consistency: "retry-safe-idempotent-descriptor-schedule",
        scope: "closed-launches",
        dryRun: true,
        readOnly: true,
        deletionExecution: true,
        deleteRequestedCount: 5,
        page: {
          limit: 2,
          cursor: null,
          offset: 0,
          returned: 2,
          total: 3,
          nextCursor: "2",
          hasMore: true
        },
        summary: {
          sourceDescriptorCount: 6,
          closedLaunchDescriptorCount: 4,
          skippedOpenLaunchDescriptorCount: 1,
          missingLaunchScopeDescriptorCount: 1,
          cleanupEligibleDescriptorCount: 3,
          scheduledDescriptorCount: 3,
          retainedDescriptorCount: 1,
          invalidDescriptorCount: 0,
          duplicateDescriptorCount: 1,
          omittedDiagnosticCount: 2,
          deleteRequestedCount: 5,
          scheduleDigest: "schedule-digest-1",
          projectionDigest: "projection-digest-1",
          plannedOperations: [
            "artifact.preview.retention.classify",
            "artifact.preview.retention.dry-run.schedule",
            "object.storage.delete"
          ],
          provider: "s3"
        },
        transitions: [
          { state: "preview_retention_schedule_requested", at: "2026-05-30T12:00:00.000Z" },
          {
            state: "preview_retention_dry_run_batches_scheduled",
            at: "2026-05-30T12:00:00.000Z"
          }
        ],
        batches: [
          {
            index: 0,
            descriptorCount: 2,
            scheduledAfterMinutes: 0,
            maxCount: 250,
            descriptorRefs: [
              "preview-retention-descriptor:one",
              "C:\\Users\\tester\\Downloads\\synthetic-results\\schedule-secret.txt"
            ],
            omittedDescriptorRefCount: 0,
            batchDigest: "batch-digest-1",
            deletionExecution: true,
            deleteRequestedCount: 2,
            storageKey: "launch-closed/raw/schedule-secret.log",
            signedUrl: "https://object.test/file?X-Amz-Signature=schedule-secret",
            providerAction: "delete-object"
          },
          {
            index: 1,
            descriptorCount: 1,
            scheduledAfterMinutes: 5,
            maxCount: 250,
            descriptorRefs: ["preview-retention-descriptor:two"],
            omittedDescriptorRefCount: 0,
            batchDigest: "batch-digest-2",
            deletionExecution: true,
            deleteRequestedCount: 1
          }
        ],
        diagnostics: [
          {
            code: "open-launch-descriptor-skipped",
            severity: "info",
            retryable: false,
            descriptorRef: "preview-retention-descriptor:open",
            message:
              "Skipped C:\\Users\\tester\\Downloads\\synthetic-results\\open.log token=schedule-secret"
          }
        ],
        rawPayload: "schedule-secret",
        providerRuntime: { storageRef: "storage://bucket/schedule-secret" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const toolResponse = await handle({
      jsonrpc: "2.0",
      id: 54,
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
    const resourceResponse = await handle({
      jsonrpc: "2.0",
      id: 55,
      method: "resources/read",
      params: {
        uri: "testhistory://launches/launch-closed/attachment-previews/retention/dry-run/schedule?apiUrl=http%3A%2F%2Fapi.test&projectId=project-1&actorId=actor-1&scheduleDigest=schedule-digest-1&limit=2"
      }
    });

    const payload = JSON.parse(firstText(toolResponse)) as {
      kind: string;
      scope: { projectId: string; launchId: string; actorId: string };
      access: { scope: string; mutation: boolean; actorScoped: boolean };
      boundary: {
        workerScheduled: boolean;
        closedLaunchScoped: boolean;
        descriptorSource: string;
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
      page: { limit: number; returned: number; total: number; nextCursor: string };
      summary: {
        scheduledDescriptorCount: number;
        deleteRequestedCount: number;
        plannedOperations: string[];
      };
      batches: Array<{
        descriptorRefs: string[];
        deletionExecution: boolean;
        deleteRequestedCount: number;
      }>;
      policy: {
        equalOrNarrowerThanRest: boolean;
        descriptorOnly: boolean;
        mutationAllowed: boolean;
        refreshAllowed: boolean;
        deletionExecution: boolean;
        providerActions: boolean;
        pathsIncluded: boolean;
        storageLocationsIncluded: boolean;
        signedUrlsIncluded: boolean;
        tokensIncluded: boolean;
      };
    };
    const serialized = firstText(toolResponse);

    expect(fetched[0]?.url.toString()).toBe(
      "http://api.test/api/v1/launches/launch-closed/attachment-previews/retention/dry-run/schedule?scheduleDigest=schedule-digest-1&limit=2"
    );
    expect(fetched[0]?.init?.headers).toEqual({
      "X-TestHistory-Scopes": "artifacts:read",
      "X-TestHistory-Project-Scope": "project-1",
      "X-TestHistory-Actor-Id": "actor-1"
    });
    expect(payload.kind).toBe("attachment-preview-retention-dry-run-schedule");
    expect(payload.scope).toEqual({
      projectId: "project-1",
      launchId: "launch-closed",
      actorId: "actor-1"
    });
    expect(payload.access).toEqual(
      expect.objectContaining({ scope: "artifacts:read", mutation: false, actorScoped: true })
    );
    expect(payload.boundary).toEqual(
      expect.objectContaining({
        workerScheduled: false,
        closedLaunchScoped: true,
        descriptorSource: "artifact-schedule-descriptor-read-model",
        rawMaterialReturned: false
      })
    );
    expect(payload.execution).toEqual(
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
    expect(payload.page).toEqual(
      expect.objectContaining({ limit: 2, returned: 2, total: 3, nextCursor: "2" })
    );
    expect(payload.summary).toEqual(
      expect.objectContaining({
        scheduledDescriptorCount: 3,
        deleteRequestedCount: 0,
        plannedOperations: [
          "artifact.preview.retention.classify",
          "artifact.preview.retention.dry-run.schedule"
        ]
      })
    );
    expect(payload.batches[0]).toEqual(
      expect.objectContaining({
        descriptorRefs: ["preview-retention-descriptor:one"],
        deletionExecution: false,
        deleteRequestedCount: 0
      })
    );
    expect(payload.policy).toEqual(
      expect.objectContaining({
        equalOrNarrowerThanRest: true,
        descriptorOnly: true,
        mutationAllowed: false,
        refreshAllowed: false,
        deletionExecution: false,
        providerActions: false,
        pathsIncluded: false,
        storageLocationsIncluded: false,
        signedUrlsIncluded: false,
        tokensIncluded: false
      })
    );
    expect(JSON.parse(firstResourceText(resourceResponse))).toEqual(
      expect.objectContaining({
        kind: "attachment-preview-retention-dry-run-schedule",
        execution: expect.objectContaining({ deleteRequestedCount: 0 })
      })
    );
    expect(serialized).not.toContain("schedule-secret");
    expect(serialized).not.toContain("Downloads");
    expect(serialized).not.toContain("allure-results");
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("providerRuntime");
    expect(serialized).not.toContain("object.storage.delete");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toContain("https://object.test");
    expect(serialized).not.toContain('"rawPayload"');
  });

  it("preserves denied schedule shape and rejects attachment preview retention schedule mutations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        deniedResponse({
          error: "PermissionDeniedError",
          message: "Missing required artifact schedule read scope",
          requiredScopes: ["artifacts:read"],
          projectId: "project-1",
          token: "synthetic-token",
          storageKey: "launch-closed/raw/schedule-secret.log"
        })
      )
    );

    const deniedRead = await handle({
      jsonrpc: "2.0",
      id: 56,
      method: "tools/call",
      params: {
        name: "testhistory.attachment-preview-retention.dry-run.schedule.read",
        arguments: {
          apiUrl: "http://api.test",
          launchId: "launch-closed",
          projectId: "project-1"
        }
      }
    });
    const missingScope = await handle({
      jsonrpc: "2.0",
      id: 57,
      method: "tools/call",
      params: {
        name: "testhistory.attachment-preview-retention.dry-run.schedule.read",
        arguments: { launchId: "launch-closed" }
      }
    });
    const refreshTool = await handle({
      jsonrpc: "2.0",
      id: 58,
      method: "tools/call",
      params: {
        name: "testhistory.attachment-preview-retention.dry-run.schedule.refresh",
        arguments: { launchId: "launch-closed", projectId: "project-1" }
      }
    });
    const deleteTool = await handle({
      jsonrpc: "2.0",
      id: 59,
      method: "tools/call",
      params: {
        name: "testhistory.attachment-preview-retention.dry-run.schedule.delete",
        arguments: { launchId: "launch-closed", projectId: "project-1" }
      }
    });

    const payload = JSON.parse(firstText(deniedRead)) as {
      status: string;
      code: number;
      permissionDenied: { error: string; requiredScopes: string[]; token?: string };
      policy: {
        mutationAllowed: boolean;
        refreshAllowed: boolean;
        deletionExecution: boolean;
        providerActions: boolean;
      };
    };

    expect(payload.status).toBe("error");
    expect(payload.code).toBe(403);
    expect(payload.permissionDenied).toEqual(
      expect.objectContaining({
        error: "PermissionDeniedError",
        requiredScopes: ["artifacts:read"],
        token: "[redacted]"
      })
    );
    expect(payload.policy).toEqual(
      expect.objectContaining({
        mutationAllowed: false,
        refreshAllowed: false,
        deletionExecution: false,
        providerActions: false
      })
    );
    expect(missingScope.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "projectId is required for attachment preview retention schedule reads"
      })
    );
    expect(refreshTool.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "Unknown tool: testhistory.attachment-preview-retention.dry-run.schedule.refresh"
      })
    );
    expect(deleteTool.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: "Unknown tool: testhistory.attachment-preview-retention.dry-run.schedule.delete"
      })
    );
    expect(firstText(deniedRead)).not.toContain("synthetic-token");
    expect(firstText(deniedRead)).not.toContain("storageKey");
    expect(firstText(deniedRead)).not.toContain("raw/schedule-secret");
  });
});
