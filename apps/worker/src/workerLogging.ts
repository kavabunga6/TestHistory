import { sanitizeLogValue } from "./workerLogSanitizer.js";
import type { WorkerLogger, WorkerLogLevel } from "./workerTypes.js";

export function logWorkerEvent(
  logger: WorkerLogger,
  level: WorkerLogLevel,
  event: string,
  details: Record<string, unknown> = {}
) {
  const entry = {
    level,
    event,
    at: new Date().toISOString(),
    ...(sanitizeLogValue(details) as Record<string, unknown>)
  };
  const target =
    level === "error"
      ? (logger.error ?? logger.log)
      : level === "warn"
        ? (logger.warn ?? logger.log)
        : logger.log;
  target(JSON.stringify(entry));
}
