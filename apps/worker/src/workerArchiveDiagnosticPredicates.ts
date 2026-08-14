import type { ArchiveDiagnosticReplayEvent, ArchiveDiagnosticReplaySource } from "./workerTypes.js";

export function isArchiveDiagnosticReplaySource(
  value: unknown
): value is ArchiveDiagnosticReplaySource {
  return (
    value === "archive.status.read" ||
    value === "archive.diagnostics.read" ||
    value === "archive.cleanup.preview"
  );
}

export function isArchiveDiagnosticReplayCode(
  value: unknown
): value is ArchiveDiagnosticReplayEvent["code"] {
  return (
    value === "archive-status-read" ||
    value === "duplicate-entry" ||
    value === "unsafe-entry-path" ||
    value === "unsupported-entry" ||
    value === "entry-processing-error" ||
    value === "parser-diagnostic" ||
    value === "diagnostic-limit-reached"
  );
}
