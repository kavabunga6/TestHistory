import type { NormalizedTestResult } from "@testhistory/contracts";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createApiApp } from "../app.js";
import { createProject, createProjectLaunch } from "../appTestHelpers.js";
import { createAppStore } from "../store.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("launch result search before pagination", () => {
  it("searches labels and THQL across the entire launch, then paginates matches", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const launch = await createProjectLaunch(app, project.id, "Search launch");
    const results = Array.from({ length: 120 }, (_, index) =>
      result({ uuid: `result-${index.toString().padStart(3, "0")}`, name: `Case ${index}` })
    );
    results[80] = result({
      uuid: "result-080",
      name: "Checkout one",
      status: "failed",
      labels: { tag: ["checkout"], issue: ["BUG-80"], owner: ["Team Blue"] },
      parameters: [{ name: "apiToken", value: "do-not-search", mode: "masked" }]
    });
    results[95] = result({
      uuid: "result-095",
      name: "Checkout two",
      status: "broken",
      labels: { tag: ["checkout"], issue: ["BUG-95"] }
    });
    results[105] = result({
      uuid: "result-105",
      name: "Other feature",
      status: "skipped",
      labels: { tag: ["other"] }
    });
    results[110] = result({
      uuid: "result-110",
      name: "Login [Firefox] or Chrome"
    });
    results[111] = result({
      uuid: "result-111",
      name: "Unknown outcome",
      status: "unknown"
    });
    results[112] = result({
      uuid: "result-112",
      name: "Config=on"
    });
    store.launches.get(launch.id)!.results.push(...results);

    const get = async (query: string) => {
      const response = await app!.inject({
        method: "GET",
        url: `/api/v1/launches/${launch.id}/results?${query}`
      });
      expect(response.statusCode).toBe(200);
      return response.json<{
        page: { total: number; nextCursor: string | null };
        items: Array<{ uuid: string }>;
      }>();
    };

    const first = await get(
      `limit=1&q=${encodeURIComponent('status in ["failed", "broken"] and tag = "checkout"')}`
    );
    expect(first.page).toEqual(expect.objectContaining({ total: 2, nextCursor: "1" }));
    expect(first.items.map((item) => item.uuid)).toEqual(["result-080"]);
    const second = await get(
      `limit=1&cursor=1&q=${encodeURIComponent('status in ["failed", "broken"] and tag = "checkout"')}`
    );
    expect(second.items.map((item) => item.uuid)).toEqual(["result-095"]);
    expect(second.page.nextCursor).toBeNull();

    expect((await get("q=BUG-80")).items.map((item) => item.uuid)).toEqual(["result-080"]);
    expect((await get(`q=${encodeURIComponent('label["owner"] = "Team Blue"')}`)).page.total).toBe(
      1
    );
    expect(
      (await get(`q=${encodeURIComponent('parameter["apiToken"] = "do-not-search"')}`)).page.total
    ).toBe(0);
    expect(
      (await get(`q=${encodeURIComponent("Пропущен")}`)).items.map((item) => item.uuid)
    ).toEqual(["result-105"]);
    expect((await get(`q=${encodeURIComponent("status in [")}`)).page.total).toBe(0);
    expect(
      (await get(`q=${encodeURIComponent("Login [Firefox] or Chrome")}`)).items.map(
        (item) => item.uuid
      )
    ).toEqual(["result-110"]);
    expect(
      (await get(`q=${encodeURIComponent("Config=on")}`)).items.map((item) => item.uuid)
    ).toEqual(["result-112"]);
    expect((await get(`q=${encodeURIComponent('status = "unknown"')}`)).items).toEqual([
      expect.objectContaining({ uuid: "result-111" })
    ]);
    const combinedStatuses = await get("status=broken,unknown&limit=1");
    expect(combinedStatuses.page).toEqual(expect.objectContaining({ total: 2, nextCursor: "1" }));
    expect(combinedStatuses.items.map((item) => item.uuid)).toEqual(["result-095"]);
    expect((await get("status=broken,unknown&limit=1&cursor=1")).items).toEqual([
      expect.objectContaining({ uuid: "result-111" })
    ]);
    expect((await get("status=broken")).items).toEqual([
      expect.objectContaining({ uuid: "result-095" })
    ]);
    for (const invalidStatus of ["broken,invalid", "broken,,unknown"]) {
      const invalid = await app!.inject({
        method: "GET",
        url: `/api/v1/launches/${launch.id}/results?status=${invalidStatus}`
      });
      expect(invalid.statusCode).toBe(400);
    }
    await app!.ready();
    const openapi = app!.swagger() as {
      paths: Record<string, { get?: { parameters?: Array<{ name: string; schema?: unknown }> } }>;
    };
    expect(openapi.paths["/api/v1/launches/{launchId}/results"]?.get?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "status",
          schema: expect.objectContaining({ pattern: expect.stringContaining("broken") })
        })
      ])
    );
  });

  it("filters active quarantine as muted without changing the underlying result status", async () => {
    const store = createAppStore();
    app = await createApiApp(store);
    const project = await createProject(app);
    const launch = await createProjectLaunch(app, project.id, "Quarantine launch");
    store.launches
      .get(launch.id)!
      .results.push(
        result({ uuid: "active", name: "Active failure", status: "failed" }),
        result({ uuid: "ordinary", name: "Ordinary pass", status: "passed" })
      );
    const quarantine = await app.inject({
      method: "POST",
      url: `/api/v1/launches/${launch.id}/results/active/quarantine`,
      payload: { reason: "Known failure" }
    });
    expect(quarantine.statusCode).toBe(201);

    for (const query of ["status=muted", `q=${encodeURIComponent("muted = true")}`]) {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/launches/${launch.id}/results?${query}&limit=25`
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(
        expect.objectContaining({
          page: expect.objectContaining({ total: 1 }),
          items: [expect.objectContaining({ uuid: "active", status: "failed" })]
        })
      );
    }
  });
});

function result(input: {
  uuid: string;
  name: string;
  status?: NormalizedTestResult["status"];
  labels?: Record<string, string[]>;
  parameters?: NormalizedTestResult["parameters"];
}): NormalizedTestResult {
  const status = input.status ?? "passed";
  return {
    uuid: input.uuid,
    name: input.name,
    status,
    labels: input.labels ?? {},
    parameters: input.parameters ?? [],
    attachments: [],
    steps: [],
    raw: { uuid: input.uuid, name: input.name, status }
  };
}
