import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProjectSettingsApiToken,
  getProjectSettingsAccess,
  loadProjectSettingsFromApi,
  revokeProjectSettingsApiToken,
  saveProjectArtifactSettings
} from "./projectSettings.js";

const project = { id: "project-1", key: "PRJ", name: "Project" };
const artifactSettings = {
  kind: "project-artifact-settings",
  projectId: "project-1",
  retention: {
    attachmentRetentionDays: 14,
    cleanupGraceDays: 3,
    compressRetainedTextArtifacts: true,
    deleteBinaryArtifactsAfterRetention: true,
    retentionPolicies: [
      {
        artifact: "Скриншоты",
        failedDays: 90,
        id: "screenshots",
        maxSizeMb: 25,
        passedDays: 14,
        quarantinedDays: 120
      }
    ],
    updatedAt: "2026-06-03T00:00:00.000Z"
  }
};
const accessSettings = {
  apiTokens: [],
  customFieldMappings: [],
  integrationProviders: [],
  kind: "project-access-settings",
  memberships: [
    {
      createdAt: "2026-06-03T00:00:00.000Z",
      displayName: "Project Owner",
      id: "owner",
      role: "owner",
      source: "manual",
      status: "active",
      subject: "project-owner",
      updatedAt: "2026-06-03T00:00:00.000Z"
    },
    {
      createdAt: "2026-06-03T00:00:00.000Z",
      displayName: "Release Maintainer",
      id: "maintainer",
      role: "maintainer",
      source: "manual",
      status: "active",
      subject: "release-maintainer",
      updatedAt: "2026-06-03T00:00:00.000Z"
    },
    {
      createdAt: "2026-06-03T00:00:00.000Z",
      displayName: "Audit Viewer",
      id: "viewer",
      role: "viewer",
      source: "manual",
      status: "active",
      subject: "audit-viewer",
      updatedAt: "2026-06-03T00:00:00.000Z"
    }
  ],
  project: { ...project, visibility: "private" },
  schemaVersion: 1,
  updatedAt: "2026-06-03T00:00:00.000Z",
  visibilityPolicies: []
};

