import type { ArchiveUploadPageMetadata } from "./apiArchiveTypes.js";

export type AttachmentPreviewRetentionStatus = "cleanup_eligible" | "retained" | "preserved";

export type AttachmentPreviewRetentionApiState =
  | {
      state: "loading";
    }
  | {
      data: AttachmentPreviewRetentionPreviewRead;
      state: "ready" | "empty";
    }
  | {
      message: string;
      state: "error" | "denied";
    };

export type AttachmentPreviewRetentionPreviewRead = {
  kind: "attachment-preview-retention-preview";
  query?: {
    status: AttachmentPreviewRetentionStatus | null;
    limit: number;
    cursor: string | null;
    batchSize: number;
  };
  launch: {
    id: string;
    projectId: string;
    status: "closed";
    closedAt: string | null;
  };
  access: {
    scope: "artifacts:read";
    projectScoped: true;
    mutation: false;
    redacted: true;
  };
  execution: {
    deletionStarted: false;
    deletionMutation: false;
    providerActions: false;
    objectStorageTouched: false;
  };
  boundary: {
    scope: "closed-launch";
    eligibleLaunchStatus: "closed";
    descriptorSource: "artifact-preview-descriptor-read-model";
    rawMaterialReturned: false;
  };
  page: {
    limit: number;
    cursor: string | null;
    offset: number;
    returned: number;
    total: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
  summary: {
    descriptorCount: number;
    cleanupEligibleDescriptorCount: number;
    retainedDescriptorCount: number;
    preservedDescriptorCount: number;
    evidenceDescriptorCount: number;
    legalHoldPlaceholderCount: number;
    invalidDescriptorCount: number;
  };
  items: AttachmentPreviewRetentionItem[];
  dryRunPlan?: AttachmentPreviewRetentionDryRunPlan;
  policy?: AttachmentPreviewRetentionReadPolicy;
};

export type AttachmentPreviewRetentionDryRunPlan = {
  pageScoped: true;
  candidateCount: number;
  batchSize: number;
  batchCount: number;
  totalCandidateBytes: number;
  planDigest: string | null;
  deleteRequestedCount: 0;
  batches: Array<{
    index: number;
    candidateCount: number;
    totalBytes: number;
    candidateRefs: string[];
    batchDigest: string;
    deletionExecution: false;
  }>;
};

export type AttachmentPreviewRetentionReadPolicy = {
  mutationAllowed: false;
  deletionExecution: false;
  providerActions: false;
  rawPayloadsIncluded: false;
  pathsIncluded: false;
  storageLocationsIncluded: false;
  signedUrlsIncluded: false;
  tokensIncluded: false;
  paginationRequired: true;
  redacted: true;
};

export type AttachmentPreviewRetentionDryRunScheduleApiState =
  | {
      state: "loading";
    }
  | {
      data: AttachmentPreviewRetentionDryRunScheduleRead;
      state: "ready" | "empty" | "partial";
    }
  | {
      message: string;
      state: "error" | "denied";
    };

export type AttachmentPreviewRetentionDryRunScheduleRead = {
  kind: "attachment-preview-retention-dry-run-schedule";
  scope: {
    projectId: string;
    launchId: string;
    actorId?: string;
  };
  access: {
    scope: "artifacts:read" | string;
    projectScoped: boolean;
    actorScoped?: boolean;
    mutation: false;
    redacted: boolean;
  };
  query?: {
    scheduleDigest?: string;
    limit: number;
    cursor: string | null;
  };
  boundary: {
    scope: "closed-launch" | string;
    workerScheduled: true;
    closedLaunchScoped: true;
    descriptorSource?: "worker-scheduled-dry-run-evidence" | string;
    rawMaterialReturned: false;
  };
  execution: {
    dryRun: true;
    readOnly: true;
    workerExecutionAllowed: false;
    deletionMutation: false;
    deletionExecution: false;
    providerActions: false;
    objectStorageTouched: false;
    deleteRequestedCount: 0;
  };
  page: ArchiveUploadPageMetadata;
  summary: {
    sourceDescriptorCount?: number;
    closedLaunchDescriptorCount?: number;
    skippedOpenLaunchDescriptorCount?: number;
    missingLaunchScopeDescriptorCount?: number;
    cleanupEligibleDescriptorCount?: number;
    scheduledDescriptorCount: number;
    retainedDescriptorCount?: number;
    invalidDescriptorCount?: number;
    duplicateDescriptorCount?: number;
    omittedDiagnosticCount?: number;
    scheduleDigest?: string;
    projectionDigest?: string;
    plannedOperations?: string[];
    deleteRequestedCount: 0;
  };
  transitions?: Array<{
    state: string;
    at: string;
  }>;
  batches: AttachmentPreviewRetentionDryRunScheduleBatch[];
  diagnostics: AttachmentPreviewRetentionDryRunScheduleDiagnostic[];
  policy?: {
    restParity?: Record<string, unknown>;
    projectIdRequired?: true;
    closedLaunchScoped?: true;
    actorIdPassThrough?: true;
    headersForwarded?: string[];
    equalOrNarrowerThanRest?: true;
    mutationAllowed: false;
    refreshAllowed?: false;
    deletionExecution: false;
    providerActions: false;
    rawPayloadsIncluded?: false;
    pathsIncluded: false;
    storageLocationsIncluded: false;
    signedUrlsIncluded: false;
    tokensIncluded: false;
    paginationRequired?: true;
    redactionRules?: string[];
  };
};

export type AttachmentPreviewRetentionDryRunScheduleBatch = {
  index: number;
  descriptorCount: number;
  scheduledAfterMinutes?: number;
  maxCount?: number;
  descriptorRefs?: string[];
  omittedDescriptorRefCount?: number;
  batchDigest: string;
  deletionExecution: false;
  deleteRequestedCount?: 0;
};

export type AttachmentPreviewRetentionDryRunScheduleDiagnostic = {
  code: string;
  severity: "info" | "warn" | "error" | string;
  retryable?: boolean;
  descriptorRef?: string;
  message?: string;
};

export type AttachmentPreviewRetentionItem = {
  id: string;
  launchId: string;
  projectId: string;
  artifactId: string;
  previewDescriptorId: string;
  status: AttachmentPreviewRetentionStatus;
  observedAt: string;
  evaluatedAt: string;
  cleanupEligibleAt: string | null;
  descriptor: {
    kind: string;
    flavor: string;
    support: string;
    status: string;
    reason: string;
    contentType?: string;
    originalBytes: number;
    previewBytes: number;
    maxPreviewBytes: number;
  };
  retention: {
    retentionClass: string;
    policyClass: string;
    auditReason: string;
    retentionHorizonDays: number;
    cleanupEligibility: {
      eligible: boolean;
      reason: string;
    };
    horizon: string;
  };
  evidencePreserved: boolean;
  legalHoldPlaceholder: boolean;
  deletion: {
    planned: false;
    executed: false;
    providerAction: false;
  };
};
