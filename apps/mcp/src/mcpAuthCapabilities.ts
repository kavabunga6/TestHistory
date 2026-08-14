export const authCapabilities = {
  version: "2026-05-30",
  tokenTransport: "rest-authorization-header",
  noSecretsInManifest: true,
  capabilities: [
    {
      name: "testhistory.discovery",
      access: "anonymous",
      requiredScopes: ["mcp:discover"],
      projectScoped: false,
      denialShape: "PermissionDeniedError",
      notes: ["Static metadata only; does not grant data access."]
    },
    {
      name: "testhistory.projects.find",
      access: "rest-authorized",
      requiredScopes: ["projects:read"],
      projectScoped: true,
      restParity: { method: "GET", path: "/api/v1/projects" },
      denialShape: "PermissionDeniedError"
    },
    {
      name: "testhistory.launch.get",
      access: "rest-authorized",
      requiredScopes: ["launches:read"],
      projectScoped: true,
      restParity: { method: "GET", path: "/api/v1/launches/{launchId}" },
      denialShape: "PermissionDeniedError"
    },
    {
      name: "testhistory.launch.summarize",
      access: "rest-authorized",
      requiredScopes: ["launches:read"],
      projectScoped: true,
      restParity: { method: "GET", path: "/api/v1/launches/{launchId}" },
      denialShape: "PermissionDeniedError"
    },
    {
      name: "testhistory.failures.recent",
      access: "rest-authorized",
      requiredScopes: ["projects:read", "launches:read"],
      projectScoped: true,
      restParity: { method: "GET", path: "/api/v1/projects/{projectId}/launches" },
      denialShape: "PermissionDeniedError"
    },
    {
      name: "testhistory.launch.quality-gate",
      access: "rest-authorized",
      requiredScopes: ["quality-gates:evaluate"],
      projectScoped: true,
      restParity: { method: "POST", path: "/api/v1/launches/{launchId}/quality-gate" },
      denialShape: "PermissionDeniedError"
    },
    {
      name: "testhistory.test-cases.find",
      access: "rest-authorized",
      requiredScopes: ["test-cases:read"],
      projectScoped: true,
      restParity: { method: "GET", path: "/api/v1/test-cases" },
      denialShape: "PermissionDeniedError"
    },
    {
      name: "testhistory.test-case.get",
      access: "rest-authorized",
      requiredScopes: ["test-cases:read"],
      projectScoped: true,
      restParity: { method: "GET", path: "/api/v1/test-cases/{testCaseId}" },
      denialShape: "PermissionDeniedError"
    },
    {
      name: "testhistory.test-case.history",
      access: "rest-authorized",
      requiredScopes: ["test-cases:read"],
      projectScoped: true,
      restParity: { method: "GET", path: "/api/v1/test-cases/{testCaseId}/history" },
      denialShape: "PermissionDeniedError"
    },
    {
      name: "testhistory.test-case.history.compare",
      access: "rest-authorized",
      requiredScopes: ["test-cases:read"],
      projectScoped: true,
      restParity: {
        method: "GET",
        path: "/api/v1/test-cases/{testCaseId}/history/compare"
      },
      denialShape: "PermissionDeniedError",
      notes: [
        "MCP requires projectId before calling REST so agents cannot accidentally compare across projects.",
        "MCP requires baseResultUuid and targetResultUuid so the REST comparison pair is explicit.",
        "MCP forwards X-TestHistory-Scopes, X-TestHistory-Project-Scope, and optional X-TestHistory-Actor-Id headers without broadening actor scope.",
        "MCP omits raw payloads and returns enriched labels, executor, branch/build, and defect changes equal-or-narrower than REST."
      ]
    },
    {
      name: "testhistory.test-case.history.compare.permission-audit",
      access: "rest-authorized",
      requiredScopes: ["test-cases:read"],
      projectScoped: true,
      restParity: {
        method: "GET",
        path: "/api/v1/test-cases/{testCaseId}/history/compare/permission-audit"
      },
      denialShape: "PermissionDeniedError",
      notes: [
        "MCP requires projectId before calling REST and forwards X-TestHistory-Scopes plus X-TestHistory-Project-Scope.",
        "MCP forwards optional actorId as X-TestHistory-Actor-Id without broadening actor scope.",
        "MCP reads the permission audit projection only; it does not execute compare replay, refresh audits, or mutate permissions.",
        "Responses omit raw history payloads, hidden compare inputs, file paths, storage refs, signed URLs, and credential-like fields."
      ]
    },
    {
      name: "testhistory.test-case.history.compare.permission-audit.replay.invariants.read",
      access: "rest-authorized",
      requiredScopes: ["test-cases:read"],
      projectScoped: true,
      restParity: {
        method: "GET",
        path: "/api/v1/test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants"
      },
      denialShape: "PermissionDeniedError",
      notes: [
        "MCP requires projectId, testCaseId, and actorId before calling REST so invariant reads remain actor/project/test-case scoped.",
        "MCP forwards X-TestHistory-Scopes, X-TestHistory-Project-Scope, and X-TestHistory-Actor-Id headers without broadening actor scope.",
        "MCP reads REST invariant evidence only; it does not execute compare replay, refresh audits, or mutate permissions.",
        "Responses omit raw compare inputs, raw history bodies, local paths, storage refs, signed URLs, tokens, and credential-like fields."
      ]
    },
    {
      name: "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.read",
      access: "rest-authorized",
      requiredScopes: ["test-cases:read"],
      projectScoped: true,
      restParity: {
        method: "GET",
        path: "/api/v1/test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants/persisted"
      },
      denialShape: "PermissionDeniedError",
      notes: [
        "MCP requires projectId, testCaseId, and actorId before calling REST so persisted invariant reads remain actor/project/test-case scoped.",
        "MCP forwards X-TestHistory-Scopes, X-TestHistory-Project-Scope, and X-TestHistory-Actor-Id headers without broadening actor scope.",
        "MCP reads REST persisted invariant evidence only; it does not execute compare replay, refresh audits, persist state, call provider/runtime tools, or mutate permissions.",
        "Responses omit raw compare inputs, raw history bodies, hidden history, local paths, storage refs, signed URLs, tokens, and credential-like fields."
      ]
    },
    {
      name: "testhistory.identity-corrections.audit",
      access: "rest-authorized",
      requiredScopes: ["test-cases:read"],
      projectScoped: true,
      restParity: {
        method: "GET",
        path: "/api/v1/projects/{projectId}/identity-corrections/audit"
      },
      denialShape: "PermissionDeniedError",
      notes: [
        "MCP requires projectId for every read.",
        "Actor-origin reads require actorId so agents cannot enumerate other actors by omitting the actor scope.",
        "System-origin reads are project-scoped and request originType=system."
      ]
    },
    {
      name: "testhistory.defect-mutes.find",
      access: "rest-authorized",
      requiredScopes: ["defects:read", "quality-gates:evaluate"],
      projectScoped: true,
      restParity: { method: "GET", path: "/api/v1/defects" },
      denialShape: "PermissionDeniedError",
      notes: [
        "MCP exposes read-only mute status and quality-gate mute effects.",
        "Responses are equal-or-narrower than REST and omit raw failure payloads.",
        "Mute create/delete remains unsupported by MCP."
      ]
    },
    {
      name: "testhistory.defect-mute-projection.read",
      access: "rest-authorized",
      requiredScopes: ["defects:read"],
      projectScoped: true,
      restParity: {
        method: "GET",
        path: "/api/v1/projects/{projectId}/defect-mutes/projection"
      },
      denialShape: "PermissionDeniedError",
      notes: [
        "MCP requires projectId and forwards X-TestHistory-Scopes plus X-TestHistory-Project-Scope headers to REST.",
        "MCP forwards optional actorId as both REST query and X-TestHistory-Actor-Id header without broadening actor scope.",
        "MCP reads the REST projection read model only; it does not execute replay, create/delete mutes, or mutate quality gates.",
        "Responses preserve raw failure counters separately from effective quality-gate fields and omit raw payload, path, storage, URL, and credential-like fields."
      ]
    },
    {
      name: "testhistory.defect-mute-projection.replay.read",
      access: "rest-authorized",
      requiredScopes: ["defects:read"],
      projectScoped: true,
      restParity: {
        method: "GET",
        path: "/api/v1/projects/{projectId}/defect-mutes/projection"
      },
      denialShape: "PermissionDeniedError",
      notes: [
        "MCP exposes the replay-derived REST read model only; replay execution remains a backend/domain concern.",
        "MCP requires projectId and forwards X-TestHistory-Scopes plus X-TestHistory-Project-Scope headers to REST.",
        "MCP forwards optional actorId as both REST query and X-TestHistory-Actor-Id header without broadening actor scope.",
        "Denied responses preserve permission shape while masking raw failure history, storage, paths, URLs, and credential-like fields.",
        "No replay refresh, defect mute create/delete, unmute, or projection mutation tool is advertised."
      ]
    },
    {
      name: "testhistory.defect-mute-projection.replay.invariants.read",
      access: "rest-authorized",
      requiredScopes: ["defects:read"],
      projectScoped: true,
      restParity: {
        method: "GET",
        path: "/api/v1/projects/{projectId}/defect-mutes/projection/replay/invariants"
      },
      denialShape: "PermissionDeniedError",
      notes: [
        "MCP exposes the REST replay invariant read model only and does not recompute or refresh replay state.",
        "MCP requires projectId and forwards X-TestHistory-Scopes plus X-TestHistory-Project-Scope headers to REST.",
        "MCP forwards optional actorId as both REST query and X-TestHistory-Actor-Id header without broadening actor scope.",
        "Denied responses preserve permission shape while masking raw failure history, storage, paths, URLs, and credential-like fields.",
        "No invariant refresh, replay execution, defect mute create/delete, unmute, or projection mutation tool is advertised."
      ]
    },
    {
      name: "testhistory.defect-mute-projection.replay.invariants.materialized.read",
      access: "rest-authorized",
      requiredScopes: ["defects:read"],
      projectScoped: true,
      restParity: {
        method: "GET",
        path: "/api/v1/projects/{projectId}/defect-mutes/projection/replay/invariants/materialized"
      },
      denialShape: "PermissionDeniedError",
      notes: [
        "MCP exposes the REST materialized replay invariant read model only and does not compute, recompute, refresh, or persist materialized state.",
        "MCP requires projectId and forwards X-TestHistory-Scopes plus X-TestHistory-Project-Scope headers to REST.",
        "MCP forwards optional actorId as both REST query and X-TestHistory-Actor-Id header without broadening actor scope.",
        "Responses are equal-or-narrower than REST: bounded summaries, digests, counters, page metadata, and materialization policy only.",
        "Denied responses preserve permission shape while masking raw failure history, storage, paths, URLs, and credential-like fields.",
        "No materialized invariant refresh, replay execution, worker execution, defect mute create/delete, unmute, or projection mutation tool is advertised."
      ]
    },
    {
      name: "testhistory.security-audit.read",
      access: "rest-authorized",
      requiredScopes: ["security:audit:read"],
      projectScoped: true,
      restParity: { method: "GET", path: "/api/v1/security/audit" },
      denialShape: "PermissionDeniedError",
      notes: [
        "MCP requires projectId and forwards X-TestHistory-Scopes plus X-TestHistory-Project-Scope headers to REST.",
        "Responses are paginated, read-only, and equal-or-narrower than REST.",
        "MCP omits request IP/user-agent, raw payload-like fields, storage keys, signed URLs, and sensitive metadata values."
      ]
    },
    {
      name: "testhistory.security-audit.export.evaluate",
      access: "rest-authorized",
      requiredScopes: ["security:audit:read"],
      projectScoped: true,
      restParity: { method: "POST", path: "/api/v1/security/audit/export/evaluate" },
      denialShape: "PermissionDeniedError",
      notes: [
        "MCP requires request.projectId and request.actorId and forwards X-TestHistory-Scopes, X-TestHistory-Project-Scope, and X-TestHistory-Actor-Id headers to REST.",
        "MCP forwards the request and optional policy in the POST body, then returns an equal-or-narrower redacted decision.",
        "MCP omits REST provider runtime metadata and does not advertise any export start, retry, credential resolution, artifact creation, or mutation tool."
      ]
    },
    {
      name: "testhistory.security-audit.export.lifecycle.replay.invariants.read",
      access: "rest-authorized",
      requiredScopes: ["security:audit:read"],
      projectScoped: true,
      restParity: {
        method: "GET",
        path: "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants"
      },
      denialShape: "PermissionDeniedError",
      notes: [
        "MCP requires projectId and actorId and forwards X-TestHistory-Scopes, X-TestHistory-Project-Scope, and X-TestHistory-Actor-Id headers to REST.",
        "MCP returns the REST lifecycle replay invariant read model as an equal-or-narrower paginated view.",
        "MCP omits raw lifecycle events, request payloads, provider endpoints, signed URLs, local paths, credential references, and provider runtime metadata.",
        "No lifecycle replay refresh, export start, retry, credential resolution, provider call, artifact creation, or mutation tool is advertised."
      ]
    },
    {
      name: "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.read",
      access: "rest-authorized",
      requiredScopes: ["security:audit:read"],
      projectScoped: true,
      restParity: {
        method: "GET",
        path: "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized"
      },
      denialShape: "PermissionDeniedError",
      notes: [
        "MCP requires projectId and actorId and forwards X-TestHistory-Scopes, X-TestHistory-Project-Scope, and X-TestHistory-Actor-Id headers to REST.",
        "MCP returns the REST materialized lifecycle replay invariant read model as an equal-or-narrower paginated view.",
        "MCP omits raw lifecycle events, request payloads, provider endpoints, signed URLs, local paths, credential references, destination references, and provider runtime metadata.",
        "No lifecycle replay refresh, export start, retry, credential resolution, destination resolution, provider call, artifact creation, worker execution, or mutation tool is advertised."
      ]
    },
    {
      name: "testhistory.archive-status.read",
      access: "rest-authorized",
      requiredScopes: ["uploads:read", "launches:read"],
      projectScoped: true,
      restParity: { method: "GET", path: "/api/v1/launches/{launchId}/uploads/archive/status" },
      denialShape: "PermissionDeniedError",
      notes: [
        "MCP requires projectId for every archive status read and forwards project/actor scope headers to REST.",
        "MCP only exposes existing REST read status endpoints; archive intake mutation remains unavailable.",
        "Responses are paginated, read-only, and omit paths, storage keys, signed URLs, raw payloads, and tokens."
      ]
    },
    {
      name: "testhistory.archive-diagnostics.replay.read",
      access: "rest-authorized",
      requiredScopes: ["uploads:read", "launches:read"],
      projectScoped: true,
      restParity: {
        method: "GET",
        path: "/api/v1/launches/{launchId}/archive/diagnostics/replay"
      },
      denialShape: "PermissionDeniedError",
      notes: [
        "MCP requires projectId and forwards X-TestHistory-Scopes, X-TestHistory-Project-Scope, and X-TestHistory-Actor-Id headers to REST.",
        "MCP returns the REST replay read model as an equal-or-narrower, paginated, redacted view.",
        "MCP does not expose worker execution, payload bytes, storage references, signed URLs, tokens, retry handles, or mutation tools for archive diagnostics."
      ]
    },
    {
      name: "testhistory.archive-diagnostics.replay.fixtures.read",
      access: "rest-authorized",
      requiredScopes: ["uploads:read", "launches:read"],
      projectScoped: true,
      restParity: {
        method: "GET",
        path: "/api/v1/projects/{projectId}/archive/diagnostics/replay/fixtures"
      },
      denialShape: "PermissionDeniedError",
      notes: [
        "MCP requires projectId and forwards X-TestHistory-Scopes, X-TestHistory-Project-Scope, and X-TestHistory-Actor-Id headers to REST.",
        "MCP returns synthetic fixture contract metadata only as an equal-or-narrower, paginated, redacted view.",
        "MCP omits raw manifest entries, result files, content, archive payload bytes, local paths, storage references, signed URLs, tokens, retry handles, replay execution controls, and mutation tools."
      ]
    },
    {
      name: "testhistory.archive-diagnostics.replay.fixtures.materialized.read",
      access: "rest-authorized",
      requiredScopes: ["uploads:read", "launches:read"],
      projectScoped: true,
      restParity: {
        method: "GET",
        path: "/api/v1/projects/{projectId}/archive/diagnostics/replay/fixtures/materialized"
      },
      denialShape: "PermissionDeniedError",
      notes: [
        "MCP requires projectId and forwards X-TestHistory-Scopes, X-TestHistory-Project-Scope, and X-TestHistory-Actor-Id headers to REST.",
        "MCP returns materialized synthetic fixture summary metadata only as an equal-or-narrower, paginated, redacted view.",
        "MCP omits raw manifest entries, result files, content, archive payload bytes, local paths, storage references, signed URLs, tokens, credentials, worker execution controls, and mutation tools."
      ]
    },
    {
      name: "testhistory.attachment-preview-retention.preview",
      access: "rest-authorized",
      requiredScopes: ["artifacts:read"],
      projectScoped: true,
      restParity: {
        method: "GET",
        path: "/api/v1/launches/{launchId}/attachment-previews/retention/preview"
      },
      denialShape: "PermissionDeniedError",
      notes: [
        "MCP requires projectId and forwards X-TestHistory-Scopes plus X-TestHistory-Project-Scope headers to REST.",
        "The REST read is closed-launch scoped; MCP preserves that boundary and returns only page-scoped dry-run batch metadata.",
        "MCP never executes deletion, never touches object storage, and omits paths, storage keys, signed URLs, raw payloads, and tokens."
      ]
    },
    {
      name: "testhistory.attachment-preview-retention.dry-run.schedule.read",
      access: "rest-authorized",
      requiredScopes: ["artifacts:read"],
      projectScoped: true,
      restParity: {
        method: "GET",
        path: "/api/v1/launches/{launchId}/attachment-previews/retention/dry-run/schedule"
      },
      denialShape: "PermissionDeniedError",
      notes: [
        "MCP requires projectId and forwards X-TestHistory-Scopes, X-TestHistory-Project-Scope, and X-TestHistory-Actor-Id headers to REST.",
        "MCP returns worker-scheduled dry-run evidence as an equal-or-narrower, paginated, closed-launch scoped view.",
        "MCP never refreshes the schedule, never executes deletion, never touches object storage, and omits paths, storage keys, signed URLs, raw payloads, and tokens."
      ]
    },
    {
      name: "testhistory.test-results.find",
      access: "rest-authorized",
      requiredScopes: ["launches:read"],
      projectScoped: true,
      restParity: { method: "GET", path: "/api/v1/launches/{launchId}" },
      denialShape: "PermissionDeniedError",
      notes: ["Current REST contract scopes result search through launch details."]
    },
    {
      name: "testhistory.test-result.get",
      access: "rest-authorized",
      requiredScopes: ["launches:read"],
      projectScoped: true,
      restParity: {
        method: "GET",
        path: "/api/v1/launches/{launchId}/results/{resultUuid}"
      },
      denialShape: "PermissionDeniedError"
    }
  ],
  unsupported: [
    {
      name: "testhistory.artifacts.read",
      access: "unsupported",
      requiredScopes: ["artifacts:read"],
      projectScoped: true,
      restParity: { method: "GET", path: "/api/v1/artifacts" },
      denialShape: "PermissionDeniedError",
      notes: ["No MCP artifact tool is advertised until REST artifact auth is implemented."]
    },
    {
      name: "testhistory.test-case.mutate",
      access: "unsupported",
      requiredScopes: ["test-cases:write"],
      projectScoped: true,
      restParity: { method: "PATCH", path: "/api/v1/test-cases/{testCaseId}" },
      denialShape: "PermissionDeniedError",
      notes: ["Mutation schemas are planning aids only; no MCP mutation tool is advertised."]
    },
    {
      name: "testhistory.identity-corrections.correct",
      access: "unsupported",
      requiredScopes: ["test-cases:write"],
      projectScoped: true,
      restParity: {
        method: "POST",
        path: "/api/v1/projects/{projectId}/identity-corrections"
      },
      denialShape: "PermissionDeniedError",
      notes: [
        "Identity correction audit is read-only in MCP; no correction mutation tool is advertised."
      ]
    }
  ]
} as const;
