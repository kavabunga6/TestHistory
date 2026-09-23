import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { demoM1Workspace, type ScenarioStep, type TestResult } from "../m1Workspace.js";
import { ScenarioSection } from "./LaunchesResultScenario.js";

const baseResult = demoM1Workspace.results[0]!;

function step(name: string, status: ScenarioStep["status"], children: ScenarioStep[] = []) {
  return { name, status, duration: "40ms", steps: children };
}

describe("scenario step tree", () => {
  it("keeps a branch for each level and shows the terminal step exception in its own subtree", () => {
    let nested: ScenarioStep = {
      ...step("Verify response", "failed"),
      trace: {
        message: "Ожидалось: HTTP 200. Получено: HTTP 401.",
        stack: ["AssertionError: expected HTTP 200, received 401", "at verify (auth.test.ts:18)"]
      }
    };
    for (let depth = 5; depth >= 1; depth -= 1) {
      nested = step(`Level ${depth}`, "failed", [nested]);
    }
    const result: TestResult = { ...baseResult, status: "failed", steps: [nested] };

    const markup = renderToStaticMarkup(<ScenarioSection result={result} />);

    expect(markup.match(/class="launches-reference-step-branch"/g)).toHaveLength(6);
    expect(markup).toContain('aria-label="Диагностика шага 1.1.1.1.1.1"');
    expect(markup).toContain("AssertionError: expected HTTP 200, received 401");
    expect(markup).toContain("Ожидалось: HTTP 200. Получено: HTTP 401.");
    expect(markup).toContain("Стек вызовов");
  });

  it("uses the result diagnostic only for a single terminal failed step without its own trace", () => {
    const result: TestResult = {
      ...baseResult,
      status: "failed",
      trace: { message: "Result exception", stack: ["AssertionError: result failed"] },
      steps: [step("Group", "failed", [step("Terminal", "failed")])]
    };

    const markup = renderToStaticMarkup(<ScenarioSection result={result} />);

    expect(markup.match(/aria-label="Диагностика шага/g)).toHaveLength(1);
    expect(markup).toContain('aria-label="Диагностика шага 1.1"');
    expect(markup).toContain("AssertionError: result failed");
  });

  it("never spreads a result exception across multiple failed steps", () => {
    const result: TestResult = {
      ...baseResult,
      status: "failed",
      trace: { message: "Result exception", stack: ["AssertionError: result failed"] },
      steps: [
        step("First", "failed"),
        {
          ...step("Second", "failed"),
          trace: { message: "Step-specific exception", stack: [] }
        }
      ]
    };

    const markup = renderToStaticMarkup(<ScenarioSection result={result} />);

    expect(markup).toContain('aria-label="Диагностика шага 2"');
    expect(markup).toContain("Step-specific exception");
    expect(markup).not.toContain('aria-label="Диагностика шага 1"');
    expect(markup).not.toContain("Result exception");
  });

  it("does not invent an explanation when neither the step nor result has one", () => {
    const { trace: _trace, ...withoutTrace } = baseResult;
    const result: TestResult = {
      ...withoutTrace,
      status: "failed",
      steps: [step("Terminal", "failed")]
    };

    const markup = renderToStaticMarkup(<ScenarioSection result={result} />);

    expect(markup).not.toContain("launches-reference-step-failure");
    expect(markup).not.toContain("launches-reference-step-branch");
  });
});
