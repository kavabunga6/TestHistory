import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import "./ReferenceListPagination.css";

export type ReferenceListPageSize = 25 | 50 | 100;

export type ReferenceListPage = {
  limit: number;
  offset: number;
  returned: number;
  total: number;
};

export function referenceListPageSize(value: number): ReferenceListPageSize {
  return value === 50 || value === 100 ? value : 25;
}

type PageNavigation = { context: string; page: number };

export function useReferenceListPagination({
  context,
  count,
  selectedIndex
}: {
  context: string;
  count: number;
  selectedIndex: number;
}) {
  const [pageSize, setPageSize] = useState<ReferenceListPageSize>(25);
  const [navigation, setNavigation] = useState<PageNavigation>();
  const pageContext = `${context}\u0000${pageSize}`;
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  const initialPage = selectedIndex >= 0 ? Math.floor(selectedIndex / pageSize) : 0;
  const page = Math.min(
    Math.max(navigation?.context === pageContext ? navigation.page : initialPage, 0),
    pageCount - 1
  );

  return {
    page,
    pageSize,
    setPage: (nextPage: number) => setNavigation({ context: pageContext, page: nextPage }),
    setPageSize
  };
}

export function ReferenceListPagination({
  count,
  label,
  offset,
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  returned
}: {
  count: number;
  label: string;
  offset?: number | undefined;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: ReferenceListPageSize) => void;
  page: number;
  pageSize: ReferenceListPageSize;
  returned?: number | undefined;
}) {
  const start = offset ?? page * pageSize;
  const first = count === 0 ? 0 : start + 1;
  const last = Math.min(start + (returned ?? pageSize), count);
  const pageCount = Math.max(1, Math.ceil(count / pageSize));

  return (
    <footer className="reference-list-pagination" aria-label={`Навигация по списку: ${label}`}>
      <label className="reference-list-pagination__size">
        <span>На странице</span>
        <select
          aria-label={`Количество записей на странице: ${label}`}
          value={pageSize}
          onChange={(event) =>
            onPageSizeChange(Number(event.target.value) as ReferenceListPageSize)
          }
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </label>
      <span className="reference-list-pagination__range" aria-live="polite">
        {first}–{last} из {count}
      </span>
      <div className="reference-list-pagination__actions">
        <button
          aria-label={`Предыдущая страница: ${label}`}
          disabled={page === 0}
          type="button"
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft aria-hidden="true" size={16} />
        </button>
        <button
          aria-label={`Следующая страница: ${label}`}
          disabled={page >= pageCount - 1}
          type="button"
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight aria-hidden="true" size={16} />
        </button>
      </div>
    </footer>
  );
}
