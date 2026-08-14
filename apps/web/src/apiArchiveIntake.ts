import type {
  ApiState,
  ArchiveDiagnosticReplayFixtureApiState,
  ArchiveDiagnosticReplayFixtureCard,
  ArchiveDiagnosticReplayFixtureContract,
  ArchiveDiagnosticReplayFixtureListRead,
  ArchiveDiagnosticReplayFixtureEvidence,
  ArchiveIntakeUiModel,
  ArchiveIntakeUiState,
  ArchiveJobReadCard,
  ArchiveReadMetadata,
  ArchiveUploadStatusApiState,
  ArchiveUploadStatusListRead,
  ArchiveUploadStatusRead,
  ArchiveWorkerDiagnostic,
  RuntimeUiState
} from "./apiTypes.js";
import { getUploadCapabilitySummary } from "./apiRuntime.js";
import { formatBytes, sanitizeArchiveText } from "./apiText.js";

export function getArchiveIntakeUiModel(apiState: ApiState): ArchiveIntakeUiModel {
  const summary = getUploadCapabilitySummary(apiState.capabilities);
  const archiveAdvertised = summary.archivePlanned;
  const apiReady =
    !apiState.loading && apiState.error === undefined && apiState.denied === undefined;
  const intakeState = getArchiveIntakeState(apiState, archiveAdvertised);
  const archiveStatus = apiState.archiveUploadStatus;
  const archiveStatusData =
    archiveStatus?.state === "ready" ||
    archiveStatus?.state === "empty" ||
    archiveStatus?.state === "partial"
      ? archiveStatus.data
      : undefined;
  const archiveValue = archiveAdvertised ? "архив запланирован" : "не объявлено";
  const readDiagnostics = archiveStatusData?.diagnostics.items ?? [];
  const readDiagnosticLimit = archiveStatusData?.diagnostics.page.limit ?? 0;

  return {
    state: intakeState,
    label: getArchiveIntakeLabel(intakeState),
    copy: getArchiveIntakeCopy(intakeState, apiState.error, archiveStatus),
    readMetadata: getArchiveReadMetadata(archiveStatus, apiState.denied !== undefined),
    diagnostics: [
      {
        id: "archive-mode",
        label: "Режим архива",
        value: archiveValue,
        detail: archiveAdvertised
          ? "Возможности API объявляют прием архивов как запланированный режим."
          : "Возможности API пока не объявляют прием архивов.",
        state:
          archiveAdvertised && apiReady ? "ready" : intakeState === "error" ? "blocked" : "waiting"
      },
      {
        id: "compression-policy",
        label: "Порог сжатия",
        value: formatBytes(summary.compressionMinBytes),
        detail: "Политика сжатия архива читается из публичного контракта capabilities.",
        state: summary.compressionMinBytes > 0 && apiReady ? "ready" : "waiting"
      },
      {
        id: "upload-concurrency",
        label: "Параллельность загрузки",
        value: summary.maxUploadConcurrency
          ? `${summary.maxUploadConcurrency} worker`
          : "не объявлено",
        detail: "Ограничение параллельности приема приходит из метаданных политики ingestion.",
        state: summary.maxUploadConcurrency > 0 && apiReady ? "ready" : "waiting"
      },
      {
        id: "archive-status-read",
        label: "Чтение статуса",
        value: archiveStatusData
          ? `${archiveStatusData.summary.total} задач`
          : archiveStatus?.state === "error" || archiveStatus?.state === "denied"
            ? archiveStatus.state
            : "ожидаем",
        detail: archiveStatusData
          ? "REST-чтение статуса архива ограничено проектом, участником и режимом чтения."
          : "Ожидаем проекцию REST-чтения статуса архива.",
        state:
          archiveStatus?.state === "error" || archiveStatus?.state === "denied"
            ? "blocked"
            : archiveStatusData !== undefined
              ? "ready"
              : "waiting"
      },
      {
        id: "archive-diagnostic-page",
        label: "Страница диагностики",
        value: archiveStatusData
          ? `${readDiagnostics.length}/${archiveStatusData.diagnostics.page.total}`
          : readDiagnosticLimit > 0
            ? `лимит ${readDiagnosticLimit}`
            : "не загружено",
        detail: archiveStatusData
          ? "Диагностика worker постраничная и ограничена перед отображением."
          : "Страница диагностики worker еще не вернулась.",
        state:
          archiveStatusData !== undefined
            ? archiveStatusData.diagnostics.page.hasMore || archiveStatus?.state === "partial"
              ? "waiting"
              : "ready"
            : archiveStatus?.state === "error" || archiveStatus?.state === "denied"
              ? "blocked"
              : "waiting"
      }
    ],
    archiveJobs: getArchiveJobReadCards(archiveStatusData),
    workerDiagnostics: getArchiveWorkerDiagnostics(archiveStatusData, archiveAdvertised, apiReady),
    workerDiagnosticLimit: 3,
    fixtureEvidence: getArchiveDiagnosticReplayFixtureEvidence(apiState)
  };
}

