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
