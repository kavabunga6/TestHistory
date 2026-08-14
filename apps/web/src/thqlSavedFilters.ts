export type ThqlFilterScope = "global" | "personal" | "project";
export type ThqlFilterEntity = "defects" | "launchResults" | "launches" | "testCases";

export type ThqlSavedFilter = {
  createdAt?: string;
  createdBy?: string;
  entity?: ThqlFilterEntity;
  id: string;
  name: string;
  query: string;
  scope: ThqlFilterScope;
  description?: string;
  projectId?: string;
  ownerId?: string;
  updatedAt?: string;
};

export type ThqlFilterVisibility = {
  hiddenFilterIds: string[];
};

const visibilityStoragePrefix = "testhistory:thql-filter-visibility:";
const personalFiltersStoragePrefix = "testhistory:thql-personal-filters:";
const sharedFiltersStorageKey = "testhistory:thql-shared-filters";

export const thqlScopeLabels: Record<ThqlFilterScope, string> = {
  global: "Глобальный",
  personal: "Личный",
  project: "Проект"
};

export const defaultThqlFilters: ThqlSavedFilter[] = [
  {
    description: "Падения и runtime-ошибки без успешных и пропущенных результатов.",
    entity: "testCases",
    id: "global-problem-results",
    name: "Проблемные",
    query: 'status in ["failed", "broken"]',
    scope: "global"
  },
  {
    description: "Активные результаты без карантина.",
    entity: "testCases",
    id: "global-active-results",
    name: "Активные",
    query: "muted = false",
    scope: "global"
  },
  {
    description: "Checkout-сценарии текущего проекта.",
    entity: "testCases",
    id: "project-checkout",
    name: "Checkout",
    projectId: "ws",
    query: 'tag = "checkout" or suite ~= "checkout"',
    scope: "project"
  },
  {
    description: "Smoke-проверки проекта.",
    entity: "testCases",
    id: "project-smoke",
    name: "Smoke",
    projectId: "ws",
    query: 'tag = "smoke"',
    scope: "project"
  },
  {
    description: "Мои результаты по owner/member.",
    entity: "testCases",
    id: "personal-my-results",
    name: "Мои",
    ownerId: "admin",
    query: 'owner = "Platform QA" or member = "Platform QA"',
    scope: "personal"
  },
  {
    description: "Запуски с открытым состоянием.",
    entity: "launches",
    id: "global-open-launches",
    name: "Открытые",
    query: 'state = "open"',
    scope: "global"
  },
  {
    description: "Запуски текущей ветки разработки.",
    entity: "launches",
    id: "project-develop-launches",
    name: "develop",
    projectId: "ws",
    query: 'branch = "develop"',
    scope: "project"
  },
  {
    description: "Проблемные результаты выбранного запуска.",
    entity: "launchResults",
    id: "global-problem-launch-results",
    name: "Проблемные",
    query: 'status in ["failed", "broken"]',
    scope: "global"
  },
  {
    description: "Результаты в карантине.",
    entity: "launchResults",
    id: "global-quarantine-launch-results",
    name: "Карантин",
    query: "muted = true",
    scope: "global"
  },
  {
    description: "Дефекты, связанные с активными падениями.",
    entity: "defects",
    id: "global-open-defects",
    name: "Открытые",
    query: 'status = "open"',
    scope: "global"
  },
  {
    description: "Дефекты с карантином.",
    entity: "defects",
    id: "global-quarantined-defects",
    name: "Карантин",
    query: "quarantined = true",
    scope: "global"
  }
];

export function getAvailableThqlFilters(input: {
  actorId: string;
  entity?: ThqlFilterEntity;
  filters?: ThqlSavedFilter[];
  projectId: string;
}): ThqlSavedFilter[] {
  return uniqueFilters([
    ...defaultThqlFilters,
    ...loadSharedThqlFilters(),
    ...loadPersonalThqlFilters(input.actorId),
    ...(input.filters ?? [])
  ]).filter((filter) => isFilterAvailable(filter, input));
}

export function getVisibleThqlFilters(input: {
  actorId: string;
  filters: ThqlSavedFilter[];
}): ThqlSavedFilter[] {
  const hidden = new Set(loadThqlFilterVisibility(input.actorId).hiddenFilterIds);
  return input.filters.filter((filter) => !hidden.has(filter.id));
}

export function loadThqlFilterVisibility(actorId: string): ThqlFilterVisibility {
  try {
    const raw = globalThis.localStorage?.getItem(`${visibilityStoragePrefix}${actorId}`);
    if (raw === undefined || raw === null) {
      return { hiddenFilterIds: [] };
    }
    const parsed = JSON.parse(raw) as Partial<ThqlFilterVisibility>;
    return {
      hiddenFilterIds: Array.isArray(parsed.hiddenFilterIds)
        ? parsed.hiddenFilterIds.filter((id): id is string => typeof id === "string")
        : []
    };
  } catch {
    return { hiddenFilterIds: [] };
  }
}

