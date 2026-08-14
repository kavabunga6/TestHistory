import {
  Activity,
  AlertTriangle,
  Clock3,
  FileJson,
  ShieldCheck,
  SlidersHorizontal
} from "lucide-react";

import type {
  ApiState,
  AttachmentPreviewRetentionApiState,
  AttachmentPreviewRetentionDryRunScheduleApiState,
  AttachmentPreviewRetentionDryRunScheduleBatch,
  AttachmentPreviewRetentionDryRunScheduleDiagnostic,
  AttachmentPreviewRetentionDryRunScheduleRead,
  AttachmentPreviewRetentionItem,
  AttachmentPreviewRetentionPreviewRead,
  RuntimeUiState
} from "./api.js";
import {
  EmptyState,
  formatBytes,
  ProjectionStateMessage,
  ReadOnlyAction
} from "./workspaceCommon.js";
import { getSafeProjectionDeniedMessage, sanitizeSafeText } from "./workspaceSanitizers.js";
export function AttachmentPreviewRetentionPanel({
  apiState,
  compact = false,
  context
}: {
  apiState: ApiState;
  compact?: boolean;
  context: string;
}) {
  const state = getAttachmentPreviewRetentionState(apiState);

  return (
    <section
      className={`attachment-retention-panel ${state.state} ${compact ? "compact" : ""}`}
      aria-label={`${context}: хранение превью вложений`}
    >
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">Хранение превью вложений</span>
          <h3>{attachmentRetentionTitle(state)}</h3>
        </div>
        <span className={`runtime-state ${attachmentRetentionRuntimeState(state.state)}`}>
          {state.state}
        </span>
      </div>

      {state.state === "ready" || state.state === "empty" ? (
        <AttachmentPreviewRetentionReadout data={state.data} />
      ) : state.state === "loading" ? (
        <ProjectionStateMessage
          icon={<Clock3 size={17} />}
          title="Загрузка retention preview"
          copy="Ожидаем модель чтения закрытого запуска перед показом счетчиков готовности дескрипторов."
        />
      ) : state.state === "denied" ? (
        <ProjectionStateMessage
          icon={<ShieldCheck size={17} />}
          title="Превью хранения запрещено"
          copy={`${sanitizeSafeText(state.message)}. Имена вложений, object references и детали провайдера остаются скрытыми.`}
        />
      ) : state.state === "error" ? (
        <ProjectionStateMessage
          icon={<AlertTriangle size={17} />}
          title="Превью хранения недоступно"
          copy={`${sanitizeSafeText(state.message)}. Существующий контент запуска и вложений остается видимым без выполнения очистки.`}
        />
      ) : null}

      {context === "Запуски" || context === "Вложения" ? (
        <AttachmentPreviewRetentionDryRunSchedulePanel apiState={apiState} compact={compact} />
      ) : null}

      <div className="retention-actions" aria-label={`${context}: действия превью хранения`}>
        <ReadOnlyAction icon={<Activity size={16} />} label="Превью хранения из API" />
        <ReadOnlyAction icon={<SlidersHorizontal size={16} />} label="Политику выполняет worker" />
        <ReadOnlyAction icon={<FileJson size={16} />} label="Данные отчета уже отредактированы" />
      </div>
    </section>
  );
}

function AttachmentPreviewRetentionDryRunSchedulePanel({
  apiState,
  compact = false
}: {
  apiState: ApiState;
  compact?: boolean;
}) {
  const state = getAttachmentPreviewRetentionDryRunScheduleState(apiState);

  if (state === undefined) {
    return null;
  }

  return (
    <section
      className={`retention-schedule-panel ${state.state} ${compact ? "compact" : ""}`}
      aria-label="Доказательства расписания dry-run для превью вложений"
    >
      <div className="retention-schedule-heading">
        <div>
          <span className="eyebrow">Доказательства расписания dry-run</span>
          <h4>{attachmentRetentionScheduleTitle(state)}</h4>
        </div>
        <span className={`runtime-state ${attachmentRetentionScheduleRuntimeState(state.state)}`}>
          {state.state}
        </span>
      </div>

      {state.state === "ready" || state.state === "partial" || state.state === "empty" ? (
        <AttachmentPreviewRetentionDryRunScheduleReadout data={state.data} />
      ) : state.state === "loading" ? (
        <ProjectionStateMessage
          icon={<Clock3 size={17} />}
          title="Загрузка dry-run schedule"
          copy="Ожидаем доказательства расписания worker в режиме чтения перед показом метаданных батчей дескрипторов."
        />
      ) : state.state === "denied" ? (
        <ProjectionStateMessage
          icon={<ShieldCheck size={17} />}
          title="Расписание dry-run запрещено"
          copy={`${sanitizeSafeText(state.message)}. Скоуп расписания и ссылки дескрипторов остаются скрытыми.`}
        />
      ) : state.state === "error" ? (
        <ProjectionStateMessage
          icon={<AlertTriangle size={17} />}
          title="Расписание dry-run недоступно"
          copy={`${sanitizeSafeText(state.message)}. Настройки хранения остаются выключенными, путь выполнения удаления не отображается.`}
        />
      ) : null}
    </section>
  );
}

