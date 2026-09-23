import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDeniedUiModel, m5DeniedApiState, m5DeniedPermissionDeniedError } from "./api.js";
import type {
  ApiState,
  ArchiveDiagnosticReplayFixtureListRead,
  ArchiveUploadStatusListRead,
  AttachmentPreviewRetentionDryRunScheduleRead,
  AttachmentPreviewRetentionPreviewRead,
  DefectMuteProjectionRead,
  DefectMuteReplayInvariantRead
} from "./api.js";
import {
  demoM1Workspace,
  mergeHistoryComparePermissionAuditRead,
  type M1Workspace,
  type TestResult
} from "./m1Workspace.js";
import {
  ResultTabContent,
  archiveDiagnosticReplayFixtureBrowserSmokeGuidance,
  attachmentRetentionScheduleBrowserSmokeGuidance,
  defectMuteReplayInvariantBrowserSmokeGuidance,
  filterLaunchItems,
  filterTestCaseResults,
  getModeFromHash,
  getRouteFromHash,
  getVisibleSelectedTestCase,
  historyComparePermissionAuditBrowserSmokeGuidance,
  resultDetailTabs,
  readyWorkspaceModes
} from "./testExports.js";
import { buildDefectSummaries, filterDefects } from "./referenceScreens/DefectsReferenceScreen.js";
import { LaunchesReferenceScreen } from "./referenceScreens/LaunchesReferenceScreen.js";
import { LaunchComparisonScreen } from "./referenceScreens/LaunchComparisonCard.js";
import { OverviewTab, ResultsTab } from "./referenceScreens/LaunchesReferenceTabs.js";
import {
  apiStates,
  archiveFixtureReadyApiState,
  archiveReadyApiState,
  archiveStatusReadyApiState,
  emptyProjectionApiState,
  onlineApiState,
  partialProjectionApiState,
  projectionApiState,
  readyArchiveDiagnosticReplayFixtures,
  readyArchiveUploadStatus,
  readyAttachmentPreviewRetention,
  readyAttachmentPreviewRetentionSchedule,
  readyDefectMuteProjection,
  readyDefectMuteReplayInvariant,
  retentionEmptyApiState,
  retentionReadyApiState,
  archiveMaterializedFixturePolicy
} from "./surfaceReadiness.fixtures.js";
import {
  allButtons,
  buildSyntheticWorkspace,
  buttonContaining,
  buttonMarkupByLabel,
  buttonsContainingText,
  countMatches,
  expectedStateCopy,
  fakeLocalStorage,
  modeLabelsForTest,
  renderSelectedCaseTab,
  renderSurface,
  renderWorkspaceSurface,
  testGlobal,
  visibleText,
  withoutOptional
} from "./surfaceReadiness.helpers.js";

