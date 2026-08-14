export const schemaBasePart09 = {
  "archive-diagnostics.replay": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryArchiveDiagnosticReplayRead",
    type: "object",
    additionalProperties: false,
    required: ["kind", "scope", "access", "query", "worker", "page", "summary", "items", "policy"],
    properties: {
      kind: { const: "archive-diagnostic-replay-summary-list" },
      scope: { $ref: "#/$defs/scope" },
      launch: { type: "object", additionalProperties: true },
      access: { $ref: "#/$defs/access" },
      query: { $ref: "#/$defs/query" },
      worker: { $ref: "#/$defs/worker" },
      page: { $ref: "#/$defs/page" },
      summary: { $ref: "#/$defs/summary" },
      items: {
        type: "array",
        items: { $ref: "#/$defs/projection" }
      },
      policy: { $ref: "#/$defs/policy" }
    },
    $defs: {
      scope: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "launchId"],
        properties: {
          projectId: { type: "string" },
          launchId: { type: "string" },
          actorId: { type: "string" },
          archiveRef: { type: "string" }
        }
      },
      access: {
        type: "object",
        additionalProperties: false,
        required: ["scope", "requiredScopes", "projectScoped", "mutation", "redacted"],
        properties: {
          scope: { const: "uploads:read" },
          requiredScopes: {
            type: "array",
            items: { type: "string", enum: ["uploads:read", "launches:read"] }
          },
          projectScoped: { const: true },
          actorScoped: { type: "boolean" },
          mutation: { const: false },
          redacted: { const: true }
        }
      },
      query: {
        type: "object",
        additionalProperties: false,
        required: ["limit", "cursor"],
        properties: {
          archiveRef: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 100 },
          cursor: { type: ["string", "null"] }
        }
      },
      worker: {
        type: "object",
        additionalProperties: false,
        required: ["queue", "boundary", "adapterKind", "consistency", "payloadsAvailable"],
        properties: {
          queue: { const: "archive.diagnostics.replay" },
          boundary: { const: "worker-local-archive-diagnostics-replay" },
          adapterKind: { const: "in-memory-archive-diagnostics-replay-wip" },
          consistency: { const: "append-only-idempotent-replay" },
          payloadsAvailable: { const: false }
        }
      },
      page: {
        type: "object",
        additionalProperties: false,
        required: ["limit", "cursor", "offset", "returned", "total", "nextCursor", "hasMore"],
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 100 },
          cursor: { type: ["string", "null"] },
          offset: { type: "integer", minimum: 0 },
          returned: { type: "integer", minimum: 0 },
          total: { type: "integer", minimum: 0 },
          nextCursor: { type: ["string", "null"] },
          hasMore: { type: "boolean" }
        }
      },
      summary: {
        type: "object",
        additionalProperties: true,
        properties: {
          totalProjections: { type: "integer", minimum: 0 },
          eventCount: { type: "integer", minimum: 0 },
          acceptedEventCount: { type: "integer", minimum: 0 },
          retryableEventCount: { type: "integer", minimum: 0 },
          severityCounts: { type: "object", additionalProperties: { type: "integer" } },
          sourceCounts: { type: "object", additionalProperties: { type: "integer" } },
          readOnly: { const: true },
          mutation: { const: false },
          rawMaterialReturned: { const: false }
        }
      },
      projection: {
        type: "object",
        additionalProperties: false,
        required: [
          "kind",
          "projectId",
          "launchId",
          "archiveRef",
          "worker",
          "execution",
          "summary",
          "records"
        ],
        properties: {
          kind: { const: "archive-diagnostic-replay-summary" },
          projectId: { type: "string" },
          launchId: { type: "string" },
          archiveRef: { type: "string" },
          uploadId: { type: "string" },
          status: { type: "string" },
          phase: { type: "string" },
          worker: { $ref: "#/$defs/worker" },
          execution: { $ref: "#/$defs/execution" },
          summary: { $ref: "#/$defs/projectionSummary" },
          records: {
            type: "array",
            items: { $ref: "#/$defs/record" }
          }
        }
      },
      execution: {
        type: "object",
        additionalProperties: false,
        required: ["readOnly", "mutation", "rawMaterialReturned"],
        properties: {
          readOnly: { const: true },
          mutation: { const: false },
          rawMaterialReturned: { const: false }
        }
      },
      projectionSummary: {
        type: "object",
        additionalProperties: true,
        properties: {
          projectId: { type: "string" },
          launchId: { type: "string" },
          archiveRef: { type: "string" },
          eventCount: { type: "integer", minimum: 0 },
          acceptedEventCount: { type: "integer", minimum: 0 },
          retryableEventCount: { type: "integer", minimum: 0 },
          replayDigest: { type: "string" },
          closedArchiveStatusReadCompatible: { const: true },
          closedArchiveDiagnosticsReadCompatible: { const: true },
          mutationBoundary: { const: "worker-replay-only-no-rest-or-ui-claims" }
        }
      },
      record: {
        type: "object",
        additionalProperties: false,
        properties: {
          eventRef: { type: "string" },
          projectId: { type: "string" },
          launchId: { type: "string" },
          archiveRef: { type: "string" },
          source: {
            type: "string",
            enum: ["archive.status.read", "archive.diagnostics.read", "archive.cleanup.preview"]
          },
          code: { type: "string" },
          severity: { type: "string", enum: ["info", "warn", "error"] },
          retryable: { type: "boolean" },
          occurredAt: { type: "string" },
          entryRef: { type: "string" },
          chunkRef: { type: "string" }
        }
      },
      policy: {
        type: "object",
        additionalProperties: false,
        required: [
          "restParity",
          "projectIdRequired",
          "actorIdPassThrough",
          "headersForwarded",
          "equalOrNarrowerThanRest",
          "mutationAllowed",
          "workerExecutionAllowed",
          "rawPayloadsIncluded",
          "rawPathsIncluded",
          "storageRefsIncluded",
          "signedUrlsIncluded",
          "tokensIncluded",
          "paginationRequired",
          "redactionRules"
        ],
        properties: {
          restParity: { type: "object", additionalProperties: true },
          projectIdRequired: { const: true },
          actorIdPassThrough: { const: true },
          headersForwarded: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "X-TestHistory-Scopes",
                "X-TestHistory-Project-Scope",
                "X-TestHistory-Actor-Id"
              ]
            }
          },
          equalOrNarrowerThanRest: { const: true },
          mutationAllowed: { const: false },
          workerExecutionAllowed: { const: false },
          rawPayloadsIncluded: { const: false },
          rawPathsIncluded: { const: false },
          storageRefsIncluded: { const: false },
          signedUrlsIncluded: { const: false },
          tokensIncluded: { const: false },
          paginationRequired: { const: true },
          redactionRules: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  },
  "archive-diagnostics.replay.fixtures": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryArchiveDiagnosticReplayFixtureRead",
    type: "object",
    additionalProperties: false,
    required: ["kind", "project", "actor", "access", "query", "page", "summary", "items", "policy"],
    properties: {
      kind: { const: "archive-diagnostic-replay-fixture-list" },
      project: { $ref: "#/$defs/project" },
      actor: { $ref: "#/$defs/actor" },
      access: { $ref: "#/$defs/access" },
      query: { $ref: "#/$defs/query" },
      page: { $ref: "#/$defs/page" },
      summary: { $ref: "#/$defs/summary" },
      items: {
        type: "array",
        maxItems: 100,
        items: { $ref: "#/$defs/fixture" }
      },
      links: { $ref: "#/$defs/links" },
      policy: { $ref: "#/$defs/policy" }
    },
    $defs: {
      project: {
        type: "object",
        additionalProperties: false,
        required: ["id", "scoped"],
        properties: {
          id: { type: "string" },
          scoped: { const: true }
        }
      },
      actor: {
        type: "object",
        additionalProperties: false,
        required: ["id", "scoped"],
        properties: {
          id: { type: "string" },
          scoped: { type: "boolean" }
        }
      },
      access: {
        type: "object",
        additionalProperties: false,
        required: ["scope", "requiredScopes", "projectScoped", "mutation", "redacted"],
        properties: {
          scope: { const: "uploads:read" },
          requiredScopes: {
            type: "array",
            items: { type: "string", enum: ["uploads:read", "launches:read"] }
          },
          projectScoped: { const: true },
          actorScoped: { type: "boolean" },
          mutation: { const: false },
          redacted: { const: true }
        }
      },
      query: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "limit", "cursor"],
        properties: {
          projectId: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 100 },
          cursor: { type: ["string", "null"] }
        }
      },
      page: {
        type: "object",
        additionalProperties: false,
        required: ["limit", "cursor", "offset", "returned", "total", "nextCursor", "hasMore"],
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 100 },
          cursor: { type: ["string", "null"] },
          offset: { type: "integer", minimum: 0 },
          returned: { type: "integer", minimum: 0 },
          total: { type: "integer", minimum: 0 },
          nextCursor: { type: ["string", "null"] },
          hasMore: { type: "boolean" }
        }
      },
      summary: {
        type: "object",
        additionalProperties: false,
        required: [
          "totalFixtures",
          "fixtureNames",
          "readOnly",
          "mutation",
          "archivePayloadAvailable",
          "rawManifestEntriesReturned",
          "rawResultFilesReturned",
          "resultContentReturned",
          "rawPathsReturned",
          "payloadBytesReturned",
          "redacted"
        ],
        properties: {
          totalFixtures: { type: "integer", minimum: 0 },
          fixtureNames: {
            type: "array",
            items: {
              type: "string",
              enum: ["corrupt", "empty", "denied", "partial", "duplicate", "retry"]
            }
          },
          supportedFiles: { type: "integer", minimum: 0 },
          attachmentFiles: { type: "integer", minimum: 0 },
          ignoredFiles: { type: "integer", minimum: 0 },
          warningCount: { type: "integer", minimum: 0 },
          parseErrors: { type: "integer", minimum: 0 },
          attemptGroups: { type: "integer", minimum: 0 },
          readOnly: { const: true },
          mutation: { const: false },
          archivePayloadAvailable: { const: false },
          rawManifestEntriesReturned: { const: false },
          rawResultFilesReturned: { const: false },
          resultContentReturned: { const: false },
          rawPathsReturned: { const: false },
          payloadBytesReturned: { const: 0 },
          redacted: { const: true }
        }
      },
      fixture: {
        type: "object",
        additionalProperties: false,
        required: [
          "kind",
          "projectId",
          "fixtureRef",
          "name",
          "scenario",
          "expected",
          "replay",
          "payload",
          "digest"
        ],
        properties: {
          kind: { const: "archive-diagnostic-replay-fixture" },
          projectId: { type: "string" },
          fixtureRef: { type: "string" },
          name: {
            type: "string",
            enum: ["corrupt", "empty", "denied", "partial", "duplicate", "retry"]
          },
          scenario: {
            type: "string",
            enum: [
              "corrupt-result-json",
              "empty-archive",
              "denied-unsafe-entries",
              "partial-success",
              "duplicate-basename",
              "retry-history"
            ]
          },
          expected: { $ref: "#/$defs/expected" },
          replay: { $ref: "#/$defs/replay" },
          payload: { $ref: "#/$defs/payload" },
          digest: { type: "string" }
        }
      },
      expected: {
        type: "object",
        additionalProperties: false,
        required: [
          "supportedFiles",
          "attachmentFiles",
          "ignoredFiles",
          "warningCount",
          "parseErrors",
          "attemptGroups",
          "latestStatuses"
        ],
        properties: {
          supportedFiles: { type: "integer", minimum: 0 },
          attachmentFiles: { type: "integer", minimum: 0 },
          ignoredFiles: { type: "integer", minimum: 0 },
          warningCount: { type: "integer", minimum: 0 },
          parseErrors: { type: "integer", minimum: 0 },
          attemptGroups: { type: "integer", minimum: 0 },
          latestStatuses: {
            type: "array",
            items: { type: "string", enum: ["failed", "broken", "passed", "skipped", "unknown"] }
          }
        }
      },
      replay: {
        type: "object",
        additionalProperties: false,
        required: [
          "deterministic",
          "compatibleSources",
          "retryAware",
          "duplicateAware",
          "deniedFixture",
          "closedArchiveStatusReadCompatible",
          "closedArchiveDiagnosticsReadCompatible",
          "mutationBoundary"
        ],
        properties: {
          deterministic: { const: true },
          compatibleSources: {
            type: "array",
            items: {
              type: "string",
              enum: ["archive.status.read", "archive.diagnostics.read", "archive.cleanup.preview"]
            }
          },
          retryAware: { type: "boolean" },
          duplicateAware: { type: "boolean" },
          deniedFixture: { type: "boolean" },
          closedArchiveStatusReadCompatible: { const: true },
          closedArchiveDiagnosticsReadCompatible: { const: true },
          mutationBoundary: { const: "fixture-read-only-no-replay-mutation" }
        }
      },
      payload: {
        type: "object",
        additionalProperties: false,
        required: [
          "archivePayloadAvailable",
          "manifestEntriesReturned",
          "resultFilesReturned",
          "resultContentReturned",
          "rawPathsReturned",
          "payloadBytesReturned",
          "redacted"
        ],
        properties: {
          archivePayloadAvailable: { const: false },
          manifestEntriesReturned: { const: false },
          resultFilesReturned: { const: false },
          resultContentReturned: { const: false },
          rawPathsReturned: { const: false },
          payloadBytesReturned: { const: 0 },
          redacted: { const: true }
        }
      },
      links: {
        type: "object",
        additionalProperties: false,
        properties: {
          self: { type: "string" }
        }
      },
      policy: {
        type: "object",
        additionalProperties: false,
        required: [
          "restParity",
          "projectIdRequired",
          "actorIdPassThrough",
          "headersForwarded",
          "equalOrNarrowerThanRest",
          "syntheticOnly",
          "mutationAllowed",
          "workerExecutionAllowed",
          "rawManifestEntriesIncluded",
          "rawResultFilesIncluded",
          "resultContentIncluded",
          "rawPayloadsIncluded",
          "rawPathsIncluded",
          "storageRefsIncluded",
          "signedUrlsIncluded",
          "tokensIncluded",
          "paginationRequired",
          "redactionRules"
        ],
        properties: {
          restParity: { type: "object", additionalProperties: true },
          projectIdRequired: { const: true },
          actorIdPassThrough: { const: true },
          headersForwarded: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "X-TestHistory-Scopes",
                "X-TestHistory-Project-Scope",
                "X-TestHistory-Actor-Id"
              ]
            }
          },
          equalOrNarrowerThanRest: { const: true },
          syntheticOnly: { const: true },
          mutationAllowed: { const: false },
          workerExecutionAllowed: { const: false },
          rawManifestEntriesIncluded: { const: false },
          rawResultFilesIncluded: { const: false },
          resultContentIncluded: { const: false },
          rawPayloadsIncluded: { const: false },
          rawPathsIncluded: { const: false },
          storageRefsIncluded: { const: false },
          signedUrlsIncluded: { const: false },
          tokensIncluded: { const: false },
          paginationRequired: { const: true },
          redactionRules: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  }
} as const;
