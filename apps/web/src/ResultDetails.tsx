import { Bug, ChevronRight, Clock3, Layers3, Paperclip } from "lucide-react";

import type { ApiState } from "./api.js";
import type { ScenarioStep, TestResult } from "./m1Workspace.js";
import { AttachmentList } from "./AttachmentList.js";
import { EmptyState, StatusIcon } from "./workspaceCommon.js";
import { statusLabels } from "./workspaceRouting.js";
export function ResultTabContent({
  apiState = { loading: false },
  result,
  tab
}: {
  apiState?: ApiState;
  result: TestResult;
  tab: string;
}) {
  if (tab === "Трейс") {
    return <ResultTraceDetails result={result} />;
  }

  if (tab === "Шаги") {
    return <StepList steps={result.steps} />;
  }

  if (tab === "Вложения") {
    return <AttachmentList apiState={apiState} attachments={result.attachments ?? []} />;
  }

  if (tab === "Параметры") {
    return <ParameterList result={result} />;
  }

  if (tab === "Метки и ссылки") {
    return <LabelsLinksDetails result={result} />;
  }

  if (tab === "Сырые данные") {
    return (
      <section className="detail-section">
        <h3>Сырые данные</h3>
        <p>Allure-совместимые метаданные показаны с маскированием чувствительных значений.</p>
        <pre className="raw-block">{JSON.stringify(toResultRaw(result), null, 2)}</pre>
      </section>
    );
  }

  if (tab === "История") {
    return <ResultHistory result={result} />;
  }

  return <ResultOverview result={result} />;
}

function ResultOverview({ result }: { result: TestResult }) {
  return (
    <>
      <section className="detail-section">
        <h3>{result.status === "passed" ? "Выполнение" : "Ошибка"}</h3>
        {result.status === "passed" ? (
          <div className="status-box passed">
            <strong>Результат завершен успешно</strong>
            <span>{result.name}</span>
          </div>
        ) : (
          <div className="failure-box">
            <strong>{getResultFailureSummary(result)}</strong>
            <code>{getResultFailureTrace(result)}</code>
          </div>
        )}
      </section>
      <section className="detail-section">
        <h3>Описание</h3>
        {result.description ? (
          <p>{result.description}</p>
        ) : (
          <EmptyState
            title="Описание отсутствует"
            copy="В этом Allure-результате нет поля description."
          />
        )}
      </section>
      <MetaRail result={result} />
    </>
  );
}

function ResultTraceDetails({ result }: { result: TestResult }) {
  const trace = getResultTrace(result);

  return (
    <section className="detail-section">
      <h3>Трейс</h3>
      {trace === undefined ? (
        <EmptyState
          title="Трейс не сохранен"
          copy="Выбранный результат завершился без statusDetails.trace и без производного стека ошибки."
        />
      ) : (
        <div className="trace-block">
          <strong>{trace.message}</strong>
          <pre>{trace.stack.length > 0 ? trace.stack.join("\n") : "Стек не передан."}</pre>
        </div>
      )}
    </section>
  );
}

function getResultTrace(result: TestResult): TestResult["trace"] {
  if (result.trace !== undefined) {
    return result.trace;
  }

  if (result.status === "passed") {
    return undefined;
  }

  return {
    message: getResultFailureSummary(result),
    stack: [getResultFailureTrace(result)]
  };
}

function getResultFailureSummary(result: TestResult): string {
  if (result.status === "broken") {
    return "Сценарий прерван runtime-ошибкой";
  }
  if (result.status === "skipped") {
    return "Сценарий пропущен до завершения";
  }
  return "AssertionError: ожидалось, что меню пользователя будет видно";
}

function getResultFailureTrace(result: TestResult): string {
  if (result.status === "broken") {
    return `${result.suite}.${result.name}: runtime упал до достижения ожидаемого результата`;
  }
  if (result.status === "skipped") {
    return `${result.suite}.${result.name}: пропущен политикой запуска или состоянием зависимости`;
  }
  return "SignInPage.assertAuthenticated: ожидалось, что locator('[data-testid=user-menu]') будет видимым";
}

