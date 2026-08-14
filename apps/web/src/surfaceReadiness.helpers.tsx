import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ApiState } from "./api.js";
import {
  demoM1Workspace,
  type LaunchListItem,
  type M1Workspace,
  type ResultStatus,
  type TestResult
} from "./m1Workspace.js";
import { TestCaseDetailTabContent, WorkspaceSurface, readyWorkspaceModes } from "./testExports.js";
import { onlineApiState } from "./surfaceReadiness.fixtures.js";
export const testGlobal = globalThis as typeof globalThis & { localStorage?: Storage };

export function renderSurface(
  mode: (typeof readyWorkspaceModes)[number],
  apiState: ApiState
): string {
  return renderWorkspaceSurface(mode, apiState, demoM1Workspace);
}

export function renderWorkspaceSurface(
  mode: (typeof readyWorkspaceModes)[number],
  apiState: ApiState,
  workspace: M1Workspace,
  selectedId = workspace.results[0]!.id,
  launchOpenRequest = 0,
  routeOptions: {
    defectRouteId?: string;
    launchRouteTab?: string;
    launchRouteResultTab?: string;
    settingsRouteTab?: string;
    testCaseRouteId?: string;
    testCaseRouteTab?: string;
    workspaceLoading?: boolean;
  } = {}
): string {
  const launchRouteId =
    launchOpenRequest > 0
      ? (findLaunchIdForTestResult(workspace.results, selectedId) ?? workspace.launchItems[0]?.id)
      : undefined;
  return renderToStaticMarkup(
    <WorkspaceSurface
      apiState={apiState}
      defectRouteId={routeOptions.defectRouteId}
      launchRouteId={launchRouteId}
      launchRouteTab={routeOptions.launchRouteTab}
      launchRouteResultId={launchOpenRequest > 0 ? selectedId : undefined}
      launchRouteResultTab={routeOptions.launchRouteResultTab}
      mode={mode}
      settingsRouteTab={routeOptions.settingsRouteTab}
      selectedId={selectedId}
      testCaseRouteId={routeOptions.testCaseRouteId}
      testCaseRouteTab={routeOptions.testCaseRouteTab}
      workspace={workspace}
      {...(routeOptions.workspaceLoading === undefined
        ? {}
        : { workspaceLoading: routeOptions.workspaceLoading })}
      onModeChange={() => undefined}
      onSelect={() => undefined}
    />
  );
}

export function findLaunchIdForTestResult(
  results: TestResult[],
  resultId: string
): string | undefined {
  const result = results.find((item) => item.id === resultId);
  return (
    result?.historyCompare?.to.launchId ??
    result?.historyCompare?.from.launchId ??
    result?.historyPoints?.[0]?.launchId
  );
}

export function renderSelectedCaseTab(
  tab: Parameters<typeof TestCaseDetailTabContent>[0]["tab"],
  apiState: ApiState = onlineApiState,
  workspace: M1Workspace = demoM1Workspace,
  selectedId = workspace.results[0]!.id
): string {
  const result = workspace.results.find((item) => item.id === selectedId) ?? workspace.results[0]!;
  return renderToStaticMarkup(
    <TestCaseDetailTabContent apiState={apiState} result={result} tab={tab} />
  );
}

export function visibleText(markup: string): string {
  return markup
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const modeLabelsForTest: Record<(typeof readyWorkspaceModes)[number] | "jobs", string> = {
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

export const expectedStateCopy: Record<string, string> = {
  demo: "готов",
  loading: "Загружаем",
  error: "Ошибка API",
  offline: "API недоступен"
};

export function withoutOptional<T extends object, K extends keyof T>(value: T, key: K): T {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

export function buildSyntheticWorkspace(size: number): M1Workspace {
  const statuses: ResultStatus[] = ["passed", "failed", "broken", "skipped"];
  const base = demoM1Workspace.results[0]!;
  const results: TestResult[] = Array.from({ length: size }, (_, index) => {
    const status = statuses[index % statuses.length]!;
    const id = `SYN-${index.toString().padStart(5, "0")}`;

    return {
      ...base,
      id,
      allureId: String(900_000 + index),
      name: `Synthetic readiness case ${index} ${"long-unbroken-segment".repeat(index === 0 ? 18 : 1)}`,
      suite: `synthetic.suite.${index % 25}.${"Nested".repeat(index === 0 ? 12 : 1)}`,
      status,
      duration: index % 9 === 0 ? "4.20s" : `${300 + (index % 800)}ms`,
      owner: index % 11 === 0 ? "" : `Owner ${index % 17}`,
      severity: index % 13 === 0 ? "critical" : "normal",
      history:
        index % 5 === 0
          ? ["passed", "failed", "passed", "broken", status]
          : ["passed", "passed", "passed", "passed", status],
      trace: {
        message: `Synthetic trace ${"without-natural-breaks".repeat(20)}`,
        stack: [`synthetic.stack.${index}.${"deep".repeat(20)}`]
      }
    };
  });
  const launchItems: LaunchListItem[] = Array.from({ length: size }, (_, index) => ({
    ...demoM1Workspace.launchItems[index % demoM1Workspace.launchItems.length]!,
    id: `L-SYN-${index.toString().padStart(5, "0")}`,
    name: `Synthetic launch ${index} ${"release-candidate".repeat(index === 0 ? 12 : 1)}`
  }));

  return {
    ...demoM1Workspace,
    launchItems,
    results
  };
}

export function countMatches(value: string, pattern: RegExp): number {
  return Array.from(value.matchAll(pattern)).length;
}

export function buttonMarkupByLabel(markup: string, label: string): string {
  return (
    markup.match(new RegExp(`<button\\b[^>]*>[\\s\\S]*?${label}[\\s\\S]*?<\\/button>`))?.[0] ?? ""
  );
}

export function buttonContaining(markup: string, label: string): string | undefined {
  const encodedLabel = label.replaceAll("&", "&amp;");
  return allButtons(markup).find(
    (button) => button.includes(label) || button.includes(encodedLabel)
  );
}

export function buttonsContainingText(markup: string, text: string): string[] {
  return allButtons(markup).filter((button) => button.includes(text));
}

export function allButtons(markup: string): string[] {
  return Array.from(markup.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)).map(
    ([button]) => button
  );
}

export function fakeLocalStorage(initial: Record<string, string>): Storage {
  const store = new Map(Object.entries(initial));

  return {
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    }
  };
}
