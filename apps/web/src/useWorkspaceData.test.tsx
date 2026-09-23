// @vitest-environment jsdom

import { act, type Dispatch, type SetStateAction } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ApiState } from "./api.js";
import type { M1Workspace } from "./m1WorkspaceTypes.js";
import { useWorkspaceData } from "./useWorkspaceData.js";
import type { WorkspaceRoute } from "./workspaceRouting.js";

const { loadM1WorkspaceMock, loadLaunchResultDetailMock } = vi.hoisted(() => ({
  loadM1WorkspaceMock: vi.fn(),
  loadLaunchResultDetailMock: vi.fn()
}));

vi.mock("./m1Workspace.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./m1Workspace.js")>()),
  loadM1Workspace: loadM1WorkspaceMock,
  loadLaunchResultDetail: loadLaunchResultDetailMock
}));

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root !== undefined) {
    await act(async () => root?.unmount());
  }
  container?.remove();
  container = undefined;
  root = undefined;
  loadM1WorkspaceMock.mockReset();
  loadLaunchResultDetailMock.mockReset();
});

describe("useWorkspaceData", () => {
  it("refreshes the workspace when authentication is restored", async () => {
    loadM1WorkspaceMock
      .mockResolvedValueOnce(workspaceWithResult("anonymous-result"))
      .mockResolvedValueOnce(workspaceWithResult("authenticated-result"));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Harness route={{ mode: "launch" }} />);
    });
    await act(async () => {
      root?.render(<Harness authenticationIdentity="admin" route={{ mode: "launch" }} />);
    });

    expect(loadM1WorkspaceMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("authenticated-result");
  });

  it("clears a stale workspace error after a successful refresh", async () => {
    const setApiState = vi.fn<Dispatch<SetStateAction<ApiState>>>();
    loadM1WorkspaceMock.mockResolvedValue(workspaceWithResult("restored-result"));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Harness route={{ mode: "launch" }} setApiState={setApiState} />);
    });

    const update = setApiState.mock.calls.at(-1)?.[0];
    expect(typeof update).toBe("function");
    expect((update as (state: ApiState) => ApiState)({ loading: false, error: "offline" })).toEqual(
      {
        loading: false
      }
    );
    expect(container.textContent).toContain("restored-result");
  });

  it("does not let a slow launches request erase test cases after navigation", async () => {
    const launchRequest = deferred<M1Workspace>();
    const testCaseRequest = deferred<M1Workspace>();
    loadM1WorkspaceMock
      .mockReturnValueOnce(launchRequest.promise)
      .mockReturnValueOnce(testCaseRequest.promise);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Harness route={{ mode: "launch" }} />);
    });
    await act(async () => {
      root?.render(<Harness route={{ mode: "case" }} />);
    });
    expect(loadM1WorkspaceMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ routeScope: "test-case-list" })
    );
    await act(async () => {
      testCaseRequest.resolve(workspaceWithResult("case-1"));
      await testCaseRequest.promise;
    });
    expect(container.textContent).toContain("case-1");

    await act(async () => {
      launchRequest.resolve(workspaceWithResult("launch-result"));
      await launchRequest.promise;
    });

    expect(container.textContent).toContain("case-1");
    expect(container.textContent).not.toContain("launch-result");
  });

  it("loads the selected project and ignores a slower response for the old project", async () => {
    const oldProjectRequest = deferred<M1Workspace>();
    const newProjectRequest = deferred<M1Workspace>();
    loadM1WorkspaceMock
      .mockReturnValueOnce(oldProjectRequest.promise)
      .mockReturnValueOnce(newProjectRequest.promise);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Harness projectId="project-old" route={{ mode: "launch" }} />);
    });
    await act(async () => {
      root?.render(<Harness projectId="project-new" route={{ mode: "launch" }} />);
    });

    expect(loadM1WorkspaceMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ projectId: "project-new" })
    );
    await act(async () => {
      newProjectRequest.resolve(workspaceWithResult("new-result"));
      await newProjectRequest.promise;
    });
    await act(async () => {
      oldProjectRequest.resolve(workspaceWithResult("old-result"));
      await oldProjectRequest.promise;
    });

    expect(container.textContent).toContain("new-result");
    expect(container.textContent).not.toContain("old-result");
  });

  it("keeps the current result page while hydrating a selected result on demand", async () => {
    const pageWorkspace = workspaceWithLaunchResult("result-26");
    loadM1WorkspaceMock.mockResolvedValue(pageWorkspace);
    loadLaunchResultDetailMock
      .mockResolvedValueOnce({
        ...pageWorkspace.results[0],
        steps: [{ name: "Deep selected step", status: "passed", duration: "12ms" }]
      })
      .mockResolvedValueOnce({
        ...pageWorkspace.results[0],
        id: "result-99",
        steps: [{ name: "Outside page step", status: "passed", duration: "8ms" }]
      });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<PaginationHarness route={{ mode: "launch", launchId: "launch-1" }} />);
    });
    expect(loadM1WorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({ resultPageSize: 25, routeScope: "launch-detail" })
    );

    await act(async () => {
      container?.querySelector<HTMLButtonElement>("[data-action='next-page']")?.click();
    });
    expect(loadM1WorkspaceMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ resultPageSize: 25, resultPageCursor: "25" })
    );
    expect(container.querySelector("[data-field='page-index']")?.textContent).toBe("1");

    await act(async () => {
      root?.render(
        <PaginationHarness
          route={{ mode: "launch", launchId: "launch-1", resultId: "result-26" }}
        />
      );
    });
    expect(loadLaunchResultDetailMock).toHaveBeenCalledWith("launch-1", "result-26");
    expect(loadM1WorkspaceMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector("[data-field='page-index']")?.textContent).toBe("1");
    expect(container.querySelector("[data-field='step']")?.textContent).toBe("Deep selected step");

    await act(async () => {
      root?.render(
        <PaginationHarness
          route={{ mode: "launch", launchId: "launch-1", resultId: "result-99" }}
        />
      );
    });
    expect(loadM1WorkspaceMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector("[data-field='row-count']")?.textContent).toBe("1");
    expect(container.querySelector("[data-field='selected-detail']")?.textContent).toBe(
      "result-99"
    );
    expect(container.querySelector("[data-field='page-index']")?.textContent).toBe("1");
  });

  it("keeps the page on repeated empty filters and resets it for a new status", async () => {
    loadM1WorkspaceMock.mockResolvedValue(workspaceWithLaunchResult("result-26"));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<PaginationHarness route={{ mode: "launch", launchId: "launch-1" }} />);
    });
    await act(async () => {
      container?.querySelector<HTMLButtonElement>("[data-action='next-page']")?.click();
    });
    expect(loadM1WorkspaceMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      container?.querySelector<HTMLButtonElement>("[data-action='clear-filters']")?.click();
    });
    expect(container.querySelector("[data-field='page-index']")?.textContent).toBe("1");
    expect(loadM1WorkspaceMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      container?.querySelector<HTMLButtonElement>("[data-action='filter-failed']")?.click();
    });
    expect(container.querySelector("[data-field='page-index']")?.textContent).toBe("0");
    expect(loadM1WorkspaceMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ resultPageSize: 25, resultStatusFilter: "failed" })
    );
  });
});

