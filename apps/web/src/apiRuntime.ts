import type {
  ApiState,
  Capabilities,
  RuntimeUiModel,
  UploadCapabilitySummary
} from "./apiTypes.js";

export function getUploadCapabilitySummary(capabilities?: Capabilities): UploadCapabilitySummary {
  const modes = capabilities?.ingestion.modes ?? [];
  const policy = capabilities?.ingestion.policy;

  return {
    apiVersion: capabilities?.apiVersion ?? "unknown",
    batchJson: modes.includes("json-batch"),
    chunkedJson: modes.includes("chunked-json"),
    archivePlanned: modes.includes("archive-planned"),
    multipartS3Planned: modes.includes("multipart-s3-planned"),
    compressionMinBytes: policy?.compressionMinBytes ?? 0,
    retentionDays: policy?.retentionDays ?? 0,
    maxUploadConcurrency: policy?.maxUploadConcurrency ?? 0,
    chunkBytes: policy?.chunkBytes ?? 0,
    modules: capabilities?.modules ?? []
  };
}

export function getRuntimeUiModel(apiState: ApiState): RuntimeUiModel {
  const summary = getUploadCapabilitySummary(apiState.capabilities);
  const modules = new Set(summary.modules);
  const apiReady = !apiState.loading && !apiState.error;
  const ingestionReady = apiReady && (summary.batchJson || summary.chunkedJson);
  const processingReady = apiReady && modules.has("results") && modules.has("launches");
  const artifactsReady = apiReady && modules.has("artifacts");
  const cleanupReady = artifactsReady && summary.retentionDays > 0;
  const openLaunches = 1;
  const closedLaunches = 2;
  const artifacts = 0;

  return {
    lifecycle: [
      {
        id: "created",
        label: "Создан",
        description: "Запись запуска создана и принимает результаты.",
        state: apiReady ? "ready" : "waiting",
        meta: `${openLaunches} открыто`
      },
      {
        id: "ingesting",
        label: "Загрузка",
        description: "JSON-результаты принимаются поддержанными режимами загрузки.",
        state: ingestionReady ? "running" : "blocked",
        meta: summary.chunkedJson
          ? "пакетно + чанками"
          : summary.batchJson
            ? "только пакетно"
            : "не объявлено"
      },
      {
        id: "processing",
        label: "Обработка",
        description: "Результаты нормализуются для запусков, кейсов и истории.",
        state: processingReady ? "running" : "waiting",
        meta: modules.has("test-cases")
          ? "синхронизация кейсов готова"
          : "синхронизация кейсов ожидает"
      },
      {
        id: "quality-gate",
        label: "Гейт качества",
        description: "Статус запуска и дефекты готовы для оценки гейта.",
        state: modules.has("quality-gates") && apiReady ? "ready" : "waiting",
        meta: modules.has("defects") ? "дефекты связаны" : "дефекты ожидают"
      },
      {
        id: "closed",
        label: "Закрыт",
        description: "Закрытые запуски доступны для аналитики и истории.",
        state: apiReady ? "ready" : "waiting",
        meta: `${closedLaunches} закрыто`
      }
    ],
    pipeline: [
      {
        id: "upload",
        label: "Прием загрузок",
        description: "Принимает Allure-совместимые JSON пакеты или чанки.",
        state: ingestionReady ? "running" : "blocked",
        meta: summary.maxUploadConcurrency
          ? `${summary.maxUploadConcurrency} параллельных загрузок`
          : "параллельность не объявлена"
      },
      {
        id: "parse",
        label: "Разбор результатов",
        description: "Преобразует исходные данные запуска в сущности результатов.",
        state: processingReady ? "running" : "waiting",
        meta: "ingestion.parse queue"
      },
      {
        id: "sync",
        label: "Синхронизация кейсов",
        description: "Дополняет кейсы данными из входящих результатов.",
        state: modules.has("test-cases") && apiReady ? "ready" : "waiting",
        meta: "50 кейсов"
      },
      {
        id: "history",
        label: "Материализация истории",
        description: "Обновляет историю тестов и данные для будущих разрезов качества.",
        state: modules.has("test-cases") && apiReady ? "ready" : "waiting",
        meta: "данные истории готовы"
      },
      {
        id: "cleanup",
        label: "Очистка артефактов",
        description: "Готовит сохраненные файлы к выполнению политики очистки.",
        state: cleanupReady ? "waiting" : "blocked",
        meta: cleanupReady ? `${summary.retentionDays} дней хранения` : "политика хранения ожидает"
      }
    ],
    cleanup: {
      label: cleanupReady ? "Политика очистки объявлена" : "Очистке нужна политика хранения",
      state: cleanupReady ? "ready" : "waiting",
      retention: summary.retentionDays ? `${summary.retentionDays} дней` : "не объявлено",
      storage: artifactsReady ? `${artifacts} артефактов в индексе` : "модуль артефактов ожидает",
      queue: cleanupReady ? "политика готова" : "политика не объявлена"
    },
    queues: [
      {
        name: "ingestion.parse",
        scope: "ingestion",
        state: ingestionReady ? "running" : "blocked",
        detail: "Глубина очереди отражается через capabilities и bounded status projections"
      },
      {
        name: "launch.close",
        scope: "processing",
        state: processingReady ? "waiting" : "blocked",
        detail: "Задачи закрытия выводятся из состояния жизненного цикла запуска"
      },
      {
        name: "testcase.sync",
        scope: "processing",
        state: modules.has("test-cases") && apiReady ? "ready" : "waiting",
        detail: "Готовность синхронизации кейсов берется из модулей API"
      },
      {
        name: "history.materialize",
        scope: "processing",
        state: modules.has("test-cases") && apiReady ? "ready" : "waiting",
        detail: "Готовность истории тестов берется из модулей API"
      },
      {
        name: "artifact.cleanup",
        scope: "cleanup",
        state: cleanupReady ? "waiting" : "blocked",
        detail: "Очистка выполняется worker boundary; UI показывает политику и безопасные счетчики"
      }
    ],
    workers: [
      {
        id: "api",
        label: "API",
        value: apiState.loading ? "проверка" : apiState.error ? "недоступен" : "доступен",
        state: apiReady ? "ready" : apiState.loading ? "waiting" : "blocked",
        detail:
          summary.apiVersion === "unknown"
            ? "capabilities ожидаются"
            : `capabilities ${summary.apiVersion}`
      },
      {
        id: "worker",
        label: "Воркер",
        value: "только чтение",
        state: apiReady ? "waiting" : "blocked",
        detail: "Готовность воркера представлена безопасными capabilities и статусными проекциями"
      },
      {
        id: "queue",
        label: "Транспорт очередей",
        value: "только чтение",
        state: ingestionReady ? "waiting" : "blocked",
        detail: "Очереди показаны как ограниченные диагностические статусы без runtime-секретов"
      }
    ]
  };
}
