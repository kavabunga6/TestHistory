const projectId = "project-1";

const plans = [
  {
    id: "plan-checkout-regression",
    projectId,
    name: "Регрессия оформления заказа",
    description: "Критический путь от корзины до подтверждения платежа.",
    status: "active",
    selector: {
      thql: 'layer = "E2E" and tag = "checkout"',
      tags: ["checkout", "regression"],
      testCaseIds: ["PAY-1042", "PAY-1043", "PAY-1044"]
    },
    launchNameTemplate: "Checkout · {branch}",
    updatedAt: "2026-06-03T09:20:00.000Z"
  },
  {
    id: "plan-api-smoke",
    projectId,
    name: "API smoke",
    description: "Проверка контрактов перед развёртыванием.",
    status: "active",
    selector: { thql: 'layer = "API" and tag = "smoke"', tags: ["api", "smoke"] },
    updatedAt: "2026-06-02T15:30:00.000Z"
  },
  {
    id: "plan-flaky-triage",
    projectId,
    name: "Разбор нестабильных тестов",
    description: "Временно выключен до пересмотра набора.",
    status: "disabled",
    selector: { thql: "flaky = true", tags: ["triage"] },
    updatedAt: "2026-06-01T11:45:00.000Z"
  }
];

const jobs = [
  {
    id: "job-7842",
    projectId,
    name: "Checkout regression #7842",
    status: "succeeded",
    trigger: "ci",
    testPlanId: "plan-checkout-regression",
    launchId: "L-1289",
    branch: "main",
    external: {
      provider: "GitLab CI",
      pipelineId: "7842",
      pipelineUrl: "https://gitlab.example.test/qa/pipelines/7842"
    },
    updatedAt: "2026-06-03T09:41:00.000Z"
  },
  {
    id: "job-7843",
    projectId,
    name: "API smoke #7843",
    status: "running",
    trigger: "ci",
    testPlanId: "plan-api-smoke",
    branch: "release/2.7",
    external: {
      provider: "GitLab CI",
      pipelineId: "7843",
      pipelineUrl: "https://gitlab.example.test/qa/pipelines/7843"
    },
    updatedAt: "2026-06-03T10:15:00.000Z"
  },
  {
    id: "job-7844",
    projectId,
    name: "Checkout regression #7844",
    status: "failed",
    trigger: "webhook",
    testPlanId: "plan-checkout-regression",
    branch: "feature/card-retry",
    external: { provider: "GitLab CI", pipelineId: "7844" },
    error: "18 тестов завершились с ошибкой",
    updatedAt: "2026-06-03T10:30:00.000Z"
  },
  {
    id: "job-7845",
    projectId,
    name: "Ночной E2E прогон",
    status: "queued",
    trigger: "schedule",
    testPlanId: "plan-checkout-regression",
    branch: "main",
    updatedAt: "2026-06-03T11:00:00.000Z"
  }
];

const notifications = [
  {
    id: "notification-qa",
    name: "QA: результаты прогонов",
    provider: "slack",
    enabled: true,
    endpointUrl: "https://hooks.example.test/qa-automation",
    events: ["automation-job.succeeded", "automation-job.failed"],
    signingSecretConfigured: true
  },
  {
    id: "notification-release",
    name: "Релизные оповещения",
    provider: "generic",
    enabled: false,
    endpointUrl: "https://hooks.example.test/release",
    events: ["automation-job.failed"],
    signingSecretConfigured: false
  }
];

const issueTrackers = [
  {
    id: "tracker-jira",
    name: "Баги платежей",
    provider: "jira",
    enabled: true,
    baseUrl: "https://jira.example.test/browse/",
    projectKey: "PAY",
    credentialConfigured: true
  },
  {
    id: "tracker-github",
    name: "Внутренние задачи",
    provider: "github",
    enabled: false,
    baseUrl: "https://github.example.test/qa/issues/",
    projectKey: "QA",
    credentialConfigured: false
  }
];

const deliveries = [
  {
    id: "delivery-1",
    integrationId: "notification-qa",
    kind: "notification",
    event: "automation-job.succeeded",
    status: "delivered",
    attempts: 1,
    updatedAt: "2026-06-03T09:42:00.000Z"
  },
  {
    id: "delivery-2",
    integrationId: "tracker-jira",
    kind: "issue",
    event: "automation-job.failed",
    status: "delivered",
    attempts: 2,
    updatedAt: "2026-06-03T10:31:00.000Z",
    externalReference: "https://jira.example.test/browse/PAY-337"
  },
  {
    id: "delivery-3",
    integrationId: "notification-qa",
    kind: "notification",
    event: "automation-job.failed",
    status: "retrying",
    attempts: 2,
    updatedAt: "2026-06-03T10:32:00.000Z",
    lastError: "Сервер временно недоступен"
  }
];

const lists = {
  "test-plans": { kind: "test-plan-list", items: plans },
  "automation-jobs": { kind: "automation-job-list", items: jobs },
  "integrations/notifications": { kind: "notification-integration-list", items: notifications },
  "integrations/issue-trackers": { kind: "issue-tracker-integration-list", items: issueTrackers },
  "integration-deliveries": { kind: "integration-delivery-list", items: deliveries }
};

export function createAutomationFixtureResponse(pathname, screenName = "") {
  const prefix = `/api/v1/projects/${projectId}/`;
  if (!pathname.startsWith(prefix)) return undefined;
  const list = lists[pathname.slice(prefix.length)];
  if (list === undefined) return undefined;

  const items = screenName.startsWith("automation-") ? list.items : [];
  const page = {
    cursor: null,
    hasMore: false,
    limit: 200,
    nextCursor: null,
    offset: 0,
    returned: items.length,
    total: items.length
  };
  return list.kind === "test-plan-list" || list.kind === "automation-job-list"
    ? { kind: list.kind, items, page }
    : { kind: list.kind, items };
}
