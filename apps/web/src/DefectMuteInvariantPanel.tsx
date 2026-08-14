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
  DefectMuteReplayInvariantApiState,
  DefectMuteReplayInvariantRead,
  RuntimeUiState
} from "./api.js";
import { EmptyState, ProjectionStateMessage, ReadOnlyAction } from "./workspaceCommon.js";
import { getSafeProjectionDeniedMessage, sanitizeProjectionText } from "./workspaceSanitizers.js";
export function DefectMuteReplayInvariantPanel({
  apiState,
  context
}: {
  apiState: ApiState;
  context: "defects" | "launch-result";
}) {
  const state = getDefectMuteReplayInvariantState(apiState);
  const title =
    context === "launch-result" ? "Инварианты повтора запуска" : "Инварианты повтора карантина";
  const populated = state.state === "ready" || state.state === "partial";

  return (
    <section
      className={`defect-invariant-panel ${state.state}`}
      aria-label={`${context} инварианты replay карантина`}
    >
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">Инварианты карантина</span>
          <h3>{title}</h3>
        </div>
        <span className={`runtime-state ${defectProjectionRuntimeState(state.state)}`}>
          {formatProjectionState(state.state)}
        </span>
      </div>

      {populated ? (
        <>
          {state.state === "partial" ? (
            <ProjectionStateMessage
              icon={<AlertTriangle size={17} />}
              title="Инварианты доступны частично"
              copy="Сводки остаются только для чтения, но пагинация, редактирование или сбой инварианта требуют проверки."
            />
          ) : null}
          <DefectMuteReplayInvariantReadout data={state.data} empty={false} />
        </>
      ) : state.state === "empty" ? (
        <ProjectionStateMessage
          icon={<CheckCircle2 size={17} />}
          title="Событий инвариантов нет"
          copy="Для этой области актора и проекта нет материализованных событий. Идентификаторы области, дайджест, raw counters и replay event ids скрыты."
        />
      ) : state.state === "loading" ? (
        <ProjectionStateMessage
          icon={<Clock3 size={17} />}
          title="Инварианты загружаются"
          copy="Ждем сводки по области проекта и актора. Исходные данные падений не отображаются."
        />
      ) : state.state === "denied" ? (
        <ProjectionStateMessage
          icon={<ShieldCheck size={17} />}
          title="Инварианты недоступны"
          copy={`${sanitizeProjectionText(state.message)}. Детали области и replay identifiers скрыты.`}
        />
      ) : state.state === "error" ? (
        <ProjectionStateMessage
          icon={<AlertTriangle size={17} />}
          title="Инварианты не отвечают"
          copy={`${sanitizeProjectionText(state.message)}. Сводки дефектов и запусков остаются в режиме чтения.`}
        />
      ) : null}

      {populated ? (
        <div className="mute-actions" aria-label="Действия инвариантов карантина">
          <ReadOnlyAction
            icon={<Activity size={16} />}
            label="Инварианты карантина из модели чтения"
          />
          <ReadOnlyAction
            icon={<GitBranch size={16} />}
            label="Пересчет карантина сверяется дайджестом"
          />
          <ReadOnlyAction icon={<MoreHorizontal size={16} />} label="Аудит карантина на странице" />
        </div>
      ) : null}
    </section>
  );
}

