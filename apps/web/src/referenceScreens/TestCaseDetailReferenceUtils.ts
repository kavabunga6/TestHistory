import type { ResultAttachment, ResultStatus, ScenarioStep, TestResult } from "../m1Workspace.js";
import { filterResultsByQuery } from "../analyticsQuery.js";

export function downloadAttachment(attachment: ResultAttachment) {
  const body = getAttachmentDownloadBody(attachment);
  const blob = new Blob([body], { type: attachment.mediaType || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = attachment.name || "attachment.bin";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function getAttachmentDownloadBody(attachment: ResultAttachment): BlobPart {
  if (attachment.previewUrl?.startsWith("data:") === true) {
    return dataUrlToBytes(attachment.previewUrl);
  }

  if (attachment.preview?.body.type === "redacted-text") {
    return attachment.preview.body.value;
  }

  return JSON.stringify(
    {
      mediaType: attachment.mediaType,
      name: attachment.name,
      retained: attachment.retained,
      sha256: attachment.preview?.sha256,
      size: attachment.size,
      source: attachment.source
    },
    null,
    2
  );
}

export function dataUrlToBytes(dataUrl: string): ArrayBuffer {
  const commaIndex = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);

  if (meta.includes(";base64")) {
    const binary = window.atob(payload);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return buffer;
  }

  const text = decodeURIComponent(payload);
  const buffer = new ArrayBuffer(text.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index);
  }
  return buffer;
}

export function collectAttachments(
  result: TestResult
): Array<{ attachment: ResultAttachment; ownerPath: string }> {
  const resultAttachments = (result.attachments ?? []).map((attachment) => ({
    attachment,
    ownerPath: "Результат"
  }));

  return [...resultAttachments, ...collectStepAttachments(result.steps)];
}

export function collectStepAttachments(
  steps: ScenarioStep[],
  parentPath = ""
): Array<{ attachment: ResultAttachment; ownerPath: string }> {
  return steps.flatMap((step, index) => {
    const path = parentPath ? `${parentPath}.${index + 1}` : `${index + 1}`;
    const own = (step.attachments ?? []).map((attachment) => ({
      attachment,
      ownerPath: `Шаг ${path}`
    }));

    return [...own, ...collectStepAttachments(step.steps ?? [], path)];
  });
}

export function filterResults(results: TestResult[], query: string): TestResult[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length > 0 && isLikelyThqlQuery(normalizedQuery)) {
    try {
      return filterResultsByQuery(results, query);
    } catch {
      return [];
    }
  }

  return results.filter((result) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      [result.name, result.id, result.allureId, result.owner, result.suite, ...result.tags]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);

    return matchesQuery;
  });
}

function isLikelyThqlQuery(query: string): boolean {
  return /(?:=|!=|~=|>=|<=|>|<|\bin\b|\band\b|\bor\b|\bnot\b|\[|\])/i.test(query);
}

export function findMostInformativeResult(results: TestResult[]): TestResult | undefined {
  return (
    results.find((result) => result.status === "failed") ??
    results.find((result) => result.status === "broken") ??
    results.find(
      (result) => collectAttachments(result).length > 0 || result.steps.some(hasNestedStepData)
    ) ??
    results[0]
  );
}

export function hasNestedStepData(step: ScenarioStep): boolean {
  return (step.steps?.length ?? 0) > 0 || (step.attachments?.length ?? 0) > 0;
}

export function getFallbackHistoryStatuses(result: TestResult): ResultStatus[] {
  return [result.status, ...result.history.slice(1)];
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

export function formatHistoryRailLabel(
  point: NonNullable<TestResult["historyPoints"]>[number]
): string {
  if (point.startedAt) {
    return formatShortHistoryDate(point.startedAt);
  }

  if (point.launchName.trim().length > 0) {
    return point.launchName;
  }

  return `#${point.attempt}`;
}

export function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
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

export function isResultQuarantined(result: TestResult): boolean {
  return result.muted || result.defectMute !== undefined || result.status === "muted";
}

export function getDefectCreator(result: TestResult, _defectId: string): string {
  return result.owner || "Не назначен";
}

export function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
