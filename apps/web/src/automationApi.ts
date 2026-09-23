import { getJson, requestJson } from "./apiHttp.js";
import type { ApiProjectReadModel } from "./m1WorkspaceApiTypes.js";

export type TestPlanReadModel = {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  status: "active" | "disabled" | "archived";
  selector: { thql?: string; testCaseIds?: string[]; tags?: string[] };
  launchNameTemplate?: string;
  updatedAt: string;
};

export type AutomationJobReadModel = {
  id: string;
  projectId: string;
  name: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  trigger: "api" | "schedule" | "webhook" | "ci";
  testPlanId?: string;
  launchId?: string;
  branch?: string;
  external?: { provider: string; pipelineId?: string; pipelineUrl?: string };
  error?: string;
  updatedAt: string;
};

type ListResponse<T> = { items: T[]; nextCursor?: string };

export type AutomationWorkspaceData = {
  projectId: string;
  plans: TestPlanReadModel[];
  jobs: AutomationJobReadModel[];
  notifications: NotificationIntegrationReadModel[];
  issueTrackers: IssueTrackerIntegrationReadModel[];
  deliveries: IntegrationDeliveryReadModel[];
};

export type NotificationIntegrationReadModel = {
  id: string;
  name: string;
  provider: "generic" | "slack" | "teams" | "pachca";
  enabled: boolean;
  endpointUrl: string;
  events: string[];
  signingSecretConfigured: boolean;
};
export type IssueTrackerIntegrationReadModel = {
  id: string;
  name: string;
  provider: "jira" | "youtrack" | "github" | "generic";
  enabled: boolean;
  baseUrl: string;
  projectKey: string;
  credentialConfigured: boolean;
};
export type IntegrationDeliveryReadModel = {
  id: string;
  integrationId: string;
  kind: "notification" | "issue";
  event: string;
  status: "pending" | "processing" | "delivered" | "retrying" | "dead";
  attempts: number;
  updatedAt: string;
  externalReference?: string;
  lastError?: string;
};

export async function loadAutomationWorkspace(
  projectId?: string
): Promise<AutomationWorkspaceData> {
  const project =
    projectId !== undefined
      ? { id: projectId }
      : (await getJson<ApiProjectReadModel[]>("/api/v1/projects"))[0];
  if (project === undefined) {
    throw new Error("Сначала создайте проект");
  }
  const base = `/api/v1/projects/${encodeURIComponent(project.id)}`;
  const [plans, jobs, notifications, issueTrackers, deliveries] = await Promise.all([
    getJson<ListResponse<TestPlanReadModel>>(`${base}/test-plans?limit=200`),
    getJson<ListResponse<AutomationJobReadModel>>(`${base}/automation-jobs?limit=200`),
    getJson<ListResponse<NotificationIntegrationReadModel>>(`${base}/integrations/notifications`),
    getJson<ListResponse<IssueTrackerIntegrationReadModel>>(`${base}/integrations/issue-trackers`),
    getJson<ListResponse<IntegrationDeliveryReadModel>>(`${base}/integration-deliveries`)
  ]);
  return {
    projectId: project.id,
    plans: plans.items,
    jobs: jobs.items,
    notifications: notifications.items,
    issueTrackers: issueTrackers.items,
    deliveries: deliveries.items
  };
}

export async function createNotificationIntegration(
  projectId: string,
  input: {
    name: string;
    provider: string;
    endpointUrl: string;
    events: string[];
    secretEnvVar?: string;
  }
) {
  return requestJson(
    `/api/v1/projects/${encodeURIComponent(projectId)}/integrations/notifications`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }
  );
}

export async function createIssueTrackerIntegration(
  projectId: string,
  input: {
    name: string;
    provider: string;
    baseUrl: string;
    projectKey: string;
    credentialEnvVar: string;
  }
) {
  return requestJson(
    `/api/v1/projects/${encodeURIComponent(projectId)}/integrations/issue-trackers`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }
  );
}

export async function setOutboundIntegrationEnabled(
  projectId: string,
  kind: "notifications" | "issue-trackers",
  integrationId: string,
  enabled: boolean
) {
  return requestJson(
    `/api/v1/projects/${encodeURIComponent(projectId)}/integrations/${kind}/${encodeURIComponent(integrationId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled })
    }
  );
}

export async function createTestPlan(
  projectId: string,
  input: { name: string; thql: string; description?: string }
): Promise<TestPlanReadModel> {
  return requestJson(`/api/v1/projects/${encodeURIComponent(projectId)}/test-plans`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      selector: { thql: input.thql },
      ...(input.description?.trim() ? { description: input.description } : {})
    })
  });
}

export async function createAutomationJob(
  projectId: string,
  input: { name: string; provider: string; pipelineUrl?: string; testPlanId?: string }
): Promise<AutomationJobReadModel> {
  return requestJson(`/api/v1/projects/${encodeURIComponent(projectId)}/automation-jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      trigger: "ci",
      ...(input.testPlanId ? { testPlanId: input.testPlanId } : {}),
      external: {
        provider: input.provider,
        ...(input.pipelineUrl?.trim() ? { pipelineUrl: input.pipelineUrl } : {})
      }
    })
  });
}

export async function updateAutomationJobStatus(
  projectId: string,
  jobId: string,
  status: AutomationJobReadModel["status"]
): Promise<AutomationJobReadModel> {
  return requestJson(
    `/api/v1/projects/${encodeURIComponent(projectId)}/automation-jobs/${encodeURIComponent(jobId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status })
    }
  );
}
