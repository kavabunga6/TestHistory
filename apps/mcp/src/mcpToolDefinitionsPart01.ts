import type { ToolDefinition } from "./mcpTypes.js";

export const toolDefinitionsPart01 = [
  {
    name: "testhistory.health",
    description: "Returns TestHistory MCP server health.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {}
    }
  },
  {
    name: "testhistory.discovery",
    description:
      "Returns a static TestHistory MCP/API discovery catalog for agent planning without requiring the API backend.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {}
    }
  },
  {
    name: "testhistory.openapi",
    description: "Returns the local OpenAPI document path for API discovery.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {}
    }
  },
  {
    name: "testhistory.capabilities",
    description: "Fetches TestHistory API capabilities from the configured API URL.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        apiUrl: { type: "string" }
      }
    }
  },
  {
    name: "testhistory.schemas",
    description:
      "Returns static JSON schemas for TestHistory API integration payloads and response shapes.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        schema: {
          type: "string",
          enum: [
            "query.aql",
            "project.create",
            "launch.create",
            "launch.summary",
            "launch.details",
            "test-case.summary",
            "test-case.details",
            "test-case.history",
            "test-case.history.compare",
            "test-case.history.compare.permission-audit",
            "test-case.history.compare.permission-audit.replay.invariants",
            "test-case.history.compare.permission-audit.replay.invariants.persisted",
            "identity-correction.audit",
            "defect-mute.read",
            "defect-mute.projection",
            "defect-mute.projection.replay",
            "defect-mute.projection.replay.invariants",
            "defect-mute.projection.replay.invariants.materialized",
            "security-audit.read",
            "security-audit-export.evaluate",
            "security-audit-export.lifecycle.replay.invariants",
            "security-audit-export.lifecycle.replay.invariants.materialized",
            "archive-status.read",
            "archive-diagnostics.replay",
            "archive-diagnostics.replay.fixtures",
            "archive-diagnostics.replay.fixtures.materialized",
            "attachment-preview-retention.preview",
            "attachment-preview-retention.dry-run.schedule",
            "test-case.mutation",
            "test-result.summary",
            "test-result.details",
            "auth.permission-denied",
            "mcp.auth-capabilities",
            "shared-step.mutation",
            "mute.mutation",
            "quality-gate.evaluation",
            "upload.session"
          ]
        }
      }
    }
  },
  {
    name: "testhistory.projects.find",
    description: "Finds projects using TestHistory API with optional AQL-like query parameters.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        apiUrl: { type: "string" },
        aql: { type: "string", description: "AQL-like filter, for example key = WEB." },
        query: { type: "string", description: "Free-text search query." },
        limit: { type: "integer", minimum: 1, maximum: 500 }
      }
    }
  },
  {
    name: "testhistory.launch.get",
    description:
      "Fetches launch details, counters, and imported results from the configured API URL.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["launchId"],
      properties: {
        apiUrl: { type: "string" },
        launchId: { type: "string", minLength: 1 }
      }
    }
  },
  {
    name: "testhistory.launch.quality-gate",
    description: "Evaluates the quality gate for a launch using the configured API URL.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["launchId"],
      properties: {
        apiUrl: { type: "string" },
        launchId: { type: "string", minLength: 1 }
      }
    }
  },
  {
    name: "testhistory.launch.summarize",
    description:
      "Reads one launch through REST and returns a compact summary first; result details and raw fields are included only when explicitly requested.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["launchId"],
      properties: {
        apiUrl: { type: "string" },
        launchId: { type: "string", minLength: 1 },
        includeDetails: { type: "boolean" },
        includeRaw: { type: "boolean" },
        resultLimit: { type: "integer", minimum: 1, maximum: 1000 }
      }
    }
  },
  {
    name: "testhistory.failures.recent",
    description:
      "Reads recent failed and broken results through REST, returning compact failure cards before any raw result payloads.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        apiUrl: { type: "string" },
        projectId: {
          type: "string",
          description: "Required for defect mute status reads unless launchId is provided."
        },
        launchId: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        cursor: { type: "string" },
        includeDetails: { type: "boolean" },
        includeRaw: { type: "boolean" }
      }
    }
  },
  {
    name: "testhistory.test-cases.list",
    description: "Deprecated alias for testhistory.test-cases.find.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        apiUrl: { type: "string" },
        projectId: { type: "string" },
        aql: { type: "string" },
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 500 }
      }
    }
  },
  {
    name: "testhistory.test-cases.find",
    description:
      "Finds test case summaries with pass rate, flakiness, and duration signals using optional AQL-like filters.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        apiUrl: { type: "string" },
        projectId: { type: "string" },
        aql: {
          type: "string",
          description: "AQL-like filter, for example status = failed and flakyScore > 0."
        },
        query: { type: "string", description: "Free-text search query." },
        limit: { type: "integer", minimum: 1, maximum: 500 }
      }
    }
  },
  {
    name: "testhistory.test-case.history",
    description:
      "Fetches chronological history points for a test case from the configured API URL.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["testCaseId"],
      properties: {
        apiUrl: { type: "string" },
        testCaseId: { type: "string", minLength: 1 },
        projectId: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 500 },
        cursor: { type: "string" },
        includeDetails: { type: "boolean" },
        includeRaw: { type: "boolean" }
      }
    }
  },
  {
    name: "testhistory.test-case.history.compare",
    description:
      "Fetches a paged history comparison for one test case from REST and returns an MCP-safe, equal-or-narrower diff page.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["testCaseId", "projectId", "baseResultUuid", "targetResultUuid"],
      properties: {
        apiUrl: { type: "string" },
        testCaseId: { type: "string", minLength: 1 },
        projectId: {
          type: "string",
          minLength: 1,
          description: "Required to preserve REST project scope."
        },
        baseResultUuid: {
          type: "string",
          minLength: 1,
          description: "Base history point result UUID forwarded to REST."
        },
        targetResultUuid: {
          type: "string",
          minLength: 1,
          description: "Target history point result UUID forwarded to REST."
        },
        includeUnchanged: {
          type: "boolean",
          description: "Forwarded to REST when agents need unchanged enriched signals."
        },
        actorId: {
          type: "string",
          description: "Optional actor scope forwarded as MCP actor metadata when available."
        },
        limit: { type: "integer", minimum: 1, maximum: 500 },
        cursor: { type: "string" }
      }
    }
  },
  {
    name: "testhistory.test-case.history.compare.permission-audit",
    description:
      "Fetches paginated actor/project-scoped history compare permission audit records from REST without raw history, hidden compare inputs, or mutation access.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["testCaseId", "projectId"],
      properties: {
        apiUrl: { type: "string" },
        testCaseId: { type: "string", minLength: 1 },
        projectId: {
          type: "string",
          minLength: 1,
          description: "Required to preserve REST project scope."
        },
        baseResultUuid: {
          type: "string",
          minLength: 1,
          description: "Optional base result UUID. Must be paired with targetResultUuid."
        },
        targetResultUuid: {
          type: "string",
          minLength: 1,
          description: "Optional target result UUID. Must be paired with baseResultUuid."
        },
        actorId: {
          type: "string",
          description: "Optional actor scope forwarded to REST as X-TestHistory-Actor-Id."
        },
        limit: { type: "integer", minimum: 1, maximum: 500 },
        cursor: { type: "string" }
      }
    }
  },
  {
    name: "testhistory.test-case.history.compare.permission-audit.replay.invariants.read",
    description:
      "Reads history compare permission audit replay invariant evidence from REST as a paginated actor/project/test-case scoped MCP view without raw compare inputs, raw history bodies, paths, storage refs, tokens, signed URLs, replay execution, or mutation access.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["testCaseId", "projectId", "actorId"],
      properties: {
        apiUrl: { type: "string" },
        testCaseId: { type: "string", minLength: 1 },
        projectId: {
          type: "string",
          minLength: 1,
          description: "Required project scope forwarded to REST and project-scope headers."
        },
        actorId: {
          type: "string",
          minLength: 1,
          description:
            "Required actor scope forwarded to REST as X-TestHistory-Actor-Id; MCP keeps the invariant read equal-or-narrower than REST."
        },
        baseResultUuid: {
          type: "string",
          minLength: 1,
          description: "Optional base result UUID. Must be paired with targetResultUuid."
        },
        targetResultUuid: {
          type: "string",
          minLength: 1,
          description: "Optional target result UUID. Must be paired with baseResultUuid."
        },
        limit: { type: "integer", minimum: 1, maximum: 500 },
        cursor: { type: "string" }
      }
    }
  },
  {
    name: "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.read",
    description:
      "Reads persisted history compare permission audit replay invariant evidence from REST as a paginated actor/project/test-case scoped MCP view without raw compare inputs, raw history bodies, local paths, storage refs, signed URLs, tokens, replay execution, provider/runtime tools, or mutation access.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["testCaseId", "projectId", "actorId"],
      properties: {
        apiUrl: { type: "string" },
        testCaseId: { type: "string", minLength: 1 },
        projectId: {
          type: "string",
          minLength: 1,
          description: "Required project scope forwarded to REST and project-scope headers."
        },
        actorId: {
          type: "string",
          minLength: 1,
          description:
            "Required actor scope forwarded to REST as X-TestHistory-Actor-Id; MCP keeps persisted invariant reads equal-or-narrower than REST."
        },
        baseResultUuid: {
          type: "string",
          minLength: 1,
          description: "Optional base result UUID. Must be paired with targetResultUuid."
        },
        targetResultUuid: {
          type: "string",
          minLength: 1,
          description: "Optional target result UUID. Must be paired with baseResultUuid."
        },
        limit: { type: "integer", minimum: 1, maximum: 500 },
        cursor: { type: "string" }
      }
    }
  },
  {
    name: "testhistory.test-case.get",
    description:
      "Fetches a test case detail view, including history and synchronized test case metadata, from the configured API URL.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["testCaseId"],
      properties: {
        apiUrl: { type: "string" },
        testCaseId: { type: "string", minLength: 1 },
        projectId: { type: "string" }
      }
    }
  },
  {
    name: "testhistory.identity-corrections.audit",
    description:
      "Reads identity correction audit metadata for one project through REST, preserving same-actor/system origin boundaries and MCP redaction rules.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["projectId"],
      properties: {
        apiUrl: { type: "string" },
        projectId: { type: "string", minLength: 1 },
        actorId: {
          type: "string",
          description: "Required for actor-origin reads; omitted only when originType is system."
        },
        originType: { type: "string", enum: ["actor", "system"] },
        kind: {
          type: "string",
          enum: ["conservative_link", "split", "merge", "correction"]
        },
        beforeId: { type: "string" },
        afterId: { type: "string" },
        parameterVariantSignature: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        cursor: { type: "string" }
      }
    }
  },
  {
    name: "testhistory.defect-mutes.find",
    description:
      "Reads defect mute status or launch quality-gate mute effects through REST and returns an MCP-safe, read-only view.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        apiUrl: { type: "string" },
        projectId: { type: "string" },
        launchId: {
          type: "string",
          description:
            "When provided, reads /api/v1/launches/{launchId}/quality-gate and returns mute effects."
        },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        cursor: { type: "string" }
      }
    }
  },
  {
    name: "testhistory.defect-mute-projection.read",
    description:
      "Reads the project-scoped defect mute projection from REST, preserving raw/effective read-model separation without executing replay or mutation work.",
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
        launchId: {
          type: "string",
          description: "Optional launch for projected quality-gate raw/effective fields."
        },
        status: { type: "string", enum: ["active", "inactive"] },
        limit: { type: "integer", minimum: 1, maximum: 500 },
        cursor: { type: "string" }
      }
    }
  },
  {
    name: "testhistory.defect-mute-projection.replay.read",
    description:
      "Reads replay-derived defect mute projection state from REST as a paginated, project/actor-scoped, redacted, read-only MCP view without executing replay or mutation work.",
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
        launchId: {
          type: "string",
          description: "Optional launch for projected quality-gate raw/effective fields."
        },
        status: { type: "string", enum: ["active", "inactive"] },
        limit: { type: "integer", minimum: 1, maximum: 500 },
        cursor: { type: "string" }
      }
    }
  },
  {
    name: "testhistory.defect-mute-projection.replay.invariants.read",
    description:
      "Reads defect mute replay invariant evidence from REST as a paginated, project/actor-scoped, redacted, read-only MCP view without raw failure payloads or mutation access.",
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
  }
] satisfies ToolDefinition[];
