import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { demoProjectSettings } from "./projectSettings.js";
import { ProjectSettingsReferenceScreen } from "./referenceScreens/ProjectSettingsReferenceScreen.js";

const testGlobal = globalThis as typeof globalThis & { localStorage?: Storage };

describe("project settings interaction contracts", () => {
  beforeEach(() => {
    testGlobal.localStorage = fakeLocalStorage({
      "testhistory.actorId": "admin",
      "testhistory.userRole": "admin"
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(testGlobal, "localStorage");
  });

  it.each([
    ["access", "Участники проекта"],
    ["tokens", "Личные токены"],
    ["visibility", "Видимость проекта"],
    ["integrations", "Провайдеры ссылок"],
    ["retention", "Хранение артефактов"],
    ["fields", "Маппинг кастомных полей"]
  ])("renders the %s settings route as a standalone tab URL target", (routeTab, expectedText) => {
    const html = renderToStaticMarkup(
      React.createElement(ProjectSettingsReferenceScreen, {
        routeTab,
        settings: demoProjectSettings
      })
    );

    expect(html).toContain(expectedText);
    expect(html).toContain('aria-pressed="true"');
  });

  it("renders integrations as table rows with switch controls instead of passive status badges", () => {
    const html = renderToStaticMarkup(
      React.createElement(ProjectSettingsReferenceScreen, {
        routeTab: "integrations",
        settings: demoProjectSettings
      })
    );

    expect(html).toContain("Провайдеры ссылок");
    expect(html).toContain('role="switch"');
    expect(html).toContain("Активна");
    expect(html).not.toContain("Проверить");
  });

  it("keeps the role matrix hidden behind the participants info button", () => {
    const html = renderToStaticMarkup(
      React.createElement(ProjectSettingsReferenceScreen, {
        routeTab: "access",
        settings: demoProjectSettings
      })
    );

    expect(html).toContain("Участники проекта");
    expect(html).toContain('title="Показать матрицу прав"');
    expect(html).not.toContain("Матрица прав</h2>");
  });

  it("keeps new integration providers as dialog drafts until save", () => {
    const source = readFileSync(
      new URL("./referenceScreens/ProjectSettingsIntegrationsTab.tsx", import.meta.url),
      "utf8"
    );
    const addProviderBody = extractFunctionBody(source, "const addProvider = () =>");

    expect(addProviderBody).toContain("setEditingProvider");
    expect(addProviderBody).not.toContain("setProviders");
    expect(source).toContain("const saveProvider = (provider: IntegrationLinkProvider)");
    expect(source).toContain("persistProviders(nextProviders)");
  });
});

describe("reference list layout contracts", () => {
  it.each([
    [
      "launch result defects",
      "./referenceScreens/LaunchesReferenceScreen.tsx",
      "./referenceScreens/LaunchesReferenceScreen.css",
      "launches-reference-defect-copy",
      ".launches-reference-defects article span"
    ],
    [
      "test case defects",
      "./referenceScreens/TestCaseDetailReferenceScreen.tsx",
      "./referenceScreens/TestCaseDetailReferenceScreen.css",
      "tc-detail-reference-defect-copy",
      ".tc-detail-reference-defects article span"
    ]
  ])(
    "keeps %s rendered as list rows with copy blocks and stable actions",
    (_name, sourcePath, stylePath, copyClass, forbiddenSelector) => {
      const source =
        sourcePath === "./referenceScreens/LaunchesReferenceScreen.tsx"
          ? readLaunchesReferenceSource()
          : readFileSync(new URL(sourcePath, import.meta.url), "utf8");
      const styles = readFileSync(new URL(stylePath, import.meta.url), "utf8");

      expect(source).toContain(copyClass);
      expect(styles).toContain("grid-template-columns: 20px minmax(0, 1fr) auto");
      expect(styles).not.toContain(forbiddenSelector);
    }
  );

  it("keeps launch result rail metadata as compact chips", () => {
    const source = readLaunchesReferenceSource();
    const styles = readFileSync(
      new URL("./referenceScreens/LaunchesReferenceScreen.css", import.meta.url),
      "utf8"
    );
    const railValuesBlock = extractExactCssBlock(
      styles,
      ".launches-reference-result-rail .launches-reference-value-list"
    );
    const railValueRowBlock = extractExactCssBlock(
      styles,
      ".launches-reference-result-rail .launches-reference-value-list span,\n.launches-reference-result-rail .launches-reference-value-list a"
    );
    const railLinkOverrideBlock = extractCssBlockContaining(
      styles,
      ".launches-reference-result-rail .launches-reference-value-list a",
      "background: #eef4ff"
    );

    expect(source).toContain('title="Данные результата"');
    expect(source).toContain('className="launches-reference-result-duration"');
    expect(source).toContain("formatResultDuration(result.duration)");
    expect(source).not.toContain("`Длительность: ${result.duration}`");
    expect(source).not.toContain('title="Ожидаемая длительность"');
    expect(source).toContain("testhistory:launch-detail-list-width-v3");
    expect(source).not.toContain("testhistory:launch-results-list-width");
    expect(source).not.toContain("testhistory:launch-errors-list-width");
    expect(source).toContain("writeStoredLaunchSplitListWidth");
    expect(railValuesBlock).toContain("display: flex");
    expect(railValuesBlock).toContain("flex-wrap: wrap");
    expect(railValuesBlock).toContain("gap: 7px");
    expect(railValueRowBlock).toContain("min-height: 30px");
    expect(railValueRowBlock).toContain("border-radius: 5px");
    expect(railValueRowBlock).toContain("background: #f1f5f9");
    expect(railValueRowBlock).toContain("font-weight: 600");
    expect(railLinkOverrideBlock).toContain("background: #eef4ff");
    expect(railLinkOverrideBlock).toContain("border-color: #d4e2ff");
  });
});

describe("settings table readability contracts", () => {
  it("keeps settings table column headers dark enough to read", () => {
    const styles = readFileSync(
      new URL("./referenceScreens/ProjectSettingsReferenceScreen.css", import.meta.url),
      "utf8"
    );

    for (const selector of [
      ".project-settings__table-head",
      ".project-settings__matrix-head",
      ".project-settings__integrations-table-head"
    ]) {
      const block = extractCssBlockContaining(styles, selector, "color:");
      expect(block).toContain("color: #34445b");
      expect(block).not.toContain("color: #657386");
    }
  });

  it("keeps settings tables scrollable with sticky readable headers", () => {
    const styles = readFileSync(
      new URL("./referenceScreens/ProjectSettingsReferenceScreen.css", import.meta.url),
      "utf8"
    );

    for (const selector of [".project-settings__table", ".project-settings__integrations-table"]) {
      const block = extractCssBlockContaining(styles, selector, "overflow:");
      expect(block).toContain("overflow: auto");
    }

    for (const selector of [
      ".project-settings__table-head",
      ".project-settings__integrations-table-head"
    ]) {
      const block = extractCssBlockContaining(styles, selector, "position:");
      expect(block).toContain("position: sticky");
      expect(block).toContain("top: 0");
    }
  });

  it("keeps launch overview centered with a wide results list and compact side cards", () => {
    const overviewStyles = readFileSync(
      new URL("./referenceScreens/LaunchesReferenceOverview.css", import.meta.url),
      "utf8"
    );
    const sharedStyles = readFileSync(
      new URL("./referenceScreens/LaunchesReferenceScreen.css", import.meta.url),
      "utf8"
    );

    const overviewBlock = extractCssBlockContaining(
      overviewStyles,
      ".launches-reference-overview",
      "gap:"
    );
    expect(overviewBlock).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(overviewBlock).toContain("gap: 18px");
    expect(overviewBlock).toContain("padding: 24px");
    expect(overviewBlock).toContain("overflow-y: auto");

    const centeredContentBlock = extractExactCssBlock(
      overviewStyles,
      ".launches-reference-overview > *"
    );
    expect(centeredContentBlock).toContain("max-width: 1600px");
    expect(centeredContentBlock).toContain("margin-inline: auto");

    const detailColumnsBlock = extractExactCssBlock(
      overviewStyles,
      ".launches-reference-overview-content"
    );
    expect(detailColumnsBlock).toContain(
      "grid-template-columns: minmax(0, 1.65fr) minmax(350px, 0.9fr)"
    );

    const cardBlock = extractCssBlockContaining(
      sharedStyles,
      ".launches-reference-card",
      "padding:"
    );
    expect(cardBlock).toContain("padding: 0");
    expect(cardBlock).toContain("border-radius: 8px");
    expect(cardBlock).toContain("border: 1px solid #d7e1ee");
  });

  it("keeps selected test case detail as list sections instead of nested cards", () => {
    const styles = readFileSync(
      new URL("./referenceScreens/TestCaseDetailReferenceScreen.css", import.meta.url),
      "utf8"
    );

    const overviewMainBlock = extractCssBlockContaining(
      styles,
      ".tc-detail-reference-overview-main",
      "border-top:"
    );
    const baseSectionBlock = extractCssBlockContaining(
      styles,
      ".tc-detail-reference-overview-main section",
      "border-bottom:"
    );
    const sectionGridBlock = extractCssBlockContaining(
      styles,
      ".tc-detail-reference-overview-main section",
      "grid-template-columns:"
    );
    const sectionTitleBlock = extractExactCssBlock(
      styles,
      ".tc-detail-reference-overview-main section > h3"
    );
    const sectionBodyBlock = extractExactCssBlock(
      styles,
      ".tc-detail-reference-overview-main section > :not(h3)"
    );
    const sectionCopyBlock = extractExactCssBlock(
      styles,
      ".tc-detail-reference-overview-main section > p,\n.tc-detail-reference-tab-panel section > p"
    );
    const stepLineBlock = extractExactCssBlock(styles, ".tc-detail-reference-step-line");

    expect(overviewMainBlock).toContain("border-top: 0");
    expect(baseSectionBlock).toContain("border: 0");
    expect(baseSectionBlock).toContain("border-bottom: 1px solid #e8edf4");
    expect(baseSectionBlock).not.toContain("border: 1px solid #e2e8f0");
    expect(sectionGridBlock).toContain("padding: 10px 0 12px");
    expect(sectionGridBlock).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(sectionTitleBlock).toContain("min-height: 22px");
    expect(sectionTitleBlock).toContain("border-bottom: 0");
    expect(sectionTitleBlock).toContain("background: transparent");
    expect(sectionTitleBlock).toContain("text-transform: none");
    expect(sectionBodyBlock).toContain("grid-column: 1");
    expect(sectionBodyBlock).toContain("padding: 0");
    expect(sectionCopyBlock).toContain("min-height: 24px");
    expect(sectionCopyBlock).toContain("border: 0");
    expect(sectionCopyBlock).not.toContain("border-top: 1px solid #edf0f5");
    expect(sectionCopyBlock).not.toContain("border-bottom: 1px solid #edf0f5");
    expect(stepLineBlock).toContain("min-height: 38px");
    expect(stepLineBlock).toContain("border-bottom: 1px solid #edf0f5");
  });

  it("keeps defect detail as a readable table-like list", () => {
    const source = readFileSync(
      new URL("./referenceScreens/DefectsReferenceScreen.tsx", import.meta.url),
      "utf8"
    );
    const styles = readFileSync(
      new URL("./referenceScreens/DefectsReferenceScreen.css", import.meta.url),
      "utf8"
    );
    const resultHeadBlock = extractCssBlockContaining(
      styles,
      ".defects-reference-result-head",
      "grid-template-columns:"
    );
    const resultHeadOwnBlock = extractExactCssBlock(styles, ".defects-reference-result-head");
    const simpleListBlock = extractCssBlockContaining(
      styles,
      ".defects-reference-simple-list > a",
      "grid-template-columns:"
    );
    const sectionCopyBlock = extractExactCssBlock(styles, ".defects-reference-section p");
    const screenBlock = extractExactCssBlock(styles, ".defects-reference-screen");
    const splitterBlock = extractExactCssBlock(styles, ".defects-reference-splitter");

    expect(source).toContain("defects-reference-result-head");
    expect(source).toContain("<span>Статус</span>");
    expect(source).toContain("<span>Результат</span>");
    expect(source).toContain("<span>Владелец / теги</span>");
    expect(source).toContain("<span>Длительность</span>");
    expect(resultHeadBlock).toContain("minmax(82px, 0.15fr)");
    expect(resultHeadBlock).toContain("minmax(190px, 1fr)");
    expect(resultHeadOwnBlock).toContain("min-height: 38px");
    expect(resultHeadOwnBlock).toContain("font-size: 11px");
    expect(sectionCopyBlock).toContain("min-height: 56px");
    expect(sectionCopyBlock).toContain("padding: 16px");
    expect(sectionCopyBlock).toContain("line-height: 1.4");
    expect(simpleListBlock).toContain("minmax(76px, 0.18fr)");
    expect(simpleListBlock).toContain("minmax(0, 1fr)");
    expect(source).toContain("defects-reference-splitter");
    expect(styles).toContain("--defects-reference-list-width");
    expect(styles).toContain(".defects-reference-detail-grid");
    expect(source).toContain("defects-reference-result-row");
    expect(source).toContain("getHashFromRoute");
    expect(source).toContain("DEFECT_LIST_WIDTH_KEY");
    expect(source).toContain("useResizableListWidth");
    expect(source).toContain("onKeyDown={onSeparatorKeyDown}");
    expect(source).not.toContain("Создатель:");
    expect(source).not.toContain("Правила автоматизации");
    expect(source.indexOf('title="Результаты тестов"')).toBeLessThan(
      source.indexOf('title="Запуски"')
    );
    expect(screenBlock).toContain("height: 100%");
    expect(screenBlock).toContain("overflow: hidden");
    expect(splitterBlock).toContain("height: auto");
    expect(splitterBlock).toContain("min-height: 100%");
    expect(splitterBlock).toContain("align-self: stretch");
  });

  it("keeps selected test-case detail as Russian list-detail sections", () => {
    const source = readFileSync(
      new URL("./referenceScreens/TestCaseDetailReferenceScreen.tsx", import.meta.url),
      "utf8"
    );
    const styles = readFileSync(
      new URL("./referenceScreens/TestCaseDetailReferenceScreen.css", import.meta.url),
      "utf8"
    );
    const resizeHook = readFileSync(
      new URL("./referenceScreens/useResizableListWidth.ts", import.meta.url),
      "utf8"
    );
    const sectionBlock = extractCssBlockContaining(
      styles,
      ".tc-detail-reference-overview-main section",
      "border-bottom:"
    );
    const railBlock = extractExactCssBlock(styles, ".tc-detail-reference-side-rail");
    const tabsBlock = extractExactCssBlock(styles, ".tc-detail-reference-tabs");
    const narrowTabsBlock = extractCssBlockContaining(
      styles,
      ".tc-detail-reference-tabs",
      "top: 0"
    );
    const screenBlock = extractExactCssBlock(styles, ".tc-detail-reference-screen");
    const splitterBlock = extractExactCssBlock(styles, ".tc-detail-reference-splitter");
    const splitterStateBlock = extractExactCssBlock(
      styles,
      ".tc-detail-reference-splitter:hover,\n.tc-detail-reference-splitter:focus-visible,\n.tc-detail-reference-screen.is-resizing .tc-detail-reference-splitter"
    );
    const tabButtonBlock = extractCssBlockContaining(
      styles,
      ".tc-detail-reference-tabs button",
      "max-width:"
    );
    const railValuesBlock = extractExactCssBlock(
      styles,
      ".tc-detail-reference-side-rail .tc-detail-reference-value-list"
    );
    const railValueRowBlock = extractExactCssBlock(
      styles,
      ".tc-detail-reference-side-rail .tc-detail-reference-value-list span,\n.tc-detail-reference-side-rail .tc-detail-reference-value-list a,\n.tc-detail-reference-side-rail .tc-detail-reference-value-list button"
    );
    const railHeadingBlock = extractCssBlockContaining(
      styles,
      ".tc-detail-reference-side-rail h3",
      "text-transform:"
    );
    const durationCardBlock = extractExactCssBlock(
      styles,
      ".tc-detail-reference-side-rail > .tc-detail-reference-duration-card"
    );
    const railChipListBlock = extractExactCssBlock(
      styles,
      ".tc-detail-reference-side-rail .rail-section--chips .tc-detail-reference-value-list"
    );
    const railChipBlock = extractExactCssBlock(
      styles,
      ".tc-detail-reference-side-rail .rail-section--chips .tc-detail-reference-value-list span,\n.tc-detail-reference-side-rail .rail-section--chips .tc-detail-reference-value-list a,\n.tc-detail-reference-side-rail .rail-section--chips .tc-detail-reference-value-list button"
    );
    const narrowRailBlock = extractCssBlockContaining(
      styles,
      ".tc-detail-reference-side-rail",
      "position: static"
    );
    const attemptRowBlock = extractCssBlockContaining(
      styles,
      ".tc-detail-reference-attempt-list article",
      "grid-template-columns:"
    );

    expect(source).toContain('title="Ключи теста"');
    expect(source).toContain("<h3>Длительность</h3>");
    expect(source).not.toContain('title="Ожидаемая длительность"');
    expect(source).toContain("TEST_CASE_LIST_WIDTH_KEY");
    expect(source).toContain("useResizableListWidth");
    expect(source).toContain('role="separator"');
    expect(source).toContain('aria-label="Изменить ширину списка тест-кейсов"');
    expect(source).toContain("onKeyDown={onSeparatorKeyDown}");
    expect(resizeHook).toContain('event.key !== "ArrowLeft" && event.key !== "ArrowRight"');
    expect(resizeHook).toContain("window.localStorage.setItem(storageKey");
    expect(source).toContain("result.linkDetails ?? result.links");
    expect(source).toContain("onFilterByTag");
    expect(source).toContain('aria-label="Теги"');
    expect(source).toContain('aria-label="Кастомные поля"');
    expect(source).toContain('aria-label="Ключи теста"');
    expect(source).toContain('aria-label="Ссылки"');
    expect(source).toContain('aria-label="Задачи из баг-трекера"');
    expect(source).toContain("tc-detail-reference-history-item ${point.status}");
    expect(source).not.toContain(
      "<span className={point.status}>{formatStatus(point.status)}</span>"
    );
    expect(source).not.toContain('empty="Нет ключей теста"');
    expect(source).not.toContain('title="Test keys"');
    expect(source).not.toContain("Нет test keys");
    expect(sectionBlock).toContain("border-bottom: 1px solid #e8edf4");
    expect(sectionBlock).toContain("border-radius: 0");
    expect(screenBlock).toContain("minmax(390px, var(--tc-detail-reference-list-width)) 9px");
    expect(splitterBlock).toContain("cursor: col-resize");
    expect(splitterBlock).toContain("border-right: 1px solid #d9dee8");
    expect(splitterStateBlock).toContain("background: #f4f8ff");
    expect(tabsBlock).toContain("padding: 0 24px");
    expect(narrowTabsBlock).toContain("position: sticky");
    expect(narrowTabsBlock).toContain("top: 0");
    expect(styles).not.toContain("grid-template-rows: 420px auto");
    expect(tabButtonBlock).toContain("max-width: 220px");
    expect(railBlock).toContain("position: static");
    expect(railBlock).toContain("height: 100%");
    expect(railBlock).toContain("align-content: start");
    expect(railBlock).toContain("overflow-y: auto");
    expect(railBlock).toContain("overscroll-behavior: contain");
    expect(railBlock).not.toContain("max-height: calc(100vh - 154px)");
    expect(railBlock).toContain("border-left: 1px solid #e2e7ef");
    expect(railHeadingBlock).toContain("text-transform: none");
    expect(source).toContain('"is-empty"');
    expect(railValuesBlock).toContain("display: grid");
    expect(railValuesBlock).toContain("gap: 0");
    expect(railValueRowBlock).toContain("min-height: 30px");
    expect(railValueRowBlock).toContain("border-bottom: 1px solid #edf0f5");
    expect(railValueRowBlock).toContain("border-radius: 0");
    expect(railValueRowBlock).toContain("background: transparent");
    expect(railValueRowBlock).toContain("color: #172033");
    expect(railValueRowBlock).toContain("font-size: 14px");
    expect(railValueRowBlock).toContain("font-weight: 600");
    expect(railValueRowBlock).toContain("text-overflow: ellipsis");
    expect(durationCardBlock).toContain("display: flex");
    expect(durationCardBlock).toContain("justify-content: space-between");
    expect(railChipListBlock).toContain("display: flex");
    expect(railChipListBlock).toContain("flex-wrap: wrap");
    expect(railChipBlock).toContain("border-radius: 6px");
    expect(railChipBlock).toContain("background: #eef2f7");
    expect(narrowRailBlock).toContain("position: static");
    expect(attemptRowBlock).toContain("border-bottom: 1px solid #edf0f5");
    expect(attemptRowBlock).toContain("background: transparent");
    expect(attemptRowBlock).not.toContain("border-radius: 7px");
  });

  it("keeps analytics and dashboard screens Russian with a clear metric hierarchy", () => {
    const analyticsSource = readFileSync(
      new URL("./referenceScreens/AnalyticsReferenceScreen.tsx", import.meta.url),
      "utf8"
    );
    const analyticsStyles = readFileSync(
      new URL("./referenceScreens/AnalyticsReferenceScreen.css", import.meta.url),
      "utf8"
    );
    const dashboardSource = readFileSync(
      new URL("./referenceScreens/DashboardReferenceScreen.tsx", import.meta.url),
      "utf8"
    );
    const dashboardModelSource = readFileSync(
      new URL("./referenceScreens/DashboardReferenceModel.ts", import.meta.url),
      "utf8"
    );
    const dashboardContractSource = `${dashboardSource}\n${dashboardModelSource}`;
    const dashboardStyles = readFileSync(
      new URL("./referenceScreens/DashboardReferenceWidgets.css", import.meta.url),
      "utf8"
    );
    const analyticsSummaryBlock = extractCssBlockContaining(
      analyticsStyles,
      ".analytics-reference-summary",
      "grid-template-columns:"
    );
    const analyticsPanelTitleBlock = extractExactCssBlock(
      analyticsStyles,
      ".analytics-reference-panel-title"
    );
    const analyticsSignalBlock = extractExactCssBlock(
      analyticsStyles,
      ".analytics-reference-signal-card"
    );
    const dashboardGridBlock = extractExactCssBlock(
      dashboardStyles,
      ".dashboard-reference-widget-grid"
    );
    const dashboardCardBlock = extractExactCssBlock(
      dashboardStyles,
      ".dashboard-reference-widget-card"
    );

    expect(analyticsSource).toContain('label="Успешность"');
    expect(analyticsSource).toContain("пройдено");
    expect(analyticsSource).toContain("провалено");
    expect(analyticsSource).toContain("сломано");
    expect(analyticsSource).toContain("медленных сигналов");
    expect(analyticsSource).toContain(">Набор<");
    expect(analyticsSource).toContain(">Владелец<");
    expect(analyticsSource).not.toContain('label="Pass rate"');
    expect(analyticsSource).not.toContain(" slow signals");
    expect(analyticsSource).not.toContain(">Suite<");
    expect(analyticsSource).not.toContain(">Owner<");
    expect(dashboardContractSource).toContain('metric: "Успешность"');
    expect(dashboardContractSource).toContain("formatResultCount(aggregate.totalResults)");
    expect(dashboardContractSource).not.toContain('metric: "Pass rate"');
    expect(dashboardContractSource).not.toContain("mute и истории");
    expect(analyticsSummaryBlock).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(analyticsSummaryBlock).toContain("border: 1px solid #d7e1ee");
    expect(analyticsPanelTitleBlock).toContain("min-height: 50px");
    expect(analyticsPanelTitleBlock).toContain("border-bottom: 1px solid #e8edf3");
    expect(analyticsSignalBlock).toContain("border-bottom: 1px solid #e8edf3");
    expect(analyticsSignalBlock).toContain("padding: 10px 0");
    expect(dashboardGridBlock).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(dashboardGridBlock).toContain("gap: 16px");
    expect(dashboardCardBlock).toContain("border: 1px solid #d7e1ee");
    expect(dashboardCardBlock).toContain("border-radius: 10px");
  });

  it("keeps legacy runtime panels free from visible English UI labels", () => {
    const mainSource = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
    const launchesSource = readLaunchesReferenceSource();

    expect(launchesSource).toContain("<small>Ветка</small>");
    expect(launchesSource).toContain('title="Ключи теста"');
    expect(launchesSource).not.toContain("Branch:");
    expect(launchesSource).not.toContain('title="Test keys"');
    expect(launchesSource).not.toContain("Нет test keys");

    for (const forbidden of [
      "Replay status",
      "Replay source",
      "Launch status",
      "Unsupported preview",
      "Content unavailable",
      "No raw failure payloads",
      "No projected mute records",
      "No retention candidates",
      "No quality gate projection",
      "No effective reason effects",
      "Loading retention preview",
      "Retention preview unavailable",
      "Dry-run schedule ready",
      "image metadata only",
      "no raw payload",
      "no signed URL",
      "affected tests",
      "raw failures",
      "project boundary held",
      "scope mismatch"
    ]) {
      expect(mainSource).not.toContain(forbidden);
    }

    for (const required of [
      "Статус replay",
      "Источник replay",
      "Статус запуска",
      "Превью не поддерживается",
      "Контент недоступен",
      "Исходные данные падений не отображаются",
      "Нет записей карантина в проекции",
      "Нет кандидатов хранения",
      "Нет проекции quality gate",
      "Нет effective reason effects",
      "Загрузка превью хранения",
      "Превью хранения недоступно",
      "Расписание dry-run готово",
      "Только метаданные изображения",
      "без исходных данных",
      "без подписанной ссылки",
      "затронуто тестов",
      "raw падений",
      "граница проекта соблюдена",
      "несовпадение scope"
    ]) {
      expect(mainSource).toContain(required);
    }
  });

  it("keeps browser evidence scripts on selected entity deep routes", () => {
    const captureScript = readFileSync(
      new URL("../../../scripts/capture-ui-screenshots.mjs", import.meta.url),
      "utf8"
    );
    const buttonGuardScript = readFileSync(
      new URL("../../../scripts/guard-button-overflow.mjs", import.meta.url),
      "utf8"
    );

    for (const source of [captureScript, buttonGuardScript]) {
      expect(source).toContain("#case/PAY-1042");
      expect(source).toContain("#defects/PAY-337");
      expect(source).not.toContain('hash: "#case"');
      expect(source).not.toContain('hash: "#defects"');
    }
    expect(captureScript).toContain("#launch/L-1289/result/PAY-1042/history");
    expect(captureScript).toContain("#launch/L-1289/result/PAY-1042/defects");
  });

  it("keeps settings dialogs visually aligned with global modal rules", () => {
    const settingsStyles = readFileSync(
      new URL("./referenceScreens/ProjectSettingsReferenceScreen.css", import.meta.url),
      "utf8"
    );
    const globalStyles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    const settingsBackdrop = extractCssBlockContaining(
      settingsStyles,
      ".project-settings__dialog-backdrop",
      "z-index:"
    );
    const globalBackdrop = extractCssBlockContaining(
      globalStyles,
      ".confirm-delete-backdrop",
      "z-index:"
    );
    const settingsDialog = extractCssBlockContaining(
      settingsStyles,
      ".project-settings__dialog",
      "box-shadow:"
    );
    const globalDialog = extractCssBlockContaining(
      globalStyles,
      ".confirm-delete-dialog",
      "box-shadow:"
    );
    const footerBlock = extractCssBlockContaining(
      settingsStyles,
      ".project-settings__dialog footer",
      "background:"
    );
    const settingsButtonBlock = extractCssBlockContaining(
      settingsStyles,
      ".project-settings__button,\n.project-settings__icon-button",
      "cursor: pointer"
    );
    const settingsButtonFocusBlock = extractExactCssBlock(
      settingsStyles,
      ".project-settings__button:focus-visible,\n.project-settings__icon-button:focus-visible"
    );
    const settingsDialogBodyBlock = extractExactCssBlock(
      settingsStyles,
      ".project-settings__dialog-body"
    );
    const globalButtonBlock = extractExactCssBlock(
      globalStyles,
      ".primary-button,\n.icon-button,\n.toolbar button,\n.selected-file button"
    );
    const globalButtonFocusBlock = extractExactCssBlock(
      globalStyles,
      ".primary-button:focus-visible,\n.icon-button:focus-visible,\n.toolbar button:focus-visible,\n.selected-file button:focus-visible,\n.confirm-delete-secondary:focus-visible,\n.confirm-delete-danger:focus-visible"
    );
    const checkRowBlock = extractCssBlockContaining(
      settingsStyles,
      ".project-settings__dialog-check-row",
      "display: flex"
    );

    expect(settingsBackdrop).toContain("z-index: 1000");
    expect(settingsBackdrop).toContain("display: grid");
    expect(settingsBackdrop).toContain("place-items: center");
    expect(settingsBackdrop).toContain("background: rgb(15 23 42 / 48%)");
    expect(globalBackdrop).toContain("background: rgb(15 23 42 / 48%)");
    expect(settingsDialog).toContain("border: 1px solid var(--project-line)");
    expect(settingsDialog).toContain("max-height: calc(100vh - 40px)");
    expect(settingsDialog).toContain("overflow: hidden");
    expect(settingsDialog).toContain("box-shadow: 0 18px 48px rgb(15 23 42 / 18%)");
    expect(globalDialog).toContain("box-shadow: 0 18px 48px rgb(15 23 42 / 18%)");
    expect(settingsButtonBlock).toContain("min-width: 36px");
    expect(settingsButtonBlock).toContain("white-space: nowrap");
    expect(globalButtonBlock).toContain("min-width: 36px");
    expect(globalButtonBlock).toContain("white-space: nowrap");
    expect(settingsButtonFocusBlock).toContain("outline: 3px solid rgb(49 95 211 / 18%)");
    expect(globalButtonFocusBlock).toContain("outline: 3px solid rgb(49 95 211 / 18%)");
    expect(footerBlock).toContain("background: #f8fafc");
    expect(footerBlock).toContain("flex-wrap: wrap");
    expect(settingsDialogBodyBlock).toContain("overflow: auto");
    expect(checkRowBlock).toContain("display: flex");
    expect(checkRowBlock).toContain("background: #f8fafc");
  });

  it("keeps reference tabs on one underline-based visual language", () => {
    const settingsStyles = readFileSync(
      new URL("./referenceScreens/ProjectSettingsReferenceScreen.css", import.meta.url),
      "utf8"
    );
    const launchesStyles = readFileSync(
      new URL("./referenceScreens/LaunchesReferenceScreen.css", import.meta.url),
      "utf8"
    );
    const testCaseStyles = readFileSync(
      new URL("./referenceScreens/TestCaseDetailReferenceScreen.css", import.meta.url),
      "utf8"
    );
    const tabSources = [
      [
        settingsStyles,
        ".project-settings__tabs",
        ".project-settings__tabs button.active::after",
        "min-height: calc(42px + var(--th-font-heading-delta))",
        "background: #2563eb",
        "scrollbar-width: none"
      ],
      [
        launchesStyles,
        ".launches-reference-tabs",
        '.launches-reference-tabs button[aria-current="page"]::after',
        "min-height: calc(44px + var(--th-font-heading-delta))",
        "background: #2563eb",
        "scrollbar-width: none"
      ],
      [
        launchesStyles,
        ".launches-reference-result-tabs",
        ".launches-reference-result-tabs button.active::after",
        "min-height: calc(44px + var(--th-font-heading-delta))",
        "background: #2563eb",
        "scrollbar-width: none"
      ],
      [
        testCaseStyles,
        ".tc-detail-reference-tabs",
        ".tc-detail-reference-tabs button.active::after",
        "min-height: calc(44px + var(--th-font-heading-delta))",
        "background: #2563eb",
        "scrollbar-width: none"
      ]
    ] as const;

    for (const [
      styles,
      tabsSelector,
      underlineSelector,
      minHeight,
      underlineColor,
      scrollbar
    ] of tabSources) {
      const tabsBlock = extractExactCssBlock(styles, tabsSelector);
      const underlineBlock = extractExactCssBlock(styles, underlineSelector);

      expect(tabsBlock).toContain(minHeight);
      expect(tabsBlock).toContain("overflow-x: auto");
      expect(tabsBlock).toContain(scrollbar);
      expect(underlineBlock).toContain("height: 2px");
      expect(underlineBlock).toContain(underlineColor);
    }

    expect(settingsStyles).not.toContain(".project-settings__tabs button.active {\n  border-color");
    expect(settingsStyles).not.toContain("background: #edf4ff");
  });

  it("keeps legacy product tabs on the same underline-based visual language", () => {
    const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    const tabSources = [
      [".tabs", ".tabs .active::after"],
      [".case-detail-tabs", ".case-detail-tabs button.active::after"],
      [".defect-detail-tabs", ".defect-detail-tabs .active::after"]
    ] as const;

    for (const [tabsSelector, underlineSelector] of tabSources) {
      const tabsBlock = extractExactCssBlock(styles, tabsSelector);
      const underlineBlock = extractExactCssBlock(styles, underlineSelector);

      expect(tabsBlock).toContain("min-height: calc(42px + var(--th-font-heading-delta))");
      expect(tabsBlock).toContain("overflow-x: auto");
      expect(tabsBlock).toContain("scrollbar-width: none");
      expect(underlineBlock).toContain("height: 2px");
      expect(underlineBlock).toContain("background: #155ca2");
    }

    expect(styles).not.toContain("border-bottom-color: #286eea");
    expect(styles).not.toContain("border-bottom-color: #1d64d8");
    expect(styles).not.toContain("border-bottom-color: #315fd3");
  });

  it("separates retention global cleanup settings from artifact-type policy rows", () => {
    testGlobal.localStorage = fakeLocalStorage({
      "testhistory.actorId": "admin",
      "testhistory.userRole": "admin"
    });
    const html = renderToStaticMarkup(
      React.createElement(ProjectSettingsReferenceScreen, {
        routeTab: "retention",
        settings: demoProjectSettings
      })
    );
    const source = readFileSync(
      new URL("./referenceScreens/ProjectSettingsReferenceScreen.tsx", import.meta.url),
      "utf8"
    );

    expect(html).toContain("Общие правила очистки");
    expect(html).toContain("Сроки по типам артефактов");
    expect(html).toContain("project-settings__settings-list");
    expect(html).toContain("Скриншоты: пройден, дней");
    expect(html).toContain("Скриншоты: провален, дней");
    expect(html).toContain("Скриншоты: карантин, дней");
    expect(html).toContain("Скриншоты: лимит, MB");
    expect(source).not.toContain('<div className="project-settings__settings-form">');
  });
});

function extractFunctionBody(source: string, marker: string): string {
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = source.indexOf("{", start);
  expect(bodyStart).toBeGreaterThanOrEqual(0);
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart, index + 1);
      }
    }
  }

  throw new Error(`Function body not found for ${marker}`);
}

