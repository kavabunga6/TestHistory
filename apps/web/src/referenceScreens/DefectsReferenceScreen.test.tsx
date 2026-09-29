import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { demoM1Workspace } from "../m1Workspace.js";
import {
  buildDefectSummaries,
  DefectsReferenceScreen,
  filterDefects
} from "./DefectsReferenceScreen.js";

describe("defect navigation", () => {
  it("treats a plain phrase containing 'in' as text search", () => {
    const result = {
      ...demoM1Workspace.results[0]!,
      defect: "BUG-SIGNIN",
      name: "Sign in failure"
    };
    expect(filterDefects(buildDefectSummaries([result]), "Sign in", "all")).toHaveLength(1);
  });

  it("keeps a routed defect visible when it falls outside the first 50 rows", () => {
    const result = demoM1Workspace.results[0]!;
    const results = Array.from({ length: 51 }, (_, index) => ({
      ...result,
      id: `result-${index}`,
      defect: `BUG-${String(index).padStart(3, "0")}`,
      name: `Failure ${index}`,
      status: "failed" as const
    }));

    const markup = renderToStaticMarkup(
      <DefectsReferenceScreen results={results} routeDefectId="BUG-050" />
    );

    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("BUG-050");
    expect(markup).toContain("Failure 50");
    expect(markup).not.toContain("BUG-049");
  });

  it("shows the actual failure message in the defect detail", () => {
    const result = demoM1Workspace.results[0]!;
    const markup = renderToStaticMarkup(
      <DefectsReferenceScreen
        results={[
          {
            ...result,
            defect: "BUG-DIAGNOSTIC",
            status: "failed",
            trace: { message: "Checkout timed out", stack: [] }
          }
        ]}
      />
    );

    expect(markup).toContain("Причина сбоя");
    expect(markup).toContain("Checkout timed out");
  });

  it("shows every owner tag in the linked result instead of truncating the data to three", () => {
    const result = demoM1Workspace.results[0]!;
    const markup = renderToStaticMarkup(
      <DefectsReferenceScreen
        results={[
          {
            ...result,
            defect: "BUG-TAGS",
            owner: "Very Long Quality Assurance Team",
            tags: ["recurring", "payment-confirmation", "firefox", "nightly"],
            historyPoints: [
              {
                launchId: "launch-1",
                launchName: "Release checks",
                resultUuid: result.id,
                startedAt: "2026-09-29T00:00:00.000Z",
                status: "failed",
                duration: "530ms",
                retry: false,
                flaky: false,
                attempt: 1
              }
            ]
          }
        ]}
      />
    );

    expect(markup).toContain("Very Long Quality Assurance Team");
    expect(markup).toContain("payment-confirmation");
    expect(markup).toContain("nightly");
    expect(markup).toContain("defects-reference-result-tags");
  });

  it("shows a cluster description when the API provides one", () => {
    const result = demoM1Workspace.results[0]!;
    const markup = renderToStaticMarkup(
      <DefectsReferenceScreen
        results={[
          {
            ...result,
            id: "BUG-SIGNATURE",
            defect: "BUG-SIGNATURE",
            description: "Grouped by database connection timeout",
            name: "Payment failure"
          }
        ]}
      />
    );

    expect(markup).toContain("Описание дефекта");
    expect(markup).toContain("Grouped by database connection timeout");
  });

  it("uses defect lifecycle and title while showing affected case IDs as secondary data", () => {
    const result = {
      ...demoM1Workspace.results[0]!,
      id: "BUG-CLUSTER",
      defect: "BUG-CLUSTER",
      defectStatus: "closed" as const,
      name: "Database connection timeout",
      status: "failed" as const,
      testKeys: ["TC-123", "TC-456", "TC-789"]
    };

    expect(buildDefectSummaries([result])[0]).toMatchObject({
      status: "closed",
      title: "Database connection timeout",
      testCaseCount: 3
    });
    const markup = renderToStaticMarkup(<DefectsReferenceScreen results={[result]} />);
    expect(markup).toContain("Database connection timeout");
    expect(markup).toContain("Кейсы: TC-123, TC-456 +1");
    expect(markup).toContain("ЗАКРЫТ");
  });

  it("keeps a selected defect outside the loaded page without changing the server range", () => {
    const result = demoM1Workspace.results[0]!;
    const markup = renderToStaticMarkup(
      <DefectsReferenceScreen
        results={[{ ...result, id: "BUG-FIRST", defect: "BUG-FIRST" }]}
        selectedDetail={{ ...result, id: "BUG-LATER", defect: "BUG-LATER", name: "Later defect" }}
        routeDefectId="BUG-LATER"
        page={{ limit: 25, offset: 0, returned: 1, total: 100 }}
        pageIndex={0}
        pageSize={25}
      />
    );

    expect(markup).toContain("1–1 из 100");
    expect(markup).toContain("Выбранный дефект вне текущей страницы");
    expect(markup).toContain("Later defect");
  });

  it("does not select another defect when a routed defect does not exist", () => {
    const result = demoM1Workspace.results[0]!;
    const markup = renderToStaticMarkup(
      <DefectsReferenceScreen
        results={[{ ...result, id: "BUG-FIRST", defect: "BUG-FIRST" }]}
        routeDefectId="BUG-MISSING"
        page={{ limit: 25, offset: 0, returned: 1, total: 1 }}
        pageIndex={0}
        pageSize={25}
      />
    );

    expect(markup).toContain("Дефект не найден");
    expect(markup).not.toContain('aria-pressed="true"');
  });
});
