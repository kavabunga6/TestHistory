// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  createNotificationIntegration,
  createTestPlan,
  loadAutomationWorkspace,
  updateTestPlan,
  type AutomationWorkspaceData
} from "../automationApi.js";
import { AutomationReferenceScreen } from "./AutomationReferenceScreen.js";

vi.mock("../automationApi.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../automationApi.js")>();
  return {
    ...actual,
    createNotificationIntegration: vi.fn(),
    createTestPlan: vi.fn(),
    loadAutomationWorkspace: vi.fn(),
    updateTestPlan: vi.fn()
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.mocked(loadAutomationWorkspace).mockReset();
  vi.mocked(createNotificationIntegration).mockReset();
  vi.mocked(createTestPlan).mockReset();
  vi.mocked(updateTestPlan).mockReset();
});

it("subscribes a new notification only to selected events", async () => {
  const workspace: AutomationWorkspaceData = {
    projectId: "project-1",
    plans: [],
    jobs: [],
    notifications: [],
    issueTrackers: [],
    deliveries: []
  };
  vi.mocked(loadAutomationWorkspace).mockResolvedValue(workspace);
  vi.mocked(createNotificationIntegration).mockResolvedValue(undefined);

  await act(async () => root.render(<AutomationReferenceScreen projectId="project-1" />));
  await act(async () => {
    container.querySelector<HTMLButtonElement>('[data-tab="integrations"]')?.click();
  });
  await act(async () => {
    Array.from(container.querySelectorAll<HTMLButtonElement>(".automation-toolbar-actions button"))
      .find((button) => button.textContent?.includes("Уведомление"))
      ?.click();
  });

  const form = container.querySelector<HTMLFormElement>(".automation-form");
  const checkboxes = Array.from(
    form?.querySelectorAll<HTMLInputElement>('.automation-events input[type="checkbox"]') ?? []
  );
  expect(
    checkboxes.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value)
  ).toEqual(["automation-job.failed", "automation-job.succeeded"]);
  await act(async () => {
    checkboxes.find((checkbox) => checkbox.value === "automation-job.succeeded")?.click();
    checkboxes.find((checkbox) => checkbox.value === "launch.failed")?.click();
  });
  const name = form?.querySelector<HTMLInputElement>('input[name="name"]');
  const endpointUrl = form?.querySelector<HTMLInputElement>('input[name="endpointUrl"]');
  if (name) name.value = "QA alerts";
  if (endpointUrl) endpointUrl.value = "https://hooks.example.test/qa";
  await act(async () =>
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  );

  expect(createNotificationIntegration).toHaveBeenCalledWith("project-1", {
    name: "QA alerts",
    provider: "generic",
    endpointUrl: "https://hooks.example.test/qa",
    events: ["automation-job.failed", "launch.failed"]
  });
});

it("explains why a notification cannot be saved without events", async () => {
  vi.mocked(loadAutomationWorkspace).mockResolvedValue({
    projectId: "project-1",
    plans: [],
    jobs: [],
    notifications: [],
    issueTrackers: [],
    deliveries: []
  });

  await act(async () => root.render(<AutomationReferenceScreen projectId="project-1" />));
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[data-tab="integrations"]')?.click()
  );
  await act(async () => {
    Array.from(container.querySelectorAll<HTMLButtonElement>(".automation-toolbar-actions button"))
      .find((button) => button.textContent?.includes("Уведомление"))
      ?.click();
  });

  const form = container.querySelector<HTMLFormElement>(".automation-form");
  const fieldset = form?.querySelector<HTMLFieldSetElement>(".automation-events");
  const checkboxes = Array.from(
    fieldset?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? []
  );
  await act(async () => {
    checkboxes.filter((checkbox) => checkbox.checked).forEach((checkbox) => checkbox.click());
  });

  const save = Array.from(form?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
    (button) => button.textContent?.trim() === "Сохранить"
  );
  expect(save?.disabled).toBe(true);
  expect(fieldset?.getAttribute("aria-describedby")).toBe("automation-events-hint");
  expect(fieldset?.querySelector('[role="status"]')?.textContent).toContain(
    "Выберите хотя бы одно событие"
  );
  await act(async () =>
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  );
  expect(createNotificationIntegration).not.toHaveBeenCalled();

  await act(async () => checkboxes[0]?.click());
  expect(save?.disabled).toBe(false);
  expect(fieldset?.querySelector('[role="status"]')).toBeNull();
});

it("keeps tab counts and content visible during a refresh", async () => {
  const workspace: AutomationWorkspaceData = {
    projectId: "project-1",
    plans: [
      {
        id: "plan-1",
        projectId: "project-1",
        name: "Smoke plan",
        status: "active",
        selector: { thql: 'tag = "smoke"' },
        updatedAt: "2026-09-29T00:00:00Z"
      }
    ],
    jobs: [],
    notifications: [],
    issueTrackers: [],
    deliveries: []
  };
  vi.mocked(loadAutomationWorkspace).mockResolvedValueOnce(workspace);
  await act(async () => root.render(<AutomationReferenceScreen projectId="project-1" />));
  expect(container.textContent).toContain("Smoke plan");
  expect(container.querySelector(".automation-tabs button")?.textContent).toContain("1");

  let finishRefresh: (data: AutomationWorkspaceData) => void = () => undefined;
  vi.mocked(loadAutomationWorkspace).mockImplementationOnce(
    () =>
      new Promise<AutomationWorkspaceData>((resolve) => {
        finishRefresh = resolve;
      })
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".automation-header .reference-action")?.click()
  );

  expect(container.textContent).toContain("Smoke plan");
  expect(container.querySelector(".automation-tabs button")?.textContent).toContain("1");
  expect(container.textContent).toContain("Обновляем…");

  await act(async () => finishRefresh(workspace));
  expect(container.textContent).toContain("Обновить");
});

