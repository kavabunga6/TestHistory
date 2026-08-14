export type TypographyCategory = "title" | "heading" | "body" | "meta";

export type TypographyPreferences = Record<TypographyCategory, number>;

export type TypographyCategoryDefinition = {
  id: TypographyCategory;
  label: string;
  description: string;
  min: number;
  max: number;
};

export const defaultTypographyPreferences: TypographyPreferences = {
  title: 24,
  heading: 16,
  body: 14,
  meta: 12
};

export const typographySizeRange = {
  min: 8,
  max: 32
} as const;

export const typographyCategories: TypographyCategoryDefinition[] = [
  {
    id: "title",
    label: "Заголовки экранов",
    description: "Название запуска, теста, проекта или диалога.",
    ...typographySizeRange
  },
  {
    id: "heading",
    label: "Заголовки разделов",
    description: "Названия вкладок, панелей, секций, групп и таблиц.",
    ...typographySizeRange
  },
  {
    id: "body",
    label: "Основной текст",
    description: "Строки списков, кнопки, поля и описания.",
    ...typographySizeRange
  },
  {
    id: "meta",
    label: "Вспомогательный текст",
    description: "Счётчики, метки, статусы, даты, длительность и пояснения.",
    ...typographySizeRange
  }
];

const storagePrefix = "testhistory.typography.v1";

export function normalizeTypographyPreferences(
  value: Partial<TypographyPreferences> | undefined
): TypographyPreferences {
  return Object.fromEntries(
    typographyCategories.map((category) => {
      const candidate = value?.[category.id];
      const fallback = defaultTypographyPreferences[category.id];
      const size = Number.isFinite(candidate) ? Number(candidate) : fallback;
      return [category.id, Math.min(category.max, Math.max(category.min, Math.round(size)))];
    })
  ) as TypographyPreferences;
}

export function loadTypographyPreferences(actorId: string): TypographyPreferences {
  try {
    const stored = globalThis.localStorage?.getItem(getTypographyStorageKey(actorId));
    if (stored === null || stored === undefined) {
      return { ...defaultTypographyPreferences };
    }
    return normalizeTypographyPreferences(JSON.parse(stored) as Partial<TypographyPreferences>);
  } catch {
    return { ...defaultTypographyPreferences };
  }
}

export function saveTypographyPreferences(
  actorId: string,
  preferences: TypographyPreferences
): TypographyPreferences {
  const normalized = normalizeTypographyPreferences(preferences);
  try {
    globalThis.localStorage?.setItem(getTypographyStorageKey(actorId), JSON.stringify(normalized));
  } catch {
    // The preferences still apply for this session in locked-down browsers.
  }
  return normalized;
}

export function applyTypographyPreferences(
  preferences: TypographyPreferences,
  root: HTMLElement | undefined = globalThis.document?.documentElement
) {
  if (root === undefined) {
    return;
  }
  const normalized = normalizeTypographyPreferences(preferences);
  root.dataset.testhistoryTypography = "enabled";
  for (const category of typographyCategories) {
    root.style.setProperty(`--th-font-${category.id}`, `${normalized[category.id]}px`);
  }
}

export function getTypographyStorageKey(actorId: string) {
  return `${storagePrefix}.${encodeURIComponent(actorId.trim() || "anonymous")}`;
}
