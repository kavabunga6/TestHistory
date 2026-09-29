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
