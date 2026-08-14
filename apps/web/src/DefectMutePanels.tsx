import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  GitBranch,
  MoreHorizontal,
  ShieldCheck
} from "lucide-react";

import type {
  ApiState,
  DefectMuteProjectionApiState,
  DefectMuteProjectionRead,
  DefectMuteProjectionRecord,
  DefectMuteProjectedQualityGateReason,
  RuntimeUiState
} from "./api.js";
import { EmptyState, ProjectionStateMessage, ReadOnlyAction } from "./workspaceCommon.js";
import { getSafeProjectionDeniedMessage, sanitizeProjectionText } from "./workspaceSanitizers.js";
export function DefectMuteProjectionPanel({
  apiState,
  context
}: {
  apiState: ApiState;
  context: "defects" | "launch-result";
}) {
  const state = getDefectMuteProjectionState(apiState);
  const title =
    context === "launch-result" ? "Доказательства повтора дефекта запуска" : "Карантины дефектов";

  return (
    <section
      className={`defect-projection-panel ${state.state}`}
      aria-label={`${context} defect mute projection`}
    >
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">Проекция карантина</span>
          <h3>{title}</h3>
        </div>
        <span className={`runtime-state ${defectProjectionRuntimeState(state.state)}`}>
          {formatProjectionState(state.state)}
        </span>
      </div>

      {state.state === "ready" || state.state === "empty" || state.state === "partial" ? (
        <>
          {state.state === "partial" ? (
            <ProjectionStateMessage
              icon={<AlertTriangle size={17} />}
              title="Проекция карантина доступна частично"
              copy="Доказательства повтора доступны только для чтения, часть проекции скрыта редактированием или лимитом страницы."
            />
          ) : null}
          <ProjectionReplayExplanation state={state.state} data={state.data} context={context} />
          <DefectMuteProjectionReadout data={state.data} empty={state.state === "empty"} />
        </>
      ) : state.state === "loading" ? (
        <>
          <ProjectionStateMessage
            icon={<Clock3 size={17} />}
            title="Проекция карантина загружается"
            copy="Ждем повтор worker в режиме чтения перед показом эффектов карантина."
          />
          <ProjectionReplayExplanation state={state.state} context={context} />
        </>
      ) : state.state === "denied" ? (
        <>
          <ProjectionStateMessage
            icon={<ShieldCheck size={17} />}
            title="Проекция карантина недоступна"
            copy={`${sanitizeProjectionText(state.message)}. Детали актора и проекта скрыты в этом состоянии.`}
          />
          <ProjectionReplayExplanation
            state={state.state}
            message={state.message}
            context={context}
          />
        </>
      ) : state.state === "error" ? (
        <>
          <ProjectionStateMessage
            icon={<AlertTriangle size={17} />}
            title="Проекция карантина не отвечает"
            copy={`${sanitizeProjectionText(state.message)}. Локальные сводки дефектов остаются видимыми, пока endpoint недоступен.`}
          />
          <ProjectionReplayExplanation
            state={state.state}
            message={state.message}
            context={context}
          />
        </>
      ) : null}

      <div className="mute-actions" aria-label="Действия проекции карантина">
        <ReadOnlyAction icon={<Activity size={16} />} label="Проекция из read model" />
        <ReadOnlyAction
          icon={<GitBranch size={16} />}
          label="Replay сверяется дайджестом воркера"
        />
        <ReadOnlyAction icon={<MoreHorizontal size={16} />} label="Аудит проекции на странице" />
      </div>
    </section>
  );
}

function ProjectionReplayExplanation({
  context,
  data,
  message,
  state
}: {
  context: "defects" | "launch-result";
  data?: DefectMuteProjectionRead;
  message?: string;
  state: DefectMuteProjectionApiState["state"];
}) {
  const target =
    context === "launch-result"
      ? "состояние дефекта выбранного результата запуска"
      : "связанный список дефектов и сводка влияния на gate";
  const title = state === "empty" ? "Пояснение replay пустое" : "Пояснение replay";
  const copy = getProjectionReplayExplanation({ data, message, state, target });

  return (
    <div
      className={`projection-replay-explanation ${state}`}
      aria-label={`${context} replay explanation`}
    >
      <GitBranch size={17} />
      <span>
        <strong>{title}</strong>
        <small>{copy}</small>
      </span>
    </div>
  );
}

