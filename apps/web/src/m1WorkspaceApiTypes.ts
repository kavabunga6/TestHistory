import type {
  ArtifactPreviewDescriptor,
  ResultStatus,
  TestCaseHistoryComparePage
} from "./m1WorkspaceTypes.js";

export type ApiProjectReadModel = {
  id: string;
  key?: string;
  name?: string;
  createdAt?: string;
};

export type ApiAllureStatus = Exclude<ResultStatus, "muted"> | "unknown";

export type ApiLaunchReadModel = {
  id: string;
  projectId: string;
  name: string;
  status: string;
  counters: Record<ApiAllureStatus, number>;
  branch?: string;
  commitSha?: string;
  buildNumber?: string;
  createdAt?: string;
};

export type ApiNormalizedResultReadModel = {
  uuid: string;
  historyId?: string;
  testCaseId?: string;
  fullName?: string;
  name: string;
  status: ApiAllureStatus;
  durationMs?: number;
  labels?: Record<string, string[]>;
  historyCompare?: TestCaseHistoryComparePage;
  statusDetails?: ApiStatusDetailsReadModel;
  quarantine?: ApiResultQuarantineReadModel;
  raw?: {
    links?: Array<{ name?: string; url: string; type?: string }>;
    description?: string;
    parameters?: ApiParameterReadModel[];
    attachments?: ApiAttachmentReadModel[];
    statusDetails?: ApiStatusDetailsReadModel;
  };
};

export type ApiResultQuarantineReadModel = {
  id: string;
  status: "active" | "inactive";
  reason?: string;
  mutedAt: string;
  origin: { type: "actor"; actorId: string } | { type: "system"; systemId: string };
  affectedTestIds?: string[];
};

export type ApiHistoryComparePermissionAuditReadModel = {
  kind: "test-case-history-compare-permission-audit";
  projectId: string;
  testCaseId: string;
  actor?: ApiHistoryCompareActorReadModel;
  access?: {
    scope?: string;
    projectScoped?: boolean;
    actorScoped?: boolean;
    mutation?: boolean;
    redacted?: boolean;
  };
  availability?: {
    status?: "ready" | "partial" | "empty" | "denied" | string;
    reason?: string;
    projectScoped?: boolean;
    actorScoped?: boolean;
    redacted?: boolean;
    partial?: boolean;
    unavailable?: string[];
  };
  query?: {
    projectId?: string;
    actorId?: string;
    comparePairScoped?: boolean;
    pagination?: {
      limit?: number;
      cursor?: string | null;
      offset?: number;
    };
    redacted?: boolean;
  };
  audit?: {
    adapterKind?: string;
    boundary?: string;
    projectId?: string;
    actorScoped?: boolean;
    projectionDigest?: string;
    mutationBoundary?: string;
    replayedEventCount?: number;
    recordCount?: number;
    byDecision?: {
      denied?: number;
      partial?: number;
      ready?: number;
    };
    rawHistory?: {
      included?: boolean;
      preserved?: boolean;
      digest?: string;
      digests?: string[];
      itemCount?: number;
    };
    firstOccurredAt?: string;
    lastOccurredAt?: string;
  };
  page?: {
    limit?: number;
    offset?: number;
    returned?: number;
    total?: number;
    hasMore?: boolean;
  };
  redaction?: {
    rawHistoryIncluded?: boolean;
    rawCompareInputsIncluded?: boolean;
    hiddenOrMaskedValuesIncluded?: boolean;
    tokensIncluded?: boolean;
    pathsIncluded?: boolean;
    storageLocationsIncluded?: boolean;
    artifactUrlsIncluded?: boolean;
  };
  diagnostics?: Array<{
    code?: string;
    compareId?: string;
    projectScoped?: boolean;
    actorScoped?: boolean;
    redacted?: boolean;
  }>;
  items?: ApiHistoryComparePermissionAuditRecordReadModel[];
  records?: ApiHistoryComparePermissionAuditRecordReadModel[];
  policy?: {
    restParity?: {
      method?: string;
      path?: string;
    };
    mutationAllowed?: boolean;
    rawHistoryIncluded?: boolean;
    rawCompareInputsIncluded?: boolean;
    deniedStateMasked?: boolean;
  };
};