function getArchiveDiagnosticReplayFixtureEvidence(
  apiState: ApiState
): ArchiveDiagnosticReplayFixtureEvidence {
  const fixtureState = apiState.archiveDiagnosticReplayFixtures;
  const data =
    fixtureState?.state === "ready" ||
    fixtureState?.state === "empty" ||
    fixtureState?.state === "partial"
      ? fixtureState.data
      : undefined;
  const state = getArchiveFixtureEvidenceState(fixtureState, apiState);

  return {
    state,
    label: getArchiveFixtureEvidenceLabel(state),
    copy: getArchiveFixtureEvidenceCopy(state, fixtureState, apiState.error),
    summary: getArchiveFixtureEvidenceSummary(data, fixtureState),
    cards: getArchiveFixtureCards(data),
    cardLimit: 3
  };
}

function getArchiveFixtureEvidenceState(
  fixtureState: ArchiveDiagnosticReplayFixtureApiState | undefined,
  apiState: ApiState
): ArchiveIntakeUiState {
  if (apiState.denied !== undefined || fixtureState?.state === "denied") {
    return "denied";
  }
  if (apiState.loading || fixtureState?.state === "loading") {
    return "loading";
  }
  if (apiState.error !== undefined || fixtureState?.state === "error") {
    return "error";
  }
  if (fixtureState?.state === "partial") {
    return "partial";
  }
  if (fixtureState?.state === "ready") {
    return "ready";
  }
  if (fixtureState?.state === "empty") {
    return "empty";
  }

  return "loading";
}

function getArchiveFixtureEvidenceLabel(state: ArchiveIntakeUiState): string {
  if (state === "ready") {
    return "Синтетические фикстуры replay готовы";
  }
  if (state === "partial") {
    return "Синтетические фикстуры replay загружены частично";
  }
  if (state === "empty") {
    return "Синтетические фикстуры replay не найдены";
  }
  if (state === "denied") {
    return "Доступ к синтетическим фикстурам replay закрыт";
  }
  if (state === "error") {
    return "Синтетические фикстуры replay недоступны";
  }

  return "Загружаем синтетические фикстуры replay";
}

function formatArchiveFixtureState(state: ArchiveIntakeUiState): string {
  const labels: Record<ArchiveIntakeUiState, string> = {
    denied: "доступ закрыт",
    empty: "пусто",
    error: "ошибка",
    loading: "загрузка",
    partial: "частично",
    ready: "готово"
  };

  return labels[state];
}

