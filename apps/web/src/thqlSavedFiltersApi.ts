import { getStoredSessionToken } from "./auth.js";
import type { ThqlFilterEntity, ThqlFilterScope, ThqlSavedFilter } from "./thqlSavedFilters.js";

type ThqlFilterListResponse = {
  kind: "thql-filter-list";
  items: ThqlSavedFilter[];
};

type ThqlFilterCreatedResponse = {
  kind: "thql-filter-created";
  filter: ThqlSavedFilter;
};

export async function loadThqlFiltersFromApi(input: {
  actorId: string;
  entity: ThqlFilterEntity;
  projectId: string;
}): Promise<ThqlSavedFilter[]> {
  const params = new URLSearchParams({
    entity: input.entity,
    projectId: input.projectId
  });
  const payload = await thqlJson<ThqlFilterListResponse>(`/api/v1/thql/filters?${params}`, {
    headers: thqlHeaders({
      actorId: input.actorId,
      projectId: input.projectId,
      scopes: "settings:read"
    })
  });
  return payload.items;
}

export async function createThqlFilterInApi(input: {
  actorId: string;
  entity: ThqlFilterEntity;
  name: string;
  projectId: string;
  query: string;
  scope: ThqlFilterScope;
}): Promise<ThqlSavedFilter> {
  const payload = await thqlJson<ThqlFilterCreatedResponse>("/api/v1/thql/filters", {
    body: JSON.stringify({
      entity: input.entity,
      name: input.name,
      projectId: input.scope === "project" ? input.projectId : undefined,
      query: input.query,
      scope: input.scope
    }),
    headers: thqlHeaders({
      actorId: input.actorId,
      contentType: true,
      projectId: input.projectId,
      ...(input.scope === "project" ? { scopes: "settings:write" } : {})
    }),
    method: "POST"
  });
  return payload.filter;
}

export async function deleteThqlFilterFromApi(input: {
  actorId: string;
  filter: ThqlSavedFilter;
  projectId: string;
}): Promise<void> {
  await thqlJson<{ kind: "thql-filter-deleted"; filterId: string }>(
    `/api/v1/thql/filters/${encodeURIComponent(input.filter.id)}`,
    {
      headers: thqlHeaders({
        actorId: input.actorId,
        projectId: input.filter.projectId ?? input.projectId,
        ...(input.filter.scope === "project" ? { scopes: "settings:write" } : {})
      }),
      method: "DELETE"
    }
  );
}

function thqlHeaders(input: {
  actorId: string;
  contentType?: boolean;
  projectId?: string;
  scopes?: string;
}): HeadersInit {
  const headers: Record<string, string> = {
    "x-testhistory-actor-id": input.actorId
  };
  const sessionToken = getStoredSessionToken();
  if (sessionToken !== undefined) {
    headers.authorization = `Bearer ${sessionToken}`;
  }
  if (input.contentType === true) {
    headers["content-type"] = "application/json";
  }
  if (input.projectId !== undefined) {
    headers["x-testhistory-project-scope"] = input.projectId;
  }
  if (input.scopes !== undefined) {
    headers["x-testhistory-scopes"] = input.scopes;
  }
  return headers;
}

async function thqlJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return (await response.json()) as T;
}
