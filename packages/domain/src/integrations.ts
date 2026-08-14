export type OutboundIntegrationEvent =
  | "automation-job.succeeded"
  | "automation-job.failed"
  | "automation-job.canceled"
  | "launch.closed"
  | "launch.failed"
  | "quality-gate.failed";

export type NotificationProvider = "generic" | "slack" | "teams" | "pachca";

export type ProjectNotificationIntegration = {
  id: string;
  name: string;
  provider: NotificationProvider;
  enabled: boolean;
  endpointUrl: string;
  events: OutboundIntegrationEvent[];
  secretEnvVar?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type IssueTrackerProvider = "jira" | "youtrack" | "github" | "generic";

export type ProjectIssueTrackerIntegration = {
  id: string;
  name: string;
  provider: IssueTrackerProvider;
  enabled: boolean;
  baseUrl: string;
  projectKey: string;
  credentialEnvVar: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationDeliveryKind = "notification" | "issue";
export type IntegrationDeliveryStatus =
  "pending" | "processing" | "delivered" | "retrying" | "dead";

export type IntegrationDelivery = {
  id: string;
  projectId: string;
  integrationId: string;
  kind: IntegrationDeliveryKind;
  event: string;
  status: IntegrationDeliveryStatus;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
  responseStatus?: number;
  externalReference?: string;
  lastError?: string;
  lease?: {
    workerId: string;
    token: string;
    expiresAt: string;
  };
};

export function canDispatchIntegrationDelivery(
  delivery: IntegrationDelivery,
  now: string
): boolean {
  if (delivery.status === "delivered" || delivery.status === "dead") return false;
  if (
    delivery.status === "processing" &&
    delivery.lease !== undefined &&
    delivery.lease.expiresAt > now
  )
    return false;
  return delivery.nextAttemptAt <= now;
}

export function nextIntegrationRetryAt(now: string, attempts: number): string {
  const boundedAttempt = Math.max(1, Math.min(attempts, 8));
  const delaySeconds = Math.min(3600, 5 * 2 ** (boundedAttempt - 1));
  return new Date(Date.parse(now) + delaySeconds * 1000).toISOString();
}
