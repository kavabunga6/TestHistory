// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { demoM1Workspace } from "./m1Workspace.js";
import { onlineApiState } from "./surfaceReadiness.fixtures.js";
import { WorkspaceSurface } from "./WorkspaceSurface.js";
import type { WorkspaceMode } from "./workspaceRouting.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("WorkspaceSurface navigation focus", () => {
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

  it("focuses the new heading when a project action removes the focused button", () => {
    act(() => root.render(<NavigationHarness />));

    const projectAction = container.querySelector<HTMLButtonElement>(".projects-reference__open");
    act(() => {
      projectAction?.focus();
      projectAction?.click();
    });

    expect(document.activeElement).toBe(container.querySelector("#dashboard-reference-title"));
    expect((document.activeElement as HTMLElement).tabIndex).toBe(-1);
  });

  it("keeps focus on the persistent sidebar when it changes sections", () => {
    act(() => root.render(<NavigationHarness />));

    const dashboardNav = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".nav-link")
    ).find((button) => button.textContent?.includes("Дашборды"));
    act(() => {
      dashboardNav?.focus();
      dashboardNav?.click();
    });

    expect(document.activeElement).toBe(dashboardNav);
    expect(container.querySelector("#dashboard-reference-title")).not.toBeNull();
  });

  it("waits for project loading before focusing the destination heading", () => {
    let finishLoading = () => {};
    act(() =>
      root.render(
        <NavigationHarness
          delaySelection
          onReady={(finish) => {
            finishLoading = finish;
          }}
        />
      )
    );

    act(() => container.querySelector<HTMLButtonElement>(".projects-reference__open")?.click());
    expect(container.querySelector("#dashboard-reference-title")).toBeNull();
    expect(container.querySelector(".projects-reference__empty")?.textContent).toContain(
      "Загружаем проекты"
    );

    act(() => finishLoading());
    expect(document.activeElement).toBe(container.querySelector("#dashboard-reference-title"));
  });
});

function NavigationHarness({
  delaySelection = false,
  onReady
}: {
  delaySelection?: boolean;
  onReady?: ((finish: () => void) => void) | undefined;
}) {
  const [mode, setMode] = React.useState<WorkspaceMode>("projects");
  const [status, setStatus] = React.useState<"ready" | "loading">("ready");
  const projectId = "project-focus-test";
  React.useEffect(() => {
    onReady?.(() => setStatus("ready"));
  }, [onReady]);
  return (
    <WorkspaceSurface
      apiState={onlineApiState}
      mode={mode}
      projectSelection={{
        projects: [{ id: projectId, key: "WEB", name: "Web QA" }],
        selectedProjectId: projectId,
        status
      }}
      selectedId=""
      workspace={{ ...demoM1Workspace, projectId }}
      onModeChange={setMode}
      onSelect={() => {}}
      onSelectProject={() => {
        setMode("dashboard");
        if (delaySelection) setStatus("loading");
      }}
    />
  );
}
