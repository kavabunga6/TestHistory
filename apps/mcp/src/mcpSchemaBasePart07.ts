export const schemaBasePart07 = {
  "security-audit.read": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistorySecurityAuditRead",
    type: "object",
    additionalProperties: false,
    required: ["kind", "projectId", "access", "query", "page", "summary", "items", "policy"],
    properties: {
      kind: { type: "string", const: "security-audit-list" },
      projectId: { type: "string" },
      access: { $ref: "#/$defs/access" },
      query: { $ref: "#/$defs/query" },
      page: { $ref: "#/$defs/page" },
      summary: { $ref: "#/$defs/summary" },
      items: {
        type: "array",
        items: { $ref: "#/$defs/event" }
      },
      policy: { $ref: "#/$defs/policy" }
    },
    $defs: {
      access: {
        type: "object",
        additionalProperties: false,
        required: ["scope", "projectScoped", "mutation", "redacted"],
        properties: {
          scope: { const: "security:audit:read" },
          projectScoped: { const: true },
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
          type: {
            type: "string",
            enum: [
              "auth.login.succeeded",
              "auth.login.failed",
              "auth.logout",
              "auth.access.denied",
              "auth.role.changed",
              "auth.token.created",
              "auth.token.revoked",
              "auth.session.revoked",
              "auth.probe.accepted",
              "auth.probe.denied"
            ]
          },
          outcome: { type: "string", enum: ["allowed", "denied", "failed"] },
          severity: { type: "string", enum: ["info", "warn", "critical"] },
          limit: { type: "integer", minimum: 1, maximum: 500 },
          cursor: { type: ["string", "null"] }
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
      actor: {
        type: "object",
        additionalProperties: false,
        required: ["type"],
        properties: {
          type: { type: "string", enum: ["actor", "service", "system", "anonymous"] },
          actorId: { type: "string" },
          serviceId: { type: "string" },
          systemId: { type: "string" },
          externalId: { type: "string" },
          displayName: { type: "string" }
        }
      },
      request: {
        type: "object",
        additionalProperties: false,
        properties: {
          requestId: { type: "string" },
          traceId: { type: "string" },
          method: { type: "string" },
          route: { type: "string" }
        }
      },
      event: {
        type: "object",
        additionalProperties: false,
        required: [
          "schemaVersion",
          "id",
          "fingerprint",
          "projectId",
          "type",
          "outcome",
          "severity",
          "occurredAt",
          "actor"
        ],
        properties: {
          schemaVersion: { const: 1 },
          id: { type: "string" },
          fingerprint: { type: "string" },
          projectId: { type: "string" },
          type: { type: "string" },
          outcome: { type: "string", enum: ["allowed", "denied", "failed"] },
          severity: { type: "string", enum: ["info", "warn", "critical"] },
          occurredAt: { type: "string", format: "date-time" },
          actor: { $ref: "#/$defs/actor" },
          resource: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: { type: "string" },
              id: { type: "string" },
              name: { type: "string" }
            }
          },
          request: { $ref: "#/$defs/request" },
          reason: { type: "string" },
          metadata: { type: "object", additionalProperties: true }
        }
      },
      summary: {
        type: "object",
        additionalProperties: false,
        required: [
          "total",
          "allowed",
          "denied",
          "failed",
          "byType",
          "byOutcome",
          "bySeverity",
          "actorIds",
          "resourceIds"
        ],
        properties: {
          total: { type: "integer", minimum: 0 },
          allowed: { type: "integer", minimum: 0 },
          denied: { type: "integer", minimum: 0 },
          failed: { type: "integer", minimum: 0 },
          byType: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
          byOutcome: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
          bySeverity: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
          actorIds: { type: "array", items: { type: "string" } },
          resourceIds: { type: "array", items: { type: "string" } },
          firstOccurredAt: { type: "string", format: "date-time" },
          lastOccurredAt: { type: "string", format: "date-time" }
        }
      },
      policy: {
        type: "object",
        additionalProperties: false,
        required: [
          "projectIdRequired",
          "headersForwarded",
          "equalOrNarrowerThanRest",
          "mutationAllowed",
          "rawPayloadsIncluded",
          "redactionRules"
        ],
        properties: {
          restParity: { type: "object", additionalProperties: true },
          projectIdRequired: { const: true },
          headersForwarded: {
            type: "array",
            items: {
              type: "string",
              enum: ["X-TestHistory-Scopes", "X-TestHistory-Project-Scope"]
            }
          },
          equalOrNarrowerThanRest: { const: true },
          mutationAllowed: { const: false },
          rawPayloadsIncluded: { const: false },
          redactionRules: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  },
  "security-audit-export.evaluate": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistorySecurityAuditExportEvaluationRead",
    type: "object",
    additionalProperties: false,
    required: ["kind", "projectId", "actor", "access", "decision", "policy"],
    properties: {
      kind: { type: "string", const: "security-audit-export-policy-evaluation" },
      projectId: { type: "string" },
      actor: { $ref: "#/$defs/actor" },
      access: { $ref: "#/$defs/access" },
      decision: { $ref: "#/$defs/decision" },
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
          scope: { const: "security:audit:read" },
          projectScoped: { const: true },
          actorScoped: { const: true },
          mutation: { const: false },
          redacted: { const: true }
        }
      },
      range: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to", "days"],
        properties: {
          from: { type: "string", format: "date-time" },
          to: { type: "string", format: "date-time" },
          days: { type: "number" }
        }
      },
      destination: {
        type: "object",
        additionalProperties: false,
        required: ["type"],
        properties: {
          type: { const: "placeholder" }
        }
      },
      decisionRequest: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "actorId", "requestedAt", "range", "destination", "format"],
        properties: {
          projectId: { type: "string" },
          actorId: { type: "string" },
          requestedAt: { type: "string", format: "date-time" },
          range: { $ref: "#/$defs/range" },
          destination: { $ref: "#/$defs/destination" },
          format: { type: "string", enum: ["jsonl", "csv"] },
          criteria: { type: ["object", "array", "string", "number", "boolean", "null"] }
        }
      },
      reason: {
        type: "object",
        additionalProperties: false,
        required: ["code", "severity", "explanation", "fields"],
        properties: {
          code: { type: "string" },
          severity: { type: "string", enum: ["info", "deny"] },
          explanation: { type: "string" },
          fields: { type: "array", items: { type: "string" } }
        }
      },
      decision: {
        type: "object",
        additionalProperties: false,
        required: ["schemaVersion", "status", "allowed", "request", "limits", "reasons"],
        properties: {
          schemaVersion: { const: 1 },
          status: { type: "string", enum: ["allowed", "denied"] },
          allowed: { type: "boolean" },
          request: { $ref: "#/$defs/decisionRequest" },
          limits: {
            type: "object",
            additionalProperties: false,
            required: ["maxRangeDays"],
            properties: {
              maxRangeDays: { type: "number" }
            }
          },
          reasons: { type: "array", items: { $ref: "#/$defs/reason" } }
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
          "rawPayloadsIncluded",
          "credentialReferencesIncluded",
          "providerRuntimeMetadataIncluded",
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
          rawPayloadsIncluded: { const: false },
          credentialReferencesIncluded: { const: false },
          providerRuntimeMetadataIncluded: { const: false },
          redactionRules: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  }
} as const;
