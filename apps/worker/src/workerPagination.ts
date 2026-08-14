export function normalizePaginationLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 50;
  }

  return Math.min(500, Math.max(1, Math.floor(value)));
}

export function normalizePaginationOffset(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}
