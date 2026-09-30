import type { ApiState } from "./api.js";

export function toApiErrorState(error: unknown): ApiState {
  return { loading: false, error: error instanceof Error ? error.message : String(error) };
}
