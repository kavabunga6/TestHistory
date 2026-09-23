import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { demoM1Workspace, type TestResult } from "../m1Workspace.js";
import { getResultDiagnostic, ResultDiagnostics } from "./LaunchesResultDiagnostics.js";

const baseResult = demoM1Workspace.results[0]!;

describe("result diagnostics", () => {
  it("surfaces the recorded error instead of repeating the test title", () => {
    const result: TestResult = {
      ...baseResult,
      status: "failed",
      name: "Authentication: accepts a valid request",
      trace: {
        message: "Authentication fixture failed: accepts a valid request",
        stack: [
          "ShowcasefailedError: synthetic diagnostic 002",
          "at verifyRequest (tests/auth.test.ts:18:4)"
        ]
      }
    };

    const diagnostic = getResultDiagnostic(result);
    expect(diagnostic.cause).toBe("ShowcasefailedError: synthetic diagnostic 002");
    expect(diagnostic.context).toBeUndefined();
    expect(diagnostic.lines).toEqual(["at verifyRequest (tests/auth.test.ts:18:4)"]);

    const markup = renderToStaticMarkup(<ResultDiagnostics result={result} />);
    expect(markup).toContain('<details class="launches-reference-trace');
    expect(markup).not.toContain('open=""');
    expect(markup).toContain("Причина падения");
    expect(markup).toContain("synthetic diagnostic 002");
    expect(markup).toContain("Показать стек");
    expect(markup).not.toContain("Authentication fixture failed");
  });

  it("states when the failure reason was not recorded", () => {
    const { trace: _trace, ...withoutTrace } = baseResult;
    const result: TestResult = { ...withoutTrace, status: "failed" };
    const markup = renderToStaticMarkup(<ResultDiagnostics result={result} />);
    expect(markup).toContain("Причина не передана вместе с результатом");
    expect(markup).toContain("подробности ошибки не сохранены");
    expect(markup).not.toContain("Стек вызовов");
  });

  it("limits the initial stack preview and offers the remaining lines", () => {
    const result: TestResult = {
      ...baseResult,
      status: "broken",
      trace: {
        message: "Request failed",
        stack: Array.from({ length: 12 }, (_, index) => `frame-${index + 1}`)
      }
    };
    const markup = renderToStaticMarkup(<ResultDiagnostics result={result} />);
    expect(markup).toContain("frame-8");
    expect(markup).not.toContain("frame-9");
    expect(markup).toContain("Показать весь стек (12 строк)");
  });
});
