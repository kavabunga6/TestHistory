// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { loadAutomationWorkspace, type AutomationWorkspaceData } from "../automationApi.js";
import { AutomationReferenceScreen } from "./AutomationReferenceScreen.js";

vi.mock("../automationApi.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../automationApi.js")>();
  return { ...actual, loadAutomationWorkspace: vi.fn() };
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
