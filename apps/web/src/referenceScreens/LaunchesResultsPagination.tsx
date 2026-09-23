import { ChevronLeft, ChevronRight } from "lucide-react";

import type { LaunchResultPage } from "../m1Workspace.js";

const pageSizes = [25, 50, 100] as const;

export function LaunchesResultsPagination({
  loading,
  onPageIndexChange,
  onPageSizeChange,
  page,
  pageIndex,
  pageSize
}: {
  loading: boolean;
  onPageIndexChange?: ((index: number) => void) | undefined;
  onPageSizeChange?: ((size: number) => void) | undefined;
  page?: LaunchResultPage | undefined;
  pageIndex: number;
  pageSize: number;
}) {
  if (page === undefined) {
    return null;
  }

  const first = page.total === 0 ? 0 : page.offset + 1;
  const last = page.offset + page.returned;
  const previousDisabled = loading || pageIndex === 0 || onPageIndexChange === undefined;
  const nextDisabled = loading || !page.hasMore || onPageIndexChange === undefined;

  return (
    <nav className="launches-results-pagination" aria-label="Страницы результатов тестов">
      <label className="launches-results-pagination-size">
        <span>На странице</span>
        <select
          aria-label="Результатов на странице"
          disabled={loading || onPageSizeChange === undefined}
          value={pageSize}
          onChange={(event) => onPageSizeChange?.(Number(event.target.value))}
        >
          {pageSizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <span className="launches-results-pagination-range" aria-live="polite">
        {first.toLocaleString("ru-RU")}–{last.toLocaleString("ru-RU")} из{" "}
        {page.total.toLocaleString("ru-RU")}
      </span>
      <span className="launches-results-pagination-actions">
        <button
          aria-label="Предыдущая страница результатов"
          disabled={previousDisabled}
          title="Предыдущая страница"
          type="button"
          onClick={() => onPageIndexChange?.(pageIndex - 1)}
        >
          <ChevronLeft aria-hidden="true" size={17} />
        </button>
        <button
          aria-label="Следующая страница результатов"
          disabled={nextDisabled}
          title="Следующая страница"
          type="button"
          onClick={() => onPageIndexChange?.(pageIndex + 1)}
        >
          <ChevronRight aria-hidden="true" size={17} />
        </button>
      </span>
    </nav>
  );
}
