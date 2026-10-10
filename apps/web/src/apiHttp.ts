import { PermissionDeniedHttpError, readPermissionDeniedError } from "./apiPermissions.js";
import { getStoredSessionToken } from "./auth.js";

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  return requestJson<T>(url, init);
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  return (await (await requestResponse(url, init)).json()) as T;
}

export async function requestResponse(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, withDefaultApiHeaders(init));
  if (!response.ok) {
    const denied = await readPermissionDeniedError(response);
    if (denied !== undefined) {
      throw new PermissionDeniedHttpError(denied);
    }

    throw new Error(`${url} returned ${response.status}`);
  }
  return response;
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
