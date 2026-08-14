import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock3,
  FileJson,
  FileText,
  MoreHorizontal,
  Paperclip,
  ShieldCheck,
  UploadCloud
} from "lucide-react";

import type {
  ArchiveDiagnosticReplayFixtureEvidence,
  ArchiveIntakeUiModel,
  RuntimeTimelineStep,
  RuntimeUiModel,
  RuntimeUiState
} from "./api.js";
import { ReadOnlyAction } from "./workspaceCommon.js";
export function RuntimeOperationsPanel({ model }: { model: RuntimeUiModel }) {
  return (
    <section className="runtime-panel" aria-label="Операционная модель обработчиков">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Обработка</span>
          <h2>Жизненный цикл запусков и готовность очередей</h2>
        </div>
        <span className="ready-pill">Диагностика только для чтения</span>
      </div>

      <RuntimeTimeline title="Жизненный цикл запуска" steps={model.lifecycle} />
      <RuntimeTimeline title="Загрузка и обработка результатов" steps={model.pipeline} compact />

      <div className="runtime-grid">
        <ArtifactCleanupReadiness model={model} />
        <QueueWorkerStatus model={model} />
      </div>
    </section>
  );
}

function RuntimeTimeline({
  title,
  steps,
  compact = false
}: {
  title: string;
  steps: RuntimeTimelineStep[];
  compact?: boolean;
}) {
  return (
    <section className={`runtime-timeline ${compact ? "compact" : ""}`}>
      <div className="runtime-subheading">
        <h3>{title}</h3>
        <span>{steps.length} состояний в модели</span>
      </div>
      <div className="runtime-steps">
        {steps.map((step) => (
          <article className={`runtime-step ${step.state}`} key={step.id}>
            <RuntimeStateIcon state={step.state} />
            <div>
              <strong>{step.label}</strong>
              <span>{step.description}</span>
              <small>{step.meta}</small>
            </div>
            <RuntimeStateBadge state={step.state} />
          </article>
        ))}
      </div>
    </section>
  );
}

function ArtifactCleanupReadiness({ model }: { model: RuntimeUiModel }) {
  return (
    <article className={`runtime-card cleanup-card ${model.cleanup.state}`}>
      <div className="runtime-card-title">
        <Paperclip size={18} />
        <div>
          <span>Очистка артефактов</span>
          <strong>{model.cleanup.label}</strong>
        </div>
        <RuntimeStateBadge state={model.cleanup.state} />
      </div>
      <div className="readiness-grid">
        <RuntimeFact label="Хранение" value={model.cleanup.retention} />
        <RuntimeFact label="Индекс" value={model.cleanup.storage} />
        <RuntimeFact label="Очередь" value={model.cleanup.queue} />
      </div>
    </article>
  );
}

function QueueWorkerStatus({ model }: { model: RuntimeUiModel }) {
  return (
    <article className="runtime-card queue-card">
      <div className="runtime-card-title">
        <Boxes size={18} />
        <div>
          <span>Очереди и воркеры</span>
          <strong>Готовность по API</strong>
        </div>
        <span className="ready-pill">Ограниченная диагностика</span>
      </div>

      <div className="worker-list">
        {model.workers.map((worker) => (
          <div className={`worker-row ${worker.state}`} key={worker.id}>
            <RuntimeStateIcon state={worker.state} />
            <span>
              <strong>{worker.label}</strong>
              <small>{worker.detail}</small>
            </span>
            <em>
              {worker.value}
              {worker.wip ? <span className="ready-pill">только чтение</span> : null}
            </em>
          </div>
        ))}
      </div>

      <div className="queue-list">
        {model.queues.map((queue) => (
          <div
            aria-disabled={queue.wip ? "true" : undefined}
            className={`queue-chip ${queue.state} ${queue.wip ? "readonly-surface" : ""}`}
            key={queue.name}
            title={queue.detail}
          >
            <span>{queue.name}</span>
            <small>{formatQueueScope(queue.scope)}</small>
            {queue.wip ? <span className="ready-pill">только чтение</span> : null}
          </div>
        ))}
      </div>
    </article>
  );
}

