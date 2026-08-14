export const schemaBasePart06 = {
  "defect-mute.projection.replay.invariants": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryDefectMuteReplayInvariantRead",
    type: "object",
    additionalProperties: false,
    required: [
      "kind",
      "compact",
      "scope",
      "access",
      "query",
      "invariant",
      "rawEffectiveSeparation",
      "appendOnly",
      "redaction",
      "page",
      "items",
      "policy"
    ],
    properties: {
      kind: { const: "defect-mute-replay-invariant" },
      compact: { const: true },
      scope: {
        type: "object",
        additionalProperties: false,
        required: ["projectId"],
        properties: {
          projectId: { type: "string" },
          actorId: { type: "string" }
        }
      },
      access: { $ref: "#/$defs/access" },
      query: { $ref: "#/$defs/query" },
      invariant: { $ref: "#/$defs/invariant" },
      rawEffectiveSeparation: { $ref: "#/$defs/rawEffectiveSeparation" },
      appendOnly: { $ref: "#/$defs/appendOnly" },
      redaction: { $ref: "#/$defs/redaction" },
      page: { $ref: "#/$defs/page" },
      items: {
        type: "array",
        items: { $ref: "#/$defs/eventRef" }
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
          limit: { type: "integer", minimum: 1, maximum: 500 },
          cursor: { type: ["string", "null"] }
        }
      },
      invariant: {
        type: "object",
        additionalProperties: false,
        required: [
          "source",
          "mutationBoundary",
          "mcpReplayExecution",
          "deterministic",
          "recomputable",
          "projectScoped"
        ],
        properties: {
          boundary: { const: "read-only-defect-mute-replay-invariant" },
          source: { const: "worker-local-mute-projection" },
          consistency: { const: "append-only-replay" },
          mutationBoundary: { const: "rest-read-only-no-replay-mutation" },
          mcpReplayExecution: { const: false },
          deterministic: { type: "boolean" },
          recomputable: { type: "boolean" },
          projectScoped: { type: "boolean" },
          projectionDigest: { type: "string" },
          recomputedDigest: { type: "string" }
        }
      },
      rawEffectiveSeparation: {
        type: "object",
        additionalProperties: false,
        required: [
          "effectiveStateExcludesRawFailureHistory",
          "rawFailureHistoryPreserved",
          "rawFailureHistoryNotMutatedByUnmute",
          "rawFailureOccurrenceCount",
          "effectiveRecordCount"
        ],
        properties: {
          effectiveStateExcludesRawFailureHistory: { type: "boolean" },
          rawFailureHistoryPreserved: { type: "boolean" },
          rawFailureHistoryNotMutatedByUnmute: { type: "boolean" },
          rawFailureOccurrenceCount: { type: "integer", minimum: 0 },
          effectiveRecordCount: { type: "integer", minimum: 0 },
          documentation: { type: "string" }
        }
      },
      appendOnly: {
        type: "object",
        additionalProperties: false,
        required: ["uniqueProjectedEventIds", "duplicateEventIds", "totalProjectedEventIds"],
        properties: {
          uniqueProjectedEventIds: { type: "boolean" },
          duplicateEventIds: { type: "array", items: { type: "string" } },
          totalProjectedEventIds: { type: "integer", minimum: 0 }
        }
      },
      redaction: {
        type: "object",
        additionalProperties: false,
        required: ["passed", "leakedMarkers"],
        properties: {
          passed: { type: "boolean" },
          leakedMarkers: { type: "array", items: { type: "string" } },
          policy: { type: "string" }
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
      eventRef: {
        type: "object",
        additionalProperties: false,
        required: ["ordinal", "eventId"],
        properties: {
          ordinal: { type: "integer", minimum: 0 },
          eventId: { type: "string" }
        }
      },
      policy: {
        type: "object",
        additionalProperties: false,
        required: [
          "equalOrNarrowerThanRest",
          "mutationAllowed",
          "mcpReplayExecution",
          "replayInvariantReadModel",
          "rawFailurePayloadsIncluded",
          "rawEffectiveSeparation"
        ],
        properties: {
          restParity: { type: "object", additionalProperties: true },
          headersForwarded: { type: "array", items: { type: "string" } },
          equalOrNarrowerThanRest: { const: true },
          mutationAllowed: { const: false },
          mcpReplayExecution: { const: false },
          replayInvariantReadModel: { const: true },
          rawFailurePayloadsIncluded: { const: false },
          rawEffectiveSeparation: { const: true },
          deniedStateMasked: { const: true },
          redactionRules: { type: "array", items: { type: "string" } }
        }
      }
    }
  },
  "defect-mute.projection.replay.invariants.materialized": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryDefectMuteReplayInvariantMaterializedRead",
    type: "object",
    additionalProperties: false,
    required: [
      "kind",
      "compact",
      "projectId",
      "access",
      "availability",
      "query",
      "materialization",
      "summary",
      "page",
      "items",
      "policy"
    ],
    properties: {
      kind: { const: "defect-mute-replay-invariant-materialized-read" },
      compact: { const: true },
      projectId: { type: "string" },
      actor: { $ref: "#/$defs/actor" },
      access: { $ref: "#/$defs/access" },
      availability: { $ref: "#/$defs/availability" },
      query: { $ref: "#/$defs/query" },
      materialization: { $ref: "#/$defs/materialization" },
      summary: { $ref: "#/$defs/summary" },
      page: { $ref: "#/$defs/page" },
      items: { type: "array", items: { $ref: "#/$defs/item" } },
      policy: { $ref: "#/$defs/policy" }
    },
    $defs: {
      actor: {
        type: "object",
        additionalProperties: false,
        required: ["type", "actorId", "scoped"],
        properties: {
          type: { const: "actor" },
          actorId: { type: "string" },
          scoped: { const: true }
        }
      },
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
      availability: {
        type: "object",
        additionalProperties: false,
        required: ["status", "projectScoped", "actorScoped", "redacted", "partial", "unavailable"],
        properties: {
          status: { enum: ["ready", "partial", "empty", "denied"] },
          reason: { type: "string" },
          projectScoped: { const: true },
          actorScoped: { type: "boolean" },
          redacted: { const: true },
          partial: { type: "boolean" },
          unavailable: { type: "array", items: { type: "string" } }
        }
      },
      query: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "limit", "cursor"],
        properties: {
          projectId: { type: "string" },
          actorId: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 500 },
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
          "rawFailurePayloadsIncluded",
          "mutationBoundary",
          "materializedRecordCount",
          "materializationDigest"
        ],
        properties: {
          adapterKind: { const: "api-read-model-defect-mute-replay-invariant-materialized-wip" },
          boundary: { const: "worker-compatible-defect-mute-replay-invariant-materialized-read" },
          consistency: { const: "retry-safe-idempotent-projected-mute-state" },
          source: { const: "projected-defect-mute-state" },
          readOnly: { const: true },
          rawFailurePayloadsIncluded: { const: false },
          mutationBoundary: { const: "rest-read-only-no-worker-or-replay-mutation" },
          materializedAt: { type: "string" },
          materializedRecordCount: { type: "integer", minimum: 0 },
          materializationDigest: { type: "string" }
        }
      },
      summary: {
        type: "object",
        additionalProperties: false,
        required: [
          "projectId",
          "materializedRecordCount",
          "deterministic",
          "recomputable",
          "projectScoped",
          "redactionPassed",
          "rawFailureOccurrenceCount",
          "effectiveRecordCount",
          "projectedMuteStateCompatible",
          "mutationBoundary",
          "plannedOperations"
        ],
        properties: {
          projectId: { type: "string" },
          materializedRecordCount: { type: "integer", minimum: 0 },
          deterministic: { type: "boolean" },
          recomputable: { type: "boolean" },
          projectScoped: { type: "boolean" },
          appendOnlyUniqueProjectedEventIds: { type: "boolean" },
          redactionPassed: { type: "boolean" },
          effectiveStateExcludesRawFailureHistory: { type: "boolean" },
          rawFailureHistoryPreserved: { type: "boolean" },
          rawFailureHistoryNotMutatedByUnmute: { type: "boolean" },
          rawFailureOccurrenceCount: { type: "integer", minimum: 0 },
          effectiveRecordCount: { type: "integer", minimum: 0 },
          materializationDigest: { type: "string" },
          projectedMuteStateCompatible: { const: true },
          mutationBoundary: { const: "api-materialized-read-only-no-rest-or-worker-mutation" },
          plannedOperations: {
            type: "array",
            items: {
              enum: [
                "defect_mute.replay_invariant.summarize",
                "defect_mute.replay_invariant.materialized_read"
              ]
            }
          }
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
      item: {
        type: "object",
        additionalProperties: false,
        required: [
          "invariantRef",
          "projectId",
          "source",
          "materializedAt",
          "deterministic",
          "recomputable",
          "projectScoped",
          "appendOnly",
          "redaction",
          "rawEffectiveSeparation",
          "projectionDigest",
          "recomputedDigest",
          "evidenceDigest"
        ],
        properties: {
          invariantRef: { type: "string" },
          projectId: { type: "string" },
          source: { const: "projected-defect-mute-state" },
          materializedAt: { type: "string" },
          deterministic: { type: "boolean" },
          recomputable: { type: "boolean" },
          projectScoped: { type: "boolean" },
          appendOnly: { type: "object", additionalProperties: true },
          redaction: { type: "object", additionalProperties: true },
          rawEffectiveSeparation: { type: "object", additionalProperties: true },
          projectionDigest: { type: "string" },
          recomputedDigest: { type: "string" },
          evidenceDigest: { type: "string" }
        }
      },
      policy: {
        type: "object",
        additionalProperties: false,
        required: [
          "equalOrNarrowerThanRest",
          "mutationAllowed",
          "mcpReplayExecution",
          "mcpWorkerExecution",
          "materializedInvariantReadModel",
          "rawFailurePayloadsIncluded",
          "deniedStateMasked"
        ],
        properties: {
          restParity: { type: "object", additionalProperties: true },
          headersForwarded: { type: "array", items: { type: "string" } },
          equalOrNarrowerThanRest: { const: true },
          mutationAllowed: { const: false },
          mcpReplayExecution: { const: false },
          mcpWorkerExecution: { const: false },
          materializedInvariantReadModel: { const: true },
          rawFailurePayloadsIncluded: { const: false },
          deniedStateMasked: { const: true },
          redactionRules: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
} as const;
