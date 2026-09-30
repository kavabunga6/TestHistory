import type { ResultStatus } from "../m1Workspace.js";

/** Keep status summaries and their colored distributions in the same reading order. */
export const resultStatusOrder: readonly ResultStatus[] = [
  "failed",
  "broken",
  "unknown",
  "passed",
  "skipped",
  "muted"
];

export const resultStatusGroupLabels: Record<ResultStatus, string> = {
  failed: "Проваленные",
  broken: "Сломанные",
  unknown: "Неизвестные",
  passed: "Успешные",
  skipped: "Пропущенные",
  muted: "Карантин"
};
