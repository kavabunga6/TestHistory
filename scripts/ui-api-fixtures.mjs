import {
  project,
  launch,
  historyPoint,
  result,
  resultDetails,
  results,
  testCase,
  testCases,
  defect,
  defects
} from "./ui-api-fixture-data.mjs";
import { createResultDetails } from "./ui-api-fixture-evidence.mjs";
import { createAnalyticsItem, createDashboardWidget } from "./ui-api-fixture-analytics.mjs";

export function createUiFixtureApiResponse(
  pathname,
  method = "GET",
  requestBody = null,
  search = ""
) {
  if (method === "POST" && pathname === `/api/v1/launches/${launch.id}/dashboard/aggregate`) {
    const widgets = JSON.parse(requestBody ?? "{}").widgets ?? [];
    return {
      kind: "launch-dashboard-aggregate",
      launchId: launch.id,
      projectId: project.id,
      totalResults: results.length,
      widgets: widgets.map(createDashboardWidget)
    };
  }
  if (method !== "GET") {
    return undefined;
  }
  if (pathname === "/api/v1/projects") {
    return [project];
  }
  if (pathname === `/api/v1/projects/${project.id}/settings/access`) {
    return {
      kind: "project-access-settings",
      project: { ...project, visibility: "private" },
      memberships: [
        {
          id: "admin",
          displayName: "Администратор",
          subject: "admin",
          email: "admin@example.test",
          role: "owner",
          source: "manual",
          status: "active",
          lastActiveAt: "2026-06-03T09:41:00.000Z"
        }
      ],
      apiTokens: [
        {
          id: "token-1",
          name: "Загрузка регрессии",
          prefix: "th_live_83f4",
          ownerSubject: "admin",
          status: "active",
          scopes: ["launches:write", "results:write"],
          createdAt: "2026-06-01T09:41:00.000Z",
          lastUsedAt: "2026-06-03T09:41:00.000Z",
          expiresAt: "2026-12-01T09:41:00.000Z"
        }
      ],
      visibilityPolicies: [],
      integrationProviders: [
        {
          id: "jira-defects",
          name: "Дефекты Jira",
          preset: "jira",
          enabled: true,
          encodeSuffix: true,
          baseUrl: "https://jira.example.test/browse/",
          source: { kind: "issue", matchMode: "all", name: "issue" },
          suffixTemplate: "{value}"
        }
      ],
      customFieldMappings: [
        { id: "owner", field: "owner", source: "label:owner", fallback: "unknown", required: true }
      ]
    };
  }
  if (pathname === `/api/v1/projects/${project.id}/settings/artifacts`) {
    return {
      kind: "project-artifact-settings",
      projectId: project.id,
      retention: {
        attachmentRetentionDays: 14,
        cleanupGraceDays: 3,
        compressRetainedTextArtifacts: true,
        deleteBinaryArtifactsAfterRetention: true,
        retentionPolicies: []
      },
      retentionPolicies: [
        {
          id: "screenshots",
          artifact: "Скриншоты",
          passedDays: 14,
          failedDays: 90,
          quarantinedDays: 120,
          maxSizeMb: 25
        }
      ]
    };
  }
  if (pathname === `/api/v1/projects/${project.id}/launches`) {
    return paged("launch-list", [launch], { projectId: project.id }, search);
  }
  if (pathname === `/api/v1/launches/${launch.id}/results/${result.uuid}`) {
    return resultDetails;
  }
  if (pathname === `/api/v1/launches/${launch.id}/results`) {
    return paged(
      "launch-result-list",
      results,
      {
        launchId: launch.id,
        projectId: project.id
      },
      search
    );
  }
  if (pathname.startsWith(`/api/v1/launches/${launch.id}/results/`)) {
    const resultId = decodeURIComponent(
      pathname.slice(`/api/v1/launches/${launch.id}/results/`.length)
    );
    const index = results.findIndex((item) => item.uuid === resultId);
    return index < 0 ? undefined : createResultDetails(results[index], index);
  }
  if (pathname === "/api/v1/analytics/results") {
    const query = new URLSearchParams(search).get("q")?.trim().toLowerCase() ?? "";
    const matched =
      query === ""
        ? results
        : results.filter((item) =>
            [
              item.name,
              item.fullName,
              item.uuid,
              item.status,
              ...item.labels.tag,
              ...item.labels.owner
            ]
              .join(" ")
              .toLowerCase()
              .includes(query)
          );
    const statusCounters = { failed: 0, broken: 0, passed: 0, skipped: 0, unknown: 0, muted: 0 };
    for (const item of matched) statusCounters[item.status] += 1;
    const averageDurationMs =
      matched.length === 0
        ? null
        : Math.round(matched.reduce((sum, item) => sum + item.durationMs, 0) / matched.length);
    const sortedByDuration = matched
      .slice()
      .sort((left, right) => right.durationMs - left.durationMs);
    const pageRead = paginate(matched.map(createAnalyticsItem), search);
    return {
      kind: "analytics-result-list",
      projectId: project.id,
      page: pageRead.page,
      metrics: {
        total: results.length,
        matched: matched.length,
        statusCounters,
        averageDurationMs,
        flakyCount: 0,
        flakyDataComplete: true,
        slowCount: matched.filter((item) => item.durationMs >= 2_000).length,
        openRisks: statusCounters.failed + statusCounters.broken
      },
      prioritySignals: sortedByDuration
        .filter((item) => item.status === "failed" || item.status === "broken")
        .slice(0, 6)
        .map(createAnalyticsItem),
      slowSignals: sortedByDuration
        .filter((item) => item.durationMs >= 2_000)
        .slice(0, 6)
        .map(createAnalyticsItem),
      items: pageRead.items
    };
  }
  if (pathname === `/api/v1/test-cases/${testCase.id}/history`) {
    return {
      kind: "test-case-history",
      testCaseId: testCase.id,
      projectId: project.id,
      totalPoints: 1,
      returnedPoints: 1,
      omittedPoints: 0,
      page: page(1),
      points: [historyPoint]
    };
  }
  if (pathname === `/api/v1/test-cases/${testCase.id}`) {
    return testCase;
  }
  if (pathname === "/api/v1/test-cases") {
    return paged("test-case-list", testCases, { projectId: project.id }, search);
  }
  if (pathname.startsWith("/api/v1/test-cases/") && pathname.endsWith("/history")) {
    const id = decodeURIComponent(pathname.slice("/api/v1/test-cases/".length, -"/history".length));
    const selected = testCases.find((item) => item.id === id);
    return selected === undefined
      ? undefined
      : {
          kind: "test-case-history",
          testCaseId: id,
          projectId: project.id,
          totalPoints: selected.history.length,
          returnedPoints: selected.history.length,
          omittedPoints: 0,
          page: page(selected.history.length),
          points: selected.history
        };
  }
  if (pathname.startsWith("/api/v1/test-cases/")) {
    const id = decodeURIComponent(pathname.slice("/api/v1/test-cases/".length));
    return testCases.find((item) => item.id === id);
  }
  if (pathname === "/api/v1/defects") {
    return paged("defect-list", defects, { projectId: project.id }, search);
  }
  return undefined;
}

