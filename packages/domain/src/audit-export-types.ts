export type SecurityAuditExportFormat = "jsonl" | "csv";

export type SecurityAuditExportDestination = {
  type: "placeholder";
  secretRef?: string;
};

export type SecurityAuditExportCriteriaValue =
  | string
  | number
  | boolean
  | null
  | SecurityAuditExportCriteriaValue[]
  | {
      readonly [key: string]: SecurityAuditExportCriteriaValue | undefined;
    };

export type SecurityAuditExportRequest = {
  projectId: string;
  actorId: string;
  requestedAt: string;
  range: {
    from: string;
    to: string;
  };
  destination: SecurityAuditExportDestination;
  format?: SecurityAuditExportFormat;
  criteria?: SecurityAuditExportCriteriaValue;
};

export type SecurityAuditExportPolicy = {
  enabled?: boolean;
  placeholderOnly?: boolean;
  requireSecretRef?: boolean;
  maxRangeDays?: number;
  allowedProjectIds?: readonly string[];
  allowedActorIds?: readonly string[];
};

export type SecurityAuditExportDecisionStatus = "allowed" | "denied";

export type SecurityAuditExportDecisionReason = {
  code: string;
  severity: "info" | "deny";
  explanation: string;
  fields: string[];
};

export type SecurityAuditExportDecisionRequest = {
  projectId: string;
  actorId: string;
  requestedAt: string;
  range: {
    from: string;
    to: string;
    days: number;
  };
  destination: SecurityAuditExportDestination;
  format: SecurityAuditExportFormat;
  criteria?: SecurityAuditExportCriteriaValue;
};

export type SecurityAuditExportDecision = {
  schemaVersion: 1;
  status: SecurityAuditExportDecisionStatus;
  allowed: boolean;
  request: SecurityAuditExportDecisionRequest;
  limits: {
    maxRangeDays: number;
  };
  reasons: SecurityAuditExportDecisionReason[];
};

export type SecurityAuditExportLifecycleState =
  "requested" | "evaluated" | "approved" | "denied" | "cancelled" | "expired";

export type SecurityAuditExportLifecycleEventType =
  | "audit_export.requested"
  | "audit_export.evaluated"
  | "audit_export.approved"
  | "audit_export.denied"
  | "audit_export.cancelled"
  | "audit_export.expired";

export type SecurityAuditExportLifecycleMetadataValue = SecurityAuditExportCriteriaValue;

export type SecurityAuditExportLifecycleEvent = Readonly<{
  schemaVersion: 1;
  id: string;
  fingerprint: string;
  projectId: string;
  requestId: string;
  type: SecurityAuditExportLifecycleEventType;
  status: SecurityAuditExportLifecycleState;
  occurredAt: string;
  actorId?: string;
  request?: SecurityAuditExportDecisionRequest;
  decision?: SecurityAuditExportDecision;
  reason?: string;
  metadata?: SecurityAuditExportLifecycleMetadataValue;
}>;

export type CreateSecurityAuditExportLifecycleEventInput = {
  projectId: string;
  requestId: string;
  type: SecurityAuditExportLifecycleEventType;
  occurredAt: string;
  actorId?: string;
  request?: SecurityAuditExportRequest;
  decision?: SecurityAuditExportDecision;
  reason?: string;
  metadata?: SecurityAuditExportLifecycleMetadataValue;
};

export type SecurityAuditExportLifecycleRequestRecord = {
  projectId: string;
  requestId: string;
  status: SecurityAuditExportLifecycleState;
  actorIds: string[];
  events: SecurityAuditExportLifecycleEvent[];
  requestedAt?: string;
  evaluatedAt?: string;
  decidedAt?: string;
  cancelledAt?: string;
  expiredAt?: string;
  request?: SecurityAuditExportDecisionRequest;
  decision?: SecurityAuditExportDecision;
  reasons: SecurityAuditExportDecisionReason[];
};

export type SecurityAuditExportLifecycleProjection = {
  projectId: string;
  actorId?: string;
  totalRequests: number;
  byStatus: Record<SecurityAuditExportLifecycleState, number>;
  requestIds: string[];
  requests: SecurityAuditExportLifecycleRequestRecord[];
  events: SecurityAuditExportLifecycleEvent[];
  firstOccurredAt?: string;
  lastOccurredAt?: string;
};

export type SecurityAuditExportLifecycleReplayOptions = {
  projectId: string;
  actorId?: string;
};
