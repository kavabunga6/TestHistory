import { PermissionDeniedHttpError, getSafeDeniedMessage } from "./apiPermissions.js";

type RequestFailureKind = "http" | "network" | "invalid-response";

export class UserFacingRequestError extends Error {
  constructor(
    readonly kind: RequestFailureKind,
    readonly status?: number
  ) {
    super(requestFailureMessage(kind, status));
    this.name = "UserFacingRequestError";
  }
}

export async function fetchForUi(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    throw new UserFacingRequestError("network");
  }
}

export function requireOkForUi(response: Response): void {
  if (!response.ok) {
    throw new UserFacingRequestError("http", response.status);
  }
}

export async function readJsonForUi<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    throw new UserFacingRequestError("invalid-response");
  }
}

export function toUserErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof UserFacingRequestError) {
    return error.message;
  }
  if (error instanceof PermissionDeniedHttpError) {
    return getSafeDeniedMessage(error.denied);
  }
  return fallback;
}

function requestFailureMessage(kind: RequestFailureKind, status?: number): string {
  if (kind === "network") {
    return "Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз.";
  }
  if (kind === "invalid-response") {
    return "Сервис вернул неожиданный ответ. Попробуйте ещё раз.";
  }
  if (status === 401) {
    return "Не удалось подтвердить авторизацию. Войдите снова.";
  }
  if (status === 403) {
    return "У вас нет прав для этого действия.";
  }
  if (status === 404) {
    return "Данные не найдены. Обновите страницу и попробуйте ещё раз.";
  }
  if (status === 409) {
    return "Данные изменились. Обновите страницу и попробуйте ещё раз.";
  }
  if (status === 429) {
    return "Слишком много запросов. Подождите немного и попробуйте ещё раз.";
  }
  if (status !== undefined && status >= 500) {
    return "Сервис временно недоступен. Попробуйте позже.";
  }
  return "Не удалось выполнить запрос. Проверьте данные и попробуйте ещё раз.";
}
