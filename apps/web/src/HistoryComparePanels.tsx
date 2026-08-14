import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  GitBranch,
  ShieldCheck
} from "lucide-react";

import type { ApiState } from "./api.js";
import type {
  TestCaseHistoryCompareAvailability,
  TestCaseHistoryCompareChange,
  TestCaseHistoryComparePage,
  TestCaseHistoryComparePermissionAudit,
  TestCaseHistoryCompareScope,
  TestCaseHistoryCompareValue,
  TestResult
} from "./m1Workspace.js";
import {
  EmptyState,
  formatListCount,
  ListReadinessPanel,
  ReadOnlyAction,
  StatusBadge
} from "./workspaceCommon.js";
import { formatAuditDate } from "./workspaceDate.js";
import {
  HistoryComparePermissionAuditInvariantPanel,
  HistoryComparePermissionAuditPanel
} from "./HistoryCompareAudit.js";
export function TestCaseHistoryCompare({
  apiState,
  result
}: {
  apiState: ApiState;
  result: TestResult;
}) {
  const compare = result.historyCompare;
  const availability = getHistoryCompareAvailability(apiState, compare);
  const canRenderComparePage =
    compare !== undefined &&
    availability.state !== "denied" &&
    availability.state !== "loading" &&
    availability.state !== "error";
  const renderedChanges = compare?.changes.slice(0, compare.limit) ?? [];

  return (
    <section
      className="detail-section history-compare"
      aria-label="Selected test case history compare"
    >
      <div className="history-compare-title">
        <div>
          <h3>Сравнение истории</h3>
          <p>Постраничный diff истории выбранного тест-кейса.</p>
        </div>
        <ReadOnlyAction icon={<GitBranch size={16} />} label="Сравнение из read model" />
      </div>
      <HistoryCompareStateNotice apiState={apiState} availability={availability} />
      {!canRenderComparePage ? (
        <HistoryCompareUnavailableState
          audit={compare?.permissionAudit}
          availability={availability}
          scope={compare?.scope}
          showScope={availability.state === "denied"}
        />
      ) : (
        <>
          <HistoryComparePoints compare={compare} />
          <HistoryCompareScopePanel scope={compare.scope} />
          <HistoryComparePermissionAuditPanel audit={compare.permissionAudit} />
          <HistoryComparePermissionAuditInvariantPanel
            invariant={compare.permissionAuditInvariant}
            loading={apiState.loading && compare.permissionAuditInvariant === undefined}
          />
          {availability.state === "partial" ? (
            <HistoryComparePartialPanel availability={availability} scope={compare.scope} />
          ) : null}
          <ListReadinessPanel
            rendered={renderedChanges.length}
            scope="History compare changes"
            states={{
              filter: "ready",
              pagination: "ready",
              search: "ready",
              sort: "ready"
            }}
            total={compare.total}
          />
          {renderedChanges.length === 0 ? (
            <EmptyState
              title="Между сравниваемыми запусками нет изменений"
              copy="Статус, длительность, повторы, нестабильность, параметры и детали статуса не изменились."
            />
          ) : (
            <div className="history-compare-list">
              {renderedChanges.map((change) => (
                <HistoryCompareChangeRow change={change} key={change.id} />
              ))}
            </div>
          )}
          <div className="history-compare-footer">
            <span>{formatComparePageRange(compare, renderedChanges.length)}</span>
            {compare.hasMore ? (
              <ReadOnlyAction icon={<ChevronDown size={16} />} label="Следующая страница в API" />
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function getHistoryCompareAvailability(
  apiState: ApiState,
  compare: TestCaseHistoryComparePage | undefined
): TestCaseHistoryCompareAvailability {
  if (compare?.availability !== undefined) {
    return compare.availability;
  }

  if (compare === undefined) {
    if (apiState.loading) {
      return {
        state: "loading",
        title: "Сравнение истории загружается",
        message: "Ждем данные сравнения с учетом прав доступа, выбранный кейс остается видимым."
      };
    }

    if (apiState.error !== undefined) {
      return {
        state: "error",
        title: "Сравнение истории недоступно",
        message:
          "Строки сравнения недоступны, потому что API не вернул страницу сравнения для выбранного кейса."
      };
    }

    return {
      state: "empty",
      title: "Записей сравнения пока нет",
      message: "В текущей read-модели для выбранного кейса нет постраничного ответа сравнения."
    };
  }

  if (compare.total === 0 && compare.changes.length === 0) {
    return {
      state: "empty",
      title: "Между сравниваемыми запусками нет изменений",
      message:
        "Статус, длительность, повторы, нестабильность, параметры и детали статуса не изменились."
    };
  }

  return { state: "ready" };
}

function HistoryCompareStateNotice({
  apiState,
  availability
}: {
  apiState: ApiState;
  availability: TestCaseHistoryCompareAvailability;
}) {
  if (availability.state === "denied") {
    return (
      <section className="surface-state denied" aria-label="history compare denied state">
        <ShieldCheck size={17} />
        <span>
          <strong>
            {localizeHistoryCompareTitle(availability.title, "Доступ к сравнению истории запрещен")}
          </strong>
          <small>{safeCompareAvailabilityMessage(availability)}</small>
        </span>
      </section>
    );
  }

  if (availability.state === "loading" || apiState.loading) {
    return (
      <section className="surface-state loading" aria-label="history compare loading state">
        <Clock3 size={17} />
        <span>
          <strong>
            {localizeHistoryCompareTitle(availability.title, "Сравнение истории загружается")}
          </strong>
          <small>{safeCompareAvailabilityMessage(availability)}</small>
        </span>
      </section>
    );
  }

  if (availability.state === "error" || apiState.error !== undefined) {
    const offline = apiState.error?.toLowerCase().includes("fetch") ?? false;

    return (
      <section className="surface-state offline" aria-label="history compare offline state">
        <AlertTriangle size={17} />
        <span>
          <strong>
            {apiState.error !== undefined
              ? offline
                ? "API недоступен"
                : "Ошибка API"
              : localizeHistoryCompareTitle(availability.title, "Сравнение истории недоступно")}
          </strong>
          <small>{safeCompareAvailabilityMessage(availability)}</small>
        </span>
      </section>
    );
  }

  if (availability.state === "partial") {
    return (
      <section className="surface-state partial" aria-label="history compare partial state">
        <AlertTriangle size={17} />
        <span>
          <strong>
            {localizeHistoryCompareTitle(availability.title, "Сравнение истории частично доступно")}
          </strong>
          <small>{safeCompareAvailabilityMessage(availability)}</small>
        </span>
      </section>
    );
  }

  return (
    <section className="surface-state ready" aria-label="history compare ready state">
      <CheckCircle2 size={17} />
      <span>
        <strong>Сравнение истории готово</strong>
        <small>Данные сравнения показаны из read-модели выбранного кейса.</small>
      </span>
    </section>
  );
}

function HistoryCompareUnavailableState({
  audit,
  availability,
  scope,
  showScope
}: {
  audit: TestCaseHistoryComparePermissionAudit | undefined;
  availability: TestCaseHistoryCompareAvailability;
  scope: TestCaseHistoryCompareScope | undefined;
  showScope: boolean;
}) {
  return (
    <div className="history-compare-unavailable">
      {showScope ? <HistoryCompareScopePanel scope={scope} /> : null}
      {showScope ? <HistoryComparePermissionAuditPanel audit={audit} /> : null}
      <EmptyState
        title={
          availability.title !== undefined
            ? localizeHistoryCompareTitle(availability.title, availability.title)
            : historyCompareFallbackTitle(availability.state)
        }
        copy={safeCompareAvailabilityMessage(availability)}
      />
      {availability.reason !== undefined && !containsSensitiveCompareText(availability.reason) ? (
        <small>Причина: {availability.reason}</small>
      ) : null}
    </div>
  );
}

function HistoryComparePartialPanel({
  availability,
  scope
}: {
  availability: TestCaseHistoryCompareAvailability;
  scope: TestCaseHistoryCompareScope | undefined;
}) {
  const unavailable = availability.unavailable?.filter(
    (item) => !containsSensitiveCompareText(item)
  );
  const fields =
    unavailable !== undefined && unavailable.length > 0 ? unavailable : ["restricted fields"];
  const redactedFields = scope?.redactionApplied === true ? scope.redactedFields : [];

  return (
    <div className="history-compare-partial" aria-label="Partial history compare data">
      <AlertTriangle size={16} />
      <span>
        <strong>Часть данных недоступна</strong>
        <small>{safeCompareAvailabilityMessage(availability)}</small>
      </span>
      <div>
        {fields.map((field) => (
          <code className="redacted" key={field}>
            {field}
          </code>
        ))}
        {redactedFields.map((field) => (
          <code className="redacted" key={`redacted-${field}`}>
            redacted: {field}
          </code>
        ))}
      </div>
    </div>
  );
}

function safeCompareAvailabilityMessage(availability: TestCaseHistoryCompareAvailability): string {
  const message = availability.message?.trim();

  if (message !== undefined && message.length > 0 && !containsSensitiveCompareText(message)) {
    return localizeHistoryCompareMessage(message);
  }

  if (availability.state === "denied") {
    return "У этого автора или проекта нет доступа к расширенному сравнению истории.";
  }

  if (availability.state === "partial") {
    return "Часть полей сравнения недоступна или скрыта правами.";
  }

  if (availability.state === "loading") {
    return "Ждем данные сравнения с учетом прав доступа, выбранный кейс остается видимым.";
  }

  if (availability.state === "error") {
    return "Строки сравнения недоступны, потому что API не вернул страницу сравнения для выбранного кейса.";
  }

  if (availability.state === "empty") {
    return "В текущей read-модели для выбранного кейса нет постраничного ответа сравнения.";
  }

  return "Данные сравнения показаны из read-модели выбранного кейса.";
}

function localizeHistoryCompareTitle(title: string | undefined, fallback: string): string {
  if (title === undefined || title.trim().length === 0) {
    return fallback;
  }

  const knownTitles: Record<string, string> = {
    "History compare access denied": "Доступ к сравнению истории запрещен",
    "History compare partially available": "Сравнение истории частично доступно",
    "History compare unavailable": "Сравнение истории недоступно",
    "Loading history compare": "Сравнение истории загружается",
    "No changes between compared launches": "Между сравниваемыми запусками нет изменений",
    "No compare records yet": "Записей сравнения пока нет"
  };

  return knownTitles[title] ?? title;
}

function localizeHistoryCompareMessage(message: string): string {
  const knownMessages: Record<string, string> = {
    "This actor or project scope cannot read enriched history compare data.":
      "У этого автора или проекта нет доступа к расширенному сравнению истории.",
    "Some enriched compare fields are unavailable or hidden by permission.":
      "Часть полей сравнения недоступна или скрыта правами.",
    "Waiting for permission-scoped compare data while the selected case remains visible.":
      "Ждем данные сравнения с учетом прав доступа, выбранный кейс остается видимым.",
    "Compare rows are unavailable because the API did not return the selected-case compare page.":
      "Строки сравнения недоступны, потому что API не вернул страницу сравнения для выбранного кейса.",
    "The selected case has no paged compare response in the current read model.":
      "В текущей read-модели для выбранного кейса нет постраничного ответа сравнения.",
    "Status, duration, retry, flaky, parameters, and status details are unchanged.":
      "Статус, длительность, повторы, нестабильность, параметры и детали статуса не изменились."
  };

  return knownMessages[message] ?? message;
}

function historyCompareFallbackTitle(state: TestCaseHistoryCompareAvailability["state"]): string {
  if (state === "denied") {
    return "Доступ к сравнению истории запрещен";
  }
  if (state === "loading") {
    return "Сравнение истории загружается";
  }
  if (state === "error") {
    return "Сравнение истории недоступно";
  }
  if (state === "empty") {
    return "Записей сравнения пока нет";
  }
  if (state === "partial") {
    return "Часть данных сравнения недоступна";
  }

  return "Сравнение истории готово";
}

function containsSensitiveCompareText(value: string): boolean {
  return (
    /[A-Za-z]:\\|\\\\|\/Users\/|\/home\/|\/var\/|\/tmp\/|Downloads/i.test(value) ||
    /\b(authorization|bearer|password|secret|token|api[-_ ]?key|raw-sensitive|storage[-_ ]?key|storage[-_ ]?ref|signed[-_ ]?url)\b/i.test(
      value
    ) ||
    /https?:\/\/\S*(?:[?&](?:token|signature|x-amz-signature|sig|key|secret)=)/i.test(value) ||
    /(?:s3|gs|az|azure|minio|storage|blob):\/\//i.test(value)
  );
}

function formatComparePageRange(
  compare: TestCaseHistoryComparePage,
  renderedChanges: number
): string {
  if (compare.total === 0 || renderedChanges === 0) {
    return "На этой странице нет изменений";
  }

  return `Изменения ${formatListCount(compare.offset + 1)}-${formatListCount(
    compare.offset + renderedChanges
  )} из ${formatListCount(compare.total)}`;
}

function HistoryComparePoints({ compare }: { compare: TestCaseHistoryComparePage }) {
  return (
    <div className="history-compare-points" aria-label="Сравниваемые запуски">
      <HistoryComparePoint label="Предыдущий" point={compare.from} />
      <HistoryComparePoint label="Текущий" point={compare.to} />
    </div>
  );
}

function formatIdentityChangedAt(value: string): string {
  return formatAuditDate(value);
}

function HistoryComparePoint({
  label,
  point
}: {
  label: string;
  point: TestCaseHistoryComparePage["from"];
}) {
  return (
    <article>
      <span>{label}</span>
      <strong>{point.launchName}</strong>
      <small>{formatIdentityChangedAt(point.startedAt)}</small>
      <div>
        <StatusBadge status={point.status} />
        <span>{point.duration}</span>
        <span>{point.retry} повторов</span>
        <span>{point.flaky ? "нестабилен" : "стабилен"}</span>
        {point.branch !== undefined ? <span>{point.branch}</span> : null}
        {point.build !== undefined ? <span>{point.build}</span> : null}
        {point.executor !== undefined ? <span>{point.executor}</span> : null}
      </div>
    </article>
  );
}

function HistoryCompareScopePanel({ scope }: { scope: TestCaseHistoryCompareScope | undefined }) {
  const permissionText =
    scope?.permission === "denied"
      ? "Доступ запрещен"
      : scope?.permission === "redacted"
        ? "Чтение разрешено с редакцией"
        : "Чтение разрешено";
  const redactionText =
    scope?.redactionApplied === true
      ? `Редакция применена: ${scope.redactedFields.join(", ") || "скрытые значения"}`
      : "Редакция не применялась";

  return (
    <div className="history-compare-scope" aria-label="History compare permission scope">
      <article>
        <span>Автор сравнения</span>
        <strong>{formatCompareValue(scope?.actor ?? "system")}</strong>
      </article>
      <article>
        <span>Проект</span>
        <strong>{formatCompareValue(scope?.project ?? "Текущий проект")}</strong>
      </article>
      <article>
        <span>Права доступа</span>
        <strong>{permissionText}</strong>
      </article>
      <article>
        <span>Редакция</span>
        <strong>{redactionText}</strong>
      </article>
    </div>
  );
}

function HistoryCompareChangeRow({ change }: { change: TestCaseHistoryCompareChange }) {
  const before = getCompareDisplayValue(change.before);
  const after = getCompareDisplayValue(change.after);

  return (
    <article className={`impact-${change.impact}`}>
      <AlertTriangle size={16} />
      <span>
        <strong>{formatCompareChangeLabel(change.label)}</strong>
        <small>{formatCompareField(change.field)}</small>
      </span>
      <code className={before.className}>{before.text}</code>
      <ChevronRight size={15} />
      <code className={after.className}>{after.text}</code>
      <em>{formatCompareImpact(change.impact)}</em>
    </article>
  );
}

function formatCompareImpact(impact: TestCaseHistoryCompareChange["impact"]): string {
  if (impact === "high") {
    return "высокое влияние";
  }
  if (impact === "medium") {
    return "среднее влияние";
  }

  return "низкое влияние";
}

function formatCompareChangeLabel(label: string): string {
  const labels: Record<string, string> = {
    "Branch and build changed": "Изменились ветка и сборка",
    "Defect signature changed": "Изменилась сигнатура дефекта",
    "Duration changed": "Изменилась длительность",
    "Executor changed": "Изменился исполнитель",
    "Labels changed": "Изменились метки",
    "Parameters changed": "Изменились параметры",
    "Retry policy changed": "Изменилась политика повторов",
    "Status changed": "Изменился статус",
    "Status details changed": "Изменились детали статуса"
  };

  return labels[label] ?? label;
}

function formatCompareValue(value: TestCaseHistoryCompareValue): string {
  return getCompareDisplayValue(value).text;
}

function getCompareDisplayValue(value: TestCaseHistoryCompareValue): {
  text: string;
  className?: string;
} {
  if (typeof value === "string") {
    return { text: value };
  }

  if (value.state === "denied") {
    return { text: "Скрыто правами", className: "redacted" };
  }

  if (value.state === "redacted") {
    return { text: "[redacted]", className: "redacted" };
  }

  return { text: value.text ?? "Нет значения" };
}

function formatCompareField(field: TestCaseHistoryCompareChange["field"]): string {
  const labels: Record<TestCaseHistoryCompareChange["field"], string> = {
    branchBuild: "Ветка и сборка",
    defectSignature: "Сигнатура дефекта",
    duration: "Длительность",
    executor: "Исполнитель",
    flaky: "Признак нестабильности",
    labels: "Метки",
    parameters: "Параметры",
    retry: "Политика повторов",
    status: "Статус",
    statusDetails: "Детали статуса"
  };

  return labels[field];
}
