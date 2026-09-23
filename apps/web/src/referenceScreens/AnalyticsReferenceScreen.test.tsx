// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AnalyticsResultListReadModel } from "@testhistory/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnalyticsReferenceScreen } from "./AnalyticsReferenceScreen.js";

const { getJsonMock } = vi.hoisted(() => ({ getJsonMock: vi.fn() }));
vi.mock("../apiHttp.js", () => ({ getJson: getJsonMock }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root !== undefined) await act(async () => root?.unmount());
  container?.remove();
  container = undefined;
  root = undefined;
  getJsonMock.mockReset();
  vi.useRealTimers();
});

describe("project analytics screen", () => {
  it("shows project wide totals, loads more results and opens the chosen launch result", async () => {
    vi.useFakeTimers();
    const first = read([summary("first", "launch-a")], "1");
    const second = read([summary("second", "launch-b")], null);
    getJsonMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/v1/analytics/results?")) {
        return Promise.resolve(url.includes("cursor=1") ? second : first);
      }
      return Promise.resolve({ result: { metrics: {}, series: [] } });
    });
    const onOpenResult = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AnalyticsReferenceScreen
          projectId="project-one"
          results={[]}
          onOpenResult={onOpenResult}
        />
      );
    });
    await act(async () => vi.runAllTimersAsync());

    expect(container.textContent).toContain("Найдено 120 из 120 результатов проекта");
    expect(container.querySelectorAll(".analytics-reference-signal-row")).toHaveLength(1);
    const loadMore = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Показать ещё")
    );
    expect(loadMore).toBeDefined();
    await act(async () => loadMore?.click());

    expect(container.querySelectorAll(".analytics-reference-signal-row")).toHaveLength(2);
    expect(container.textContent).toContain("Показано 2 из 120");
    const secondResult = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".analytics-reference-result-link")
    ).find((button) => button.textContent === "second");
    expect(secondResult).toBeDefined();
    act(() => secondResult?.click());
    expect(onOpenResult).toHaveBeenCalledWith("second", "launch-b");
  });
});

function read(
  items: AnalyticsResultListReadModel["items"],
  nextCursor: string | null
): AnalyticsResultListReadModel {
  return {
    kind: "analytics-result-list",
    projectId: "project-one",
    page: {
      limit: 1,
      cursor: nextCursor === "1" ? null : "1",
      offset: nextCursor === "1" ? 0 : 1,
      returned: 1,
      total: 120,
      nextCursor,
      hasMore: nextCursor !== null
    },
    metrics: {
      total: 120,
      matched: 120,
      statusCounters: { failed: 1, broken: 0, passed: 119, skipped: 0, unknown: 0, muted: 0 },
      averageDurationMs: 1200,
      flakyCount: 0,
      flakyDataComplete: true,
      slowCount: 0,
      openRisks: 1
    },
    prioritySignals: [],
    slowSignals: [],
    items
  };
}

function summary(uuid: string, launchId: string): AnalyticsResultListReadModel["items"][number] {
  return {
    uuid,
    launchId,
    projectId: "project-one",
    name: uuid,
    status: "passed",
    durationMs: 1200,
    tags: [],
    issues: [],
    testKeys: [],
    muted: false,
    flaky: false,
    flakyKnown: true,
    history: ["passed"]
  };
}