function DefectMuteReplayInvariantReadout({
  data,
  empty
}: {
  data: DefectMuteReplayInvariantRead;
  empty: boolean;
}) {
  const summarizedItemCount = Math.min(data.items.length, data.page.returned);

  return (
    <>
      <div className="projection-scope-grid" aria-label="Скоуп доступа инвариантов карантина">
        <ProjectionFact label="Скоуп доступа" value={data.access.scope} />
        <ProjectionFact
          label="Режим чтения"
          value={data.access.mutation ? "мутации включены" : "только чтение"}
        />
        <ProjectionFact
          label="Граница проекта"
          value={data.access.projectScoped ? "проект ограничен" : "граница проекта недоступна"}
        />
        <ProjectionFact
          label="Граница участника"
          value={data.access.actorScoped ? "участник ограничен" : "чтение в рамках проекта"}
        />
        <ProjectionFact
          label="Редакция"
          value={data.access.redacted ? "редакция применена" : "редакция не нужна"}
        />
      </div>

      <div className="invariant-summary-grid" aria-label="Сводки инвариантов карантина">
        <InvariantSummaryCard
          label="Детерминированность"
          ready={data.invariant.deterministic}
          value={data.invariant.deterministic ? "один ввод, один дайджест" : "дайджест не совпал"}
        />
        <InvariantSummaryCard
          label="Повторный расчет"
          ready={data.invariant.recomputable}
          value={
            data.invariant.recomputable ? "проекция совпадает с пересчетом" : "пересчет не совпал"
          }
        />
        <InvariantSummaryCard
          label="Скоуп проекта"
          ready={data.invariant.projectScoped && data.access.projectScoped}
          value={data.invariant.projectScoped ? "граница проекта соблюдена" : "несовпадение scope"}
        />
        <InvariantSummaryCard
          label="Журнал без перезаписи"
          ready={data.appendOnly.uniqueProjectedEventIds}
          value={`${data.appendOnly.totalProjectedEventIds} идентификаторов событий / ${data.appendOnly.duplicateEventIds.length} дублей`}
        />
        <InvariantSummaryCard
          label="Разделение сырого и примененного"
          ready={
            data.rawEffectiveSeparation.effectiveStateExcludesRawFailureHistory &&
            data.rawEffectiveSeparation.rawFailureHistoryPreserved &&
            data.rawEffectiveSeparation.rawFailureHistoryNotMutatedByUnmute
          }
          value={`${data.rawEffectiveSeparation.rawFailureOccurrenceCount} счетчиков падений / ${data.rawEffectiveSeparation.effectiveRecordCount} примененных записей`}
        />
        <InvariantSummaryCard
          label="Редакция данных"
          ready={data.redaction.passed && data.redaction.leakedMarkers.length === 0}
          value={
            data.redaction.passed
              ? "исходные данные падений не показаны"
              : `${data.redaction.leakedMarkers.length} маркеров скрыто`
          }
        />
      </div>

      <section className="invariant-boundary-panel" aria-label="Граница инвариантов карантина">
        <ProjectionFact label="Граница" value={data.invariant.boundary} />
        <ProjectionFact label="Источник" value={data.invariant.source} />
        <ProjectionFact label="Консистентность" value={data.invariant.consistency} />
        <ProjectionFact label="Граница мутаций" value={data.invariant.mutationBoundary} />
        <ProjectionFact label="Дайджест проекции" value={data.invariant.projectionDigest} />
        <ProjectionFact label="Пересчитанный дайджест" value={data.invariant.recomputedDigest} />
      </section>

      <section className="invariant-boundary-panel" aria-label="Метаданные страницы инвариантов">
        <ProjectionFact
          label="Данные страницы"
          value={`${data.page.returned} показано / ${data.page.total} всего`}
        />
        <ProjectionFact label="Лимит страницы" value={data.page.limit} />
        <ProjectionFact label="Смещение страницы" value={data.page.offset} />
        <ProjectionFact
          label="Есть еще"
          value={data.page.hasMore ? "часть скрыта" : "страница полная"}
        />
        <ProjectionFact label="Сводки событий" value={`${summarizedItemCount} в сводке`} />
        <ProjectionFact label="Сырые идентификаторы событий" value="скрыты политикой чтения" />
      </section>

      <section className="invariant-policy-note" aria-label="Политика исходных данных карантина">
        <ShieldCheck size={17} />
        <span>
          <strong>Исходные данные падений не отображаются</strong>
          <small>{sanitizeProjectionText(data.rawEffectiveSeparation.documentation)}</small>
          <small>{sanitizeProjectionText(data.redaction.policy)}</small>
        </span>
      </section>

      <div className="invariant-event-list" aria-label="Событийные доказательства инвариантов">
        {summarizedItemCount > 0 ? (
          <article>
            <GitBranch size={16} />
            <span>
              <strong>Материализованная страница событий</strong>
              <small>
                {summarizedItemCount} событий invariant в сводке; сырые идентификаторы скрыты.
              </small>
            </span>
          </article>
        ) : (
          <EmptyState
            title={empty ? "Нет replay invariant событий" : "На странице нет invariant событий"}
            copy="Доказательства invariant доступны как счетчики и дайджест; исходные данные падений не отображаются."
          />
        )}
      </div>
    </>
  );
}

