export const schemaBasePart03 = {
  "test-case.history.compare.permission-audit": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryTestCaseHistoryComparePermissionAuditPage",
    type: "object",
    additionalProperties: false,
    required: [
      "kind",
      "projectId",
      "testCaseId",
      "access",
      "availability",
      "query",
      "audit",
      "page",
      "redaction",
      "items",
      "policy"
    ],
    properties: {
      kind: { type: "string", const: "test-case-history-compare-permission-audit" },
      projectId: { type: "string" },
      testCaseId: { type: "string" },
      actorId: { type: "string" },
      actor: { $ref: "#/$defs/actor" },
      access: { $ref: "#/$defs/access" },
      availability: { $ref: "#/$defs/availability" },
      query: { $ref: "#/$defs/query" },
      audit: { $ref: "#/$defs/audit" },
      page: { $ref: "#/$defs/page" },
      redaction: { $ref: "#/$defs/redaction" },
      diagnostics: {
        type: "array",
        items: { $ref: "#/$defs/diagnostic" }
      },
      items: {
        type: "array",
        items: { $ref: "#/$defs/record" }
      },
      policy: { $ref: "#/$defs/policy" }
    },
    $defs: {
      access: {
        type: "object",
        additionalProperties: false,
        required: ["scope", "projectScoped", "actorScoped", "mutation", "redacted"],
        properties: {
          scope: { type: "string", const: "test-cases:read" },
          projectScoped: { type: "boolean", const: true },
          actorScoped: { type: "boolean" },
          mutation: { type: "boolean", const: false },
          redacted: { type: "boolean", const: true }
        }
      },
      actor: {
        type: "object",
        additionalProperties: false,
        required: ["type", "actorId", "scoped"],
        properties: {
          type: { type: "string", const: "actor" },
          actorId: { type: "string" },
          scoped: { type: "boolean", const: true },
          displayName: { type: "string" }
        }
      },
      availability: {
        type: "object",
        additionalProperties: false,
        required: ["status", "projectScoped", "actorScoped", "redacted", "partial", "unavailable"],
        properties: {
          status: { type: "string", enum: ["ready", "partial", "empty", "denied"] },
          reason: { type: "string" },
          projectScoped: { type: "boolean", const: true },
          actorScoped: { type: "boolean" },
          redacted: { type: "boolean", const: true },
          partial: { type: "boolean" },
          unavailable: { type: "array", items: { type: "string" } }
        }
      },
      query: {
        type: "object",
        additionalProperties: false,
        required: [
          "projectId",
          "actorId",
          "testCaseScoped",
          "projectScoped",
          "actorScoped",
          "comparePairScoped",
          "pagination",
          "redacted"
        ],
        properties: {
          projectId: { type: "string" },
          actorId: { type: "string" },
          testCaseScoped: { type: "boolean", const: true },
          projectScoped: { type: "boolean", const: true },
          actorScoped: { type: "boolean", const: true },
          comparePairScoped: { type: "boolean" },
          pagination: {
            type: "object",
            additionalProperties: false,
            required: ["limit", "cursor", "offset"],
            properties: {
              limit: { type: "integer", minimum: 1, maximum: 500 },
              cursor: { type: ["string", "null"] },
              offset: { type: "integer", minimum: 0 }
            }
          },
          redacted: { type: "boolean", const: true }
        }
      },
      audit: {
        type: "object",
        additionalProperties: false,
        required: [
          "adapterKind",
          "boundary",
          "projectId",
          "actorScoped",
          "projectionDigest",
          "mutationBoundary",
          "replayedEventCount",
          "recordCount",
          "byDecision",
          "rawHistory"
        ],
        properties: {
          adapterKind: { type: "string" },
          boundary: { type: "string", const: "read-only-permission-audit-projection" },
          projectId: { type: "string" },
          actorScoped: { type: "boolean" },
          projectionDigest: { type: "string" },
          mutationBoundary: { type: "string", const: "read-only-no-rest-mutation" },
          replayedEventCount: { type: "integer", minimum: 0 },
          recordCount: { type: "integer", minimum: 0 },
          byDecision: { $ref: "#/$defs/decisionCounters" },
          actorCount: { type: "integer", minimum: 0 },
          compareCount: { type: "integer", minimum: 0 },
          testCaseCount: { type: "integer", minimum: 0 },
          rawHistory: { $ref: "#/$defs/rawHistorySummary" },
          firstOccurredAt: { type: "string" },
          lastOccurredAt: { type: "string" }
        }
      },
      decisionCounters: {
        type: "object",
        additionalProperties: false,
        required: ["denied", "partial", "ready"],
        properties: {
          denied: { type: "integer", minimum: 0 },
          partial: { type: "integer", minimum: 0 },
          ready: { type: "integer", minimum: 0 }
        }
      },
      rawHistorySummary: {
        type: "object",
        additionalProperties: false,
        required: ["included", "preserved", "itemCount"],
        properties: {
          included: { type: "boolean", const: false },
          preserved: { type: "boolean", const: true },
          digest: { type: "string" },
          digests: { type: "array", items: { type: "string" } },
          itemCount: { type: "integer", minimum: 0 }
        }
      },
      page: {
        type: "object",
        additionalProperties: false,
        required: ["limit", "cursor", "offset", "returned", "total", "nextCursor", "hasMore"],
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 500 },
          cursor: { type: ["string", "null"] },
          offset: { type: "integer", minimum: 0 },
          returned: { type: "integer", minimum: 0 },
          total: { type: "integer", minimum: 0 },
          nextCursor: { type: ["string", "null"] },
          hasMore: { type: "boolean" }
        }
      },
      redaction: {
        type: "object",
        additionalProperties: false,
        required: [
          "rawHistoryIncluded",
          "rawCompareInputsIncluded",
          "hiddenOrMaskedValuesIncluded",
          "tokensIncluded",
          "pathsIncluded",
          "storageLocationsIncluded",
          "artifactUrlsIncluded"
        ],
        properties: {
          rawHistoryIncluded: { type: "boolean", const: false },
          rawCompareInputsIncluded: { type: "boolean", const: false },
          hiddenOrMaskedValuesIncluded: { type: "boolean", const: false },
          tokensIncluded: { type: "boolean", const: false },
          pathsIncluded: { type: "boolean", const: false },
          storageLocationsIncluded: { type: "boolean", const: false },
          artifactUrlsIncluded: { type: "boolean", const: false }
        }
      },
      reason: {
        type: "object",
        additionalProperties: false,
        required: ["code", "severity", "explanation", "fields"],
        properties: {
          code: { type: "string" },
          severity: { type: "string", enum: ["info", "warn", "error"] },
          explanation: { type: "string" },
          fields: { type: "array", items: { type: "string" } }
        }
      },
      record: {
        type: "object",
        additionalProperties: false,
        required: [
          "compareId",
          "testCaseId",
          "actor",
          "decision",
          "reasons",
          "unavailable",
          "rawHistory",
          "eventCount",
          "redacted"
        ],
        properties: {
          compareId: { type: "string" },
          testCaseId: { type: "string" },
          actor: { $ref: "#/$defs/actor" },
          decision: { type: "string", enum: ["ready", "partial", "denied"] },
          reasons: { type: "array", items: { $ref: "#/$defs/reason" } },
          unavailable: { type: "array", items: { type: "string" } },
          rawHistory: { $ref: "#/$defs/rawHistorySummary" },
          eventCount: { type: "integer", minimum: 0 },
          sourcePage: { type: "object", additionalProperties: true },
          firstOccurredAt: { type: "string" },
          lastOccurredAt: { type: "string" },
          redacted: { type: "boolean", const: true }
        }
      },
      diagnostic: {
        type: "object",
        additionalProperties: false,
        properties: {
          code: { type: "string" },
          compareId: { type: "string" },
          projectScoped: { type: "boolean", const: true },
          actorScoped: { type: "boolean", const: true },
          redacted: { type: "boolean", const: true }
        }
      },
      policy: {
        type: "object",
        additionalProperties: false,
        required: [
          "projectIdRequired",
          "actorScopeForwarded",
          "mutationAllowed",
          "equalOrNarrowerThanRest",
          "rawHistoryIncluded",
          "rawCompareInputsIncluded",
          "deniedStateMasked"
        ],
        properties: {
          restParity: {
            type: "object",
            additionalProperties: false,
            required: ["method", "path"],
            properties: {
              method: { type: "string", const: "GET" },
              path: { type: "string" }
            }
          },
          projectIdRequired: { type: "boolean", const: true },
          actorScopeForwarded: { type: "boolean", const: true },
          comparePairOptional: { type: "boolean", const: true },
          mutationAllowed: { type: "boolean", const: false },
          equalOrNarrowerThanRest: { type: "boolean", const: true },
          rawHistoryIncluded: { type: "boolean", const: false },
          rawCompareInputsIncluded: { type: "boolean", const: false },
          deniedStateMasked: { type: "boolean", const: true },
          headersForwarded: { type: "array", items: { type: "string" } },
          omittedFields: { type: "array", items: { type: "string" } },
          redactionRules: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
} as const;
