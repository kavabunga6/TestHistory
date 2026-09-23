import { project, launch, results, statusLabels, statusOrder } from "./ui-api-fixture-data.mjs";

function createAnalyticsItem(item) {
  return {
    uuid: item.uuid,
    launchId: launch.id,
    projectId: project.id,
    name: item.name,
    fullName: item.fullName,
    historyId: item.historyId,
    testCaseId: item.testCaseId,
    status: item.status,
    durationMs: item.durationMs,
    owner: item.labels.owner[0],
    severity: item.labels.severity[0],
    layer: item.labels.layer[0],
    tags: item.labels.tag,
    issues: item.labels.issue ?? [],
    testKeys: [item.testCaseId],
    muted: false,
    flaky: false,
    flakyKnown: true,
    history: [item.status]
  };
}

function createDashboardWidget(widget) {
  if (
    widget.kind === "line" ||
    /\b(?:retry|retries)\b|ретра/i.test(`${widget.metric} ${widget.thql}`)
  ) {
    return {
      id: widget.id,
      status: "unsupported",
      reason: "Для этого виджета нужны данные истории."
    };
  }
  const source = `${widget.metric} ${widget.thql}`;
  const metricKind = /passrate|доля успеш|успеш/i.test(source)
    ? "passRate"
    : /average|avg|средн/i.test(source)
      ? "averageDuration"
      : "count";
  const matched = filterDashboardResults(widget.thql);
  const passedCount = matched.filter((item) => item.status === "passed").length;
  const passRate = matched.length === 0 ? 0 : (passedCount / matched.length) * 100;
  const averageDurationMs =
    matched.length === 0
      ? null
      : matched.reduce((sum, item) => sum + item.durationMs, 0) / matched.length;
  const averageDuration = formatDurationSeconds((averageDurationMs ?? 0) / 1_000);
  const groupBy =
    widget.thql.match(/\bgroup\s+by\s+([a-zA-Z0-9_.]+)/i)?.[1] ?? widget.groupBy ?? "status";
  const allGroups =
    widget.kind === "bar" || widget.kind === "donut"
      ? groupDashboardResults(matched, groupBy.toLowerCase())
      : [];
  const groups = allGroups.slice(0, 30);
  const rawLimit = Number(widget.thql.match(/\blimit\s+(\d+)/i)?.[1] ?? 20);
  const tableLimit = Math.max(1, Math.min(20, rawLimit));
  const tableItems = /\border\s+by\s+duration\s+desc/i.test(widget.thql)
    ? matched.slice().sort((left, right) => right.durationMs - left.durationMs)
    : matched;
  return {
    id: widget.id,
    status: "ready",
    filteredCount: matched.length,
    passedCount,
    passRate,
    averageDurationMs,
    averageDuration,
    retryCount: null,
    metricKind,
    value:
      metricKind === "passRate"
        ? `${passRate.toFixed(passRate >= 10 ? 1 : 2)}%`
        : metricKind === "averageDuration"
          ? averageDuration
          : String(matched.length),
    groupCount: allGroups.length,
    groupsTruncated: allGroups.length > groups.length,
    groups,
    tableRows:
      widget.kind === "table"
        ? tableItems.slice(0, tableLimit).map((item) => ({
            id: item.uuid,
            uuid: item.uuid,
            launchId: launch.id,
            name: item.name,
            status: item.status,
            duration: formatDuration(item.durationMs),
            durationMs: item.durationMs
          }))
        : []
  };
}

function filterDashboardResults(thql) {
  if (/\bmuted\s*=\s*true/i.test(thql)) return [];
  const status = thql.match(
    /\bstatus\s*(?::|=)\s*['"]?(failed|broken|passed|skipped|unknown)/i
  )?.[1];
  const layer = thql.match(/\blayer\s*(?::|=)\s*['"]?([a-z0-9]+)/i)?.[1];
  return results.filter(
    (item) =>
      (status === undefined || item.status === status.toLowerCase()) &&
      (layer === undefined || item.labels.layer[0].toLowerCase() === layer.toLowerCase())
  );
}

function groupDashboardResults(items, groupBy) {
  const counts = new Map();
  for (const item of items) {
    const keys =
      groupBy === "status"
        ? [item.status]
        : groupBy === "owner"
          ? item.labels.owner
          : groupBy === "layer"
            ? item.labels.layer
            : groupBy === "severity"
              ? item.labels.severity
              : groupBy === "tag" || groupBy === "tags"
                ? item.labels.tag
                : groupBy === "suite"
                  ? [item.fullName]
                  : ["Все"];
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const max = Math.max(1, ...counts.values());
  return [...counts]
    .map(([key, value]) => ({
      key,
      label: statusLabels[key] ?? key,
      value,
      percent: (value / max) * 100,
      ...(statusLabels[key] === undefined ? {} : { status: key })
    }))
    .sort((left, right) => {
      const leftIndex = statusOrder.indexOf(left.key);
      const rightIndex = statusOrder.indexOf(right.key);
      if (leftIndex >= 0 || rightIndex >= 0) {
        return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
      }
      return right.value - left.value || left.label.localeCompare(right.label);
    });
}

function formatDuration(durationMs) {
  return durationMs < 1_000 ? `${durationMs}ms` : `${(durationMs / 1_000).toFixed(2)}s`;
}

function formatDurationSeconds(seconds) {
  if (seconds === 0) return "0s";
  if (seconds < 1) return `${Math.round(seconds * 1_000)}ms`;
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  return `${Math.round(seconds / 60)}m`;
}

export { createAnalyticsItem, createDashboardWidget };
