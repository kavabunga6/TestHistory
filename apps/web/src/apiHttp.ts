import { PermissionDeniedHttpError, readPermissionDeniedError } from "./apiPermissions.js";
import { getStoredSessionToken } from "./auth.js";
import {
  UserFacingRequestError,
  fetchForUi,
  readJsonForUi,
  requireOkForUi
} from "./userFacingErrors.js";

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  return requestJson<T>(url, init);
}

export async function getBinary(url: string, init?: RequestInit): Promise<Blob> {
  const response = await requestResponse(url, init);
  try {
    return await response.blob();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    throw new UserFacingRequestError("invalid-response");
  }
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await requestResponse(url, init);
  return readJsonForUi<T>(response);
}

export async function requestResponse(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetchForUi(url, withDefaultApiHeaders(init));
  if (!response.ok) {
    const denied = await readPermissionDeniedError(response);
    if (denied !== undefined) {
      throw new PermissionDeniedHttpError(denied);
    }

    requireOkForUi(response);
  }
  return response;
}

function withDefaultApiHeaders(init?: RequestInit): RequestInit | undefined {
  const headers = new Headers(init?.headers);
  const sessionToken = getStoredSessionToken();
  if (sessionToken !== undefined && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${sessionToken}`);
  }

  return {
    ...init,
    headers
  };
}
