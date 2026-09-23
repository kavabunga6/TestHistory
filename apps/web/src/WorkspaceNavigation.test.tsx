// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WorkspaceNavigation } from "./WorkspaceNavigation.js";
import type { WorkspaceMode } from "./workspaceRouting.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("WorkspaceNavigation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
  });

  it("opens the mobile drawer, changes the active section and closes with Escape", () => {
    act(() => root.render(<NavigationHarness />));

    const menuButton = container.querySelector<HTMLButtonElement>(".mobile-shell-menu-button");
    expect(menuButton).not.toBeNull();
    expect(menuButton?.getAttribute("aria-expanded")).toBe("false");

    act(() => menuButton?.click());
    expect(menuButton?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();
    expect(document.activeElement?.getAttribute("aria-current")).toBe("page");

    const launchButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".nav-link")
    ).find((button) => button.textContent?.includes("Запуски"));
    expect(launchButton).not.toBeUndefined();
    act(() => launchButton?.click());
    expect(launchButton?.getAttribute("aria-current")).toBe("page");
    expect(container.querySelector(".mobile-shell-current strong")?.textContent).toBe("Запуски");
    expect(menuButton?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(menuButton);

    act(() => menuButton?.click());
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(menuButton?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(menuButton);
  });

  it("opens the project list from the current project without leaving focus in the closed drawer", () => {
    act(() => root.render(<NavigationHarness initialMode="launch" />));

    const menuButton = container.querySelector<HTMLButtonElement>(".mobile-shell-menu-button");
    act(() => menuButton?.click());

    const projectButton = container.querySelector<HTMLButtonElement>(".sidebar-current-project");
    expect(projectButton?.getAttribute("title")).toContain("Открыть проекты");
    act(() => projectButton?.click());

    expect(container.querySelector('.nav-link[aria-current="page"]')?.textContent).toBe("Проекты");
    expect(menuButton?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(menuButton);

    const homeButton = container.querySelector<HTMLButtonElement>(".mobile-shell-brand");
    act(() => homeButton?.click());
    expect(container.querySelector('.nav-link[aria-current="page"]')?.textContent).toBe("Дашборды");
  });
});

function NavigationHarness({ initialMode = "dashboard" }: { initialMode?: WorkspaceMode }) {
  const [mode, setMode] = React.useState<WorkspaceMode>(initialMode);
  return (
    <WorkspaceNavigation
      activeMode={mode}
      onModeChange={setMode}
      selectedProjectName="Web Sandbox"
    />
  );
}