function getArchiveFixtureEvidenceCopy(
  state: ArchiveIntakeUiState,
  fixtureState: ArchiveDiagnosticReplayFixtureApiState | undefined,
  apiError?: string
): string {
  if (state === "ready" || state === "partial") {
    return "Материализованные сводки фикстур подтверждают совместимость replay архива только по отредактированным синтетическим контрактам.";
  }
  if (state === "empty") {
    return "Материализованная модель чтения не вернула synthetic-сводки для этого проекта.";
  }
  if (state === "denied") {
    const deniedMessage =
      fixtureState?.state === "denied"
        ? sanitizeArchiveText(fixtureState.message, "Доступ к фикстуре закрыт")
        : undefined;
    return `${deniedMessage ?? "Доступ к фикстуре закрыт"}. Скоуп проекта и участника остается отредактированным.`;
  }
  if (state === "error") {
    const message =
      fixtureState?.state === "error"
        ? sanitizeArchiveText(fixtureState.message, "Чтение фикстуры завершилось ошибкой")
        : undefined;
    return (
      message ??
      (apiError?.toLowerCase().includes("fetch")
        ? "Чтение фикстуры недоступно из-за сети."
        : "Чтение фикстуры завершилось ошибкой.")
    );
  }

  return "Ждем ограниченную материализованную модель чтения перед показом доказательств replay архива.";
}

function getArchiveFixtureEvidenceSummary(
  data: ArchiveDiagnosticReplayFixtureListRead | undefined,
  fixtureState: ArchiveDiagnosticReplayFixtureApiState | undefined
): ArchiveDiagnosticReplayFixtureEvidence["summary"] {
  if (data === undefined) {
    return {
      fixtures:
        fixtureState?.state === "error" || fixtureState?.state === "denied"
          ? formatArchiveFixtureState(fixtureState.state)
          : "ожидаем",
      digests: "дайджест ожидается",
      entries: "ожидаем",
      attempts: "ожидаем",
      readOnly: "режим чтения ожидается",
      payload: "скрыты",
      bounds: "фикстуры ожидаются"
    };
  }

  return {
    fixtures: `${data.summary.materializedRecordCount} фикстур`,
    digests: `${getArchiveFixtureDigestCount(data)} дайджест`,
    entries: `${data.summary.supportedFiles} поддержано / ${data.summary.ignoredFiles} проигнорировано`,
    attempts: `${data.summary.attemptGroups} групп попыток`,
    readOnly:
      data.summary.readOnly && !data.summary.mutation ? "только чтение" : "мутации недоступны",
    payload:
      data.summary.rawArchivePayloadsIncluded ||
      data.summary.manifestEntriesIncluded ||
      data.summary.resultFilesIncluded ||
      data.summary.localPathsIncluded ||
      data.summary.storageRefsIncluded ||
      data.summary.signedUrlsIncluded ||
      data.summary.tokensIncluded
        ? "отредактированы"
        : "не включены",
    bounds: `${data.page.returned} из ${data.page.total}, лимит ${data.page.limit}`
  };
}

function getArchiveFixtureCards(
  data: ArchiveDiagnosticReplayFixtureListRead | undefined
): ArchiveDiagnosticReplayFixtureCard[] {
  if (data === undefined) {
    return [];
  }

  return data.items
    .slice(0, Math.max(0, Math.min(data.page.limit, data.page.returned)))
    .map((fixture) => ({
      id: sanitizeArchiveText(fixture.materializedRef, "фикстура отредактирована"),
      name: sanitizeArchiveText(fixture.name, "фикстура отредактирована"),
      scenario: sanitizeArchiveText(fixture.scenario, "сценарий отредактирован"),
      digest: sanitizeArchiveText(fixture.recordDigest, "дайджест отредактирован"),
      expected: `${fixture.evidence.supportedFiles} поддержано, ${fixture.evidence.attachmentFiles} вложений, ${fixture.evidence.parseErrors} ошибок парсинга`,
      replay: [
        fixture.evidence.deterministic ? "детерминировано" : "не детерминировано",
        fixture.evidence.retryAware ? "с учетом ретраев" : undefined,
        fixture.evidence.duplicateAware ? "с учетом дублей" : undefined,
        fixture.evidence.deniedFixture ? "безопасный denied-path" : undefined,
        fixture.status === "denied" ? "материализация закрыта" : undefined
      ]
        .filter((part): part is string => part !== undefined)
        .join(" / "),
      payload:
        fixture.evidence.redactionPassed &&
        !fixture.materialization.rawArchivePayloadsIncluded &&
        !fixture.materialization.manifestEntriesIncluded &&
        !fixture.materialization.resultFilesIncluded &&
        !fixture.materialization.localPathsIncluded &&
        !fixture.materialization.storageRefsIncluded &&
        !fixture.materialization.signedUrlsIncluded &&
        !fixture.materialization.tokensIncluded
          ? "материализованная сводка отредактирована"
          : "исходные данные отредактированы",
      state: archiveFixtureCardState(fixture)
    }));
}

