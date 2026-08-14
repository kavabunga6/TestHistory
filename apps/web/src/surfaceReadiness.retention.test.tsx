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

describe("attachment retention surface readiness", () => {
  it("renders attachment preview retention only in Jobs and attachment details with state coverage", () => {
    const launchMarkup = renderSurface("launch", retentionReadyApiState);
    const jobsMarkup = renderSurface("jobs", retentionReadyApiState);
    const attachmentMarkup = renderToStaticMarkup(
      <ResultTabContent
        apiState={retentionReadyApiState}
        result={demoM1Workspace.results[0]!}
        tab="Вложения"
      />
    );
    const emptyText = visibleText(renderSurface("jobs", retentionEmptyApiState));
    const loadingText = visibleText(renderSurface("jobs", apiStates.loading!));
    const errorText = visibleText(renderSurface("jobs", apiStates.error!));
    const deniedText = visibleText(
      renderSurface("jobs", {
        ...onlineApiState,
        attachmentPreviewRetention: {
          message: "Missing artifacts:read scope for bearer token super-secret",
          state: "denied"
        }
      })
    );
    const deniedShellText = visibleText(renderSurface("jobs", m5DeniedApiState));
    const caseText = visibleText(renderSurface("case", retentionReadyApiState));
    const defectsText = visibleText(renderSurface("defects", retentionReadyApiState));
    const analyticsText = visibleText(renderSurface("analytics", retentionReadyApiState));
    const combinedMarkup = `${jobsMarkup} ${attachmentMarkup}`;
    const combinedText = visibleText(combinedMarkup);
    const launchText = visibleText(launchMarkup);

    expect(launchText).not.toContain("Хранение превью вложений");
    expect(combinedText).toContain("Хранение превью вложений");
    expect(combinedText).toContain("Превью хранения готово");
    expect(combinedText).toContain("Дескрипторы 3");
    expect(combinedText).toContain("Подходят для очистки 1");
    expect(combinedText).toContain("Сохранено 1");
    expect(combinedText).toContain("Защищено 1");
    expect(combinedText).toContain("Скоуп closed-launch");
    expect(combinedText).toContain("Статус запуска closed");
    expect(combinedText).toContain("Мутации выключены");
    expect(combinedText).toContain("Очистка запущена нет");
    expect(combinedText).toContain("Действия провайдера нет");
    expect(combinedText).toContain("К очистке");
    expect(combinedText).toContain("Сохранен");
    expect(combinedText).toContain("Защищен");
    expect(combinedText).toContain("short-lived-preview");
    expect(combinedText).toContain("evidence-retained");
    expect(combinedText).toContain("legal-hold-placeholder");
    expect(combinedText).toContain("Превью хранения для закрытых запусков");

    expect(emptyText).toContain("Нет кандидатов хранения");
    expect(loadingText).toContain("Загрузка превью хранения");
    expect(errorText).toContain("Превью хранения недоступно");
    expect(deniedText).toContain("Превью хранения запрещено");
    expect(deniedText).toContain("[redacted]");
    expect(deniedText).not.toContain("bearer");
    expect(deniedText).not.toContain("super-secret");
    expect(deniedShellText).not.toContain("Превью хранения запрещено");

    for (const label of [
      "Превью хранения из API",
      "Политику выполняет worker",
      "Данные отчета уже отредактированы"
    ]) {
      expect(combinedMarkup, `${label} read-only status should be visible`).toContain(label);
      expect(
        buttonsContainingText(combinedMarkup, label),
        `${label} should not be a fake disabled action`
      ).toHaveLength(0);
    }

    expect(buttonsContainingText(combinedMarkup, "Delete")).toHaveLength(0);
    expect(caseText).not.toContain("Хранение превью вложений");
    expect(defectsText).not.toContain("Хранение превью вложений");
    expect(analyticsText).not.toContain("Хранение превью вложений");
  });

  it("redacts unsafe attachment preview retention values before rendering", () => {
    const sensitiveRetention: AttachmentPreviewRetentionPreviewRead = {
      ...readyAttachmentPreviewRetention,
      items: [
        {
          ...readyAttachmentPreviewRetention.items[0]!,
          id: "storageKey=raw-storage",
          artifactId: "C:\\Users\\tester\\Downloads\\artifact.log",
          previewDescriptorId: "signedUrl=https://object.test/file?token=raw",
          retention: {
            ...readyAttachmentPreviewRetention.items[0]!.retention,
            policyClass: "storageKey=raw-storage",
            cleanupEligibility: {
              eligible: true,
              reason: "token=raw C:\\Users\\tester\\Downloads\\eligible.log"
            }
          }
        }
      ]
    };
    const text = visibleText(
      renderSurface("jobs", {
        ...onlineApiState,
        attachmentPreviewRetention: {
          data: sensitiveRetention,
          state: "ready"
        }
      })
    );

    expect(text).toContain("[redacted]");
    expect(text).not.toContain("raw-storage");
    expect(text).not.toContain("signedUrl");
    expect(text).not.toContain("token=raw");
    expect(text).not.toContain("Downloads");
    expect(text).not.toContain("C:\\");
    expect(text).not.toContain("eligible.log");
  });

  it("renders descriptor-only retention dry-run evidence only in attachment details", () => {
    const launchMarkup = renderSurface("launch", retentionReadyApiState);
    const jobsMarkup = renderSurface("jobs", retentionReadyApiState);
    const attachmentMarkup = renderToStaticMarkup(
      <ResultTabContent
        apiState={retentionReadyApiState}
        result={demoM1Workspace.results[0]!}
        tab="Вложения"
      />
    );
    const caseText = visibleText(renderSurface("case", retentionReadyApiState));
    const defectsText = visibleText(renderSurface("defects", retentionReadyApiState));
    const analyticsText = visibleText(renderSurface("analytics", retentionReadyApiState));
    const launchText = visibleText(launchMarkup);
    const attachmentText = visibleText(attachmentMarkup);

    expect(launchText).not.toContain("Доказательства расписания dry-run");
    expect(visibleText(jobsMarkup)).not.toContain("Доказательства расписания dry-run");

    for (const text of [attachmentText]) {
      expect(text).toContain("Доказательства расписания dry-run");
      expect(text).toContain("Расписание dry-run готово");
      expect(text).toContain("Метаданные dry-run только по дескрипторам");
      expect(text).toContain("Исходные данные скрыт");
      expect(text).toContain("dry-run только для чтения");
      expect(text).toContain("Выполнение удаления нет");
      expect(text).toContain("Мутации провайдера нет");
      expect(text).toContain("artifact.preview.retention.classify");
      expect(text).toContain("artifact.preview.retention.dry-run.schedule");
      expect(text).toContain("Батч 1");
      expect(text).toContain("batch-digest-one");
      expect(text).not.toContain("Dry-run planned operations");
      expect(text).not.toContain("provider.delete");
      expect(text).not.toContain("object.storage.delete");
    }

    for (const text of [launchText, caseText, defectsText, analyticsText]) {
      expect(text).not.toContain("Доказательства расписания dry-run");
      expect(text).not.toContain("Расписание dry-run готово");
      expect(text).not.toContain("Батч 1");
    }

    for (const label of [
      "Превью хранения из API",
      "Политику выполняет worker",
      "Данные отчета уже отредактированы"
    ]) {
      expect(buttonContaining(launchMarkup, label)).toBeUndefined();
      expect(attachmentMarkup).toContain(label);
      expect(buttonContaining(attachmentMarkup, label)).toBeUndefined();
    }
  });

  it("covers dry-run schedule empty, partial, loading, error, and denied states without scope leakage", () => {
    const partialState: ApiState = {
      ...retentionReadyApiState,
      attachmentPreviewRetentionSchedule: {
        data: {
          ...readyAttachmentPreviewRetentionSchedule,
          page: {
            ...readyAttachmentPreviewRetentionSchedule.page,
            returned: 1,
            total: 3,
            nextCursor: "cursor-2",
            hasMore: true
          }
        },
        state: "partial"
      }
    };
    const deniedState: ApiState = {
      ...retentionReadyApiState,
      attachmentPreviewRetentionSchedule: {
        message:
          "Denied C:\\Users\\tester\\Downloads\\synthetic-results\\schedule.json token=schedule-secret",
        state: "denied"
      }
    };

    const emptyText = visibleText(
      renderToStaticMarkup(
        <ResultTabContent
          apiState={retentionEmptyApiState}
          result={demoM1Workspace.results[0]!}
          tab="Вложения"
        />
      )
    );
    const partialText = visibleText(
      renderToStaticMarkup(
        <ResultTabContent
          apiState={partialState}
          result={demoM1Workspace.results[0]!}
          tab="Вложения"
        />
      )
    );
    const loadingText = visibleText(
      renderToStaticMarkup(
        <ResultTabContent
          apiState={{
            ...retentionReadyApiState,
            attachmentPreviewRetentionSchedule: { state: "loading" }
          }}
          result={demoM1Workspace.results[0]!}
          tab="Вложения"
        />
      )
    );
    const errorText = visibleText(
      renderToStaticMarkup(
        <ResultTabContent
          apiState={{
            ...retentionReadyApiState,
            attachmentPreviewRetentionSchedule: {
              message: "/api/v1/launches/closed-launch/retention/schedule returned 503",
              state: "error"
            }
          }}
          result={demoM1Workspace.results[0]!}
          tab="Вложения"
        />
      )
    );
    const deniedText = visibleText(
      renderToStaticMarkup(
        <ResultTabContent
          apiState={deniedState}
          result={demoM1Workspace.results[0]!}
          tab="Вложения"
        />
      )
    );

    expect(emptyText).toContain("Нет батчей расписания dry-run");
    expect(partialText).toContain("Расписание dry-run частично доступно");
    expect(partialText).toContain("1 из 3");
    expect(loadingText).toContain("Загрузка dry-run schedule");
    expect(errorText).toContain("Расписание dry-run недоступно");
    expect(deniedText).toContain("Расписание dry-run запрещено");
    expect(deniedText).not.toContain("schedule-secret");
    expect(deniedText).not.toContain("Downloads");
    expect(deniedText).not.toContain("allure-results");
    expect(deniedText).not.toContain("project-1");
    expect(deniedText).not.toContain("retention-schedule-ui");
  });

  it("redacts unsafe dry-run schedule values and filters execution-like descriptor steps", () => {
    const sensitiveSchedule: AttachmentPreviewRetentionDryRunScheduleRead = {
      ...readyAttachmentPreviewRetentionSchedule,
      scope: {
        projectId: "project-1",
        launchId: "C:\\Users\\tester\\Downloads\\synthetic-results\\launch-secret",
        actorId: "Bearer schedule-token"
      },
      summary: {
        ...readyAttachmentPreviewRetentionSchedule.summary,
        plannedOperations: [
          "artifact.preview.retention.classify",
          "artifact.preview.retention.dry-run.schedule",
          "object.storage.delete",
          "provider.delete"
        ],
        scheduleDigest: "token=schedule-secret",
        projectionDigest: "storage://bucket/projection"
      },
      batches: [
        {
          ...readyAttachmentPreviewRetentionSchedule.batches[0]!,
          descriptorRefs: [
            "preview-retention-descriptor:safe",
            "storage://bucket/raw-preview",
            "https://object.test/file?X-Amz-Signature=schedule-secret"
          ],
          batchDigest: "token=schedule-secret"
        }
      ],
      diagnostics: [
        {
          code: "open-launch-descriptor-skipped",
          severity: "info",
          retryable: false,
          descriptorRef: "storage://bucket/descriptor",
          message:
            "Skipped C:\\Users\\tester\\Downloads\\synthetic-results\\open.log token=schedule-secret"
        }
      ]
    };
    const markup = renderToStaticMarkup(
      <ResultTabContent
        apiState={{
          ...retentionReadyApiState,
          attachmentPreviewRetentionSchedule: {
            data: sensitiveSchedule,
            state: "ready"
          }
        }}
        result={demoM1Workspace.results[0]!}
        tab="Вложения"
      />
    );
    const scheduleMarkup =
      markup.match(/<section\b[^>]*retention-schedule-panel[\s\S]*?<\/section>/)?.[0] ?? "";
    const text = visibleText(scheduleMarkup);

    expect(text).toContain("preview-retention-descriptor:safe");
    expect(text).not.toContain("schedule-secret");
    expect(text).not.toContain("Downloads");
    expect(text).not.toContain("allure-results");
    expect(text).not.toContain("storage://");
    expect(text).not.toContain("X-Amz-Signature");
    expect(text).not.toContain("https://object.test");
    expect(text).not.toContain("object.storage.delete");
    expect(text).not.toContain("provider.delete");
    expect(text).not.toContain("Bearer");
    expect(text).not.toContain("signed URL");
  });

  it("keeps browser smoke guidance aligned with the M4-X retention schedule descriptor surface", () => {
    expect(attachmentRetentionScheduleBrowserSmokeGuidance).toContain(
      "Открыть вкладку вложений результата и проверить, что dry-run расписание дескрипторов видно только в деталях вложений."
    );
    expect(attachmentRetentionScheduleBrowserSmokeGuidance.join(" ")).toContain(
      "#launch, #case, #defects и #analytics не показывают dry-run расписание вне деталей вложений"
    );
    expect(attachmentRetentionScheduleBrowserSmokeGuidance.join(" ")).toContain(
      "выполнение удаления, claims мутаций провайдера, storage refs, подписанные ссылки, локальные пути и token-like значения не отображаются"
    );
    expect(attachmentRetentionScheduleBrowserSmokeGuidance.join(" ")).toContain(
      "каждое действие хранения представлено диагностическим статусом только для чтения"
    );
  });
});