function fakeLocalStorage(initial: Record<string, string>): Storage {
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

function readLaunchesReferenceSource(): string {
  return [
    "./referenceScreens/LaunchesReferenceScreen.tsx",
    "./referenceScreens/LaunchesReferenceTabs.tsx",
    "./referenceScreens/LaunchesResultReport.tsx"
  ]
    .map((sourcePath) => readFileSync(new URL(sourcePath, import.meta.url), "utf8"))
    .join("\n");
}

function extractCssBlockContaining(source: string, selector: string, text: string): string {
  let searchFrom = 0;
  while (searchFrom < source.length) {
    const start = source.indexOf(selector, searchFrom);
    expect(start).toBeGreaterThanOrEqual(0);
    const bodyStart = source.indexOf("{", start);
    const bodyEnd = source.indexOf("}", bodyStart);
    expect(bodyStart).toBeGreaterThanOrEqual(0);
    expect(bodyEnd).toBeGreaterThan(bodyStart);
    const block = source.slice(bodyStart, bodyEnd + 1);
    if (block.includes(text)) {
      return block;
    }
    searchFrom = bodyEnd + 1;
  }

  throw new Error(`CSS block with ${selector} and ${text} was not found`);
}

function extractExactCssBlock(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`(^|\\n)${escapedSelector}\\s*\\{([^}]*)\\}`));

  if (match === null) {
    throw new Error(`Exact CSS block with ${selector} was not found`);
  }

  return `{${match[2]}}`;
}
