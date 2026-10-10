// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    vi.unstubAllGlobals();
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

  it("explains a rejected login without exposing the endpoint or status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("InternalException", { status: 401 }))
    );
    await act(async () => {
      root.render(<AuthPanel />);
    });

    await submitForm(container);

    const feedback = container.querySelector<HTMLElement>(".auth-login__feedback");
    expect(feedback?.textContent).toContain("Проверьте данные для входа");
    expect(feedback?.getAttribute("role")).toBe("alert");
    expect(feedback?.textContent).not.toMatch(/\/api\/|401|InternalException|returned/);
  });

  it("gives a recovery action for a duplicate registration without server details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("DuplicateKeyError", { status: 409 }))
    );
    await act(async () => {
      root.render(<AuthPanel />);
    });
    act(() => container.querySelector<HTMLButtonElement>("#auth-register-tab")?.click());

    await submitForm(container);

    const feedback = container.querySelector<HTMLElement>(".auth-login__feedback");
    expect(feedback?.textContent).toContain("Войдите или укажите другой email");
    expect(feedback?.textContent).not.toMatch(/\/api\/|409|DuplicateKeyError/);
  });

  it("hides network exception text and explains how to retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("TypeError: /api/v1/auth/login failed"))
    );
    await act(async () => {
      root.render(<AuthPanel />);
    });

    await submitForm(container);

    const feedback = container.querySelector<HTMLElement>(".auth-login__feedback");
    expect(feedback?.textContent).toContain("Проверьте подключение и попробуйте ещё раз");
    expect(feedback?.textContent).not.toMatch(/\/api\/|TypeError/);
  });
});

async function submitForm(container: HTMLElement): Promise<void> {
  await act(async () => {
    container
      .querySelector<HTMLFormElement>("#auth-form-panel")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