export type ApiHistoryComparePermissionAuditInvariantReadModel = {
  kind: "test-case-history-compare-permission-audit-replay-invariants";
  projectId: string;
  testCaseId: string;
  actor?: ApiHistoryCompareActorReadModel;
  access?: {
    scope?: string;
    projectScoped?: boolean;
    actorScoped?: boolean;
    mutation?: boolean;
    redacted?: boolean;
  };
  availability?: {
    status?: "ready" | "partial" | "empty" | "denied" | string;
    projectScoped?: boolean;
    actorScoped?: boolean;
    redacted?: boolean;
    partial?: boolean;
    unavailable?: string[];
  };
  query?: {
    projectId?: string;
    actorId?: string;
    testCaseId?: string;
    testCaseScoped?: boolean;
    projectScoped?: boolean;
    actorScoped?: boolean;
    comparePairScoped?: boolean;
    pagination?: {
      limit?: number;
      cursor?: string | null;
      offset?: number;
    };
    redacted?: boolean;
  };
  invariant?: {
    boundary?: string;
    source?: string;
    consistency?: string;
    mutationBoundary?: string;
    deterministic?: boolean;
    recomputable?: boolean;
    projectScoped?: boolean;
    actorScoped?: {
      requested?: boolean;
      passed?: boolean;
      actorId?: string;
      leakedActorIds?: string[];
    };
    projectionDigest?: string;
    recomputedDigest?: string;
  };
  appendOnly?: {
    uniqueProjectedEventIds?: boolean;
    duplicateEventIds?: string[];
    totalProjectedEventIds?: number;
  };
  rawCompareInputs?: {
    included?: boolean;
    preserved?: boolean;
    digestCount?: number;
    itemCount?: number;
  };
  redaction?: {
    passed?: boolean;
    leakedMarkerCount?: number;
    leakedMarkers?: string[];
    rawHistoryIncluded?: boolean;
    rawCompareInputsIncluded?: boolean;
    hiddenOrMaskedValuesIncluded?: boolean;
    tokensIncluded?: boolean;
    pathsIncluded?: boolean;
    storageLocationsIncluded?: boolean;
    artifactUrlsIncluded?: boolean;
    policy?: string;
  };
  page?: {
    limit?: number;
    offset?: number;
    returned?: number;
    total?: number;
    hasMore?: boolean;
  };
  items?: Array<{
    ordinal?: number;
    eventId?: string;
    redacted?: boolean;
  }>;
};

export type ApiHistoryCompareActorReadModel = {
  type?: string;
  actorId?: string;
  displayName?: string;
  scoped?: boolean;
};

export type ApiHistoryComparePermissionAuditRecordReadModel = {
  compareId?: string;
  testCaseId?: string;
  actor?: ApiHistoryCompareActorReadModel;
  decision?: "ready" | "partial" | "denied" | string;
  reasons?: Array<{
    code?: string;
    severity?: string;
    explanation?: string;
    fields?: string[];
  }>;
  unavailable?: string[];
  rawHistory?: {
    included?: boolean;
    preserved?: boolean;
    digest?: string;
    itemCount?: number;
  };
  eventCount?: number;
  firstOccurredAt?: string;
  lastOccurredAt?: string;
  redacted?: boolean;
};

export type ApiTestCaseHistoryPageReadModel = {
  kind: "test-case-history";
  testCaseId: string;
  projectId?: string;
  totalPoints: number;
  returnedPoints: number;
  omittedPoints: number;
  page?: {
    limit?: number;
    cursor?: string | null;
    offset?: number;
    returned?: number;
    total?: number;
    nextCursor?: string | null;
    hasMore?: boolean;
  };
  points: ApiTestCaseHistoryPointReadModel[];
};

