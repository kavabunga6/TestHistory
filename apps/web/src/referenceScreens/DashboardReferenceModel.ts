import { BarChart3, Gauge, LineChart, PieChart, Table2, type LucideIcon } from "lucide-react";

import type { ResultStatus } from "../m1Workspace.js";

export type WidgetKind = "metric" | "bar" | "line" | "donut" | "table";
export type MetricKind = "count" | "passRate" | "averageDuration" | "retryCount";

export type WidgetTypeOption = {
  id: WidgetKind;
  title: string;
  description: string;
  defaultMetric: MetricKind;
  thqlTemplate: string;
  icon: LucideIcon;
};

export type WidgetDraft = {
  title: string;
  entity: string;
  metric: string;
  groupBy: string;
  thql: string;
};

export type SavedDashboardWidget = WidgetDraft & {
  id: string;
  kind: WidgetKind;
};

export const dashboardWidgetStorageKey = "testhistory.dashboard.widgets.v1";
export const statusLabels: Record<ResultStatus, string> = {
  broken: "Сломан",
  failed: "Провален",
  muted: "Карантин",
  passed: "Успешный",
  skipped: "Пропущен"
};

export const widgetTypes: WidgetTypeOption[] = [
  {
    id: "metric",
    title: "Число",
    description: "Один показатель: количество, процент, средняя длительность или SLA.",
    defaultMetric: "count",
    thqlTemplate: "from results where muted = false measure count()",
    icon: Gauge
  },
  {
    id: "bar",
    title: "Столбцы",
    description: "Сравнение статусов, тегов, веток, компонентов или кастомных полей.",
    defaultMetric: "count",
    thqlTemplate: "from results where muted = false group by status measure count()",
    icon: BarChart3
  },
  {
    id: "line",
    title: "Линия",
    description: "Динамика во времени: стабильность, падения, длительность, flaky.",
    defaultMetric: "passRate",
    thqlTemplate: "from results where muted = false group by date(startedAt) measure passRate()",
    icon: LineChart
  },
  {
    id: "donut",
    title: "Кольцо",
    description: "Доля статусов, приоритетов, владельцев или источников дефектов.",
    defaultMetric: "count",
    thqlTemplate: "from results where muted = false group by status measure count()",
    icon: PieChart
  },
  {
    id: "table",
    title: "Таблица",
    description: "Список проблемных тестов, дефектов, запусков или групп аналитики.",
    defaultMetric: "count",
    thqlTemplate: "from results where muted = false order by status desc limit 20",
    icon: Table2
  }
];

export const emptyDraft: WidgetDraft = {
  entity: "Результаты тестов",
  groupBy: "status",
  metric: "Количество",
  thql: "",
  title: ""
};

export const defaultDashboardWidgets: SavedDashboardWidget[] = [
  {
    entity: "Результаты тестов",
    groupBy: "status",
    id: "dashboard-default-pass-rate",
    kind: "metric",
    metric: "Успешность",
    thql: "from results where muted = false measure passRate()",
    title: "Успешность запуска"
  },
  {
    entity: "Результаты тестов",
    groupBy: "status",
    id: "dashboard-default-statuses",
    kind: "bar",
    metric: "Количество",
    thql: "from results where muted = false group by status measure count()",
    title: "Распределение статусов"
  },
  {
    entity: "Результаты тестов",
    groupBy: "suite",
    id: "dashboard-default-slow-tests",
    kind: "table",
    metric: "Длительность",
    thql: "from results where muted = false order by duration desc limit 5",
    title: "Самые долгие тесты"
  }
];