function InvariantSummaryCard({
  label,
  ready,
  value
}: {
  label: string;
  ready: boolean;
  value: string;
}) {
  return (
    <article className={ready ? "ready" : "blocked"}>
      {ready ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
      <span>
        <strong>{label}</strong>
        <small>{sanitizeProjectionText(value)}</small>
      </span>
    </article>
  );
}

function getDefectMuteReplayInvariantState(apiState: ApiState): DefectMuteReplayInvariantApiState {
  if (apiState.defectMuteReplayInvariants !== undefined) {
    return apiState.defectMuteReplayInvariants;
  }
  if (apiState.defectMuteProjection?.state === "loading") {
    return { state: "loading" };
  }
  if (apiState.defectMuteProjection?.state === "denied") {
    return {
      message: getSafeProjectionDeniedMessage(apiState.defectMuteProjection.message),
      state: "denied"
    };
  }
  if (apiState.defectMuteProjection?.state === "error") {
    return {
      message: apiState.defectMuteProjection.message,
      state: "error"
    };
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
      kind: "defect-mute-replay-invariant",
      projectId: "demo-project",
      access: {
        scope: "defects:read",
        projectScoped: true,
        actorScoped: false,
        mutation: false,
        redacted: true
      },
      query: {
        projectId: "demo-project",
        limit: 3,
        cursor: null
      },
      invariant: {
        boundary: "read-only-defect-mute-replay-invariant",
        source: "worker-local-mute-projection",
        consistency: "append-only-replay",
        mutationBoundary: "rest-read-only-no-replay-mutation",
        deterministic: true,
        recomputable: true,
        projectScoped: true,
        projectionDigest: "demo-empty",
        recomputedDigest: "demo-empty"
      },
      rawEffectiveSeparation: {
        effectiveStateExcludesRawFailureHistory: true,
        rawFailureHistoryPreserved: true,
        rawFailureHistoryNotMutatedByUnmute: true,
        rawFailureOccurrenceCount: 0,
        effectiveRecordCount: 0,
        documentation:
          "No replay events are available; raw failure history remains represented only by bounded counters."
      },
      appendOnly: {
        uniqueProjectedEventIds: true,
        duplicateEventIds: [],
        totalProjectedEventIds: 0
      },
      redaction: {
        passed: true,
        leakedMarkers: [],
        policy:
          "No raw result payloads, local paths, storage refs, tokens, or signed URLs are exposed."
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
      items: []
    },
    state: "empty"
  };
}
function ProjectionFact({ label, value }: { label: string; value: number | string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{sanitizeProjectionText(String(value))}</strong>
    </article>
  );
}

function defectProjectionRuntimeState(
  state: DefectMuteReplayInvariantApiState["state"]
): RuntimeUiState {
  if (state === "ready") {
    return "ready";
  }
  if (state === "loading" || state === "partial" || state === "empty") {
    return "waiting";
  }
  return "blocked";
}

function formatProjectionState(state: DefectMuteReplayInvariantApiState["state"]): string {
  const labels: Record<DefectMuteReplayInvariantApiState["state"], string> = {
    denied: "нет доступа",
    empty: "пусто",
    error: "ошибка",
    loading: "загрузка",
    partial: "частично",
    ready: "готово"
  };

  return labels[state];
}
