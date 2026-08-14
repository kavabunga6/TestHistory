import type { M1Workspace, ResultStatus, TestResult } from "./m1Workspace.js";

export type WorkspaceMode =
  | "projects"
  | "dashboard"
  | "case"
  | "launch"
  | "defects"
  | "jobs"
  | "automation"
  | "analytics"
  | "settings";

export type WorkspaceRoute = {
  defectId?: string | undefined;
  launchId?: string | undefined;
  launchQuery?: string | undefined;
  launchTab?: string | undefined;
  mode: WorkspaceMode;
  resultId?: string | undefined;
  resultTab?: string | undefined;
  settingsTab?: string | undefined;
  testCaseId?: string | undefined;
  testCaseTab?: string | undefined;
};

export const modeLabels: Record<WorkspaceMode, string> = {
  projects: "Проекты",
  dashboard: "Дашборды",
  case: "Тест-кейсы",
  launch: "Запуски",
  defects: "Дефекты",
  jobs: "Задачи",
  automation: "Автоматизация",
  analytics: "Аналитика",
  settings: "Настройки"
};

export const readyWorkspaceModes: WorkspaceMode[] = [
  "projects",
  "dashboard",
  "case",
  "launch",
  "defects",
  "automation",
  "analytics",
  "settings"
];

const referenceWorkspaceModes: WorkspaceMode[] = [
  "projects",
  "dashboard",
  "launch",
  "case",
  "defects",
  "automation",
  "analytics",
  "settings"
];

export function isReferenceWorkspaceMode(mode: WorkspaceMode): boolean {
  return referenceWorkspaceModes.includes(mode);
}

export const resultDetailTabs = [
  "Обзор",
  "Трейс",
  "Шаги",
  "Вложения",
  "Параметры",
  "Метки и ссылки",
  "История"
] as const;

export const testCaseDetailTabs = [
  { id: "overview", label: "Обзор", status: "ready" },
  { id: "history", label: "История", status: "ready" },
  { id: "scenario", label: "Сценарий", status: "ready" },
  { id: "attachments", label: "Вложения", status: "ready" },
  { id: "quarantine", label: "Карантины", status: "ready" },
  { id: "defects", label: "Дефекты", status: "ready" },
  { id: "changelog", label: "Журнал изменений", status: "ready" }
] as const;

export type TestCaseDetailTab = (typeof testCaseDetailTabs)[number]["id"];

export const statusLabels: Record<ResultStatus, string> = {
  passed: "Пройден",
  failed: "Провален",
  broken: "Сломан",
  skipped: "Пропущен",
  muted: "Карантин"
};

export const LIST_PAGE_SIZE = 50;
export const LAUNCH_PAGE_SIZE = 24;

export function formatLaunchState(state: string): string {
  if (state === "open") {
    return "Открыт";
  }
  if (state === "closed") {
    return "Закрыт";
  }

  return state;
}

export function formatWorkflow(workflow: TestResult["workflow"]): string {
  const labels: Record<TestResult["workflow"], string> = {
    Deprecated: "Устарел",
    Draft: "Черновик",
    Ready: "Активный",
    Review: "На ревью"
  };

  return labels[workflow];
}

export function getModeFromHash(hash: string): WorkspaceMode {
  return getRouteFromHash(hash).mode;
}

function isTestCaseTabSegment(value: string | undefined): value is TestCaseDetailTab {
  return value !== undefined && testCaseDetailTabs.some((tab) => tab.id === value);
}

