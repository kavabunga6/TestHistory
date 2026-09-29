// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { demoProjectSettings } from "../projectSettings.js";
import { IntegrationsTab } from "./ProjectSettingsIntegrationsTab.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("opens a blank add dialog and requires a valid link template", async () => {
  await act(async () =>
    root.render(<IntegrationsTab canEdit settings={demoProjectSettings} onSave={vi.fn()} />)
  );
  await act(async () => findButton("Добавить")?.click());

  const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
  expect(dialog?.querySelector("h2")?.textContent).toBe("Добавление интеграции");
  expect(findInput(dialog, "Название")?.value).toBe("");
  expect(findInput(dialog, "Имя источника")?.value).toBe("");
  expect(findInput(dialog, "Шаблон ссылки")?.value).toBe("");
  expect(findInput(dialog, "Пример значения")?.value).toBe("");
  expect(dialog?.textContent).not.toContain("Укажите название интеграции.");
  await act(async () => findButton("Добавить", dialog)?.click());
  expect(dialog?.textContent).toContain("Укажите название интеграции.");

  await act(async () => {
    changeInput(findInput(dialog, "Название"), "Мой трекер");
    changeInput(findInput(dialog, "Имя источника"), "ISSUE_KEY");
    changeInput(findInput(dialog, "Шаблон ссылки"), "https://tracker.example/browse/{value}");
  });
  expect(dialog?.textContent).not.toContain("Укажите название интеграции.");

  await act(async () => {
    changeInput(findInput(dialog, "Шаблон ссылки"), "http://tracker.example/browse/{value}");
  });
  await act(async () => findButton("Добавить", dialog)?.click());
  expect(dialog?.textContent).toContain("Используйте адрес HTTPS");
});

it("keeps the source kind when editing an existing provider", async () => {
  const onSave = vi.fn();
  await act(async () =>
    root.render(<IntegrationsTab canEdit settings={demoProjectSettings} onSave={onSave} />)
  );
  await act(async () => findButton("Редактировать интеграцию Дефекты Jira")?.click());

  const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
  expect(dialog?.querySelector("h2")?.textContent).toBe("Редактирование интеграции");
  expect(dialog?.querySelector<HTMLSelectElement>("select")?.value).toBe("issue");
  await act(async () => changeInput(findInput(dialog, "Имя источника"), "ticket"));
  await act(async () => findButton("Сохранить", dialog)?.click());

  const saved = onSave.mock.calls[0]?.[0];
  expect(
    saved.integrationProviders.find((provider: { id: string }) => provider.id === "jira-defects")
      .source
  ).toMatchObject({
    kind: "issue",
    matchMode: "all",
    name: "ticket"
  });
});

function findButton(
  label: string,
  within: HTMLElement | null = container
): HTMLButtonElement | undefined {
  if (!within) throw new Error("Dialog is missing");
  return Array.from(within.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === label || button.getAttribute("aria-label") === label
  );
}

function findInput(within: HTMLElement | null, label: string): HTMLInputElement | undefined {
  return (
    Array.from(within?.querySelectorAll("label") ?? [])
      .find((item) => item.textContent?.startsWith(label))
      ?.querySelector("input") ?? undefined
  );
}

function changeInput(input: HTMLInputElement | undefined, value: string): void {
  if (!input) throw new Error("Input is missing");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
