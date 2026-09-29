// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthPanel } from "./AuthPanel.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AuthPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
  });

  it("starts with empty credentials and can reveal the password without submitting", () => {
    act(() => root.render(<AuthPanel />));

    const email = container.querySelector<HTMLInputElement>("#auth-email");
    const password = container.querySelector<HTMLInputElement>("#auth-password");
    const toggle = container.querySelector<HTMLButtonElement>(".auth-login__password-toggle");

    expect(email?.value).toBe("");
    expect(password?.value).toBe("");
    expect(email?.required).toBe(true);
    expect(password?.required).toBe(true);
    expect(password?.type).toBe("password");
    expect(toggle?.type).toBe("button");
    expect(toggle?.getAttribute("aria-label")).toBe("Показать пароль");

    act(() => toggle?.click());

    expect(password?.type).toBe("text");
    expect(toggle?.getAttribute("aria-label")).toBe("Скрыть пароль");
    expect(toggle?.getAttribute("aria-pressed")).toBe("true");

    act(() =>
      container.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="false"]')?.click()
    );

    expect(container.querySelector<HTMLInputElement>("#auth-password")?.type).toBe("password");
    expect(container.querySelector<HTMLInputElement>("#auth-name")?.value).toBe("");
  });
});
