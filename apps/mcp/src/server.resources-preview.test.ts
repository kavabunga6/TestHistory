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

describe("MCP tools resources-preview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns archive diagnostic replay schema as read-only REST parity metadata", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 34,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: { schema: "archive-diagnostics.replay" }
      }
    });

    const schema = JSON.parse(firstText(response)) as {
      title: string;
      properties: { kind: { const: string }; items: unknown; worker: unknown };
      $defs: {
        access: {
          properties: {
            scope: { const: string };
            projectScoped: { const: boolean };
            mutation: { const: boolean };
          };
        };
        worker: {
          properties: {
            queue: { const: string };
            payloadsAvailable: { const: boolean };
          };
        };
        execution: {
          properties: {
            readOnly: { const: boolean };
            mutation: { const: boolean };
            rawMaterialReturned: { const: boolean };
          };
        };
        policy: {
          properties: {
            projectIdRequired: { const: boolean };
            equalOrNarrowerThanRest: { const: boolean };
            mutationAllowed: { const: boolean };
            workerExecutionAllowed: { const: boolean };
            rawPayloadsIncluded: { const: boolean };
            rawPathsIncluded: { const: boolean };
            storageRefsIncluded: { const: boolean };
            signedUrlsIncluded: { const: boolean };
            tokensIncluded: { const: boolean };
            paginationRequired: { const: boolean };
          };
        };
      };
    };

    expect(schema.title).toBe("TestHistoryArchiveDiagnosticReplayRead");
    expect(schema.properties.kind.const).toBe("archive-diagnostic-replay-summary-list");
    expect(schema.properties.items).toBeDefined();
    expect(schema.properties.worker).toBeDefined();
    expect(schema.$defs.access.properties.scope.const).toBe("uploads:read");
    expect(schema.$defs.access.properties.projectScoped.const).toBe(true);
    expect(schema.$defs.access.properties.mutation.const).toBe(false);
    expect(schema.$defs.worker.properties.queue.const).toBe("archive.diagnostics.replay");
    expect(schema.$defs.worker.properties.payloadsAvailable.const).toBe(false);
    expect(schema.$defs.execution.properties.readOnly.const).toBe(true);
    expect(schema.$defs.execution.properties.mutation.const).toBe(false);
    expect(schema.$defs.execution.properties.rawMaterialReturned.const).toBe(false);
    expect(schema.$defs.policy.properties.projectIdRequired.const).toBe(true);
    expect(schema.$defs.policy.properties.equalOrNarrowerThanRest.const).toBe(true);
    expect(schema.$defs.policy.properties.mutationAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.workerExecutionAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.rawPayloadsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.rawPathsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.storageRefsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.signedUrlsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.tokensIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.paginationRequired.const).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns archive diagnostic replay fixture schema as synthetic read-only REST parity metadata", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 35,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: { schema: "archive-diagnostics.replay.fixtures" }
      }
    });

    const schema = JSON.parse(firstText(response)) as {
      title: string;
      properties: { kind: { const: string }; items: unknown; policy: unknown };
      $defs: {
        access: {
          properties: {
            scope: { const: string };
            projectScoped: { const: boolean };
            mutation: { const: boolean };
          };
        };
        fixture: { properties: { kind: { const: string }; name: { enum: string[] } } };
        payload: {
          properties: {
            archivePayloadAvailable: { const: boolean };
            manifestEntriesReturned: { const: boolean };
            resultFilesReturned: { const: boolean };
            resultContentReturned: { const: boolean };
            rawPathsReturned: { const: boolean };
            payloadBytesReturned: { const: number };
            redacted: { const: boolean };
          };
        };
        policy: {
          properties: {
            projectIdRequired: { const: boolean };
            equalOrNarrowerThanRest: { const: boolean };
            syntheticOnly: { const: boolean };
            mutationAllowed: { const: boolean };
            workerExecutionAllowed: { const: boolean };
            rawManifestEntriesIncluded: { const: boolean };
            rawResultFilesIncluded: { const: boolean };
            resultContentIncluded: { const: boolean };
            rawPayloadsIncluded: { const: boolean };
            rawPathsIncluded: { const: boolean };
            storageRefsIncluded: { const: boolean };
            signedUrlsIncluded: { const: boolean };
            tokensIncluded: { const: boolean };
            paginationRequired: { const: boolean };
          };
        };
      };
    };

    expect(schema.title).toBe("TestHistoryArchiveDiagnosticReplayFixtureRead");
    expect(schema.properties.kind.const).toBe("archive-diagnostic-replay-fixture-list");
    expect(schema.properties.items).toBeDefined();
    expect(schema.properties.policy).toBeDefined();
    expect(schema.$defs.access.properties.scope.const).toBe("uploads:read");
    expect(schema.$defs.access.properties.projectScoped.const).toBe(true);
    expect(schema.$defs.access.properties.mutation.const).toBe(false);
    expect(schema.$defs.fixture.properties.kind.const).toBe("archive-diagnostic-replay-fixture");
    expect(schema.$defs.fixture.properties.name.enum).toEqual([
      "corrupt",
      "empty",
      "denied",
      "partial",
      "duplicate",
      "retry"
    ]);
    expect(schema.$defs.payload.properties.archivePayloadAvailable.const).toBe(false);
    expect(schema.$defs.payload.properties.manifestEntriesReturned.const).toBe(false);
    expect(schema.$defs.payload.properties.resultFilesReturned.const).toBe(false);
    expect(schema.$defs.payload.properties.resultContentReturned.const).toBe(false);
    expect(schema.$defs.payload.properties.rawPathsReturned.const).toBe(false);
    expect(schema.$defs.payload.properties.payloadBytesReturned.const).toBe(0);
    expect(schema.$defs.payload.properties.redacted.const).toBe(true);
    expect(schema.$defs.policy.properties.projectIdRequired.const).toBe(true);
    expect(schema.$defs.policy.properties.equalOrNarrowerThanRest.const).toBe(true);
    expect(schema.$defs.policy.properties.syntheticOnly.const).toBe(true);
    expect(schema.$defs.policy.properties.mutationAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.workerExecutionAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.rawManifestEntriesIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.rawResultFilesIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.resultContentIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.rawPayloadsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.rawPathsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.storageRefsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.signedUrlsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.tokensIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.paginationRequired.const).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns materialized archive diagnostic replay fixture schema as read-only REST parity metadata", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 36,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: { schema: "archive-diagnostics.replay.fixtures.materialized" }
      }
    });

    const schema = JSON.parse(firstText(response)) as {
      title: string;
      properties: { kind: { const: string }; materialization: unknown; items: unknown };
      $defs: {
        materializedFixture: {
          properties: { kind: { const: string }; status: { enum: string[] } };
        };
        materialization: {
          properties: {
            adapterKind: { const: string };
            boundary: { const: string };
            readOnly: { const: boolean };
            mutation: { const: boolean };
            rawArchivePayloadsIncluded: { const: boolean };
            storageRefsIncluded: { const: boolean };
            signedUrlsIncluded: { const: boolean };
            tokensIncluded: { const: boolean };
            mutationBoundary: { const: string };
          };
        };
        execution: {
          properties: {
            replayStarted: { const: boolean };
            workerJobEnqueued: { const: boolean };
            storageMutationStarted: { const: boolean };
            mutation: { const: boolean };
          };
        };
        policy: {
          properties: {
            projectIdRequired: { const: boolean };
            equalOrNarrowerThanRest: { const: boolean };
            syntheticOnly: { const: boolean };
            mutationAllowed: { const: boolean };
            workerExecutionAllowed: { const: boolean };
            storageMutationAllowed: { const: boolean };
            rawManifestEntriesIncluded: { const: boolean };
            rawResultFilesIncluded: { const: boolean };
            resultContentIncluded: { const: boolean };
            rawPayloadsIncluded: { const: boolean };
            rawPathsIncluded: { const: boolean };
            storageRefsIncluded: { const: boolean };
            signedUrlsIncluded: { const: boolean };
            tokensIncluded: { const: boolean };
            credentialsIncluded: { const: boolean };
            paginationRequired: { const: boolean };
          };
        };
      };
    };

    expect(schema.title).toBe("TestHistoryArchiveDiagnosticReplayMaterializedFixtureRead");
    expect(schema.properties.kind.const).toBe(
      "archive-diagnostic-replay-fixture-materialized-list"
    );
    expect(schema.properties.materialization).toBeDefined();
    expect(schema.properties.items).toBeDefined();
    expect(schema.$defs.materializedFixture.properties.kind.const).toBe(
      "archive-diagnostic-replay-fixture-materialized"
    );
    expect(schema.$defs.materializedFixture.properties.status.enum).toEqual([
      "ready",
      "partial",
      "denied"
    ]);
    expect(schema.$defs.materialization.properties.adapterKind.const).toBe(
      "api-read-model-archive-diagnostic-replay-fixture-materialized-wip"
    );
    expect(schema.$defs.materialization.properties.boundary.const).toBe(
      "worker-compatible-archive-diagnostic-replay-fixture-materialized-read"
    );
    expect(schema.$defs.materialization.properties.readOnly.const).toBe(true);
    expect(schema.$defs.materialization.properties.mutation.const).toBe(false);
    expect(schema.$defs.materialization.properties.rawArchivePayloadsIncluded.const).toBe(false);
    expect(schema.$defs.materialization.properties.storageRefsIncluded.const).toBe(false);
    expect(schema.$defs.materialization.properties.signedUrlsIncluded.const).toBe(false);
    expect(schema.$defs.materialization.properties.tokensIncluded.const).toBe(false);
    expect(schema.$defs.materialization.properties.mutationBoundary.const).toBe(
      "rest-materialized-read-only-no-archive-or-worker-mutation"
    );
    expect(schema.$defs.execution.properties.replayStarted.const).toBe(false);
    expect(schema.$defs.execution.properties.workerJobEnqueued.const).toBe(false);
    expect(schema.$defs.execution.properties.storageMutationStarted.const).toBe(false);
    expect(schema.$defs.execution.properties.mutation.const).toBe(false);
    expect(schema.$defs.policy.properties.projectIdRequired.const).toBe(true);
    expect(schema.$defs.policy.properties.equalOrNarrowerThanRest.const).toBe(true);
    expect(schema.$defs.policy.properties.syntheticOnly.const).toBe(true);
    expect(schema.$defs.policy.properties.mutationAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.workerExecutionAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.storageMutationAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.rawManifestEntriesIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.rawResultFilesIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.resultContentIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.rawPayloadsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.rawPathsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.storageRefsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.signedUrlsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.tokensIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.credentialsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.paginationRequired.const).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns history compare schema with read-only MCP parity metadata", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 31,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: { schema: "test-case.history.compare" }
      }
    });

    const schema = JSON.parse(firstText(response)) as {
      title: string;
      properties: { kind: { const: string }; availability: unknown; enrichment: unknown };
      $defs: {
        access: {
          properties: {
            scope: { const: string };
            actorScoped: { type: string };
            mutation: { const: boolean };
          };
        };
        change: { properties: { kind: { enum: string[] } } };
        redaction: {
          properties: {
            tokensIncluded: { const: boolean };
            pathsIncluded: { const: boolean };
            storageLocationsIncluded: { const: boolean };
            artifactUrlsIncluded: { const: boolean };
          };
        };
        policy: {
          properties: {
            projectIdRequired: { const: boolean };
            resultPairRequired: { const: boolean };
            mutationAllowed: { const: boolean };
            equalOrNarrowerThanRest: { const: boolean };
            availabilityPreserved: { const: boolean };
            actorScopedAccessPreserved: { const: boolean };
            enrichedFieldsPreserved: { items: { enum: string[] } };
          };
        };
      };
    };

    expect(schema.title).toBe("TestHistoryTestCaseHistoryComparePage");
    expect(schema.properties.kind.const).toBe("test-case-history-compare");
    expect(schema.properties.availability).toBeDefined();
    expect(schema.properties.enrichment).toBeDefined();
    expect(schema.$defs.access.properties.scope.const).toBe("test-cases:read");
    expect(schema.$defs.access.properties.actorScoped.type).toBe("boolean");
    expect(schema.$defs.access.properties.mutation.const).toBe(false);
    expect(schema.$defs.redaction.properties.tokensIncluded.const).toBe(false);
    expect(schema.$defs.redaction.properties.pathsIncluded.const).toBe(false);
    expect(schema.$defs.redaction.properties.storageLocationsIncluded.const).toBe(false);
    expect(schema.$defs.redaction.properties.artifactUrlsIncluded.const).toBe(false);
    expect(schema.$defs.change.properties.kind.enum).toEqual([
      "label",
      "executor",
      "branch",
      "build",
      "defect"
    ]);
    expect(schema.$defs.policy.properties.projectIdRequired.const).toBe(true);
    expect(schema.$defs.policy.properties.resultPairRequired.const).toBe(true);
    expect(schema.$defs.policy.properties.mutationAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.equalOrNarrowerThanRest.const).toBe(true);
    expect(schema.$defs.policy.properties.availabilityPreserved.const).toBe(true);
    expect(schema.$defs.policy.properties.actorScopedAccessPreserved.const).toBe(true);
    expect(schema.$defs.policy.properties.enrichedFieldsPreserved.items.enum).toEqual([
      "label",
      "executor",
      "branch",
      "build",
      "defect"
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns history compare permission audit schema with read-only redaction parity", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 32,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: { schema: "test-case.history.compare.permission-audit" }
      }
    });

    const schema = JSON.parse(firstText(response)) as {
      title: string;
      properties: { kind: { const: string }; items: unknown; diagnostics: unknown };
      $defs: {
        access: {
          properties: {
            scope: { const: string };
            mutation: { const: boolean };
            redacted: { const: boolean };
          };
        };
        audit: {
          properties: {
            boundary: { const: string };
            mutationBoundary: { const: string };
            rawHistory: unknown;
          };
        };
        redaction: {
          properties: {
            rawHistoryIncluded: { const: boolean };
            rawCompareInputsIncluded: { const: boolean };
            tokensIncluded: { const: boolean };
            pathsIncluded: { const: boolean };
            storageLocationsIncluded: { const: boolean };
            artifactUrlsIncluded: { const: boolean };
          };
        };
        policy: {
          properties: {
            projectIdRequired: { const: boolean };
            actorScopeForwarded: { const: boolean };
            mutationAllowed: { const: boolean };
            equalOrNarrowerThanRest: { const: boolean };
            rawHistoryIncluded: { const: boolean };
            rawCompareInputsIncluded: { const: boolean };
            deniedStateMasked: { const: boolean };
          };
        };
      };
    };

    expect(schema.title).toBe("TestHistoryTestCaseHistoryComparePermissionAuditPage");
    expect(schema.properties.kind.const).toBe("test-case-history-compare-permission-audit");
    expect(schema.properties.items).toBeDefined();
    expect(schema.properties.diagnostics).toBeDefined();
    expect(schema.$defs.access.properties.scope.const).toBe("test-cases:read");
    expect(schema.$defs.access.properties.mutation.const).toBe(false);
    expect(schema.$defs.access.properties.redacted.const).toBe(true);
    expect(schema.$defs.audit.properties.boundary.const).toBe(
      "read-only-permission-audit-projection"
    );
    expect(schema.$defs.audit.properties.mutationBoundary.const).toBe("read-only-no-rest-mutation");
    expect(schema.$defs.audit.properties.rawHistory).toBeDefined();
    expect(schema.$defs.redaction.properties.rawHistoryIncluded.const).toBe(false);
    expect(schema.$defs.redaction.properties.rawCompareInputsIncluded.const).toBe(false);
    expect(schema.$defs.redaction.properties.tokensIncluded.const).toBe(false);
    expect(schema.$defs.redaction.properties.pathsIncluded.const).toBe(false);
    expect(schema.$defs.redaction.properties.storageLocationsIncluded.const).toBe(false);
    expect(schema.$defs.redaction.properties.artifactUrlsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.projectIdRequired.const).toBe(true);
    expect(schema.$defs.policy.properties.actorScopeForwarded.const).toBe(true);
    expect(schema.$defs.policy.properties.mutationAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.equalOrNarrowerThanRest.const).toBe(true);
    expect(schema.$defs.policy.properties.rawHistoryIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.rawCompareInputsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.deniedStateMasked.const).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns history compare permission audit replay invariant schema as read-only MCP parity", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 33,
      method: "tools/call",
      params: {
        name: "testhistory.schemas",
        arguments: { schema: "test-case.history.compare.permission-audit.replay.invariants" }
      }
    });

    const schema = JSON.parse(firstText(response)) as {
      title: string;
      properties: { kind: { const: string }; items: unknown };
      $defs: {
        access: {
          properties: {
            scope: { const: string };
            actorScoped: { const: boolean };
            mutation: { const: boolean };
            redacted: { const: boolean };
          };
        };
        invariant: {
          properties: {
            boundary: { const: string };
            mutationBoundary: { const: string };
            actorScoped: { properties: { requested: { const: boolean } } };
          };
        };
        redaction: {
          properties: {
            rawHistoryIncluded: { const: boolean };
            rawCompareInputsIncluded: { const: boolean };
            tokensIncluded: { const: boolean };
            pathsIncluded: { const: boolean };
            storageLocationsIncluded: { const: boolean };
            artifactUrlsIncluded: { const: boolean };
          };
        };
        policy: {
          properties: {
            projectIdRequired: { const: boolean };
            actorIdRequired: { const: boolean };
            testCaseScoped: { const: boolean };
            mutationAllowed: { const: boolean };
            equalOrNarrowerThanRest: { const: boolean };
            rawHistoryIncluded: { const: boolean };
            rawCompareInputsIncluded: { const: boolean };
            mcpReplayExecution: { const: boolean };
            deniedStateMasked: { const: boolean };
          };
        };
      };
    };

    expect(schema.title).toBe(
      "TestHistoryTestCaseHistoryComparePermissionAuditReplayInvariantPage"
    );
    expect(schema.properties.kind.const).toBe(
      "test-case-history-compare-permission-audit-replay-invariants"
    );
    expect(schema.properties.items).toBeDefined();
    expect(schema.$defs.access.properties.scope.const).toBe("test-cases:read");
    expect(schema.$defs.access.properties.actorScoped.const).toBe(true);
    expect(schema.$defs.access.properties.mutation.const).toBe(false);
    expect(schema.$defs.access.properties.redacted.const).toBe(true);
    expect(schema.$defs.invariant.properties.boundary.const).toBe(
      "read-only-history-compare-permission-audit-replay-invariant"
    );
    expect(schema.$defs.invariant.properties.mutationBoundary.const).toBe(
      "rest-read-only-no-replay-mutation"
    );
    expect(schema.$defs.invariant.properties.actorScoped.properties.requested.const).toBe(true);
    expect(schema.$defs.redaction.properties.rawHistoryIncluded.const).toBe(false);
    expect(schema.$defs.redaction.properties.rawCompareInputsIncluded.const).toBe(false);
    expect(schema.$defs.redaction.properties.tokensIncluded.const).toBe(false);
    expect(schema.$defs.redaction.properties.pathsIncluded.const).toBe(false);
    expect(schema.$defs.redaction.properties.storageLocationsIncluded.const).toBe(false);
    expect(schema.$defs.redaction.properties.artifactUrlsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.projectIdRequired.const).toBe(true);
    expect(schema.$defs.policy.properties.actorIdRequired.const).toBe(true);
    expect(schema.$defs.policy.properties.testCaseScoped.const).toBe(true);
    expect(schema.$defs.policy.properties.mutationAllowed.const).toBe(false);
    expect(schema.$defs.policy.properties.equalOrNarrowerThanRest.const).toBe(true);
    expect(schema.$defs.policy.properties.rawHistoryIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.rawCompareInputsIncluded.const).toBe(false);
    expect(schema.$defs.policy.properties.mcpReplayExecution.const).toBe(false);
    expect(schema.$defs.policy.properties.deniedStateMasked.const).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns upload policy without backend calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "testhistory.upload.policy", arguments: {} }
    });

    const policy = JSON.parse(firstText(response)) as {
      supportedInputs: Array<{ format: string }>;
      safetyChecks: string[];
      backendRequirement: string;
      mcpBoundary: {
        access: string;
        mutationAllowed: boolean;
        chunkUploadsAllowed: boolean;
        backendCalls: boolean;
      };
    };

    expect(policy.supportedInputs.map((input) => input.format)).toContain("allure-results");
    expect(policy.safetyChecks.join(" ")).toContain("secrets");
    expect(policy.backendRequirement).toContain("does not require");
    expect(policy.mcpBoundary).toEqual({
      access: "schema-only",
      mutationAllowed: false,
      chunkUploadsAllowed: false,
      backendCalls: false
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns upload session schema", async () => {
    const response = await handle({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "testhistory.upload.session.schema", arguments: {} }
    });

    const schema = JSON.parse(firstText(response)) as {
      required: string[];
      properties: { sourceFormat: { enum: string[] } };
    };

    expect(schema.required).toEqual(["projectId", "launchName", "sourceFormat", "results"]);
    expect(schema.properties.sourceFormat.enum).toEqual(["allure-results", "junit-xml"]);
  });

  it("keeps upload MCP tools schema-only without chunk mutation aliases", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const listResponse = await handle({ jsonrpc: "2.0", id: 31, method: "tools/list" });
    const result = listResponse.result as { tools: Array<{ name: string }> };
    const uploadTools = result.tools
      .map((tool) => tool.name)
      .filter((name) => name.startsWith("testhistory.upload."))
      .sort();

    expect(uploadTools).toEqual(["testhistory.upload.policy", "testhistory.upload.session.schema"]);

    const mutationToolNames = [
      "testhistory.upload.session.create",
      "testhistory.upload.chunk.append",
      "testhistory.upload.chunk.commit",
      "testhistory.upload.complete",
      "testhistory.upload.abort"
    ];
    for (const [index, name] of mutationToolNames.entries()) {
      const response = await handle({
        jsonrpc: "2.0",
        id: 32 + index,
        method: "tools/call",
        params: { name, arguments: { uploadId: "upload-secret-token", content: "raw-body" } }
      });

      expect(response.error).toEqual(expect.objectContaining({ message: `Unknown tool: ${name}` }));
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns quality gate rules", async () => {
    const response = await handle({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "testhistory.quality-gate.rules", arguments: {} }
    });

    const rules = JSON.parse(firstText(response)) as {
      defaultPolicy: { blockingRules: Array<{ id: string }> };
      statusMapping: { failed: string; broken: string };
    };

    expect(rules.defaultPolicy.blockingRules.map((rule) => rule.id)).toEqual([
      "no-failed-tests",
      "no-broken-tests"
    ]);
    expect(rules.statusMapping.failed).toContain("blocks");
    expect(rules.statusMapping.broken).toContain("blocks");
  });

  it("passes AQL-like parameters to project and test case find tools", async () => {
    const fetchedUrls: URL[] = [];
    const fetchMock = vi.fn(async (input: URL) => {
      fetchedUrls.push(input);
      return jsonResponse([{ id: "project-1" }]);
    });
    vi.stubGlobal("fetch", fetchMock);

    await handle({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "testhistory.projects.find",
        arguments: {
          apiUrl: "http://api.test",
          aql: "key = WEB",
          query: "web",
          limit: 25
        }
      }
    });

    await handle({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "testhistory.test-cases.find",
        arguments: {
          apiUrl: "http://api.test",
          projectId: "project-1",
          aql: "status in (failed, broken)",
          query: "login",
          limit: 10
        }
      }
    });

    const firstUrl = fetchedUrls[0];
    const secondUrl = fetchedUrls[1];

    expect(firstUrl?.toString()).toBe(
      "http://api.test/api/v1/projects?aql=key+%3D+WEB&query=web&limit=25"
    );
    expect(secondUrl?.toString()).toBe(
      "http://api.test/api/v1/test-cases?projectId=project-1&aql=status+in+%28failed%2C+broken%29&query=login&limit=10"
    );
  });

  it("uses launch details endpoint for test result find until result search API exists", async () => {
    const fetchedUrls: URL[] = [];
    const fetchMock = vi.fn(async (input: URL) => {
      fetchedUrls.push(input);
      return jsonResponse({ id: "launch-1", results: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: {
        name: "testhistory.test-results.find",
        arguments: {
          apiUrl: "http://api.test",
          launchId: "launch-1",
          aql: "status = failed"
        }
      }
    });

    const url = fetchedUrls[0];

    expect(url?.toString()).toBe("http://api.test/api/v1/launches/launch-1?aql=status+%3D+failed");
    expect(JSON.parse(firstText(response))).toEqual({ id: "launch-1", results: [] });
  });

  it("fetches test case details through REST without adding mutation tools", async () => {
    const fetchedUrls: URL[] = [];
    const fetchMock = vi.fn(async (input: URL) => {
      fetchedUrls.push(input);
      return jsonResponse({
        id: "case-1",
        name: "checkout",
        history: [{ launchId: "launch-1", status: "passed" }],
        testCase: { expectedResult: "Order is created" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 22,
      method: "tools/call",
      params: {
        name: "testhistory.test-case.get",
        arguments: {
          apiUrl: "http://api.test",
          testCaseId: "case-1",
          projectId: "project-1"
        }
      }
    });

    expect(fetchedUrls[0]?.toString()).toBe(
      "http://api.test/api/v1/test-cases/case-1?projectId=project-1"
    );
    expect(JSON.parse(firstText(response))).toEqual({
      id: "case-1",
      name: "checkout",
      history: [{ launchId: "launch-1", status: "passed" }],
      testCase: { expectedResult: "Order is created" }
    });
  });

  it("keeps test result detail output within MCP-safe REST read model fields", async () => {
    const fetchedUrls: URL[] = [];
    const restPayload = {
      launchId: "launch-1",
      projectId: "project-1",
      uuid: "result-1",
      name: "checkout",
      status: "failed",
      parameters: [
        { name: "browser", value: "chromium" },
        { name: "token", value: "***", mode: "masked" },
        { name: "password", mode: "hidden" }
      ],
      raw: {
        uuid: "result-1",
        parameters: [
          { name: "token", value: "***", mode: "masked" },
          { name: "password", mode: "hidden" }
        ],
        steps: [
          {
            name: "pay",
            parameters: [{ name: "session", value: "***", mode: "masked" }]
          }
        ]
      }
    };
    const fetchMock = vi.fn(async (input: URL) => {
      fetchedUrls.push(input);
      return jsonResponse(restPayload);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 23,
      method: "tools/call",
      params: {
        name: "testhistory.test-result.get",
        arguments: {
          apiUrl: "http://api.test",
          launchId: "launch-1",
          resultUuid: "result-1"
        }
      }
    });

    expect(fetchedUrls[0]?.toString()).toBe(
      "http://api.test/api/v1/launches/launch-1/results/result-1"
    );
    const payload = JSON.parse(firstText(response)) as {
      parameters: Array<{ name: string; value?: string; mode?: string; redacted?: boolean }>;
      raw?: unknown;
    };

    expect(payload.parameters).toEqual([
      { name: "browser", value: "chromium" },
      { name: "token", value: "***", mode: "masked", redacted: true },
      { name: "password", mode: "hidden", redacted: true }
    ]);
    expect(payload.raw).toBeUndefined();
    expect(firstText(response)).not.toContain("synthetic-secret");
  });

  it("lists TestHistory resources without backend calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({ jsonrpc: "2.0", id: 30, method: "resources/list" });
    const result = response.result as { resources: Array<{ uri: string; mimeType: string }> };

    expect(result.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uri: "testhistory://projects", mimeType: "application/json" }),
        expect.objectContaining({ uri: "testhistory://launches/{launchId}" }),
        expect.objectContaining({ uri: "testhistory://launches/{launchId}/results/{resultUuid}" }),
        expect.objectContaining({
          uri: "testhistory://launches/{launchId}/results/{resultUuid}/attachments"
        }),
        expect.objectContaining({ uri: "testhistory://test-cases/{testCaseId}/history" }),
        expect.objectContaining({
          uri: "testhistory://test-cases/{testCaseId}/history/compare"
        }),
        expect.objectContaining({
          uri: "testhistory://test-cases/{testCaseId}/history/compare/permission-audit"
        }),
        expect.objectContaining({
          uri: "testhistory://test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants"
        }),
        expect.objectContaining({
          uri: "testhistory://projects/{projectId}/identity-corrections/audit"
        }),
        expect.objectContaining({ uri: "testhistory://defect-mutes" }),
        expect.objectContaining({
          uri: "testhistory://projects/{projectId}/defect-mutes/projection"
        }),
        expect.objectContaining({
          uri: "testhistory://projects/{projectId}/defect-mutes/projection/replay"
        }),
        expect.objectContaining({
          uri: "testhistory://projects/{projectId}/defect-mutes/projection/replay/invariants"
        }),
        expect.objectContaining({
          uri: "testhistory://projects/{projectId}/defect-mutes/projection/replay/invariants/materialized",
          name: "Materialized Defect Mute Replay Invariants"
        }),
        expect.objectContaining({
          uri: "testhistory://launches/{launchId}/quality-gate/mute-effects"
        }),
        expect.objectContaining({
          uri: "testhistory://launches/{launchId}/attachment-previews/retention/preview"
        }),
        expect.objectContaining({
          uri: "testhistory://launches/{launchId}/attachment-previews/retention/dry-run/schedule",
          name: "Attachment Preview Retention Dry-Run Schedule Descriptors"
        }),
        expect.objectContaining({
          uri: "testhistory://launches/{launchId}/archive/diagnostics/replay"
        }),
        expect.objectContaining({
          uri: "testhistory://projects/{projectId}/archive/diagnostics/replay/fixtures/materialized",
          name: "Materialized Archive Diagnostic Replay Fixtures"
        }),
        expect.objectContaining({ uri: "testhistory://security/audit" }),
        expect.objectContaining({ uri: "testhistory://security/audit/export/evaluate" }),
        expect.objectContaining({
          uri: "testhistory://projects/{projectId}/security/audit/export/lifecycle/replay/invariants"
        }),
        expect.objectContaining({ uri: "testhistory://defects" })
      ])
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads launch resources as compact summaries before raw results", async () => {
    const fetchedUrls: URL[] = [];
    const fetchMock = vi.fn(async (input: URL) => {
      fetchedUrls.push(input);
      return jsonResponse({
        id: "launch-1",
        projectId: "project-1",
        name: "main #1",
        status: "closed",
        createdAt: "2026-05-30T00:00:00.000Z",
        counters: { failed: 1, broken: 0, passed: 1, skipped: 0, unknown: 0 },
        results: [
          {
            uuid: "result-1",
            testCaseId: "case-1",
            name: "checkout",
            status: "failed",
            parameters: [{ name: "token", value: "***", mode: "masked" }],
            raw: { secret: "synthetic-secret" },
            steps: [{ name: "pay" }]
          },
          { uuid: "result-2", name: "login", status: "passed" }
        ]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await handle({
      jsonrpc: "2.0",
      id: 31,
      method: "resources/read",
      params: { uri: "testhistory://launches/launch-1?apiUrl=http%3A%2F%2Fapi.test" }
    });

    const payload = JSON.parse(firstResourceText(response)) as {
      compact: boolean;
      totalResults: number;
      failures: Array<{ uuid: string; parameters: Array<{ value: string }> }>;
      results?: unknown[];
      raw?: unknown;
    };

    expect(fetchedUrls[0]?.toString()).toBe("http://api.test/api/v1/launches/launch-1");
    expect(payload.compact).toBe(true);
    expect(payload.totalResults).toBe(2);
    expect(payload.failures[0]?.uuid).toBe("result-1");
    expect(payload.failures[0]?.parameters[0]?.value).toBe("***");
    expect(payload.results).toBeUndefined();
    expect(payload.raw).toBeUndefined();
    expect(firstResourceText(response)).not.toContain("synthetic-secret");
  });
});
