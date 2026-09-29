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

  it("moves between login and registration tabs with the keyboard", () => {
    act(() => root.render(<AuthPanel />));

    const login = container.querySelector<HTMLButtonElement>("#auth-login-tab");
    const register = container.querySelector<HTMLButtonElement>("#auth-register-tab");
    const panel = container.querySelector<HTMLFormElement>("#auth-form-panel");
    expect(login?.tabIndex).toBe(0);
    expect(register?.tabIndex).toBe(-1);
    expect(panel?.getAttribute("aria-labelledby")).toBe("auth-login-tab");

    act(() => {
      login?.focus();
      login?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(document.activeElement).toBe(register);
    expect(register?.tabIndex).toBe(0);
    expect(login?.tabIndex).toBe(-1);
    expect(panel?.getAttribute("aria-labelledby")).toBe("auth-register-tab");
    expect(container.querySelector("#auth-name")).not.toBeNull();

    act(() => {
      register?.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    });
    expect(document.activeElement).toBe(login);
    expect(container.querySelector("#auth-name")).toBeNull();
  });
});
