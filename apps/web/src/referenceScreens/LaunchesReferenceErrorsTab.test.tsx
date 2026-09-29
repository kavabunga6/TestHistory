// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { demoM1Workspace } from "../m1Workspace.js";
import { formatLaunchErrorGroupHeading, loadLaunchErrorSummary } from "./LaunchErrorSummaryData.js";
import { ErrorsTab } from "./LaunchesReferenceTabs.js";

vi.mock("./LaunchErrorSummaryData.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./LaunchErrorSummaryData.js")>()),
  loadLaunchErrorSummary: vi.fn()
}));

it("localizes generated error group headings without changing real diagnostics", () => {
  expect(formatLaunchErrorGroupHeading("Проверка API-0002 завершилась со статусом failed")).toBe(
    "Проверка API-0002 завершилась со статусом «Провален»"
  );
  expect(formatLaunchErrorGroupHeading("Проверка PERF-0005 завершилась со статусом broken")).toBe(
    "Проверка PERF-0005 завершилась со статусом «Сломан»"
  );
  expect(formatLaunchErrorGroupHeading("AssertionError: expected true")).toBe(
    "AssertionError: expected true"
  );
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
});

it("opens the first failed result and keeps its report visible while detail loads", async () => {
  const detailedResult = demoM1Workspace.results.find((result) => result.status === "failed");
  expect(detailedResult).toBeDefined();
  const { trace: _trace, ...summaryResult } = detailedResult!;
  const onSelectResult = vi.fn();
  vi.mocked(loadLaunchErrorSummary).mockResolvedValue({
    kind: "launch-error-summary",
    launchId: "launch-1",
    projectId: "project-1",
    totalResults: 100,
    failedResults: 20,
    brokenResults: 6,
    totalGroups: 1,
    groupsTruncated: false,
    groups: [
      {
        name: "Fixture failure",
        failed: 20,
        broken: 6,
        resultsTruncated: true,
        examples: [
          {
            resultUuid: summaryResult.id,
            name: summaryResult.name,
            status: "failed",
            durationMs: 537
          }
        ]
      }
    ]
  });

  await act(async () => {
    root.render(
      <ErrorsTab
        launchId="launch-1"
        loading={false}
        onSelectResult={onSelectResult}
        results={[summaryResult]}
        selectedResult={undefined}
      />
    );
  });

  expect(onSelectResult).toHaveBeenCalledExactlyOnceWith(summaryResult.id);
  expect(container.querySelector(".launches-reference-result-report")).not.toBeNull();
  expect(container.textContent).toContain(summaryResult.name);
  expect(container.textContent).toContain("Весь запуск · 26 результатов с ошибкой");

  await act(async () => {
    root.render(
      <ErrorsTab
        launchId="launch-1"
        loading={false}
        onSelectResult={onSelectResult}
        results={[summaryResult]}
        selectedResult={detailedResult}
      />
    );
  });
  expect(onSelectResult).toHaveBeenCalledTimes(1);
});

it("starts at the first error and expands an explicitly linked result", async () => {
  const selectedResult = demoM1Workspace.results.find((result) => result.status === "failed");
  expect(selectedResult).toBeDefined();
  vi.mocked(loadLaunchErrorSummary).mockResolvedValue({
    kind: "launch-error-summary",
    launchId: "launch-1",
    projectId: "project-1",
    totalResults: 27,
    failedResults: 21,
    brokenResults: 6,
    totalGroups: 2,
    groupsTruncated: false,
    groups: [
      {
        name: "API error",
        failed: 1,
        broken: 0,
        resultsTruncated: false,
        examples: [{ resultUuid: "other-error", name: "Another test", status: "failed" }]
      },
      {
        name: "Fixture failure",
        failed: 20,
        broken: 6,
        resultsTruncated: true,
        examples: [{ resultUuid: selectedResult!.id, name: selectedResult!.name, status: "failed" }]
      }
    ]
  });

  const onSelectResult = vi.fn();
  await act(async () => {
    root.render(
      <ErrorsTab
        launchId="launch-1"
        loading={false}
        onSelectResult={onSelectResult}
        results={[selectedResult!]}
        selectedResult={selectedResult}
      />
    );
  });

  let groups = Array.from(
    container.querySelectorAll<HTMLDetailsElement>(".launches-reference-error-group")
  );
  expect(groups).toHaveLength(2);
  expect(groups[0]?.open).toBe(true);
  expect(groups[1]?.open).toBe(false);
  expect(onSelectResult).toHaveBeenCalledWith("other-error");

  await act(async () => {
    root.render(
      <ErrorsTab
        launchId="launch-1"
        loading={false}
        onSelectResult={onSelectResult}
        requestedResultId={selectedResult!.id}
        results={[selectedResult!]}
        selectedResult={selectedResult}
      />
    );
  });

  groups = Array.from(
    container.querySelectorAll<HTMLDetailsElement>(".launches-reference-error-group")
  );
  expect(groups[0]?.open).toBe(false);
  expect(groups[1]?.open).toBe(true);
  expect(groups[1]?.querySelector("button.selected")?.textContent).toContain(selectedResult!.name);
});

it("does not show a successful result on an errors deep link", async () => {
  const passed = demoM1Workspace.results.find((result) => result.status === "passed")!;
  const failed = demoM1Workspace.results.find((result) => result.status === "failed")!;
  vi.mocked(loadLaunchErrorSummary).mockResolvedValue({
    kind: "launch-error-summary",
    launchId: "launch-1",
    projectId: "project-1",
    totalResults: 2,
    failedResults: 1,
    brokenResults: 0,
    totalGroups: 1,
    groupsTruncated: false,
    groups: [
      {
        name: "Assertion failed",
        failed: 1,
        broken: 0,
        resultsTruncated: false,
        examples: [{ resultUuid: failed.id, name: failed.name, status: "failed" }]
      }
    ]
  });

  await act(async () => {
    root.render(
      <ErrorsTab
        launchId="launch-1"
        loading={false}
        onSelectResult={vi.fn()}
        requestedResultId={passed.id}
        results={[passed, failed]}
        selectedResult={passed}
      />
    );
  });

  expect(container.querySelector(".launches-reference-result-report")).toBeNull();
  expect(container.querySelector(".launches-reference-errors.is-mobile-detail")).not.toBeNull();
  expect(container.textContent).toContain("Выберите ошибочный результат");
});
