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

describe("analytics and defects surface readiness", () => {
  it("renders Dashboard as a ready THQL widget workspace", () => {
    const markup = renderSurface("dashboard", onlineApiState);
    const text = visibleText(markup);

    expect(markup).toContain("dashboard-reference-screen");
    expect(text).toContain("Дашборды");
    expect(text).toContain("Успешность среза");
    expect(text).toContain("Распределение статусов");
    expect(text).toContain("Медленные и рисковые тесты");
    expect(text).toContain("THQL");
    expect(buttonContaining(markup, "Добавить виджет")).toBeDefined();
    expect(buttonContaining(markup, "Добавить первый виджет")).toBeUndefined();
    expect(text).not.toContain("Виджетов пока нет");
    expect(text).not.toContain("Редактор виджета");
    expect(text).not.toContain("Preview");
    expect(text).not.toContain("Статусы smoke без mute");
    for (const forbidden of [
      "History compare",
      "Permission audit",
      "Raw history digest",
      "Runtime model",
      "Ingestion and processing pipeline",
      "Queue and workers",
      "Archive intake",
      "Telemetry WIP"
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("renders Analytics as a ready bounded Russian metrics surface", () => {
    const markup = renderSurface("analytics", onlineApiState);
    const text = visibleText(markup);

    expect(markup).toContain("analytics-reference-screen");
    expect(text).toContain("Аналитика");
    expect(text).toContain("Рабочая аналитика");
    expect(text).toContain("Успешность");
    expect(text).toContain("Открытые риски");
    expect(text).toContain("Средняя длительность");
    expect(text).toContain("Нестабильные кандидаты");
    expect(text).toContain("Статусы");
    expect(text).toContain("Приоритетные сигналы");
    expect(text).toContain("Медленные тесты");
    expect(text).toContain("Сигналы");
    expect(markup).toContain('aria-label="Поиск аналитических сигналов"');
    expect(countMatches(markup, /class="analytics-reference-signal-row/g)).toBeLessThanOrEqual(50);
    expect(text).not.toContain("quality_gate.");
    expect(text).not.toContain("quality-gate.evaluate");
    expect(text).not.toContain("REST");
    expect(text).not.toContain("OpenAPI");
    expect(text).not.toContain("mutation");
    expect(text).not.toContain("Capabilities");
    for (const forbidden of [
      "Гейт качества",
      "Причины решения",
      "Новые падения",
      "Повторяющиеся падения",
      "Правила гейта",
      "Карантины гейта",
      "Analytics are calculated",
      "Quality gate and risk signals",
      "Machine-readable reasons",
      "Quality gate mutes",
      "Defect mute impact",
      "Gate rules",
      "New failure summary",
      "Recurring failure summary",
      "No slow tests"
    ]) {
      expect(text).not.toContain(forbidden);
    }
    expect(text).not.toContain("Runtime model");
    expect(text).not.toContain("Ingestion and processing pipeline");
    expect(text).not.toContain("Queue and workers");
    expect(text).not.toContain("Close jobs");
    expect(text).not.toContain("artifact.cleanup");
    expect(text).not.toContain("Worker status endpoint");
    expect(text).not.toContain("Telemetry WIP");
  });

  it("wires defect mute surfaces while Analytics stays scoped to result metrics", () => {
    const defectsMarkup = renderSurface("defects", onlineApiState);
    const analyticsMarkup = renderSurface("analytics", onlineApiState);
    const defectsText = visibleText(defectsMarkup);
    const caseText = visibleText(renderSurface("case", onlineApiState));
    const analyticsText = visibleText(analyticsMarkup);

    expect(defectsText).toContain("Дефекты");
    expect(defectsMarkup).toContain("thql-search");
    expect(defectsMarkup).toContain('aria-label="THQL поиск дефектов"');
    expect(defectsText).toContain("Открытые");
    expect(defectsText).toContain("AUTH-912");
    expect(defectsText).toContain("PAY-337");
    expect(defectsText).toContain("Тест-кейсы");
    expect(defectsText).toContain("Результаты");
    expect(defectsText).not.toContain("Выберите дефект для отображения");
    expect(analyticsText).toContain("Аналитика");
    expect(analyticsText).toContain("Рабочая аналитика");
    expect(analyticsText).toContain("Открытые риски");
    expect(analyticsText).toContain("Приоритетные сигналы");
    expect(analyticsText).not.toContain("Карантины гейта");
    expect(analyticsText).not.toContain("quality-gate.evaluate");
    expect(analyticsText).not.toContain("Контракт изменения отсутствует");
    expect(analyticsText).not.toContain("Capabilities");
    expect(analyticsText).not.toContain("OpenAPI");
    expect(analyticsText).not.toContain("mutation");

    expect(defectsText).not.toContain("defect.read");
    expect(defectsText).not.toContain("quality-gate.evaluate");
    expect(defectsText).not.toContain("Права проверены");
    expect(defectsText).not.toContain("Контракт изменения отсутствует");

    expect(caseText).not.toContain("Quality gate mutes");
    expect(caseText).not.toContain("Defect mute impact");
    expect(caseText).not.toContain("Заглушить причину гейта");
    expect(caseText).not.toContain("Журнал карантина");
    expect(caseText).not.toContain("Контракт изменения отсутствует");
    expect(defectsText).not.toContain("Runtime model");
    expect(defectsText).not.toContain("Прием архивов");
  });

  it("keeps the Defects reference screen scoped to the reference list-detail layout", () => {
    const defectsMarkup = renderSurface("defects", onlineApiState);
    const defectsText = visibleText(defectsMarkup);
    const defects = buildDefectSummaries(demoM1Workspace.results);

    expect(defectsMarkup).not.toContain("defects-reference-tabs");
    expect(defectsMarkup).not.toContain("defects-reference-filter-chips");
    expect(defectsText).toContain("Описание");
    expect(defectsText).toContain("Запуски");
    expect(defectsText).toContain("Тест-кейсы");
    expect(defectsText).toContain("Результаты тестов");
    expect(defectsText).toContain("Правила автоматизации");

    expect(filterDefects(defects, "PAY-337", "all").map((defect) => defect.id)).toEqual([
      "PAY-337"
    ]);
    expect(filterDefects(defects, "", "quarantined").map((defect) => defect.id)).toEqual([
      "PAY-337"
    ]);
    expect(defectsText).not.toContain("Выберите дефект для отображения");
    expect(defectsText).not.toContain("Инварианты");
    expect(defectsText).not.toContain("Projection digest");
    expect(defectsText).not.toContain("storage refs");
  });

  it("keeps defect mute projection hidden from the user Defects surface", () => {
    const defectsMarkup = renderSurface("defects", projectionApiState);
    const combinedText = visibleText(defectsMarkup);

    for (const mode of ["defects", "case", "dashboard", "jobs", "analytics", "launch"] as const) {
      const text = visibleText(renderSurface(mode, projectionApiState));

      expect(text).not.toContain("Проекция карантина");
      expect(text).not.toContain("Карантины дефектов");
      expect(text).not.toContain("Projected quality gate mute effects");
      expect(text).not.toContain("Failure replay input");
      expect(text).not.toContain("Effective gate effects");
    }
    expect(combinedText).toContain("Дефекты");
    expect(combinedText).toContain("Тест-кейсы");
    expect(combinedText).not.toContain("Выберите дефект для отображения");
  });

  it("renders defect mute replay invariant summaries only in Defects", () => {
    for (const mode of ["defects", "case", "dashboard", "jobs", "analytics", "launch"] as const) {
      const text = visibleText(renderSurface(mode, projectionApiState));

      expect(text).not.toContain("Инварианты карантина");
      expect(text).not.toContain("Инварианты повтора карантина");
      expect(text).not.toContain("Инварианты повтора запуска");
      expect(text).not.toContain("No raw failure payloads");
      expect(text).not.toContain("defect-mute-event:project-1:mute-a");
    }
  });

  it("documents browser smoke guidance for scoped defect mute replay invariant evidence", () => {
    expect(defectMuteReplayInvariantBrowserSmokeGuidance).toContain(
      "Открыть #defects и проверить, что видны только список дефектов и детали выбранного дефекта."
    );
    expect(defectMuteReplayInvariantBrowserSmokeGuidance.join(" ")).toContain(
      "projection карантина дефектов и replay-инварианты не отображаются в #defects"
    );
    expect(defectMuteReplayInvariantBrowserSmokeGuidance.join(" ")).toContain(
      "состояния загрузки, пусто, отказ и наполненные инварианты не попадают в пользовательский раздел дефектов"
    );
    expect(defectMuteReplayInvariantBrowserSmokeGuidance.join(" ")).toContain(
      "#case и #analytics не показывают replay-инварианты карантина дефектов"
    );
    expect(defectMuteReplayInvariantBrowserSmokeGuidance.join(" ")).toContain(
      "запуски не показывают replay-инварианты карантина дефектов"
    );
    expect(defectMuteReplayInvariantBrowserSmokeGuidance.join(" ")).toContain(
      "raw event ids, история падений, payloads, traces, локальные пути, storage refs"
    );
    expect(defectMuteReplayInvariantBrowserSmokeGuidance.join(" ")).toContain(
      "controls инвариантов не видны в пользовательском экране дефектов"
    );
  });

  it("guards materialized defect mute invariant state surfaces to defect and selected test contexts", () => {
    const emptyInvariant: DefectMuteReplayInvariantRead = {
      ...readyDefectMuteReplayInvariant,
      appendOnly: {
        uniqueProjectedEventIds: true,
        duplicateEventIds: [],
        totalProjectedEventIds: 0
      },
      items: [],
      page: { ...readyDefectMuteReplayInvariant.page, returned: 0, total: 0 },
      rawEffectiveSeparation: {
        ...readyDefectMuteReplayInvariant.rawEffectiveSeparation,
        rawFailureOccurrenceCount: 0,
        effectiveRecordCount: 0
      }
    };
    const states: Array<{
      apiState: ApiState;
      expected: string;
      name: string;
    }> = [
      {
        apiState: {
          ...onlineApiState,
          defectMuteReplayInvariants: { state: "loading" }
        },
        expected: "Инварианты загружаются",
        name: "loading"
      },
      {
        apiState: {
          ...onlineApiState,
          defectMuteReplayInvariants: { data: emptyInvariant, state: "empty" }
        },
        expected: "Событий инвариантов нет",
        name: "empty"
      },
      {
        apiState: {
          ...onlineApiState,
          defectMuteReplayInvariants: {
            message: "Missing defect replay invariant read scope for bearer state-token",
            state: "denied"
          }
        },
        expected: "Инварианты недоступны",
        name: "denied"
      },
      {
        apiState: projectionApiState,
        expected: "Materialized event page",
        name: "populated"
      }
    ];
    for (const stateCase of states) {
      const defectsMarkup = renderSurface("defects", stateCase.apiState);
      const defectsText = visibleText(defectsMarkup);

      expect(defectsText, stateCase.name).toContain("Дефекты");
      expect(defectsText, stateCase.name).not.toContain("Инварианты карантина");
      expect(defectsText, stateCase.name).not.toContain(stateCase.expected);
      expect(defectsText, stateCase.name).not.toContain("state-token");
      expect(defectsText, stateCase.name).not.toContain("Materialized event page");
      expect(defectsText, stateCase.name).not.toContain("read-only-defect-mute-replay-invariant");
      expect(
        buttonsContainingText(defectsMarkup, "Инварианты карантина из read model")
      ).toHaveLength(0);

      for (const mode of ["case", "dashboard", "jobs", "analytics", "launch"] as const) {
        const text = visibleText(renderSurface(mode, stateCase.apiState));

        expect(text, `${stateCase.name} ${mode}`).not.toContain("Инварианты карантина");
        expect(text, `${stateCase.name} ${mode}`).not.toContain(stateCase.expected);
        expect(text, `${stateCase.name} ${mode}`).not.toContain("Materialized event page");
        expect(text, `${stateCase.name} ${mode}`).not.toContain("Инварианты недоступны");
        expect(text, `${stateCase.name} ${mode}`).not.toContain("Инварианты загружаются");
        expect(text, `${stateCase.name} ${mode}`).not.toContain("Событий инвариантов нет");
      }
    }
  });

  it("covers defect mute replay invariant loading, empty, partial, error, and denied states", () => {
    const loadingText = visibleText(
      renderSurface("defects", {
        ...onlineApiState,
        defectMuteReplayInvariants: { state: "loading" }
      })
    );
    const emptyText = visibleText(
      renderSurface("defects", {
        ...onlineApiState,
        defectMuteReplayInvariants: {
          data: {
            ...readyDefectMuteReplayInvariant,
            appendOnly: {
              uniqueProjectedEventIds: true,
              duplicateEventIds: [],
              totalProjectedEventIds: 0
            },
            items: [],
            page: { ...readyDefectMuteReplayInvariant.page, returned: 0, total: 0 },
            rawEffectiveSeparation: {
              ...readyDefectMuteReplayInvariant.rawEffectiveSeparation,
              rawFailureOccurrenceCount: 0,
              effectiveRecordCount: 0
            }
          },
          state: "empty"
        }
      })
    );
    const partialText = visibleText(
      renderSurface("defects", {
        ...onlineApiState,
        defectMuteReplayInvariants: {
          data: {
            ...readyDefectMuteReplayInvariant,
            invariant: {
              ...readyDefectMuteReplayInvariant.invariant,
              deterministic: false
            },
            appendOnly: {
              uniqueProjectedEventIds: false,
              duplicateEventIds: ["event-duplicate-redacted"],
              totalProjectedEventIds: 2
            },
            page: {
              ...readyDefectMuteReplayInvariant.page,
              hasMore: true,
              nextCursor: "2"
            },
            redaction: {
              passed: false,
              leakedMarkers: ["synthetic-marker-redacted"],
              policy: "Synthetic marker hidden by the UI."
            }
          },
          state: "partial"
        }
      })
    );
    const errorText = visibleText(
      renderSurface("defects", {
        ...onlineApiState,
        defectMuteReplayInvariants: {
          message:
            "/api/v1/projects/project-1/defect-mutes/projection/replay/invariants returned 500",
          state: "error"
        }
      })
    );
    const deniedText = visibleText(
      renderSurface("defects", {
        ...onlineApiState,
        defectMuteReplayInvariants: {
          message: "Missing required defect invariant read scope for bearer synthetic-secret",
          state: "denied"
        }
      })
    );

    for (const text of [loadingText, emptyText, partialText, errorText, deniedText]) {
      expect(text).toContain("Дефекты");
      expect(text).not.toContain("Инварианты");
      expect(text).not.toContain("Raw failure payloads");
      expect(text).not.toContain("read-only-defect-mute-replay-invariant");
      expect(text).not.toContain("rest-read-only-no-replay-mutation");
      expect(text).not.toContain("projection/replay/invariants returned 500");
      expect(text).not.toContain("bearer");
      expect(text).not.toContain("synthetic-secret");
    }
  });

  it("redacts hostile defect mute replay invariant fields before rendering them", () => {
    const hostileInvariant: DefectMuteReplayInvariantRead = {
      ...readyDefectMuteReplayInvariant,
      projectId: "C:\\Users\\tester\\Downloads\\project",
      actor: {
        type: "actor",
        actorId: "bearer synthetic-invariant-token",
        scoped: true
      },
      invariant: {
        ...readyDefectMuteReplayInvariant.invariant,
        projectionDigest: "api_key=synthetic-invariant-key",
        recomputedDigest: "storageKey=synthetic-invariant-storage"
      },
      rawEffectiveSeparation: {
        ...readyDefectMuteReplayInvariant.rawEffectiveSeparation,
        documentation:
          "Raw payload path C:\\Users\\tester\\Downloads\\raw.json and signedUrl=https://object.test/raw?token=synthetic-token are excluded."
      },
      appendOnly: {
        uniqueProjectedEventIds: false,
        duplicateEventIds: ["storage://bucket/raw-event"],
        totalProjectedEventIds: 1
      },
      redaction: {
        passed: false,
        leakedMarkers: ["minio://bucket/raw?X-Amz-Signature=synthetic"],
        policy: "token=synthetic-policy-token"
      },
      items: [
        {
          ordinal: 0,
          eventId:
            "signedUrl=https://object.test/raw?token=synthetic-event-token storageRef=storage://bucket/raw"
        }
      ]
    };
    const text = visibleText(
      renderSurface("defects", {
        ...onlineApiState,
        defectMuteReplayInvariants: { data: hostileInvariant, state: "partial" }
      })
    );

    expect(text).toContain("Дефекты");
    expect(text).not.toContain("[redacted]");
    expect(text).not.toContain("Инварианты");
    expect(text).not.toContain("synthetic-invariant-token");
    expect(text).not.toContain("synthetic-invariant-key");
    expect(text).not.toContain("synthetic-invariant-storage");
    expect(text).not.toContain("synthetic-event-token");
    expect(text).not.toContain("synthetic-policy-token");
    expect(text).not.toContain("signedUrl");
    expect(text).not.toContain("storageRef");
    expect(text).not.toContain("storage://");
    expect(text).not.toContain("minio://");
    expect(text).not.toContain("X-Amz-Signature");
    expect(text).not.toContain("Downloads");
    expect(text).not.toContain("C:\\");
  });

  it("covers defect mute projection loading, empty, partial, error, and denied states", () => {
    const loadingText = visibleText(
      renderSurface("defects", {
        ...onlineApiState,
        defectMuteProjection: { state: "loading" }
      })
    );
    const emptyText = visibleText(renderSurface("defects", emptyProjectionApiState));
    const errorText = visibleText(
      renderSurface("defects", {
        ...onlineApiState,
        defectMuteProjection: {
          message: "/api/v1/projects/project-1/defect-mutes/projection returned 500",
          state: "error"
        }
      })
    );
    const partialText = visibleText(renderSurface("defects", partialProjectionApiState));
    const deniedText = visibleText(
      renderSurface("defects", {
        ...onlineApiState,
        defectMuteProjection: {
          message: "Missing required defect projection read scope for bearer token super-secret",
          state: "denied"
        }
      })
    );

    for (const text of [loadingText, emptyText, partialText, errorText, deniedText]) {
      expect(text).toContain("Дефекты");
      expect(text).not.toContain("Проекция карантина");
      expect(text).not.toContain("Replay explanation");
      expect(text).not.toContain("Projection digest");
      expect(text).not.toContain("Граница проекта");
      expect(text).not.toContain("Граница участника");
      expect(text).not.toContain("projection returned 500");
      expect(text).not.toContain("bearer");
      expect(text).not.toContain("super-secret");
    }
  });

  it("redacts sensitive projection values before rendering them", () => {
    const sensitiveProjection: DefectMuteProjectionRead = {
      ...readyDefectMuteProjection,
      projectId: "C:\\Users\\tester\\Downloads\\project-secret",
      actor: {
        type: "actor",
        actorId: "bearer raw-projection-token",
        scoped: true
      },
      qualityGate: {
        ...readyDefectMuteProjection.qualityGate!,
        distinction:
          "Raw failure counters include signedUrl=https://object.test/file?token=raw but should hide it."
      },
      projection: {
        ...readyDefectMuteProjection.projection,
        projectionDigest: "api_key=raw-projection-key"
      },
      items: [
        {
          ...readyDefectMuteProjection.items[0]!,
          id: "storageKey=raw-storage",
          origin: { type: "actor", actorId: "bearer raw-projection-token" },
          affectedTestIds: [
            "C:\\Users\\tester\\Downloads\\secret.txt",
            "storageRef=storage://bucket/raw"
          ],
          affectedSignatureHashes: [
            "signedUrl=https://object.test/file?token=raw",
            "minio://bucket/object?X-Amz-Signature=raw"
          ]
        }
      ]
    };
    const text = visibleText(
      renderSurface("defects", {
        ...onlineApiState,
        defectMuteProjection: { data: sensitiveProjection, state: "ready" }
      })
    );

    expect(text).toContain("Дефекты");
    expect(text).not.toContain("[redacted]");
    expect(text).not.toContain("Проекция карантина");
    expect(text).not.toContain("raw-projection-token");
    expect(text).not.toContain("raw-storage");
    expect(text).not.toContain("raw-projection-key");
    expect(text).not.toContain("signedUrl");
    expect(text).not.toContain("storageRef");
    expect(text).not.toContain("minio://");
    expect(text).not.toContain("X-Amz-Signature");
    expect(text).not.toContain("Downloads");
    expect(text).not.toContain("C:\\");
  });

  it("keeps mute actions disabled across offline and missing-capability states", () => {
    const offlineMarkup = renderSurface("defects", apiStates.offline!);
    const missingCapabilityState: ApiState = {
      ...onlineApiState,
      capabilities: {
        ...onlineApiState.capabilities!,
        modules: onlineApiState.capabilities!.modules.filter(
          (moduleName) => moduleName !== "defects" && moduleName !== "quality-gates"
        )
      }
    };
    const blockedDefectsMarkup = renderSurface("defects", missingCapabilityState);
    const blockedAnalyticsMarkup = renderSurface("analytics", missingCapabilityState);
    const combinedBlockedMarkup = `${blockedDefectsMarkup} ${blockedAnalyticsMarkup}`;

    expect(visibleText(offlineMarkup)).toContain("Дефекты");
    expect(visibleText(offlineMarkup)).not.toContain("Проверка недоступна");
    expect(visibleText(blockedDefectsMarkup)).not.toContain("Контракт чтения недоступен");
    expect(visibleText(blockedDefectsMarkup)).not.toContain("Capabilities не объявляет defects");
    expect(visibleText(blockedAnalyticsMarkup)).toContain("Аналитика");
    expect(visibleText(blockedAnalyticsMarkup)).toContain("Рабочая аналитика");
    expect(visibleText(blockedAnalyticsMarkup)).toContain("Открытые риски");
    expect(visibleText(combinedBlockedMarkup)).not.toContain("Capabilities не объявляет");

    expect(buttonsContainingText(blockedAnalyticsMarkup, "Карантин")).toHaveLength(0);

    expect(visibleText(renderSurface("case", missingCapabilityState))).not.toContain(
      "Контракт чтения недоступен"
    );
  });

  it("keeps Analytics useful for a clean all-passed workspace", () => {
    const cleanWorkspace: M1Workspace = {
      ...demoM1Workspace,
      results: demoM1Workspace.results.map((result) => ({
        ...result,
        status: "passed",
        severity: result.severity,
        duration: "480ms",
        history: ["passed", "passed", "passed", "passed", "passed"]
      }))
    };
    const text = visibleText(renderWorkspaceSurface("analytics", onlineApiState, cleanWorkspace));

    expect(text).toContain("Аналитика");
    expect(text).toContain("Рабочая аналитика");
    expect(text).toContain("Успешность 100%");
    expect(text).toContain("Открытые риски 0");
    expect(text).toContain("Нет медленных тестов в текущем фильтре");
    expect(text).not.toContain("quality_gate.");
    expect(text).not.toContain("Нет нестабильных кандидатов");
    expect(text).not.toContain("Нет новых падений");
    expect(text).not.toContain("Нет повторяющихся падений");
    expect(text.toLowerCase()).not.toContain("placeholder");
  });

  it("guards long names and traces with truncation or wrapping styles", () => {
    const longResult: TestResult = {
      ...demoM1Workspace.results[0]!,
      name: `Authenticate ${"with-a-very-long-unbroken-case-name".repeat(12)}`,
      suite: `web.auth.${"DeeplyNestedSuite".repeat(10)}`
    };
    const markup = renderToStaticMarkup(<ResultTabContent result={longResult} tab="Overview" />);
    const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

    expect(visibleText(markup)).toContain("AssertionError");
    expect(styles).toContain("overflow-wrap: anywhere");
    expect(styles).toContain("text-overflow: ellipsis");
    expect(styles).toContain("min-width: 0");
  });

  it("keeps selected test case detail readable as bounded list/detail rows", () => {
    const styles = readFileSync(
      new URL("./referenceScreens/TestCaseDetailReferenceScreen.css", import.meta.url),
      "utf8"
    );

    expect(styles).toMatch(/--tc-detail-reference-list-width:\s*clamp\(\d+px,\s*32vw,\s*480px\)/);
    expect(styles).toMatch(/minmax\(\d+px,\s*var\(--tc-detail-reference-list-width\)\)\s+9px/);
    expect(styles).toContain(".tc-detail-reference-splitter");
    expect(styles).toContain("cursor: col-resize");
    expect(styles).toContain(".tc-detail-reference-overview-main section {\n  display: grid");
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(styles).toContain(".tc-detail-reference-overview-main section > h3");
    expect(styles).toContain("background: transparent");
    expect(styles).toContain(".tc-detail-reference-overview-main section > :not(h3)");
    expect(styles).toContain(".tc-detail-reference-step-line");
    expect(styles).toContain("min-height: 34px");
  });

  it("keeps 10k launch lists ready without rendering 10k launch or result rows", () => {
    const workspace = buildSyntheticWorkspace(10_000);
    const markup = renderWorkspaceSurface("launch", onlineApiState, workspace);
    const text = visibleText(markup);

    expect(countMatches(markup, /<article class="launches-reference-card/g)).toBeLessThanOrEqual(
      24
    );
    expect(text).toContain("Synthetic launch 0");
    expect(countMatches(markup, /Synthetic launch /g)).toBeLessThanOrEqual(50);
    expect(countMatches(markup, /launches-reference-list-row/g)).toBeLessThanOrEqual(50);
    expect(countMatches(markup, /launches-reference-result-table/g)).toBe(0);
    expect(text).not.toContain("DOM-строк");
    expect(text).not.toContain("Состояние списка");
    expect(text).not.toContain("Пагинация WIP");
    expect(markup).toContain("thql-search");
    expect(markup).toContain('aria-label="THQL поиск запусков"');
  });

  it("keeps 10k test cases searchable without rendering 10k case rows", () => {
    const workspace = buildSyntheticWorkspace(10_000);
    const markup = renderWorkspaceSurface("case", onlineApiState, workspace);
    const text = visibleText(markup);
    const searchField = markup.match(/<label class="thql-search__field">[\s\S]*?<\/label>/)?.[0];

    expect(countMatches(markup, /<article class="tc-detail-reference-row /g)).toBeLessThanOrEqual(
      50
    );
    expect(text).toContain("Показано 50 из 10 000 тест-кейсов");
    expect(text).not.toContain("50 shown of 10,000");
    expect(markup).toContain("thql-search");
    expect(markup).not.toContain("tc-detail-reference-filter-chips");
    expect(markup).not.toContain("tc-detail-reference-base-filter");
    expect(markup).not.toContain("BASE_CHECK_IMAGE_");
    expect(markup).not.toContain("Не замьючены");
    expect(searchField).toContain('aria-label="THQL поиск тест-кейсов"');
    expect(searchField).toContain("status in");
    expect(searchField).toContain('value=""');
    expect(searchField).not.toContain("disabled");
  });

  it("keeps Analytics bounded for 10k workspaces while still showing aggregate metrics", () => {
    const workspace = buildSyntheticWorkspace(10_000);
    const markup = renderWorkspaceSurface("analytics", onlineApiState, workspace);
    const text = visibleText(markup);

    expect(markup).toContain("analytics-reference-screen");
    expect(text).toContain("Аналитика");
    expect(text).toContain("10 000 результатов");
    expect(text).toContain("Успешность 25%");
    expect(text).toContain("Открытые риски 5 000");
    expect(text).toContain("Показано 50 из 10 000");
    expect(countMatches(markup, /class="analytics-reference-signal-row/g)).toBeLessThanOrEqual(50);
    expect(countMatches(markup, /Synthetic readiness case /g)).toBeLessThanOrEqual(64);
    expect(text).not.toContain("Поиск WIP");
    expect(text).not.toContain("Фильтры WIP");
    expect(text).not.toContain("Сортировка WIP");
    expect(text).not.toContain("Пагинация WIP");
    expect(buttonMarkupByLabel(markup, "Поиск")).toBe("");
  });
});
