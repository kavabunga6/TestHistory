export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  status: "active" | "disabled";
};

export type PersonalApiToken = {
  id: string;
  name: string;
  prefix: string;
  fingerprint: string;
  status: "active" | "revoked";
  scopes: string[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
};

type AuthSessionResponse = {
  session: { token: string; expiresAt: string; id: string };
  user: CurrentUser;
};

type CurrentUserResponse = {
  auth: { method: "session" | "personal-token" };
  user: CurrentUser;
};

const sessionStorageKey = "testhistory.sessionToken";

export function getStoredSessionToken(): string | undefined {
  try {
    return globalThis.localStorage?.getItem(sessionStorageKey) ?? undefined;
  } catch {
    return undefined;
  }
}

export function storeSessionToken(token: string): void {
  globalThis.localStorage?.setItem(sessionStorageKey, token);
}

export function clearSessionToken(): void {
  globalThis.localStorage?.removeItem(sessionStorageKey);
}

export async function registerUser(input: {
  email: string;
  name: string;
  password: string;
}): Promise<AuthSessionResponse> {
  return authJson<AuthSessionResponse>("/api/v1/auth/register", {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<AuthSessionResponse> {
  return authJson<AuthSessionResponse>("/api/v1/auth/login", {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
}

export async function loadCurrentUser(token = getStoredSessionToken()): Promise<CurrentUser> {
  if (token === undefined) {
    throw new Error("Session token is missing");
  }
  const payload = await authJson<CurrentUserResponse>("/api/v1/auth/me", {
    headers: authHeaders(token)
  });
  return payload.user;
}

export async function loadPersonalTokens(
  token = getStoredSessionToken()
): Promise<PersonalApiToken[]> {
  if (token === undefined) {
    return [];
  }
  const payload = await authJson<{ items: PersonalApiToken[] }>("/api/v1/auth/tokens", {
    headers: authHeaders(token)
  });
  return payload.items;
}

export async function createPersonalToken(input: {
  name: string;
  scopes: string[];
}): Promise<{ secret: string; token: PersonalApiToken }> {
  const token = getStoredSessionToken();
  if (token === undefined) {
    throw new Error("Session token is missing");
  }
  return authJson<{ secret: string; token: PersonalApiToken }>("/api/v1/auth/tokens", {
    body: JSON.stringify(input),
    headers: {
      ...authHeaders(token),
      "content-type": "application/json"
    },
    method: "POST"
  });
}

export async function revokePersonalToken(tokenId: string): Promise<PersonalApiToken> {
  const token = getStoredSessionToken();
  if (token === undefined) {
    throw new Error("Session token is missing");
  }
  const payload = await authJson<{ token: PersonalApiToken }>(
    `/api/v1/auth/tokens/${encodeURIComponent(tokenId)}`,
    {
      headers: authHeaders(token),
      method: "DELETE"
    }
  );
  return payload.token;
}

function authHeaders(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function authJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return (await response.json()) as T;
}