export function ArchiveIntakeStatusPanel({
  context,
  model
}: {
  context: "Запуски" | "Задачи";
  model: ArchiveIntakeUiModel;
}) {
  const visibleWorkerDiagnostics = model.workerDiagnostics.slice(0, model.workerDiagnosticLimit);

  return (
    <section
      className={`archive-status-panel ${model.state}`}
      aria-label={`${context} archive intake status`}
    >
      <div className="archive-status-heading">
        <div>
          <span className="eyebrow">{context}: загрузка архивов</span>
          <h2>{model.label}</h2>
          <p>{model.copy}</p>
        </div>
        <span className={`runtime-state ${archiveRuntimeState(model.state)}`}>
          {formatArchivePanelState(model.state)}
        </span>
      </div>

      <div className="archive-read-meta" aria-label={`${context} archive read metadata`}>
        <RuntimeFact label="Проект" value={model.readMetadata.project} />
        <RuntimeFact label="Автор" value={model.readMetadata.actor} />
        <RuntimeFact label="Доступ" value={model.readMetadata.access} />
        <RuntimeFact label="Запуск" value={model.readMetadata.launch} />
        <RuntimeFact label="Режим чтения" value={model.readMetadata.readOnly} />
        <RuntimeFact label="Границы" value={model.readMetadata.bounded} />
      </div>

      <div className="archive-diagnostics" aria-label={`${context} archive diagnostics`}>
        {model.diagnostics.map((diagnostic) => (
          <article className={diagnostic.state} key={diagnostic.id}>
            <RuntimeStateIcon state={diagnostic.state} />
            <span>
              <strong>{diagnostic.label}</strong>
              <small>{diagnostic.detail}</small>
            </span>
            <em>{diagnostic.value}</em>
          </article>
        ))}
      </div>

      {model.archiveJobs.length > 0 ? (
        <div className="archive-job-list" aria-label={`${context} archive upload status reads`}>
          {model.archiveJobs.map((job) => (
            <article className={`archive-job-row ${job.state}`} key={job.id}>
              <RuntimeStateIcon state={job.state} />
              <span>
                <strong>{job.archiveName}</strong>
                <small>
                  {job.id} / {job.status} / {job.phase}
                </small>
              </span>
              <em>{job.entries}</em>
              <em>{job.progress}</em>
              <small>{job.worker}</small>
              <small>{job.diagnostics} диагностик</small>
            </article>
          ))}
        </div>
      ) : null}

      <div className="archive-worker-card">
        <div className="runtime-subheading">
          <h3>Ограниченная диагностика воркеров</h3>
          <span>
            Показано {visibleWorkerDiagnostics.length} из {model.workerDiagnostics.length}
          </span>
        </div>
        <div className="archive-worker-list">
          {visibleWorkerDiagnostics.map((worker) => (
            <article
              aria-disabled={worker.wip ? "true" : undefined}
              className={`archive-worker-row ${worker.state}`}
              key={worker.id}
            >
              <RuntimeStateIcon state={worker.state} />
              <span>
                <strong>{worker.label}</strong>
                <small>{worker.detail}</small>
              </span>
              <em>
                {worker.value}
                {worker.wip ? <span className="ready-pill">только чтение</span> : null}
              </em>
            </article>
          ))}
        </div>
      </div>

      <ArchiveDiagnosticReplayFixtureEvidencePanel evidence={model.fixtureEvidence} />

      <div className="archive-actions" aria-label={`${context}: действия архива`}>
        <ReadOnlyAction icon={<UploadCloud size={16} />} label="Загрузка через API" />
        <ReadOnlyAction icon={<FileJson size={16} />} label="Повтор через очередь воркера" />
        <ReadOnlyAction icon={<MoreHorizontal size={16} />} label="Диагностика без мутаций" />
      </div>
    </section>
  );
}