export type ApiTestCaseMetadataReadModel = {
  id: string;
  projectId: string;
  allureId?: string;
  name: string;
  fullName?: string;
  workflowStatus?: "draft" | "active" | "deprecated" | "archived" | string;
  tags?: string[];
  layer?: string;
  description?: string;
  customFields?: Record<string, string>;
  members?: string[];
  links?: Array<{ name?: string; url: string; type?: string }>;
  issues?: string[];
  testKeys?: string[];
  updatedAt?: string;
};

export type ApiTestCaseSummaryReadModel = {
  id: string;
  name: string;
  fullName?: string;
  historyIds?: string[];
  totalResults: number;
  lastStatus: ApiAllureStatus;
  passRate?: number;
  flakyScore?: number;
  medianDurationMs?: number;
  p95DurationMs?: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  testCase?: ApiTestCaseMetadataReadModel;
  history?: ApiTestCaseHistoryPointReadModel[];
};

export type ApiTestCaseListReadModel = {
  kind: "test-case-list";
  projectId?: string;
  items: ApiTestCaseSummaryReadModel[];
};

export type ApiDefectClusterReadModel = {
  id: string;
  status: "open" | "closed" | string;
  lifecycleState?: "new" | "recurring" | "resolved-ish" | string;
  title: string;
  signature?: {
    hash?: string;
    reason?: string;
    sources?: string[];
  };
  affectedTestIds?: string[];
  currentAffectedTestIds?: string[];
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  firstSeenLaunchId?: string;
  lastSeenLaunchId?: string;
  results?: Array<{
    launchId: string;
    launchName: string;
    launchCreatedAt: string;
    resultUuid: string;
    testId: string;
    status: ApiAllureStatus;
  }>;
};

export type ApiDefectListReadModel = {
  kind: "defect-list";
  projectId?: string;
  items: ApiDefectClusterReadModel[];
};

export type ApiTestCaseHistoryPointReadModel = {
  launchId: string;
  launchName: string;
  launchCreatedAt: string;
  resultUuid: string;
  testCaseId?: string;
  fullName?: string;
  status: ApiAllureStatus;
  durationMs?: number;
  historyId?: string;
  retry?: boolean;
  flaky?: boolean;
  attemptNumber?: number;
  identity?: {
    value?: string;
    source?: "testCaseId" | "fullName" | "historyId" | "name" | string;
  };
};

export type ApiParameterReadModel = {
  name?: string;
  value?: unknown;
  excluded?: boolean;
  masked?: boolean;
  mode?: string;
};

export type ApiAttachmentReadModel = {
  name?: string;
  type?: string;
  source?: string;
  size?: number;
  previewUrl?: string;
  preview?: ArtifactPreviewDescriptor;
};

export type ApiStatusDetailsReadModel = {
  message?: string;
  trace?: string;
};

export type ApiLaunchDetailsReadModel = ApiLaunchReadModel & {
  results: ApiNormalizedResultReadModel[];
};

export type ApiResultStepReadModel = {
  name: string;
  status?: ApiAllureStatus;
  statusDetails?: ApiStatusDetailsReadModel;
  start?: number;
  stop?: number;
  attachments?: ApiAttachmentReadModel[];
  steps?: ApiResultStepReadModel[];
};

export type ApiResultDetailsReadModel = ApiNormalizedResultReadModel & {
  steps?: ApiResultStepReadModel[];
  attachments?: ApiAttachmentReadModel[];
  labels: Record<string, string[]>;
  links?: Array<{ name?: string; url: string; type?: string }>;
  raw?: ApiNormalizedResultReadModel["raw"];
};

export type ApiPagedList<T> = {
  items: T[];
};

export type ApiLaunchResultListReadModel = {
  items: ApiNormalizedResultReadModel[];
  page?: {
    limit: number;
    cursor: string | null;
    offset: number;
    returned: number;
    total: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
};
