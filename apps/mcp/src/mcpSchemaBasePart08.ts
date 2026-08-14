export const schemaBasePart08 = {
  "security-audit-export.lifecycle.replay.invariants": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistorySecurityAuditExportLifecycleReplayInvariantRead",
    type: "object",
    additionalProperties: false,
    required: [
      "kind",
      "project",
      "actor",
      "access",
      "replay",
      "execution",
      "page",
      "summary",
      "invariants",
      "items",
      "policy"
    ],
    properties: {
      kind: { const: "security-audit-export-lifecycle-replay-invariants" },
      project: { $ref: "#/$defs/project" },
      actor: { $ref: "#/$defs/actor" },
      access: { $ref: "#/$defs/access" },
      replay: { $ref: "#/$defs/replay" },
      execution: { $ref: "#/$defs/execution" },
      page: { $ref: "#/$defs/page" },
      summary: { $ref: "#/$defs/summary" },
      invariants: { $ref: "#/$defs/invariants" },
      items: {
        type: "array",
        items: { $ref: "#/$defs/item" }
      },
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
          scoped: { const: true }
        }
      },
      access: {
        type: "object",
        additionalProperties: false,
        required: ["scope", "projectScoped", "actorScoped", "mutation", "redacted"],
        properties: {
          scope: { const: "security:audit:read" },
          projectScoped: { const: true },
          actorScoped: { const: true },
          mutation: { const: false },
          redacted: { const: true }
        }
      },
      replay: {
        type: "object",
        additionalProperties: false,
        required: [
          "status",
          "eventCount",
          "requestCount",
          "duplicateCount",
          "ignoredCount",
          "projectionDigest",
          "appendOnly",
          "deterministic",
          "recomputable",
          "rawEventsExposed",
          "rawRequestsExposed",
          "providerNeutral"
        ],
        properties: {
          status: { type: "string", enum: ["empty", "replayed"] },
          eventCount: { type: "integer", minimum: 0 },
          requestCount: { type: "integer", minimum: 0 },
          duplicateCount: { type: "integer", minimum: 0 },
          ignoredCount: { type: "integer", minimum: 0 },
          projectionDigest: { type: "string" },
          appendOnly: { const: true },
          deterministic: { const: true },
          recomputable: { const: true },
          rawEventsExposed: { const: false },
          rawRequestsExposed: { const: false },
          providerNeutral: { const: true }
        }
      },
      execution: {
        type: "object",
        additionalProperties: false,
        required: [
          "exportStarted",
          "providerIntegration",
          "providerEndpointContacted",
          "credentialsResolved",
          "signedUrlsIssued",
          "destinationResolved"
        ],
        properties: {
          exportStarted: { const: false },
          providerIntegration: { const: false },
          providerEndpointContacted: { const: false },
          credentialsResolved: { const: false },
          signedUrlsIssued: { const: false },
          destinationResolved: { const: false }
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
      summary: {
        type: "object",
        additionalProperties: false,
        required: [
          "totalRequests",
          "requested",
          "evaluated",
          "approved",
          "denied",
          "cancelled",
          "expired"
        ],
        properties: {
          totalRequests: { type: "integer", minimum: 0 },
          requested: { type: "integer", minimum: 0 },
          evaluated: { type: "integer", minimum: 0 },
          approved: { type: "integer", minimum: 0 },
          denied: { type: "integer", minimum: 0 },
          cancelled: { type: "integer", minimum: 0 },
          expired: { type: "integer", minimum: 0 }
        }
      },
      invariants: {
        type: "object",
        additionalProperties: false,
        required: [
          "appendOnly",
          "deterministic",
          "projectScoped",
          "actorScoped",
          "redacted",
          "mutationFree",
          "providerNeutral",
          "rawEventsExposed",
          "rawRequestsExposed",
          "providerEndpointsContacted",
          "signedUrlsIssued",
          "secretsExposed"
        ],
        properties: {
          appendOnly: { const: true },
          deterministic: { const: true },
          projectScoped: { const: true },
          actorScoped: { const: true },
          redacted: { const: true },
          mutationFree: { const: true },
          providerNeutral: { const: true },
          rawEventsExposed: { const: false },
          rawRequestsExposed: { const: false },
          providerEndpointsContacted: { const: false },
          signedUrlsIssued: { const: false },
          secretsExposed: { const: false }
        }
      },
      timeline: {
        type: "object",
        additionalProperties: false,
        properties: {
          requestedAt: { type: "string", format: "date-time" },
          evaluatedAt: { type: "string", format: "date-time" },
          decidedAt: { type: "string", format: "date-time" },
          cancelledAt: { type: "string", format: "date-time" },
          expiredAt: { type: "string", format: "date-time" }
        }
      },
      item: {
        type: "object",
        additionalProperties: false,
        required: ["requestId", "status", "eventCount", "actorIds", "reasonCodes", "timeline"],
        properties: {
          requestId: { type: "string" },
          status: {
            type: "string",
            enum: ["requested", "evaluated", "approved", "denied", "cancelled", "expired"]
          },
          eventCount: { type: "integer", minimum: 0 },
          lastEventAt: { type: "string", format: "date-time" },
          actorIds: { type: "array", items: { type: "string" } },
          decisionStatus: { type: "string", enum: ["allowed", "denied"] },
          reasonCodes: { type: "array", items: { type: "string" } },
          timeline: { $ref: "#/$defs/timeline" }
        }
      },
      policy: {
        type: "object",
        additionalProperties: false,
        required: [
          "restParity",
          "projectIdRequired",
          "actorIdRequired",
          "headersForwarded",
          "equalOrNarrowerThanRest",
          "providerNeutral",
          "mutationAllowed",
          "mcpReplayExecution",
          "rawLifecycleEventsIncluded",
          "rawRequestPayloadsIncluded",
          "providerEndpointsIncluded",
          "signedUrlsIncluded",
          "credentialReferencesIncluded",
          "redactionRules"
        ],
        properties: {
          restParity: { type: "object", additionalProperties: true },
          projectIdRequired: { const: true },
          actorIdRequired: { const: true },
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
          providerNeutral: { const: true },
          mutationAllowed: { const: false },
          mcpReplayExecution: { const: false },
          rawLifecycleEventsIncluded: { const: false },
          rawRequestPayloadsIncluded: { const: false },
          providerEndpointsIncluded: { const: false },
          signedUrlsIncluded: { const: false },
          credentialReferencesIncluded: { const: false },
          redactionRules: { type: "array", items: { type: "string" } }
        }
      }
    }
  },
  "archive-status.read": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryArchiveStatusRead",
    type: "object",
    additionalProperties: false,
    required: ["kind", "scope", "access", "query", "policy"],
    properties: {
      kind: {
        type: "string",
        enum: ["archive-upload-status-list", "archive-upload-status"]
      },
      scope: { $ref: "#/$defs/scope" },
      access: { $ref: "#/$defs/access" },
      query: { $ref: "#/$defs/query" },
      launch: { type: "object", additionalProperties: false },
      processing: { type: "object", additionalProperties: true },
      page: { $ref: "#/$defs/page" },
      summary: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
      diagnostics: { $ref: "#/$defs/diagnostics" },
      items: {
        type: "array",
        items: { $ref: "#/$defs/status" }
      },
      status: { $ref: "#/$defs/status" },
      policy: { $ref: "#/$defs/policy" }
    },
    $defs: {
      scope: {
        type: "object",
        additionalProperties: false,
        required: ["projectId"],
        properties: {
          projectId: { type: "string" },
          actorId: { type: "string" },
          launchId: { type: "string" },
          uploadId: { type: "string" }
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
        properties: {
          status: {
            type: "string",
            enum: ["queued", "processing", "completed", "completed_with_errors", "failed"]
          },
          limit: { type: "integer", minimum: 1, maximum: 100 },
          cursor: { type: ["string", "null"] },
          diagnosticsLimit: { type: "integer", minimum: 1, maximum: 100 },
          diagnosticsCursor: { type: ["string", "null"] }
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
      diagnostics: {
        type: "object",
        additionalProperties: false,
        required: ["page", "items"],
        properties: {
          page: { $ref: "#/$defs/page" },
          items: {
            type: "array",
            items: { $ref: "#/$defs/diagnostic" }
          }
        }
      },
      diagnostic: {
        type: "object",
        additionalProperties: false,
        properties: {
          scope: { type: "string", enum: ["archive", "entry"] },
          severity: { type: "string", enum: ["info", "warning", "error"] },
          code: { type: "string" },
          message: { type: "string" },
          index: { type: "integer", minimum: 0 },
          kind: { type: "string" }
        }
      },
      status: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "id", "launchId", "status", "phase"],
        properties: {
          kind: { const: "archive-upload-status" },
          id: { type: "string" },
          launchId: { type: "string" },
          status: {
            type: "string",
            enum: ["queued", "processing", "completed", "completed_with_errors", "failed"]
          },
          phase: {
            type: "string",
            enum: ["queued", "processing", "completed", "partial_success", "failed"]
          },
          progress: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
          archive: { type: "object", additionalProperties: true },
          worker: { type: "object", additionalProperties: true },
          diagnostics: { $ref: "#/$defs/diagnostics" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      policy: {
        type: "object",
        additionalProperties: false,
        required: [
          "projectIdRequired",
          "actorIdPassThrough",
          "headersForwarded",
          "equalOrNarrowerThanRest",
          "mutationAllowed",
          "rawPayloadsIncluded",
          "rawPathsIncluded",
          "storageKeysIncluded",
          "signedUrlsIncluded",
          "diagnosticsBounded",
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
          rawPayloadsIncluded: { const: false },
          rawPathsIncluded: { const: false },
          storageKeysIncluded: { const: false },
          signedUrlsIncluded: { const: false },
          diagnosticsBounded: { const: true },
          redactionRules: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  }
} as const;