function getProjectionReplayExplanation({
  data,
  message,
  state,
  target
}: {
  data: DefectMuteProjectionRead | undefined;
  message: string | undefined;
  state: DefectMuteProjectionApiState["state"];
  target: string;
}): string {
  if (state === "loading") {
    return `Replay загружается для ${target}; автор, проект, идентификаторы падений, storage refs и controls мутаций пока не отображаются.`;
  }
  if (state === "denied") {
    return `${sanitizeProjectionText(message ?? "Чтение проекции запрещено")}. Объяснение replay недоступно, детали scope скрыты.`;
  }
  if (state === "error") {
    return `${sanitizeProjectionText(message ?? "Чтение проекции не выполнено")}. Объяснение replay недоступно, поэтому сводки дефектов остаются только для чтения.`;
  }
  if (data === undefined || data.projection.eventCount === 0) {
    return `Worker replay не нашел событий карантина для ${target}; raw записи падений остаются в сводке, мутации недоступны.`;
  }

  return `${data.projection.eventCount} append-only replay событий сформировали ${data.projection.activeMuteCount} активных записей карантина для ${target}; raw падения остаются агрегированными, effective gate effects отделены.`;
}

function DefectMuteProjectionReadout({
  data,
  empty
}: {
  data: DefectMuteProjectionRead;
  empty: boolean;
}) {
  const records = data.items.slice(0, 3);
  const scopeFacts = getProjectionScopeFacts(data);

  return (
    <>
      {scopeFacts.length > 0 ? (
        <div
          className="projection-scope-grid"
          aria-label="Скоуп доступа проекции карантина дефекта"
        >
          {scopeFacts.map((fact) => (
            <ProjectionFact key={fact.label} label={fact.label} value={fact.value} />
          ))}
        </div>
      ) : null}

      <div className="projection-meta-grid" aria-label="Defect mute replay metadata">
        <ProjectionFact label="Статус replay" value={data.projection.replayStatus} />
        <ProjectionFact label="Источник replay" value={data.projection.boundary} />
        <ProjectionFact label="Дайджест проекции" value={data.projection.projectionDigest} />
        <ProjectionFact
          label="Raw записи падений"
          value={data.projection.rawFailureOccurrenceCount}
        />
        <ProjectionFact
          label="Активные карантины"
          value={`${data.projection.activeMuteCount} активных / ${data.projection.inactiveMuteCount} неактивных`}
        />
        <ProjectionFact
          label="Replay события"
          value={`${data.projection.eventCount} событий / ${data.projection.mutedEventCount} в карантин / ${data.projection.unmutedEventCount} возвращено`}
        />
        <ProjectionFact
          label="Граница read model"
          value={`${data.projection.consistency} / ${data.projection.mutationBoundary}`}
        />
        <ProjectionFact
          label="Данные страницы"
          value={`${data.page.returned} показано / ${data.page.total} всего${data.page.hasMore ? " / часть скрыта" : ""}`}
        />
      </div>

      <section className="projection-raw-summary" aria-label="Raw defect mute failure history">
        <div>
          <span className="eyebrow">Входные данные replay</span>
          <strong>{data.rawFailureHistory.totalOccurrences} падений</strong>
          <small>
            провалено {data.rawFailureHistory.statusCounters.failed} / сломано{" "}
            {data.rawFailureHistory.statusCounters.broken}
          </small>
        </div>
        <div>
          <span className="eyebrow">Сводка test id</span>
          <strong>{countProjectionMapEntries(data.rawFailureHistory.byTestId)} групп</strong>
          <small>Идентификаторы из replay input не отображаются.</small>
        </div>
        <div>
          <span className="eyebrow">Сводка сигнатур</span>
          <strong>{countProjectionMapEntries(data.rawFailureHistory.bySignatureHash)} групп</strong>
          <small>Значения сигнатур остаются в worker read model.</small>
        </div>
      </section>

      {empty ? (
        <EmptyState
          title="Нет записей карантина в проекции"
          copy="Replay не вернул записей карантина для текущего пользователя и scope проекта."
        />
      ) : null}

      <ProjectionQualityGateComparison qualityGate={data.qualityGate} />

      <div className="projection-record-list" aria-label="Projected defect mute records">
        {records.map((record) => (
          <ProjectionRecordCard key={record.id} record={record} />
        ))}
        {records.length === 0 ? (
          <EmptyState
            title="На странице нет записей проекции"
            copy="Страница пустая, но raw счетчики падений остаются отделены от effective gate effects."
          />
        ) : null}
      </div>
    </>
  );
}

