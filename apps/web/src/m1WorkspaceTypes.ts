export type ResultStatus = "passed" | "failed" | "broken" | "skipped" | "muted";

export type ScenarioStep = {
  name: string;
  status: ResultStatus;
  duration: string;
  trace?: ResultTrace;
  steps?: ScenarioStep[];
  attachments?: ResultAttachment[];
};

export type ResultAttachment = {
  name: string;
  mediaType: string;
  size: string;
  source: string;
  retained: boolean;
  previewUrl?: string;
  preview?: ArtifactPreviewDescriptor;
};

export type ResultParameter = {
  name: string;
  value: string;
  excluded?: boolean;
  masked?: boolean;
};

export type ResultTrace = {
  message: string;
  stack: string[];
};

export type ArtifactPreviewKind = "none" | "text" | "json" | "xml" | "html" | "image";

export type ArtifactPreviewFlavor =
  "text" | "log" | "json" | "xml" | "html" | "image" | "unsupported-binary" | "unknown";

export type ArtifactPreviewSupport = "inline" | "metadata-only" | "unsupported";

export type ArtifactPreviewReason =
  | "eligible"
  | "too-large"
  | "unsupported-binary"
  | "missing-content-type"
  | "content-unavailable"
  | "image-metadata-only";

export type ArtifactPreviewTextBody = {
  type: "redacted-text";
  encoding: "utf8";
  value: string;
  lineCount: number;
  truncated: boolean;
  redacted: boolean;
};

export type ArtifactPreviewImageBody = {
  type: "image-metadata";
  mediaType: string;
  inline: false;
  downloadRequired: true;
};

export type ArtifactPreviewMetadataOnlyBody = {
  type: "metadata-only";
};

export type ArtifactPreviewDescriptor = {
  id: string;
  artifactId: string;
  kind: ArtifactPreviewKind;
  flavor: ArtifactPreviewFlavor;
  support: ArtifactPreviewSupport;
  status: "ready" | "metadata-only";
  reason: ArtifactPreviewReason;
  originalBytes: number;
  previewBytes: number;
  maxPreviewBytes: number;
  contentType?: string;
  sha256: string;
  body: ArtifactPreviewTextBody | ArtifactPreviewImageBody | ArtifactPreviewMetadataOnlyBody;
  safety: {
    descriptorVersion: 1;
    bounded: true;
    pathIncluded: false;
    storageKeyIncluded: false;
    rawPayloadIncluded: false;
    blobIncluded: false;
    signedUrlIncluded: false;
    redactionApplied: boolean;
  };
};

export type TestCaseIdentityState = "corrected" | "split" | "merged" | "uncertain";

export type TestCaseIdentityAudit = {
  state: TestCaseIdentityState;
  historyId: string;
  canonicalTestCaseId: string;
  reason: string;
  confidence: number;
  actor: string;
  changedAt: string;
  previousHistoryIds?: string[];
  relatedTestCaseIds?: string[];
};

export type DefectMuteAudit = {
  id: string;
  scope: "defect" | "quality-gate";
  reason: string;
  actor: string;
  mutedAt: string;
  expiresAt?: string;
  affectedTestCaseIds: string[];
  defectId?: string;
  taskId?: string;
};

export type TestCaseHistoryComparePoint = {
  launchId: string;
  launchName: string;
  startedAt: string;
  status: ResultStatus;
  duration: string;
  retry: number;
  flaky: boolean;
  branch?: string;
  build?: string;
  executor?: string;
};

export type TestCaseHistoryPoint = {
  launchId: string;
  launchName: string;
  resultUuid: string;
  testCaseId?: string;
  startedAt: string;
  status: ResultStatus;
  duration: string;
  retry: boolean;
  flaky: boolean;
  attempt: number;
};

export type TestResultAttempt = {
  attempt: number;
  status: ResultStatus;
  duration: string;
  startedAt?: string;
  message?: string;
  final: boolean;
};

export type TestCaseHistoryCompareValue =
  | string
  | {
      text?: string;
      state: "visible" | "redacted" | "denied";
      reason?: string;
    };

