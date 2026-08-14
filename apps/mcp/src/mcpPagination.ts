import type { ResourceReadOptions } from "./mcpReadOptions.js";
import { optionalString } from "./mcpValueUtils.js";

export function normalizePageMetadata(
  page: Record<string, unknown>,
  options: ResourceReadOptions,
  fallbackTotal: number
) {
  const limit =
    typeof page.limit === "number" && Number.isInteger(page.limit) ? page.limit : options.limit;
  const offset =
    typeof page.offset === "number" && Number.isInteger(page.offset) && page.offset >= 0
      ? page.offset
      : options.offset;
  const returned =
    typeof page.returned === "number" && Number.isInteger(page.returned) && page.returned >= 0
      ? page.returned
      : fallbackTotal;
  const total =
    typeof page.total === "number" && Number.isInteger(page.total) && page.total >= 0
      ? page.total
      : fallbackTotal;
  const nextCursor = page.nextCursor === null ? null : (optionalString(page.nextCursor) ?? null);
  return {
    limit,
    cursor:
      page.cursor === null
        ? null
        : (optionalString(page.cursor) ?? (offset > 0 ? String(offset) : null)),
    offset,
    returned,
    total,
    nextCursor,
    hasMore: typeof page.hasMore === "boolean" ? page.hasMore : nextCursor !== null
  };
}

export function paginateItems<T>(items: T[], options: ResourceReadOptions) {
  const start = Math.min(options.offset, items.length);
  const end = Math.min(start + options.limit, items.length);
  const pageItems = items.slice(start, end);
  const omittedAfter = Math.max(items.length - end, 0);

  return {
    items: pageItems,
    omittedAfter,
    metadata: pageMetadata(items.length, start, pageItems.length, options.limit)
  };
}

export function pageMetadata(total: number, offset: number, returned: number, limit: number) {
  const nextOffset = offset + returned;
  const nextCursor = nextOffset < total ? String(nextOffset) : null;
  return {
    limit,
    cursor: offset > 0 ? String(offset) : null,
    offset,
    returned,
    total,
    nextCursor,
    hasMore: nextCursor !== null
  };
}