function getProjectionScopeFacts(data: DefectMuteProjectionRead): Array<{
  label: string;
  value: string;
}> {
  const facts: Array<{ label: string; value: string }> = [
    { label: "Скоуп доступа", value: data.access.scope },
    { label: "Режим чтения", value: data.access.mutation ? "мутации включены" : "только чтение" }
  ];

  if (data.access.projectScoped) {
    facts.push({ label: "Граница проекта", value: data.projectId });
  }
  if (data.access.actorScoped || data.actor !== undefined) {
    facts.push({ label: "Граница участника", value: data.actor?.actorId ?? "участник ограничен" });
  }
  if (data.access.redacted) {
    facts.push({ label: "Redaction", value: "redaction applied" });
  }

  return facts;
}

function ProjectionFact({ label, value }: { label: string; value: number | string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{sanitizeProjectionText(String(value))}</strong>
    </article>
  );
}

function ProjectionQualityGateComparison({
  qualityGate
}: {
  qualityGate?: DefectMuteProjectionRead["qualityGate"];
}) {
  if (qualityGate === undefined) {
    return (
      <EmptyState
        title="Нет проекции quality gate"
        copy="Для этого replay нет launch-scoped проекции quality gate."
      />
    );
  }

  const visibleReasons = qualityGate.effective.reasons.slice(0, 3);

  return (
    <section className="projection-gate-comparison" aria-label="Raw and effective gate effects">
      <article>
        <span className="eyebrow">Raw падения</span>
        <small>Raw gate snapshot до replay карантинов</small>
        <strong>{qualityGate.raw.status}</strong>
        <small>
          провалено {qualityGate.raw.statusCounters.failed ?? 0} / сломано{" "}
          {qualityGate.raw.statusCounters.broken ?? 0}
        </small>
        <small>
          failedBrokenTotal {qualityGate.raw.metrics.failedBrokenTotal ?? 0}, newFailures{" "}
          {qualityGate.raw.metrics.newFailures ?? 0}
        </small>
      </article>
      <article>
        <span className="eyebrow">Effective gate effects</span>
        <small>Effective gate после replay карантинов</small>
        <strong>{qualityGate.effective.status}</strong>
        <small>{qualityGate.effective.effects.length} projected mute effects применено</small>
        <small>{sanitizeProjectionText(qualityGate.distinction)}</small>
      </article>
      <div className="projection-reason-list">
        {visibleReasons.map((reason) => (
          <ProjectionReasonRow key={reason.code} reason={reason} />
        ))}
        {visibleReasons.length === 0 ? (
          <EmptyState
            title="Нет effective reason effects"
            copy="Raw gate значения не изменены, и ни один mute effect не изменил effective результат."
          />
        ) : null}
      </div>
    </section>
  );
}

