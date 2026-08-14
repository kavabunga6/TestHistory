import type {
  AuthTokenScope,
  DeniedUiModel,
  DeniedUiSurface,
  PermissionDeniedError,
  PermissionDeniedReason
} from "./apiTypes.js";

export const M5_DENIED_SURFACES: DeniedUiSurface[] = [
  {
    id: "project",
    title: "Доступ к проекту закрыт",
    badge: "Готово",
    copy: "Метаданные проекта, участники и настройки скрыты, пока права доступа не выданы.",
    actionLabel: "Запросить доступ"
  },
  {
    id: "launch",
    title: "Запуски скрыты",
    badge: "Готово",
    copy: "Списки запусков, результаты, трассы и служебные сведения не отображаются без доступа.",
    actionLabel: "Открыть запуск"
  },
  {
    id: "artifact",
    title: "Вложения закрыты",
    badge: "Готово",
    copy: "Имена файлов, ссылки на скачивание и данные хранения остаются недоступны.",
    actionLabel: "Скачать вложение"
  },
  {
    id: "mutation",
    title: "Изменения отключены",
    badge: "Готово",
    copy: "Редактирование, загрузка и изменение гейтов недоступны в режиме закрытого доступа.",
    actionLabel: "Сохранить изменение"
  }
];

export function getDeniedUiModel(denied: PermissionDeniedError): DeniedUiModel {
  return {
    shape: "PermissionDeniedError",
    title: denied.reason === "missing_token" ? "Нужна авторизация" : "Доступ закрыт",
    message: getSafeDeniedMessage(denied),
    reason: formatDeniedReason(denied.reason),
    resource: formatDeniedResource(denied.resource?.type ?? "project"),
    surfaces: M5_DENIED_SURFACES
  };
}

export function getSafeDeniedMessage(denied: PermissionDeniedError): string {
  if (containsAuthDetail(denied.message)) {
    return deniedCopyForReason(denied.reason);
  }

  return denied.message;
}

function deniedCopyForReason(reason: PermissionDeniedReason): string {
  if (reason === "missing_token") {
    return "Для этой рабочей области нет активной авторизованной сессии.";
  }
  if (reason === "invalid_token") {
    return "Текущая авторизация не принята сервисом.";
  }
  if (reason === "insufficient_scope") {
    return "Текущие права не позволяют открыть этот раздел.";
  }
  if (reason === "project_access_denied") {
    return "Доступ к проекту закрыт";
  }

  return "Доступ закрыт";
}

function formatDeniedReason(reason: PermissionDeniedReason): string {
  if (reason === "missing_token") {
    return "нет авторизованной сессии";
  }
  if (reason === "invalid_token") {
    return "авторизация отклонена";
  }
  if (reason === "insufficient_scope") {
    return "недостаточно прав";
  }
  if (reason === "project_access_denied") {
    return "доступ к проекту закрыт";
  }

  return "доступ закрыт";
}

function formatDeniedResource(resource: string): string {
  if (resource === "project") {
    return "проект";
  }
  if (resource === "launch") {
    return "запуск";
  }
  if (resource === "artifact") {
    return "вложение";
  }

  return "ресурс";
}

function containsAuthDetail(value: string): boolean {
  return (
    /\b(token|bearer|scope|secret)\b/i.test(value) || /[a-z-]+:(read|write|evaluate)\b/i.test(value)
  );
}

export async function readPermissionDeniedError(
  response: Response
): Promise<PermissionDeniedError | undefined> {
  if (response.status !== 401 && response.status !== 403) {
    return undefined;
  }

  try {
    const value = (await response.clone().json()) as unknown;
    return toPermissionDeniedError(value);
  } catch {
    return undefined;
  }
}

function isPermissionDeniedError(value: unknown): value is PermissionDeniedError {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.error === "permission_denied" &&
    typeof value.message === "string" &&
    isPermissionDeniedReason(value.reason)
  );
}

function toPermissionDeniedError(value: unknown): PermissionDeniedError | undefined {
  if (isPermissionDeniedError(value)) {
    return value;
  }

  if (
    !isRecord(value) ||
    value.error !== "PermissionDeniedError" ||
    typeof value.message !== "string"
  ) {
    return undefined;
  }

  const denied: PermissionDeniedError = {
    error: "permission_denied",
    message: value.message,
    reason: "permission_denied"
  };

  if (Array.isArray(value.requiredScopes)) {
    denied.requiredScopes = value.requiredScopes.filter(isAuthTokenScope);
  }
  if (typeof value.projectId === "string") {
    denied.projectId = value.projectId;
  }

  return denied;
}

function isPermissionDeniedReason(value: unknown): value is PermissionDeniedReason {
  return (
    value === "missing_token" ||
    value === "invalid_token" ||
    value === "insufficient_scope" ||
    value === "project_access_denied" ||
    value === "permission_denied"
  );
}

function isAuthTokenScope(value: unknown): value is AuthTokenScope {
  return (
    value === "mcp:discover" ||
    value === "projects:read" ||
    value === "projects:write" ||
    value === "launches:read" ||
    value === "launches:write" ||
    value === "uploads:read" ||
    value === "uploads:write" ||
    value === "results:read" ||
    value === "results:write" ||
    value === "test-cases:read" ||
    value === "test-cases:write" ||
    value === "artifacts:read" ||
    value === "artifacts:write" ||
    value === "defects:read" ||
    value === "defects:write" ||
    value === "quarantine:write" ||
    value === "settings:read" ||
    value === "settings:write" ||
    value === "exports:read" ||
    value === "security:audit:read" ||
    value === "quality-gates:evaluate"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class PermissionDeniedHttpError extends Error {
  constructor(readonly denied: PermissionDeniedError) {
    super(denied.message);
    this.name = "PermissionDeniedHttpError";
  }
}
