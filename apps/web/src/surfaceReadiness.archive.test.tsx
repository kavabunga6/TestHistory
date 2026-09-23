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

describe("archive intake surface readiness", () => {
  it("renders archive intake diagnostics only in Jobs with state coverage", () => {
    const launchMarkup = renderSurface("launch", archiveReadyApiState);
    const jobsMarkup = renderSurface("jobs", archiveReadyApiState);
    const loadingJobsText = visibleText(renderSurface("jobs", apiStates.loading!));
    const deniedLaunchText = visibleText(renderSurface("launch", m5DeniedApiState));
    const deniedJobsText = visibleText(renderSurface("jobs", m5DeniedApiState));
    const deniedCaseText = visibleText(renderSurface("case", m5DeniedApiState));
    const caseText = visibleText(renderSurface("case", archiveReadyApiState));
    const analyticsText = visibleText(renderSurface("analytics", archiveReadyApiState));
    const launchText = visibleText(launchMarkup);
    const jobsText = visibleText(jobsMarkup);

    expect(launchText).not.toContain("Прием архивов");
    expect(jobsText).toContain("Задачи: загрузка архивов");
    expect(jobsText).toContain("Прием архивов запланирован");
    expect(jobsText).toContain("Режим архива");
    expect(jobsText).toContain("API-границу");
    expect(jobsText).toContain("Порог сжатия");
    expect(jobsText).toContain("Параллельность загрузки");
    expect(jobsText).toContain("Ограниченная диагностика воркеров");
    expect(jobsText).toContain("Показано 3 из 4");
    expect(countMatches(launchMarkup, /class="archive-worker-row/g)).toBe(0);
    expect(countMatches(jobsMarkup, /class="archive-worker-row/g)).toBe(3);

    expect(loadingJobsText).toMatch(/Loading archive intake|Загрузка|Загружаем/);
    expect(deniedLaunchText).not.toContain("Доступ к приему архивов закрыт");
    expect(deniedJobsText).not.toContain("Доступ к приему архивов закрыт");
    expect(deniedJobsText).toContain("Доступ закрыт");

    for (const label of [
      "Загрузка через API",
      "Повтор через очередь воркера",
      "Диагностика без мутаций"
    ]) {
      const launchButton = buttonContaining(launchMarkup, label);
      const jobsAction = jobsMarkup.includes(label);
      expect(launchButton, `${label} should not render in Launches`).toBeUndefined();
      expect(jobsAction, `${label} read-only action should render in Jobs`).toBe(true);
    }
    expect(jobsText).not.toContain("WIP");

    expect(caseText).not.toContain("Прием архивов");
    expect(caseText).not.toContain("archive.unpack");
    expect(analyticsText).not.toContain("Прием архивов");
    expect(deniedCaseText).not.toContain("Доступ к приему архивов закрыт");
  });

  it("renders archive status read metadata, bounded diagnostics, and read-only job evidence", () => {
    const jobsMarkup = renderSurface("jobs", archiveStatusReadyApiState);
    const launchMarkup = renderSurface("launch", archiveStatusReadyApiState);
    const jobsText = visibleText(jobsMarkup);
    const launchText = visibleText(launchMarkup);
    const caseText = visibleText(renderSurface("case", archiveStatusReadyApiState));
    const defectsText = visibleText(renderSurface("defects", archiveStatusReadyApiState));
    const analyticsText = visibleText(renderSurface("analytics", archiveStatusReadyApiState));

    expect(launchText).not.toContain("Прием архивов");
    expect(jobsText).toContain("Проект project-1");
    expect(jobsText).toContain("Автор archive-status-ui");
    expect(jobsText).toContain("Доступ uploads:read + launches:read");
    expect(jobsText).toContain("Запуск launch-archive-status");
    expect(jobsText).toContain("Режим чтения только чтение");
    expect(jobsText).toContain("Границы 3 из 3 диагностик, лимит 5");
    expect(jobsText).toContain("Чтение статуса");
    expect(jobsText).toContain("2 задач");
    expect(jobsText).toContain("Страница диагностики");
    expect(jobsText).toContain("3/3");
    expect(jobsText).toContain("nightly-allure.zip");
    expect(jobsText).toContain("retry-pack.zip");
    expect(jobsText).toContain("6/6 accepted, 0 ignored");
    expect(jobsText).toContain("3/4 accepted, 1 ignored");
    expect(jobsText).toContain("archive.worker.completed");
    expect(jobsText).toContain("archive.entry.warning");
    expect(jobsText).toContain("Показано 3 из 3");
    expect(countMatches(launchMarkup, /class="archive-worker-row/g)).toBe(0);
    expect(countMatches(jobsMarkup, /class="archive-worker-row/g)).toBe(3);

    for (const label of [
      "Загрузка через API",
      "Повтор через очередь воркера",
      "Диагностика без мутаций"
    ]) {
      expect(buttonContaining(launchMarkup, label)).toBeUndefined();
      expect(jobsMarkup).toContain(label);
    }
    expect(jobsText).not.toContain("WIP");

    expect(caseText).not.toContain("Прием архивов");
    expect(caseText).not.toContain("nightly-allure.zip");
    expect(defectsText).not.toContain("Прием архивов");
    expect(analyticsText).not.toContain("Прием архивов");
  });

  it("renders materialized archive diagnostic replay fixture summaries only in archive intake contexts", () => {
    const launchMarkup = renderSurface("launch", archiveFixtureReadyApiState);
    const jobsMarkup = renderSurface("jobs", archiveFixtureReadyApiState);
    const launchText = visibleText(launchMarkup);
    const jobsText = visibleText(jobsMarkup);

    expect(launchMarkup).not.toContain('aria-label="Доказательства синтетических фикстур replay"');
    expect(launchText).not.toContain("Диагностический replay архива");
    expect(jobsMarkup).toMatch(
      /aria-label="Задачи archive intake status"[\s\S]*aria-label="Доказательства синтетических фикстур replay"/
    );
    expect(jobsText).toContain("Диагностический replay архива");
    expect(jobsText).toContain("Синтетические фикстуры replay готовы");
    expect(jobsText).toContain(
      "Материализованные сводки фикстур подтверждают совместимость replay архива"
    );
    expect(jobsText).toContain("Фикстуры 3 фикстур");
    expect(jobsText).toContain("Дайджест 3 дайджест");
    expect(jobsText).toContain("Файлы 7 поддержано / 1 проигнорировано");
    expect(jobsText).toContain("Попытки 4 групп попыток");
    expect(jobsText).toContain("Режим только чтение");
    expect(jobsText).toContain("Исходные данные не включены");
    expect(jobsText).toContain("Границы 3 из 3, лимит 3");
    expect(jobsText).toContain("sha256:fixture-duplicate-digest");
    expect(jobsText).toContain("с учетом дублей");
    expect(jobsText).toContain("с учетом ретраев");
    expect(jobsText).toContain("2 ошибок парсинга");
    expect(countMatches(launchMarkup, /class="archive-fixture-card/g)).toBe(0);
    expect(countMatches(jobsMarkup, /class="archive-fixture-card/g)).toBe(3);

    for (const label of ["Детали фикстуры на странице", "Сводка отредактирована"]) {
      const launchButton = buttonContaining(launchMarkup, label);
      expect(launchButton, `${label} should not render in Launches`).toBeUndefined();
      expect(jobsMarkup, `${label} read-only action should render in Jobs`).toContain(label);
    }
    expect(jobsText).not.toContain("WIP");

    for (const mode of ["case", "defects", "analytics"] as const) {
      const markup = renderSurface(mode, archiveFixtureReadyApiState);
      const text = visibleText(markup);
      expect(markup, `${mode} should not render fixture evidence`).not.toContain(
        'aria-label="Доказательства синтетических фикстур replay"'
      );
      expect(text, `${mode} should not render fixture heading`).not.toContain(
        "Диагностический replay архива"
      );
      expect(text, `${mode} should not render fixture scenarios`).not.toContain(
        "Duplicate archive entries collapse"
      );
      expect(text, `${mode} should not render fixture digests`).not.toContain(
        "sha256:fixture-duplicate-digest"
      );
    }

    expect(launchText).not.toContain("Прием архивов");
    expect(jobsText).toContain("Задачи: загрузка архивов");
  });

  it("covers archive diagnostic replay fixture states and redacts hostile fixture material", () => {
    const emptyFixtures: ArchiveDiagnosticReplayFixtureListRead = {
      ...readyArchiveDiagnosticReplayFixtures,
      page: { ...readyArchiveDiagnosticReplayFixtures.page, returned: 0, total: 0 },
      summary: {
        ...readyArchiveDiagnosticReplayFixtures.summary,
        materializedRecordCount: 0,
        fixtureNames: [],
        supportedFiles: 0,
        attachmentFiles: 0,
        ignoredFiles: 0,
        warningCount: 0,
        parseErrors: 0,
        attemptGroups: 0,
        retryAwareCount: 0,
        duplicateAwareCount: 0,
        deniedFixtureCount: 0
      },
      items: []
    };
    const partialFixtures: ArchiveDiagnosticReplayFixtureListRead = {
      ...readyArchiveDiagnosticReplayFixtures,
      page: {
        ...readyArchiveDiagnosticReplayFixtures.page,
        returned: 2,
        total: 5,
        hasMore: true,
        nextCursor: "fixture-page-2"
      }
    };
    const hostileFixtures: ArchiveDiagnosticReplayFixtureListRead = {
      ...readyArchiveDiagnosticReplayFixtures,
      summary: {
        ...readyArchiveDiagnosticReplayFixtures.summary,
        rawArchivePayloadsIncluded: true,
        manifestEntriesIncluded: true,
        resultFilesIncluded: true,
        localPathsIncluded: true,
        storageRefsIncluded: true,
        signedUrlsIncluded: true,
        tokensIncluded: true,
        redactionPassed: false
      },
      items: [
        {
          ...readyArchiveDiagnosticReplayFixtures.items[0]!,
          fixtureRef: "Bearer raw-fixture-token",
          materializedRef: "Bearer raw-fixture-token",
          name: "C:\\Users\\tester\\Downloads\\synthetic-fixtures.zip",
          scenario:
            "signedUrl=https://object.test/archive.zip?token=raw-fixture-token storageRef=s3://private/archive",
          recordDigest: "signedUrl=https://object.test/digest?token=raw-fixture-token",
          materialization: {
            ...archiveMaterializedFixturePolicy(),
            rawArchivePayloadsIncluded: true,
            manifestEntriesIncluded: true,
            resultFilesIncluded: true,
            localPathsIncluded: true,
            storageRefsIncluded: true,
            signedUrlsIncluded: true,
            tokensIncluded: true
          }
        }
      ]
    };

    const emptyMarkup = renderSurface("jobs", {
      ...archiveStatusReadyApiState,
      archiveDiagnosticReplayFixtures: { data: emptyFixtures, state: "empty" }
    });
    const partialMarkup = renderSurface("jobs", {
      ...archiveStatusReadyApiState,
      archiveDiagnosticReplayFixtures: { data: partialFixtures, state: "partial" }
    });
    const loadingMarkup = renderSurface("jobs", {
      ...archiveStatusReadyApiState,
      archiveDiagnosticReplayFixtures: { state: "loading" }
    });
    const hostileFixtureReadError = [
      "Fixture read failed token=raw-fixture-token",
      ["C:", "Users", "tester", "Downloads", "fixture.json"].join("\\")
    ].join(" ");
    const errorMarkup = renderSurface("jobs", {
      ...archiveStatusReadyApiState,
      archiveDiagnosticReplayFixtures: {
        message: hostileFixtureReadError,
        state: "error"
      }
    });
    const deniedMarkup = renderSurface("jobs", {
      ...archiveStatusReadyApiState,
      archiveDiagnosticReplayFixtures: {
        message: "Missing uploads:read for Bearer raw-fixture-token",
        state: "denied"
      }
    });
    const hostileMarkup = renderSurface("jobs", {
      ...archiveStatusReadyApiState,
      archiveDiagnosticReplayFixtures: { data: hostileFixtures, state: "partial" }
    });

    const emptyText = visibleText(emptyMarkup);
    const partialText = visibleText(partialMarkup);
    const loadingText = visibleText(loadingMarkup);
    const errorText = visibleText(errorMarkup);
    const deniedText = visibleText(deniedMarkup);
    const hostileText = visibleText(hostileMarkup);

    expect(emptyMarkup).toContain('aria-label="Фикстура пуста"');
    expect(partialMarkup).toContain('aria-label="Фикстура загружена частично"');
    expect(loadingMarkup).toContain('aria-label="Фикстура загружается"');
    expect(errorMarkup).toContain('aria-label="Фикстура недоступна"');
    expect(deniedMarkup).toContain('aria-label="Доступ к фикстуре закрыт"');

    for (const guardedMarkup of [emptyMarkup, loadingMarkup, errorMarkup, deniedMarkup]) {
      expect(countMatches(guardedMarkup, /class="archive-fixture-card/g)).toBe(0);
      expect(guardedMarkup).not.toContain("Детали фикстуры на странице");
      expect(guardedMarkup).not.toContain("Сводка отредактирована");
    }

    for (const stateMarkup of [
      emptyMarkup,
      partialMarkup,
      loadingMarkup,
      errorMarkup,
      deniedMarkup
    ]) {
      expect(stateMarkup).toMatch(
        /aria-label="Задачи archive intake status"[\s\S]*aria-label="Доказательства синтетических фикстур replay"/
      );
    }

    for (const mode of ["case", "defects", "analytics"] as const) {
      const irrelevantText = visibleText(
        renderSurface(mode, {
          ...archiveStatusReadyApiState,
          archiveDiagnosticReplayFixtures: { data: emptyFixtures, state: "empty" }
        })
      );
      expect(irrelevantText).not.toContain("Синтетические фикстуры replay не найдены");
      expect(irrelevantText).not.toContain("Нет материализованных сводок фикстур");
      expect(irrelevantText).not.toContain("Диагностический replay архива");
    }

    for (const label of ["Детали фикстуры на странице", "Сводка отредактирована"]) {
      expect(partialMarkup, `${label} should render only on populated pages`).toContain(label);
      expect(
        buttonContaining(partialMarkup, label),
        `${label} should not be a fake disabled action`
      ).toBeUndefined();
    }

    expect(emptyText).toContain("Синтетические фикстуры replay не найдены");
    expect(emptyText).toContain("Нет материализованных сводок фикстур");
    expect(emptyText).toContain("Нет сводок фикстур в скоупе");
    expect(partialText).toContain("Синтетические фикстуры replay загружены частично");
    expect(partialText).toContain("Границы 2 из 5, лимит 3");
    expect(loadingText).toContain("Загружаем синтетические фикстуры replay");
    expect(loadingText).toContain("Загружаем материализованные сводки фикстур");
    expect(errorText).toContain("Синтетические фикстуры replay недоступны");
    expect(errorText).toContain("Чтение фикстуры завершилось ошибкой");
    expect(deniedText).toContain("Доступ к синтетическим фикстурам replay закрыт");
    expect(deniedText).toContain("Доступ к материализованной фикстуре закрыт");
    expect(deniedText).toContain("Доступ к фикстуре закрыт");

    expect(hostileText).toContain("фикстура отредактирована");
    expect(hostileText).toContain("сценарий отредактирован");
    expect(hostileText).toContain("дайджест отредактирован");
    expect(hostileText).toContain("Исходные данные отредактированы");
    expect(hostileText).not.toContain("raw-fixture-token");
    expect(hostileText).not.toContain("signedUrl");
    expect(hostileText).not.toContain("storageRef");
    expect(hostileText).not.toContain("Downloads");
    expect(hostileText).not.toContain("synthetic-fixtures.zip");
    expect(hostileText).not.toContain("s3://");
  });

  it("keeps archive fixture denied, empty, and loading guards out of non-archive tabs", () => {
    const guardedStates: ApiState[] = [
      {
        ...archiveStatusReadyApiState,
        archiveDiagnosticReplayFixtures: {
          data: {
            ...readyArchiveDiagnosticReplayFixtures,
            items: [],
            page: { ...readyArchiveDiagnosticReplayFixtures.page, returned: 0, total: 0 },
            summary: {
              ...readyArchiveDiagnosticReplayFixtures.summary,
              materializedRecordCount: 0,
              fixtureNames: []
            }
          },
          state: "empty"
        }
      },
      {
        ...archiveStatusReadyApiState,
        archiveDiagnosticReplayFixtures: { state: "loading" }
      },
      {
        ...archiveStatusReadyApiState,
        archiveDiagnosticReplayFixtures: {
          message: "Missing uploads read scope",
          state: "denied"
        }
      }
    ];

    for (const apiState of guardedStates) {
      const launchMarkup = renderSurface("launch", apiState);
      const jobsMarkup = renderSurface("jobs", apiState);

      expect(launchMarkup).not.toContain(
        'aria-label="Доказательства синтетических фикстур replay"'
      );
      expect(jobsMarkup).toContain('aria-label="Доказательства синтетических фикстур replay"');

      for (const mode of ["case", "defects", "analytics"] as const) {
        const markup = renderSurface(mode, apiState);
        const text = visibleText(markup);
        expect(markup).not.toContain('aria-label="Доказательства синтетических фикстур replay"');
        expect(text).not.toContain("Диагностический replay архива");
        expect(text).not.toContain("Materialized fixture access denied");
        expect(text).not.toContain("Загружаем материализованные сводки фикстур");
        expect(text).not.toContain("Нет материализованных сводок фикстур");
        expect(markup).not.toContain("Детали фикстуры на странице");
        expect(markup).not.toContain("Сводка отредактирована");
      }
    }
  });

  it("keeps browser smoke guidance aligned with archive diagnostic replay fixture boundaries", () => {
    expect(archiveDiagnosticReplayFixtureBrowserSmokeGuidance.join(" ")).toContain(
      "материализованные синтетические фикстуры replay"
    );
    expect(archiveDiagnosticReplayFixtureBrowserSmokeGuidance.join(" ")).toContain(
      "#launch, #case, #defects"
    );
    expect(archiveDiagnosticReplayFixtureBrowserSmokeGuidance.join(" ")).toContain(
      "статусы диагностики только для чтения"
    );
    expect(archiveDiagnosticReplayFixtureBrowserSmokeGuidance.join(" ")).toContain(
      "исходные данные архива"
    );
    expect(archiveDiagnosticReplayFixtureBrowserSmokeGuidance.join(" ")).toContain(
      "подписанные ссылки"
    );
  });

  it("covers archive status empty, partial, error, and denied read states without leaking sensitive values", () => {
    const emptyStatus: ArchiveUploadStatusListRead = {
      ...readyArchiveUploadStatus,
      page: { ...readyArchiveUploadStatus.page, returned: 0, total: 0 },
      summary: {
        ...readyArchiveUploadStatus.summary,
        total: 0,
        queued: 0,
        processing: 0,
        completed: 0,
        completedWithErrors: 0,
        failed: 0,
        acceptedEntries: 0,
        ignoredEntries: 0,
        importedResults: 0,
        storedArtifacts: 0,
        diagnostics: 0,
        warnings: 0,
        errors: 0
      },
      diagnostics: {
        page: { ...readyArchiveUploadStatus.diagnostics.page, returned: 0, total: 0 },
        items: []
      },
      items: []
    };
    const partialStatus: ArchiveUploadStatusListRead = {
      ...readyArchiveUploadStatus,
      page: { ...readyArchiveUploadStatus.page, hasMore: true, nextCursor: "2" },
      summary: { ...readyArchiveUploadStatus.summary, completedWithErrors: 1 },
      diagnostics: {
        ...readyArchiveUploadStatus.diagnostics,
        page: {
          ...readyArchiveUploadStatus.diagnostics.page,
          returned: 3,
          total: 9,
          hasMore: true,
          nextCursor: "3"
        }
      }
    };
    const hostileStatus: ArchiveUploadStatusListRead = {
      ...partialStatus,
      launch: {
        ...partialStatus.launch,
        id: "C:\\Users\\tester\\Downloads\\launch-secret",
        projectId: "s3://private/project?token=raw"
      },
      diagnostics: {
        ...partialStatus.diagnostics,
        items: [
          {
            scope: "entry",
            severity: "error",
            code: "storageKey=raw-storage",
            message:
              "signedUrl=https://object.test/file?token=raw C:\\Users\\tester\\Downloads\\synthetic-results\\private.log"
          }
        ]
      },
      items: [
        {
          ...partialStatus.items[0]!,
          id: "Bearer raw-archive-token",
          archive: {
            ...partialStatus.items[0]!.archive,
            name: "C:\\Users\\tester\\Downloads\\synthetic-results.zip"
          },
          worker: {
            ...partialStatus.items[0]!.worker,
            queue: "s3://private-queue?token=raw",
            boundary: "signedUrl=https://object.test/worker?token=raw"
          }
        }
      ]
    };

    const emptyText = visibleText(
      renderSurface("jobs", {
        ...archiveReadyApiState,
        archiveUploadStatus: { data: emptyStatus, state: "empty" }
      })
    );
    const partialText = visibleText(
      renderSurface("jobs", {
        ...archiveReadyApiState,
        archiveUploadStatus: { data: partialStatus, state: "partial" }
      })
    );
    const errorText = visibleText(
      renderSurface("jobs", {
        ...archiveReadyApiState,
        archiveUploadStatus: {
          message: "Archive status failed token=raw C:\\Users\\tester\\Downloads\\status.json",
          state: "error"
        }
      })
    );
    const deniedText = visibleText(
      renderSurface("jobs", {
        ...archiveReadyApiState,
        archiveUploadStatus: {
          message: "Missing required archive status read scope for Bearer archive-secret",
          state: "denied"
        }
      })
    );
    const hostileText = visibleText(
      renderSurface("jobs", {
        ...archiveReadyApiState,
        archiveUploadStatus: { data: hostileStatus, state: "partial" }
      })
    );

    expect(emptyText).toContain("Прием архивов не объявлен");
    expect(emptyText).toContain("Чтение статуса архива не вернуло задач загрузки архива");
    expect(emptyText).toContain("Чтение статуса архива подключено и не вернуло задач загрузки");
    expect(emptyText).toContain("Страница диагностики worker ограничена, отредактирована и пуста");
    expect(emptyText).toContain("UI статуса архива не показывает исходные данные");
    expect(emptyText).not.toContain("Unpack worker status endpoint is not implemented yet");
    expect(emptyText).not.toContain("archive.unpack");
    expect(emptyText).not.toContain("not connected");
    expect(partialText).toContain("Прием архивов частично доступен");
    expect(partialText).toContain("3 из 9 диагностик, лимит 5");
    expect(errorText).toContain("Прием архивов недоступен");
    expect(errorText).toContain("Чтение статуса архива завершилось ошибкой");
    expect(deniedText).toContain("Доступ к приему архивов закрыт");
    expect(deniedText).toContain("Доступ к статусу архива закрыт");
    expect(deniedText).toContain("Скрыто правами");

    expect(hostileText).toContain("Проект отредактирован");
    expect(hostileText).toContain("Запуск отредактирован");
    expect(hostileText).toContain("Archive name redacted");
    expect(hostileText).toContain("детали диагностики отредактированы");
    expect(hostileText).not.toContain("raw-archive-token");
    expect(hostileText).not.toContain("raw-storage");
    expect(hostileText).not.toContain("signedUrl");
    expect(hostileText).not.toContain("token=raw");
    expect(hostileText).not.toContain("Downloads");
    expect(hostileText).not.toContain("allure-results");
  });
});
