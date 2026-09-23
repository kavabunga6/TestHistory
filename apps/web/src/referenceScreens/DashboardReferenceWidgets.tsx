import type {
  DashboardAggregateGroup,
  DashboardAggregateReadyWidget,
  DashboardAggregateTableRow,
  LaunchDashboardAggregateReadModel
} from "@testhistory/contracts";
import { AlertCircle, Pencil, Trash2 } from "lucide-react";

import { buildDonutGradient, emptyGroupRows, formatPercent } from "./DashboardReferenceVisuals.js";
import { formatResultCount } from "./DashboardReferenceFormatting.js";
import type { SavedDashboardWidget, WidgetKind } from "./DashboardReferenceModel.js";
import { statusLabels, widgetTypes } from "./DashboardReferenceModel.js";

type AggregateWidget = LaunchDashboardAggregateReadModel["widgets"][number];
type OpenResult = (id: string, launchId: string) => void;

export function DashboardWidgetGrid({
  aggregate,
  onDelete,
  onEdit,
  onOpenResult,
  widgets
}: {
  aggregate: LaunchDashboardAggregateReadModel;
  onDelete: (widgetId: string) => void;
  onEdit: (widget: SavedDashboardWidget) => void;
  onOpenResult?: OpenResult | undefined;
  widgets: SavedDashboardWidget[];
}) {
  const aggregateById = new Map(aggregate.widgets.map((item) => [item.id, item]));
  return (
    <section className="dashboard-reference-widget-grid" aria-label="Виджеты дашборда">
      {widgets.map((widget) => (
        <DashboardWidgetCard
          key={widget.id}
          onDelete={() => onDelete(widget.id)}
          onEdit={() => onEdit(widget)}
          onOpenResult={onOpenResult}
          result={aggregateById.get(widget.id)}
          widget={widget}
        />
      ))}
    </section>
  );
}

function DashboardWidgetCard({
  onDelete,
  onEdit,
  onOpenResult,
  result,
  widget
}: {
  onDelete: () => void;
  onEdit: () => void;
  onOpenResult?: OpenResult | undefined;
  result: AggregateWidget | undefined;
  widget: SavedDashboardWidget;
}) {
  const type = widgetTypes.find((item) => item.id === widget.kind) ?? widgetTypes[0]!;
  const Icon = type.icon;
  const ready = result?.status === "ready" ? result : undefined;

  return (
    <article
      className={`dashboard-reference-widget-card is-${widget.kind}${ready ? "" : " is-unavailable"}`}
    >
      <header>
        <span className="dashboard-reference-widget-icon">
          <Icon aria-hidden="true" size={18} />
        </span>
        <div>
          <strong>{widget.title}</strong>
          <small>
            {ready
              ? `${type.title} · ${formatResultCount(ready.filteredCount)} в выбранном запуске`
              : `${type.title} · требуется настройка`}
          </small>
        </div>
        <div className="dashboard-reference-widget-actions">
          <button
            aria-label={`Редактировать виджет ${widget.title}`}
            onClick={onEdit}
            type="button"
          >
            <Pencil aria-hidden="true" size={15} />
          </button>
          <button aria-label={`Удалить виджет ${widget.title}`} onClick={onDelete} type="button">
            <Trash2 aria-hidden="true" focusable="false" size={15} strokeWidth={2.2} />
          </button>
        </div>
      </header>

      {ready ? (
        <WidgetVisualization evaluation={ready} kind={widget.kind} onOpenResult={onOpenResult} />
      ) : (
        <div className="dashboard-reference-widget-unavailable" role="note">
          <AlertCircle aria-hidden="true" size={18} />
          <div>
            <strong>Виджет не может показать данные</strong>
            <p>
              {result?.status === "unsupported"
                ? result.reason
                : "Сервер не вернул данные для этого виджета."}
            </p>
            <button onClick={onEdit} type="button">
              Изменить запрос
            </button>
          </div>
        </div>
      )}

      <details className="dashboard-reference-widget-details">
        <summary>THQL и параметры</summary>
        <dl>
          <div>
            <dt>Сущность</dt>
            <dd>{widget.entity}</dd>
          </div>
          <div>
            <dt>Метрика</dt>
            <dd>{widget.metric}</dd>
          </div>
          <div>
            <dt>Группировка</dt>
            <dd>{widget.groupBy}</dd>
          </div>
          <div>
            <dt>Область</dt>
            <dd>Выбранный запуск</dd>
          </div>
        </dl>
        <code>{widget.thql}</code>
      </details>
    </article>
  );
}

function WidgetVisualization({
  evaluation,
  kind,
  onOpenResult
}: {
  evaluation: DashboardAggregateReadyWidget;
  kind: WidgetKind;
  onOpenResult?: OpenResult | undefined;
}) {
  if (kind === "metric") {
    return <MetricWidget evaluation={evaluation} />;
  }
  if (kind === "bar") {
    return <BarWidget evaluation={evaluation} />;
  }
  if (kind === "donut") {
    return <DonutWidget evaluation={evaluation} />;
  }
  if (kind === "line") {
    return <LineWidget groups={evaluation.groups} />;
  }
  return <TableWidget onOpenResult={onOpenResult} rows={evaluation.tableRows} />;
}

