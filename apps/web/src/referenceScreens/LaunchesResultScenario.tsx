import { ChevronDown, ChevronRight } from "lucide-react";
import { useState, type CSSProperties } from "react";

import type { ResultTrace, ScenarioStep, TestResult } from "../m1Workspace.js";
import { shouldExpandScenarioStep } from "../scenarioStepTree.js";
import { AttachmentList } from "./LaunchesResultAttachments.js";
import { formatResultDuration } from "./LaunchesResultDuration.js";
import { StatusIcon } from "./LaunchesStatusIcon.js";
export function ScenarioSection({ result }: { result: TestResult }) {
  const terminalFailurePaths = collectTerminalFailurePaths(result.steps);
  const fallbackPath =
    (result.status === "failed" || result.status === "broken") && terminalFailurePaths.length === 1
      ? terminalFailurePaths[0]
      : undefined;
  return (
    <details className="launches-reference-mini-section" open>
      <summary>
        <h4>Выполняемый сценарий</h4>
        <ChevronDown size={16} />
      </summary>
      {result.steps.length === 0 ? (
        <p className="launches-reference-muted">Шаги не переданы.</p>
      ) : (
        <ScenarioStepTree
          fallbackPath={fallbackPath}
          fallbackTrace={result.trace}
          steps={result.steps}
        />
      )}
    </details>
  );
}

function ScenarioStepTree({
  depth = 0,
  fallbackPath,
  fallbackTrace,
  parentPath = "",
  steps
}: {
  depth?: number;
  fallbackPath: string | undefined;
  fallbackTrace: ResultTrace | undefined;
  parentPath?: string;
  steps: ScenarioStep[];
}) {
  return (
    <ol className="launches-reference-step-tree">
      {steps.map((step, index) => {
        const path = parentPath ? `${parentPath}.${index + 1}` : `${index + 1}`;
        return (
          <ScenarioStepNode
            depth={depth}
            fallbackPath={fallbackPath}
            fallbackTrace={fallbackTrace}
            key={`${path}-${step.name}`}
            path={path}
            step={step}
          />
        );
      })}
    </ol>
  );
}

function ScenarioStepNode({
  depth,
  fallbackPath,
  fallbackTrace,
  path,
  step
}: {
  depth: number;
  fallbackPath: string | undefined;
  fallbackTrace: ResultTrace | undefined;
  path: string;
  step: ScenarioStep;
}) {
  const childSteps = step.steps ?? [];
  const attachments = step.attachments ?? [];
  const expandable = childSteps.length > 0 || attachments.length > 0;
  const [expanded, setExpanded] = useState(() => shouldExpandScenarioStep(step));
  const depthStyle = {
    "--launches-step-indent": `calc(var(--launches-step-indent-unit, 24px) * ${depth})`
  } as CSSProperties;
  const trace = step.trace ?? (path === fallbackPath ? fallbackTrace : undefined);
  const failure =
    (step.status === "failed" || step.status === "broken") &&
    (trace?.message.trim() || trace?.stack.some((line) => line.trim())) ? (
      <StepFailure path={path} status={step.status} trace={trace} />
    ) : null;
  const row = (
    <span className={`launches-reference-step-row is-${step.status}`}>
      <span
        aria-hidden="true"
        className={`launches-reference-step-disclosure ${expandable ? "" : "is-placeholder"}`}
        title={expandable ? (expanded ? "Свернуть шаг" : "Развернуть шаг") : undefined}
      >
        {expandable ? <ChevronRight size={16} /> : null}
      </span>
      <span className="launches-reference-step-status">
        <StatusIcon status={step.status} />
      </span>
      <strong>{step.name}</strong>
      <em>{formatResultDuration(step.duration)}</em>
    </span>
  );

  return (
    <li
      className={`launches-reference-step-node ${expandable ? "is-group" : "is-leaf"} is-${step.status}`}
      style={depthStyle}
    >
      {expandable ? (
        <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
          <summary aria-label={`${expanded ? "Свернуть" : "Развернуть"} шаг ${path}: ${step.name}`}>
            {row}
          </summary>
          <div className="launches-reference-step-branch">
            {failure}
            {childSteps.length > 0 ? (
              <ScenarioStepTree
                depth={depth + 1}
                fallbackPath={fallbackPath}
                fallbackTrace={fallbackTrace}
                parentPath={path}
                steps={childSteps}
              />
            ) : null}
            {attachments.length > 0 ? (
              <AttachmentList attachments={attachments} compact depth={depth + 1} />
            ) : null}
          </div>
        </details>
      ) : (
        <>
          {row}
          {failure ? <div className="launches-reference-step-branch">{failure}</div> : null}
        </>
      )}
    </li>
  );
}

function StepFailure({
  path,
  status,
  trace
}: {
  path: string;
  status: ScenarioStep["status"];
  trace: ResultTrace;
}) {
  const message = trace.message.trim();
  const stack = trace.stack.map((line) => line.trim()).filter(Boolean);

  const exception = stack.find((line) => /(?:Error|Exception|Failure)(?::|$)/i.test(line));
  return (
    <section
      aria-label={`Диагностика шага ${path}`}
      className={`launches-reference-step-failure is-${status}`}
    >
      <span className="launches-reference-step-failure-label">
        {status === "broken" ? "Сбой на шаге" : "Ошибка на шаге"}
      </span>
      {exception && exception !== message ? (
        <code className="launches-reference-step-exception">{exception}</code>
      ) : null}
      {message ? <p>{message}</p> : null}
      {stack.length > 0 ? (
        <details className="launches-reference-step-stack">
          <summary>
            Стек вызовов <ChevronRight aria-hidden="true" size={14} />
          </summary>
          <pre>{stack.join("\n")}</pre>
        </details>
      ) : null}
    </section>
  );
}

function collectTerminalFailurePaths(steps: ScenarioStep[], parentPath = ""): string[] {
  return steps.flatMap((step, index) => {
    const path = parentPath ? `${parentPath}.${index + 1}` : `${index + 1}`;
    const childFailures = collectTerminalFailurePaths(step.steps ?? [], path);
    return childFailures.length === 0 && (step.status === "failed" || step.status === "broken")
      ? [path]
      : childFailures;
  });
}
