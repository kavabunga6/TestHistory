export const schemaBasePart05 = {
  "defect-mute.read": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryDefectMuteRead",
    type: "object",
    additionalProperties: false,
    required: ["kind", "compact", "page", "policy"],
    properties: {
      kind: {
        type: "string",
        enum: ["defect-mute-status", "defect-mute-effects"]
      },
      compact: { const: true },
      scope: {
        type: "object",
        additionalProperties: false,
        properties: {
          projectId: { type: "string" },
          launchId: { type: "string" }
        }
      },
      page: { $ref: "#/$defs/page" },
      defects: {
        type: "array",
        items: { $ref: "#/$defs/defect" }
      },
      reasons: {
        type: "array",
        items: { $ref: "#/$defs/reason" }
      },
      effects: {
        type: "array",
        items: { $ref: "#/$defs/effect" }
      },
      policy: { $ref: "#/$defs/policy" }
    },
    $defs: {
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
      defect: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          projectId: { type: "string" },
          testCaseId: { type: "string" },
          status: { type: "string" },
          muted: { type: "boolean" },
          muteStatus: { type: "string" },
          activeMute: { type: "object", additionalProperties: true },
          mutes: { type: "array", items: { type: "object", additionalProperties: true } },
          effects: { type: "array", items: { $ref: "#/$defs/effect" } }
        }
      },
      reason: {
        type: "object",
        additionalProperties: false,
        properties: {
          code: { type: "string" },
          metric: { type: "string" },
          severity: { type: "string" },
          passed: { type: "boolean" },
          effectivePassed: { type: "boolean" },
          actual: { type: "number" },
          effectiveActual: { type: "number" },
          affectedTestCaseIds: { type: "array", items: { type: "string" } },
          affectedResultUuids: { type: "array", items: { type: "string" } },
          effects: { type: "array", items: { $ref: "#/$defs/effect" } }
        }
      },
      effect: {
        type: "object",
        additionalProperties: false,
        required: ["type", "ruleCode", "reasonCode", "muteIds"],
        properties: {
          type: { const: "defect_mute" },
          ruleCode: { type: "string" },
          reasonCode: { type: "string" },
          muteIds: { type: "array", items: { type: "string" } },
          affectedTestCaseIds: { type: "array", items: { type: "string" } },
          affectedSignatureHashes: { type: "array", items: { type: "string" } },
          originalActual: { type: "number" },
          effectiveActual: { type: "number" },
          explanation: { type: "string" }
        }
      },
      policy: {
        type: "object",
        additionalProperties: false,
        required: [
          "equalOrNarrowerThanRest",
          "mutationAllowed",
          "rawFailurePayloadsIncluded",
          "redactionRules"
        ],
        properties: {
          restParity: { type: "object", additionalProperties: true },
          equalOrNarrowerThanRest: { const: true },
          mutationAllowed: { const: false },
          rawFailurePayloadsIncluded: { const: false },
          redactionRules: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  },
  "defect-mute.projection": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryDefectMuteProjectionRead",
    type: "object",
    additionalProperties: false,
    required: [
      "kind",
      "compact",
      "scope",
      "access",
      "query",
      "projection",
      "page",
      "rawFailureHistory",
      "items",
      "policy"
    ],
    properties: {
      kind: { const: "defect-mute-projection" },
      compact: { const: true },
      scope: {
        type: "object",
        additionalProperties: false,
        required: ["projectId"],
        properties: {
          projectId: { type: "string" },
          actorId: { type: "string" },
          launchId: { type: "string" }
        }
      },
      access: { $ref: "#/$defs/access" },
      query: { $ref: "#/$defs/query" },
      projection: { $ref: "#/$defs/projection" },
      page: { $ref: "#/$defs/page" },
      rawFailureHistory: { $ref: "#/$defs/rawFailureHistory" },
      qualityGate: { $ref: "#/$defs/qualityGate" },
      items: {
        type: "array",
        items: { $ref: "#/$defs/item" }
      },
      policy: { $ref: "#/$defs/policy" }
    },
    $defs: {
      access: {
        type: "object",
        additionalProperties: false,
        required: ["scope", "projectScoped", "actorScoped", "mutation", "redacted"],
        properties: {
          scope: { const: "defects:read" },
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
          actorId: { type: "string" },
          launchId: { type: "string" },
          status: { type: "string", enum: ["active", "inactive"] },
          limit: { type: "integer", minimum: 1, maximum: 500 },
          cursor: { type: ["string", "null"] }
        }
      },
      projection: {
        type: "object",
        additionalProperties: false,
        required: [
          "source",
          "mcpReplayExecution",
          "mutationBoundary",
          "eventCount",
          "activeMuteCount",
          "inactiveMuteCount",
          "rawFailureOccurrenceCount"
        ],
        properties: {
          source: { const: "rest-defect-mute-projection-read" },
          adapterKind: { type: "string" },
          boundary: { type: "string" },
          consistency: { type: "string" },
          restReplayStatus: { type: "string" },
          projectionDigest: { type: "string" },
          mutationBoundary: { const: "worker-projection-only-no-rest-mutation" },
          mcpReplayExecution: { const: false },
          eventCount: { type: "integer", minimum: 0 },
          mutedEventCount: { type: "integer", minimum: 0 },
          unmutedEventCount: { type: "integer", minimum: 0 },
          activeMuteCount: { type: "integer", minimum: 0 },
          inactiveMuteCount: { type: "integer", minimum: 0 },
          rawFailureOccurrenceCount: { type: "integer", minimum: 0 },
          firstOccurredAt: { type: "string" },
          lastOccurredAt: { type: "string" }
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
      rawFailureHistory: {
        type: "object",
        additionalProperties: false,
        required: ["totalOccurrences"],
        properties: {
          totalOccurrences: { type: "integer", minimum: 0 },
          statusCounters: { type: "object", additionalProperties: { type: "integer" } },
          byTestId: { type: "object", additionalProperties: { type: "integer" } },
          bySignatureHash: { type: "object", additionalProperties: { type: "integer" } }
        }
      },
      qualityGate: {
        type: "object",
        additionalProperties: false,
        required: ["raw", "effective"],
        properties: {
          launchId: { type: "string" },
          raw: { type: "object", additionalProperties: true },
          effective: { type: "object", additionalProperties: true },
          distinction: { type: "string" }
        }
      },
      item: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          projectId: { type: "string" },
          status: { type: "string", enum: ["active", "inactive"] },
          origin: { type: "object", additionalProperties: true },
          mutedAt: { type: "string" },
          unmutedAt: { type: "string" },
          unmutedBy: { type: "object", additionalProperties: true },
          scope: { type: "object", additionalProperties: true },
          affectedSignatureHashes: { type: "array", items: { type: "string" } },
          affectedTestIds: { type: "array", items: { type: "string" } },
          rawFailureHistory: { $ref: "#/$defs/rawFailureHistory" },
          audit: { type: "object", additionalProperties: { type: "integer" } }
        }
      },
      policy: {
        type: "object",
        additionalProperties: false,
        required: [
          "equalOrNarrowerThanRest",
          "mutationAllowed",
          "mcpReplayExecution",
          "replayDerivedReadModel",
          "rawFailurePayloadsIncluded",
          "rawEffectiveSeparation"
        ],
        properties: {
          restParity: { type: "object", additionalProperties: true },
          headersForwarded: { type: "array", items: { type: "string" } },
          equalOrNarrowerThanRest: { const: true },
          mutationAllowed: { const: false },
          mcpReplayExecution: { const: false },
          replayDerivedReadModel: { const: true },
          rawFailurePayloadsIncluded: { const: false },
          rawEffectiveSeparation: { const: true },
          redactionRules: { type: "array", items: { type: "string" } }
        }
      }
    }
  },
  "defect-mute.projection.replay": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryDefectMuteProjectionReplayRead",
    type: "object",
    additionalProperties: false,
    required: [
      "kind",
      "compact",
      "scope",
      "access",
      "query",
      "projection",
      "page",
      "rawFailureHistory",
      "items",
      "policy"
    ],
    properties: {
      kind: { const: "defect-mute-projection" },
      compact: { const: true },
      scope: {
        type: "object",
        additionalProperties: false,
        required: ["projectId"],
        properties: {
          projectId: { type: "string" },
          actorId: { type: "string" },
          launchId: { type: "string" }
        }
      },
      access: { $ref: "#/$defs/access" },
      query: { $ref: "#/$defs/query" },
      projection: { $ref: "#/$defs/projection" },
      page: { $ref: "#/$defs/page" },
      rawFailureHistory: { $ref: "#/$defs/rawFailureHistory" },
      qualityGate: { type: "object", additionalProperties: true },
      items: {
        type: "array",
        items: { type: "object", additionalProperties: true }
      },
      policy: { $ref: "#/$defs/policy" }
    },
    $defs: {
      access: {
        type: "object",
        additionalProperties: false,
        required: ["scope", "projectScoped", "actorScoped", "mutation", "redacted"],
        properties: {
          scope: { const: "defects:read" },
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
          actorId: { type: "string" },
          launchId: { type: "string" },
          status: { type: "string", enum: ["active", "inactive"] },
          limit: { type: "integer", minimum: 1, maximum: 500 },
          cursor: { type: ["string", "null"] }
        }
      },
      projection: {
        type: "object",
        additionalProperties: false,
        required: [
          "source",
          "mcpReplayExecution",
          "mutationBoundary",
          "eventCount",
          "activeMuteCount",
          "inactiveMuteCount",
          "rawFailureOccurrenceCount"
        ],
        properties: {
          source: { const: "rest-defect-mute-projection-read" },
          restReplayStatus: { type: "string" },
          projectionDigest: { type: "string" },
          mutationBoundary: { const: "worker-projection-only-no-rest-mutation" },
          mcpReplayExecution: { const: false },
          eventCount: { type: "integer", minimum: 0 },
          mutedEventCount: { type: "integer", minimum: 0 },
          unmutedEventCount: { type: "integer", minimum: 0 },
          activeMuteCount: { type: "integer", minimum: 0 },
          inactiveMuteCount: { type: "integer", minimum: 0 },
          rawFailureOccurrenceCount: { type: "integer", minimum: 0 }
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
      rawFailureHistory: {
        type: "object",
        additionalProperties: false,
        required: ["totalOccurrences"],
        properties: {
          totalOccurrences: { type: "integer", minimum: 0 },
          statusCounters: { type: "object", additionalProperties: { type: "integer" } },
          byTestId: { type: "object", additionalProperties: { type: "integer" } },
          bySignatureHash: { type: "object", additionalProperties: { type: "integer" } }
        }
      },
      policy: {
        type: "object",
        additionalProperties: false,
        required: [
          "equalOrNarrowerThanRest",
          "mutationAllowed",
          "mcpReplayExecution",
          "replayDerivedReadModel",
          "rawFailurePayloadsIncluded",
          "rawEffectiveSeparation"
        ],
        properties: {
          restParity: { type: "object", additionalProperties: true },
          headersForwarded: { type: "array", items: { type: "string" } },
          equalOrNarrowerThanRest: { const: true },
          mutationAllowed: { const: false },
          mcpReplayExecution: { const: false },
          replayDerivedReadModel: { const: true },
          rawFailurePayloadsIncluded: { const: false },
          rawEffectiveSeparation: { const: true },
          redactionRules: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
} as const;
