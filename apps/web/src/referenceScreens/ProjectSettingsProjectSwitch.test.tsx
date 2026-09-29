// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { loadPersonalTokens } from "../auth.js";
import {
  demoProjectSettings,
  loadProjectSettingsFromApi,
  type ProjectSettings
} from "../projectSettings.js";
import { ProjectSettingsReferenceScreen } from "./ProjectSettingsReferenceScreen.js";

vi.mock("../auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth.js")>();
  return { ...actual, loadPersonalTokens: vi.fn() };
});
vi.mock("../projectSettings.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../projectSettings.js")>();
  return { ...actual, loadProjectSettingsFromApi: vi.fn() };
});
vi.mock("./ProjectSettingsEnterpriseAccess.js", () => ({
  EnterpriseAccessPanel: ({ projectId }: { projectId: string }) => (
    <div data-testid="enterprise-project">{projectId}</div>
  )
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  window.localStorage.setItem("testhistory.userRole", "admin");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(loadPersonalTokens).mockResolvedValue([]);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.mocked(loadProjectSettingsFromApi).mockReset();
  vi.mocked(loadPersonalTokens).mockReset();
  window.localStorage.removeItem("testhistory.userRole");
});

it("hides the previous project's settings and access panel until the new project loads", async () => {
  const projectB = deferred<ProjectSettings>();
  vi.mocked(loadProjectSettingsFromApi).mockImplementation((projectId) =>
    projectId === "project-b"
      ? projectB.promise
      : Promise.resolve(settingsFor("project-a", "Project Alpha"))
  );

  await act(async () =>
    root.render(<ProjectSettingsReferenceScreen projectId="project-a" routeTab="access" />)
  );
  expect(container.textContent).toContain("Project Alpha");
  expect(container.querySelector("[data-testid='enterprise-project']")?.textContent).toBe(
    "project-a"
  );

  await act(async () =>
    root.render(<ProjectSettingsReferenceScreen projectId="project-b" routeTab="access" />)
  );
  expect(container.textContent).toContain("Загружаем настройки выбранного проекта");
  expect(container.textContent).not.toContain("Project Alpha");
  expect(container.querySelector(".project-settings__tabs")).toBeNull();
  expect(container.querySelector("[data-testid='enterprise-project']")).toBeNull();

  await act(async () => projectB.resolve(settingsFor("project-b", "Project Beta")));
  expect(container.textContent).toContain("Project Beta");
  expect(container.textContent).not.toContain("Project Alpha");
  expect(container.querySelector("[data-testid='enterprise-project']")?.textContent).toBe(
    "project-b"
  );
});

it("lets the user retry a failed settings load for the selected project", async () => {
  vi.mocked(loadProjectSettingsFromApi)
    .mockRejectedValueOnce(new Error("Connection unavailable"))
    .mockResolvedValue(settingsFor("project-b", "Project Beta"));

  await act(async () =>
    root.render(<ProjectSettingsReferenceScreen projectId="project-b" routeTab="access" />)
  );
  expect(container.textContent).toContain("Настройки недоступны");
  expect(container.textContent).not.toContain("Web Sandbox");

  const retry = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    button.textContent?.includes("Повторить загрузку")
  );
  expect(retry).toBeDefined();
  await act(async () => retry?.click());

  expect(loadProjectSettingsFromApi).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain("Project Beta");
  expect(container.textContent).not.toContain("Не удалось выполнить запрос");
});

it("enables saving visibility only after the user changes a policy", async () => {
  vi.mocked(loadProjectSettingsFromApi).mockResolvedValue(settingsFor("project-b", "Project Beta"));
  await act(async () =>
    root.render(<ProjectSettingsReferenceScreen projectId="project-b" routeTab="visibility" />)
  );

  const save = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === "Сохранить"
  );
  const visibility = container.querySelector<HTMLSelectElement>(
    ".project-settings__form-row select"
  );
  expect(save?.disabled).toBe(true);
  expect(visibility).not.toBeNull();

  await act(async () => {
    if (visibility !== null) {
      visibility.value = visibility.value === "internal" ? "private" : "internal";
      visibility.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  expect(save?.disabled).toBe(false);
});

function settingsFor(id: string, name: string): ProjectSettings {
  return { ...demoProjectSettings, project: { ...demoProjectSettings.project, id, name } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
