export type TestPlanStatus = "active" | "disabled" | "archived";

export type AutomatedTestSelector = {
  thql?: string;
  testCaseIds?: string[];
  tags?: string[];
};

export type TestPlan = {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  status: TestPlanStatus;
  selector: AutomatedTestSelector;
  launchNameTemplate?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type AutomationJobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type AutomationJobTrigger = "api" | "schedule" | "webhook" | "ci";

export type AutomationJobExternalReference = {
  provider: string;
  pipelineId?: string;
  pipelineUrl?: string;
};

export type AutomationJob = {
  id: string;
  projectId: string;
  name: string;
  status: AutomationJobStatus;
  trigger: AutomationJobTrigger;
  testPlanId?: string;
  launchId?: string;
  branch?: string;
  commitSha?: string;
  external?: AutomationJobExternalReference;
  requestedBy: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  version: number;
};

const automationJobTransitions: Record<AutomationJobStatus, readonly AutomationJobStatus[]> = {
  queued: ["running", "succeeded", "failed", "canceled"],
  running: ["succeeded", "failed", "canceled"],
  succeeded: [],
  failed: [],
  canceled: []
};

export function canTransitionAutomationJob(
  current: AutomationJobStatus,
  next: AutomationJobStatus
): boolean {
  return current === next || automationJobTransitions[current].includes(next);
}

export function normalizeAutomatedTestSelector(
  selector: AutomatedTestSelector
): AutomatedTestSelector {
  const normalized: AutomatedTestSelector = {};
  const thql = selector.thql?.trim();
  if (thql) normalized.thql = thql;
  const testCaseIds = uniqueNonEmpty(selector.testCaseIds);
  if (testCaseIds.length > 0) normalized.testCaseIds = testCaseIds;
  const tags = uniqueNonEmpty(selector.tags);
  if (tags.length > 0) normalized.tags = tags;
  if (Object.keys(normalized).length === 0) {
    throw new Error("Test plan selector must contain thql, testCaseIds, or tags");
  }
  return normalized;
}

function uniqueNonEmpty(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}
