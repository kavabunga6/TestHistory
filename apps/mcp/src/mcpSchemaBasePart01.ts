export const schemaBasePart01 = {
  "query.aql": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryAqlLikeQuery",
    type: "object",
    additionalProperties: false,
    properties: {
      aql: {
        type: "string",
        description:
          "AQL-like filter expression reserved for TestHistory search endpoints, for example status in (failed, broken)."
      },
      query: {
        type: "string",
        description: "Free-text search query."
      },
      projectId: {
        type: "string",
        description: "Optional project scope."
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 1000
      }
    }
  },
  "auth.permission-denied": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryPermissionDeniedError",
    type: "object",
    additionalProperties: false,
    required: ["error", "message", "reason"],
    properties: {
      error: { const: "permission_denied" },
      message: { type: "string" },
      reason: {
        type: "string",
        enum: [
          "missing_token",
          "invalid_token",
          "insufficient_scope",
          "project_access_denied",
          "permission_denied"
        ]
      },
      requiredScopes: {
        type: "array",
        items: { type: "string" }
      },
      requiredRoles: {
        type: "array",
        items: { type: "string", enum: ["owner", "maintainer", "editor", "viewer", "ci"] }
      },
      requiredPermissions: {
        type: "array",
        items: { type: "string" }
      },
      projectId: { type: "string" },
      resource: {
        type: "object",
        additionalProperties: false,
        required: ["type"],
        properties: {
          type: {
            type: "string",
            enum: ["project", "launch", "test-case", "test-result", "artifact", "defect"]
          },
          id: { type: "string" }
        }
      },
      traceId: { type: "string" }
    }
  },
  "mcp.auth-capabilities": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryMcpAuthCapabilities",
    type: "object",
    additionalProperties: false,
    required: ["version", "tokenTransport", "noSecretsInManifest", "capabilities", "unsupported"],
    properties: {
      version: { type: "string" },
      tokenTransport: { const: "rest-authorization-header" },
      noSecretsInManifest: { const: true },
      capabilities: {
        type: "array",
        items: { $ref: "#/$defs/capability" }
      },
      unsupported: {
        type: "array",
        items: { $ref: "#/$defs/capability" }
      }
    },
    $defs: {
      capability: {
        type: "object",
        additionalProperties: false,
        required: ["name", "access", "requiredScopes", "projectScoped", "denialShape"],
        properties: {
          name: { type: "string" },
          access: { type: "string", enum: ["anonymous", "rest-authorized", "unsupported"] },
          requiredScopes: {
            type: "array",
            items: { type: "string" }
          },
          projectScoped: { type: "boolean" },
          restParity: {
            type: "object",
            additionalProperties: false,
            required: ["method", "path"],
            properties: {
              method: {
                type: "string",
                enum: ["GET", "POST", "PATCH", "PUT", "DELETE"]
              },
              path: { type: "string" }
            }
          },
          denialShape: { const: "PermissionDeniedError" },
          notes: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  },
  "project.create": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryCreateProject",
    type: "object",
    additionalProperties: false,
    required: ["key", "name"],
    properties: {
      key: {
        type: "string",
        minLength: 1,
        description: "Stable short key for the product, repository, or service under test."
      },
      name: {
        type: "string",
        minLength: 1,
        description: "Human-readable project name."
      }
    }
  },
  "launch.create": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryCreateLaunch",
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: {
      name: {
        type: "string",
        minLength: 1,
        description: "Human-readable run name, for example main #1842 or nightly chrome."
      },
      branch: { type: "string" },
      commitSha: {
        type: "string",
        pattern: "^[a-fA-F0-9]{7,40}$"
      },
      buildNumber: { type: "string" }
    }
  },
  "launch.summary": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryLaunchSummary",
    type: "object",
    additionalProperties: true,
    required: ["id", "projectId", "name", "status", "counters"],
    properties: {
      id: { type: "string" },
      projectId: { type: "string" },
      name: { type: "string" },
      status: { type: "string", enum: ["open", "closed"] },
      counters: { $ref: "#/$defs/statusCounters" }
    },
    $defs: {
      statusCounters: {
        type: "object",
        required: ["failed", "broken", "passed", "skipped", "unknown"],
        properties: {
          failed: { type: "integer", minimum: 0 },
          broken: { type: "integer", minimum: 0 },
          passed: { type: "integer", minimum: 0 },
          skipped: { type: "integer", minimum: 0 },
          unknown: { type: "integer", minimum: 0 }
        }
      }
    }
  },
  "launch.details": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryLaunchDetails",
    allOf: [{ $ref: "#/$defs/summary" }],
    $defs: {
      summary: {
        type: "object",
        additionalProperties: true,
        required: ["id", "projectId", "name", "status", "counters", "results"],
        properties: {
          id: { type: "string" },
          projectId: { type: "string" },
          name: { type: "string" },
          status: { type: "string", enum: ["open", "closed"] },
          counters: { $ref: "#/$defs/statusCounters" },
          results: {
            type: "array",
            items: { $ref: "#/$defs/testResult" }
          }
        }
      },
      statusCounters: {
        type: "object",
        required: ["failed", "broken", "passed", "skipped", "unknown"],
        properties: {
          failed: { type: "integer", minimum: 0 },
          broken: { type: "integer", minimum: 0 },
          passed: { type: "integer", minimum: 0 },
          skipped: { type: "integer", minimum: 0 },
          unknown: { type: "integer", minimum: 0 }
        }
      },
      testResult: {
        type: "object",
        additionalProperties: true,
        required: ["name", "status"],
        properties: {
          name: { type: "string" },
          fullName: { type: "string" },
          status: { type: "string", enum: ["failed", "broken", "passed", "skipped", "unknown"] },
          durationMs: { type: "integer", minimum: 0 },
          historyId: { type: "string" },
          testCaseId: { type: "string" }
        }
      }
    }
  },
  "test-case.summary": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryTestCaseSummary",
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "historyIds", "totalResults", "lastStatus", "passRate", "flakyScore"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      fullName: { type: "string" },
      historyIds: {
        type: "array",
        items: { type: "string" }
      },
      totalResults: { type: "integer", minimum: 0 },
      lastStatus: { type: "string", enum: ["failed", "broken", "passed", "skipped", "unknown"] },
      passRate: { type: "number", minimum: 0, maximum: 100 },
      flakyScore: { type: "number", minimum: 0, maximum: 100 },
      medianDurationMs: { type: "integer", minimum: 0 },
      p95DurationMs: { type: "integer", minimum: 0 },
      firstSeenAt: { type: "string", format: "date-time" },
      lastSeenAt: { type: "string", format: "date-time" }
    }
  },
  "test-case.details": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryTestCaseDetails",
    type: "object",
    additionalProperties: true,
    required: ["id", "name", "history"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      fullName: { type: "string" },
      history: {
        type: "array",
        items: { $ref: "#/$defs/historyPoint" }
      },
      testCase: {
        type: "object",
        additionalProperties: true,
        description:
          "Synchronized test case metadata from REST. Values originate from redacted normalized result read models."
      }
    },
    $defs: {
      historyPoint: {
        type: "object",
        additionalProperties: false,
        required: ["launchId", "launchName", "launchCreatedAt", "status"],
        properties: {
          launchId: { type: "string" },
          launchName: { type: "string" },
          launchCreatedAt: { type: "string", format: "date-time" },
          status: {
            type: "string",
            enum: ["failed", "broken", "passed", "skipped", "unknown"]
          },
          durationMs: { type: "integer", minimum: 0 },
          historyId: { type: "string" }
        }
      }
    }
  },
  "test-case.history": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryTestCaseHistoryPage",
    type: "object",
    additionalProperties: false,
    required: [
      "kind",
      "testCaseId",
      "totalPoints",
      "returnedPoints",
      "omittedPoints",
      "page",
      "points"
    ],
    properties: {
      kind: { type: "string", const: "test-case-history" },
      testCaseId: { type: "string" },
      projectId: { type: "string" },
      identity: { $ref: "#/$defs/identity" },
      totalPoints: { type: "integer", minimum: 0 },
      returnedPoints: { type: "integer", minimum: 0 },
      omittedPoints: { type: "integer", minimum: 0 },
      page: { $ref: "#/$defs/page" },
      points: {
        type: "array",
        items: { $ref: "#/$defs/historyPoint" }
      }
    },
    $defs: {
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
      identity: {
        type: "object",
        additionalProperties: false,
        required: ["value", "source", "confidence", "explanation"],
        properties: {
          value: { type: "string" },
          source: { type: "string", enum: ["testCaseId", "fullName", "historyId", "name"] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          explanation: { type: "string" }
        }
      },
      parameter: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: {
          name: { type: "string" },
          value: { type: "string" },
          excluded: { type: "boolean" },
          mode: { type: "string", enum: ["default", "masked", "hidden"] }
        }
      },
      statusDetails: {
        type: "object",
        additionalProperties: true,
        properties: {
          known: { type: "boolean" },
          muted: { type: "boolean" },
          flaky: { type: "boolean" },
          message: { type: "string" },
          trace: { type: "string" }
        }
      },
      historyPoint: {
        type: "object",
        additionalProperties: false,
        required: [
          "launchId",
          "launchName",
          "launchCreatedAt",
          "resultUuid",
          "status",
          "identity",
          "attemptIndex",
          "attemptNumber",
          "attemptKey",
          "parameterVariantSignature",
          "parameters",
          "retry",
          "flaky"
        ],
        properties: {
          launchId: { type: "string" },
          launchName: { type: "string" },
          launchCreatedAt: { type: "string", format: "date-time" },
          resultUuid: { type: "string" },
          testCaseId: { type: "string" },
          fullName: { type: "string" },
          status: {
            type: "string",
            enum: ["failed", "broken", "passed", "skipped", "unknown"]
          },
          durationMs: { type: "integer", minimum: 0 },
          historyId: { type: "string" },
          identity: { $ref: "#/$defs/identity" },
          attemptIndex: { type: "integer", minimum: 0 },
          attemptNumber: { type: "integer", minimum: 1 },
          attemptKey: { type: "string" },
          parameterVariantSignature: { type: "string" },
          parameters: {
            type: "array",
            items: { $ref: "#/$defs/parameter" }
          },
          retry: { type: "boolean" },
          flaky: { type: "boolean" },
          startedAt: { type: "integer", minimum: 0 },
          stoppedAt: { type: "integer", minimum: 0 },
          statusDetails: { $ref: "#/$defs/statusDetails" }
        }
      }
    }
  }
} as const;
