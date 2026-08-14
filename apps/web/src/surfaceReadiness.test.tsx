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
import { filterProjects, projects } from "./referenceScreens/ProjectsReferenceScreen.js";
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

describe("worker UI surface readiness", () => {
  it("keeps launch and launch result deep links as stable routes", () => {
    expect(getModeFromHash("#launch/L-1289/result/AUTH-483420")).toBe("launch");
    expect(getRouteFromHash("#launch/L-1289")).toEqual({
      launchId: "L-1289",
      mode: "launch",
      resultId: undefined
    });
    expect(getRouteFromHash("#launch/L-1289/result/AUTH-483420")).toEqual({
      launchId: "L-1289",
      mode: "launch",
      resultId: "AUTH-483420"
    });
  });

  it("keeps every tabbed level addressable through a stable URL hash", () => {
    expect(getRouteFromHash("#settings/access")).toMatchObject({
      mode: "settings",
      settingsTab: "access"
    });
    expect(getRouteFromHash("#settings/tokens")).toMatchObject({
      mode: "settings",
      settingsTab: "tokens"
    });
    expect(getRouteFromHash("#settings/integrations")).toMatchObject({
      mode: "settings",
      settingsTab: "integrations"
    });
    expect(getRouteFromHash("#settings/retention")).toMatchObject({
      mode: "settings",
      settingsTab: "retention"
    });
    expect(getRouteFromHash("#settings/fields")).toMatchObject({
      mode: "settings",
      settingsTab: "fields"
    });
    expect(getRouteFromHash("#case/history")).toMatchObject({
      mode: "case",
      testCaseTab: "history"
    });
    expect(getRouteFromHash("#case/AUTH-483420")).toMatchObject({
      mode: "case",
      testCaseId: "AUTH-483420"
    });
    expect(getRouteFromHash("#case/AUTH-483420/history")).toMatchObject({
      mode: "case",
      testCaseId: "AUTH-483420",
      testCaseTab: "history"
    });
    expect(getRouteFromHash("#case/defects")).toMatchObject({
      mode: "case",
      testCaseTab: "defects"
    });
    expect(getRouteFromHash("#defects/PAY-337")).toMatchObject({
      defectId: "PAY-337",
      mode: "defects"
    });
    expect(getRouteFromHash("#launch/L-1289/results")).toMatchObject({
      launchId: "L-1289",
      launchTab: "results",
      mode: "launch"
    });
    expect(getRouteFromHash("#launch/L-1289/errors")).toMatchObject({
      launchId: "L-1289",
      launchTab: "errors",
      mode: "launch"
    });
    expect(getRouteFromHash("#launch/L-1289/result/PAY-1042/history")).toMatchObject({
      launchId: "L-1289",
      mode: "launch",
      resultId: "PAY-1042",
      resultTab: "history"
    });
    expect(getRouteFromHash("#launch/L-1289/result/PAY-1042/defects")).toMatchObject({
      launchId: "L-1289",
      mode: "launch",
      resultId: "PAY-1042",
      resultTab: "defects"
    });
  });

  it("renders every settings URL tab as scoped ready content without placeholder or WIP copy", () => {
    const expectedByTab = new Map([
      ["access", "Участники проекта"],
      ["tokens", "Личные токены"],
      ["visibility", "Видимость проекта"],
      ["integrations", "Провайдеры ссылок"],
      ["retention", "Хранение артефактов"],
      ["fields", "Маппинг кастомных полей"]
    ]);

    const previousLocalStorage = testGlobal.localStorage;
    testGlobal.localStorage = fakeLocalStorage({
      "testhistory.actorId": "admin",
      "testhistory.userRole": "admin"
    });

    try {
      for (const [settingsRouteTab, expectedText] of expectedByTab) {
        const markup = renderWorkspaceSurface(
          "settings",
          onlineApiState,
          demoM1Workspace,
          undefined,
          0,
          {
            settingsRouteTab
          }
        );
        const text = visibleText(markup);

        expect(text, `${settingsRouteTab} settings tab should render scoped content`).toContain(
          expectedText
        );
        expect(
          markup,
          `${settingsRouteTab} settings tab should mark the route tab active`
        ).toContain('aria-pressed="true"');
        expect(
          text,
          `${settingsRouteTab} settings tab should not expose placeholder copy`
        ).not.toMatch(/placeholder/i);
        expect(text, `${settingsRouteTab} settings tab should not expose WIP copy`).not.toContain(
          "WIP"
        );
        expect(
          text,
          `${settingsRouteTab} settings tab should not expose English todo copy`
        ).not.toMatch(/\b(todo|coming soon|not implemented)\b/i);
      }
    } finally {
      if (previousLocalStorage === undefined) {
        Reflect.deleteProperty(testGlobal, "localStorage");
      } else {
        testGlobal.localStorage = previousLocalStorage;
      }
    }
  });

  it("reports background loading without rendering a layout-shifting workspace bar", () => {
    const markup = renderWorkspaceSurface("launch", onlineApiState, demoM1Workspace, undefined, 0, {
      workspaceLoading: true
    });

    expect(markup).toContain('class="workspace-loading-indicator"');
    expect(markup).toContain("Обновляем данные");
    expect(markup).not.toContain("workspace-loading-bar");
    expect(markup).not.toContain("Списки и детали подгружаются");
  });

  it("renders selected test case and defect URL targets as scoped detail content", () => {
    const caseMarkup = renderWorkspaceSurface(
      "case",
      onlineApiState,
      demoM1Workspace,
      "AUTH-483420",
      0,
      { testCaseRouteId: "PAY-1042", testCaseRouteTab: "defects" }
    );
    const defectMarkup = renderWorkspaceSurface(
      "defects",
      onlineApiState,
      demoM1Workspace,
      "AUTH-483420",
      0,
      { defectRouteId: "PAY-337" }
    );
    const caseText = visibleText(caseMarkup);
    const defectText = visibleText(defectMarkup);

    expect(caseText).toContain("Создание заказа с сохраненной картой");
    expect(caseText).toContain("PAY-337");
    expect(caseMarkup).toContain('aria-current="page"');
    expect(defectText).toContain("PAY-337");
    expect(defectMarkup).toContain('aria-pressed="true"');
    expect(caseText + defectText).not.toContain("WIP");
  });

  it("keeps ready Test cases surface free of visible WIP controls", () => {
    const markup = renderSurface("case", onlineApiState);
    const wipButtons = buttonsContainingText(markup, "WIP");

    expect(wipButtons).toEqual([]);
    expect(visibleText(markup)).not.toContain("WIP");
  });

  it("keeps shell navigation explicit: ready routes are open and hidden routes stay absent", () => {
    const markup = renderSurface("launch", onlineApiState);
    const visibleReadyModes = readyWorkspaceModes.filter((mode) => mode !== "jobs");

    for (const mode of visibleReadyModes) {
      expect(markup, `${mode} nav should be clickable`).toContain(`>${modeLabelsForTest[mode]}<`);
    }
    expect(markup).not.toContain("<span>Задачи</span>");
    expect(getModeFromHash("#jobs")).toBe("launch");
    expect(markup).not.toContain("WIP");
  });

  it("renders every ready route with relevant nonblank content in demo, loading, error, and offline states", () => {
    for (const [stateName, apiState] of Object.entries(apiStates)) {
      for (const mode of readyWorkspaceModes) {
        const markup = renderSurface(mode, apiState);
        const text = visibleText(markup);

        expect(text, `${mode} should be nonblank in ${stateName}`).toContain("TestHistory");
        expect(text, `${mode} should include its route label in ${stateName}`).toContain(
          mode === "case" ? "Тест-кейсы" : mode === "launch" ? "Запуски" : modeLabelsForTest[mode]
        );
        expect(text.toLowerCase(), `${mode} should not expose placeholder copy`).not.toContain(
          "placeholder"
        );
        if (!(
          mode === "launch" ||
          mode === "projects" ||
          mode === "case" ||
          mode === "defects" ||
          mode === "dashboard" ||
          mode === "analytics" ||
          mode === "settings" ||
          mode === "automation"
        )) {
          expect(text, `${mode} should expose ${stateName} state copy`).toContain(
            expectedStateCopy[stateName]
          );
        }
        expect(text, `${mode} should not render the generic WIP page`).not.toContain(
          "intentionally disabled in navigation"
        );
      }
    }
  });

  it("renders Projects as a Russian reference list with ready search and no unfinished actions", () => {
    const markup = renderSurface("projects", onlineApiState);
    const text = visibleText(markup);
    const actionMarkup =
      markup.match(/<div class="projects-reference__actions"[\s\S]*?<\/div>/)?.[0] ?? "";
    const optionsButton = buttonContaining(actionMarkup, "Опции");
    const createButton = buttonContaining(actionMarkup, "Проект");

    expect(text).toContain("Проекты");
    expect(text).toContain("Поиск и фильтрация");
    expect(text).toContain("Web Sandbox");
    expect(text).toContain("#1");
    expect(text).toContain("Тестовый проект для проверки web-интерфейса");
    expect(markup).toContain("Избранный проект");
    expect(text).toContain("Текущий");
    expect(markup).toContain("Метрики проекта");
    expect(text).not.toContain("Участники");
    expect(projects).toHaveLength(1);
    expect(text).toContain("100%");
    expect(filterProjects(projects, "web").map((project) => project.name)).toEqual(["Web Sandbox"]);
    expect(filterProjects(projects, "100").map((project) => project.name)).toEqual(["Web Sandbox"]);
    expect(optionsButton).toBeUndefined();
    expect(createButton).toBeUndefined();
    expect(text).not.toContain("WIP");
    expect(text).not.toContain("Runtime model");
    expect(text).not.toContain("Ingestion and processing pipeline");
    expect(text).not.toContain("Прием архивов");
    expect(text).not.toContain("Project list placeholder");
  });

  it("renders every ready route as a Russian denied shell without leaking scoped auth details", () => {
    const forbiddenValues = [
      ...(m5DeniedPermissionDeniedError.requiredScopes ?? []),
      ...(m5DeniedPermissionDeniedError.requiredRoles ?? []),
      ...(m5DeniedPermissionDeniedError.requiredPermissions ?? []),
      m5DeniedPermissionDeniedError.projectId,
      m5DeniedPermissionDeniedError.resource?.id,
      m5DeniedPermissionDeniedError.traceId,
      "PR-1289 Checkout Regression",
      "Авторизация по логину и паролю",
      "super-secret"
    ].filter((value): value is string => typeof value === "string");

    for (const mode of readyWorkspaceModes) {
      const markup = renderSurface(mode, m5DeniedApiState);
      const text = visibleText(markup);

      expect(text, `${mode} should not render the denied contract shape`).not.toContain(
        "PermissionDeniedError"
      );
      expect(text, `${mode} should show denied shell title`).toContain("Доступ закрыт");
      expect(text, `${mode} should identify the requested section`).toContain(
        modeLabelsForTest[mode]
      );
      expect(text, `${mode} should include project denied content`).toContain(
        "Доступ к проекту закрыт"
      );
      expect(text, `${mode} should include launch denied content`).toContain("Запуски скрыты");
      expect(text, `${mode} should include artifact denied content`).toContain("Вложения закрыты");
      expect(text, `${mode} should not include removed analytics denied content`).not.toContain(
        "Аналитика закрыта"
      );
      expect(text, `${mode} should include mutation disabled content`).toContain(
        "Изменения отключены"
      );
      expect(text, `${mode} should mark denied sections ready`).toContain("Готово");

      for (const forbidden of forbiddenValues) {
        expect(markup, `${mode} should not leak ${forbidden}`).not.toContain(forbidden);
        expect(text, `${mode} should not visibly leak ${forbidden}`).not.toContain(forbidden);
      }

      for (const label of [
        "Запросить доступ",
        "Открыть запуск",
        "Скачать вложение",
        "Сохранить изменение"
      ]) {
        const button = buttonContaining(markup, label);
        expect(text, `${mode} ${label} read-only action should be visible`).toContain(label);
        expect(markup, `${mode} ${label} action should be styled as read-only`).toContain(
          "denied-readonly-action"
        );
        expect(button, `${mode} ${label} should not be a fake disabled action`).toBeUndefined();
      }
      expect(text, `${mode} denied shell should not expose unfinished markers`).not.toContain(
        "WIP"
      );
    }
  });

  it("redacts PermissionDeniedError UI model fields before rendering", () => {
    const model = getDeniedUiModel({
      ...m5DeniedPermissionDeniedError,
      message: "Missing projects:read scope for bearer token"
    });
    const serialized = JSON.stringify(model);

    expect(model.shape).toBe("PermissionDeniedError");
    expect(model.message).toBe("Доступ к проекту закрыт");
    expect(serialized).not.toContain("projects:read");
    expect(serialized).not.toContain("bearer");
    expect(serialized).not.toContain("project-internal-7421");
    expect(serialized).not.toContain("launch-internal-8421");
    expect(serialized).not.toContain("trace-internal-9421");
  });

  it("keeps the Test cases route scoped to the case list and selected case details", () => {
    const markup = renderSurface("case", onlineApiState);
    const text = visibleText(markup);

    expect(text).toContain("Тест-кейсы");
    expect(markup).toContain("thql-search");
    expect(markup).toContain('aria-label="THQL поиск тест-кейсов"');
    expect(markup).toContain("Проблемные");
    expect(markup).toContain("Фильтры");
    expect(text).not.toContain("BASE_CHECK_IMAGE_...");
    expect(text).not.toContain("Не замьючены");
    expect(text).toContain("Обзор");
    expect(text).toContain("История результатов");
    expect(text).toContain("Сценарий из тестового результата");
    expect(text).toContain("Описание");
    expect(text).toContain("Длительность");
    expect(text).not.toContain("Ожидаемая длительность");
    expect(text).not.toContain("История идентичности");
    expect(text).not.toContain("Сравнение истории");
    for (const forbiddenLabel of [
      "All test cases",
      "Search test cases",
      "Expected result",
      "Display",
      "Import",
      "Bulk edit",
      "Identity history",
      "History compare",
      "Permission audit",
      "Invariant state",
      "Refresh compare",
      "Next compare page",
      "Raw metadata"
    ]) {
      expect(text, `Test cases should not expose English label ${forbiddenLabel}`).not.toContain(
        forbiddenLabel
      );
    }
    expect(text).not.toContain("Runtime model");
    expect(text).not.toContain("Launch lifecycle");
    expect(text).not.toContain("Ingestion and processing pipeline");
    expect(text).not.toContain("Queue and workers");
    expect(text).not.toContain("Telemetry WIP");
    expect(text).not.toContain("Прием архивов");
    expect(text).not.toContain("archive.unpack");
  });

  it("renders selected test-case detail as Russian ready tabs", () => {
    const markup = renderSurface("case", onlineApiState);
    const text = visibleText(markup);
    const tabsMarkup =
      markup.match(/<nav class="tc-detail-reference-tabs"[\s\S]*?<\/nav>/)?.[0] ?? "";

    for (const label of ["Обзор", "История результатов", "Вложения", "Дефекты"]) {
      expect(text).toContain(label);
      const button = buttonContaining(tabsMarkup, label);
      expect(button, `${label} tab should be visible`).toBeDefined();
      expect(
        button,
        `${label} tab should be clickable because it has scoped content`
      ).not.toContain("disabled");
      expect(button, `${label} tab should not be a fake WIP tab`).not.toContain("WIP");
    }

    const quarantineButton = buttonContaining(tabsMarkup, "Карантин");
    expect(quarantineButton, "quarantine tab should stay visible").toBeDefined();
    expect(quarantineButton, "quarantine tab should be disabled without quarantine").toContain(
      "disabled"
    );
    expect(quarantineButton, "quarantine tab should not show a zero counter").not.toContain(
      "<span>0</span>"
    );
    expect(allButtons(tabsMarkup).at(-1), "quarantine tab should be last").toBe(quarantineButton);
  });

  it("keeps quarantine tabs last with a single counter only for quarantined tests", () => {
    const caseMarkup = renderWorkspaceSurface(
      "case",
      onlineApiState,
      demoM1Workspace,
      "PAY-1042",
      0,
      { testCaseRouteTab: "quarantine" }
    );
    const caseTabsMarkup =
      caseMarkup.match(/<nav class="tc-detail-reference-tabs"[\s\S]*?<\/nav>/)?.[0] ?? "";
    const caseQuarantineButton = buttonContaining(caseTabsMarkup, "Карантин");

    expect(caseQuarantineButton).toBeDefined();
    expect(caseQuarantineButton).not.toContain("disabled");
    expect(caseQuarantineButton).toContain('<span class="typography-role-meta">1</span>');
    expect(allButtons(caseTabsMarkup).at(-1)).toBe(caseQuarantineButton);

    const launchMarkup = renderWorkspaceSurface(
      "launch",
      onlineApiState,
      demoM1Workspace,
      "PAY-1042",
      1,
      { launchRouteResultTab: "quarantine" }
    );
    const launchTabsMarkup =
      launchMarkup.match(/<nav class="launches-reference-result-tabs"[\s\S]*?<\/nav>/)?.[0] ?? "";
    const launchQuarantineButton = buttonContaining(launchTabsMarkup, "Карантин");

    expect(launchQuarantineButton).toBeDefined();
    expect(launchQuarantineButton).not.toContain("disabled");
    expect(launchQuarantineButton).toContain('<span class="typography-role-meta">1</span>');
    expect(allButtons(launchTabsMarkup).at(-1)).toBe(launchQuarantineButton);
  });

  it("renders only the selected test-case tab content", () => {
    const overviewText = visibleText(renderSelectedCaseTab("overview"));
    const historyText = visibleText(renderSelectedCaseTab("history"));
    const scenarioText = visibleText(renderSelectedCaseTab("scenario"));
    const attachmentText = visibleText(renderSelectedCaseTab("attachments"));
    const quarantineText = visibleText(renderSelectedCaseTab("quarantine"));
    const defectsText = visibleText(renderSelectedCaseTab("defects"));
    const changelogText = visibleText(renderSelectedCaseTab("changelog"));

    expect(overviewText).toContain("Описание");
    expect(overviewText).toContain("Ожидаемый результат");
    expect(overviewText).not.toContain("История идентичности");
    expect(overviewText).not.toContain("Сравнение истории");

    expect(historyText).toContain("История идентичности");
    expect(historyText).toContain("Сравнение истории");
    expect(historyText).not.toContain("Ожидаемый результат");
    expect(historyText).not.toContain("Сценарий");

    expect(scenarioText).toContain("Сценарий");
    expect(scenarioText).not.toContain("История идентичности");
    expect(scenarioText).not.toContain("Сравнение истории");
    expect(scenarioText).not.toContain("Ожидаемый результат");

    expect(attachmentText).toContain("Вложения");
    expect(attachmentText).toContain("только чтение");
    expect(quarantineText).toContain("Карантины");
    expect(quarantineText).toContain("Текущий статус");
    expect(defectsText).toContain("Дефекты");
    expect(defectsText).toContain("Активные связи");
    expect(changelogText).toContain("Журнал изменений");
    expect(changelogText).toContain("Запуск #1285");

    for (const text of [attachmentText, quarantineText, defectsText, changelogText]) {
      expect(text).not.toContain("WIP");
      expect(text).not.toContain("в работе");
    }
  });

  it("shows identity correction states in the test case list and selected case details", () => {
    const markup = renderSurface("case", onlineApiState);
    const text = visibleText(markup);
    const historyText = visibleText(renderSelectedCaseTab("history"));

    expect(text).toContain("Тест-кейсы");
    expect(text).toContain("Обзор");
    expect(text).toContain("История результатов");
    expect(text).not.toContain("История идентичности");
    expect(text).not.toContain("Сравнение истории");
    expect(historyText).toContain("Уверенность 98%");
    expect(historyText).toContain("web.auth.SignInTest#authenticate:username-password");
    expect(historyText).toContain("Automation rename matched the existing AllureID");
    expect(historyText).toContain("identity-correction-worker");
    expect(renderSelectedCaseTab("history")).toContain('aria-label="Состояние идентичности"');
  });

  it("renders each selected identity audit state without adding active case-only controls", () => {
    const expectedById = new Map([
      ["AUTH-483420", "Идентичность исправлена"],
      ["AUTH-483421", "История разделена"],
      ["PAY-1042", "История объединена"],
      ["CAT-228", "Сомнительное совпадение"]
    ]);

    for (const [selectedId, expectedState] of expectedById) {
      const markup = renderSelectedCaseTab("history", onlineApiState, demoM1Workspace, selectedId);
      const text = visibleText(markup);
      const identitySection = markup.match(
        /<section class="detail-section identity-history">[\s\S]*?<\/section>/
      )?.[0];

      expect(text, selectedId).toContain(expectedState);
      expect(text, selectedId).toContain("Идентификатор истории");
      expect(text, selectedId).toContain("Канонический кейс");
      expect(text, selectedId).toContain("Изменено");
      expect(text, selectedId).toContain("Автор");
      expect(identitySection, selectedId).toBeDefined();
      expect(identitySection, selectedId).not.toContain("<button");
    }
  });

  it("renders selected-case history compare as paged M2-E data with read-only evidence actions", () => {
    const markup = renderSelectedCaseTab("history");
    const text = visibleText(markup);

    expect(text).toContain("Сравнение истории");
    expect(text).toContain("Постраничный diff истории выбранного тест-кейса");
    expect(text).toContain("Предыдущий Nightly Auth Smoke");
    expect(text).toContain("Текущий PR-1289 Checkout Regression");
    expect(text).toContain("Изменился статус");
    expect(text).toContain("Изменились метки");
    expect(text).toContain("Изменился исполнитель");
    expect(text).toContain("Изменились ветка и сборка");
    expect(text).toContain("Изменилась сигнатура дефекта");
    expect(text).toContain("Изменилась длительность");
    expect(text).toContain("Автор сравнения history-compare-api");
    expect(text).toContain("Проект My project");
    expect(text).toContain("Права доступа Чтение разрешено с редакцией");
    expect(text).toContain("Редакция Редакция применена: labels.securityTier");
    expect(text).toContain("Аудит прав");
    expect(text).toContain("Аудит готов");
    expect(text).toContain("Автор аудита history-compare-api");
    expect(text).toContain("Проект аудита My project");
    expect(text).toContain("События replay 12");
    expect(text).toContain("Принято 10");
    expect(text).toContain("Запрещено 0");
    expect(text).toContain("Частично 2");
    expect(text).toContain("Дубликаты 1");
    expect(text).toContain("Игнорировано 0");
    expect(text).toContain("Дайджест проекции hcmp-projection-digest-auth-001");
    expect(text).toContain("Дайджест источника sha256:raw-history-auth-digest-001");
    expect(text).toContain("Раскрытие источника Чувствительные исходные данные скрыты");
    expect(text).toContain("Причина доступа [redacted]");
    expect(text).toContain("Инварианты аудита прав");
    expect(text).toContain("Инварианты готовы");
    expect(text).toContain("Детерминированность пройдено");
    expect(text).toContain("Пересчет пройдено");
    expect(text).toContain("Область проекта пройдено");
    expect(text).toContain("Область автора пройдено");
    expect(text).toContain("Append-only пройдено");
    expect(text).toContain("Сырые входы сохранены пройдено");
    expect(text).toContain("Редакция пройдено");
    expect(text).toContain("Без мутаций пройдено");
    expect(text).toContain("Дайджест проекции sha256:hcmp-invariant-auth-001");
    expect(text).toContain("Дайджест пересчета sha256:hcmp-invariant-auth-001");
    expect(text).toContain("4 исходных элементов сохранено, 2 дайджеста, сырые входы скрыты");
    expect(text).toContain("События инвариантов");
    expect(text).toContain("1-2 из 2 событий");
    expect(text).toContain("сырые входы сравнения скрыты");
    expect(text).toContain("Изменения 1-6 из 8");
    expect(text).toContain("Сравнение истории готово");
    expect(markup).toContain('aria-label="Selected test case history compare"');
    expect(markup).toContain('aria-label="History compare permission scope"');
    expect(markup).toContain('aria-label="History compare permission audit"');
    expect(markup).toContain('aria-label="History compare permission audit invariants"');
    expect(markup).toContain("Сравнение из read model");
    expect(markup).toContain("Следующая страница в API");

    for (const label of [
      "Сравнение из read model",
      "Следующая страница в API",
      "Инварианты из read model",
      "Пересчет сверяется дайджестом",
      "Аудит открыт на странице"
    ]) {
      const button = buttonContaining(markup, label);
      expect(markup, `${label} read-only status should be visible`).toContain(label);
      expect(button, `${label} should not be a fake disabled action`).toBeUndefined();
    }
    expect(text).not.toContain("WIP");
  });
});
