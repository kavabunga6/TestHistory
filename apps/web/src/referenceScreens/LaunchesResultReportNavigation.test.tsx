// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { demoM1Workspace } from "../m1Workspace.js";
import { ResultReport } from "./LaunchesResultReport.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("result report navigation", () => {
  it("shows the result UUID separately from the Allure ID and links an external issue", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const result = {
      ...demoM1Workspace.results[0]!,
      id: "result-uuid-123",
      allureId: "A-1042",
      defect: "PAY-337",
      issues: ["PAY-337"],
      linkDetails: [{ label: "PAY-337", url: "https://tracker.example.test/PAY-337" }]
    };

    try {
      act(() =>
        root.render(
          <ResultReport
            result={result}
            results={[result]}
            onSelectResult={undefined}
            onUnlinkResultDefect={() => undefined}
            routeTab="defects"
          />
        )
      );
      expect(container.textContent).toContain("ID результата: result-uuid-123");
      expect(container.textContent).toContain("Allure ID: A-1042");
      expect(
        container.querySelector<HTMLButtonElement>(
          '[aria-label="Скопировать ID результата result-uuid-123"]'
        )
      ).not.toBeNull();
      expect(
        container.querySelector<HTMLAnchorElement>('a[href="https://tracker.example.test/PAY-337"]')
          ?.textContent
      ).toBe("PAY-337");
      expect(container.querySelector('a[href="#defects/PAY-337"]')).toBeNull();
      expect(container.querySelector(".launches-reference-defect-unlink")).toBeNull();
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it("keeps navigation and unlink for a real internal defect ID", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onUnlinkResultDefect = vi.fn();
    const result = {
      ...demoM1Workspace.results[0]!,
      id: "result-uuid-123",
      defect: "defect:1a2b3c4d",
      issues: []
    };

    try {
      act(() =>
        root.render(
          <ResultReport
            result={result}
            results={[result]}
            onSelectResult={undefined}
            onUnlinkResultDefect={onUnlinkResultDefect}
            routeTab="defects"
          />
        )
      );
      expect(container.querySelector('a[href="#defects/defect%3A1a2b3c4d"]')).not.toBeNull();
      const unlink = container.querySelector<HTMLButtonElement>(
        ".launches-reference-defect-unlink"
      );
      act(() => unlink?.click());
      expect(onUnlinkResultDefect).toHaveBeenCalledWith("result-uuid-123", "defect:1a2b3c4d");
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it("jumps to the diagnostic attached to a deeply nested failed step", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    const trace = {
      message: "Deep assertion failed",
      stack: ["AssertionError: Deep assertion failed", "at verify payment"]
    };
    const result = {
      ...demoM1Workspace.results[0]!,
      id: "deep-failure",
      status: "failed" as const,
      trace,
      steps: [
        {
          name: "First level",
          status: "failed" as const,
          duration: "30ms",
          steps: [
            {
              name: "Second level",
              status: "failed" as const,
              duration: "20ms",
              steps: [{ name: "Assertion", status: "failed" as const, duration: "10ms", trace }]
            }
          ]
        }
      ]
    };

    try {
      act(() =>
        root.render(<ResultReport result={result} results={[result]} onSelectResult={undefined} />)
      );
      const target = container.querySelector<HTMLElement>(".launches-reference-step-failure");
      const jump = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("К шагу с ошибкой")
      );

      expect(target?.textContent).toContain("Deep assertion failed");
      expect(jump).toBeDefined();
      act(() => jump?.click());
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
      expect(document.activeElement).toBe(target);
    } finally {
      act(() => root.unmount());
      container.remove();
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });
});
