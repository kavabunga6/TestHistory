// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { ResultIdCopy } from "./ResultIdCopy.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

afterEach(() => {
  if (originalClipboard) {
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
});

it("shows and copies the exact result UUID", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText }
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => root.render(<ResultIdCopy resultId="result-uuid-1" />));
  expect(container.textContent).toContain("ID результата: result-uuid-1");
  await act(async () => container.querySelector<HTMLButtonElement>("button")?.click());
  expect(writeText).toHaveBeenCalledWith("result-uuid-1");
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Скопировано");

  await act(async () => root.unmount());
  container.remove();
});