function MetricWidget({ evaluation }: { evaluation: DashboardAggregateReadyWidget }) {
  let description = "результатов по условиям THQL";
  if (evaluation.metricKind === "passRate") {
    description = `Успешных результатов: ${evaluation.passedCount.toLocaleString("ru-RU")}`;
  } else if (evaluation.metricKind === "averageDuration") {
    description = "средняя продолжительность результатов";
  }

  return (
    <div className="dashboard-reference-metric-widget">
      <strong>{evaluation.value}</strong>
      <span>{description}</span>
      <div className="dashboard-reference-metric-strip">
        <span className="is-passed">Успешность {formatPercent(evaluation.passRate)}</span>
        <span>Среднее {evaluation.averageDuration}</span>
        {evaluation.retryCount !== null ? <span>Ретраи {evaluation.retryCount}</span> : null}
      </div>
    </div>
  );
}

function BarWidget({ evaluation }: { evaluation: DashboardAggregateReadyWidget }) {
  const groups = evaluation.groups.length > 0 ? evaluation.groups : emptyGroupRows();

  return (
    <div className="dashboard-reference-widget-visual">
      <div className="dashboard-reference-bar-widget">
        {groups.map((group) => (
          <div className="dashboard-reference-bar-row" key={group.key}>
            <span title={group.label}>{group.label}</span>
            <div>
              <i
                className={group.status ? `is-${group.status}` : undefined}
                style={{ width: `${Math.max(group.percent, group.value > 0 ? 3 : 0)}%` }}
              />
            </div>
            <strong>{group.value.toLocaleString("ru-RU")}</strong>
          </div>
        ))}
      </div>
      <GroupLimitNote evaluation={evaluation} />
    </div>
  );
}

function DonutWidget({ evaluation }: { evaluation: DashboardAggregateReadyWidget }) {
  const segments = evaluation.groups.length > 0 ? evaluation.groups : emptyGroupRows();
  const gradient = buildDonutGradient(segments);
  const groupedCount = evaluation.groups.reduce((sum, group) => sum + group.value, 0);

  return (
    <div className="dashboard-reference-widget-visual">
      <div className="dashboard-reference-donut-widget">
        <div className="dashboard-reference-donut" style={{ background: gradient }}>
          <strong>{groupedCount.toLocaleString("ru-RU")}</strong>
          <span>в группах</span>
        </div>
        <div className="dashboard-reference-donut-legend">
          {segments.map((group) => (
            <span key={group.key}>
              <i className={group.status ? `is-${group.status}` : undefined} />
              {group.label} {group.value.toLocaleString("ru-RU")}
            </span>
          ))}
        </div>
      </div>
      <GroupLimitNote evaluation={evaluation} />
    </div>
  );
}

function GroupLimitNote({ evaluation }: { evaluation: DashboardAggregateReadyWidget }) {
  return evaluation.groupsTruncated ? (
    <small className="dashboard-reference-group-limit">
      {evaluation.groups.some((group) => group.key === "__remaining_groups__")
        ? `Показаны крупнейшие группы, остальные объединены · всего ${evaluation.groupCount}`
        : `Показаны ${evaluation.groups.length} из ${evaluation.groupCount} групп`}
    </small>
  ) : null;
}

function LineWidget({ groups }: { groups: DashboardAggregateGroup[] }) {
  const values = groups.length > 0 ? groups : emptyGroupRows();
  const maxValue = Math.max(...values.map((item) => item.value), 1);
  const points = values
    .map((item, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
      const y = 88 - (item.value / maxValue) * 74;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="dashboard-reference-line-widget">
      <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100">
        <polyline points={points} />
        {values.map((item, index) => {
          const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
          const y = 88 - (item.value / maxValue) * 74;
          return <circle cx={x} cy={y} key={item.key} r="2.8" />;
        })}
      </svg>
      <div>
        {values.map((item) => (
          <span key={item.key}>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function TableWidget({
  onOpenResult,
  rows
}: {
  onOpenResult?: OpenResult | undefined;
  rows: DashboardAggregateTableRow[];
}) {
  return (
    <div className="dashboard-reference-table-widget">
      <table>
        <thead>
          <tr>
            <th>Статус</th>
            <th>Тест</th>
            <th>Длит.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((result) => (
            <tr key={result.uuid}>
              <td>
                <span className={`dashboard-reference-status is-${result.status}`}>
                  {result.status === "unknown" ? "Неизвестен" : statusLabels[result.status]}
                </span>
              </td>
              <td>
                {onOpenResult ? (
                  <button
                    className="dashboard-reference-result-link"
                    onClick={() => onOpenResult(result.uuid, result.launchId)}
                    title={`Открыть результат ${result.uuid}`}
                    type="button"
                  >
                    {result.name}
                  </button>
                ) : (
                  result.name
                )}
              </td>
              <td>{result.duration}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3}>Нет результатов по THQL</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