it("moves between automation tabs with keyboard arrows and announces the selected panel", async () => {
  vi.mocked(loadAutomationWorkspace).mockResolvedValueOnce({
    projectId: "project-1",
    plans: [],
    jobs: [],
    notifications: [],
    issueTrackers: [],
    deliveries: []
  });
  await act(async () => root.render(<AutomationReferenceScreen projectId="project-1" />));

  const plansTab = container.querySelector<HTMLButtonElement>("#automation-tab-plans");
  expect(plansTab?.getAttribute("aria-selected")).toBe("true");
  plansTab?.focus();
  await act(async () => {
    plansTab?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
  });
  expect(container.querySelector("#automation-tab-jobs")?.getAttribute("aria-selected")).toBe(
    "true"
  );
  expect(document.activeElement?.id).toBe("automation-tab-jobs");
  expect(container.querySelector("#automation-panel-jobs")?.getAttribute("aria-labelledby")).toBe(
    "automation-tab-jobs"
  );
});

it("shows a save error in the plan form and enables retry", async () => {
  vi.mocked(loadAutomationWorkspace).mockResolvedValueOnce({
    projectId: "project-1",
    plans: [
      {
        id: "plan-1",
        projectId: "project-1",
        name: "Smoke plan",
        status: "active",
        selector: { thql: 'tag = "smoke"' },
        updatedAt: "2026-09-29T00:00:00Z"
      }
    ],
    jobs: [],
    notifications: [],
    issueTrackers: [],
    deliveries: []
  });
  vi.mocked(createTestPlan).mockRejectedValueOnce(new Error("Некорректный THQL"));
  await act(async () => root.render(<AutomationReferenceScreen projectId="project-1" />));
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>(".automation-toolbar .reference-primary-action")
      ?.click();
  });
  const form = container.querySelector<HTMLFormElement>(".automation-form");
  expect(form).not.toBeNull();
  const name = form?.querySelector<HTMLInputElement>('input[name="name"]');
  const thql = form?.querySelector<HTMLInputElement>('input[name="thql"]');
  if (name) name.value = "Broken plan";
  if (thql) thql.value = "bad syntax";
  await act(async () => {
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Некорректный THQL");
  expect(form?.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
});

it("edits an existing plan selector and status through PATCH, then refreshes its card", async () => {
  const plan: AutomationWorkspaceData["plans"][number] = {
    id: "plan-1",
    projectId: "project-1",
    name: "Smoke plan",
    description: "Old description",
    status: "active",
    selector: { thql: 'tag = "smoke"', tags: ["smoke"], testCaseIds: ["case-1"] },
    launchNameTemplate: "Smoke {branch}",
    updatedAt: "2026-09-29T00:00:00Z"
  };
  const workspace: AutomationWorkspaceData = {
    projectId: "project-1",
    plans: [plan],
    jobs: [],
    notifications: [],
    issueTrackers: [],
    deliveries: []
  };
  const updatedPlan = {
    ...plan,
    name: "Release smoke",
    status: "disabled" as const,
    selector: { thql: 'branch = "release"', tags: ["release"], testCaseIds: ["case-2"] }
  };
  vi.mocked(loadAutomationWorkspace)
    .mockResolvedValueOnce(workspace)
    .mockResolvedValueOnce({ ...workspace, plans: [updatedPlan] });
  vi.mocked(updateTestPlan).mockResolvedValueOnce(updatedPlan);

  await act(async () => root.render(<AutomationReferenceScreen projectId="project-1" />));
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('[aria-label="Редактировать план «Smoke plan»"]')
      ?.click();
  });
  const form = container.querySelector<HTMLFormElement>(".automation-plan-form");
  expect(form?.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe("Smoke plan");
  expect(form?.querySelector<HTMLInputElement>('input[name="tags"]')?.value).toBe("smoke");
  expect(form?.querySelector<HTMLInputElement>('input[name="testCaseIds"]')?.value).toBe("case-1");
  expect(form?.querySelector<HTMLSelectElement>('select[name="status"]')?.value).toBe("active");

  const setValue = (selector: string, value: string) => {
    const input = form?.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
    if (input) input.value = value;
  };
  setValue('input[name="name"]', "Release smoke");
  setValue('input[name="thql"]', 'branch = "release"');
  setValue('input[name="tags"]', "release, release");
  setValue('input[name="testCaseIds"]', "case-2");
  setValue('textarea[name="description"]', "New description");
  setValue('input[name="launchNameTemplate"]', "Release {branch}");
  const status = form?.querySelector<HTMLSelectElement>('select[name="status"]');
  if (status) status.value = "disabled";

  await act(async () => {
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(updateTestPlan).toHaveBeenCalledWith("project-1", "plan-1", {
    name: "Release smoke",
    description: "New description",
    launchNameTemplate: "Release {branch}",
    selector: { thql: 'branch = "release"', tags: ["release"], testCaseIds: ["case-2"] },
    status: "disabled"
  });
  expect(container.textContent).toContain("Release smoke");
  expect(container.querySelector(".automation-plan-form")).toBeNull();
});