function getArchiveFixtureDigestCount(data: ArchiveDiagnosticReplayFixtureListRead): number {
  return data.items.filter((fixture) => fixture.recordDigest.length > 0).length;
}

function archiveFixtureCardState(fixture: ArchiveDiagnosticReplayFixtureContract): RuntimeUiState {
  if (
    fixture.evidence.parseErrors > 0 ||
    fixture.evidence.deniedFixture ||
    fixture.status === "denied"
  ) {
    return "blocked";
  }
  if (
    fixture.evidence.warningCount > 0 ||
    fixture.evidence.retryAware ||
    fixture.evidence.duplicateAware
  ) {
    return "waiting";
  }

  return "ready";
}

function getArchiveWorkerDiagnostics(
  archiveStatusData: ArchiveUploadStatusListRead | undefined,
  archiveAdvertised: boolean,
  apiReady: boolean
): ArchiveWorkerDiagnostic[] {
  if (archiveStatusData !== undefined && archiveStatusData.diagnostics.items.length > 0) {
    return archiveStatusData.diagnostics.items.map((diagnostic, index) => ({
      id: `archive-read-diagnostic-${index}`,
      label: sanitizeArchiveText(diagnostic.code, "archive.diagnostic"),
      value: sanitizeArchiveText(diagnostic.severity, "отредактировано"),
      detail: sanitizeArchiveText(diagnostic.message, "детали диагностики отредактированы"),
      state: archiveDiagnosticState(diagnostic.severity),
      wip: false
    }));
  }

  if (archiveStatusData !== undefined) {
    return [
      {
        id: "archive-status-read-empty",
        label: "archive.status.read",
        value: `${archiveStatusData.summary.total} задач`,
        detail:
          archiveStatusData.summary.total === 0
            ? "Чтение статуса архива подключено и не вернуло задач загрузки архива."
            : "Чтение статуса архива подключено; на этой странице нет диагностики worker.",
        state: archiveStatusData.page.hasMore ? "waiting" : "ready",
        wip: false
      },
      {
        id: "archive-diagnostics-empty",
        label: "archive.diagnostics.read",
        value: `${archiveStatusData.diagnostics.page.total} диагностик`,
        detail:
          "Страница диагностики worker ограничена, отредактирована и пуста для текущего чтения статуса архива.",
        state: archiveStatusData.diagnostics.page.hasMore ? "waiting" : "ready",
        wip: false
      },
      {
        id: "archive-status-safety",
        label: "archive.safety",
        value: "только чтение",
        detail:
          "UI статуса архива не показывает исходные данные, локальные пути, ссылки хранения, подписанные ссылки, токены или мутации.",
        state: "ready",
        wip: false
      }
    ];
  }

  return [
    {
      id: "archive-receive",
      label: "archive.receive",
      value: archiveAdvertised ? "API-граница" : "недоступно",
      detail:
        "Загрузки архивов принимаются через документированную API-границу; панель показывает только диагностику чтения.",
      state: archiveAdvertised && apiReady ? "waiting" : "blocked",
      wip: false
    },
    {
      id: "archive-unpack",
      label: "archive.unpack",
      value: "только чтение",
      detail: "Прогресс распаковки worker представлен ограниченной проекцией статуса архива.",
      state: apiReady ? "waiting" : "blocked",
      wip: false
    },
    {
      id: "archive-validate",
      label: "archive.validate",
      value: "ограничено",
      detail: "Диагностика валидации ограничена и не показывает исходное содержимое архива.",
      state: apiReady ? "waiting" : "blocked",
      wip: false
    },
    {
      id: "archive-persist",
      label: "archive.persist",
      value: "отредактировано",
      detail: "Диагностика сохранения показывает только безопасные счетчики и метаданные архива.",
      state: apiReady ? "waiting" : "blocked",
      wip: false
    }
  ];
}

