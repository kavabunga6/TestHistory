import { authCapabilities } from "./mcpAuthCapabilities.js";

export const discoveryCatalog = {
  version: "2026-05-30",
  service: "testhistory",
  purpose:
    "Static MCP discovery for agents preparing TestHistory API integrations before a backend is available.",
  backendRequirement:
    "This discovery response is static and does not require a running TestHistory API.",
  api: {
    defaultUrl: "http://127.0.0.1:18080",
    env: "TESTHISTORY_API_URL",
    openapiYaml: "docs/openapi/openapi.yaml",
    openapiJson: "/docs/json"
  },
  toolGroups: [
    {
      group: "discovery",
      static: true,
      tools: [
        "testhistory.health",
        "testhistory.discovery",
        "testhistory.openapi",
        "testhistory.schemas"
      ]
    },
    {
      group: "api-capabilities",
      static: false,
      tools: ["testhistory.capabilities"]
    },
    {
      group: "launch-read-models",
      static: false,
      tools: [
        "testhistory.launch.get",
        "testhistory.launch.quality-gate",
        "testhistory.launch.summarize",
        "testhistory.failures.recent"
      ]
    },
    {
      group: "projects",
      static: false,
      tools: ["testhistory.projects.find"]
    },
    {
      group: "test-history",
      static: false,
      tools: [
        "testhistory.test-cases.find",
        "testhistory.test-case.get",
        "testhistory.test-case.history",
        "testhistory.test-case.history.compare",
        "testhistory.test-case.history.compare.permission-audit",
        "testhistory.test-case.history.compare.permission-audit.replay.invariants.read",
        "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.read",
        "testhistory.identity-corrections.audit",
        "testhistory.defect-mutes.find",
        "testhistory.defect-mute-projection.read",
        "testhistory.defect-mute-projection.replay.read",
        "testhistory.defect-mute-projection.replay.invariants.read",
        "testhistory.defect-mute-projection.replay.invariants.materialized.read",
        "testhistory.security-audit.read",
        "testhistory.security-audit.export.evaluate",
        "testhistory.security-audit.export.lifecycle.replay.invariants.read",
        "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.read",
        "testhistory.archive-status.read",
        "testhistory.archive-diagnostics.replay.read",
        "testhistory.archive-diagnostics.replay.fixtures.read",
        "testhistory.archive-diagnostics.replay.fixtures.materialized.read",
        "testhistory.attachment-preview-retention.preview",
        "testhistory.attachment-preview-retention.dry-run.schedule.read",
        "testhistory.test-results.find",
        "testhistory.test-result.get"
      ]
    },
    {
      group: "upload-planning",
      static: true,
      tools: [
        "testhistory.upload.policy",
        "testhistory.upload.session.schema",
        "testhistory.quality-gate.rules"
      ]
    }
  ],
  testOpsAlignment: {
    reference:
      "Qameta Allure TestOps MCP 26.1.1 beta tool families: test case CRUD/restore, shared steps, test results, mutes, project, and issue details.",
    implementedNow: [
      "find projects",
      "find test cases",
      "find test results via launch details",
      "get test case details",
      "get test result details",
      "get launch read models",
      "summarize launch and recent failures through compact reads",
      "get test case history",
      "compare test case history points",
      "read history compare permission audit projections without raw history exposure",
      "read history compare permission audit replay invariants without raw compare input or raw history exposure",
      "read persisted history compare permission audit replay invariants without raw compare input or raw history exposure",
      "read identity correction audit metadata",
      "read defect mute status and quality gate mute effects",
      "read defect mute projection replay state from REST without MCP replay execution",
      "read replay-derived defect mute projection pages from REST with project and actor scope",
      "read defect mute replay invariant evidence from REST without raw failure payloads",
      "read project-scoped security audit events",
      "evaluate security audit export policy without provider runtime activity",
      "read security audit export lifecycle replay invariants without raw lifecycle events or provider runtime activity",
      "read materialized security audit export lifecycle replay invariants without provider execution or secret exposure",
      "read archive upload status through REST status endpoints",
      "read archive diagnostic replay summaries through REST without MCP replay execution",
      "read synthetic archive diagnostic replay fixture contracts through REST without MCP replay execution",
      "read materialized synthetic archive diagnostic replay fixture summaries through REST without MCP replay execution",
      "read attachment preview retention dry-run previews for closed launches without deletion execution",
      "read worker-scheduled attachment preview retention dry-run schedules without deletion execution",
      "evaluate launch quality gate"
    ],
    plannedFamilies: [
      "create/update/find/delete/restore test cases",
      "create/update/find shared steps",
      "create/delete mutes",
      "get project",
      "get issue details"
    ],
    namingGuidance:
      "Prefer action-oriented names such as testhistory.test-cases.find and keep legacy aliases only for compatibility."
  },
  get auth() {
    return authCapabilities;
  },
  queryModel: {
    style: "AQL-like",
    parameters: {
      aql: "Structured filter expression reserved for TestHistory API search endpoints.",
      query: "Free-text search term for names, full names, keys, or external identifiers.",
      projectId: "Optional scope for project-aware searches.",
      limit: "Optional result cap for future paged API responses."
    },
    examples: [
      "status in (failed, broken)",
      'name ~= "login" and flakyScore > 0',
      "projectId = WEB and lastStatus = failed"
    ]
  },
  endpoints: [
    {
      method: "GET",
      path: "/api/v1/projects?aql={aql}&query={query}&limit={limit}",
      tool: "testhistory.projects.find",
      purpose:
        "Find projects. Current backend returns the project list; AQL parameters are forward-compatible."
    },
    {
      method: "GET",
      path: "/api/v1/capabilities",
      tool: "testhistory.capabilities",
      purpose: "Discover live API modules, ingestion modes, and MCP manifest hints."
    },
    {
      method: "GET",
      path: "/api/v1/launches/{launchId}",
      tool: "testhistory.launch.get",
      purpose: "Read one launch with summary counters and imported test results."
    },
    {
      method: "POST",
      path: "/api/v1/launches/{launchId}/quality-gate",
      tool: "testhistory.launch.quality-gate",
      purpose: "Evaluate release-readiness rules for a launch."
    },
    {
      method: "GET",
      path: "/api/v1/test-cases?projectId={projectId}&aql={aql}&query={query}&limit={limit}",
      tool: "testhistory.test-cases.find",
      purpose:
        "Find test case summaries, optionally scoped by projectId. AQL parameters are forward-compatible."
    },
    {
      method: "GET",
      path: "/api/v1/test-cases/{testCaseId}/history?projectId={projectId}&limit={limit}&cursor={cursor}",
      tool: "testhistory.test-case.history",
      purpose:
        "Read paginated chronological status history for one test case, including REST-safe attempt, retry, parameter, and identity metadata."
    },
    {
      method: "GET",
      path: "/api/v1/test-cases/{testCaseId}/history/compare?projectId={projectId}&baseResultUuid={baseResultUuid}&targetResultUuid={targetResultUuid}&includeUnchanged={includeUnchanged}&limit={limit}&cursor={cursor}",
      tool: "testhistory.test-case.history.compare",
      resource: "testhistory://test-cases/{testCaseId}/history/compare",
      purpose:
        "Read paginated enriched history compare changes for one project-scoped test case. MCP forwards project and actor scope headers, then returns equal-or-narrower label, executor, branch/build, and defect data than REST."
    },
    {
      method: "GET",
      path: "/api/v1/test-cases/{testCaseId}/history/compare/permission-audit?projectId={projectId}&baseResultUuid={baseResultUuid}&targetResultUuid={targetResultUuid}&limit={limit}&cursor={cursor}",
      tool: "testhistory.test-case.history.compare.permission-audit",
      resource: "testhistory://test-cases/{testCaseId}/history/compare/permission-audit",
      purpose:
        "Read paginated actor/project-scoped history compare permission audit records from REST, forwarding scope headers and omitting raw history, hidden compare inputs, paths, storage refs, signed URLs, and tokens."
    },
    {
      method: "GET",
      path: "/api/v1/test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants?projectId={projectId}&baseResultUuid={baseResultUuid}&targetResultUuid={targetResultUuid}&limit={limit}&cursor={cursor}",
      tool: "testhistory.test-case.history.compare.permission-audit.replay.invariants.read",
      resource:
        "testhistory://test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants",
      purpose:
        "Read paginated actor/project/test-case scoped history compare permission audit replay invariant evidence from REST, forwarding scope headers and omitting raw compare inputs, raw history bodies, local paths, storage refs, signed URLs, tokens, replay execution, and mutation controls."
    },
    {
      method: "GET",
      path: "/api/v1/test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants/persisted?projectId={projectId}&baseResultUuid={baseResultUuid}&targetResultUuid={targetResultUuid}&limit={limit}&cursor={cursor}",
      tool: "testhistory.test-case.history.compare.permission-audit.replay.invariants.persisted.read",
      resource:
        "testhistory://test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants/persisted",
      purpose:
        "Read paginated actor/project/test-case scoped persisted history compare permission audit invariant evidence from REST, forwarding scope headers and omitting raw compare inputs, raw history bodies, local paths, storage refs, signed URLs, tokens, replay execution, provider/runtime tools, and mutation controls."
    },
    {
      method: "GET",
      path: "/api/v1/projects/{projectId}/identity-corrections/audit?actorId={actorId}&originType={originType}&kind={kind}&beforeId={beforeId}&afterId={afterId}&parameterVariantSignature={parameterVariantSignature}&limit={limit}&cursor={cursor}",
      tool: "testhistory.identity-corrections.audit",
      purpose:
        "Read paginated identity correction audit metadata for one project. MCP requires actorId for actor-origin reads and never advertises correction mutation tools."
    },
    {
      method: "GET",
      path: "/api/v1/defects?projectId={projectId}",
      tool: "testhistory.defect-mutes.find",
      resource: "testhistory://defect-mutes",
      purpose: "Read defect mute status from REST defects and return only MCP-safe mute metadata."
    },
    {
      method: "GET",
      path: "/api/v1/projects/{projectId}/defect-mutes/projection?actorId={actorId}&launchId={launchId}&status={status}&limit={limit}&cursor={cursor}",
      tool: "testhistory.defect-mute-projection.read",
      resource: "testhistory://projects/{projectId}/defect-mutes/projection",
      purpose:
        "Read paginated defect mute projection state from REST, forwarding project and actor scope headers and returning raw failure counters separately from effective quality-gate fields."
    },
    {
      method: "GET",
      path: "/api/v1/projects/{projectId}/defect-mutes/projection?actorId={actorId}&launchId={launchId}&status={status}&limit={limit}&cursor={cursor}",
      tool: "testhistory.defect-mute-projection.replay.read",
      resource: "testhistory://projects/{projectId}/defect-mutes/projection/replay",
      purpose:
        "Read replay-derived defect mute projection pages from REST with the same project/actor scope headers, denied masking, and no MCP-side replay or mutation execution."
    },
    {
      method: "GET",
      path: "/api/v1/projects/{projectId}/defect-mutes/projection/replay/invariants?actorId={actorId}&limit={limit}&cursor={cursor}",
      tool: "testhistory.defect-mute-projection.replay.invariants.read",
      resource: "testhistory://projects/{projectId}/defect-mutes/projection/replay/invariants",
      purpose:
        "Read paginated defect mute replay invariant evidence from REST with project/actor scope headers, denied masking, and no raw failure payloads or mutation execution."
    },
    {
      method: "GET",
      path: "/api/v1/projects/{projectId}/defect-mutes/projection/replay/invariants/materialized?actorId={actorId}&limit={limit}&cursor={cursor}",
      tool: "testhistory.defect-mute-projection.replay.invariants.materialized.read",
      resource:
        "testhistory://projects/{projectId}/defect-mutes/projection/replay/invariants/materialized",
      purpose:
        "Read paginated materialized defect mute replay invariant summaries from REST with project/actor scope headers, denied masking, descriptor-style digests/counters only, and no raw failure payloads, replay execution, or mutation access."
    },
    {
      method: "GET",
      path: "/api/v1/launches/{launchId}/quality-gate",
      tool: "testhistory.defect-mutes.find",
      resource: "testhistory://launches/{launchId}/quality-gate/mute-effects",
      purpose:
        "Read quality gate defect mute effects and affected ids without raw failure payloads."
    },
    {
      method: "GET",
      path: "/api/v1/security/audit?projectId={projectId}&type={type}&outcome={outcome}&severity={severity}&limit={limit}&cursor={cursor}",
      tool: "testhistory.security-audit.read",
      resource: "testhistory://security/audit",
      purpose:
        "Read paginated project-scoped security audit events with MCP redaction equal-or-narrower than REST."
    },
    {
      method: "POST",
      path: "/api/v1/security/audit/export/evaluate",
      tool: "testhistory.security-audit.export.evaluate",
      resource: "testhistory://security/audit/export/evaluate",
      purpose:
        "Evaluate a project/actor-scoped security audit export request through REST as a redacted, read-only, provider-neutral MCP view. MCP forwards request and policy in the POST body and does not expose provider runtime metadata."
    },
    {
      method: "GET",
      path: "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants?actorId={actorId}&limit={limit}&cursor={cursor}",
      tool: "testhistory.security-audit.export.lifecycle.replay.invariants.read",
      resource:
        "testhistory://projects/{projectId}/security/audit/export/lifecycle/replay/invariants",
      purpose:
        "Read paginated project/actor-scoped security audit export lifecycle replay invariants from REST with MCP redaction equal-or-narrower than REST and no lifecycle replay, provider, signed URL, credential, or mutation execution."
    },
    {
      method: "GET",
      path: "/api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized?actorId={actorId}&limit={limit}&cursor={cursor}",
      tool: "testhistory.security-audit.export.lifecycle.replay.invariants.materialized.read",
      resource:
        "testhistory://projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized",
      purpose:
        "Read paginated materialized project/actor-scoped security audit export lifecycle replay invariants from REST with MCP redaction equal-or-narrower than REST and no export provider execution, destination resolution, signed URL, credential, or mutation execution."
    },
    {
      method: "GET",
      path: "/api/v1/launches/{launchId}/uploads/archive/status?status={status}&limit={limit}&cursor={cursor}&diagnosticsLimit={diagnosticsLimit}&diagnosticsCursor={diagnosticsCursor}",
      tool: "testhistory.archive-status.read",
      resource: "testhistory://launches/{launchId}/uploads/archive/status",
      purpose:
        "Read paginated archive upload status for one launch. MCP requires projectId, forwards project/actor scope headers, and omits paths, storage keys, signed URLs, raw payloads, and tokens."
    },
    {
      method: "GET",
      path: "/api/v1/launches/{launchId}/archive/diagnostics/replay?archiveRef={archiveRef}&limit={limit}&cursor={cursor}",
      tool: "testhistory.archive-diagnostics.replay.read",
      resource: "testhistory://launches/{launchId}/archive/diagnostics/replay",
      purpose:
        "Read paginated archive diagnostic replay summaries from REST. MCP requires projectId, forwards project/actor scope headers, redacts raw path/storage/signed-url/token data, and never executes replay or mutation work."
    },
    {
      method: "GET",
      path: "/api/v1/projects/{projectId}/archive/diagnostics/replay/fixtures?limit={limit}&cursor={cursor}",
      tool: "testhistory.archive-diagnostics.replay.fixtures.read",
      resource: "testhistory://projects/{projectId}/archive/diagnostics/replay/fixtures",
      purpose:
        "Read paginated synthetic archive diagnostic replay fixture contracts from REST. MCP forwards project/actor scope headers, returns equal-or-narrower redacted fixture metadata, and never exposes archive payloads, raw manifest/result files, replay execution, or mutation work."
    },
    {
      method: "GET",
      path: "/api/v1/projects/{projectId}/archive/diagnostics/replay/fixtures/materialized?limit={limit}&cursor={cursor}",
      tool: "testhistory.archive-diagnostics.replay.fixtures.materialized.read",
      resource:
        "testhistory://projects/{projectId}/archive/diagnostics/replay/fixtures/materialized",
      purpose:
        "Read paginated materialized synthetic archive diagnostic replay fixture summaries from REST. MCP forwards project/actor scope headers, returns equal-or-narrower descriptor metadata, and never exposes archive payloads, raw manifest/result files, worker execution, storage, credentials, or mutation work."
    },
    {
      method: "GET",
      path: "/api/v1/launches/{launchId}/attachment-previews/retention/preview?status={status}&limit={limit}&cursor={cursor}",
      tool: "testhistory.attachment-preview-retention.preview",
      resource: "testhistory://launches/{launchId}/attachment-previews/retention/preview",
      purpose:
        "Read paginated closed-launch attachment preview retention eligibility through REST and return page-scoped dry-run batch metadata without provider/delete execution."
    },
    {
      method: "GET",
      path: "/api/v1/launches/{launchId}/attachment-previews/retention/dry-run/schedule?scheduleDigest={scheduleDigest}&limit={limit}&cursor={cursor}",
      tool: "testhistory.attachment-preview-retention.dry-run.schedule.read",
      resource: "testhistory://launches/{launchId}/attachment-previews/retention/dry-run/schedule",
      purpose:
        "Read paginated worker-scheduled attachment preview retention dry-run schedule evidence through REST with project/actor scope headers, MCP redaction, and no provider/delete/refresh execution."
    },
    {
      method: "GET",
      path: "/api/v1/uploads/{uploadId}/archive/status?limit={diagnosticsLimit}&cursor={diagnosticsCursor}",
      tool: "testhistory.archive-status.read",
      resource: "testhistory://uploads/{uploadId}/archive/status",
      purpose:
        "Read one archive upload status with bounded diagnostics. MCP requires projectId and remains read-only."
    },
    {
      method: "GET",
      path: "/api/v1/test-cases/{testCaseId}?projectId={projectId}",
      tool: "testhistory.test-case.get",
      purpose: "Read one test case detail view with history and synchronized metadata."
    },
    {
      method: "GET",
      path: "/api/v1/launches/{launchId}?aql={aql}&query={query}&limit={limit}",
      tool: "testhistory.test-results.find",
      purpose:
        "Find test results inside one launch. Current backend returns launch details; future APIs can apply result filters."
    },
    {
      method: "GET",
      path: "/api/v1/launches/{launchId}/results/{resultUuid}",
      tool: "testhistory.test-result.get",
      purpose:
        "Read one test result detail payload. Redaction is performed by the REST ingestion/read model."
    },
    {
      method: "GET",
      path: "/api/v1/launches/{launchId}/results/{resultUuid}",
      resource: "testhistory://launches/{launchId}/results/{resultUuid}/attachments",
      purpose:
        "Read paged MCP-safe attachment preview descriptors from the REST result detail. MCP omits raw blob, storage, path, and signed URL fields."
    }
  ],
  schemaNames: [
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
};