function ProjectionReasonRow({ reason }: { reason: DefectMuteProjectedQualityGateReason }) {
  return (
    <article className={reason.effectivePassed ? "ready" : "blocked"}>
      {reason.effectivePassed ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      <span>
        <strong>{sanitizeProjectionText(reason.code)}</strong>
        <small>
          raw {reason.actual} {"->"} effective {reason.effectiveActual}; raw{" "}
          {reason.passed ? "пройдено" : "провалено"}, effective{" "}
          {reason.effectivePassed ? "пройдено" : "провалено"}
        </small>
        <small>
          затронуто тестов {reason.affectedTestCaseIds.length} / результатов{" "}
          {reason.affectedResultUuids.length}
        </small>
      </span>
    </article>
  );
}

function ProjectionRecordCard({ record }: { record: DefectMuteProjectionRecord }) {
  return (
    <article className={record.status}>
      <ShieldCheck size={17} />
      <span>
        <strong>{sanitizeProjectionText(record.id)}</strong>
        <small>
          {record.status} / автор {originLabel(record.origin)} / raw падений{" "}
          {record.rawFailureHistory.totalOccurrences}
        </small>
        <small>
          затронуто тестов {record.affectedTestIds.length} / сигнатур{" "}
          {record.affectedSignatureHashes.length}
        </small>
      </span>
      <em>
        {record.audit.eventCount} events
        {record.audit.unmutedEventCount > 0 ? " / unmuted" : ""}
      </em>
    </article>
  );
}

function getDefectMuteProjectionState(apiState: ApiState): DefectMuteProjectionApiState {
  if (apiState.defectMuteProjection !== undefined) {
    return apiState.defectMuteProjection;
  }
  if (apiState.loading) {
    return { state: "loading" };
  }
  if (apiState.denied !== undefined) {
    return {
      message: getSafeProjectionDeniedMessage(apiState.denied.message),
      state: "denied"
    };
  }
  if (apiState.error !== undefined) {
    return {
      message: apiState.error,
      state: "error"
    };
  }

  return {
    data: {
      kind: "defect-mute-projection",
      projectId: "demo-project",
      access: {
        scope: "defects:read",
        projectScoped: true,
        actorScoped: false,
        mutation: false,
        redacted: true
      },
      projection: {
        adapterKind: "in-memory-defect-mute-projection-wip",
        boundary: "worker-local-mute-projection",
        consistency: "append-only-replay",
        replayStatus: "replayed",
        projectionDigest: "demo-empty",
        mutationBoundary: "worker-projection-only-no-rest-mutation",
        eventCount: 0,
        mutedEventCount: 0,
        unmutedEventCount: 0,
        activeMuteCount: 0,
        inactiveMuteCount: 0,
        rawFailureOccurrenceCount: 0
      },
      page: {
        limit: 3,
        cursor: null,
        offset: 0,
        returned: 0,
        total: 0,
        nextCursor: null,
        hasMore: false
      },
      rawFailureHistory: {
        totalOccurrences: 0,
        statusCounters: { failed: 0, broken: 0 },
        byTestId: {},
        bySignatureHash: {}
      },
      items: []
    },
    state: "empty"
  };
}

function defectProjectionRuntimeState(
  state: DefectMuteProjectionApiState["state"]
): RuntimeUiState {
  if (state === "ready") {
    return "ready";
  }
  if (state === "loading" || state === "partial") {
    return "waiting";
  }
  if (state === "empty") {
    return "waiting";
  }
  return "blocked";
}

function formatProjectionState(state: DefectMuteProjectionApiState["state"]): string {
  const labels: Record<DefectMuteProjectionApiState["state"], string> = {
    denied: "нет доступа",
    empty: "пусто",
    error: "ошибка",
    loading: "загрузка",
    partial: "частично",
    ready: "готово"
  };

  return labels[state];
}

function originLabel(origin: DefectMuteProjectionRecord["origin"]): string {
  if (origin.type === "actor") {
    return sanitizeProjectionText(origin.actorId);
  }

  return sanitizeProjectionText(origin.systemId ?? "system");
}

function countProjectionMapEntries(values: Record<string, number> | undefined): number {
  return Object.keys(values ?? {}).length;
}