function formatArchivePanelState(state: ArchiveIntakeUiModel["state"]): string {
  const labels: Record<ArchiveIntakeUiModel["state"], string> = {
    denied: "доступ закрыт",
    empty: "пусто",
    error: "ошибка",
    loading: "загрузка",
    partial: "частично",
    ready: "готово"
  };

  return labels[state];
}

function ArchiveDiagnosticReplayFixtureEvidencePanel({
  evidence
}: {
  evidence: ArchiveDiagnosticReplayFixtureEvidence;
}) {
  const canRenderFixturePage = evidence.state === "ready" || evidence.state === "partial";
  const visibleCards = canRenderFixturePage ? evidence.cards.slice(0, evidence.cardLimit) : [];

  return (
    <section
      className={`archive-fixture-evidence ${evidence.state}`}
      aria-label="Доказательства синтетических фикстур replay"
    >
      <div className="archive-fixture-heading">
        <div>
          <span className="eyebrow">Диагностический replay архива</span>
          <h3>{evidence.label}</h3>
          <p>{evidence.copy}</p>
        </div>
        <span className={`runtime-state ${archiveRuntimeState(evidence.state)}`}>
          {evidence.state}
        </span>
      </div>

      <ArchiveDiagnosticReplayFixtureStateNotice evidence={evidence} />

      <div className="archive-fixture-summary" aria-label="Сводка фикстур архива">
        <RuntimeFact label="Фикстуры" value={evidence.summary.fixtures} />
        <RuntimeFact label="Дайджест" value={evidence.summary.digests} />
        <RuntimeFact label="Файлы" value={evidence.summary.entries} />
        <RuntimeFact label="Попытки" value={evidence.summary.attempts} />
        <RuntimeFact label="Режим" value={evidence.summary.readOnly} />
        <RuntimeFact label="Исходные данные" value={evidence.summary.payload} />
        <RuntimeFact label="Границы" value={evidence.summary.bounds} />
      </div>

      {visibleCards.length > 0 ? (
        <div className="archive-fixture-list" aria-label="Сводки фикстур архива">
          {visibleCards.map((fixture) => (
            <article className={`archive-fixture-card ${fixture.state}`} key={fixture.id}>
              <RuntimeStateIcon state={fixture.state} />
              <span>
                <strong>{fixture.name}</strong>
                <small>{fixture.scenario}</small>
                <small>{fixture.digest}</small>
              </span>
              <em>{fixture.expected}</em>
              <small>{fixture.replay}</small>
              <small>{fixture.payload}</small>
            </article>
          ))}
        </div>
      ) : (
        <ArchiveDiagnosticReplayFixtureEmptyState evidence={evidence} />
      )}

      {canRenderFixturePage ? (
        <div className="archive-actions compact" aria-label="Действия фикстур архива">
          <ReadOnlyAction icon={<FileJson size={16} />} label="Детали фикстуры на странице" />
          <ReadOnlyAction icon={<FileText size={16} />} label="Сводка отредактирована" />
        </div>
      ) : null}
    </section>
  );
}

