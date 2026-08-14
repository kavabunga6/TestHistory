import { isNonEmptyString } from "./workerValueUtils.js";

export function normalizeRequiredWorkerText(value: unknown, label: string): string {
  if (!isNonEmptyString(value)) {
    throw new Error(`${label} is required`);
  }

  return value.trim();
}

export function normalizeOptionalWorkerText(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value.trim() : undefined;
}

export function normalizeWorkerIsoTimestamp(value: string): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(0).toISOString();
}
