export function createSchemaExtensions(baseSchemas: Record<string, any>) {
  return {
    ...baseSchemas,
    "test-case.history.compare.permission-audit.replay.invariants.persisted": {
      ...baseSchemas["test-case.history.compare.permission-audit.replay.invariants"],
      title: "TestHistoryTestCaseHistoryComparePermissionAuditReplayInvariantPersistedPage",
      properties: {
        ...baseSchemas["test-case.history.compare.permission-audit.replay.invariants"].properties,
        kind: {
          type: "string",
          const: "test-case-history-compare-permission-audit-replay-invariants-persisted"
        }
      },
      $defs: {
        ...baseSchemas["test-case.history.compare.permission-audit.replay.invariants"].$defs,
        policy: {
          ...baseSchemas["test-case.history.compare.permission-audit.replay.invariants"].$defs
            .policy,
          required: [
            ...baseSchemas["test-case.history.compare.permission-audit.replay.invariants"].$defs
              .policy.required,
            "persistedInvariantReadModel"
          ]
        }
      }
    },
    "security-audit-export.lifecycle.replay.invariants.materialized": {
      ...baseSchemas["security-audit-export.lifecycle.replay.invariants"],
      title: "TestHistorySecurityAuditExportLifecycleReplayInvariantMaterializedRead",
      properties: {
        ...baseSchemas["security-audit-export.lifecycle.replay.invariants"].properties,
        kind: { const: "security-audit-export-lifecycle-replay-invariants-materialized" }
      }
    }
  };
}