function getArchiveIntakeState(
  apiState: ApiState,
  archiveAdvertised: boolean
): ArchiveIntakeUiState {
  if (apiState.denied !== undefined || apiState.archiveUploadStatus?.state === "denied") {
    return "denied";
  }
  if (apiState.loading || apiState.archiveUploadStatus?.state === "loading") {
    return "loading";
  }
  if (apiState.error !== undefined || apiState.archiveUploadStatus?.state === "error") {
    return "error";
  }
  if (apiState.archiveUploadStatus?.state === "partial") {
    return "partial";
  }
  if (apiState.archiveUploadStatus?.state === "ready") {
    return "ready";
  }
  if (apiState.archiveUploadStatus?.state === "empty") {
    return "empty";
  }
  if (!archiveAdvertised) {
    return "empty";
  }

  return "ready";
}

function getArchiveIntakeLabel(state: ArchiveIntakeUiState): string {
  if (state === "ready") {
    return "Прием архивов запланирован";
  }
  if (state === "partial") {
    return "Прием архивов частично доступен";
  }
  if (state === "loading") {
    return "Загрузка приема архивов";
  }
  if (state === "error") {
    return "Прием архивов недоступен";
  }
  if (state === "denied") {
    return "Доступ к приему архивов закрыт";
  }

  return "Прием архивов не объявлен";
}

function getArchiveIntakeCopy(
  state: ArchiveIntakeUiState,
  error?: string,
  archiveStatus?: ArchiveUploadStatusApiState
): string {
  if (state === "ready") {
    return "Диагностика архива читается из ограниченной проекции статуса; мутации выполняются через документированные границы API и worker.";
  }
  if (state === "partial") {
    return "Диагностика архива частично доступна: лимиты страниц или задачи с ошибками скрывают дополнительные доказательства чтения.";
  }
  if (state === "loading") {
    return "Ожидаем capabilities перед показом готовности приема архивов.";
  }
  if (state === "error") {
    const statusMessage =
      archiveStatus?.state === "error"
        ? sanitizeArchiveText(archiveStatus.message, "Чтение статуса архива завершилось ошибкой")
        : undefined;
    if (statusMessage !== undefined) {
      return `${statusMessage}. Локальный контекст capability архива остается видимым.`;
    }
    return error?.toLowerCase().includes("fetch")
      ? "Диагностика приема архивов offline, пока API-соединение не восстановится."
      : "Диагностика приема архивов недоступна, потому что API вернул ошибку.";
  }
  if (state === "denied") {
    const deniedMessage =
      archiveStatus?.state === "denied"
        ? sanitizeArchiveText(archiveStatus.message, "Доступ к статусу архива закрыт")
        : undefined;
    if (deniedMessage !== undefined) {
      return `${deniedMessage}. Данные участника и проекта остаются отредактированными.`;
    }
    return "Диагностика приема архивов скрыта контрактом PermissionDeniedError.";
  }

  if (archiveStatus?.state === "empty") {
    return "Чтение статуса архива не вернуло задач загрузки архива для этого запуска.";
  }

  return "Задачи архива не показаны, потому что capabilities не объявляет прием архивов.";
}

