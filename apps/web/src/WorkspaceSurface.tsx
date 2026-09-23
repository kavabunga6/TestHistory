import { ChevronRight, CircleDot, GitBranch, ShieldCheck } from "lucide-react";
import { useMemo } from "react";

import {
  getDeniedUiModel,
  getRuntimeUiModel,
  type ApiState,
  type PermissionDeniedError
} from "./api.js";
import { WorkspaceNavigation } from "./WorkspaceNavigation.js";
import type { ProjectSelection } from "./projectSelection.js";
import {
  M1_SURFACE_CONTRACT,
  assertM1SurfaceContract,
  emptyM1Workspace,
  type Launch,
  type LaunchListItem,
  type M1Workspace,
  type ResultStatus,
  type TestResult
} from "./m1Workspace.js";
import { ProductWorkspace } from "./ProductWorkspace.js";
import { emptyProjectSettings } from "./projectSettings.js";
import { AnalyticsReferenceScreen } from "./referenceScreens/AnalyticsReferenceScreen.js";
import { DashboardReferenceScreen } from "./referenceScreens/DashboardReferenceScreen.js";
import { DefectsReferenceScreen } from "./referenceScreens/DefectsReferenceScreen.js";
import { LaunchesReferenceScreen } from "./referenceScreens/LaunchesReferenceScreen.js";
import { ProjectSettingsReferenceScreen } from "./referenceScreens/ProjectSettingsReferenceScreen.js";
import { ProjectsReferenceScreen } from "./referenceScreens/ProjectsReferenceScreen.js";
import { TestCaseDetailReferenceScreen } from "./referenceScreens/TestCaseDetailReferenceScreen.js";
import { AutomationReferenceScreen } from "./referenceScreens/AutomationReferenceScreen.js";
import { StatusBadge } from "./workspaceCommon.js";
import { useIntegrationLinkProviders } from "./useIntegrationLinkProviders.js";
import {
  isReferenceWorkspaceMode,
  LIST_PAGE_SIZE,
  modeLabels,
  type WorkspaceMode
} from "./workspaceRouting.js";
assertM1SurfaceContract(M1_SURFACE_CONTRACT);

export const historyComparePermissionAuditBrowserSmokeGuidance = [
  "Открыть #case и выбрать кейс со сравнением истории.",
  "Проверить, что аудит прав отображается только внутри сравнения истории выбранного кейса.",
  "Проверить, что сохраненные инварианты аудита прав отображаются только внутри этого же раздела.",
  "Проверить, что состояния готово, частично, пусто, загрузка, ошибка и отказ не раскрывают автора или проект без разрешения read-модели.",
  "Проверить, что обновление сравнения, следующая страница, обновление инвариантов, пересчет аудита и открытие инварианта представлены статусами только для чтения.",
  "Проверить, что исходные данные, base/target inputs, локальные пути, storage refs, подписанные ссылки и token-like строки отсутствуют.",
  "Проверить, что #launch, #defects и #analytics не показывают аудит прав сравнения истории или инварианты."
] as const;

export const attachmentRetentionScheduleBrowserSmokeGuidance = [
  "Открыть вкладку вложений результата и проверить, что dry-run расписание дескрипторов видно только в деталях вложений.",
  "Проверить, что #launch, #case, #defects и #analytics не показывают dry-run расписание вне деталей вложений.",
  "Проверить, что выполнение удаления, claims мутаций провайдера, storage refs, подписанные ссылки, локальные пути и token-like значения не отображаются.",
  "Проверить, что каждое действие хранения представлено диагностическим статусом только для чтения из существующей read-модели."
] as const;

export const securityAuditExportLifecycleInvariantBrowserSmokeGuidance = [
  "Проверить, что #dashboard, #launch, #case, #defects и #analytics не показывают инварианты жизненного цикла аудиторского экспорта.",
  "Проверить, что сырые события жизненного цикла, payload запросов, endpoints провайдера, временные ссылки, локальные пути, storage refs и token-like строки не отображаются в продуктовых разделах."
] as const;

export const archiveDiagnosticReplayFixtureBrowserSmokeGuidance = [
  "Проверить, что материализованные синтетические фикстуры replay остаются только во внутренней диагностике приема архивов.",
  "Проверить, что #launch, #case, #defects и #analytics не отображают доказательства фикстур архива.",
  "Проверить, что действия фикстур видны только как статусы диагностики только для чтения.",
  "Проверить, что исходные данные архива, manifest entries, содержимое результатов, локальные пути, storage refs, подписанные ссылки и token-like строки не отображаются.",
  "Проверить, что видимые материализованные доказательства фикстур синтетические, ограниченные, проектные, акторные и только для чтения."
] as const;

