// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

import { demoM1Workspace } from "../m1Workspace.js";
import { TestCaseDetailReferenceScreen } from "./TestCaseDetailReferenceScreen.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("opens a result from the loaded history with its launch and test-case IDs", () => {
  const onOpenResult = vi.fn();
  const result = {
    ...demoM1Workspace.results[0]!,
    id: "case-1042",
    historyPoints: [
      {
        launchId: "L-1289",
        launchName: "PR-1289 Checkout Regression",
        resultUuid: "result-uuid-123",
        testCaseId: "case-1042",
        startedAt: "2026-09-28T12:00:00Z",
        status: "failed" as const,
        duration: "1.24s",
        retry: false,
        flaky: false,
        attempt: 1
      }
    ]
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  try {
    act(() =>
      root.render(
        <TestCaseDetailReferenceScreen
          results={[result]}
          selectedId={result.id}
          onOpenResult={onOpenResult}
        />
      )
    );
    const open = container.querySelector<HTMLButtonElement>(".tc-detail-reference-open-latest");
    expect(open?.textContent).toContain("Открыть результат");
    expect(open?.getAttribute("aria-label")).toContain("PR-1289 Checkout Regression");
    expect(open?.title).toContain("PR-1289 Checkout Regression");
    act(() => open?.click());
    expect(onOpenResult).toHaveBeenCalledWith("result-uuid-123", "L-1289", "case-1042");
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
