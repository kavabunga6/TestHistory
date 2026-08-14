export type ResourceReadOptions = {
  includeDetails: boolean;
  includeRaw: boolean;
  limit: number;
  cursor: string | undefined;
  offset: number;
};

export const defaultResultLimit = 20;

import {
  cursorOffset,
  numberSearchParam,
  optionalPositiveInteger,
  optionalString
} from "./mcpValueUtils.js";

export function compactOptions(value: Record<string, unknown>): ResourceReadOptions {
  const cursor = optionalString(value.cursor);
  return {
    includeDetails: value.includeDetails === true,
    includeRaw: value.includeRaw === true,
    limit: optionalPositiveInteger(value.limit ?? value.resultLimit, defaultResultLimit, 1000),
    cursor,
    offset: cursorOffset(cursor)
  };
}

export function compactOptionsFromSearch(searchParams: URLSearchParams): ResourceReadOptions {
  const cursor = optionalString(searchParams.get("cursor"));
  return {
    includeDetails: searchParams.get("includeDetails") === "true",
    includeRaw: searchParams.get("includeRaw") === "true",
    limit: optionalPositiveInteger(
      numberSearchParam(searchParams, "limit") ?? numberSearchParam(searchParams, "resultLimit"),
      defaultResultLimit,
      1000
    ),
    cursor,
    offset: cursorOffset(cursor)
  };
}