export const defectMuteReplayInvariantBrowserSmokeGuidance = [
  "Открыть #defects и проверить, что видны только список дефектов и детали выбранного дефекта.",
  "Проверить, что projection карантина дефектов и replay-инварианты не отображаются в #defects.",
  "Открыть #launch с выбранным дефектом или результатом в карантине и проверить, что инварианты там не отображаются.",
  "Проверить, что состояния загрузки, пусто, отказ и наполненные инварианты не попадают в пользовательский раздел дефектов.",
  "Проверить, что #case и #analytics не показывают replay-инварианты карантина дефектов.",
  "Проверить, что запуски не показывают replay-инварианты карантина дефектов.",
  "Проверить, что raw event ids, история падений, payloads, traces, локальные пути, storage refs, подписанные ссылки, токены, credentials и authorization fields скрыты.",
  "Проверить, что controls инвариантов не видны в пользовательском экране дефектов."
] as const;

export function WorkspaceSurface({
  apiState,
  defectRouteId,
  launchRouteId,
  launchRouteQuery,
  launchRouteTab,
  launchRouteResultId,
  launchRouteResultTab,
  currentUserId,
  mode,
  projectSelection,
  settingsRouteTab,
  selectedId,
  resultPageIndex,
  resultPageSize,
  resultQuery,
  resultStatusFilter,
  testCaseRouteId,
  testCaseRouteTab,
  workspace: loadedWorkspace,
  workspaceLoading = false,
  onModeChange,
  onRefreshProjects,
  onSelectProject,
  onOpenLaunch,
  onOpenLaunchList,
  onOpenLaunchResult,
  onOpenLaunchResultsByTag,
  onOpenLaunchResultTab,
  onOpenLaunchTab,
  onOpenDefect,
  onOpenSettingsTab,
  onOpenTypographySettings,
  onOpenTestCaseTab,
  onRefreshWorkspace,
  onResultPageIndexChange,
  onResultPageSizeChange,
  onResultQueryChange,
  onResultStatusFilterChange,
  onSelect,
  onDeleteDefect,
  onDeleteLaunch,
  onDeleteTestCase,
  onToggleMuteResult,
  onUnlinkResultDefect
}: {
  apiState: ApiState;
  defectRouteId?: string | undefined;
  launchRouteId?: string | undefined;
  launchRouteQuery?: string | undefined;
  launchRouteTab?: string | undefined;
  launchRouteResultId?: string | undefined;
  launchRouteResultTab?: string | undefined;
  currentUserId?: string | undefined;
  mode: WorkspaceMode;
  projectSelection?: ProjectSelection | undefined;
  settingsRouteTab?: string | undefined;
  selectedId: string;
  resultPageIndex?: number | undefined;
  resultPageSize?: number | undefined;
  resultQuery?: string | undefined;
  resultStatusFilter?: ResultStatus | undefined;
  testCaseRouteId?: string | undefined;
  testCaseRouteTab?: string | undefined;
  workspace: M1Workspace;
  workspaceLoading?: boolean;
  onModeChange: (mode: WorkspaceMode) => void;
  onRefreshProjects?: (() => void) | undefined;
  onSelectProject?: ((projectId: string) => void) | undefined;
  onOpenLaunch?: ((id: string) => void) | undefined;
  onOpenLaunchList?: (() => void) | undefined;
  onOpenLaunchResult?: ((id: string, launchId?: string, testCaseId?: string) => void) | undefined;
  onOpenLaunchResultsByTag?: ((tag: string, resultId: string) => void) | undefined;
  onOpenLaunchResultTab?: ((tab: string) => void) | undefined;
  onOpenLaunchTab?: ((tab: string) => void) | undefined;
  onOpenDefect?: ((id: string) => void) | undefined;
  onOpenSettingsTab?: ((tab: string) => void) | undefined;
  onOpenTypographySettings?: (() => void) | undefined;
  onOpenTestCaseTab?: ((tab: string) => void) | undefined;
  onRefreshWorkspace?: (() => void) | undefined;
  onResultPageIndexChange?: ((index: number) => void) | undefined;
  onResultPageSizeChange?: ((size: number) => void) | undefined;
  onResultQueryChange?: ((query: string) => void) | undefined;
  onResultStatusFilterChange?: ((status: ResultStatus | undefined) => void) | undefined;
  onSelect: (id: string) => void;
  onDeleteDefect?: ((id: string) => void) | undefined;
  onDeleteLaunch?: ((id: string) => void) | undefined;
  onDeleteTestCase?: ((id: string) => void) | undefined;
  onToggleMuteResult?: ((id: string) => void) | undefined;
  onUnlinkResultDefect?: ((resultId: string, defectId: string) => void) | undefined;
}) {
  const workspace =
    projectSelection !== undefined &&
    (projectSelection.selectedProjectId === undefined ||
      loadedWorkspace.projectId !== projectSelection.selectedProjectId)
      ? emptyM1Workspace
      : loadedWorkspace;
  const integrationProviders = useIntegrationLinkProviders(
    projectSelection?.selectedProjectId ?? workspace.projectId
  );
  const selectedProject = projectSelection?.projects.find(
    (project) => project.id === projectSelection.selectedProjectId
  );
  const settingsPlaceholder = useMemo(
    () => (selectedProject === undefined ? undefined : emptyProjectSettings(selectedProject)),
    [selectedProject]
  );
  const runtimeModel = getRuntimeUiModel(apiState);
  const denied = apiState.denied;
  const referenceMode =
    isReferenceWorkspaceMode(mode) && (denied === undefined || mode === "projects");
  const splitReferenceMode =
    referenceMode && (mode === "launch" || mode === "case" || mode === "defects");
  const screenOwnsMain =
    (denied === undefined || mode === "projects") &&
    (mode === "projects" || mode === "dashboard" || mode === "settings");

  return (
    <div className={`app-shell ${referenceMode ? "app-shell--reference" : ""}`}>
      <WorkspaceNavigation
        activeMode={mode}
        onModeChange={onModeChange}
        onOpenTypographySettings={onOpenTypographySettings}
        selectedProjectName={selectedProject?.name ?? selectedProject?.key}
      />

      <section className={`workspace ${referenceMode ? "reference-workspace-shell" : ""}`}>
        {referenceMode ? null : (
          <WorkspaceHeader
            apiState={apiState}
            launch={workspace.launch}
            mode={mode}
            projectName={selectedProject?.name ?? selectedProject?.key}
          />
        )}
        {workspaceLoading ? <WorkspaceLoadingIndicator /> : null}
        {apiState.error !== undefined ? (
          <div className="workspace-error-toast" role="alert">
            <strong>Не удалось выполнить действие</strong>
            <span>{apiState.error}</span>
          </div>
        ) : null}

        <div
          className={`workspace-body ${referenceMode ? "reference-workspace-body" : ""} ${
            splitReferenceMode ? "reference-workspace-body--split" : ""
          }`}
        >
          <section
            className={`primary-column ${referenceMode ? "reference-primary-column" : ""} ${
              splitReferenceMode ? "reference-primary-column--split" : ""
            }`}
            role={screenOwnsMain ? undefined : "main"}
            aria-label={screenOwnsMain ? undefined : modeLabels[mode]}
          >
            {mode === "projects" ? (
              <ProjectsReferenceScreen
                error={projectSelection?.error}
                onRetry={onRefreshProjects}
                onSelectProject={onSelectProject}
                projects={projectSelection?.projects}
                selectedProjectId={projectSelection?.selectedProjectId}
                status={projectSelection?.status}
              />
            ) : denied !== undefined ? (
              <DeniedWorkspaceShell denied={denied} requestedMode={mode} />
            ) : projectSelection !== undefined &&
              (projectSelection.status !== "ready" ||
                projectSelection.selectedProjectId === undefined) ? (
              <ProjectsReferenceScreen
                error={projectSelection.error}
                onRetry={onRefreshProjects}
                onSelectProject={onSelectProject}
                projects={projectSelection.projects}
                selectedProjectId={projectSelection.selectedProjectId}
                status={projectSelection.status}
              />
            ) : mode === "dashboard" ? (
              <DashboardReferenceScreen
                key={`${currentUserId ?? ""}:${projectSelection?.selectedProjectId ?? ""}`}
                launchItems={workspace.launchItems}
                results={workspace.results}
                onOpenResult={onOpenLaunchResult}
                storageScope={
                  currentUserId !== undefined && projectSelection?.selectedProjectId !== undefined
                    ? `${currentUserId}:${projectSelection.selectedProjectId}`
                    : undefined
                }
              />
            ) : mode === "launch" ? (
              <LaunchesReferenceScreen
                integrationProviders={integrationProviders}
                projectId={projectSelection?.selectedProjectId ?? workspace.projectId}
                launchDetailLoading={workspaceLoading && launchRouteId !== undefined}
                launchDetailPartial={getLaunchPartialState(
                  workspace.launchItems,
                  workspace.results,
                  launchRouteId
                )}
                launchItems={workspace.launchItems}
                launchListLoading={workspaceLoading && launchRouteId === undefined}
                launchListPartial={
                  workspace.launchItems.length >= LIST_PAGE_SIZE
                    ? {
                        loadedCount: workspace.launchItems.length,
                        message: "Список запусков загружен первой ограниченной страницей."
                      }
                    : undefined
                }
                loadingScope={getLaunchLoadingScope(
                  workspaceLoading,
                  launchRouteId,
                  launchRouteResultId
                )}
                routeLaunchId={launchRouteId}
                routeQuery={launchRouteQuery}
                routeLaunchTab={launchRouteTab}
                routeResultId={launchRouteResultId}
                routeResultTab={launchRouteResultTab}
                resultLoading={workspaceLoading && launchRouteResultId !== undefined}
                resultPage={workspace.resultPage}
                resultPageIndex={resultPageIndex}
                resultPageSize={resultPageSize}
                resultQuery={resultQuery}
                resultStatusFilter={resultStatusFilter}
                resultPartial={
                  launchRouteResultId !== undefined && workspace.results.length <= 1
                    ? {
                        loadedCount: workspace.results.length,
                        message:
                          "Открыта карточка выбранного результата без загрузки всего запуска."
                      }
                    : undefined
                }
                results={workspace.results}
                selectedResultDetail={workspace.selectedResultDetail}
                selectedResultId={selectedId}
                onOpenLaunch={onOpenLaunch}
                onOpenLaunchList={onOpenLaunchList}
                onOpenResult={onOpenLaunchResult}
                onOpenResultTab={onOpenLaunchResultTab}
                onOpenTab={onOpenLaunchTab}
                onRefresh={onRefreshWorkspace}
                onResultPageIndexChange={onResultPageIndexChange}
                onResultPageSizeChange={onResultPageSizeChange}
                onResultQueryChange={onResultQueryChange}
                onResultStatusFilterChange={onResultStatusFilterChange}
                onSelectResult={onSelect}
                onDeleteLaunch={onDeleteLaunch}
                onToggleMuteResult={onToggleMuteResult}
                onUnlinkResultDefect={onUnlinkResultDefect}
              />
            ) : mode === "case" ? (
              <TestCaseDetailReferenceScreen
                integrationProviders={integrationProviders}
                projectId={projectSelection?.selectedProjectId ?? workspace.projectId}
                routeTab={testCaseRouteTab}
                results={workspace.results}
                selectedId={testCaseRouteId ?? selectedId}
                onSelect={onSelect}
                onOpenResult={onOpenLaunchResult}
                onOpenLaunchResultsByTag={onOpenLaunchResultsByTag}
                onOpenTab={onOpenTestCaseTab}
                onDeleteTestCase={onDeleteTestCase}
                onToggleMuteResult={onToggleMuteResult}
                onUnlinkResultDefect={onUnlinkResultDefect}
              />
            ) : mode === "defects" ? (
              <DefectsReferenceScreen
                projectId={projectSelection?.selectedProjectId ?? workspace.projectId}
                routeDefectId={defectRouteId}
                results={workspace.results}
                onDeleteDefect={onDeleteDefect}
                onOpenDefect={onOpenDefect}
              />
            ) : mode === "automation" ? (
              <AutomationReferenceScreen projectId={projectSelection?.selectedProjectId} />
            ) : mode === "analytics" ? (
              <AnalyticsReferenceScreen
                projectId={
                  projectSelection?.selectedProjectId ??
                  workspace.projectId ??
                  workspace.launchItems.find((item) => item.projectId !== undefined)?.projectId
                }
                results={workspace.results}
                onOpenResult={onOpenLaunchResult}
              />
            ) : mode === "settings" ? (
              <ProjectSettingsReferenceScreen
                key={projectSelection?.selectedProjectId}
                projectId={projectSelection?.selectedProjectId}
                routeTab={settingsRouteTab}
                onOpenTab={onOpenSettingsTab}
                {...(settingsPlaceholder !== undefined ? { settings: settingsPlaceholder } : {})}
              />
            ) : (
              <ProductWorkspace
                apiState={apiState}
                launch={workspace.launch}
                mode={mode}
                results={workspace.results}
                runtimeModel={runtimeModel}
                onModeChange={onModeChange}
              />
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function WorkspaceLoadingIndicator() {
  return (
    <div
      className="workspace-loading-indicator"
      role="status"
      aria-atomic="true"
      aria-live="polite"
    >
      <span aria-hidden="true" />
      <strong>Обновляем данные</strong>
    </div>
  );
}

function getLaunchLoadingScope(
  workspaceLoading: boolean,
  launchRouteId: string | undefined,
  launchRouteResultId: string | undefined
): Array<"launch-list" | "launch-detail" | "result"> | undefined {
  if (!workspaceLoading) {
    return undefined;
  }

  if (launchRouteResultId !== undefined) {
    return ["result"];
  }

  if (launchRouteId !== undefined) {
    return ["launch-detail"];
  }

  return ["launch-list"];
}

function getLaunchPartialState(
  launchItems: LaunchListItem[],
  results: TestResult[],
  launchId: string | undefined
):
  | {
      loadedCount: number;
      message: string;
      totalCount: number;
    }
  | undefined {
  if (launchId === undefined) {
    return undefined;
  }

  const launch = launchItems.find((item) => item.id === launchId);
  if (launch === undefined) {
    return undefined;
  }

  const totalCount = getLaunchCounterTotal(launch);
  if (totalCount <= results.length) {
    return undefined;
  }

  return {
    loadedCount: results.length,
    message: "Результаты запуска загружены первой ограниченной страницей.",
    totalCount
  };
}

function getLaunchCounterTotal(launch: LaunchListItem): number {
  return Object.values(launch.counters).reduce((total, count) => total + count, 0);
}

function WorkspaceHeader({
  apiState,
  launch,
  mode,
  projectName
}: {
  apiState: ApiState;
  launch: Launch;
  mode: WorkspaceMode;
  projectName?: string | undefined;
}) {
  const denied = apiState.denied !== undefined;
  const apiLabel = apiState.loading
    ? "API загружается"
    : denied
      ? "Доступ закрыт"
      : apiState.error
        ? "API недоступен"
        : "API доступен";
  const title = denied ? "Доступ закрыт" : modeLabels[mode];

  return (
    <header className="workspace-header">
      <div className="header-copy">
        <div className="breadcrumbs" aria-label="Breadcrumb">
          <span>{projectName ?? "Проекты"}</span>
          <ChevronRight size={14} />
          <span>{modeLabels[mode]}</span>
          {title !== modeLabels[mode] ? (
            <>
              <ChevronRight size={14} />
              <span>{title}</span>
            </>
          ) : null}
        </div>
        <div className="title-row">
          <h1>{title}</h1>
          {denied ? <span className="denied-pill">Доступ закрыт</span> : null}
          {!denied && mode !== "launch" ? <StatusBadge status="passed" /> : null}
        </div>
        {!denied ? (
          <div className="header-meta">
            <span>
              <GitBranch size={14} /> {launch.branch}
            </span>
            <span>{launch.build}</span>
            <span>{launch.environment}</span>
            <span>{launch.started}</span>
          </div>
        ) : null}
      </div>

      <div className="header-actions">
        <span className={`live-pill ${apiState.error || denied ? "offline" : "online"}`}>
          <CircleDot size={13} /> {apiLabel}
        </span>
      </div>
    </header>
  );
}

function DeniedWorkspaceShell({
  denied,
  requestedMode
}: {
  denied: PermissionDeniedError;
  requestedMode: WorkspaceMode;
}) {
  const model = getDeniedUiModel(denied);

  return (
    <section className="denied-shell" aria-label="Состояние закрытого доступа">
      <div className="denied-hero">
        <ShieldCheck size={22} />
        <div>
          <span className="eyebrow">Права доступа</span>
          <h2>{model.title}</h2>
          <p>{model.message}</p>
        </div>
        <span className="denied-pill">Доступ закрыт</span>
      </div>

      <div className="denied-contract" aria-label="Сводка закрытого доступа">
        <span>
          Раздел <strong>{modeLabels[requestedMode]}</strong>
        </span>
        <span>
          Причина <strong>{model.reason}</strong>
        </span>
        <span>
          Ресурс <strong>{model.resource}</strong>
        </span>
      </div>

      <section className="denied-grid" aria-label="Недоступные состояния раздела">
        {model.surfaces.map((surface) => (
          <article className="denied-card" key={surface.id}>
            <div>
              <span className="ready-pill">{surface.badge}</span>
              <h3>{surface.title}</h3>
              <p>{surface.copy}</p>
            </div>
            <span
              className="denied-readonly-action"
              title="Действие выполняется через администратора доступа"
            >
              {surface.actionLabel}
            </span>
          </article>
        ))}
      </section>
    </section>
  );
}
