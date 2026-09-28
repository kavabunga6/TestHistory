// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { demoM1Workspace } from "../m1Workspace.js";
import { ResultReport } from "./LaunchesResultReport.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("result report navigation", () => {
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
