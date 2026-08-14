// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DashboardReferenceScreen } from "./DashboardReferenceScreen.js";
import { dashboardWidgetStorageKey } from "./DashboardReferenceModel.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("DashboardReferenceScreen dialogs", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.setItem(dashboardWidgetStorageKey, "[]");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root.render(<DashboardReferenceScreen />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.style.overflow = "";
    window.localStorage.clear();
  });

  it("traps focus, closes on Escape and returns focus to the opener", async () => {
    const opener = getButton("Добавить виджет");
    opener.focus();

    await click(opener);
    await flushDialogFocus();

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement?.classList.contains("dashboard-reference-type-card")).toBe(true);

    const cancel = getButton("Отмена");
    cancel.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Закрыть диалог виджета");

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps the form body and actions in separate dialog regions", async () => {
    await click(getButton("Добавить виджет"));
    await flushDialogFocus();
    const firstType = document.querySelector<HTMLButtonElement>(".dashboard-reference-type-card");
    expect(firstType).not.toBeNull();
    await click(firstType!);
    await flushDialogFocus();

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.querySelector(".dashboard-reference-modal-body")).not.toBeNull();
    expect(dialog?.querySelector(".dashboard-reference-modal-footer")).not.toBeNull();
    expect(dialog?.textContent).toContain("Настроить виджет");
    expect(document.activeElement).toBe(dialog?.querySelector('input[type="text"]'));
  });

  function getButton(text: string) {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (candidate) => candidate.textContent?.includes(text)
    );
    expect(button).not.toBeUndefined();
    return button!;
  }

  async function click(button: HTMLButtonElement) {
    await act(async () => {
      button.click();
    });
  }

  async function flushDialogFocus() {
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }
});