export function saveThqlFilterVisibility(actorId: string, visibility: ThqlFilterVisibility): void {
  globalThis.localStorage?.setItem(
    `${visibilityStoragePrefix}${actorId}`,
    JSON.stringify({
      hiddenFilterIds: Array.from(new Set(visibility.hiddenFilterIds))
    })
  );
}

export function savePersonalThqlFilter(actorId: string, filter: Omit<ThqlSavedFilter, "scope">) {
  const nextFilter = normalizeSavedFilter({ ...filter, ownerId: actorId, scope: "personal" });
  const filters = loadPersonalThqlFilters(actorId);
  const nextFilters = filters.some((item) => item.id === nextFilter.id)
    ? filters.map((item) => (item.id === nextFilter.id ? nextFilter : item))
    : [...filters, nextFilter];
  globalThis.localStorage?.setItem(
    `${personalFiltersStoragePrefix}${actorId}`,
    JSON.stringify(nextFilters)
  );
  return nextFilter;
}

export function saveThqlFilter(
  actorId: string,
  filter: Omit<ThqlSavedFilter, "id" | "ownerId" | "projectId"> & {
    id?: string | undefined;
    projectId?: string | undefined;
  }
) {
  if (filter.scope === "personal") {
    return savePersonalThqlFilter(actorId, {
      ...(filter.description !== undefined ? { description: filter.description } : {}),
      ...(filter.entity !== undefined ? { entity: filter.entity } : {}),
      id: filter.id ?? createFilterId(filter.scope),
      name: filter.name,
      ownerId: actorId,
      query: filter.query
    });
  }

  const nextFilter = normalizeSavedFilter({
    ...(filter.description !== undefined ? { description: filter.description } : {}),
    ...(filter.entity !== undefined ? { entity: filter.entity } : {}),
    id: filter.id ?? createFilterId(filter.scope),
    name: filter.name,
    ...(filter.scope === "project" && filter.projectId !== undefined
      ? { projectId: filter.projectId }
      : {}),
    query: filter.query,
    scope: filter.scope
  });
  const filters = loadSharedThqlFilters();
  const nextFilters = filters.some((item) => item.id === nextFilter.id)
    ? filters.map((item) => (item.id === nextFilter.id ? nextFilter : item))
    : [...filters, nextFilter];
  saveSharedThqlFilters(nextFilters);
  return nextFilter;
}

export function deleteThqlFilter(actorId: string, filterId: string) {
  if (isDefaultThqlFilter(filterId)) {
    return;
  }

  saveSharedThqlFilters(loadSharedThqlFilters().filter((filter) => filter.id !== filterId));
  const personalFilters = loadPersonalThqlFilters(actorId).filter(
    (filter) => filter.id !== filterId
  );
  globalThis.localStorage?.setItem(
    `${personalFiltersStoragePrefix}${actorId}`,
    JSON.stringify(personalFilters)
  );
}

export function isDefaultThqlFilter(filterId: string) {
  return defaultThqlFilters.some((filter) => filter.id === filterId);
}

export function loadPersonalThqlFilters(actorId: string): ThqlSavedFilter[] {
  try {
    const raw = globalThis.localStorage?.getItem(`${personalFiltersStoragePrefix}${actorId}`);
    if (raw === undefined || raw === null) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isThqlSavedFilter);
  } catch {
    return [];
  }
}

export function loadSharedThqlFilters(): ThqlSavedFilter[] {
  try {
    const raw = globalThis.localStorage?.getItem(sharedFiltersStorageKey);
    if (raw === undefined || raw === null) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(isThqlSavedFilter).filter((filter) => filter.scope !== "personal")
      : [];
  } catch {
    return [];
  }
}

function saveSharedThqlFilters(filters: ThqlSavedFilter[]) {
  globalThis.localStorage?.setItem(sharedFiltersStorageKey, JSON.stringify(filters));
}

function uniqueFilters(filters: ThqlSavedFilter[]) {
  const byId = new Map<string, ThqlSavedFilter>();
  for (const filter of filters) {
    byId.set(filter.id, filter);
  }
  return Array.from(byId.values());
}

function isFilterAvailable(
  filter: ThqlSavedFilter,
  input: { actorId: string; entity?: ThqlFilterEntity; projectId: string }
) {
  if (input.entity !== undefined && filter.entity !== input.entity) {
    return false;
  }
  if (filter.scope === "global") {
    return true;
  }
  if (filter.scope === "project") {
    return filter.projectId === undefined || filter.projectId === input.projectId;
  }
  return filter.ownerId === undefined || filter.ownerId === input.actorId;
}

function normalizeSavedFilter(filter: ThqlSavedFilter): ThqlSavedFilter {
  return {
    ...filter,
    description: filter.description ?? filter.query
  };
}

function createFilterId(scope: ThqlFilterScope) {
  return `${scope}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isThqlSavedFilter(value: unknown): value is ThqlSavedFilter {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const item = value as Partial<ThqlSavedFilter>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.query === "string" &&
    (item.scope === "global" || item.scope === "personal" || item.scope === "project")
  );
}
