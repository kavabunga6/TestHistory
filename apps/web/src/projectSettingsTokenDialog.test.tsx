// @vitest-environment jsdom

import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { tokenScopeLabels, type ApiTokenScope } from "./projectSettings.js";
import {
  TokenDialog,
  tokenScopeGroups
} from "./referenceScreens/ProjectSettingsReferenceScreen.js";
import type { TokenDraft } from "./referenceScreens/ProjectSettingsReferenceModel.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("project token scope dialog", () => {
  let container: HTMLDivElement;
  let root: Root;
  let currentDraft: TokenDraft;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("groups every permission once and changes only the selected permission", () => {
    expect(tokenScopeGroups.flatMap((group) => group.scopes).sort()).toEqual(
      Object.keys(tokenScopeLabels).sort()
    );

    function Harness() {
      const [draft, setDraft] = useState<TokenDraft>({
        name: "Проверка",
        owner: "Владелец",
        expiresAt: "через 90 дней",
        scopes: []
      });
      currentDraft = draft;
      return (
        <TokenDialog
          draft={draft}
          members={["Владелец"]}
          onChange={setDraft}
          onClose={() => undefined}
          onCreate={() => undefined}
        />
      );
    }

    act(() => root.render(<Harness />));

    const launchesGroup = Array.from(container.querySelectorAll("fieldset")).find(
      (fieldset) => fieldset.querySelector("legend")?.textContent === "Запуски"
    );
    expect(launchesGroup).toBeDefined();
    expect(launchesGroup?.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(
      container.querySelector<HTMLButtonElement>("footer .project-settings__button--primary")
        ?.disabled
    ).toBe(true);

    const readScope = launchesGroup?.querySelector<HTMLInputElement>(
      'input[aria-label="Запуски: чтение"]'
    );
    const writeScope = launchesGroup?.querySelector<HTMLInputElement>(
      'input[aria-label="Запуски: запись"]'
    );
    expect(readScope).not.toBeNull();
    expect(writeScope).not.toBeNull();

    act(() => readScope?.click());
    expect(currentDraft.scopes).toEqual(["launches:read"] satisfies ApiTokenScope[]);
    expect(writeScope?.checked).toBe(false);
    expect(
      container.querySelector<HTMLButtonElement>("footer .project-settings__button--primary")
        ?.disabled
    ).toBe(false);

    act(() => readScope?.click());
    expect(currentDraft.scopes).toEqual([]);
    expect(
      container.querySelector<HTMLButtonElement>("footer .project-settings__button--primary")
        ?.disabled
    ).toBe(true);
  });
});