export function createEmptyUiApiResponse(pathname) {
  if (pathname.includes("/launches")) {
    return paged("launch-list", []);
  }
  if (pathname.includes("/test-cases")) {
    return paged("test-case-list", []);
  }
  if (pathname.includes("/defects")) {
    return paged("defect-list", []);
  }
  return { items: [], page: page(0) };
}

function paged(kind, items, extra = {}, search = "") {
  const parameters = new URLSearchParams(search);
  const query = parameters.get("q")?.trim().toLowerCase();
  const status = parameters.get("status")?.trim().toLowerCase();
  const statuses = status?.split(",").map((value) => value.trim());
  const statusFiltered =
    kind === "launch-result-list" && statuses?.length
      ? items.filter((item) => statuses.includes(item.status))
      : items;
  const filtered =
    query === undefined || query === ""
      ? statusFiltered
      : statusFiltered.filter((item) =>
          kind === "launch-result-list"
            ? matchesResultFixtureQuery(item, query)
            : [item.id, item.name, item.title, item.status]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(query)
        );
  return { kind, ...extra, ...paginate(filtered, search) };
}

function matchesResultFixtureQuery(item, query) {
  const statusSet = /^status\s+in\s+\[([^\]]+)\]$/i.exec(query);
  if (statusSet !== null) {
    const statuses = statusSet[1].split(",").map((value) =>
      value
        .trim()
        .replace(/^['"]|['"]$/g, "")
        .toLowerCase()
    );
    return statuses.includes(item.status);
  }
  const muted = /^muted\s*=\s*(true|false)$/i.exec(query);
  if (muted !== null) {
    return Boolean(item.muted) === (muted[1].toLowerCase() === "true");
  }
  return [item.uuid, item.name, item.fullName, item.status, ...item.labels.tag]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function paginate(items, search = "") {
  const parameters = new URLSearchParams(search);
  const requestedLimit = Number(parameters.get("limit"));
  const limit =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 250)
      : Math.max(10, items.length);
  const requestedOffset = Number(parameters.get("cursor") ?? parameters.get("offset") ?? 0);
  const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;
  const selected = items.slice(offset, offset + limit);
  const hasMore = offset + selected.length < items.length;
  return {
    items: selected,
    page: {
      cursor: parameters.get("cursor"),
      hasMore,
      limit,
      nextCursor: hasMore ? String(offset + selected.length) : null,
      offset,
      returned: selected.length,
      total: items.length
    }
  };
}

function page(total) {
  return {
    cursor: null,
    hasMore: false,
    limit: Math.max(10, total),
    nextCursor: null,
    offset: 0,
    returned: total,
    total
  };
}