function ArchiveDiagnosticReplayFixtureStateNotice({
  evidence
}: {
  evidence: ArchiveDiagnosticReplayFixtureEvidence;
}) {
  if (evidence.state === "ready") {
    return (
      <section className="surface-state ready" aria-label="Фикстура готова">
        <CheckCircle2 size={17} />
        <span>
          <strong>Фикстура готова к чтению</strong>
          <small>Показаны только отредактированные счетчики, дайджест и названия сценариев.</small>
        </span>
      </section>
    );
  }

  if (evidence.state === "partial") {
    return (
      <section className="surface-state partial" aria-label="Фикстура загружена частично">
        <AlertTriangle size={17} />
        <span>
          <strong>Страница фикстур доступна частично</strong>
          <small>Видимые строки ограничены лимитом страницы материализованной модели чтения.</small>
        </span>
      </section>
    );
  }

  if (evidence.state === "empty") {
    return (
      <section className="surface-state ready" aria-label="Фикстура пуста">
        <CheckCircle2 size={17} />
        <span>
          <strong>Нет материализованных сводок фикстур</strong>
          <small>
            Диагностика загрузки архива доступна, но синтетическая фикстура replay не найдена в этом
            скоупе.
          </small>
        </span>
      </section>
    );
  }

  if (evidence.state === "denied") {
    return (
      <section className="surface-state denied" aria-label="Доступ к фикстуре закрыт">
        <ShieldCheck size={17} />
        <span>
          <strong>Доступ к материализованной фикстуре закрыт</strong>
          <small>Строки фикстуры, дайджест, данные участника и проекта не отображаются.</small>
        </span>
      </section>
    );
  }

  if (evidence.state === "error") {
    return (
      <section className="surface-state offline" aria-label="Фикстура недоступна">
        <AlertTriangle size={17} />
        <span>
          <strong>Чтение материализованной фикстуры недоступно</strong>
          <small>Доказательства replay архива скрыты, пока модель чтения недоступна.</small>
        </span>
      </section>
    );
  }

  return (
    <section className="surface-state loading" aria-label="Фикстура загружается">
      <Clock3 size={17} />
      <span>
        <strong>Загружаем материализованные сводки фикстур</strong>
        <small>
          Строки и действия фикстур скрыты, пока не придет ограниченная страница чтения.
        </small>
      </span>
    </section>
  );
}

function ArchiveDiagnosticReplayFixtureEmptyState({
  evidence
}: {
  evidence: ArchiveDiagnosticReplayFixtureEvidence;
}) {
  const title =
    evidence.state === "empty"
      ? "Нет сводок фикстур в скоупе"
      : evidence.state === "denied"
        ? "Сводки фикстур скрыты"
        : evidence.state === "error"
          ? "Сводки фикстур недоступны"
          : "Сводки фикстур ожидаются";

  const copy =
    evidence.state === "empty"
      ? "Чтение диагностического replay архива завершилось без строк синтетических фикстур."
      : evidence.state === "denied"
        ? "Доказательства фикстур по правам не отображаются для этого участника или проекта."
        : evidence.state === "error"
          ? "UI скрывает архивные файлы и материализованные строки, пока чтение не станет успешным."
          : "Исходные архивные файлы скрыты, пока не ответит контракт чтения фикстур.";

  return (
    <div className="archive-fixture-empty">
      <FileJson size={17} />
      <span>
        <strong>{title}</strong>
        <small>{copy}</small>
      </span>
    </div>
  );
}

function archiveRuntimeState(state: ArchiveIntakeUiModel["state"]): RuntimeUiState {
  if (state === "ready") {
    return "ready";
  }
  if (state === "partial") {
    return "waiting";
  }
  if (state === "error" || state === "denied") {
    return "blocked";
  }

  return "waiting";
}

function RuntimeFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="runtime-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RuntimeStateBadge({ state }: { state: RuntimeUiState }) {
  const labels: Record<RuntimeUiState, string> = {
    blocked: "заблокировано",
    ready: "готово",
    running: "в работе",
    waiting: "ожидает"
  };

  return <span className={`runtime-state ${state}`}>{labels[state]}</span>;
}

function formatQueueScope(scope: RuntimeUiModel["queues"][number]["scope"]) {
  const labels: Record<RuntimeUiModel["queues"][number]["scope"], string> = {
    cleanup: "очистка",
    ingestion: "загрузка",
    processing: "обработка"
  };

  return labels[scope] ?? scope;
}

function RuntimeStateIcon({ state }: { state: RuntimeUiState }) {
  if (state === "ready") {
    return <CheckCircle2 className="icon passed" size={17} />;
  }
  if (state === "running") {
    return <Activity className="icon running" size={17} />;
  }
  if (state === "blocked") {
    return <AlertTriangle className="icon broken" size={17} />;
  }
  return <Clock3 className="icon skipped" size={17} />;
}
