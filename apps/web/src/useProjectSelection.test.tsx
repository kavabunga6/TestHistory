// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readSelectedProjectId, saveSelectedProjectId } from "./projectSelection.js";
import { useProjectSelection } from "./useProjectSelection.js";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root !== undefined) {
    await act(async () => root?.unmount());
  }
  container?.remove();
  root = undefined;
  container = undefined;
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("useProjectSelection", () => {
  it("loads real projects, restores a valid choice and saves a new one", async () => {
    saveSelectedProjectId("admin", "project-mobile");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse([
        { id: "project-web", key: "WEB", name: "Web" },
        { id: "project-mobile", key: "MOBILE", name: "Mobile" }
      ])
    );
    mount();

    await act(async () => root?.render(<Harness userId="admin" />));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(container?.textContent).toContain("ready:project-mobile:2");

    await act(async () => {
      container?.querySelector<HTMLButtonElement>("button")?.click();
    });

    expect(container?.textContent).toContain("ready:project-web:2");
    expect(readSelectedProjectId("admin")).toBe("project-web");
  });

  it("falls back to an accessible project when the stored choice disappears", async () => {
    saveSelectedProjectId("admin", "deleted-project");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse([{ id: "project-live", key: "LIVE", name: "Live" }])
    );
    mount();

    await act(async () => root?.render(<Harness userId="admin" />));

    expect(container?.textContent).toContain("ready:project-live:1");
    expect(readSelectedProjectId("admin")).toBe("project-live");
  });

  it("ignores the previous user's response after the identity changes", async () => {
    const previousResponse = deferred<Response>();
    const nextResponse = deferred<Response>();
    vi.spyOn(globalThis, "fetch")
      .mockReturnValueOnce(previousResponse.promise)
      .mockReturnValueOnce(nextResponse.promise);
    mount();

    await act(async () => root?.render(<Harness userId="previous" />));
    await act(async () => root?.render(<Harness userId="next" />));
    await act(async () => {
      nextResponse.resolve(jsonResponse([{ id: "next-project" }]));
      await nextResponse.promise;
    });
    await act(async () => {
      previousResponse.resolve(jsonResponse([{ id: "previous-project" }]));
      await previousResponse.promise;
    });

    expect(container?.textContent).toContain("ready:next-project:1");
    expect(container?.textContent).not.toContain("previous-project");
  });

  it("clears the previous user's selected project before the next list resolves", async () => {
    const nextResponse = deferred<Response>();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse([{ id: "private-project" }]))
      .mockReturnValueOnce(nextResponse.promise);
    mount();

    await act(async () => root?.render(<Harness userId="previous" />));
    expect(container?.textContent).toContain("ready:private-project:1");

    await act(async () => root?.render(<Harness userId="next" />));
    expect(container?.textContent).toContain("loading:none:0");
    expect(container?.textContent).not.toContain("private-project");

    await act(async () => {
      nextResponse.resolve(jsonResponse([{ id: "next-project" }]));
      await nextResponse.promise;
    });
    expect(container?.textContent).toContain("ready:next-project:1");
  });
});

function Harness({ userId }: { userId: string }) {
  const selection = useProjectSelection(userId);
  return (
    <div>
      <span>
        {selection.status}:{selection.selectedProjectId ?? "none"}:{selection.projects.length}
      </span>
      <button type="button" onClick={() => selection.selectProject("project-web")}>
        Выбрать Web
      </button>
    </div>
  );
}

function mount() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status: 200
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
