import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

import { demoProjectSettings } from "../projectSettings.js";
import { projectTokenValidity, TokensTab } from "./ProjectSettingsTokensTab.js";

afterEach(() => vi.useRealTimers());

it("marks an expired project token as expired and disables revocation", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-29T00:00:00Z"));
  const token = {
    ...demoProjectSettings.apiTokens[0]!,
    expiresAt: "2026-09-03T13:10:00Z"
  };

  expect(projectTokenValidity(token)).toMatchObject({ status: "expired", label: "Истёк" });

  const markup = renderToStaticMarkup(
    <TokensTab
      access={{
        actorId: "admin",
        canManageTokens: true,
        canReadSettings: true,
        canWriteSettings: true,
        state: "write"
      }}
      createdSecret={undefined}
      disabled={false}
      onCopySecret={() => undefined}
      onCreatePersonal={() => undefined}
      onOpenCreate={() => undefined}
      onPersonalTokenNameChange={() => undefined}
      onRevoke={() => undefined}
      onRevokePersonal={() => undefined}
      personalTokenName=""
      personalTokenSecret={undefined}
      personalTokens={[]}
      tokens={[token]}
    />
  );

  expect(markup).toContain("Истёк");
  expect(markup).toContain("03.09.2026");
  expect(markup).toMatch(/aria-label="Отозвать токен Загрузка регрессии"[^>]*disabled/);
  expect(markup).not.toContain("project-settings__badge--green");
});
