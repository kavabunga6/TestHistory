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

describe("history compare surface readiness", () => {
  it("normalizes M2-Q/M2-R permission audit read model into selected-case History compare UI", () => {
    const base = demoM1Workspace.results[0]!;
    const mergedCompare = mergeHistoryComparePermissionAuditRead(base.historyCompare, {
      kind: "test-case-history-compare-permission-audit",
      projectId: "project-rest-audit",
      testCaseId: base.id,
      actor: { type: "actor", actorId: "actor-rest-audit", scoped: true },
      access: {
        scope: "test-cases:read",
        projectScoped: true,
        actorScoped: true,
        mutation: false,
        redacted: true
      },
      availability: {
        status: "partial",
        projectScoped: true,
        actorScoped: true,
        redacted: true,
        partial: true,
        unavailable: ["labels.securityTier", "raw-sensitive-unavailable-token"]
      },
      query: {
        projectId: "project-rest-audit",
        actorId: "actor-rest-audit",
        comparePairScoped: true,
        pagination: { limit: 2, cursor: null, offset: 0 },
        redacted: true
      },
      audit: {
        adapterKind: "in-memory-history-compare-permission-audit-wip",
        boundary: "read-only-permission-audit-projection",
        projectId: "project-rest-audit",
        actorScoped: true,
        projectionDigest: "sha256:rest-audit-projection",
        mutationBoundary: "read-only-no-rest-mutation",
        replayedEventCount: 5,
        recordCount: 2,
        byDecision: { ready: 1, partial: 1, denied: 0 },
        rawHistory: {
          included: false,
          preserved: true,
          digests: ["sha256:rest-audit-raw-history"],
          itemCount: 7
        },
        firstOccurredAt: "2026-05-30T07:10:00Z",
        lastOccurredAt: "2026-05-30T07:12:00Z"
      },
      page: { limit: 2, offset: 0, returned: 2, total: 2, hasMore: false },
      redaction: {
        rawHistoryIncluded: false,
        rawCompareInputsIncluded: false,
        hiddenOrMaskedValuesIncluded: false,
        tokensIncluded: false,
        pathsIncluded: false,
        storageLocationsIncluded: false,
        artifactUrlsIncluded: false
      },
      items: [
        {
          compareId: "cmp-ready-1",
          testCaseId: base.id,
          actor: { type: "actor", actorId: "actor-rest-audit", scoped: true },
          decision: "ready",
          reasons: [{ code: "permission.ready", severity: "info", fields: ["status"] }],
          unavailable: [],
          rawHistory: {
            included: false,
            preserved: true,
            digest: "sha256:record-raw-history-1",
            itemCount: 3
          },
          eventCount: 2,
          firstOccurredAt: "2026-05-30T07:10:00Z",
          lastOccurredAt: "2026-05-30T07:11:00Z",
          redacted: true
        },
        {
          compareId: "cmp-partial-2",
          testCaseId: base.id,
          actor: { type: "actor", actorId: "actor-rest-audit", scoped: true },
          decision: "partial",
          reasons: [
            {
              code: "permission.partial",
              severity: "warn",
              explanation:
                "Bearer hidden token at C:\\Users\\tester\\Downloads\\permission-audit.json",
              fields: ["labels.securityTier", "storage://hidden/raw-history"]
            }
          ],
          unavailable: [
            "labels.securityTier",
            "signedUrl=https://storage.example?X-Amz-Signature=raw"
          ],
          rawHistory: {
            included: false,
            preserved: true,
            digest: "sha256:record-raw-history-2",
            itemCount: 4
          },
          eventCount: 3,
          redacted: true
        }
      ],
      policy: {
        restParity: {
          method: "GET",
          path: "/api/v1/test-cases/{testCaseId}/history/compare/permission-audit"
        },
        mutationAllowed: false,
        rawHistoryIncluded: false,
        rawCompareInputsIncluded: false,
        deniedStateMasked: true
      }
    });
    const workspace: M1Workspace = {
      ...demoM1Workspace,
      results: [{ ...base, historyCompare: mergedCompare! }, ...demoM1Workspace.results.slice(1)]
    };
    const markup = renderSelectedCaseTab("history", onlineApiState, workspace, base.id);
    const text = visibleText(markup);

    expect(text).toContain("Сравнение истории частично доступно");
    expect(text).toContain("Аудит прав");
    expect(text).toContain("REST-чтение аудита прав");
    expect(text).toContain(
      "Область доступа test-cases:read / область проекта / область автора / только чтение"
    );
    expect(text).toContain("Автор аудита actor-rest-audit");
    expect(text).toContain("Проект аудита project-rest-audit");
    expect(text).toContain("Дайджест проекции sha256:rest-audit-projection");
    expect(text).toContain("Дайджест источника sha256:rest-audit-raw-history");
    expect(text).toContain("Записи аудита");
    expect(text).toContain("1-2 из 2 записей");
    expect(text).toContain("Запись аудита готова");
    expect(text).toContain("Запись аудита частичная");
    expect(text).toContain("cmp-ready-1");
    expect(text).toContain("cmp-partial-2");
    expect(text).toContain("3 исходных элементов сохранено");
    expect(text).toContain("4 исходных элементов сохранено");
    expect(text).toContain("чувствительные входные данные сравнения скрыты");
    expect(text).not.toContain("raw-sensitive-unavailable-token");
    expect(text).not.toContain("permission-audit.json");
    expect(text).not.toContain("Bearer hidden token");
    expect(text).not.toContain("storage://hidden");
    expect(text).not.toContain("X-Amz-Signature");
    expect(text).not.toContain("baseResultUuid");
    expect(text).not.toContain("targetResultUuid");
  });

  it("normalizes M2-AB permission audit invariant evidence into selected-case History compare only", () => {
    const base = demoM1Workspace.results[0]!;
    const mergedCompare = mergeHistoryComparePermissionAuditRead(base.historyCompare, undefined, {
      kind: "test-case-history-compare-permission-audit-replay-invariants",
      projectId: "project-invariant-ui",
      testCaseId: base.id,
      actor: { type: "actor", actorId: "actor-invariant-ui", scoped: true },
      access: {
        scope: "test-cases:read",
        projectScoped: true,
        actorScoped: true,
        mutation: false,
        redacted: true
      },
      availability: {
        status: "partial",
        projectScoped: true,
        actorScoped: true,
        redacted: true,
        partial: true,
        unavailable: ["redaction"]
      },
      query: {
        projectId: "project-invariant-ui",
        actorId: "actor-invariant-ui",
        testCaseId: base.id,
        testCaseScoped: true,
        projectScoped: true,
        actorScoped: true,
        comparePairScoped: false,
        pagination: { limit: 2, cursor: null, offset: 0 },
        redacted: true
      },
      invariant: {
        boundary: "read-only-history-compare-permission-audit-replay-invariant",
        source: "in-memory-history-compare-permission-audit-wip",
        consistency: "append-only-replay",
        mutationBoundary: "rest-read-only-no-replay-mutation",
        deterministic: true,
        recomputable: true,
        projectScoped: true,
        actorScoped: {
          requested: true,
          passed: true,
          actorId: "actor-invariant-ui",
          leakedActorIds: ["synthetic://foreign-actor?token=hidden"]
        },
        projectionDigest: "sha256:rest-invariant-projection",
        recomputedDigest: "sha256:rest-invariant-projection"
      },
      appendOnly: {
        uniqueProjectedEventIds: true,
        duplicateEventIds: ["synthetic://duplicate-event?token=hidden"],
        totalProjectedEventIds: 2
      },
      rawCompareInputs: {
        included: false,
        preserved: true,
        digestCount: 2,
        itemCount: 5
      },
      redaction: {
        passed: true,
        leakedMarkerCount: 0,
        leakedMarkers: ["signedUrl=https://storage.example?X-Amz-Signature=raw"],
        rawHistoryIncluded: false,
        rawCompareInputsIncluded: false,
        hiddenOrMaskedValuesIncluded: false,
        tokensIncluded: false,
        pathsIncluded: false,
        storageLocationsIncluded: false,
        artifactUrlsIncluded: false,
        policy: "synthetic://raw-compare-input?token=hidden stays outside the selected-case UI"
      },
      page: { limit: 2, offset: 0, returned: 2, total: 2, hasMore: false },
      items: [
        {
          ordinal: 0,
          eventId: "history-compare-permission:invariant-ready",
          redacted: true
        },
        {
          ordinal: 1,
          eventId: "storage://hidden/raw-compare-input",
          redacted: true
        }
      ]
    });
    const workspace: M1Workspace = {
      ...demoM1Workspace,
      results: [{ ...base, historyCompare: mergedCompare! }, ...demoM1Workspace.results.slice(1)]
    };
    const caseMarkup = renderSelectedCaseTab("history", onlineApiState, workspace, base.id);
    const caseText = visibleText(caseMarkup);

    expect(caseText).toContain("Инварианты аудита прав");
    expect(caseText).toContain("Сохраненные summaries инвариантов");
    expect(caseText).toContain("Инварианты частично доступны");
    expect(caseText).toContain("Автор инварианта actor-invariant-ui");
    expect(caseText).toContain("Проект инварианта project-invariant-ui");
    expect(caseText).toContain("Дайджест проекции sha256:rest-invariant-projection");
    expect(caseText).toContain("Дайджест пересчета sha256:rest-invariant-projection");
    expect(caseText).toContain("5 исходных элементов сохранено, 2 дайджеста, сырые входы скрыты");
    expect(caseText).toContain("history-compare-permission:invariant-ready");
    expect(caseText).toContain("метаданные события скрыты");
    expect(caseText).not.toContain("raw-compare-input");
    expect(caseText).not.toContain("storage://hidden");
    expect(caseText).not.toContain("X-Amz-Signature");
    expect(caseText).not.toContain("token=hidden");
    expect(caseText).not.toContain("baseResultUuid");
    expect(caseText).not.toContain("targetResultUuid");

    for (const label of [
      "Инварианты из read model",
      "Пересчет сверяется дайджестом",
      "Аудит открыт на странице"
    ]) {
      const button = buttonContaining(caseMarkup, label);
      expect(caseMarkup, `${label} read-only status should be visible`).toContain(label);
      expect(button, `${label} should not be a fake disabled action`).toBeUndefined();
    }
    expect(caseText).not.toContain("WIP");

    for (const mode of ["launch", "jobs", "defects", "analytics"] as const) {
      const text = visibleText(renderWorkspaceSurface(mode, onlineApiState, workspace, base.id));
      expect(text, `${mode} should not render permission audit invariant evidence`).not.toContain(
        "Инварианты аудита прав"
      );
      expect(text, `${mode} should not render persisted invariant summaries`).not.toContain(
        "Сохраненные summaries инвариантов"
      );
      expect(text, `${mode} should not render selected-case invariant controls`).not.toContain(
        "Пересчитать аудит"
      );
      expect(text, `${mode} should not render invariant events`).not.toContain(
        "history-compare-permission:invariant-ready"
      );
    }
  });

  it("guards persisted history compare invariant denied, empty, loading, and populated states in selected case context", () => {
    const base = demoM1Workspace.results[0]!;
    const invariant = base.historyCompare!.permissionAuditInvariant!;
    const deniedWorkspace: M1Workspace = {
      ...demoM1Workspace,
      results: [
        {
          ...base,
          historyCompare: {
            ...base.historyCompare!,
            permissionAuditInvariant: {
              ...invariant,
              state: "denied",
              actor: { state: "denied", text: "bearer raw-invariant-token" },
              project: { state: "denied", text: "C:\\tmp\\raw-invariant-project.json" },
              invariant: {
                ...invariant.invariant,
                projectionDigest: "token=raw-invariant-projection",
                recomputedDigest: "C:\\tmp\\raw-invariant-recomputed.json"
              },
              redaction: {
                ...invariant.redaction,
                policy: "signedUrl=https://storage.example/history?X-Amz-Signature=raw"
              },
              items: [
                {
                  ordinal: 0,
                  eventId: "storage://hidden/raw-invariant-event?token=raw",
                  redacted: true
                }
              ]
            }
          }
        },
        ...demoM1Workspace.results.slice(1)
      ]
    };
    const emptyWorkspace: M1Workspace = {
      ...demoM1Workspace,
      results: [
        {
          ...base,
          historyCompare: {
            ...base.historyCompare!,
            permissionAuditInvariant: {
              ...invariant,
              state: "empty",
              actor: "actor-invariant-empty",
              project: "project-invariant-empty",
              page: { limit: 3, offset: 0, returned: 0, total: 0, hasMore: false },
              items: []
            }
          }
        },
        ...demoM1Workspace.results.slice(1)
      ]
    };
    const compareWithoutInvariant = { ...base.historyCompare! };
    delete compareWithoutInvariant.permissionAuditInvariant;
    const loadingWorkspace: M1Workspace = {
      ...demoM1Workspace,
      results: [
        { ...base, historyCompare: compareWithoutInvariant },
        ...demoM1Workspace.results.slice(1)
      ]
    };

    const deniedMarkup = renderSelectedCaseTab("history", onlineApiState, deniedWorkspace, base.id);
    const deniedText = visibleText(deniedMarkup);
    expect(deniedText).toContain("Инварианты аудита прав");
    expect(deniedText).toContain("Инварианты недоступны");
    expect(deniedText).toContain("Доказательства инвариантов скрыты");
    expect(deniedText).toContain("Проект и автор скрыты");
    expect(deniedText).not.toContain("Автор инварианта");
    expect(deniedText).not.toContain("raw-invariant-token");
    expect(deniedText).not.toContain("raw-invariant-project");
    expect(deniedText).not.toContain("raw-invariant-projection");
    expect(deniedText).not.toContain("raw-invariant-recomputed");
    expect(deniedText).not.toContain("raw-invariant-event");
    expect(deniedText).not.toContain("X-Amz-Signature");
    expect(buttonContaining(deniedMarkup, "Обновить инварианты")).toBeUndefined();

    const emptyMarkup = renderSelectedCaseTab("history", onlineApiState, emptyWorkspace, base.id);
    const emptyText = visibleText(emptyMarkup);
    expect(emptyText).toContain("Инвариантов нет");
    expect(emptyText).toContain("Сохраненных событий инвариантов нет");
    expect(emptyText).toContain("нет доступных событий replay-инвариантов");
    expect(emptyText).not.toContain("Автор инварианта actor-invariant-empty");
    expect(emptyText).not.toContain("Проект инварианта project-invariant-empty");
    expect(buttonContaining(emptyMarkup, "Обновить инварианты")).toBeUndefined();

    const loadingMarkup = renderSelectedCaseTab(
      "history",
      apiStates.loading!,
      loadingWorkspace,
      base.id
    );
    const loadingText = visibleText(loadingMarkup);
    expect(loadingText).toContain("Инварианты аудита прав загружаются");
    expect(loadingText).toContain("Ждем сохраненные summaries инвариантов");
    expect(loadingText).not.toContain("Сохраненные summaries инвариантов.");
    expect(buttonContaining(loadingMarkup, "Обновить инварианты")).toBeUndefined();

    const populatedMarkup = renderSelectedCaseTab(
      "history",
      onlineApiState,
      demoM1Workspace,
      base.id
    );
    const populatedText = visibleText(populatedMarkup);
    expect(populatedText).toContain("Инварианты готовы");
    expect(populatedText).toContain("Сохраненные summaries инвариантов");
    for (const label of [
      "Инварианты из read model",
      "Пересчет сверяется дайджестом",
      "Аудит открыт на странице"
    ]) {
      const button = buttonContaining(populatedMarkup, label);
      expect(populatedMarkup, `${label} populated read-only status should be visible`).toContain(
        label
      );
      expect(
        button,
        `${label} populated control should not be a fake disabled action`
      ).toBeUndefined();
    }
    expect(populatedText).not.toContain("WIP");

    for (const [workspaceName, workspace, apiState] of [
      ["denied", deniedWorkspace, onlineApiState],
      ["empty", emptyWorkspace, onlineApiState],
      ["loading", loadingWorkspace, apiStates.loading!],
      ["populated", demoM1Workspace, onlineApiState]
    ] as const) {
      for (const mode of ["launch", "jobs", "defects", "analytics"] as const) {
        const text = visibleText(renderWorkspaceSurface(mode, apiState, workspace, base.id));
        expect(text, `${workspaceName} ${mode}`).not.toContain("Инварианты аудита прав");
        expect(text, `${workspaceName} ${mode}`).not.toContain(
          "Инварианты аудита прав загружаются"
        );
        expect(text, `${workspaceName} ${mode}`).not.toContain("Сохраненных событий инвариантов");
        expect(text, `${workspaceName} ${mode}`).not.toContain("Доказательства инвариантов скрыты");
      }
    }
  });

  it("renders permission audit empty and denied read states without exposing scoped metadata", () => {
    const base = demoM1Workspace.results[0]!;
    const emptyCompare = mergeHistoryComparePermissionAuditRead(base.historyCompare, {
      kind: "test-case-history-compare-permission-audit",
      projectId: "project-empty-audit",
      testCaseId: base.id,
      actor: { type: "actor", actorId: "actor-empty-audit", scoped: true },
      access: {
        scope: "test-cases:read",
        projectScoped: true,
        actorScoped: true,
        mutation: false,
        redacted: true
      },
      availability: { status: "empty", projectScoped: true, actorScoped: true, redacted: true },
      query: { projectId: "project-empty-audit", actorId: "actor-empty-audit", redacted: true },
      audit: {
        projectId: "project-empty-audit",
        projectionDigest: "sha256:empty-audit",
        replayedEventCount: 0,
        recordCount: 0,
        byDecision: { ready: 0, partial: 0, denied: 0 },
        rawHistory: { included: false, preserved: true, digests: [], itemCount: 0 }
      },
      page: { limit: 3, offset: 0, returned: 0, total: 0, hasMore: false },
      redaction: {
        rawHistoryIncluded: false,
        rawCompareInputsIncluded: false,
        hiddenOrMaskedValuesIncluded: false,
        tokensIncluded: false,
        pathsIncluded: false,
        storageLocationsIncluded: false,
        artifactUrlsIncluded: false
      },
      items: []
    });
    const deniedCompare = mergeHistoryComparePermissionAuditRead(base.historyCompare, {
      kind: "test-case-history-compare-permission-audit",
      projectId: "project-denied-hidden",
      testCaseId: base.id,
      actor: { type: "actor", actorId: "actor-denied-hidden", scoped: true },
      access: {
        scope: "test-cases:read",
        projectScoped: true,
        actorScoped: true,
        mutation: false,
        redacted: true
      },
      availability: {
        status: "denied",
        reason: "Bearer denied-token at C:\\tmp\\history-compare.json",
        projectScoped: true,
        actorScoped: true,
        redacted: true
      },
      query: { projectId: "project-denied-hidden", actorId: "actor-denied-hidden", redacted: true },
      audit: {
        projectId: "project-denied-hidden",
        projectionDigest: "sha256:denied-audit",
        replayedEventCount: 1,
        recordCount: 1,
        byDecision: { ready: 0, partial: 0, denied: 1 },
        rawHistory: {
          included: false,
          preserved: true,
          digests: ["sha256:denied-raw"],
          itemCount: 1
        }
      },
      page: { limit: 1, offset: 0, returned: 1, total: 1, hasMore: false },
      redaction: {
        rawHistoryIncluded: false,
        rawCompareInputsIncluded: false,
        hiddenOrMaskedValuesIncluded: false,
        tokensIncluded: false,
        pathsIncluded: false,
        storageLocationsIncluded: false,
        artifactUrlsIncluded: false
      },
      items: [
        {
          compareId: "cmp-denied",
          actor: { type: "actor", actorId: "actor-denied-hidden", scoped: true },
          decision: "denied",
          rawHistory: {
            included: false,
            preserved: true,
            digest: "sha256:denied-record",
            itemCount: 1
          },
          eventCount: 1,
          redacted: true
        }
      ]
    });
    const emptyText = visibleText(
      renderSelectedCaseTab(
        "history",
        onlineApiState,
        {
          ...demoM1Workspace,
          results: [{ ...base, historyCompare: emptyCompare! }, ...demoM1Workspace.results.slice(1)]
        },
        base.id
      )
    );
    const deniedText = visibleText(
      renderSelectedCaseTab(
        "history",
        onlineApiState,
        {
          ...demoM1Workspace,
          results: [
            { ...base, historyCompare: deniedCompare! },
            ...demoM1Workspace.results.slice(1)
          ]
        },
        base.id
      )
    );

    expect(emptyText).toContain("Аудита нет");
    expect(emptyText).toContain("Нет видимых записей аудита");
    expect(emptyText).toContain("actor-empty-audit");
    expect(emptyText).toContain("project-empty-audit");
    expect(deniedText).toContain("Доступ к сравнению истории запрещен");
    expect(deniedText).toContain("Аудит недоступен");
    expect(deniedText).toContain("Автор аудита Скрыто правами");
    expect(deniedText).toContain("Проект аудита Скрыто правами");
    expect(deniedText).not.toContain("actor-denied-hidden");
    expect(deniedText).not.toContain("project-denied-hidden");
    expect(deniedText).not.toContain("denied-token");
    expect(deniedText).not.toContain("history-compare.json");
  });

  it("keeps browser smoke guidance aligned with the M2-AB History compare audit surface", () => {
    expect(historyComparePermissionAuditBrowserSmokeGuidance).toContain(
      "Открыть #case и выбрать кейс со сравнением истории."
    );
    expect(historyComparePermissionAuditBrowserSmokeGuidance.join(" ")).toContain(
      "#launch, #defects и #analytics не показывают аудит прав сравнения истории или инварианты"
    );
    expect(historyComparePermissionAuditBrowserSmokeGuidance.join(" ")).toContain(
      "обновление сравнения, следующая страница, обновление инвариантов, пересчет аудита и открытие инварианта представлены статусами только для чтения"
    );
  });

  it("keeps enriched history compare details scoped to selected case info only", () => {
    const caseText = visibleText(renderSurface("case", onlineApiState));
    const historyText = visibleText(renderSelectedCaseTab("history"));
    const launchText = visibleText(renderSurface("launch", onlineApiState));
    const jobsText = visibleText(renderSurface("jobs", onlineApiState));
    const defectsText = visibleText(renderSurface("defects", onlineApiState));
    const analyticsText = visibleText(renderSurface("analytics", onlineApiState));

    expect(caseText).not.toContain("Изменился исполнитель");
    expect(historyText).toContain("Изменился исполнитель");
    expect(historyText).toContain("Изменились ветка и сборка");
    expect(historyText).toContain("Изменилась сигнатура дефекта");

    for (const text of [launchText, jobsText, defectsText, analyticsText]) {
      expect(text).not.toContain("History compare");
      expect(text).not.toContain("Изменился исполнитель");
      expect(text).not.toContain("Изменились ветка и сборка");
      expect(text).not.toContain("Изменилась сигнатура дефекта");
      expect(text).not.toContain("Compare actor");
      expect(text).not.toContain("Permission audit");
      expect(text).not.toContain("Permission audit invariants");
      expect(text).not.toContain("hcmp-projection-digest-auth-001");
      expect(text).not.toContain("hcmp-invariant-auth-001");
      expect(text).not.toContain("Raw history digest");
      expect(text).not.toContain("Raw compare inputs");
    }
  });

  it("renders compare redacted and permission-hidden values without leaking raw content", () => {
    const base = demoM1Workspace.results[0]!;
    const workspace: M1Workspace = {
      ...demoM1Workspace,
      results: [
        {
          ...base,
          historyCompare: {
            ...base.historyCompare!,
            scope: {
              actor: { state: "denied", text: "raw-sensitive-actor" },
              project: { state: "redacted", text: "raw-sensitive-project" },
              permission: "redacted",
              redactionApplied: true,
              redactedFields: ["labels.owner", "actor"]
            },
            changes: [
              {
                id: "redacted-label",
                field: "labels",
                label: "Labels changed",
                before: "owner: Platform QA",
                after: { state: "redacted", text: "raw-sensitive-label" },
                impact: "medium"
              },
              {
                id: "denied-defect",
                field: "defectSignature",
                label: "Defect signature changed",
                before: "none",
                after: { state: "denied", text: "raw-sensitive-defect" },
                impact: "high"
              }
            ],
            limit: 2,
            total: 2,
            hasMore: false
          }
        },
        ...demoM1Workspace.results.slice(1)
      ]
    };
    const text = visibleText(renderSelectedCaseTab("history", onlineApiState, workspace, base.id));

    expect(text).toContain("[redacted]");
    expect(text).toContain("Скрыто правами");
    expect(text).toContain("Чтение разрешено с редакцией");
    expect(text).not.toContain("raw-sensitive-actor");
    expect(text).not.toContain("raw-sensitive-project");
    expect(text).not.toContain("raw-sensitive-label");
    expect(text).not.toContain("raw-sensitive-defect");
  });

  it("renders selected-case history compare denied state without leaking hidden values", () => {
    const base = demoM1Workspace.results[0]!;
    const workspace: M1Workspace = {
      ...demoM1Workspace,
      results: [
        {
          ...base,
          historyCompare: {
            ...base.historyCompare!,
            availability: {
              state: "denied",
              title: "History compare access denied",
              message: "This actor or project scope cannot read enriched history compare data.",
              reason: "insufficient_scope"
            },
            scope: {
              actor: { state: "denied", text: "raw-sensitive-actor" },
              project: { state: "denied", text: "raw-sensitive-project" },
              permission: "denied",
              redactionApplied: true,
              redactedFields: ["actor", "project"]
            },
            permissionAudit: {
              state: "denied",
              actor: { state: "denied", text: "raw-sensitive-audit-actor" },
              project: { state: "denied", text: "raw-sensitive-audit-project" },
              evaluatedAt: "2026-05-30T06:50:00Z",
              replay: {
                eventCount: 3,
                acceptedCount: 0,
                deniedCount: 3,
                partialCount: 0,
                duplicateCount: 0,
                ignoredCount: 1
              },
              digest: {
                projectionDigest: "hcmp-projection-denied-001",
                rawHistoryDigest: "sha256:raw-history-denied-digest-001",
                algorithm: "sha256",
                rawHistoryExposed: false
              },
              reason: { state: "denied", text: "raw-sensitive-denial-reason" },
              redactedFields: ["actor", "project", "permission.reason", "rawHistory"]
            },
            changes: [
              {
                id: "denied-raw-change",
                field: "defectSignature",
                label: "Defect signature changed",
                before: "raw-sensitive-before",
                after: "raw-sensitive-after",
                impact: "high"
              }
            ]
          }
        },
        ...demoM1Workspace.results.slice(1)
      ]
    };
    const markup = renderSelectedCaseTab("history", onlineApiState, workspace, base.id);
    const text = visibleText(markup);

    expect(text).toContain("Сравнение истории");
    expect(text).toContain("Доступ к сравнению истории запрещен");
    expect(text).toContain("Права доступа Доступ запрещен");
    expect(text).toContain("Автор сравнения Скрыто правами");
    expect(text).toContain("Проект Скрыто правами");
    expect(text).toContain("Аудит прав");
    expect(text).toContain("Аудит недоступен");
    expect(text).toContain("Автор аудита Скрыто правами");
    expect(text).toContain("Проект аудита Скрыто правами");
    expect(text).toContain("Причина доступа Скрыто правами");
    expect(text).toContain("События replay 3");
    expect(text).toContain("Раскрытие источника Чувствительные исходные данные скрыты");
    expect(text).toContain("Причина: insufficient_scope");
    expect(text).not.toContain("Изменилась сигнатура дефекта");
    expect(text).not.toContain("raw-sensitive-actor");
    expect(text).not.toContain("raw-sensitive-project");
    expect(text).not.toContain("raw-sensitive-audit-actor");
    expect(text).not.toContain("raw-sensitive-audit-project");
    expect(text).not.toContain("raw-sensitive-denial-reason");
    expect(text).not.toContain("raw-sensitive-before");
    expect(text).not.toContain("raw-sensitive-after");

    expect(markup).toContain("Сравнение из read model");
    expect(buttonContaining(markup, "Сравнение из read model")).toBeUndefined();
  });

  it("renders partial compare data and redaction messaging without leaking restricted fields", () => {
    const base = demoM1Workspace.results[0]!;
    const workspace: M1Workspace = {
      ...demoM1Workspace,
      results: [
        {
          ...base,
          historyCompare: {
            ...base.historyCompare!,
            availability: {
              state: "partial",
              title: "History compare partially available",
              message: "Some enriched compare fields are unavailable or hidden by permission.",
              unavailable: ["labels.securityTier", "defectSignature"]
            },
            scope: {
              actor: "history-compare-api",
              project: "My project",
              permission: "redacted",
              redactionApplied: true,
              redactedFields: ["labels.securityTier", "defectSignature"]
            },
            permissionAudit: {
              state: "partial",
              actor: "history-compare-api",
              project: "My project",
              evaluatedAt: "2026-05-30T06:55:00Z",
              replay: {
                eventCount: 9,
                acceptedCount: 5,
                deniedCount: 1,
                partialCount: 3,
                duplicateCount: 1,
                ignoredCount: 2
              },
              digest: {
                projectionDigest: "token=raw-sensitive-token",
                rawHistoryDigest: "sha256:raw-history-partial-digest-001",
                algorithm: "sha256",
                rawHistoryExposed: false
              },
              reason: "token=raw-sensitive-permission-reason",
              redactedFields: ["permission.reason", "labels.securityTier", "raw-sensitive-field"]
            },
            changes: [
              {
                id: "partial-status",
                field: "status",
                label: "Status changed",
                before: "passed",
                after: "failed",
                impact: "high"
              },
              {
                id: "partial-labels",
                field: "labels",
                label: "Labels changed",
                before: { state: "redacted", text: "raw-sensitive-label-before" },
                after: { state: "denied", text: "raw-sensitive-label-after" },
                impact: "medium"
              }
            ],
            limit: 2,
            total: 2,
            hasMore: false
          }
        },
        ...demoM1Workspace.results.slice(1)
      ]
    };
    const text = visibleText(renderSelectedCaseTab("history", onlineApiState, workspace, base.id));

    expect(text).toContain("Сравнение истории частично доступно");
    expect(text).toContain("Часть данных недоступна");
    expect(text).toContain("Часть полей сравнения недоступна или скрыта правами");
    expect(text).toContain("labels.securityTier");
    expect(text).toContain("defectSignature");
    expect(text).toContain("Редакция Редакция применена: labels.securityTier, defectSignature");
    expect(text).toContain("Аудит прав");
    expect(text).toContain("Аудит частично доступен");
    expect(text).toContain("События replay 9");
    expect(text).toContain("Причина доступа [redacted]");
    expect(text).toContain("Дайджест проекции [redacted]");
    expect(text).toContain("Раскрытие источника Чувствительные исходные данные скрыты");
    expect(text).toContain("Изменился статус");
    expect(text).toContain("[redacted]");
    expect(text).toContain("Скрыто правами");
    expect(text).not.toContain("raw-sensitive-label-before");
    expect(text).not.toContain("raw-sensitive-label-after");
    expect(text).not.toContain("raw-sensitive-token");
    expect(text).not.toContain("raw-sensitive-permission-reason");
    expect(text).not.toContain("raw-sensitive-field");
  });

  it("renders history compare empty, loading, error, and denied states without leaving case scope", () => {
    const emptyText = visibleText(
      renderSelectedCaseTab("history", onlineApiState, demoM1Workspace, "AUTH-483421")
    );
    expect(emptyText).toContain("Между сравниваемыми запусками нет изменений");
    expect(emptyText).toContain("На этой странице нет изменений");
    expect(emptyText).not.toContain("Runtime model");

    const loadingText = visibleText(renderSelectedCaseTab("history", apiStates.loading!));
    expect(loadingText).toContain("Сравнение истории загружается");
    expect(loadingText).toContain("Сравнение истории");

    const errorText = visibleText(renderSelectedCaseTab("history", apiStates.error!));
    expect(errorText).toContain("Ошибка API");
    expect(errorText).toContain("Сравнение истории");

    const base = demoM1Workspace.results[0]!;
    const compareErrorWorkspace: M1Workspace = {
      ...demoM1Workspace,
      results: [
        {
          ...base,
          historyCompare: {
            ...base.historyCompare!,
            availability: {
              state: "error",
              title: "History compare unavailable",
              message: "token=raw-sensitive-token"
            }
          }
        },
        ...demoM1Workspace.results.slice(1)
      ]
    };
    const compareErrorText = visibleText(
      renderSelectedCaseTab("history", onlineApiState, compareErrorWorkspace, base.id)
    );
    expect(compareErrorText).toContain("Сравнение истории недоступно");
    expect(compareErrorText).toContain("Строки сравнения недоступны");
    expect(compareErrorText).not.toContain("raw-sensitive-token");

    const deniedText = visibleText(renderSurface("case", m5DeniedApiState));
    expect(deniedText).toContain("Доступ закрыт");
    expect(deniedText).not.toContain("PermissionDeniedError");
    expect(deniedText).not.toContain("History compare");
  });
});
