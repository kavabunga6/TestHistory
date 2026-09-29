// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { demoM1Workspace } from "../m1Workspace.js";
import { loadLaunchErrorSummary } from "./LaunchErrorSummaryData.js";
import { ErrorsTab } from "./LaunchesReferenceTabs.js";

vi.mock("./LaunchErrorSummaryData.js", () => ({
  loadLaunchErrorSummary: vi.fn()
}));

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

it("expands the group of the report shown on the right", async () => {
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

  await act(async () => {
    root.render(
      <ErrorsTab
        launchId="launch-1"
        loading={false}
        onSelectResult={vi.fn()}
        results={[selectedResult!]}
        selectedResult={selectedResult}
      />
    );
  });

  const groups = Array.from(
    container.querySelectorAll<HTMLDetailsElement>(".launches-reference-error-group")
  );
  expect(groups).toHaveLength(2);
  expect(groups[0]?.open).toBe(false);
  expect(groups[1]?.open).toBe(true);
  expect(groups[1]?.querySelector("button.selected")?.textContent).toContain(selectedResult!.name);
});
