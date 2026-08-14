import type { ArchiveUploadPageMetadata } from "./apiArchiveTypes.js";

export type SecurityAuditExportLifecycleState =
  "requested" | "evaluated" | "approved" | "denied" | "cancelled" | "expired";

export type SecurityAuditExportLifecycleApiState =
  | {
      state: "loading";
    }
  | {
      data: SecurityAuditExportLifecycleReplayRead;
      state: "ready" | "empty" | "partial";
    }
  | {
      message: string;
      state: "error" | "denied";
    };

export type SecurityAuditExportLifecycleInvariantApiState =
  | {
      state: "loading";
    }
  | {
      data: SecurityAuditExportLifecycleReplayInvariantRead;
      state: "ready" | "empty" | "partial";
    }
  | {
      message: string;
      state: "error" | "denied";
    };

export type SecurityAuditExportLifecycleReplayRead = {
  kind: "security-audit-export-lifecycle-replay";
  project: {
    id: string;
    scoped: boolean;
  };
  actor?: {
    id: string;
    scoped: boolean;
  };
  access: {
    scope: "security-audit:read" | string;
    projectScoped: boolean;
    actorScoped: boolean;
    mutation: false;
    redacted: boolean;
  };
  replay: {
    status: "not_started" | "replayed" | "unavailable" | string;
    eventCount: number;
    requestCount: number;
    duplicateCount: number;
    ignoredCount: number;
    projectionDigest: string;
    appendOnly: boolean;
    deterministic: boolean;
    rawEventsExposed: false;
    providerNeutral: true;
  };
  execution: {
    exportStarted: false;
    providerIntegration: false;
    providerEndpointContacted: false;
    credentialsResolved: false;
    signedUrlsIssued: false;
    destinationResolved: false;
  };
  page: ArchiveUploadPageMetadata;
  summary: Record<SecurityAuditExportLifecycleState, number> & {
    totalRequests: number;
  };
  items: SecurityAuditExportLifecycleReplayItem[];
};

export type SecurityAuditExportLifecycleReplayItem = {
  requestId: string;
  status: SecurityAuditExportLifecycleState;
  eventCount: number;
  lastEventAt?: string;
  actorId?: string;
  reason?: string;
  decisionStatus?: "allowed" | "denied" | string;
};

export type SecurityAuditExportLifecycleReplayInvariantRead = {
  kind: "security-audit-export-lifecycle-replay-invariants";
  project: {
    id: string;
    scoped: boolean;
  };
  actor: {
    id: string;
    scoped: boolean;
  };
  access: {
    scope: "security:audit:read" | string;
    projectScoped: boolean;
    actorScoped: boolean;
    mutation: false;
    redacted: boolean;
  };
  replay: {
    status: "empty" | "replayed" | string;
    eventCount: number;
    requestCount: number;
    duplicateCount?: number;
    ignoredCount: number;
    projectionDigest: string;
    appendOnly: boolean;
    deterministic: boolean;
    recomputable: boolean;
    rawEventsExposed: boolean;
    rawRequestsExposed: boolean;
    providerNeutral: boolean;
  };
  execution: {
    exportStarted: boolean;
    providerIntegration: boolean;
    providerEndpointContacted: boolean;
    credentialsResolved: boolean;
    signedUrlsIssued: boolean;
    destinationResolved: boolean;
  };
  page: ArchiveUploadPageMetadata;
  summary: Record<SecurityAuditExportLifecycleState, number> & {
    totalRequests: number;
  };
  invariants: {
    appendOnly: boolean;
    deterministic: boolean;
    projectScoped: boolean;
    actorScoped: boolean;
    redacted: boolean;
    mutationFree: boolean;
    providerNeutral: boolean;
    rawEventsExposed: boolean;
    rawRequestsExposed: boolean;
    providerEndpointsContacted: boolean;
    signedUrlsIssued: boolean;
    secretsExposed: boolean;
  };
  items: SecurityAuditExportLifecycleReplayInvariantItem[];
};

export type SecurityAuditExportLifecycleReplayInvariantItem = {
  requestId: string;
  status: SecurityAuditExportLifecycleState | string;
  eventCount: number;
  lastEventAt?: string;
  actorIds: string[];
  decisionStatus?: "allowed" | "denied" | string;
  reasonCodes: string[];
  timeline?: Partial<
    Record<"requestedAt" | "evaluatedAt" | "decidedAt" | "cancelledAt" | "expiredAt", string>
  >;
};
