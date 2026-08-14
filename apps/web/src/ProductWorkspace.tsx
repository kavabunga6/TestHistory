import { getArchiveIntakeUiModel, type ApiState, type RuntimeUiModel } from "./api.js";
import { ApiStateNotice } from "./ApiStateNotice.js";
import { AttachmentPreviewRetentionPanel } from "./AttachmentPanels.js";
import { DefectsWorkspace } from "./DefectsWorkspace.js";
import type { Launch, TestResult } from "./m1Workspace.js";
import { DashboardReferenceScreen } from "./referenceScreens/DashboardReferenceScreen.js";
import { ArchiveIntakeStatusPanel, RuntimeOperationsPanel } from "./RuntimePanels.js";
import { modeLabels, type WorkspaceMode } from "./workspaceRouting.js";
export function ProductWorkspace({
  apiState,
  launch: _launch,
  mode,
  results,
  runtimeModel,
  onModeChange: _onModeChange
}: {
  apiState: ApiState;
  launch: Launch;
  mode: WorkspaceMode;
  results: TestResult[];
  runtimeModel: RuntimeUiModel;
  onModeChange: (mode: WorkspaceMode) => void;
}) {
  if (mode === "dashboard") {
    return <DashboardReferenceScreen results={results} />;
  }

  if (mode === "defects") {
    return <DefectsWorkspace results={results} />;
  }

  if (mode === "jobs") {
    return (
      <>
        <ApiStateNotice
          apiState={apiState}
          readyText="Задачи показывают готовность обработки запусков и границы телеметрии воркеров."
          scope="задачи"
        />
        <ArchiveIntakeStatusPanel context="Задачи" model={getArchiveIntakeUiModel(apiState)} />
        <AttachmentPreviewRetentionPanel apiState={apiState} context="Задачи" />
        <RuntimeOperationsPanel model={runtimeModel} />
      </>
    );
  }

  return (
    <section className="product-view unavailable-view">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Недоступно</span>
          <h2>{modeLabels[mode]}</h2>
        </div>
        <span className="ready-pill">Скрыто из навигации</span>
      </div>
      <p className="product-copy">
        Раздел скрыт из навигации, потому что для текущего режима нет доступного read model.
      </p>
    </section>
  );
}