export function TestCaseOverview({ result }: { result: TestResult }) {
  return (
    <section className="case-overview">
      <div className="overview-main">
        <section className="detail-section">
          <h3>Связи</h3>
          <div className="link-chips">
            {result.links.map((link) => (
              <span key={link}>{link}</span>
            ))}
          </div>
        </section>
        <section className="detail-section">
          <h3>Описание</h3>
          <p>
            Проверяет, что пользователь может войти с корректными учетными данными, открыть рабочую
            область приложения и увидеть меню аккаунта без повторного восстановления.
          </p>
        </section>
        <section className="detail-section">
          <h3>Предусловия</h3>
          <p>
            Пользователь существует в staging, аккаунт активен, feature flags для checkout включены.
          </p>
        </section>
        <section className="detail-section">
          <h3>Ожидаемый результат</h3>
          <p>Пользователь попадает в рабочую область, меню аккаунта видно в течение 2 секунд.</p>
        </section>
      </div>
      <AttributeRail result={result} compact />
    </section>
  );
}

function ParameterList({ result }: { result: TestResult }) {
  const parameters = result.parameters ?? [];

  return (
    <section className="detail-section">
      <h3>Параметры</h3>
      {parameters.length === 0 ? (
        <EmptyState
          title="Параметры не сохранены"
          copy="В этом результате нет Allure-параметров или измерений окружения."
        />
      ) : (
        <div className="parameter-list">
          {parameters.map((parameter) => (
            <article key={parameter.name}>
              <span>{parameter.name}</span>
              <strong>{maskParameterValue(parameter)}</strong>
              <small>
                {parameter.masked ? "замаскировано" : "видимо"}
                {parameter.excluded ? " / исключено из идентичности истории" : ""}
              </small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function LabelsLinksDetails({ result }: { result: TestResult }) {
  return (
    <section className="detail-section">
      <h3>Метки и ссылки</h3>
      <div className="label-link-grid">
        <ValueGroup label="Теги" values={result.tags} />
        <ValueGroup label="Ссылки" values={result.links} />
        <ValueGroup label="Задачи" values={result.issues} />
        <ValueGroup label="Тестовые ключи" values={result.testKeys} />
        <ValueGroup label="Участники" values={result.members} />
        <ValueGroup
          label="Пользовательские поля"
          values={result.customFields.map((field) => `${field.label}: ${field.value}`)}
        />
      </div>
    </section>
  );
}

export function ValueGroup({ label, values }: { label: string; values: string[] }) {
  const hasValues = values.length > 0;

  return (
    <section className={`value-group ${hasValues ? "" : "is-empty"}`}>
      <h4>{label}</h4>
      {hasValues ? (
        <div>
          {values.map((value) => (
            <span key={value}>{value}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ResultHistory({ result }: { result: TestResult }) {
  return (
    <section className="detail-section">
      <h3>История</h3>
      <div className="history-timeline">
        {result.history.map((status, index) => (
          <div className="history-point" key={`${result.id}-${status}-${index}`}>
            <StatusIcon status={status} />
            <span>Запуск #{1285 + index}</span>
            <small>
              {statusLabels[status]} /{" "}
              {index === result.history.length - 1 ? result.duration : "1.12s"}
            </small>
          </div>
        ))}
      </div>
    </section>
  );
}

function toResultRaw(result: TestResult) {
  return {
    uuid: result.id,
    historyId: `${result.suite}#${result.name}`,
    testCaseId: result.allureId,
    fullName: `${result.suite}.${result.name}`,
    status: result.status,
    labels: [
      { name: "owner", value: result.owner },
      { name: "severity", value: result.severity },
      { name: "layer", value: result.layer }
    ],
    links: result.links,
    parameters: (result.parameters ?? []).map((parameter) => ({
      name: parameter.name,
      value: maskParameterValue(parameter),
      excluded: parameter.excluded === true
    })),
    attachments: (result.attachments ?? []).map((attachment) => ({
      name: attachment.name,
      type: attachment.mediaType,
      artifactRef: attachment.preview?.artifactId ?? "artifact-source-redacted",
      size: attachment.size,
      retained: attachment.retained,
      preview: attachment.preview
        ? {
            support: attachment.preview.support,
            status: attachment.preview.status,
            reason: attachment.preview.reason,
            bounded: attachment.preview.safety.bounded,
            rawPayloadIncluded: attachment.preview.safety.rawPayloadIncluded,
            pathIncluded: attachment.preview.safety.pathIncluded,
            storageKeyIncluded: attachment.preview.safety.storageKeyIncluded,
            signedUrlIncluded: attachment.preview.safety.signedUrlIncluded
          }
        : "metadata unavailable"
    })),
    statusDetails: getResultTrace(result),
    steps: result.steps.map((step) => ({
      name: step.name,
      status: step.status,
      duration: step.duration
    }))
  };
}

function maskParameterValue(parameter: NonNullable<TestResult["parameters"]>[number]): string {
  if (parameter.masked === true || /password|secret|token|key/i.test(parameter.name)) {
    return "[redacted]";
  }

  return parameter.value;
}

export function StepList({ steps }: { steps: ScenarioStep[] }) {
  return (
    <section className="detail-section">
      <h3>Сценарий</h3>
      {steps.length === 0 ? (
        <EmptyState title="Шаги не сохранены" copy="В этом результате нет дерева шагов Allure." />
      ) : (
        <div className="steps">
          {steps.map((step, index) => (
            <div className="step" key={`${step.name}-${index}`}>
              <ChevronRight size={15} />
              <span>{index + 1}</span>
              <StatusIcon status={step.status} />
              <strong>{step.name}</strong>
              <small>{step.duration}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MetaRail({ result }: { result: TestResult }) {
  return (
    <section className="meta-grid">
      <article>
        <Clock3 size={16} />
        <span>Длительность</span>
        <strong>{result.duration}</strong>
      </article>
      <article>
        <Bug size={16} />
        <span>Дефект</span>
        <strong>{result.defect ?? "Нет дефекта"}</strong>
      </article>
      <article>
        <Layers3 size={16} />
        <span>Слой</span>
        <strong>{result.layer}</strong>
      </article>
      <article>
        <Paperclip size={16} />
        <span>Теги</span>
        <strong>{result.tags.join(", ")}</strong>
      </article>
    </section>
  );
}

function AttributeRail({ result, compact = false }: { result: TestResult; compact?: boolean }) {
  return (
    <section className={`detail-section attribute-rail ${compact ? "compact" : ""}`}>
      <h3>Сводка</h3>
      <div className="attribute-list">
        <AttributeGroup label="Статус" values={[statusLabels[result.status]]} />
        <AttributeGroup label="Длительность" values={[result.duration]} />
        <AttributeGroup label="Слой" values={[result.layer]} />
        <AttributeGroup label="Владелец" values={[result.owner]} />
        <AttributeGroup label="Серьезность" values={[result.severity]} />
        <AttributeGroup label="Карантин" values={result.muted ? ["В карантине"] : []} />
      </div>
      <div className="attribute-list">
        <AttributeGroup label="Теги" values={result.tags} />
        <AttributeGroup label="Задачи" values={result.issues} />
        <AttributeGroup label="Тестовые ключи" values={result.testKeys} />
        <AttributeGroup label="Участники" values={result.members} />
        <AttributeGroup
          label="Пользовательские поля"
          values={result.customFields.map((field) => `${field.label}: ${field.value}`)}
        />
      </div>
    </section>
  );
}

function AttributeGroup({ label, values }: { label: string; values: string[] }) {
  const hasValues = values.length > 0;

  return (
    <section className={`attribute-group ${hasValues ? "" : "is-empty"}`}>
      <h3>{label}</h3>
      {hasValues ? (
        <div>
          {values.map((value) => (
            <span key={value}>{value}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