describe("result and launch surface readiness", () => {
  it("keeps each ready result detail tab populated", () => {
    const result = demoM1Workspace.results[0]!;

    for (const tab of resultDetailTabs) {
      const text = visibleText(
        renderToStaticMarkup(<ResultTabContent result={result} tab={tab} />)
      );

      expect(text.length, `${tab} tab should not be blank`).toBeGreaterThan(20);
      expect(text.toLowerCase(), `${tab} tab should not expose placeholder copy`).not.toContain(
        "placeholder"
      );
    }
  });

  it("renders bounded attachment preview descriptors without raw payload or path leakage", () => {
    const markup = renderToStaticMarkup(
      <ResultTabContent result={demoM1Workspace.results[0]!} tab="Вложения" />
    );
    const text = visibleText(markup);

    expect(text).toContain("Дескрипторы превью ограничены");
    expect(text).toContain("log превью готово");
    expect(text).toContain("метаданные изображения");
    expect(text).toContain("превью не поддерживается");
    expect(text).toContain("Контент недоступен");
    expect(text).toContain("ограниченный дескриптор");
    expect(text).toContain("без исходных данных");
    expect(text).toContain("без пути хранения");
    expect(text).toContain("без подписанной ссылки");
    expect(text).toContain("credential redacted");
    expect(text).not.toContain("token=");
    expect(text).not.toContain("super-secret");
    expect(text).not.toContain("C:\\");
    expect(text).not.toContain("/Users/");
    expect(text).not.toContain("storageKey");
    expect(text).not.toContain("signedUrl");
    expect(text).not.toContain("rawPayload");

    for (const label of ["Доступ к артефактам требует аудит", "Метаданные хранения"]) {
      const button = buttonContaining(markup, label);
      expect(markup, `${label} read-only status should be visible`).toContain(label);
      expect(button, `${label} should not be a fake disabled action`).toBeUndefined();
    }
    expect(text).not.toContain("WIP");
  });

  it("renders result detail empty states for missing optional result data", () => {
    const sparseResult = withoutOptional(
      withoutOptional<TestResult, "trace">(
        {
          ...demoM1Workspace.results[0]!,
          status: "passed",
          attachments: [],
          parameters: [],
          links: [],
          issues: [],
          testKeys: [],
          members: [],
          customFields: [],
          tags: [],
          steps: []
        },
        "trace"
      ),
      "description"
    );
    const renderedTabs = resultDetailTabs
      .map((tab) =>
        visibleText(renderToStaticMarkup(<ResultTabContent result={sparseResult} tab={tab} />))
      )
      .join(" ");

    expect(renderedTabs).toContain("Описание отсутствует");
    expect(renderedTabs).toContain("Трейс не сохранен");
    expect(renderedTabs).toContain("Шаги не сохранены");
    expect(renderedTabs).toContain("Вложения не сохранены");
    expect(renderedTabs).toContain("Параметры не сохранены");
    expect(renderedTabs).toContain("Ссылки");
    expect(renderedTabs).not.toContain("Ссылки не указаны");
    expect(renderedTabs.toLowerCase()).not.toContain("placeholder");
  });

  it("keeps launch result detail scoped away from runtime and engineering content", () => {
    const text = visibleText(
      renderWorkspaceSurface(
        "launch",
        onlineApiState,
        demoM1Workspace,
        demoM1Workspace.results[0]!.id,
        1
      )
    );
    const raw = visibleText(
      renderToStaticMarkup(
        <ResultTabContent result={demoM1Workspace.results[0]!} tab="Сырые данные" />
      )
    );

    expect(text).toContain("Запуски");
    expect(text).toContain("PR-1289 Checkout Regression");
    expect(text).toContain("Обзор");
    expect(text).toContain("Результаты тестов");
    expect(text).toContain("Выполняемый сценарий");
    expect(text).toContain("Вложения");
    expect(text).toContain("История результатов");
    expect(text).toContain("Карантин");
    expect(text).toContain("Дефекты");
    expect(text).not.toContain("Трейс");
    expect(text).not.toContain("Метки и ссылки");
    expect(text).not.toContain("Сырые данные");
    expect(text).not.toContain("Raw metadata");
    expect(text).not.toContain("Trace");
    expect(text).not.toContain("Mute status");
    expect(text).not.toContain("Mutation contract absent");
    expect(text).not.toContain("Defect mute projection");
    expect(text).not.toContain("Launch defect replay evidence");
    expect(text).not.toContain("Launch replay invariant evidence");
    expect(text).not.toContain("Состояние списка");
    expect(text).not.toContain("DOM-строк");
    expect(text).not.toContain("Runtime model");
    expect(text).not.toContain("Launch lifecycle and processing readiness");
    expect(raw).toContain("[redacted]");
    expect(raw).not.toContain("super-secret");
  });

  it("keeps launch and result controls either ready with data or hidden until implemented", () => {
    const markup = renderWorkspaceSurface(
      "launch",
      onlineApiState,
      demoM1Workspace,
      demoM1Workspace.results[0]!.id,
      1
    );
    const text = visibleText(markup);

    expect(text).toContain("Запуски");
    expect(text).toContain("PR-1289 Checkout Regression");
    expect(text).toContain("Обзор");
    expect(text).toContain("Результаты тестов");
    expect(text).toContain("Ошибки");
    expect(text).toContain("Графики");
    expect(text).not.toContain("Временная шкала");
    expect(markup).toContain("thql-search");
    expect(markup).toContain('aria-label="THQL поиск результатов запуска"');
    expect(markup).not.toContain("launches-reference-filterbar");
    expect(markup).not.toContain("launches-reference-environment");
    expect(text).not.toContain("Все окружения");
    expect(text).not.toContain("С дефектами");
    expect(text).toContain("Открыт");
    expect(text).toContain("Выполняемый сценарий");
    expect(text).toContain("Вложения");
    expect(text).toContain("staging");
    expect(text).toContain("Chrome 126");
    expect(text).not.toContain("Владелец");
    expect(text).not.toContain("Platform QA");
    expect(text).not.toContain("API online");
    expect(text).not.toContain("Access denied");
    expect(text).not.toContain("Project");
    expect(text).not.toContain("Ready");
    for (const forbiddenLabel of ["Today", "Duration", "Defect", "Layer", "Tags", "No defect"]) {
      expect(text, `launch UI should not expose English label ${forbiddenLabel}`).not.toContain(
        forbiddenLabel
      );
    }

    for (const tab of ["Трейс", "Метки и ссылки"] as const) {
      expect(
        buttonContaining(markup, tab),
        `${tab} engineering tab should not render in Launches`
      ).toBeUndefined();
    }

    expect(buttonContaining(markup, "Импорт")).toBeUndefined();
    expect(buttonContaining(markup, "Опции")).toBeUndefined();

    expect(buttonContaining(markup, "Экспорт")).toBeUndefined();
    expect(markup).not.toContain('aria-label="Статус"');
    expect(markup).toContain('role="img" aria-label="Статус:');

    expect(markup).not.toContain('aria-label="Дополнительные действия"');
  });

  it("keeps result rows focused on status and navigation without inactive selection controls", () => {
    const selectedResult = demoM1Workspace.results[0]!;
    const markup = renderToStaticMarkup(
      <ResultsTab
        activeStatusFilter={undefined}
        actorId="admin"
        filteredResults={demoM1Workspace.results}
        loading={false}
        query=""
        results={demoM1Workspace.results}
        selectedResult={selectedResult}
        onActiveFilterChange={() => undefined}
        onClearStatusFilter={() => undefined}
        onQueryChange={() => undefined}
        onSelectResult={() => undefined}
        onStatusFilterChange={() => undefined}
      />
    );

    expect(markup).not.toContain('type="checkbox"');
    expect(markup).not.toContain("lucide-bot");
    expect(visibleText(markup)).not.toContain("выбрано");
    expect(visibleText(markup)).toContain(selectedResult.name);
  });

  it("keeps the quarantine filter available beyond the loaded result page", () => {
    const result = { ...demoM1Workspace.results[0]!, muted: false, status: "passed" as const };
    const markup = renderToStaticMarkup(
      <ResultsTab
        activeStatusFilter={undefined}
        actorId="admin"
        filteredResults={[result]}
        launchCounters={{ broken: 0, failed: 0, muted: 0, passed: 1, skipped: 0 }}
        loading={false}
        query=""
        results={[result]}
        selectedResult={result}
        onActiveFilterChange={() => undefined}
        onClearStatusFilter={() => undefined}
        onQueryChange={() => undefined}
        onSelectResult={() => undefined}
        onStatusFilterChange={() => undefined}
      />
    );

    expect(markup).toContain('<option value="muted">Карантин</option>');
  });

  it("keeps launch overview cards fixed with paged overflowing lists", () => {
    const markup = renderToStaticMarkup(
      <LaunchesReferenceScreen
        launchItems={demoM1Workspace.launchItems}
        results={demoM1Workspace.results}
        routeLaunchId="L-1289"
        onOpenResult={() => undefined}
      />
    );
    const pagerMatches = markup.match(/launches-reference-card-pager/g) ?? [];

    expect(pagerMatches.length).toBeGreaterThanOrEqual(1);
    expect(markup).toContain('data-page-size="5"');
    expect(markup).toContain('data-total="7"');
    expect(markup).not.toContain('data-total="4"');
    expect(markup).toContain('<option value="5"');
    expect(markup).toContain('<option value="10"');
    expect(markup).toContain('<option value="20"');
    expect(markup).toContain('<option value="50"');
    expect(markup).toContain("launches-reference-card-scroll");
  });

  it("renders an accessible result donut with clickable segments and legend filters", () => {
    const launch = demoM1Workspace.launchItems[0]!;
    const results = demoM1Workspace.results;
    const markup = renderToStaticMarkup(
      <OverviewTab
        launch={launch}
        results={results}
        onSelectAll={() => undefined}
        onSelectResult={() => undefined}
        onSelectStatus={() => undefined}
      />
    );

    expect(markup).toContain("launches-reference-overview-donut");
    expect(markup).toContain('role="button"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('aria-label="Фильтры по статусу"');
    for (const status of ["passed", "failed", "broken", "skipped"] as const) {
      expect(markup).toContain(`launches-reference-overview-legend-item is-${status}`);
    }
    expect(markup).toContain("Открыть результаты с этим статусом");
  });

  it("labels the combined broken and unknown overview group explicitly", () => {
    const launch = demoM1Workspace.launchItems[0]!;
    const markup = renderToStaticMarkup(
      <OverviewTab
        launch={{ ...launch, counters: { ...launch.counters, broken: 12 } }}
        results={demoM1Workspace.results}
        onSelectAll={() => undefined}
        onSelectResult={() => undefined}
        onSelectStatus={() => undefined}
      />
    );

    expect(markup).toContain("Сломаны и неизвестны");
    expect(markup).toContain("Сломаны и неизвестны: 12. Открыть оба статуса");
  });

  it("keeps launch comparison on a separate explicit-request screen", () => {
    const markup = renderToStaticMarkup(
      <LaunchComparisonScreen
        launch={demoM1Workspace.launchItems[0]!}
        launchItems={demoM1Workspace.launchItems}
        onSelectResult={() => undefined}
      />
    );

    expect(visibleText(markup)).toContain("Сравнение запусков");
    expect(visibleText(markup)).toContain("Выберите запуск");
    expect(markup).toContain("launches-reference-comparison-submit");
    expect(visibleText(markup)).toContain("ID ");
    expect(visibleText(markup)).toContain("тестов");
    expect(markup).toContain("disabled");
    expect(markup).not.toContain("launches-reference-comparison-metrics");

    const restoredMarkup = renderToStaticMarkup(
      <LaunchComparisonScreen
        initialSession={{
          baselineId: demoM1Workspace.launchItems[1]!.id,
          comparison: {
            base: {
              id: demoM1Workspace.launchItems[1]!.id,
              metrics: { averageDurationMs: 1_000, passRate: 1 },
              name: demoM1Workspace.launchItems[1]!.name
            },
            kind: "launch-comparison",
            metricDeltas: { averageDurationMs: 250, passRate: -0.5 },
            rows: [
              {
                base: { durationMs: 1_000, resultUuid: "base-result", status: "passed" },
                change: "regressed",
                durationDeltaMs: 250,
                durationTrend: "slower",
                name: "checkout",
                target: { durationMs: 1_250, resultUuid: "target-result", status: "failed" },
                testCaseId: "checkout-id"
              }
            ],
            summary: {
              durationRegressions: 1,
              fixed: 0,
              new: 0,
              regressed: 1,
              removed: 0,
              "status-changed": 0,
              unchanged: 0
            },
            target: {
              id: demoM1Workspace.launchItems[0]!.id,
              metrics: { averageDurationMs: 1_250, passRate: 0.5 },
              name: demoM1Workspace.launchItems[0]!.name
            }
          }
        }}
        launch={demoM1Workspace.launchItems[0]!}
        launchItems={demoM1Workspace.launchItems}
        onSelectResult={() => undefined}
      />
    );

    expect(restoredMarkup).toContain("launches-reference-comparison-table-head");
    expect(visibleText(restoredMarkup)).toContain("Базовый прогон");
    expect(visibleText(restoredMarkup)).toContain("Текущий прогон");
    expect(visibleText(restoredMarkup)).toContain("Успешный");
    expect(visibleText(restoredMarkup)).toContain("Провален");
    expect(visibleText(restoredMarkup)).toContain("+250 мс");
  });

  it("shares one persisted split width between results and errors", () => {
    const source = readFileSync(
      new URL("./referenceScreens/LaunchesReferenceTabs.tsx", import.meta.url),
      "utf8"
    );

    expect(source).toContain(
      'const launchSplitListWidthKey = "testhistory:launch-detail-list-width-v3"'
    );
    expect(source).toContain("const launchSplitListDefaultRatio = 0.43");
    expect(source).toContain("new ResizeObserver(updateWidth)");
    expect(source).not.toContain("legacyLaunchSplitListWidthKeys");
    expect(source).not.toContain("useLaunchSplitResize(launchResultsListWidthKey)");
    expect(source).not.toContain("useLaunchSplitResize(launchErrorsListWidthKey)");
    expect(source.match(/const splitResize = useLaunchSplitResize\(\);/g)).toHaveLength(2);
  });

  it("does not replace a missing routed result with an unrelated test", () => {
    const launchId = demoM1Workspace.launchItems[0]!.id;
    const markup = renderToStaticMarkup(
      <LaunchesReferenceScreen
        launchItems={demoM1Workspace.launchItems}
        results={demoM1Workspace.results}
        routeLaunchId={launchId}
        routeResultId="missing-result-id"
        selectedResultId={demoM1Workspace.results[0]!.id}
        onOpenResult={() => undefined}
      />
    );

    expect(visibleText(markup)).toContain("Результат теста не найден");
    expect(markup).not.toContain('aria-label="Отчет результата');
  });

  it("does not replace a missing routed launch with the first launch", () => {
    const markup = renderToStaticMarkup(
      <LaunchesReferenceScreen
        launchItems={demoM1Workspace.launchItems}
        results={demoM1Workspace.results}
        routeLaunchId="missing-launch-id"
      />
    );

    expect(visibleText(markup)).toContain("Запуск не найден");
    expect(visibleText(markup)).not.toContain(demoM1Workspace.launchItems[0]!.name);
  });

  it("filters launch list items locally without backend or result-scope claims", () => {
    expect(filterLaunchItems(demoM1Workspace.launchItems, "")).toHaveLength(
      demoM1Workspace.launchItems.length
    );
    expect(filterLaunchItems(demoM1Workspace.launchItems, "firefox")).toEqual([
      demoM1Workspace.launchItems[1]
    ]);
    expect(filterLaunchItems(demoM1Workspace.launchItems, "release/24.06")).toEqual([
      demoM1Workspace.launchItems[2]
    ]);
    expect(filterLaunchItems(demoM1Workspace.launchItems, "L-1289")).toEqual([
      demoM1Workspace.launchItems[0]
    ]);
    expect(filterLaunchItems(demoM1Workspace.launchItems, "missing launch")).toHaveLength(0);
  });

  it("keeps filtered test-case detail synchronized with the visible list", () => {
    const staleSelectedId = demoM1Workspace.results[0]!.id;
    const singleVisibleCase = filterTestCaseResults(
      demoM1Workspace.results,
      "Все",
      demoM1Workspace.results[1]!.allureId
    );
    const emptyVisibleCases = filterTestCaseResults(
      demoM1Workspace.results,
      "Все",
      "нет такого тест-кейса"
    );

    expect(singleVisibleCase).toEqual([demoM1Workspace.results[1]]);
    expect(getVisibleSelectedTestCase(singleVisibleCase, staleSelectedId)).toBe(
      demoM1Workspace.results[1]
    );
    expect(getVisibleSelectedTestCase(emptyVisibleCases, staleSelectedId)).toBeUndefined();
  });

  it("renders worker and queue telemetry as bounded read-only diagnostics", () => {
    const markup = renderSurface("jobs", onlineApiState);
    const text = visibleText(markup);

    expect(text).toContain("Диагностика только для чтения");
    expect(text).toContain("Ограниченная диагностика");
    expect(text).toContain("Прогресс распаковки worker представлен ограниченной проекцией");
    expect(markup).not.toContain('aria-disabled="true"');
    expect(text).not.toContain("WIP");
    expect(text.toLowerCase()).not.toContain("placeholder");
    expect(text).not.toContain("Runtime model");
    expect(text).not.toContain("Worker runtime");
    expect(text).not.toContain("Queue transport");
  });
});
