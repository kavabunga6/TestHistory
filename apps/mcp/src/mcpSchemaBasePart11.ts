export const schemaBasePart11 = {
  "attachment-preview-retention.preview": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryAttachmentPreviewRetentionDryRunPreview",
    type: "object",
    additionalProperties: false,
    required: [
      "kind",
      "scope",
      "access",
      "query",
      "boundary",
      "execution",
      "page",
      "summary",
      "items",
      "dryRunPlan",
      "policy"
    ],
    properties: {
      kind: { const: "attachment-preview-retention-dry-run-preview" },
      scope: { $ref: "#/$defs/scope" },
      launch: { type: "object", additionalProperties: false },
      access: { $ref: "#/$defs/access" },
      query: { $ref: "#/$defs/query" },
      boundary: { $ref: "#/$defs/boundary" },
      execution: { $ref: "#/$defs/execution" },
      page: { $ref: "#/$defs/page" },
      summary: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
      items: {
        type: "array",
        items: { $ref: "#/$defs/item" }
      },
      dryRunPlan: { $ref: "#/$defs/dryRunPlan" },
      policy: { $ref: "#/$defs/policy" }
    },
    $defs: {
      scope: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "launchId"],
        properties: {
          projectId: { type: "string" },
          launchId: { type: "string" },
          actorId: { type: "string" }
        }
      },
      access: {
        type: "object",
        additionalProperties: false,
        required: ["scope", "projectScoped", "mutation", "redacted"],
        properties: {
          scope: { const: "artifacts:read" },
          projectScoped: { const: true },
          actorScoped: { type: "boolean" },
          mutation: { const: false },
          redacted: { const: true }
        }
      },
      query: {
        type: "object",
        additionalProperties: false,
        required: ["limit", "cursor", "batchSize"],
        properties: {
          status: { type: "string", enum: ["cleanup_eligible", "retained", "preserved"] },
          limit: { type: "integer", minimum: 1, maximum: 100 },
          cursor: { type: ["string", "null"] },
          batchSize: { type: "integer", minimum: 1, maximum: 500 }
        }
      },
      boundary: {
        type: "object",
        additionalProperties: false,
        required: [
          "scope",
          "eligibleLaunchStatus",
          "closedLaunchScoped",
          "descriptorSource",
          "rawMaterialReturned"
        ],
        properties: {
          scope: { const: "closed-launch" },
          eligibleLaunchStatus: { const: "closed" },
          closedLaunchScoped: { const: true },
          descriptorSource: { const: "artifact-preview-descriptor-read-model" },
          rawMaterialReturned: { const: false }
        }
      },
      execution: {
        type: "object",
        additionalProperties: false,
        required: [
          "dryRun",
          "executionMode",
          "deletionStarted",
          "deletionMutation",
          "deletionExecution",
          "providerActions",
          "objectStorageTouched",
          "deleteRequestedCount"
        ],
        properties: {
          dryRun: { const: true },
          executionMode: { const: "dry-run" },
          deletionStarted: { const: false },
          deletionMutation: { const: false },
          deletionExecution: { const: false },
          providerActions: { const: false },
          objectStorageTouched: { const: false },
          deleteRequestedCount: { const: 0 }
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
      item: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "launchId",
          "projectId",
          "artifactId",
          "previewDescriptorId",
          "status",
          "retention",
          "deletion"
        ],
        properties: {
          id: { type: "string" },
          launchId: { type: "string" },
          projectId: { type: "string" },
          artifactId: { type: "string" },
          previewDescriptorId: { type: "string" },
          status: { type: "string", enum: ["cleanup_eligible", "retained", "preserved"] },
          observedAt: { type: "string" },
          evaluatedAt: { type: "string" },
          cleanupEligibleAt: { type: ["string", "null"] },
          descriptor: { type: "object", additionalProperties: true },
          retention: { type: "object", additionalProperties: true },
          evidencePreserved: { type: "boolean" },
          legalHoldPlaceholder: { type: "boolean" },
          deletion: {
            type: "object",
            additionalProperties: false,
            required: ["planned", "executed", "providerAction"],
            properties: {
              planned: { const: false },
              executed: { const: false },
              providerAction: { const: false }
            }
          }
        }
      },
      dryRunPlan: {
        type: "object",
        additionalProperties: false,
        required: [
          "pageScoped",
          "candidateCount",
          "batchSize",
          "batchCount",
          "totalCandidateBytes",
          "deleteRequestedCount",
          "batches"
        ],
        properties: {
          pageScoped: { const: true },
          candidateCount: { type: "integer", minimum: 0 },
          batchSize: { type: "integer", minimum: 1, maximum: 500 },
          batchCount: { type: "integer", minimum: 0 },
          totalCandidateBytes: { type: "integer", minimum: 0 },
          planDigest: { type: "string" },
          deleteRequestedCount: { const: 0 },
          batches: {
            type: "array",
            items: { $ref: "#/$defs/batch" }
          }
        }
      },
      batch: {
        type: "object",
        additionalProperties: false,
        required: [
          "index",
          "candidateCount",
          "totalBytes",
          "candidateRefs",
          "batchDigest",
          "deletionExecution"
        ],
        properties: {
          index: { type: "integer", minimum: 0 },
          candidateCount: { type: "integer", minimum: 0 },
          totalBytes: { type: "integer", minimum: 0 },
          candidateRefs: { type: "array", items: { type: "string" } },
          batchDigest: { type: "string" },
          deletionExecution: { const: false }
        }
      },
      policy: {
        type: "object",
        additionalProperties: false,
        required: [
          "restParity",
          "projectIdRequired",
          "closedLaunchScoped",
          "actorIdPassThrough",
          "headersForwarded",
          "equalOrNarrowerThanRest",
          "mutationAllowed",
          "deletionExecution",
          "providerActions",
          "rawPayloadsIncluded",
          "pathsIncluded",
          "storageLocationsIncluded",
          "signedUrlsIncluded",
          "tokensIncluded",
          "paginationRequired",
          "redactionRules"
        ],
        properties: {
          restParity: { type: "object", additionalProperties: true },
          projectIdRequired: { const: true },
          closedLaunchScoped: { const: true },
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
          deletionExecution: { const: false },
          providerActions: { const: false },
          rawPayloadsIncluded: { const: false },
          pathsIncluded: { const: false },
          storageLocationsIncluded: { const: false },
          signedUrlsIncluded: { const: false },
          tokensIncluded: { const: false },
          paginationRequired: { const: true },
          redactionRules: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  },
  "attachment-preview-retention.dry-run.schedule": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryAttachmentPreviewRetentionDryRunScheduleRead",
    type: "object",
    additionalProperties: false,
    required: [
      "kind",
      "scope",
      "access",
      "query",
      "boundary",
      "execution",
      "page",
      "summary",
      "batches",
      "diagnostics",
      "policy"
    ],
    properties: {
      kind: { const: "attachment-preview-retention-dry-run-schedule" },
      scope: { $ref: "#/$defs/scope" },
      access: { $ref: "#/$defs/access" },
      query: { $ref: "#/$defs/query" },
      boundary: { $ref: "#/$defs/boundary" },
      execution: { $ref: "#/$defs/execution" },
      page: { $ref: "#/$defs/page" },
      summary: { $ref: "#/$defs/summary" },
      transitions: {
        type: "array",
        items: { $ref: "#/$defs/transition" }
      },
      batches: {
        type: "array",
        items: { $ref: "#/$defs/batch" }
      },
      diagnostics: {
        type: "array",
        items: { $ref: "#/$defs/diagnostic" }
      },
      policy: { $ref: "#/$defs/policy" }
    },
    $defs: {
      scope: {
        type: "object",
        additionalProperties: false,
        required: ["projectId", "launchId"],
        properties: {
          projectId: { type: "string" },
          launchId: { type: "string" },
          actorId: { type: "string" }
        }
      },
      access: {
        type: "object",
        additionalProperties: false,
        required: ["scope", "projectScoped", "mutation", "redacted"],
        properties: {
          scope: { const: "artifacts:read" },
          projectScoped: { const: true },
          actorScoped: { type: "boolean" },
          mutation: { const: false },
          redacted: { const: true }
        }
      },
      query: {
        type: "object",
        additionalProperties: false,
        required: ["limit", "cursor"],
        properties: {
          scheduleDigest: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 100 },
          cursor: { type: ["string", "null"] }
        }
      },
      boundary: {
        type: "object",
        additionalProperties: false,
        required: ["scope", "workerScheduled", "closedLaunchScoped", "rawMaterialReturned"],
        properties: {
          scope: { const: "closed-launch" },
          workerScheduled: { const: false },
          closedLaunchScoped: { const: true },
          descriptorSource: { const: "artifact-schedule-descriptor-read-model" },
          rawMaterialReturned: { const: false }
        }
      },
      execution: {
        type: "object",
        additionalProperties: false,
        required: [
          "dryRun",
          "readOnly",
          "workerExecutionAllowed",
          "deletionMutation",
          "deletionExecution",
          "providerActions",
          "objectStorageTouched",
          "deleteRequestedCount"
        ],
        properties: {
          dryRun: { const: true },
          readOnly: { const: true },
          workerExecutionAllowed: { const: false },
          deletionMutation: { const: false },
          deletionExecution: { const: false },
          providerActions: { const: false },
          objectStorageTouched: { const: false },
          deleteRequestedCount: { const: 0 }
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
      summary: {
        type: "object",
        additionalProperties: false,
        required: ["deleteRequestedCount"],
        properties: {
          sourceDescriptorCount: { type: "integer", minimum: 0 },
          closedLaunchDescriptorCount: { type: "integer", minimum: 0 },
          skippedOpenLaunchDescriptorCount: { type: "integer", minimum: 0 },
          missingLaunchScopeDescriptorCount: { type: "integer", minimum: 0 },
          cleanupEligibleDescriptorCount: { type: "integer", minimum: 0 },
          scheduledDescriptorCount: { type: "integer", minimum: 0 },
          retainedDescriptorCount: { type: "integer", minimum: 0 },
          invalidDescriptorCount: { type: "integer", minimum: 0 },
          duplicateDescriptorCount: { type: "integer", minimum: 0 },
          omittedDiagnosticCount: { type: "integer", minimum: 0 },
          scheduleDigest: { type: "string" },
          projectionDigest: { type: "string" },
          plannedOperations: {
            type: "array",
            items: { type: "string" }
          },
          deleteRequestedCount: { const: 0 }
        }
      },
      transition: {
        type: "object",
        additionalProperties: false,
        properties: {
          state: { type: "string" },
          at: { type: "string" }
        }
      },
      batch: {
        type: "object",
        additionalProperties: false,
        required: ["index", "descriptorCount", "batchDigest", "deletionExecution"],
        properties: {
          index: { type: "integer", minimum: 0 },
          descriptorCount: { type: "integer", minimum: 0 },
          scheduledAfterMinutes: { type: "integer", minimum: 0 },
          maxCount: { type: "integer", minimum: 0 },
          descriptorRefs: { type: "array", items: { type: "string" } },
          omittedDescriptorRefCount: { type: "integer", minimum: 0 },
          batchDigest: { type: "string" },
          deletionExecution: { const: false },
          deleteRequestedCount: { const: 0 }
        }
      },
      diagnostic: {
        type: "object",
        additionalProperties: false,
        properties: {
          code: { type: "string" },
          severity: { type: "string", enum: ["info", "warn", "error"] },
          retryable: { type: "boolean" },
          descriptorRef: { type: "string" },
          message: { type: "string" }
        }
      },
      policy: {
        type: "object",
        additionalProperties: false,
        required: [
          "restParity",
          "projectIdRequired",
          "closedLaunchScoped",
          "actorIdPassThrough",
          "headersForwarded",
          "equalOrNarrowerThanRest",
          "descriptorOnly",
          "mutationAllowed",
          "refreshAllowed",
          "deletionExecution",
          "providerActions",
          "rawPayloadsIncluded",
          "pathsIncluded",
          "storageLocationsIncluded",
          "signedUrlsIncluded",
          "tokensIncluded",
          "paginationRequired",
          "redactionRules"
        ],
        properties: {
          restParity: { type: "object", additionalProperties: true },
          projectIdRequired: { const: true },
          closedLaunchScoped: { const: true },
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
          descriptorOnly: { const: true },
          mutationAllowed: { const: false },
          refreshAllowed: { const: false },
          deletionExecution: { const: false },
          providerActions: { const: false },
          rawPayloadsIncluded: { const: false },
          pathsIncluded: { const: false },
          storageLocationsIncluded: { const: false },
          signedUrlsIncluded: { const: false },
          tokensIncluded: { const: false },
          paginationRequired: { const: true },
          redactionRules: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  },
  "test-case.mutation": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryTestCaseMutation",
    type: "object",
    additionalProperties: false,
    required: ["projectId", "name"],
    properties: {
      projectId: { type: "string" },
      id: { type: "string", description: "Required for update, delete, and restore operations." },
      name: { type: "string" },
      fullName: { type: "string" },
      externalId: { type: "string" },
      labels: {
        type: "object",
        additionalProperties: { type: "string" }
      },
      aql: {
        type: "string",
        description: "AQL-like selector for future bulk find or mutation workflows."
      }
    },
    backendRequirement:
      "Schema is static. Test case create/update/delete/restore API support is planned."
  },
  "test-result.summary": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TestHistoryTestResultSummary",
    type: "object",
    additionalProperties: true,
    required: ["name", "status"],
    properties: {
      name: { type: "string" },
      fullName: { type: "string" },
      status: { type: "string", enum: ["failed", "broken", "passed", "skipped", "unknown"] },
      durationMs: { type: "integer", minimum: 0 },
      historyId: { type: "string" },
      testCaseId: { type: "string" },
      launchId: { type: "string" }
    }
  }
} as const;
