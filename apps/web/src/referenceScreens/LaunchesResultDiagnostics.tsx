import { ChevronDown } from "lucide-react";
import { useState } from "react";

import type { TestResult } from "../m1Workspace.js";

const STACK_PREVIEW_LINES = 8;
const ERROR_LINE = /^[\w.$]*(?:Error|Exception|Failure):\s*\S/i;

export function getResultDiagnostic(result: TestResult): {
  cause: string;
  context?: string;
  lines: string[];
} {
  const message = result.trace?.message.trim() ?? "";
  const lines = (result.trace?.stack ?? []).map((line) => line.trim()).filter(Boolean);
  const errorIndex = lines.findIndex((line) => ERROR_LINE.test(line));
  const errorLine = errorIndex >= 0 ? lines[errorIndex] : undefined;
  const cause = errorLine ?? message ?? "";
  const nameSuffix = result.name.split(":").slice(1).join(":").trim().toLocaleLowerCase();
  const repeatsTitle =
    message.toLocaleLowerCase() === result.name.toLocaleLowerCase() ||
    (nameSuffix.length > 0 &&
      /\bfixture\b/i.test(message) &&
      message.toLocaleLowerCase().endsWith(nameSuffix));
  const context = message && message !== cause && !repeatsTitle ? message : undefined;

  return {
    cause: cause || "Причина не передана вместе с результатом",
    ...(context ? { context } : {}),
    lines: errorIndex >= 0 ? lines.filter((_, index) => index !== errorIndex) : lines
  };
}

export function ResultDiagnostics({ result }: { result: TestResult }) {
  const diagnostic = getResultDiagnostic(result);
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const label =
    result.status === "skipped"
      ? "Причина пропуска"
      : result.status === "broken"
        ? "Причина сбоя"
        : result.status === "failed"
          ? "Причина падения"
          : "Диагностика";
  const className = `launches-reference-trace launches-result-diagnostic is-${result.status}`;
  const copy = (
    <span className="launches-reference-trace-summary-copy">
      <span className="launches-result-diagnostic-label">{label}</span>
      <strong>{diagnostic.cause}</strong>
      {diagnostic.context ? (
        <span className="launches-result-diagnostic-context">{diagnostic.context}</span>
      ) : null}
      {result.trace === undefined ? (
        <span className="launches-result-diagnostic-context">
          Проверьте шаги и вложения ниже: подробности ошибки не сохранены.
        </span>
      ) : null}
    </span>
  );

  if (diagnostic.lines.length === 0) {
    return <section className={`${className} is-brief`}>{copy}</section>;
  }

  const visibleLines = showAll ? diagnostic.lines : diagnostic.lines.slice(0, STACK_PREVIEW_LINES);
  return (
    <details
      className={className}
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        {copy}
        <span className="launches-reference-trace-disclosure">
          {expanded ? "Скрыть стек" : "Показать стек"}
          <ChevronDown aria-hidden="true" size={16} />
        </span>
      </summary>
      <div className="launches-reference-trace-stack">
        <div className="launches-result-diagnostic-stack-heading">
          <span>Стек вызовов</span>
          <span>{formatLineCount(diagnostic.lines.length)}</span>
        </div>
        <div className={`launches-result-diagnostic-stack-lines ${showAll ? "is-full" : ""}`}>
          {visibleLines.map((line, index) => (
            <code key={`${index}-${line}`}>{line}</code>
          ))}
        </div>
        {diagnostic.lines.length > STACK_PREVIEW_LINES ? (
          <button type="button" onClick={() => setShowAll((value) => !value)}>
            {showAll
              ? "Свернуть стек"
              : `Показать весь стек (${formatLineCount(diagnostic.lines.length)})`}
          </button>
        ) : null}
      </div>
    </details>
  );
}

function formatLineCount(count: number): string {
  const plural = new Intl.PluralRules("ru-RU").select(count);
  const noun = plural === "one" ? "строка" : plural === "few" ? "строки" : "строк";
  return `${count} ${noun}`;
}
