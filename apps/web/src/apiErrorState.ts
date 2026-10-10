import type { ApiState } from "./api.js";
import { toUserErrorMessage } from "./userFacingErrors.js";

export function toApiErrorState(error: unknown): ApiState {
  return { loading: false, error: toUserErrorMessage(error, "Не удалось выполнить действие.") };
}
