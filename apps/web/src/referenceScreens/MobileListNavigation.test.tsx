// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { demoM1Workspace } from "../m1Workspace.js";
import { DefectsReferenceScreen } from "./DefectsReferenceScreen.js";
import { TestCaseDetailReferenceScreen } from "./TestCaseDetailReferenceScreen.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const desktopWidth = window.innerWidth;

afterEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: desktopWidth });
});

it("keeps the mobile test-case list on its list route and returns there from a detail", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  const result = demoM1Workspace.results[0]!;
  const onSelect = vi.fn();
  const onOpenList = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  try {
    act(() =>
      root.render(
        <TestCaseDetailReferenceScreen
          results={[result]}
          selectedId=""
          onSelect={onSelect}
          onOpenList={onOpenList}
        />
      )
    );
    expect(container.querySelector(".tc-detail-reference-screen")?.className).toContain(
      "is-mobile-list-route"
    );
    expect(onSelect).not.toHaveBeenCalled();
    expect(
      container
        .querySelector<HTMLButtonElement>(".tc-detail-reference-row-main")
        ?.getAttribute("aria-pressed")
    ).toBe("false");

    act(() => container.querySelector<HTMLButtonElement>(".tc-detail-reference-row-main")?.click());
    expect(onSelect).toHaveBeenCalledWith(result.id);

    act(() =>
      root.render(
        <TestCaseDetailReferenceScreen
          results={[result]}
          selectedId={result.id}
          onSelect={onSelect}
          onOpenList={onOpenList}
        />
      )
    );
    expect(container.querySelector(".tc-detail-reference-screen")?.className).toContain(
      "is-mobile-detail-route"
    );
    act(() =>
      container.querySelector<HTMLButtonElement>(".tc-detail-reference-mobile-back")?.click()
    );
    expect(onOpenList).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it("returns from a mobile defect detail to the defect list route", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  const result = {
    ...demoM1Workspace.results[0]!,
    defect: "BUG-MOBILE",
    status: "failed" as const
  };
  const onOpenDefect = vi.fn();
  const onOpenList = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  try {
    act(() =>
      root.render(
        <DefectsReferenceScreen
          results={[result]}
          onOpenDefect={onOpenDefect}
          onOpenList={onOpenList}
        />
      )
    );
    expect(container.querySelector(".defects-reference-screen")?.className).toContain(
      "is-mobile-list-route"
    );
    expect(
      container
        .querySelector<HTMLButtonElement>(".defects-reference-row")
        ?.getAttribute("aria-pressed")
    ).toBe("false");
    act(() => container.querySelector<HTMLButtonElement>(".defects-reference-row")?.click());
    expect(onOpenDefect).toHaveBeenCalledWith("BUG-MOBILE");

    act(() =>
      root.render(
        <DefectsReferenceScreen
          results={[result]}
          routeDefectId="BUG-MOBILE"
          onOpenDefect={onOpenDefect}
          onOpenList={onOpenList}
        />
      )
    );
    expect(container.querySelector(".defects-reference-screen")?.className).toContain(
      "is-mobile-detail-route"
    );
    act(() =>
      container.querySelector<HTMLButtonElement>(".defects-reference-mobile-back")?.click()
    );
    expect(onOpenList).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