export type TestCaseHistoryCompareScope = {
  actor?: TestCaseHistoryCompareValue;
  project?: TestCaseHistoryCompareValue;
  permission: "allowed" | "redacted" | "denied";
  redactionApplied: boolean;
  redactedFields: string[];
};

export type TestCaseHistoryComparePermissionAuditRecord = {
  compareId: string;
  decision: "ready" | "partial" | "denied";
  actor: TestCaseHistoryCompareValue;
  eventCount: number;
  rawHistoryDigest?: string;
  rawHistoryItemCount: number;
  reasons: string[];
  unavailable: string[];
};

export type TestCaseHistoryComparePermissionAudit = {
  state: "ready" | "partial" | "empty" | "denied";
  actor: TestCaseHistoryCompareValue;
  project: TestCaseHistoryCompareValue;
  evaluatedAt: string;
  source?: "local-read-model" | "rest-permission-audit" | "mcp-permission-audit";
  access?: {
    scope: string;
    projectScoped: boolean;
    actorScoped: boolean;
    mutation: false;
    redacted: boolean;
  };
  page?: {
    limit: number;
    offset: number;
    returned: number;
    total: number;
    hasMore: boolean;
  };
  replay: {
    eventCount: number;
    acceptedCount: number;
    deniedCount: number;
    partialCount: number;
    duplicateCount: number;
    ignoredCount: number;
  };
  digest: {
    projectionDigest: string;
    rawHistoryDigest: string;
    algorithm: "sha256";
    rawHistoryExposed: false;
  };
  reason?: TestCaseHistoryCompareValue;
  redactedFields: string[];
  records?: TestCaseHistoryComparePermissionAuditRecord[];
};

export type TestCaseHistoryComparePermissionAuditInvariantItem = {
  ordinal: number;
  eventId: string;
  redacted: true;
};

export type TestCaseHistoryComparePermissionAuditInvariant = {
  state: "ready" | "partial" | "empty" | "denied";
  actor: TestCaseHistoryCompareValue;
  project: TestCaseHistoryCompareValue;
  evaluatedAt: string;
  source?:
    "local-read-model" | "rest-permission-audit-invariants" | "mcp-permission-audit-invariants";
  access?: {
    scope: string;
    projectScoped: boolean;
    actorScoped: boolean;
    mutation: false;
    redacted: boolean;
  };
  page?: {
    limit: number;
    offset: number;
    returned: number;
    total: number;
    hasMore: boolean;
  };
  invariant: {
    boundary: string;
    source: string;
    consistency: string;
    mutationBoundary: string;
    deterministic: boolean;
    recomputable: boolean;
    projectScoped: boolean;
    actorScoped: boolean;
    leakedActorIds: string[];
    projectionDigest: string;
    recomputedDigest: string;
  };
  appendOnly: {
    uniqueProjectedEventIds: boolean;
    duplicateEventIds: string[];
    totalProjectedEventIds: number;
  };
  rawCompareInputs: {
    included: false;
    preserved: boolean;
    digestCount: number;
    itemCount: number;
  };
  redaction: {
    passed: boolean;
    leakedMarkerCount: number;
    leakedMarkers: string[];
    rawHistoryIncluded: false;
    rawCompareInputsIncluded: false;
    hiddenOrMaskedValuesIncluded: false;
    tokensIncluded: false;
    pathsIncluded: false;
    storageLocationsIncluded: false;
    artifactUrlsIncluded: false;
    policy: string;
  };
  items?: TestCaseHistoryComparePermissionAuditInvariantItem[];
};

export type TestCaseHistoryCompareAvailability = {
  state: "ready" | "loading" | "error" | "empty" | "denied" | "partial";
  title?: string;
  message?: string;
  reason?: string;
  unavailable?: string[];
};

export type TestCaseHistoryCompareChange = {
  id: string;
  field:
    | "status"
    | "duration"
    | "retry"
    | "flaky"
    | "parameters"
    | "statusDetails"
    | "labels"
    | "executor"
    | "branchBuild"
    | "defectSignature";
  label: string;
  before: TestCaseHistoryCompareValue;
  after: TestCaseHistoryCompareValue;
  impact: "low" | "medium" | "high";
};

