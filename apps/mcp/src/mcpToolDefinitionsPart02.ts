import type { ToolDefinition } from "./mcpTypes.js";

export const toolDefinitionsPart02 = [
  {
    name: "testhistory.defect-mute-projection.replay.invariants.materialized.read",
    description:
      "Reads materialized defect mute replay invariant summaries from REST as a paginated, project/actor-scoped, redacted, read-only MCP view without raw failure payloads, replay execution, or mutation access.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["projectId"],
      properties: {
        apiUrl: { type: "string" },
        projectId: {
          type: "string",
          minLength: 1,
          description: "Required project scope forwarded to REST and project-scope headers."
        },
        actorId: {
          type: "string",
          description: "Optional actor scope forwarded to REST as query and actor header."
        },
        limit: { type: "integer", minimum: 1, maximum: 500 },
        cursor: { type: "string" }
      }
    }
  },
  {
    name: "testhistory.security-audit.read",
    description:
      "Reads project-scoped security audit events through REST and returns a paginated, redacted, read-only MCP view.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["projectId"],
      properties: {
        apiUrl: { type: "string" },
        projectId: {
          type: "string",
          minLength: 1,
          description: "Required project scope forwarded to REST and audit project-scope headers."
        },
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
        cursor: { type: "string" }
      }
    }
  },
  {
    name: "testhistory.security-audit.export.evaluate",
    description:
      "Evaluates a project-scoped security audit export request through REST and returns a redacted, read-only, provider-neutral MCP view without starting an export.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["request"],
      properties: {
        apiUrl: { type: "string" },
        request: {
          type: "object",
          additionalProperties: true,
          required: ["projectId", "actorId", "requestedAt", "range", "destination"],
          properties: {
            projectId: {
              type: "string",
              minLength: 1,
              description: "Required project scope forwarded to REST and project-scope headers."
            },
            actorId: {
              type: "string",
              minLength: 1,
              description: "Required actor scope forwarded to REST and actor headers."
            },
            requestedAt: { type: "string" },
            range: {
              type: "object",
              additionalProperties: true,
              required: ["from", "to"],
              properties: {
                from: { type: "string" },
                to: { type: "string" }
              }
            },
            destination: {
              type: "object",
              additionalProperties: true,
              required: ["type"],
              properties: {
                type: { type: "string", enum: ["placeholder"] },
                secretRef: { type: "string" }
              }
            },
            format: { type: "string", enum: ["jsonl", "csv"] },
            criteria: {}
          }
        },
        policy: {
          type: "object",
          additionalProperties: true,
          properties: {
            enabled: { type: "boolean" },
            placeholderOnly: { type: "boolean" },
            requireSecretRef: { type: "boolean" },
            maxRangeDays: { type: "number", exclusiveMinimum: 0 },
            allowedProjectIds: { type: "array", items: { type: "string" } },
            allowedActorIds: { type: "array", items: { type: "string" } }
          }
        }
      }
    }
  },
  {
    name: "testhistory.security-audit.export.lifecycle.replay.invariants.read",
    description:
      "Reads project/actor-scoped security audit export lifecycle replay invariants through REST as a paginated, redacted, mutation-free MCP view without raw lifecycle events, request payloads, provider endpoints, signed URLs, local paths, or tokens.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["projectId", "actorId"],
      properties: {
        apiUrl: { type: "string" },
        projectId: {
          type: "string",
          minLength: 1,
          description: "Required project scope forwarded to REST and project-scope headers."
        },
        actorId: {
          type: "string",
          minLength: 1,
          description: "Required actor scope forwarded to REST query and actor headers."
        },
        limit: { type: "integer", minimum: 1, maximum: 500 },
        cursor: { type: "string" }
      }
    }
  },
  {
    name: "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.read",
    description:
      "Reads materialized project/actor-scoped security audit export lifecycle replay invariants through REST as a paginated, provider-neutral, redacted, mutation-free MCP view without export provider execution, destination resolution, credentials, raw lifecycle events, request payloads, signed URLs, local paths, or tokens.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["projectId", "actorId"],
      properties: {
        apiUrl: { type: "string" },
        projectId: {
          type: "string",
          minLength: 1,
          description: "Required project scope forwarded to REST and project-scope headers."
        },
        actorId: {
          type: "string",
          minLength: 1,
          description: "Required actor scope forwarded to REST query and actor headers."
        },
        limit: { type: "integer", minimum: 1, maximum: 500 },
        cursor: { type: "string" }
      }
    }
  },
  {
    name: "testhistory.archive-status.read",
    description:
      "Reads archive upload status through existing REST status endpoints with project/actor scope headers, pagination, and MCP redaction.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["projectId"],
      properties: {
        apiUrl: { type: "string" },
        projectId: {
          type: "string",
          minLength: 1,
          description: "Required project scope forwarded to REST as MCP project metadata."
        },
        actorId: {
          type: "string",
          description: "Optional actor scope forwarded to REST as MCP actor metadata."
        },
        launchId: {
          type: "string",
          minLength: 1,
          description: "When provided, reads /api/v1/launches/{launchId}/uploads/archive/status."
        },
        uploadId: {
          type: "string",
          minLength: 1,
          description: "When provided, reads /api/v1/uploads/{uploadId}/archive/status."
        },
        status: {
          type: "string",
          enum: ["queued", "processing", "completed", "completed_with_errors", "failed"]
        },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        cursor: { type: "string" },
        diagnosticsLimit: { type: "integer", minimum: 1, maximum: 100 },
        diagnosticsCursor: { type: "string" }
      }
    }
  },
  {
    name: "testhistory.archive-diagnostics.replay.read",
    description:
      "Reads paginated archive diagnostic replay summaries from REST with project/actor scope headers, MCP redaction, and no mutation or worker replay execution.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["launchId", "projectId"],
      properties: {
        apiUrl: { type: "string" },
        launchId: {
          type: "string",
          minLength: 1,
          description: "Launch whose archive diagnostic replay summaries are read."
        },
        projectId: {
          type: "string",
          minLength: 1,
          description: "Required project scope forwarded to REST project-scope headers."
        },
        actorId: {
          type: "string",
          description: "Optional actor scope forwarded to REST actor headers."
        },
        archiveRef: {
          type: "string",
          description: "Optional archive reference filter forwarded to REST."
        },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        cursor: { type: "string" }
      }
    }
  },
  {
    name: "testhistory.archive-diagnostics.replay.fixtures.read",
    description:
      "Reads paginated synthetic archive diagnostic replay fixture contracts from REST with project/actor scope headers, MCP redaction, and no archive payload, replay execution, or mutation access.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["projectId"],
      properties: {
        apiUrl: { type: "string" },
        projectId: {
          type: "string",
          minLength: 1,
          description: "Required project scope forwarded to REST project-scope headers."
        },
        actorId: {
          type: "string",
          description: "Optional actor scope forwarded to REST actor headers."
        },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        cursor: { type: "string" }
      }
    }
  },
  {
    name: "testhistory.archive-diagnostics.replay.fixtures.materialized.read",
    description:
      "Reads paginated materialized synthetic archive diagnostic replay fixture summaries from REST with project/actor scope headers, MCP redaction, and no archive payload, replay execution, worker, storage, or mutation access.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["projectId"],
      properties: {
        apiUrl: { type: "string" },
        projectId: {
          type: "string",
          minLength: 1,
          description: "Required project scope forwarded to REST project-scope headers."
        },
        actorId: {
          type: "string",
          description: "Optional actor scope forwarded to REST actor headers."
        },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        cursor: { type: "string" }
      }
    }
  },
  {
    name: "testhistory.attachment-preview-retention.preview",
    description:
      "Reads closed-launch attachment preview retention eligibility through REST and returns a paginated, redacted, page-scoped dry-run preview without deletion execution.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["launchId", "projectId"],
      properties: {
        apiUrl: { type: "string" },
        launchId: {
          type: "string",
          minLength: 1,
          description: "Closed launch whose attachment preview descriptors are previewed."
        },
        projectId: {
          type: "string",
          minLength: 1,
          description: "Required project scope forwarded to REST project-scope headers."
        },
        actorId: {
          type: "string",
          description: "Optional actor scope forwarded to REST actor headers."
        },
        status: {
          type: "string",
          enum: ["cleanup_eligible", "retained", "preserved"]
        },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        cursor: { type: "string" },
        batchSize: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description:
            "MCP-only dry-run page batch size. The REST read endpoint remains paginated by limit/cursor."
        }
      }
    }
  },
  {
    name: "testhistory.attachment-preview-retention.dry-run.schedule.read",
    description:
      "Reads worker-scheduled attachment preview retention dry-run schedule descriptor evidence through REST with project/actor scope headers, pagination, redaction, and no deletion execution.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["launchId", "projectId"],
      properties: {
        apiUrl: { type: "string" },
        launchId: {
          type: "string",
          minLength: 1,
          description: "Closed launch whose worker-scheduled retention dry-run batches are read."
        },
        projectId: {
          type: "string",
          minLength: 1,
          description: "Required project scope forwarded to REST project-scope headers."
        },
        actorId: {
          type: "string",
          description: "Optional actor scope forwarded to REST actor headers."
        },
        scheduleDigest: {
          type: "string",
          description: "Optional schedule digest filter forwarded to REST."
        },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        cursor: { type: "string" }
      }
    }
  },
  {
    name: "testhistory.test-results.find",
    description:
      "Finds imported test results for a launch using optional AQL-like filters. Current API scopes this through launch details.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["launchId"],
      properties: {
        apiUrl: { type: "string" },
        launchId: { type: "string", minLength: 1 },
        aql: {
          type: "string",
          description: "AQL-like filter, for example status in (failed, broken)."
        },
        query: { type: "string", description: "Free-text search query." },
        limit: { type: "integer", minimum: 1, maximum: 1000 }
      }
    }
  },
  {
    name: "testhistory.test-result.get",
    description:
      "Fetches one launch result detail payload from the configured API URL, preserving REST redaction semantics for masked and hidden parameters.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["launchId", "resultUuid"],
      properties: {
        apiUrl: { type: "string" },
        launchId: { type: "string", minLength: 1 },
        resultUuid: { type: "string", minLength: 1 }
      }
    }
  },
  {
    name: "testhistory.upload.policy",
    description: "Returns agent-facing upload workflow policy for TestHistory-compatible results.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {}
    }
  },
  {
    name: "testhistory.upload.session.schema",
    description:
      "Returns a JSON schema for describing an upload session before submitting results.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {}
    }
  },
  {
    name: "testhistory.quality-gate.rules",
    description: "Returns quality gate rules and interpretation guidance for uploaded launches.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {}
    }
  }
] satisfies ToolDefinition[];
