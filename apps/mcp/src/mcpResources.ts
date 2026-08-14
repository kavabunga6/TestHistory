import type { ResourceDefinition } from "./mcpTypes.js";

export const resources = [
  {
    uri: "testhistory://projects",
    name: "Projects",
    description: "Live REST project list from /api/v1/projects.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://projects/{projectId}/launches",
    name: "Project Launches",
    description: "Launch summaries for one project from /api/v1/projects/{projectId}/launches.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://launches/{launchId}",
    name: "Launch Summary",
    description:
      "Compact launch read from /api/v1/launches/{launchId}; append ?includeDetails=true for result cards or ?includeRaw=true for the full REST payload.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://launches/{launchId}/results",
    name: "Launch Results",
    description:
      "Compact result list for one launch; append ?includeDetails=true or ?includeRaw=true only when raw details are needed.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://launches/{launchId}/results/{resultUuid}",
    name: "Launch Result Detail",
    description:
      "One launch result through REST redaction; compact by default, with ?includeRaw=true for the raw REST details.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://launches/{launchId}/results/{resultUuid}/attachments",
    name: "Launch Result Attachment Previews",
    description:
      "Paged attachment preview descriptors for one launch result, narrowed from the REST result detail without raw blobs, storage paths, or signed URLs.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://test-cases",
    name: "Test Cases",
    description: "Test case summaries from /api/v1/test-cases, optionally with ?projectId=...",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://test-cases/{testCaseId}",
    name: "Test Case Detail",
    description:
      "Compact test case detail and history summary from /api/v1/test-cases/{testCaseId}.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://test-cases/{testCaseId}/history",
    name: "Test Case History",
    description: "Chronological test case history from /api/v1/test-cases/{testCaseId}/history.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://test-cases/{testCaseId}/history/compare",
    name: "Test Case History Compare",
    description:
      "Paged enriched history compare from /api/v1/test-cases/{testCaseId}/history/compare; requires ?projectId=..., ?baseResultUuid=..., and ?targetResultUuid=..., then narrows labels, executor, branch/build, defect, status, parameter, and raw fields for MCP.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://test-cases/{testCaseId}/history/compare/permission-audit",
    name: "Test Case History Compare Permission Audit",
    description:
      "Read-only paginated actor/project-scoped permission audit records from /api/v1/test-cases/{testCaseId}/history/compare/permission-audit; requires ?projectId=... and never exposes raw history or hidden compare inputs.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants",
    name: "Test Case History Compare Permission Audit Replay Invariants",
    description:
      "Read-only paginated actor/project/test-case scoped invariant evidence from /api/v1/test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants; requires ?projectId=... and ?actorId=... and never exposes raw compare inputs, raw history bodies, local paths, storage refs, tokens, or signed URLs.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants/persisted",
    name: "Persisted Test Case History Compare Permission Audit Replay Invariants",
    description:
      "Read-only paginated actor/project/test-case scoped persisted invariant evidence from /api/v1/test-cases/{testCaseId}/history/compare/permission-audit/replay/invariants/persisted; requires ?projectId=... and ?actorId=... and never exposes raw compare inputs, raw history bodies, local paths, storage refs, tokens, signed URLs, replay execution, provider/runtime tools, or mutation access.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://projects/{projectId}/identity-corrections/audit",
    name: "Identity Correction Audit",
    description:
      "Read-only identity correction audit metadata for one project; actor-origin reads require ?actorId=... and system-origin reads require ?originType=system.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://defect-mutes",
    name: "Defect Mute Status",
    description:
      "Read-only project-scoped defect mute status from /api/v1/defects?projectId=..., narrowed to MCP-safe mute metadata.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://projects/{projectId}/defect-mutes/projection",
    name: "Defect Mute Projection",
    description:
      "Read-only project-scoped defect mute projection from /api/v1/projects/{projectId}/defect-mutes/projection; forwards scope headers, preserves raw/effective fields, and omits raw failure payloads.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://projects/{projectId}/defect-mutes/projection/replay",
    name: "Replay-Derived Defect Mute Projection",
    description:
      "Read-only replay-derived defect mute projection from /api/v1/projects/{projectId}/defect-mutes/projection; forwards scope headers, preserves raw/effective separation, and masks raw failure data on denied reads.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://projects/{projectId}/defect-mutes/projection/replay/invariants",
    name: "Defect Mute Replay Invariants",
    description:
      "Read-only paginated defect mute replay invariant evidence from /api/v1/projects/{projectId}/defect-mutes/projection/replay/invariants; forwards project/actor scope headers, masks denied reads, and omits raw failure payloads.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://projects/{projectId}/defect-mutes/projection/replay/invariants/materialized",
    name: "Materialized Defect Mute Replay Invariants",
    description:
      "Read-only paginated materialized defect mute replay invariant summaries from /api/v1/projects/{projectId}/defect-mutes/projection/replay/invariants/materialized; forwards project/actor scope headers, masks denied reads, and omits raw failure payloads, replay execution, and mutation handles.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://launches/{launchId}/quality-gate/mute-effects",
    name: "Launch Quality Gate Mute Effects",
    description:
      "Read-only defect mute effects from /api/v1/launches/{launchId}/quality-gate, without raw failure payloads.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://security/audit",
    name: "Security Audit",
    description:
      "Read-only paginated security audit stream from /api/v1/security/audit; requires ?projectId=... and returns a redacted MCP-safe view.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://security/audit/export/evaluate",
    name: "Security Audit Export Evaluation",
    description:
      "Read-only security audit export policy evaluation from /api/v1/security/audit/export/evaluate; requires projectId, actorId, requestedAt, from, to, and placeholder destination query parameters.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://projects/{projectId}/security/audit/export/lifecycle/replay/invariants",
    name: "Security Audit Export Lifecycle Replay Invariants",
    description:
      "Read-only paginated security audit export lifecycle replay invariant evidence from /api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants; requires ?actorId=..., forwards project/actor scope headers, and omits raw lifecycle events, request payloads, provider endpoints, signed URLs, local paths, and tokens.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized",
    name: "Materialized Security Audit Export Lifecycle Replay Invariants",
    description:
      "Read-only paginated materialized security audit export lifecycle replay invariant evidence from /api/v1/projects/{projectId}/security/audit/export/lifecycle/replay/invariants/materialized; requires ?actorId=..., forwards project/actor scope headers, and omits raw lifecycle events, request payloads, provider endpoints, signed URLs, local paths, credentials, destination resolution, provider execution, and tokens.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://launches/{launchId}/uploads/archive/status",
    name: "Launch Archive Upload Status",
    description:
      "Read-only paginated archive upload status from /api/v1/launches/{launchId}/uploads/archive/status; requires ?projectId=... and omits paths, storage keys, signed URLs, raw payloads, and tokens.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://launches/{launchId}/archive/diagnostics/replay",
    name: "Archive Diagnostic Replay Summaries",
    description:
      "Read-only paginated archive diagnostic replay summaries from /api/v1/launches/{launchId}/archive/diagnostics/replay; requires ?projectId=..., forwards project/actor scope headers, and omits raw paths, storage refs, signed URLs, tokens, payload bytes, worker mutation handles, and replay execution controls.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://projects/{projectId}/archive/diagnostics/replay/fixtures",
    name: "Archive Diagnostic Replay Fixture Contracts",
    description:
      "Read-only paginated synthetic archive diagnostic replay fixture contracts from /api/v1/projects/{projectId}/archive/diagnostics/replay/fixtures; forwards project/actor scope headers and omits raw manifest entries, result files, content, paths, storage refs, signed URLs, tokens, payload bytes, worker mutation handles, and replay execution controls.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://projects/{projectId}/archive/diagnostics/replay/fixtures/materialized",
    name: "Materialized Archive Diagnostic Replay Fixtures",
    description:
      "Read-only paginated materialized synthetic archive diagnostic replay fixture summaries from /api/v1/projects/{projectId}/archive/diagnostics/replay/fixtures/materialized; forwards project/actor scope headers and omits raw manifest entries, result files, content, paths, storage refs, signed URLs, tokens, credentials, payload bytes, worker mutation handles, and replay execution controls.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://launches/{launchId}/attachment-previews/retention/preview",
    name: "Attachment Preview Retention Dry-Run Preview",
    description:
      "Read-only paginated dry-run preview for closed-launch attachment preview descriptor retention from /api/v1/launches/{launchId}/attachment-previews/retention/preview; requires ?projectId=... and never executes deletion.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://launches/{launchId}/attachment-previews/retention/dry-run/schedule",
    name: "Attachment Preview Retention Dry-Run Schedule Descriptors",
    description:
      "Read-only paginated worker-scheduled attachment preview retention dry-run schedule descriptor evidence from /api/v1/launches/{launchId}/attachment-previews/retention/dry-run/schedule; requires ?projectId=..., forwards actor/project scope headers, and never executes deletion, refresh, provider, storage, or mutation work.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://uploads/{uploadId}/archive/status",
    name: "Archive Upload Status",
    description:
      "Read-only archive upload status from /api/v1/uploads/{uploadId}/archive/status; requires ?projectId=... and returns bounded, redacted diagnostics.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://launches/{launchId}/quality-gate",
    name: "Launch Quality Gate",
    description: "Quality gate evaluation from /api/v1/launches/{launchId}/quality-gate.",
    mimeType: "application/json"
  },
  {
    uri: "testhistory://defects",
    name: "Defects",
    description: "Defect records from /api/v1/defects.",
    mimeType: "application/json"
  }
] satisfies ResourceDefinition[];
