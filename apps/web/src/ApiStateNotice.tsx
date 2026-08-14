import { AlertTriangle, CheckCircle2, Clock3, ShieldCheck } from "lucide-react";

import { getDeniedUiModel, type ApiState } from "./api.js";

export function ApiStateNotice({
  apiState,
  readyText,
  scope
}: {
  apiState: ApiState;
  readyText: string;
  scope: string;
}) {
  if (apiState.denied !== undefined) {
    const model = getDeniedUiModel(apiState.denied);

    return (
      <section className="surface-state denied" aria-label={`${scope} denied state`}>
        <ShieldCheck size={17} />
        <span>
          <strong>{model.title}</strong>
          <small>{model.message}</small>
        </span>
      </section>
    );
  }

  if (apiState.loading) {
    return (
      <section className="surface-state loading" aria-label={`${scope} loading state`}>
        <Clock3 size={17} />
        <span>
          <strong>Загружаем {scope}</strong>
          <small>Ждем данные API, локальная демо-модель остается доступной.</small>
        </span>
      </section>
    );
  }

  if (apiState.error !== undefined) {
    const offline = apiState.error.toLowerCase().includes("fetch");

    return (
      <section className="surface-state offline" aria-label={`${scope} offline state`}>
        <AlertTriangle size={17} />
        <span>
          <strong>{offline ? "API недоступен" : "Ошибка API"}</strong>
          <small>
            {offline
              ? `Показываем кешированные данные раздела "${scope}", пока API не восстановится.`
              : `Показываем резервные данные раздела "${scope}", потому что API вернул ошибку.`}
          </small>
        </span>
      </section>
    );
  }

  return (
    <section className="surface-state ready" aria-label={`${scope} ready state`}>
      <CheckCircle2 size={17} />
      <span>
        <strong>{modeReadyLabel(scope)}</strong>
        <small>{readyText}</small>
      </span>
    </section>
  );
}

function modeReadyLabel(scope: string): string {
  if (scope === "аналитика") {
    return "Аналитика готова";
  }
  if (scope === "дашборды") {
    return "Дашборды готовы";
  }

  return `${scope.charAt(0).toUpperCase()}${scope.slice(1)} готовы`;
}