function getArchiveReadMetadata(
  archiveStatus: ArchiveUploadStatusApiState | undefined,
  globallyDenied: boolean
): ArchiveReadMetadata {
  if (globallyDenied) {
    return {
      project: "Скрыто правами",
      actor: "Скрыто правами",
      access: "запрещено / отредактировано",
      launch: "Скрыто правами",
      readOnly: "запрос чтения заблокирован",
      bounded: "диагностика скрыта"
    };
  }

  if (
    archiveStatus?.state === "ready" ||
    archiveStatus?.state === "empty" ||
    archiveStatus?.state === "partial"
  ) {
    const data = archiveStatus.data;
    const scopes = data.access.requiredScopes.map((scope) => sanitizeArchiveText(scope, "scope"));
    return {
      project: sanitizeArchiveText(data.launch.projectId, "Проект отредактирован"),
      actor: data.access.actorScoped ? "archive-status-ui" : "все участники",
      access: `${scopes.join(" + ")} / скоуп проекта / отредактировано`,
      launch: `${sanitizeArchiveText(data.launch.id, "Запуск отредактирован")} (${sanitizeArchiveText(
        data.launch.status,
        "статус отредактирован"
      )})`,
      readOnly:
        data.access.mutation ||
        data.processing.payloadsAcceptedOnThisEndpoint ||
        data.processing.storesArchivePayload
          ? "мутации недоступны"
          : "только чтение; без исходных данных архива и объектов хранения",
      bounded: `${data.diagnostics.page.returned} из ${data.diagnostics.page.total} диагностик, лимит ${data.diagnostics.page.limit}`
    };
  }

  if (archiveStatus?.state === "denied") {
    return {
      project: "Скрыто правами",
      actor: "Скрыто правами",
      access: "запрещено / отредактировано",
      launch: "Скрыто правами",
      readOnly: "запрос чтения заблокирован",
      bounded: "диагностика скрыта"
    };
  }

  if (archiveStatus?.state === "error") {
    return {
      project: "Недоступно",
      actor: "archive-status-ui",
      access: "чтение упало / отредактировано",
      launch: "Недоступно",
      readOnly: "запрос чтения завершился ошибкой",
      bounded: "диагностика недоступна"
    };
  }

  return {
    project: "Текущий проект",
    actor: "archive-status-ui",
    access: "uploads:read + launches:read / только чтение",
    launch: "Выбранный запуск",
    readOnly: "диагностика только для чтения; мутации используют границы API и worker",
    bounded: "диагностика ожидается"
  };
}

function getArchiveJobReadCards(
  archiveStatusData: ArchiveUploadStatusListRead | undefined
): ArchiveJobReadCard[] {
  if (archiveStatusData === undefined) {
    return [];
  }

  const visibleItems = archiveStatusData.items.slice(
    0,
    Math.max(0, Math.min(archiveStatusData.page.limit, archiveStatusData.page.returned))
  );

  return visibleItems.map((item) => ({
    id: sanitizeArchiveText(item.id, "Upload redacted"),
    status: sanitizeArchiveText(item.status, "status redacted"),
    phase: sanitizeArchiveText(item.phase, "phase redacted"),
    archiveName: sanitizeArchiveText(
      item.archive.name ?? "archive metadata",
      "Archive name redacted"
    ),
    entries: `${item.archive.supportedFiles}/${item.archive.totalEntries} accepted, ${item.archive.ignoredFiles} ignored`,
    progress: `${Math.round(item.progress)}%`,
    worker: `${sanitizeArchiveText(item.worker.queue, "queue redacted")} / ${sanitizeArchiveText(
      item.worker.boundary,
      "boundary redacted"
    )}`,
    diagnostics: `${item.diagnostics.page.returned} of ${item.diagnostics.page.total}`,
    state: archiveJobState(item)
  }));
}

function archiveJobState(item: ArchiveUploadStatusRead): RuntimeUiState {
  if (item.phase === "failed") {
    return "blocked";
  }
  if (item.phase === "queued" || item.phase === "processing" || item.phase === "partial_success") {
    return "waiting";
  }

  return "ready";
}

function archiveDiagnosticState(severity: string): RuntimeUiState {
  if (severity === "error") {
    return "blocked";
  }
  if (severity === "warning") {
    return "waiting";
  }

  return "ready";
}
