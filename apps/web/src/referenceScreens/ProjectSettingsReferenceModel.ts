import {
  Database,
  Eye,
  KeyRound,
  Link2,
  ShieldCheck,
  SlidersHorizontal,
  Users
} from "lucide-react";

import {
  demoProjectSettings,
  type ApiTokenScope,
  type IntegrationLinkProvider,
  type ProjectMember,
  type ProjectSettings
} from "../projectSettings.js";

export type SettingsTab =
  "access" | "tokens" | "visibility" | "integrations" | "retention" | "fields";
export type ApiStatus = "error" | "loading" | "ready";

export type TokenDraft = {
  name: string;
  owner: string;
  expiresAt: string;
  scopes: ApiTokenScope[];
};

export const tabs: Array<{ id: SettingsTab; label: string; icon: typeof ShieldCheck }> = [
  { id: "access", label: "Доступ", icon: Users },
  { id: "tokens", label: "API токены", icon: KeyRound },
  { id: "visibility", label: "Видимость", icon: Eye },
  { id: "integrations", label: "Интеграции", icon: Link2 },
  { id: "retention", label: "Хранение", icon: Database },
  { id: "fields", label: "Поля", icon: SlidersHorizontal }
];

export function parseSettingsTab(value: string | undefined): SettingsTab {
  return tabs.some((tab) => tab.id === value) ? (value as SettingsTab) : "access";
}

export const visibilityLabels: Record<ProjectSettings["project"]["visibility"], string> = {
  internal: "Внутренний",
  private: "Закрытый",
  "public-demo": "Публичная демоверсия"
};

export const memberSourceLabels: Record<ProjectMember["source"], string> = {
  manual: "Вручную",
  scim: "SCIM",
  sso: "SSO",
  token: "Токен"
};

export function getProviderLinkTemplate(provider: IntegrationLinkProvider): string {
  return `${provider.baseUrl}${provider.suffixTemplate}`;
}

export function patchProviderLinkTemplate(
  template: string
): Pick<IntegrationLinkProvider, "baseUrl" | "suffixTemplate"> {
  const markerIndex = template.indexOf("{value}");
  if (markerIndex === -1) {
    return {
      baseUrl: template,
      suffixTemplate: "{value}"
    };
  }

  return {
    baseUrl: template.slice(0, markerIndex),
    suffixTemplate: template.slice(markerIndex)
  };
}

export const defaultTokenDraft: TokenDraft = {
  expiresAt: "через 90 дней",
  name: "Новый API токен",
  owner: demoProjectSettings.members[0]?.name ?? "Владелец проекта",
  scopes: ["launches:write", "results:write"]
};
