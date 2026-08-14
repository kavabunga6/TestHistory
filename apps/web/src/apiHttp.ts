import { PermissionDeniedHttpError, readPermissionDeniedError } from "./apiPermissions.js";
import { getStoredSessionToken } from "./auth.js";

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  return requestJson<T>(url, init);
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, withDefaultApiHeaders(init));
  if (!response.ok) {
    const denied = await readPermissionDeniedError(response);
    if (denied !== undefined) {
      throw new PermissionDeniedHttpError(denied);
    }

    throw new Error(`${url} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

function withDefaultApiHeaders(init?: RequestInit): RequestInit | undefined {
  const headers = new Headers(init?.headers);
  const sessionToken = getStoredSessionToken();
  if (
    sessionToken !== undefined &&
    !headers.has("authorization") &&
    !headers.has("x-testhistory-actor-id")
  ) {
    headers.set("authorization", `Bearer ${sessionToken}`);
  }

  return {
    ...init,
    headers
  };
}