const stableApiStateSetter = vi.fn<Dispatch<SetStateAction<ApiState>>>();

function PaginationHarness({ route }: { route: WorkspaceRoute }) {
  const { workspace, resultPageIndex, setResultPageIndex, setResultQuery, setResultStatusFilter } =
    useWorkspaceData(route, stableApiStateSetter, undefined, "project-1");
  return (
    <div>
      <button data-action="next-page" type="button" onClick={() => setResultPageIndex(1)}>
        Next page
      </button>
      <button
        data-action="clear-filters"
        type="button"
        onClick={() => {
          setResultQuery("");
          setResultStatusFilter(undefined);
        }}
      >
        Clear filters
      </button>
      <button
        data-action="filter-failed"
        type="button"
        onClick={() => setResultStatusFilter("failed")}
      >
        Failed
      </button>
      <output data-field="page-index">{resultPageIndex}</output>
      <output data-field="row-count">{workspace.results.length}</output>
      <output data-field="selected-detail">{workspace.selectedResultDetail?.id}</output>
      <output data-field="step">{workspace.results[0]?.steps[0]?.name}</output>
    </div>
  );
}

function Harness({
  authenticationIdentity,
  projectId,
  route,
  setApiState = vi.fn<Dispatch<SetStateAction<ApiState>>>()
}: {
  authenticationIdentity?: string;
  projectId?: string;
  route: WorkspaceRoute;
  setApiState?: Dispatch<SetStateAction<ApiState>>;
}) {
  const { workspace } = useWorkspaceData(route, setApiState, authenticationIdentity, projectId);
  return <div>{workspace.results.map((result) => result.id).join(",")}</div>;
}

function workspaceWithResult(id: string): M1Workspace {
  return {
    launch: {
      branch: "develop",
      build: "1",
      environment: "test",
      name: "Launch",
      owner: "QA",
      started: "now"
    },
    launchItems: [],
    results: [
      {
        allureId: id,
        caseType: "automated",
        customFields: [],
        duration: "1s",
        history: ["passed"],
        id,
        issues: [],
        layer: "E2E",
        links: [],
        members: [],
        muted: false,
        name: id,
        owner: "QA",
        severity: "normal",
        status: "passed",
        steps: [],
        suite: "Suite",
        tags: [],
        testKeys: [],
        workflow: "Ready"
      }
    ]
  };
}

function workspaceWithLaunchResult(id: string): M1Workspace {
  return {
    ...workspaceWithResult(id),
    projectId: "project-1",
    launchItems: [
      {
        id: "launch-1",
        name: "Launch",
        state: "closed",
        metadata: [],
        defects: 0,
        members: 0,
        counters: { passed: 1, failed: 0, broken: 0, skipped: 0, muted: 0 }
      }
    ]
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
