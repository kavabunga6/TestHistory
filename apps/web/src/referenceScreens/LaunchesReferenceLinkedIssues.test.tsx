// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { demoM1Workspace } from "../m1Workspace.js";
import { OverviewTab } from "./LaunchesReferenceOverview.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.restoreAllMocks();
});

it("shows linked issues from the whole launch without loading every result", async () => {
  const launch = demoM1Workspace.launchItems[0]!;
  const requests: string[] = [];
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    requests.push(url);
    const offset = Number(new URL(url, "http://localhost").searchParams.get("offset"));
    const items = Array.from({ length: offset === 0 ? 5 : 1 }, (_, index) => ({
      id: `BUG-${offset + index + 1}`,
      resultUuid: `result-outside-page-${offset + index + 1}`,
      resultName: `Test outside page ${offset + index + 1}`
    }));
    return Response.json({
      kind: "launch-linked-issues",
      launchId: launch.id,
      page: {
        limit: 5,
        cursor: offset === 0 ? null : String(offset),
        offset,
        returned: items.length,
        total: 6,
        nextCursor: offset === 0 ? "5" : null,
        hasMore: offset === 0
      },
      items
    });
  });
  const onSelectResult = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  try {
    await act(async () => {
      root.render(
        <OverviewTab
          launch={launch}
          results={[]}
          onSelectAll={() => undefined}
          onSelectResult={onSelectResult}
          onSelectStatus={() => undefined}
        />
      );
    });
    const card = container.querySelector(".launches-reference-overview-card-defects")!;
    expect(card.querySelector("h2")?.textContent).toBe("Связанные дефекты");
    expect(card.querySelector("em")?.textContent).toBe("6");
    expect(card.textContent).not.toContain("среди загруженных");
    expect(card.textContent).toContain("BUG-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requests[0]).toContain(`/api/v1/launches/${launch.id}/linked-issues?`);

    await act(async () => {
      card.querySelector<HTMLButtonElement>('button[aria-label="Следующая страница"]')?.click();
    });
    expect(requests[1]).toContain("offset=5");
    expect(card.textContent).toContain("BUG-6");
    await act(async () => {
      Array.from(card.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("BUG-6"))
        ?.click();
    });
    expect(onSelectResult).toHaveBeenCalledWith("result-outside-page-6");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
