export const schemaBasePart02 = {
  "test-case.history.compare": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryTestCaseHistoryComparePage",
    type: "object",
    additionalProperties: false,
    required: [
      "kind",
      "id",
      "testCaseId",
      "projectId",
      "access",
      "base",
      "target",
      "totalChanges",
      "returnedChanges",
      "omittedChanges",
      "page",
      "summary",
      "redaction",
      "changes",
      "policy"
    ],
    properties: {
      kind: { type: "string", const: "test-case-history-compare" },
      id: { type: "string" },
      testCaseId: { type: "string" },
      projectId: { type: "string" },
      actorId: { type: "string" },
      actor: { $ref: "#/$defs/actor" },
      access: { $ref: "#/$defs/access" },
      availability: { $ref: "#/$defs/availability" },
      identity: {
        type: "object",
        additionalProperties: true
      },
      base: { $ref: "#/$defs/point" },
      target: { $ref: "#/$defs/point" },
      totalChanges: { type: "integer", minimum: 0 },
      returnedChanges: { type: "integer", minimum: 0 },
      omittedChanges: { type: "integer", minimum: 0 },
      page: { $ref: "#/$defs/page" },
      summary: { $ref: "#/$defs/summary" },
      redaction: { $ref: "#/$defs/redaction" },
      enrichment: { $ref: "#/$defs/enrichment" },
      changes: {
        type: "array",
        items: { $ref: "#/$defs/change" }
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
          unavailable: {
            type: "array",
            items: { type: "string" }
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
      point: {
        type: "object",
        additionalProperties: true,
        required: [
          "launchId",
          "launchName",
          "launchCreatedAt",
          "resultUuid",
          "status",
          "identity",
          "attemptIndex",
          "attemptNumber",
          "parameterVariantSignature"
        ],
        properties: {
          launchId: { type: "string" },
          launchName: { type: "string" },
          launchCreatedAt: { type: "string" },
          resultUuid: { type: "string" },
          status: { type: "string" },
          branch: { type: "string" },
          buildNumber: { type: "string" },
          commitSha: { type: "string" },
          durationMs: { type: "integer", minimum: 0 },
          historyId: { type: "string" },
          identity: {
            type: "object",
            additionalProperties: true
          },
          attemptIndex: { type: "integer", minimum: 0 },
          attemptNumber: { type: "integer", minimum: 1 },
          parameterVariantSignature: { type: "string" }
        }
      },
      summary: {
        type: "object",
        additionalProperties: false,
        required: ["total", "added", "removed", "changed", "unchanged", "risk", "signal"],
        properties: {
          total: { type: "integer", minimum: 0 },
          added: { type: "integer", minimum: 0 },
          removed: { type: "integer", minimum: 0 },
          changed: { type: "integer", minimum: 0 },
          unchanged: { type: "integer", minimum: 0 },
          risk: { type: "integer", minimum: 0 },
          signal: { type: "integer", minimum: 0 }
        }
      },
      redaction: {
        type: "object",
        additionalProperties: false,
        required: [
          "rawResultsIncluded",
          "rawStatusDetailsIncluded",
          "hiddenOrMaskedValuesIncluded",
          "tokensIncluded",
          "pathsIncluded",
          "storageLocationsIncluded",
          "artifactUrlsIncluded"
        ],
        properties: {
          rawResultsIncluded: { type: "boolean", const: false },
          rawStatusDetailsIncluded: { type: "boolean", const: false },
          hiddenOrMaskedValuesIncluded: { type: "boolean", const: false },
          tokensIncluded: { type: "boolean", const: false },
          pathsIncluded: { type: "boolean", const: false },
          storageLocationsIncluded: { type: "boolean", const: false },
          artifactUrlsIncluded: { type: "boolean", const: false }
        }
      },
      enrichment: {
        type: "object",
        additionalProperties: false,
        required: ["status", "redacted", "fields", "unavailable"],
        properties: {
          status: { type: "string", enum: ["ready", "partial"] },
          redacted: { type: "boolean", const: true },
          fields: {
            type: "object",
            additionalProperties: { $ref: "#/$defs/enrichmentField" }
          },
          unavailable: {
            type: "array",
            items: { type: "string" }
          }
        }
      },
      enrichmentField: {
        type: "object",
        additionalProperties: false,
        required: ["status", "base", "target"],
        properties: {
          status: { type: "string", enum: ["ready", "partial", "unavailable"] },
          base: { type: "boolean" },
          target: { type: "boolean" }
        }
      },
      change: {
        type: "object",
        additionalProperties: false,
        required: [
          "kind",
          "subject",
          "change",
          "severity",
          "before",
          "after",
          "context",
          "explanation",
          "redacted"
        ],
        properties: {
          kind: { type: "string", enum: ["label", "executor", "branch", "build", "defect"] },
          subject: { type: "string" },
          change: { type: "string", enum: ["added", "removed", "changed", "unchanged"] },
          severity: { type: "string", enum: ["info", "signal", "risk"] },
          before: {
            type: "array",
            items: { type: "string" }
          },
          after: {
            type: "array",
            items: { type: "string" }
          },
          context: {
            type: "object",
            additionalProperties: {
              oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }]
            }
          },
          explanation: { type: "string" },
          redacted: { type: "boolean", const: true }
        }
      },
      policy: {
        type: "object",
        additionalProperties: false,
        required: [
          "projectIdRequired",
          "resultPairRequired",
          "mutationAllowed",
          "equalOrNarrowerThanRest",
          "rawPayloadsIncluded",
          "availabilityPreserved",
          "actorScopedAccessPreserved",
          "enrichedFieldsPreserved"
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
          actorIdPassThrough: { type: "boolean", const: true },
          resultPairRequired: { type: "boolean", const: true },
          mutationAllowed: { type: "boolean", const: false },
          equalOrNarrowerThanRest: { type: "boolean", const: true },
          rawPayloadsIncluded: { type: "boolean", const: false },
          maskedParametersPreserved: { type: "boolean", const: true },
          availabilityPreserved: { type: "boolean", const: true },
          actorScopedAccessPreserved: { type: "boolean", const: true },
          enrichedFieldsPreserved: {
            type: "array",
            items: { type: "string", enum: ["label", "executor", "branch", "build", "defect"] }
          },
          headersForwarded: {
            type: "array",
            items: { type: "string" }
          },
          omittedFields: {
            type: "array",
            items: { type: "string" }
          },
          redactionRules: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  }
} as const;
