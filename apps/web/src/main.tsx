import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { loadApiState, type ApiState } from "./api.js";
import {
  ConfirmDeleteDialog,
  QuarantineDialog,
  type ConfirmDeleteRequest,
  type QuarantineFormData,
  type QuarantineRequest
} from "./AppDialogs.js";
import { emptyM1Workspace, resolveLaunchResultId } from "./m1Workspace.js";
import { AuthPanel } from "./AuthPanel.js";
import { TypographySettingsDialog } from "./TypographySettingsDialog.js";
import { getDefaultSelectedResultId, isResultQuarantined } from "./appRoutingHelpers.js";
import { useCurrentUserAccess } from "./useCurrentUserAccess.js";
import { useWorkspaceData } from "./useWorkspaceData.js";
import { useWorkspaceRoute } from "./useWorkspaceRoute.js";
import {
  deleteLaunchFromApi,
  deleteDefectFromApi,
  deprecateTestCaseFromApi,
  quarantineResultFromApi,
  removeResultFromQuarantineApi,
  unlinkResultFromDefectApi
} from "./workspaceMutations.js";
import {
  findLaunchIdForResult,
  getResultIdsForLaunch,
  withRecomputedLaunchCounters,
  type WorkspaceMode
} from "./workspaceRouting.js";
import {
  applyTypographyPreferences,
  defaultTypographyPreferences,
  loadTypographyPreferences,
  saveTypographyPreferences,
  type TypographyPreferences
} from "./typographyPreferences.js";
import "@fontsource/inter/cyrillic-400.css";
import "@fontsource/inter/cyrillic-500.css";
import "@fontsource/inter/cyrillic-600.css";
import "@fontsource/inter/cyrillic-700.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "./styles.css";
import "./typography.css";

const WorkspaceSurface = React.lazy(async () => {
  const module = await import("./WorkspaceSurface.js");
  return { default: module.WorkspaceSurface };
});

const legacyRuntimePanelRussianLabels = [
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
] as const;
void legacyRuntimePanelRussianLabels;

