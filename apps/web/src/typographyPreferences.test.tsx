import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TypographySettingsDialog } from "./TypographySettingsDialog.js";
import {
  defaultTypographyPreferences,
  getTypographyStorageKey,
  loadTypographyPreferences,
  normalizeTypographyPreferences,
  saveTypographyPreferences
} from "./typographyPreferences.js";

const originalLocalStorage = globalThis.localStorage;

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value)
    }
  });
});

afterEach(() => {
  if (originalLocalStorage === undefined) {
    Reflect.deleteProperty(globalThis, "localStorage");
    return;
  }
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: originalLocalStorage
  });
});

describe("typography preferences", () => {
  it("normalizes every category to its supported range", () => {
    expect(
      normalizeTypographyPreferences({ title: 100, heading: 13, body: 15.4, meta: -2 })
    ).toEqual({ title: 32, heading: 13, body: 15, meta: 8 });
  });

  it("uses the same 8 to 32 pixel range for every text category", () => {
    expect(normalizeTypographyPreferences({ title: 1, heading: 1, body: 1, meta: 1 })).toEqual({
      title: 8,
      heading: 8,
      body: 8,
      meta: 8
    });
    expect(normalizeTypographyPreferences({ title: 99, heading: 99, body: 99, meta: 99 })).toEqual({
      title: 32,
      heading: 32,
      body: 32,
      meta: 32
    });
  });

  it("stores settings separately for each actor", () => {
    saveTypographyPreferences("admin", { title: 27, heading: 18, body: 16, meta: 13 });

    expect(loadTypographyPreferences("admin")).toEqual({
      title: 27,
      heading: 18,
      body: 16,
      meta: 13
    });
    expect(loadTypographyPreferences("other-user")).toEqual(defaultTypographyPreferences);
    expect(getTypographyStorageKey("admin")).not.toBe(getTypographyStorageKey("other-user"));
  });

  it("renders four controls and a live example for every text category", () => {
    const html = renderToStaticMarkup(
      React.createElement(TypographySettingsDialog, {
        onCancel: () => undefined,
        onPreview: () => undefined,
        onSave: () => undefined,
        open: true,
        value: defaultTypographyPreferences
      })
    );

    expect(html.match(/type="range"/g)).toHaveLength(4);
    expect(html.match(/min="8"/g)).toHaveLength(4);
    expect(html.match(/max="32"/g)).toHaveLength(4);
    expect(html).toContain("Заголовки экранов");
    expect(html).toContain("Заголовки разделов");
    expect(html).toContain("Основной текст");
    expect(html).toContain("Вспомогательный текст");
    expect(html).toContain("Оформление заказа");
    expect(html).toContain("Проверить форму авторизации");
    expect(html).toContain("Открыть результат");
    expect(html).toContain("typography-preview__tab typography-role-heading");
    expect(html).not.toContain("typography-preview__tab typography-role-body");
  });

  it("scales text-dependent geometry while leaving icon-only controls fixed", () => {
    const typographyStyles = readFileSync(new URL("./typography.css", import.meta.url), "utf8");
    const launchesStyles = readFileSync(
      new URL("./referenceScreens/LaunchesReferenceScreen.css", import.meta.url),
      "utf8"
    );
    const settingsStyles = readFileSync(
      new URL("./referenceScreens/ProjectSettingsReferenceScreen.css", import.meta.url),
      "utf8"
    );
    const dialogStyles = readFileSync(
      new URL("./TypographySettingsDialog.css", import.meta.url),
      "utf8"
    );

    expect(typographyStyles).toContain("--th-font-body-delta");
    expect(typographyStyles).toContain(".launches-reference-overview-donut-center strong");
    expect(typographyStyles).toContain('[class*="__count"]');
    expect(typographyStyles).toContain(".launches-reference-result-tabs");
    expect(typographyStyles).toContain(".auth-login__switch");
    expect(typographyStyles).toContain("font-size: var(--th-font-heading) !important;");
    expect(typographyStyles).toContain("font-size: var(--th-font-body) !important;");
    expect(typographyStyles).toContain(":is(button, input, select, textarea)");
    expect(typographyStyles).toContain("button:not(:has(> svg:only-child))");
    expect(launchesStyles).not.toContain("@keyframes launches-reference-donut-reveal");
    expect(launchesStyles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(launchesStyles).toContain(
      "min-height: calc(70px + var(--th-font-body-delta) + var(--th-font-meta-delta))"
    );
    expect(settingsStyles).toContain("min-height: calc(42px + var(--th-font-heading-delta))");
    expect(settingsStyles).toContain(".project-settings__icon-button {\n  width: 36px;");
    expect(dialogStyles).toContain("min-height: calc(var(--th-font-title) + 54px)");
  });
});