export type TestCaseHistoryComparePage = {
  availability?: TestCaseHistoryCompareAvailability;
  from: TestCaseHistoryComparePoint;
  to: TestCaseHistoryComparePoint;
  scope?: TestCaseHistoryCompareScope;
  permissionAudit?: TestCaseHistoryComparePermissionAudit;
  permissionAuditInvariant?: TestCaseHistoryComparePermissionAuditInvariant;
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
  changes: TestCaseHistoryCompareChange[];
};

export type TestResult = {
  id: string;
  launchId?: string;
  allureId: string;
  name: string;
  suite: string;
  status: ResultStatus;
  previousStatus?: Exclude<ResultStatus, "muted">;
  duration: string;
  owner: string;
  caseType: "manual" | "automated";
  workflow: "Draft" | "Ready" | "Review" | "Deprecated";
  severity: "critical" | "normal" | "minor";
  layer: "UI" | "API" | "E2E";
  tags: string[];
  links: string[];
  linkDetails?: Array<{ label: string; type?: string; url: string }>;
  issues: string[];
  testKeys: string[];
  members: string[];
  customFields: Array<{ label: string; value: string }>;
  muted: boolean;
  history: ResultStatus[];
  historyPoints?: TestCaseHistoryPoint[];
  retryAttempts?: TestResultAttempt[];
  steps: ScenarioStep[];
  attachments?: ResultAttachment[];
  parameters?: ResultParameter[];
  trace?: ResultTrace;
  description?: string;
  defect?: string;
  deletedAt?: string;
  deletedReason?: string;
  defectHistory?: Array<{
    id: string;
    removedAt: string;
    title?: string;
  }>;
  defectMute?: DefectMuteAudit;
  historyCompare?: TestCaseHistoryComparePage;
  identity?: TestCaseIdentityAudit;
};

export type Launch = {
  name: string;
  build: string;
  branch: string;
  started: string;
  environment: string;
  owner: string;
};

export type LaunchListItem = {
  id: string;
  projectId?: string;
  name: string;
  state: string;
  branch?: string;
  createdAt?: string;
  metadata: string[];
  defects: number;
  members: number;
  counters: Record<ResultStatus, number>;
};

export type M1Workspace = {
  projectId?: string;
  launch: Launch;
  launchItems: LaunchListItem[];
  results: TestResult[];
  resultPage?: LaunchResultPage;
  selectedResultDetail?: TestResult;
};

export type LaunchResultPage = {
  limit: number;
  cursor: string | null;
  offset: number;
  returned: number;
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
};

type ApiLaunch = Launch;
type ApiLaunchListItem = LaunchListItem;
type ApiResult = Omit<TestResult, "steps">;

export type M1WorkspaceResponse = {
  launch: ApiLaunch;
  launches: ApiLaunchListItem[];
  results: ApiResult[];
  resultSteps: Record<string, ScenarioStep[]>;
};

export type M1SurfaceContract = {
  testCases: readonly ["list", "selected-case"];
  launches: readonly ["launch", "results", "details"];
  jobs: readonly ["queues", "runtime"];
};

export const M1_SURFACE_CONTRACT: M1SurfaceContract = {
  testCases: ["list", "selected-case"],
  launches: ["launch", "results", "details"],
  jobs: ["queues", "runtime"]
};

export function assertM1SurfaceContract(contract: M1SurfaceContract): M1SurfaceContract {
  const expected: M1SurfaceContract = {
    testCases: ["list", "selected-case"],
    launches: ["launch", "results", "details"],
    jobs: ["queues", "runtime"]
  };

  for (const key of Object.keys(expected) as Array<keyof M1SurfaceContract>) {
    if (contract[key].join("|") !== expected[key].join("|")) {
      throw new Error(`M1 surface contract drifted for ${key}`);
    }
  }

  return contract;
}