describe("project settings API helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses a project owner actor by default for membership-enforced settings reads", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input) === "/api/v1/projects") {
        return jsonResponse([project]);
      }
      if (String(input) === "/api/v1/projects/project-1/settings/artifacts") {
        expect(headerValue(init, "x-testhistory-actor-id")).toBe("project-owner");
        expect(headerValue(init, "x-testhistory-project-scope")).toBe("project-1");
        expect(headerValue(init, "x-testhistory-scopes")).toBe("settings:read");
        return jsonResponse(artifactSettings);
      }

      expect(String(input)).toBe("/api/v1/projects/project-1/settings/access");
      expect(headerValue(init, "x-testhistory-actor-id")).toBe("project-owner");
      expect(headerValue(init, "x-testhistory-project-scope")).toBe("project-1");
      expect(headerValue(init, "x-testhistory-scopes")).toBe("settings:read");
      return jsonResponse(accessSettings);
    });

    const settings = await loadProjectSettingsFromApi();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(settings.project.id).toBe("project-1");
    expect(settings.members[0]?.role).toBe("owner");
  });

  it("loads settings for the selected project without choosing the first project", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input) === "/api/v1/projects/project-2/settings/access") {
        return jsonResponse({
          ...accessSettings,
          project: { id: "project-2", key: "P2", name: "Second", visibility: "private" }
        });
      }
      if (String(input) === "/api/v1/projects/project-2/settings/artifacts") {
        return jsonResponse({ ...artifactSettings, projectId: "project-2" });
      }
      return jsonResponse({ message: "Unexpected project" }, 404);
    });

    const settings = await loadProjectSettingsFromApi("project-2");

    expect(settings.project.id).toBe("project-2");
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      "/api/v1/projects/project-2/settings/access",
      "/api/v1/projects/project-2/settings/artifacts"
    ]);
  });

  it("does not create a project as a side effect of an empty settings read", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([]));

    await expect(loadProjectSettingsFromApi()).rejects.toThrow(
      "Нет доступных проектов. Сначала создайте проект."
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/projects", undefined);
  });

  it("uses the configured actor id and does not fabricate tokens when the API denies writes", async () => {
    vi.stubGlobal(
      "localStorage",
      fakeLocalStorage({ "testhistory.actorId": "release-maintainer" })
    );
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      expect(String(input)).toBe("/api/v1/projects/project-1/settings/access/tokens");
      expect(headerValue(init, "x-testhistory-actor-id")).toBe("release-maintainer");
      expect(headerValue(init, "x-testhistory-scopes")).toBe("settings:write");
      return jsonResponse(
        {
          error: "PermissionDeniedError",
          message: "Actor role is not allowed to manage project settings",
          projectId: "project-1",
          redacted: true,
          requiredRoles: ["owner"],
          requiredScopes: ["settings:write"]
        },
        403
      );
    });

    await expect(
      createProjectSettingsApiToken({
        expiresAt: "через 90 дней",
        name: "Denied token",
        ownerSubject: "release-maintainer",
        projectId: "project-1",
        scopes: ["settings:read"]
      })
    ).rejects.toThrow("/api/v1/projects/project-1/settings/access/tokens returned 403");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not hide revoke failures behind local token mutation", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ message: "denied", redacted: true }, 403));

    await expect(revokeProjectSettingsApiToken("project-1", "token-1")).rejects.toThrow(
      "/api/v1/projects/project-1/settings/access/tokens/token-1 returned 403"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("saves editable artifact-type retention policies with artifact settings", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      expect(String(input)).toBe("/api/v1/projects/project-1/settings/artifacts");
      expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body))).toEqual(
        expect.objectContaining({
          retentionPolicies: [
            expect.objectContaining({
              artifact: "Скриншоты",
              failedDays: 91,
              id: "screenshots",
              maxSizeMb: 30,
              passedDays: 15,
              quarantinedDays: 121
            })
          ]
        })
      );
      return jsonResponse({
        ...artifactSettings,
        retention: JSON.parse(String(init?.body))
      });
    });

    const saved = await saveProjectArtifactSettings("project-1", {
      attachmentRetentionDays: 14,
      cleanupGraceDays: 3,
      compressRetainedTextArtifacts: true,
      deleteBinaryArtifactsAfterRetention: true,
      retentionPolicies: [
        {
          artifact: "Скриншоты",
          failedDays: 91,
          id: "screenshots",
          maxSizeMb: 30,
          passedDays: 15,
          quarantinedDays: 121
        }
      ]
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(saved.retentionPolicies[0]).toEqual(
      expect.objectContaining({ failedDays: 91, maxSizeMb: 30 })
    );
  });

  it("derives role-aware settings access from active memberships", () => {
    const settings = {
      ...accessSettings,
      apiTokens: [],
      artifactRetention: artifactSettings.retention,
      members: [
        {
          email: "project-owner",
          id: "owner",
          lastActive: "now",
          name: "Project Owner",
          role: "owner" as const,
          source: "manual" as const,
          status: "active" as const
        },
        {
          email: "release-maintainer",
          id: "maintainer",
          lastActive: "now",
          name: "Release Maintainer",
          role: "maintainer" as const,
          source: "manual" as const,
          status: "active" as const
        },
        {
          email: "audit-viewer",
          id: "viewer",
          lastActive: "now",
          name: "Audit Viewer",
          role: "viewer" as const,
          source: "manual" as const,
          status: "active" as const
        }
      ],
      owners: ["Project Owner"],
      project: { ...project, visibility: "private" as const },
      retentionPolicies: []
    };

    expect(getProjectSettingsAccess(settings, "project-owner")).toEqual(
      expect.objectContaining({
        canManageTokens: true,
        canReadSettings: true,
        canWriteSettings: true,
        role: "owner",
        state: "write"
      })
    );
    expect(getProjectSettingsAccess(settings, "release-maintainer")).toEqual(
      expect.objectContaining({
        canManageTokens: false,
        canReadSettings: true,
        canWriteSettings: false,
        role: "maintainer",
        state: "read-only"
      })
    );
    expect(getProjectSettingsAccess(settings, "audit-viewer")).toEqual(
      expect.objectContaining({
        canManageTokens: false,
        canReadSettings: false,
        canWriteSettings: false,
        role: "viewer",
        state: "denied"
      })
    );
  });

  it("keeps the reference screen free of silent demo API fallbacks", () => {
    const source = readFileSync(
      new URL("./referenceScreens/ProjectSettingsReferenceScreen.tsx", import.meta.url),
      "utf8"
    );

    expect(source).not.toContain('setApiStatus("demo")');
    expect(source).not.toContain("Math.random()");
    expect(source).toContain('setApiStatus("error")');
    expect(source).toContain("getProjectSettingsAccess");
    expect(source).toContain("settingsAccess.canManageTokens");
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status
  });
}

function headerValue(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

function fakeLocalStorage(initial: Record<string, string>): Storage {
  const store = new Map(Object.entries(initial));

  return {
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    }
  };
}
