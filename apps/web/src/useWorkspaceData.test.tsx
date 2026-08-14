// @vitest-environment jsdom

import { act, type Dispatch, type SetStateAction } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ApiState } from "./api.js";
import type { M1Workspace } from "./m1WorkspaceTypes.js";
import { useWorkspaceData } from "./useWorkspaceData.js";
import type { WorkspaceRoute } from "./workspaceRouting.js";

const { loadM1WorkspaceMock } = vi.hoisted(() => ({
  loadM1WorkspaceMock: vi.fn()
}));

vi.mock("./m1Workspace.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./m1Workspace.js")>()),
  loadM1Workspace: loadM1WorkspaceMock
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
});

function Harness({
  authenticationIdentity,
  route,
  setApiState = vi.fn<Dispatch<SetStateAction<ApiState>>>()
}: {
  authenticationIdentity?: string;
  route: WorkspaceRoute;
  setApiState?: Dispatch<SetStateAction<ApiState>>;
}) {
  const { workspace } = useWorkspaceData(route, setApiState, authenticationIdentity);
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
