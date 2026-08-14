import type { ResultStatus, TestCaseHistoryPoint, TestResult } from "../m1Workspace.js";

export function formatOptionalCount(value: number | undefined): string {
  return value === undefined ? "неизвестного количества" : value.toLocaleString("ru-RU");
}

export function statusColor(status: ResultStatus): string {
  if (status === "muted") {
    return "#64748b";
  }
  if (status === "passed") {
    return "#43a047";
  }
  if (status === "failed") {
    return "#de594d";
  }
  if (status === "broken") {
    return "#e7a24a";
  }
  return "#8c98a8";
}

export function formatStatus(status: ResultStatus): string {
  if (status === "muted") {
    return "Карантин";
  }
  if (status === "passed") {
    return "Успешный";
  }
  if (status === "failed") {
    return "Провален";
  }
  if (status === "broken") {
    return "Сломан";
  }
  return "Пропущен";
}

export function formatSeverity(severity: TestResult["severity"]): string {
  if (severity === "critical") {
    return "критичная";
  }
  if (severity === "minor") {
    return "низкая";
  }
  return "обычная";
}

export function formatLaunchId(id: string) {
  return id.replace(/^L-/, "");
}

export function formatHistoryLaunchName(index: number): string {
  if (index === 0) {
    return "Текущий запуск";
  }

  if (index === 1) {
    return "Предыдущий запуск";
  }

  return `Запуск -${index}`;
}

export function formatHistoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatShortHistoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit"
  }).format(date);
}

export function formatHistoryRailLabel(point: TestCaseHistoryPoint): string {
  if (point.startedAt) {
    return formatShortHistoryDate(point.startedAt);
  }

  if (point.launchName.trim().length > 0) {
    return point.launchName;
  }

  return `#${point.attempt}`;
}

export function parseDurationSeconds(duration: string): number {
  const millisecondsMatch = duration.match(/(\d+(?:[.,]\d+)?)\s*ms/);
  const durationWithoutMilliseconds = duration.replace(/(\d+(?:[.,]\d+)?)\s*ms/g, "");
  const minutesMatch = durationWithoutMilliseconds.match(/(\d+(?:[.,]\d+)?)\s*m(?!s)/);
  const secondsMatch = durationWithoutMilliseconds.match(/(\d+(?:[.,]\d+)?)\s*s/);

  const minutes = parseDurationPart(minutesMatch?.[1]) * 60;
  const seconds = parseDurationPart(secondsMatch?.[1]);
  const milliseconds = parseDurationPart(millisecondsMatch?.[1]) / 1000;

  return minutes + seconds + milliseconds;
}

export function formatDurationSeconds(duration: number): string {
  if (duration < 1) {
    return `${Math.round(duration * 1000)}ms`;
  }

  if (duration < 60) {
    return `${duration.toFixed(2).replace(/\.?0+$/, "")}s`;
  }

  const minutes = Math.floor(duration / 60);
  const seconds = Math.round(duration % 60);
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function parseDurationPart(value: string | undefined): number {
  return value === undefined ? 0 : Number(value.replace(",", "."));
}

export function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => value !== undefined && value.trim() !== ""))
  );
}

export function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
