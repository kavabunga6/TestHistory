export const schemaBasePart10 = {
  "archive-diagnostics.replay.fixtures.materialized": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryArchiveDiagnosticReplayMaterializedFixtureRead",
    type: "object",
    additionalProperties: false,
    required: [
      "kind",
      "project",
      "actor",
      "access",
      "query",
      "materialization",
      "page",
      "summary",
      "items",
      "policy"
    ],
    properties: {
      kind: { const: "archive-diagnostic-replay-fixture-materialized-list" },
      project: { $ref: "#/$defs/project" },
      actor: { $ref: "#/$defs/actor" },
      access: { $ref: "#/$defs/access" },
      query: { $ref: "#/$defs/query" },
      materialization: { $ref: "#/$defs/materialization" },
      page: { $ref: "#/$defs/page" },
      summary: { $ref: "#/$defs/summary" },
      items: {
        type: "array",
        maxItems: 100,
        items: { $ref: "#/$defs/materializedFixture" }
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
      materialization: {
        type: "object",
        additionalProperties: false,
        required: [
          "adapterKind",
          "boundary",
          "consistency",
          "source",
          "readOnly",
          "mutation",
          "rawArchivePayloadsIncluded",
          "storageRefsIncluded",
          "signedUrlsIncluded",
          "tokensIncluded",
          "materializedRecordCount",
          "mutationBoundary"
        ],
        properties: {
          adapterKind: {
            const: "api-read-model-archive-diagnostic-replay-fixture-materialized-wip"
          },
          boundary: {
            const: "worker-compatible-archive-diagnostic-replay-fixture-materialized-read"
          },
          consistency: { const: "synthetic-fixture-contracts-idempotent" },
          source: { const: "synthetic-archive-diagnostic-replay-fixture-contracts" },
          readOnly: { const: true },
          mutation: { const: false },
          rawArchivePayloadsIncluded: { const: false },
          storageRefsIncluded: { const: false },
          signedUrlsIncluded: { const: false },
          tokensIncluded: { const: false },
          materializedAt: { type: "string" },
          materializedRecordCount: { type: "integer", minimum: 0 },
          materializationDigest: { type: "string" },
          mutationBoundary: { const: "rest-materialized-read-only-no-archive-or-worker-mutation" }
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
          "projectId",
          "materializedRecordCount",
          "fixtureNames",
          "rawArchivePayloadsIncluded",
          "storageRefsIncluded",
          "signedUrlsIncluded",
          "tokensIncluded",
          "redactionPassed",
          "mutationBoundary"
        ],
        properties: {
          projectId: { type: "string" },
          materializedRecordCount: { type: "integer", minimum: 0 },
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
          retryAwareCount: { type: "integer", minimum: 0 },
          duplicateAwareCount: { type: "integer", minimum: 0 },
          deniedFixtureCount: { type: "integer", minimum: 0 },
          rawArchivePayloadsIncluded: { const: false },
          storageRefsIncluded: { const: false },
          signedUrlsIncluded: { const: false },
          tokensIncluded: { const: false },
          redactionPassed: { const: true },
          materializationDigest: { type: "string" },
          mutationBoundary: {
            const: "api-materialized-fixture-read-only-no-rest-or-worker-mutation"
          }
        }
      },
      materializedFixture: {
        type: "object",
        additionalProperties: false,
        required: [
          "kind",
          "projectId",
          "fixtureRef",
          "materializedRef",
          "name",
          "scenario",
          "sourceDigest",
          "recordDigest",
          "status",
          "evidence",
          "materialization",
          "execution"
        ],
        properties: {
          kind: { const: "archive-diagnostic-replay-fixture-materialized" },
          projectId: { type: "string" },
          fixtureRef: { type: "string" },
          materializedRef: { type: "string" },
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
          materializedAt: { type: "string" },
          sourceDigest: { type: "string" },
          recordDigest: { type: "string" },
          status: { type: "string", enum: ["ready", "partial", "denied"] },
          evidence: { $ref: "#/$defs/evidence" },
          materialization: { $ref: "#/$defs/itemMaterialization" },
          execution: { $ref: "#/$defs/execution" }
        }
      },
      evidence: {
        type: "object",
        additionalProperties: false,
        required: [
          "rawArchivePayloadsIncluded",
          "storageRefsIncluded",
          "signedUrlsIncluded",
          "tokensIncluded",
          "redactionPassed",
          "mutationBoundary"
        ],
        properties: {
          supportedFiles: { type: "integer", minimum: 0 },
          attachmentFiles: { type: "integer", minimum: 0 },
          ignoredFiles: { type: "integer", minimum: 0 },
          warningCount: { type: "integer", minimum: 0 },
          parseErrors: { type: "integer", minimum: 0 },
          attemptGroups: { type: "integer", minimum: 0 },
          retryAware: { type: "boolean" },
          duplicateAware: { type: "boolean" },
          deniedFixture: { type: "boolean" },
          rawArchivePayloadsIncluded: { const: false },
          storageRefsIncluded: { const: false },
          signedUrlsIncluded: { const: false },
          tokensIncluded: { const: false },
          redactionPassed: { const: true },
          mutationBoundary: { const: "rest-materialized-read-only-no-archive-or-worker-mutation" }
        }
      },
      itemMaterialization: {
        type: "object",
        additionalProperties: false,
        required: [
          "adapterKind",
          "boundary",
          "consistency",
          "source",
          "readOnly",
          "rawArchivePayloadsIncluded",
          "storageRefsIncluded",
          "signedUrlsIncluded",
          "tokensIncluded",
          "mutationBoundary"
        ],
        properties: {
          adapterKind: {
            const: "api-read-model-archive-diagnostic-replay-fixture-materialized-wip"
          },
          boundary: {
            const: "worker-compatible-archive-diagnostic-replay-fixture-materialized-read"
          },
          consistency: { const: "synthetic-fixture-contracts-idempotent" },
          source: { const: "synthetic-archive-diagnostic-replay-fixture-contract" },
          readOnly: { const: true },
          rawArchivePayloadsIncluded: { const: false },
          storageRefsIncluded: { const: false },
          signedUrlsIncluded: { const: false },
          tokensIncluded: { const: false },
          mutationBoundary: { const: "rest-materialized-read-only-no-archive-or-worker-mutation" }
        }
      },
      execution: {
        type: "object",
        additionalProperties: false,
        required: [
          "replayStarted",
          "workerJobEnqueued",
          "storageMutationStarted",
          "readOnly",
          "mutation"
        ],
        properties: {
          replayStarted: { const: false },
          workerJobEnqueued: { const: false },
          storageMutationStarted: { const: false },
          readOnly: { const: true },
          mutation: { const: false }
        }
      },
      links: {
        type: "object",
        additionalProperties: false,
        properties: {
          self: { type: "string" },
          fixtureContracts: { type: "string" }
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
          "storageMutationAllowed",
          "rawManifestEntriesIncluded",
          "rawResultFilesIncluded",
          "resultContentIncluded",
          "rawPayloadsIncluded",
          "rawPathsIncluded",
          "storageRefsIncluded",
          "signedUrlsIncluded",
          "tokensIncluded",
          "credentialsIncluded",
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
          storageMutationAllowed: { const: false },
          rawManifestEntriesIncluded: { const: false },
          rawResultFilesIncluded: { const: false },
          resultContentIncluded: { const: false },
          rawPayloadsIncluded: { const: false },
          rawPathsIncluded: { const: false },
          storageRefsIncluded: { const: false },
          signedUrlsIncluded: { const: false },
          tokensIncluded: { const: false },
          credentialsIncluded: { const: false },
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
