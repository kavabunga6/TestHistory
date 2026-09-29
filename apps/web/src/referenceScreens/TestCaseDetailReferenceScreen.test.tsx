import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { demoM1Workspace } from "../m1Workspace.js";
import { TestCaseDetailReferenceScreen } from "./TestCaseDetailReferenceScreen.js";
import { filterResults } from "./TestCaseDetailReferenceUtils.js";

describe("test case navigation", () => {
  it("treats a plain phrase containing 'in' as text search", () => {
    const result = { ...demoM1Workspace.results[0]!, name: "Sign in with passkey" };
    expect(filterResults([result], "Sign in")).toHaveLength(1);
  });

  it("keeps a routed test case visible beyond the first 50 rows", () => {
    const result = demoM1Workspace.results[0]!;
    const results = Array.from({ length: 51 }, (_, index) => ({
      ...result,
      id: `case-${index}`,
      name: `Case ${index}`
    }));

    const markup = renderToStaticMarkup(
      <TestCaseDetailReferenceScreen results={results} selectedId="case-50" />
    );

    expect(markup).toContain("Case 50");
    expect(markup).toContain('class="tc-detail-reference-row selected');
    expect(markup).not.toContain("Case 49");
  });

  it("labels the test-case ID separately from its Allure ID", () => {
    const result = { ...demoM1Workspace.results[0]!, id: "case-internal", allureId: "A-1042" };
    const markup = renderToStaticMarkup(
      <TestCaseDetailReferenceScreen results={[result]} selectedId={result.id} />
    );

    expect(markup).toContain("Allure ID: A-1042");
    expect(markup).toContain("ID тест-кейса: case-internal");
    expect(markup).not.toContain("ID результата: case-internal");
  });

  it("does not repeat the same identifier as both Allure and internal ID", () => {
    const result = { ...demoM1Workspace.results[0]!, id: "case-1042", allureId: "case-1042" };
    const markup = renderToStaticMarkup(
      <TestCaseDetailReferenceScreen results={[result]} selectedId={result.id} />
    );

    expect(markup).toContain("ID тест-кейса: case-1042");
    expect(markup).not.toContain("Allure ID: case-1042");
  });

  it("distinguishes case lifecycle from the latest result and exposes the result route", () => {
    const result = {
      ...demoM1Workspace.results[0]!,
      id: "case-1042",
      status: "failed" as const,
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
    const markup = renderToStaticMarkup(
      <TestCaseDetailReferenceScreen
        results={[result]}
        selectedId={result.id}
        onOpenResult={() => undefined}
      />
    );

    expect(markup).toContain("Состояние кейса: Активный");
    expect(markup).toContain("Последний результат: Провален");
    expect(markup).toContain("Открыть результат из истории");
    expect(markup).toContain("Поля и связи");
  });

  it("uses the summary status even when loaded history contains only older results", () => {
    const result = {
      ...demoM1Workspace.results[0]!,
      id: "case-many-runs",
      status: "failed" as const,
      historyPoints: Array.from({ length: 50 }, (_, index) => ({
        launchId: `older-launch-${index}`,
        launchName: `Older launch ${index}`,
        resultUuid: `older-result-${index}`,
        startedAt: `2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`,
        status: "passed" as const,
        duration: "1s",
        retry: false,
        flaky: false,
        attempt: 1
      }))
    };
    const markup = renderToStaticMarkup(
      <TestCaseDetailReferenceScreen
        results={[result]}
        selectedId={result.id}
        onOpenResult={() => undefined}
      />
    );

    expect(markup).toContain("Последний результат: Провален");
    expect(markup).toContain("Открыть результат из истории");
    expect(markup).not.toContain("Открыть последний результат в запуске");
  });

  it("shows draft and archived case states separately from result status", () => {
    const result = { ...demoM1Workspace.results[0]!, workflow: "Draft" as const };
    const draftMarkup = renderToStaticMarkup(
      <TestCaseDetailReferenceScreen results={[result]} selectedId={result.id} />
    );
    const archivedMarkup = renderToStaticMarkup(
      <TestCaseDetailReferenceScreen
        results={[{ ...result, workflow: "Deprecated", deletedAt: "2026-09-01T00:00:00Z" }]}
        selectedId={result.id}
      />
    );

    expect(draftMarkup).toContain("Состояние кейса: Черновик");
    expect(archivedMarkup).toContain("Состояние кейса: Архивный");
  });

  it("opens an external issue without offering an invalid defect unlink", () => {
    const result = {
      ...demoM1Workspace.results[0]!,
      defect: "PAY-337",
      issues: ["PAY-337"],
      linkDetails: [{ label: "PAY-337", url: "https://tracker.example.test/PAY-337" }]
    };
    const markup = renderToStaticMarkup(
      <TestCaseDetailReferenceScreen
        results={[result]}
        selectedId={result.id}
        routeTab="defects"
        onUnlinkResultDefect={() => undefined}
      />
    );

    expect(markup).toContain('href="https://tracker.example.test/PAY-337"');
    expect(markup).not.toContain('href="#defects/PAY-337"');
    expect(markup).not.toContain("Отвязать");
  });

  it("labels an unknown latest result distinctly from a skipped result", () => {
    const result = { ...demoM1Workspace.results[0]!, status: "unknown" as const };
    const markup = renderToStaticMarkup(
      <TestCaseDetailReferenceScreen results={[result]} selectedId={result.id} />
    );

    expect(markup).toContain("Последний результат: Неизвестен");
    expect(markup).not.toContain("Последний результат: Пропущен");
    expect(markup).toContain("result-status-unknown");
  });

  it("shows the inherited exception inside the sole failing step", () => {
    const result = {
      ...demoM1Workspace.results[0]!,
      status: "failed" as const,
      steps: [
        { name: "Подготовка", status: "passed" as const, duration: "10ms" },
        { name: "Проверка ответа", status: "failed" as const, duration: "20ms" }
      ],
      trace: {
        message: "Ожидался код 200",
        stack: ["AssertionError: expected 200", "at response.test:42"]
      }
    };
    const markup = renderToStaticMarkup(
      <TestCaseDetailReferenceScreen results={[result]} selectedId={result.id} />
    );

    expect(markup).toContain('aria-label="Диагностика шага 2"');
    expect(markup).toContain("AssertionError: expected 200");
    expect(markup).toContain("Ожидался код 200");
    expect(markup).toContain("<summary>Стек вызовов</summary>");
    expect(markup).not.toContain('aria-label="Диагностика шага 1"');
  });

  it("counts a linked defect once in the tab when issue and defect IDs match", () => {
    const result = {
      ...demoM1Workspace.results[0]!,
      defect: "PAY-337",
      issues: ["PAY-337"]
    };
    const markup = renderToStaticMarkup(
      <TestCaseDetailReferenceScreen results={[result]} selectedId={result.id} />
    );

    expect(markup).toMatch(/Дефекты<span[^>]*>1<\/span>/);
  });

  it("uses the server total and keeps an off-page deep link in the detail panel", () => {
    const result = demoM1Workspace.results[0]!;
    const markup = renderToStaticMarkup(
      <TestCaseDetailReferenceScreen
        results={[{ ...result, id: "case-first" }]}
        selectedDetail={{ ...result, id: "case-later", name: "Off-page case" }}
        selectedId="case-later"
        page={{ limit: 25, offset: 0, returned: 1, total: 100 }}
        pageIndex={0}
        pageSize={25}
      />
    );

    expect(markup).toContain("1–1 из 100");
    expect(markup).toContain("Выбранный кейс вне текущей страницы");
    expect(markup).toContain("ID тест-кейса: case-later");
  });
});
