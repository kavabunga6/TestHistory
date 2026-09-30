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

it("opens a collapsed failure branch and focuses its failed step", () => {
  const result = {
    ...demoM1Workspace.results[0]!,
    status: "failed" as const,
    steps: [
      {
        name: "Длинный вложенный сценарий проверки оформления заказа",
        status: "failed" as const,
        duration: "20ms",
        steps: [
          {
            name: "Проверка ответа сервера с очень длинным описанием действия",
            status: "failed" as const,
            duration: "10ms",
            trace: { message: "Ответ сервера не совпал с ожидаемым", stack: [] }
          }
        ]
      }
    ]
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  try {
    act(() =>
      root.render(<TestCaseDetailReferenceScreen results={[result]} selectedId={result.id} />)
    );
    const parent = container.querySelector<HTMLElement>('[data-failure-step-path="1"]');
    const expander = parent?.querySelector<HTMLButtonElement>(".tc-detail-reference-step-expander");
    act(() => expander?.click());
    expect(parent?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('[data-failure-step-path="1.1"]')).toBeNull();

    const jump = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.includes("К шагу 1.1")
    );
    act(() => jump?.click());

    const failedStep = container.querySelector<HTMLElement>('[data-failure-step-path="1.1"]');
    expect(failedStep).not.toBeNull();
    expect(document.activeElement).toBe(failedStep);
    expect(failedStep?.textContent).toContain("Проверка ответа сервера");
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it("hides the stacked properties rail and allows it to be restored", () => {
  const result = demoM1Workspace.results[0]!;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  try {
    act(() =>
      root.render(<TestCaseDetailReferenceScreen results={[result]} selectedId={result.id} />)
    );
    const toggle = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.includes("Скрыть свойства")
    );
    const rail = container.querySelector<HTMLElement>("#tc-detail-reference-side-rail");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    act(() => toggle?.click());
    expect(rail?.hidden).toBe(true);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.textContent).toContain("Показать свойства");
    expect(container.querySelector(".tc-detail-reference-overview.is-wide")).not.toBeNull();
    act(() => toggle?.click());
    expect(rail?.hidden).toBe(false);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
