// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";

import { ReferenceListPagination, useReferenceListPagination } from "./ReferenceListPagination.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function PaginatedList({ selectedIndex }: { selectedIndex: number }) {
  const count = 51;
  const { page, pageSize, setPage, setPageSize } = useReferenceListPagination({
    context: String(selectedIndex),
    count,
    selectedIndex
  });

  return (
    <>
      <div data-testid="visible-items">
        {Array.from({ length: count }, (_, index) => index + 1)
          .slice(page * pageSize, (page + 1) * pageSize)
          .join(",")}
      </div>
      <ReferenceListPagination
        count={count}
        label="Тест-кейсы"
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        page={page}
        pageSize={pageSize}
      />
    </>
  );
}

it("keeps a deep-linked row in order and allows changing pages and page size", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  try {
    await act(async () => root.render(<PaginatedList selectedIndex={50} />));
    expect(container.querySelector('[data-testid="visible-items"]')?.textContent).toBe("51");
    expect(container.querySelector("footer")?.textContent).toContain("51–51 из 51");

    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[aria-label^="Предыдущая"]')?.click()
    );
    expect(container.querySelector('[data-testid="visible-items"]')?.textContent).toMatch(/^26,/);

    const size = container.querySelector<HTMLSelectElement>("footer select")!;
    await act(async () => {
      size.value = "100";
      size.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="visible-items"]')?.textContent).toMatch(/^1,/);
    expect(container.querySelector("footer")?.textContent).toContain("1–51 из 51");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