function AttachmentPreviewRetentionDryRunScheduleReadout({
  data
}: {
  data: AttachmentPreviewRetentionDryRunScheduleRead;
}) {
  const visibleBatches = data.batches.slice(
    0,
    Math.max(0, Math.min(data.page.limit, data.page.returned || data.batches.length, 3))
  );
  const visibleDiagnostics = data.diagnostics.slice(0, 3);
  const visibleDescriptorSteps = getSafeRetentionScheduleDescriptorSteps(
    data.summary.plannedOperations
  );

  return (
    <>
      <div className="retention-schedule-grid" aria-label="Контракт расписания dry-run">
        <RetentionFact label="Скоуп" value={sanitizeRetentionScheduleValue(data.boundary.scope)} />
        <RetentionFact label="Запуск" value={sanitizeRetentionScheduleValue(data.scope.launchId)} />
        <RetentionFact label="Батчи" value={`${data.page.returned} из ${data.page.total}`} />
        <RetentionFact label="Запланировано" value={data.summary.scheduledDescriptorCount ?? 0} />
        <RetentionFact
          label="Исходные данные"
          value={data.boundary.rawMaterialReturned ? "заблокирован" : "скрыт"}
        />
        <RetentionFact
          label="Режим чтения"
          value={
            data.execution.readOnly && data.execution.dryRun
              ? "dry-run только для чтения"
              : "заблокирован"
          }
        />
        <RetentionFact
          label="Выполнение удаления"
          value={data.execution.workerExecutionAllowed ? "заблокировано" : "нет"}
        />
        <RetentionFact
          label="Мутации провайдера"
          value={data.execution.providerActions ? "заблокированы" : "нет"}
        />
      </div>

      <div className="retention-schedule-copy">
        Метаданные dry-run только по дескрипторам ограничены дескрипторами превью вложений закрытого
        запуска. Разрушительные мутации, runtime execution, доступ к object storage, исходные
        данные, пути, подписанные ссылки и учетные данные не попадают в эту модель чтения.
      </div>

      {visibleDescriptorSteps.length > 0 ? (
        <div className="retention-schedule-steps" aria-label="Шаги дескрипторов dry-run">
          {visibleDescriptorSteps.map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>
      ) : null}

      <div className="retention-schedule-batches" aria-label="Батчи расписания dry-run">
        {visibleBatches.map((batch) => (
          <AttachmentPreviewRetentionDryRunBatchRow batch={batch} key={batch.batchDigest} />
        ))}
        {visibleBatches.length === 0 ? (
          <EmptyState
            title="Нет батчей расписания dry-run"
            copy="В расписание dry-run по дескрипторам для этого закрытого запуска не попали подходящие preview descriptors."
          />
        ) : null}
      </div>

      {visibleDiagnostics.length > 0 ? (
        <div className="retention-schedule-diagnostics" aria-label="Диагностика расписания dry-run">
          {visibleDiagnostics.map((diagnostic, index) => (
            <AttachmentPreviewRetentionDryRunDiagnosticRow
              diagnostic={diagnostic}
              key={`${diagnostic.code}-${index}`}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function AttachmentPreviewRetentionDryRunBatchRow({
  batch
}: {
  batch: AttachmentPreviewRetentionDryRunScheduleBatch;
}) {
  const visibleRefs = (batch.descriptorRefs ?? [])
    .map((ref) => sanitizeRetentionScheduleValue(ref))
    .filter((ref) => ref !== "[redacted]")
    .slice(0, 2);

  return (
    <article className="retention-schedule-batch">
      <Clock3 size={17} />
      <span>
        <strong>Батч {batch.index + 1}</strong>
        <small>
          {batch.descriptorCount} дескрипторов / задержка {batch.scheduledAfterMinutes ?? 0} мин. /
          лимит {batch.maxCount ?? "ограничен"}
        </small>
        <small>
          {visibleRefs.length > 0
            ? visibleRefs.join(", ")
            : `${batch.omittedDescriptorRefCount ?? 0} ссылок скрыто`}
        </small>
      </span>
      <em>{sanitizeRetentionScheduleValue(batch.batchDigest)}</em>
    </article>
  );
}

function AttachmentPreviewRetentionDryRunDiagnosticRow({
  diagnostic
}: {
  diagnostic: AttachmentPreviewRetentionDryRunScheduleDiagnostic;
}) {
  return (
    <article className={diagnostic.severity === "error" ? "blocked" : "waiting"}>
      {diagnostic.severity === "error" ? <AlertTriangle size={17} /> : <ShieldCheck size={17} />}
      <span>
        <strong>{sanitizeRetentionScheduleValue(diagnostic.code)}</strong>
        <small>
          {sanitizeRetentionScheduleValue(diagnostic.message ?? "диагностика отредактирована")}
        </small>
      </span>
      <em>{diagnostic.retryable ? "повторяемо" : "стабильно"}</em>
    </article>
  );
}

function AttachmentPreviewRetentionReadout({
  data
}: {
  data: AttachmentPreviewRetentionPreviewRead;
}) {
  const visibleItems = data.items.slice(0, 3);

  return (
    <>
      <div className="retention-summary-grid" aria-label="Счетчики хранения превью вложений">
        <RetentionFact label="Дескрипторы" value={data.summary.descriptorCount} />
        <RetentionFact
          label="Подходят для очистки"
          value={data.summary.cleanupEligibleDescriptorCount}
        />
        <RetentionFact label="Сохранено" value={data.summary.retainedDescriptorCount} />
        <RetentionFact label="Защищено" value={data.summary.preservedDescriptorCount} />
        <RetentionFact
          label="Доказательства сохранены"
          value={data.summary.evidenceDescriptorCount}
        />
        <RetentionFact label="Невалидные дескрипторы" value={data.summary.invalidDescriptorCount} />
      </div>

      <div className="retention-contract-grid" aria-label="Контракт чтения превью хранения">
        <RetentionFact label="Скоуп" value={data.boundary.scope} />
        <RetentionFact label="Статус запуска" value={data.boundary.eligibleLaunchStatus} />
        <RetentionFact label="Доступ чтения" value={data.access.scope} />
        <RetentionFact label="Мутации" value={data.access.mutation ? "включены" : "выключены"} />
        <RetentionFact
          label="Очистка запущена"
          value={data.execution.deletionStarted ? "да" : "нет"}
        />
        <RetentionFact
          label="Действия провайдера"
          value={data.execution.providerActions ? "да" : "нет"}
        />
      </div>

      <div className="retention-copy">
        Превью хранения для закрытых запусков показывает ограниченные счетчики дескрипторов и
        готовность к очистке; выполнение очистки, действия провайдера, исходные данные, пути и
        подписанные ссылки не отображаются.
      </div>

      <div className="retention-item-list" aria-label="Готовность превью вложений к хранению">
        {visibleItems.map((item) => (
          <AttachmentPreviewRetentionItemRow item={item} key={item.id} />
        ))}
        {visibleItems.length === 0 ? (
          <EmptyState
            title="Нет кандидатов хранения"
            copy="Для preview закрытого запуска не вернулись дескрипторы вложений."
          />
        ) : null}
      </div>
    </>
  );
}

function RetentionFact({ label, value }: { label: string; value: number | string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{sanitizeSafeText(String(value))}</strong>
    </article>
  );
}

function AttachmentPreviewRetentionItemRow({ item }: { item: AttachmentPreviewRetentionItem }) {
  return (
    <article className={item.status}>
      {item.status === "cleanup_eligible" ? (
        <AlertTriangle size={17} />
      ) : item.status === "preserved" ? (
        <ShieldCheck size={17} />
      ) : (
        <Clock3 size={17} />
      )}
      <span>
        <strong>{formatAttachmentRetentionStatus(item.status)}</strong>
        <small>
          {sanitizeSafeText(item.previewDescriptorId)} /{" "}
          {sanitizeSafeText(item.retention.policyClass)}
        </small>
        <small>
          {item.retention.cleanupEligibility.eligible ? "подходит" : "сохранен"} по причине{" "}
          {sanitizeSafeText(item.retention.cleanupEligibility.reason)}; очистка{" "}
          {item.cleanupEligibleAt ?? "не запланирована"}
        </small>
      </span>
      <em>
        {formatBytes(item.descriptor.previewBytes)} preview /{" "}
        {formatBytes(item.descriptor.originalBytes)} оригинал
      </em>
    </article>
  );
}

function getAttachmentPreviewRetentionState(
  apiState: ApiState
): AttachmentPreviewRetentionApiState {
  if (apiState.attachmentPreviewRetention !== undefined) {
    return apiState.attachmentPreviewRetention;
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
    data: emptyAttachmentPreviewRetentionRead(),
    state: "empty"
  };
}

function getAttachmentPreviewRetentionDryRunScheduleState(
  apiState: ApiState
): AttachmentPreviewRetentionDryRunScheduleApiState | undefined {
  return apiState.attachmentPreviewRetentionSchedule;
}

function emptyAttachmentPreviewRetentionRead(): AttachmentPreviewRetentionPreviewRead {
  return {
    kind: "attachment-preview-retention-preview",
    launch: {
      id: "demo-closed-launch",
      projectId: "demo-project",
      status: "closed",
      closedAt: null
    },
    access: {
      scope: "artifacts:read",
      projectScoped: true,
      mutation: false,
      redacted: true
    },
    execution: {
      deletionStarted: false,
      deletionMutation: false,
      providerActions: false,
      objectStorageTouched: false
    },
    boundary: {
      scope: "closed-launch",
      eligibleLaunchStatus: "closed",
      descriptorSource: "artifact-preview-descriptor-read-model",
      rawMaterialReturned: false
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
    summary: {
      descriptorCount: 0,
      cleanupEligibleDescriptorCount: 0,
      retainedDescriptorCount: 0,
      preservedDescriptorCount: 0,
      evidenceDescriptorCount: 0,
      legalHoldPlaceholderCount: 0,
      invalidDescriptorCount: 0
    },
    items: []
  };
}

function attachmentRetentionTitle(state: AttachmentPreviewRetentionApiState): string {
  if (state.state === "ready") {
    return "Превью хранения готово";
  }
  if (state.state === "loading") {
    return "Загрузка превью хранения";
  }
  if (state.state === "error") {
    return "Превью хранения недоступно";
  }
  if (state.state === "denied") {
    return "Превью хранения запрещено";
  }

  return "Нет кандидатов хранения";
}

function attachmentRetentionRuntimeState(
  state: AttachmentPreviewRetentionApiState["state"]
): RuntimeUiState {
  if (state === "ready") {
    return "ready";
  }
  if (state === "loading" || state === "empty") {
    return "waiting";
  }
  return "blocked";
}

function attachmentRetentionScheduleTitle(
  state: AttachmentPreviewRetentionDryRunScheduleApiState
): string {
  if (state.state === "ready") {
    return "Расписание dry-run готово";
  }
  if (state.state === "partial") {
    return "Расписание dry-run частично доступно";
  }
  if (state.state === "loading") {
    return "Загрузка расписания dry-run";
  }
  if (state.state === "error") {
    return "Расписание dry-run недоступно";
  }
  if (state.state === "denied") {
    return "Расписание dry-run запрещено";
  }

  return "Нет батчей расписания dry-run";
}

function attachmentRetentionScheduleRuntimeState(
  state: AttachmentPreviewRetentionDryRunScheduleApiState["state"]
): RuntimeUiState {
  if (state === "ready") {
    return "ready";
  }
  if (state === "partial" || state === "loading" || state === "empty") {
    return "waiting";
  }
  return "blocked";
}

function getSafeRetentionScheduleDescriptorSteps(operations: string[] | undefined): string[] {
  const allowed = new Set([
    "artifact.preview.retention.classify",
    "artifact.preview.retention.dry-run.schedule"
  ]);

  return (operations ?? [])
    .filter((operation) => allowed.has(operation))
    .map((operation) => sanitizeRetentionScheduleValue(operation));
}

function sanitizeRetentionScheduleValue(value: string): string {
  return sanitizeSafeText(value);
}

function formatAttachmentRetentionStatus(status: AttachmentPreviewRetentionItem["status"]): string {
  if (status === "cleanup_eligible") {
    return "К очистке";
  }
  if (status === "preserved") {
    return "Защищен";
  }
  return "Сохранен";
}