function App() {
  const { route, setRoute } = useWorkspaceRoute();
  const [apiState, setApiState] = useState<ApiState>({ loading: true });
  const { canDeleteEntities, currentUser } = useCurrentUserAccess();
  const { refreshWorkspace, selectedId, setSelectedId, setWorkspace, workspace, workspaceLoading } =
    useWorkspaceData(route, setApiState, currentUser?.id);
  const [confirmDeleteRequest, setConfirmDeleteRequest] = useState<
    ConfirmDeleteRequest | undefined
  >();
  const [quarantineRequest, setQuarantineRequest] = useState<QuarantineRequest | undefined>();
  const [typographyDialogOpen, setTypographyDialogOpen] = useState(false);
  const [typographyPreferences, setTypographyPreferences] = useState<TypographyPreferences>({
    ...defaultTypographyPreferences
  });
  const [typographyBaseline, setTypographyBaseline] = useState<TypographyPreferences>({
    ...defaultTypographyPreferences
  });

  useEffect(() => {
    const next = loadTypographyPreferences(currentUser?.id ?? "anonymous");
    setTypographyPreferences(next);
    setTypographyBaseline(next);
    applyTypographyPreferences(next);
  }, [currentUser?.id]);

  useEffect(() => {
    let active = true;
    void loadApiState().then((nextState: ApiState) => {
      if (active) {
        setApiState(nextState);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback(
    (nextMode: WorkspaceMode) => {
      if (nextMode !== route.mode) {
        setWorkspace(emptyM1Workspace);
        setSelectedId("");
      }
      setRoute({ mode: nextMode });
    },
    [route.mode, setRoute, setSelectedId, setWorkspace]
  );
  const requireCurrentUser = (action: () => void) => {
    if (currentUser !== undefined) {
      action();
      return;
    }

    setConfirmDeleteRequest({
      body: "Войдите или зарегистрируйтесь, чтобы выполнять изменения в проекте.",
      confirmLabel: "Понятно",
      title: "Требуется авторизация",
      onConfirm: () => undefined
    });
  };
  const removeLaunchFromWorkspace = (launchId: string) => {
    let nextSelectedId = selectedId;
    setWorkspace((currentWorkspace) => {
      const deletedResultIds = new Set(getResultIdsForLaunch(currentWorkspace.results, launchId));
      const nextResults = currentWorkspace.results.filter(
        (result) => !deletedResultIds.has(result.id)
      );
      nextSelectedId = deletedResultIds.has(selectedId)
        ? getDefaultSelectedResultId(nextResults)
        : selectedId;

      return withRecomputedLaunchCounters({
        ...currentWorkspace,
        launchItems: currentWorkspace.launchItems.filter((launch) => launch.id !== launchId),
        results: nextResults
      });
    });
    setSelectedId(nextSelectedId);
    setRoute({ mode: "launch" });
  };
  const performDeleteLaunch = async (launchId: string) => {
    try {
      await deleteLaunchFromApi(launchId);
      removeLaunchFromWorkspace(launchId);
    } catch (error) {
      setApiState({
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
  const deleteLaunch = (launchId: string) => {
    requireCurrentUser(() => {
      const launch = workspace.launchItems.find((item) => item.id === launchId);
      setConfirmDeleteRequest({
        body: `Будет удалён запуск${launch?.name ? ` "${launch.name}"` : ""}, его результаты и вложения из текущего представления.`,
        confirmLabel: "Удалить",
        title: "Удалить запуск?",
        onConfirm: () => void performDeleteLaunch(launchId)
      });
    });
  };
  const performDeleteTestCase = async (resultId: string) => {
    try {
      const receipt = await deprecateTestCaseFromApi(resultId);
      setWorkspace((currentWorkspace) =>
        withRecomputedLaunchCounters({
          ...currentWorkspace,
          results: currentWorkspace.results.map((result) =>
            result.id === resultId
              ? {
                  ...result,
                  deletedAt: receipt.updatedAt,
                  deletedReason: "Тест-кейс переведён в архивный статус",
                  workflow: "Deprecated"
                }
              : result
          )
        })
      );
    } catch (error) {
      setApiState({
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
  const deleteTestCase = (resultId: string) => {
    requireCurrentUser(() => {
      const result = workspace.results.find((item) => item.id === resultId);
      setConfirmDeleteRequest({
        body: `Тест-кейс${result?.name ? ` "${result.name}"` : ""} будет помечен как удаленный и исключен из активного списка.`,
        confirmLabel: "Удалить тест-кейс",
        title: "Удалить тест-кейс?",
        onConfirm: () => void performDeleteTestCase(resultId)
      });
    });
  };
  const performUnquarantineResult = async (resultId: string) => {
    const result = workspace.results.find((item) => item.id === resultId);
    const muteId = result?.defectMute?.id;
    const projectId = workspace.launch.owner;
    if (result === undefined || muteId === undefined || projectId === "") {
      return;
    }
    try {
      await removeResultFromQuarantineApi(projectId, muteId);
      setWorkspace((currentWorkspace) =>
        withRecomputedLaunchCounters({
          ...currentWorkspace,
          results: currentWorkspace.results.map((candidate) => {
            if (candidate.id !== resultId) {
              return candidate;
            }
            const { defectMute: _defectMute, previousStatus: _previousStatus, ...rest } = candidate;
            void _defectMute;
            void _previousStatus;
            return {
              ...rest,
              muted: false,
              status:
                candidate.status === "muted"
                  ? (candidate.previousStatus ?? "skipped")
                  : candidate.status
            };
          })
        })
      );
    } catch (error) {
      setApiState({
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
  const toggleMuteResult = (resultId: string) => {
    requireCurrentUser(() => {
      const targetResult = workspace.results.find((result) => result.id === resultId);
      if (targetResult === undefined) {
        return;
      }

      if (!isResultQuarantined(targetResult)) {
        setQuarantineRequest({ result: targetResult });
        return;
      }
      void performUnquarantineResult(resultId);
    });
  };
  const applyQuarantineResult = async ({
    creator: _creator,
    defectId,
    reason,
    taskId
  }: QuarantineFormData) => {
    if (currentUser === undefined) {
      setQuarantineRequest(undefined);
      requireCurrentUser(() => undefined);
      return;
    }

    const request = quarantineRequest;
    if (request === undefined) {
      return;
    }

    const trimmedDefectId = defectId.trim();
    const trimmedReason = reason.trim();
    const trimmedTaskId = taskId.trim();
    const launchId = route.launchId ?? findLaunchIdForResult(workspace.results, request.result.id);
    if (launchId === undefined) {
      setApiState({ loading: false, error: "Не найден запуск для выбранного результата" });
      return;
    }
    try {
      const receipt = await quarantineResultFromApi(launchId, request.result.id, {
        reason: trimmedReason || "Карантин результата",
        ...(trimmedDefectId !== "" ? { defectId: trimmedDefectId } : {}),
        ...(trimmedTaskId !== "" ? { taskId: trimmedTaskId } : {})
      });
      setWorkspace((currentWorkspace) =>
        withRecomputedLaunchCounters({
          ...currentWorkspace,
          results: currentWorkspace.results.map((result) =>
            result.id !== request.result.id
              ? result
              : {
                  ...result,
                  defectMute: {
                    actor:
                      receipt.mute.origin.type === "actor"
                        ? receipt.mute.origin.actorId
                        : receipt.mute.origin.systemId,
                    affectedTestCaseIds: receipt.mute.affectedTestIds,
                    id: receipt.mute.id,
                    mutedAt: receipt.mute.mutedAt,
                    reason: receipt.mute.reason,
                    scope: "defect",
                    ...(receipt.defectId !== undefined ? { defectId: receipt.defectId } : {}),
                    ...(receipt.taskId !== undefined ? { taskId: receipt.taskId } : {})
                  },
                  muted: true
                }
          )
        })
      );
      setQuarantineRequest(undefined);
    } catch (error) {
      setApiState({
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
  const performDeleteDefect = async (defectId: string) => {
    try {
      const receipt = await deleteDefectFromApi(workspace.launch.owner, defectId);
      const removedAt = receipt.event.occurredAt;
      setWorkspace((currentWorkspace) => ({
        ...currentWorkspace,
        results: currentWorkspace.results.map((result) => {
          if (result.defect !== defectId && !result.issues.includes(defectId)) {
            return result;
          }

          const nextResult = {
            ...result,
            issues: result.issues.filter((issue) => issue !== defectId)
          };

          if (result.defect !== defectId) {
            return nextResult;
          }

          const withoutActiveDefect = { ...nextResult };
          delete withoutActiveDefect.defect;
          return {
            ...withoutActiveDefect,
            defectHistory: [
              ...(result.defectHistory ?? []),
              { id: defectId, removedAt, title: result.name }
            ]
          };
        })
      }));
    } catch (error) {
      setApiState({
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
  const deleteDefect = (defectId: string) => {
    requireCurrentUser(() => {
      setConfirmDeleteRequest({
        body: `Дефект "${defectId}" будет удален из активных связей, но останется в истории тестов.`,
        confirmLabel: "Удалить дефект",
        title: "Удалить дефект?",
        onConfirm: () => performDeleteDefect(defectId)
      });
    });
  };
  const performUnlinkResultDefect = async (resultId: string, defectId: string) => {
    const launchId = findLaunchIdForResult(workspace.results, resultId);
    if (launchId === undefined) {
      setApiState({ loading: false, error: "Не удалось определить запуск результата" });
      return;
    }
    try {
      const receipt = await unlinkResultFromDefectApi(
        workspace.launch.owner,
        defectId,
        resultId,
        launchId
      );
      const removedAt = receipt.event.occurredAt;
      setWorkspace((currentWorkspace) =>
        withRecomputedLaunchCounters({
          ...currentWorkspace,
          results: currentWorkspace.results.map((result) => {
            if (result.id !== resultId) {
              return result;
            }
            if (result.defect !== defectId && !result.issues.includes(defectId)) {
              return result;
            }

            const nextResult = {
              ...result,
              issues: result.issues.filter((issue) => issue !== defectId),
              defectHistory: [
                ...(result.defectHistory ?? []),
                { id: defectId, removedAt, title: result.name }
              ]
            };

            if (result.defect !== defectId) {
              return nextResult;
            }

            const withoutActiveDefect = { ...nextResult };
            delete withoutActiveDefect.defect;
            return withoutActiveDefect;
          })
        })
      );
    } catch (error) {
      setApiState({
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
  const unlinkResultDefect = (resultId: string, defectId: string) => {
    requireCurrentUser(() => {
      const result = workspace.results.find((item) => item.id === resultId);
      setConfirmDeleteRequest({
        body: `Связь дефекта "${defectId}" с тест-кейсом${
          result?.name ? ` "${result.name}"` : ""
        } будет удалена из активных связей и сохранена в истории.`,
        confirmLabel: "Отвязать дефект",
        title: "Отвязать дефект от тест-кейса?",
        onConfirm: () => performUnlinkResultDefect(resultId, defectId)
      });
    });
  };

  const closeConfirmDeleteDialog = () => setConfirmDeleteRequest(undefined);
  const confirmDelete = () => {
    const request = confirmDeleteRequest;
    if (request === undefined) {
      return;
    }

    closeConfirmDeleteDialog();
    request.onConfirm();
  };

  if (currentUser === undefined) {
    return (
      <main className="app-shell app-shell--auth-only">
        <section className="auth-only-surface" aria-label="Авторизация">
          <AuthPanel />
        </section>
      </main>
    );
  }

  return (
    <>
      <React.Suspense
        fallback={
          <main className="app-shell" aria-busy="true">
            <p>Загрузка интерфейса…</p>
          </main>
        }
      >
        <WorkspaceSurface
          apiState={apiState}
          defectRouteId={route.defectId}
          launchRouteId={route.launchId}
          launchRouteQuery={route.launchQuery}
          launchRouteTab={route.launchTab}
          launchRouteResultId={route.resultId}
          launchRouteResultTab={route.resultTab}
          mode={route.mode}
          settingsRouteTab={route.settingsTab}
          testCaseRouteId={route.testCaseId}
          testCaseRouteTab={route.testCaseTab}
          selectedId={route.mode === "case" ? (route.testCaseId ?? "") : selectedId}
          workspace={workspace}
          workspaceLoading={workspaceLoading || apiState.loading}
          onModeChange={setMode}
          onSelect={(id) => {
            setSelectedId(id);
            if (route.mode === "case") {
              setRoute({
                mode: "case",
                testCaseId: id,
                testCaseTab: route.testCaseTab ?? "overview"
              });
            }
          }}
          onOpenLaunch={(id) => setRoute({ launchId: id, launchTab: "overview", mode: "launch" })}
          onOpenLaunchList={() => setRoute({ mode: "launch" })}
          onRefreshWorkspace={() =>
            void refreshWorkspace({ focusLaunchId: route.launchId, focusResultId: route.resultId })
          }
          onOpenLaunchResult={(id, targetLaunchId, targetTestCaseId) => {
            const launchId =
              targetLaunchId ??
              findLaunchIdForResult(workspace.results, id) ??
              route.launchId ??
              workspace.launchItems[0]?.id;
            if (launchId === undefined || launchId === "") {
              return;
            }
            const resolvedResultIdPromise =
              targetTestCaseId === undefined
                ? Promise.resolve(id)
                : resolveLaunchResultId(launchId, id, targetTestCaseId).catch(() => id);
            void resolvedResultIdPromise.then((resolvedResultId) => {
              setSelectedId(resolvedResultId);
              setRoute({
                launchId,
                mode: "launch",
                resultId: resolvedResultId,
                resultTab: "overview"
              });
            });
          }}
          onOpenLaunchResultsByTag={(tag, resultId) => {
            const launchId =
              findLaunchIdForResult(workspace.results, resultId) ?? workspace.launchItems[0]?.id;
            if (launchId === undefined || launchId === "") {
              return;
            }
            setRoute({
              launchId,
              launchQuery: `tag = ${JSON.stringify(tag)}`,
              launchTab: "results",
              mode: "launch"
            });
          }}
          onOpenLaunchTab={(tab) =>
            setRoute({
              launchId: route.launchId ?? workspace.launchItems[0]?.id,
              launchTab: tab,
              mode: "launch"
            })
          }
          onOpenLaunchResultTab={(tab) => {
            if (route.resultId === undefined) {
              return;
            }
            setRoute({
              launchId: route.launchId ?? findLaunchIdForResult(workspace.results, route.resultId),
              mode: "launch",
              resultId: route.resultId,
              resultTab: tab
            });
          }}
          onOpenDefect={(id) => setRoute({ defectId: id, mode: "defects" })}
          onOpenSettingsTab={(tab) => setRoute({ mode: "settings", settingsTab: tab })}
          onOpenTypographySettings={() => {
            setTypographyBaseline(typographyPreferences);
            setTypographyDialogOpen(true);
          }}
          onOpenTestCaseTab={(tab) =>
            setRoute({ mode: "case", testCaseId: route.testCaseId ?? selectedId, testCaseTab: tab })
          }
          onDeleteDefect={canDeleteEntities ? deleteDefect : undefined}
          onDeleteLaunch={canDeleteEntities ? deleteLaunch : undefined}
          onDeleteTestCase={canDeleteEntities ? deleteTestCase : undefined}
          onToggleMuteResult={toggleMuteResult}
          onUnlinkResultDefect={canDeleteEntities ? unlinkResultDefect : undefined}
        />
      </React.Suspense>
      <ConfirmDeleteDialog
        request={confirmDeleteRequest}
        onCancel={closeConfirmDeleteDialog}
        onConfirm={confirmDelete}
      />
      <QuarantineDialog
        request={quarantineRequest}
        onCancel={() => setQuarantineRequest(undefined)}
        onConfirm={applyQuarantineResult}
      />
      <TypographySettingsDialog
        open={typographyDialogOpen}
        value={typographyPreferences}
        onCancel={() => {
          setTypographyPreferences(typographyBaseline);
          applyTypographyPreferences(typographyBaseline);
          setTypographyDialogOpen(false);
        }}
        onPreview={(next) => {
          setTypographyPreferences(next);
          applyTypographyPreferences(next);
        }}
        onSave={(next) => {
          const saved = saveTypographyPreferences(currentUser?.id ?? "anonymous", next);
          setTypographyPreferences(saved);
          setTypographyBaseline(saved);
          applyTypographyPreferences(saved);
          setTypographyDialogOpen(false);
        }}
      />
    </>
  );
}

if (typeof document !== "undefined") {
  applyTypographyPreferences(defaultTypographyPreferences);
  const root = document.getElementById("root");
  if (root !== null) {
    createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }
}