export function getRouteFromHash(hash: string): WorkspaceRoute {
  const [path = "", search = ""] = hash.replace(/^#/, "").split("?", 2);
  const launchQuery = new URLSearchParams(search).get("query") ?? undefined;
  const [modeSegment = "", firstSegment, secondSegment, thirdSegment, fourthSegment] = path
    .split("/")
    .map((segment) => decodeURIComponent(segment));
  const normalized = modeSegment === "jobs" ? "launch" : modeSegment;
  if (normalized in modeLabels) {
    const mode = normalized as WorkspaceMode;
    if (mode === "settings") {
      return { mode, settingsTab: firstSegment || undefined };
    }
    if (mode === "case") {
      if (isTestCaseTabSegment(firstSegment)) {
        return { mode, testCaseTab: firstSegment };
      }

      return {
        mode,
        testCaseId: firstSegment || undefined,
        testCaseTab: secondSegment || undefined
      };
    }
    if (mode === "defects") {
      return { defectId: firstSegment || undefined, mode };
    }
    if (mode === "launch" && firstSegment !== undefined && firstSegment !== "") {
      if (
        (secondSegment === "result" || secondSegment === "results") &&
        thirdSegment !== undefined
      ) {
        return {
          launchId: firstSegment,
          launchQuery,
          mode,
          resultId: thirdSegment,
          resultTab: fourthSegment || undefined
        };
      }

      return {
        launchId: firstSegment,
        launchQuery,
        launchTab: secondSegment || undefined,
        mode,
        resultId: undefined
      };
    }
    if (mode === "launch" && firstSegment !== undefined && firstSegment !== "") {
      return {
        launchId: firstSegment,
        mode,
        resultId: undefined
      };
    }

    return { mode };
  }

  return { mode: "launch" };
}

export function getHashFromRoute(route: WorkspaceRoute): string {
  if (route.mode === "launch" && route.launchId !== undefined && route.launchId !== "") {
    const launchPath = `#launch/${encodeURIComponent(route.launchId)}`;
    const withQuery = (path: string) => {
      if (route.launchQuery === undefined || route.launchQuery === "") {
        return path;
      }
      const search = new URLSearchParams({ query: route.launchQuery });
      return `${path}?${search.toString()}`;
    };
    if (route.resultId !== undefined && route.resultId !== "") {
      const resultPath = `${launchPath}/result/${encodeURIComponent(route.resultId)}`;
      return withQuery(
        route.resultTab !== undefined && route.resultTab !== ""
          ? `${resultPath}/${encodeURIComponent(route.resultTab)}`
          : resultPath
      );
    }

    return withQuery(
      route.launchTab !== undefined && route.launchTab !== ""
        ? `${launchPath}/${encodeURIComponent(route.launchTab)}`
        : launchPath
    );
  }

  if (route.mode === "settings" && route.settingsTab !== undefined && route.settingsTab !== "") {
    return `#settings/${encodeURIComponent(route.settingsTab)}`;
  }

  if (route.mode === "case" && route.testCaseTab !== undefined && route.testCaseTab !== "") {
    if (route.testCaseId !== undefined && route.testCaseId !== "") {
      return `#case/${encodeURIComponent(route.testCaseId)}/${encodeURIComponent(route.testCaseTab)}`;
    }

    return `#case/${encodeURIComponent(route.testCaseTab)}`;
  }

  if (route.mode === "case" && route.testCaseId !== undefined && route.testCaseId !== "") {
    return `#case/${encodeURIComponent(route.testCaseId)}`;
  }

  if (route.mode === "defects" && route.defectId !== undefined && route.defectId !== "") {
    return `#defects/${encodeURIComponent(route.defectId)}`;
  }

  return `#${route.mode}`;
}

export function findLaunchIdForResult(
  results: TestResult[],
  resultId: string | undefined
): string | undefined {
  if (resultId === undefined || resultId === "") {
    return undefined;
  }

  const result = results.find((item) => item.id === resultId);
  return (
    result?.historyCompare?.to.launchId ??
    result?.historyCompare?.from.launchId ??
    result?.historyPoints?.[0]?.launchId
  );
}

export function withRecomputedLaunchCounters(workspace: M1Workspace): M1Workspace {
  return {
    ...workspace,
    launchItems: workspace.launchItems.map((launch) => {
      const launchResultIds = getResultIdsForLaunch(workspace.results, launch.id);
      if (launchResultIds.length === 0) {
        return launch;
      }

      const launchResultIdSet = new Set(launchResultIds);
      const launchResults = workspace.results.filter((result) => launchResultIdSet.has(result.id));

      return {
        ...launch,
        counters: countAnalyticsStatuses(launchResults)
      };
    })
  };
}

export function getResultIdsForLaunch(results: TestResult[], launchId: string): string[] {
  return results
    .filter(
      (result) =>
        result.historyCompare?.to.launchId === launchId ||
        result.historyCompare?.from.launchId === launchId ||
        result.historyPoints?.some((point) => point.launchId === launchId)
    )
    .map((result) => result.id);
}

export function countAnalyticsStatuses(results: TestResult[]): Record<ResultStatus, number> {
  return results.reduce<Record<ResultStatus, number>>(
    (counters, result) => {
      if (result.status !== "muted") {
        counters[result.status] += 1;
      }
      return counters;
    },
    { broken: 0, failed: 0, muted: 0, passed: 0, skipped: 0 }
  );
}
