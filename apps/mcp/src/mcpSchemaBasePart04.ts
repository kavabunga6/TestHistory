export const schemaBasePart04 = {
  "test-case.history.compare.permission-audit.replay.invariants": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryTestCaseHistoryComparePermissionAuditReplayInvariantPage",
    type: "object",
    additionalProperties: false,
    required: [
      "kind",
      "projectId",
      "testCaseId",
      "actor",
      "access",
      "availability",
      "query",
      "invariant",
      "appendOnly",
      "rawCompareInputs",
      "redaction",
      "page",
      "items",
      "policy"
    ],
    properties: {
      kind: {
        type: "string",
        const: "test-case-history-compare-permission-audit-replay-invariants"
      },
      projectId: { type: "string" },
      testCaseId: { type: "string" },
      actor: { $ref: "#/$defs/actor" },
      access: { $ref: "#/$defs/access" },
      availability: { $ref: "#/$defs/availability" },
      query: { $ref: "#/$defs/query" },
      invariant: { $ref: "#/$defs/invariant" },
      appendOnly: { $ref: "#/$defs/appendOnly" },
      rawCompareInputs: { $ref: "#/$defs/rawCompareInputs" },
      redaction: { $ref: "#/$defs/redaction" },
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
          type: { type: "string", const: "actor" },
          actorId: { type: "string" },
          scoped: { type: "boolean", const: true }
        }
      },
      access: {
        type: "object",
        additionalProperties: false,
        required: ["scope", "projectScoped", "actorScoped", "mutation", "redacted"],
        properties: {
          scope: { type: "string", const: "test-cases:read" },
          projectScoped: { type: "boolean", const: true },
          actorScoped: { type: "boolean", const: true },
          mutation: { type: "boolean", const: false },
          redacted: { type: "boolean", const: true }
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
          actorScoped: { type: "boolean", const: true },
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
          "testCaseId",
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
          testCaseId: { type: "string" },
          testCaseScoped: { type: "boolean", const: true },
          projectScoped: { type: "boolean", const: true },
          actorScoped: { type: "boolean", const: true },
          comparePairScoped: { type: "boolean" },
          pagination: { $ref: "#/$defs/pagination" },
          redacted: { type: "boolean", const: true }
        }
      },
      invariant: {
        type: "object",
        additionalProperties: false,
        required: [
          "boundary",
          "source",
          "consistency",
          "mutationBoundary",
          "deterministic",
          "recomputable",
          "projectScoped",
          "actorScoped",
          "projectionDigest",
          "recomputedDigest"
        ],
        properties: {
          boundary: {
            type: "string",
            const: "read-only-history-compare-permission-audit-replay-invariant"
          },
          source: {
            type: "string",
            const: "in-memory-history-compare-permission-audit-wip"
          },
          consistency: { type: "string", const: "append-only-replay" },
          mutationBoundary: { type: "string", const: "rest-read-only-no-replay-mutation" },
          deterministic: { type: "boolean" },
          recomputable: { type: "boolean" },
          projectScoped: { type: "boolean" },
          actorScoped: {
            type: "object",
            additionalProperties: false,
            required: ["requested", "passed", "actorId", "leakedActorIds"],
            properties: {
              requested: { type: "boolean", const: true },
              passed: { type: "boolean" },
              actorId: { type: "string" },
              leakedActorIds: { type: "array", items: { type: "string" } }
            }
          },
          projectionDigest: { type: "string" },
          recomputedDigest: { type: "string" }
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
      rawCompareInputs: {
        type: "object",
        additionalProperties: false,
        required: ["included", "preserved", "digestCount", "itemCount"],
        properties: {
          included: { type: "boolean", const: false },
          preserved: { type: "boolean" },
          digestCount: { type: "integer", minimum: 0 },
          itemCount: { type: "integer", minimum: 0 }
        }
      },
      redaction: {
        type: "object",
        additionalProperties: false,
        required: [
          "passed",
          "leakedMarkerCount",
          "leakedMarkers",
          "rawHistoryIncluded",
          "rawCompareInputsIncluded",
          "hiddenOrMaskedValuesIncluded",
          "tokensIncluded",
          "pathsIncluded",
          "storageLocationsIncluded",
          "artifactUrlsIncluded"
        ],
        properties: {
          passed: { type: "boolean" },
          leakedMarkerCount: { type: "integer", minimum: 0 },
          leakedMarkers: { type: "array", items: { type: "string" } },
          rawHistoryIncluded: { type: "boolean", const: false },
          rawCompareInputsIncluded: { type: "boolean", const: false },
          hiddenOrMaskedValuesIncluded: { type: "boolean", const: false },
          tokensIncluded: { type: "boolean", const: false },
          pathsIncluded: { type: "boolean", const: false },
          storageLocationsIncluded: { type: "boolean", const: false },
          artifactUrlsIncluded: { type: "boolean", const: false },
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
      item: {
        type: "object",
        additionalProperties: false,
        required: ["ordinal", "eventId", "redacted"],
        properties: {
          ordinal: { type: "integer", minimum: 0 },
          eventId: { type: "string" },
          redacted: { type: "boolean", const: true }
        }
      },
      policy: {
        type: "object",
        additionalProperties: false,
        required: [
          "projectIdRequired",
          "actorIdRequired",
          "testCaseScoped",
          "mutationAllowed",
          "equalOrNarrowerThanRest",
          "rawHistoryIncluded",
          "rawCompareInputsIncluded",
          "mcpReplayExecution",
          "mcpWorkerExecution",
          "providerRuntimeMetadataIncluded",
          "providerRuntimeToolsAdvertised",
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
          actorIdRequired: { type: "boolean", const: true },
          testCaseScoped: { type: "boolean", const: true },
          comparePairOptional: { type: "boolean", const: true },
          mutationAllowed: { type: "boolean", const: false },
          equalOrNarrowerThanRest: { type: "boolean", const: true },
          rawHistoryIncluded: { type: "boolean", const: false },
          rawCompareInputsIncluded: { type: "boolean", const: false },
          mcpReplayExecution: { type: "boolean", const: false },
          mcpWorkerExecution: { type: "boolean", const: false },
          providerRuntimeMetadataIncluded: { type: "boolean", const: false },
          providerRuntimeToolsAdvertised: { type: "boolean", const: false },
          persistedInvariantReadModel: { type: "boolean", const: true },
          deniedStateMasked: { type: "boolean", const: true },
          headersForwarded: { type: "array", items: { type: "string" } },
          omittedFields: { type: "array", items: { type: "string" } },
          redactionRules: { type: "array", items: { type: "string" } }
        }
      }
    }
  },
  "identity-correction.audit": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryIdentityCorrectionAuditPage",
    type: "object",
    additionalProperties: false,
    required: ["kind", "projectId", "query", "page", "events", "policy"],
    properties: {
      kind: { type: "string", const: "identity-correction-audit" },
      projectId: { type: "string" },
      actorId: { type: "string" },
      originType: { type: "string", enum: ["actor", "system"] },
      query: {
        type: "object",
        additionalProperties: false,
        required: ["limit", "cursor"],
        properties: {
          kind: {
            type: "string",
            enum: ["conservative_link", "split", "merge", "correction"]
          },
          beforeId: { type: "string" },
          afterId: { type: "string" },
          parameterVariantSignature: {
            type: "string",
            description:
              "Sanitized parameter variant signature. Masked values are ***, hidden values are omitted, and sensitive parameter names are redacted."
          },
          limit: { type: "integer", minimum: 1, maximum: 100 },
          cursor: { type: ["string", "null"] }
        }
      },
      page: { $ref: "#/$defs/page" },
      events: {
        type: "array",
        items: { $ref: "#/$defs/event" }
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
      origin: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "name"],
            properties: {
              type: { const: "system" },
              name: { type: "string" }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "actorId"],
            properties: {
              type: { const: "actor" },
              actorId: { type: "string" },
              displayName: { type: "string" }
            }
          }
        ]
      },
      scope: {
        type: "object",
        additionalProperties: false,
        properties: {
          launchId: { type: "string" },
          historyId: { type: "string" },
          parameterVariantSignature: { type: "string" }
        }
      },
      evidence: {
        type: "object",
        additionalProperties: false,
        properties: {
          launchId: { type: "string" },
          resultUuid: { type: "string" },
          historyId: { type: "string" },
          attemptIndex: { type: "integer", minimum: 0 },
          parameterVariantSignature: { type: "string" }
        }
      },
      event: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "projectId",
          "kind",
          "source",
          "confidence",
          "origin",
          "reason",
          "beforeIds",
          "afterIds",
          "evidence",
          "occurredAt"
        ],
        properties: {
          id: { type: "string" },
          projectId: { type: "string" },
          kind: {
            type: "string",
            enum: ["conservative_link", "split", "merge", "correction"]
          },
          source: {
            type: "string",
            enum: [
              "testCaseId",
              "fullName",
              "historyId",
              "name",
              "heuristic",
              "manual",
              "migration"
            ]
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          origin: { $ref: "#/$defs/origin" },
          reason: {
            type: "string",
            description: "MCP-safe reason. Sensitive-looking free text is replaced with [redacted]."
          },
          beforeIds: {
            type: "array",
            items: { type: "string" }
          },
          afterIds: {
            type: "array",
            items: { type: "string" }
          },
          scope: { $ref: "#/$defs/scope" },
          evidence: {
            type: "array",
            items: { $ref: "#/$defs/evidence" }
          },
          occurredAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          version: { type: "integer", minimum: 1 }
        }
      },
      policy: {
        type: "object",
        additionalProperties: false,
        required: [
          "projectIdRequired",
          "actorOriginRequiresActorId",
          "systemOriginProjectScoped",
          "mutationAllowed",
          "redactionRules"
        ],
        properties: {
          projectIdRequired: { const: true },
          actorOriginRequiresActorId: { const: true },
          systemOriginProjectScoped: { const: true },
          mutationAllowed: { const: false },
          redactionRules: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["field", "rule", "explanation"],
              properties: {
                field: {
                  type: "string",
                  enum: [
                    "origin",
                    "reason",
                    "beforeIds",
                    "afterIds",
                    "scope.parameterVariantSignature",
                    "evidence.parameterVariantSignature"
                  ]
                },
                rule: {
                  type: "string",
                  enum: ["project-scoped", "same-actor-only", "mcp-safe-redacted"]
                },
                explanation: { type: "string" }
              }
            }
          }
        }
      }
    }
  }
} as const;
