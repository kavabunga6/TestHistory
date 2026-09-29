// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  loadEnterpriseAccess,
  rotateScimToken,
  type EnterpriseAccessRead
} from "../enterpriseAccessApi.js";
import { EnterpriseAccessPanel } from "./ProjectSettingsEnterpriseAccess.js";

vi.mock("../enterpriseAccessApi.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../enterpriseAccessApi.js")>();
  return { ...actual, loadEnterpriseAccess: vi.fn(), rotateScimToken: vi.fn() };
});

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
  vi.mocked(loadEnterpriseAccess).mockReset();
  vi.mocked(rotateScimToken).mockReset();
});

it("does not show a late enterprise-access read from a previous project", async () => {
  const oldRead = deferred<EnterpriseAccessRead>();
  vi.mocked(loadEnterpriseAccess).mockImplementation((projectId) =>
    projectId === "project-a" ? oldRead.promise : Promise.resolve(enterpriseRead("project-b"))
  );

  await act(async () => root.render(<EnterpriseAccessPanel canEdit projectId="project-a" />));
  await act(async () => root.render(<EnterpriseAccessPanel canEdit projectId="project-b" />));
  expect(container.textContent).toContain("Provider project-b");

  await act(async () => oldRead.resolve(enterpriseRead("project-a")));
  expect(container.textContent).toContain("Provider project-b");
  expect(container.textContent).not.toContain("Provider project-a");
});

it("does not reveal a previous project's one-time SCIM secret after switching projects", async () => {
  const oldRotation = deferred<Awaited<ReturnType<typeof rotateScimToken>>>();
  vi.mocked(loadEnterpriseAccess).mockImplementation((projectId) =>
    Promise.resolve(enterpriseRead(projectId))
  );
  vi.mocked(rotateScimToken).mockReturnValue(oldRotation.promise);

  await act(async () => root.render(<EnterpriseAccessPanel canEdit projectId="project-a" />));
  const rotateButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.includes("Создать токен")
  );
  expect(rotateButton).toBeDefined();
  await act(async () => {
    rotateButton?.click();
    rotateButton?.click();
  });
  expect(rotateScimToken).toHaveBeenCalledWith("project-a", "viewer");
  expect(rotateScimToken).toHaveBeenCalledTimes(1);

  await act(async () => root.render(<EnterpriseAccessPanel canEdit projectId="project-b" />));
  await act(async () =>
    oldRotation.resolve({ secret: "secret-from-project-a", endpoint: "", provisioning: undefined })
  );

  expect(container.textContent).toContain("Provider project-b");
  expect(container.textContent).not.toContain("secret-from-project-a");
  expect(loadEnterpriseAccess).toHaveBeenCalledTimes(2);
});

function enterpriseRead(projectId: string): EnterpriseAccessRead {
  return {
    kind: "enterprise-access",
    projectId,
    oidcProviders: [
      {
        id: `provider-${projectId}`,
        name: `Provider ${projectId}`,
        issuer: `https://${projectId}.example.test`,
        clientId: projectId,
        clientSecretEnvVar: "TEST_SECRET",
        scopes: [],
        defaultRole: "viewer",
        enabled: true,
        updatedAt: "2026-09-29T00:00:00Z"
      }
    ],
    scimUsers: 0
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
