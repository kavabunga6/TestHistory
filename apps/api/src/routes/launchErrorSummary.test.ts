import type { NormalizedTestResult } from "@testhistory/contracts";
import type { FastifyInstance } from "fastify";
import { afterEach, expect, it } from "vitest";
import { createApiApp } from "../app.js";
import { createProject, createProjectLaunch } from "../appTestHelpers.js";
import { createAppStore } from "../store.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

it("groups errors across the complete launch and bounds visible examples", async () => {
  const store = createAppStore();
  app = await createApiApp(store);
  const project = await createProject(app);
  const launch = await createProjectLaunch(app, project.id, "Error summary launch");
  const results = [
    ...Array.from({ length: 25 }, (_, index) => result(`passed-${index}`, "passed")),
    ...Array.from({ length: 12 }, (_, index) =>
      result(`failed-${index}`, "failed", "AssertionError: payment not visible")
    ),
    ...Array.from({ length: 3 }, (_, index) =>
      result(`broken-${index}`, "broken", "TimeoutException: backend unavailable")
    )
  ];
  store.launches.get(launch.id)!.results.push(...results);

  const response = await app.inject({
    method: "GET",
    url: `/api/v1/launches/${launch.id}/errors/summary`
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    kind: "launch-error-summary",
    launchId: launch.id,
    projectId: project.id,
    totalResults: 40,
    failedResults: 12,
    brokenResults: 3,
    totalGroups: 2,
    groupsTruncated: false,
    groups: [
      {
        name: "AssertionError",
        failed: 12,
        broken: 0,
        resultsTruncated: true,
        examples: Array.from({ length: 10 }, (_, index) => ({
          resultUuid: `failed-${index}`,
          name: `failed-${index}`,
          status: "failed"
        }))
      },
      {
        name: "TimeoutException",
        failed: 0,
        broken: 3,
        resultsTruncated: false,
        examples: Array.from({ length: 3 }, (_, index) => ({
          resultUuid: `broken-${index}`,
          name: `broken-${index}`,
          status: "broken"
        }))
      }
    ]
  });
  expect(app.swagger().paths?.["/api/v1/launches/{launchId}/errors/summary"]?.get).toBeDefined();
});

function result(
  uuid: string,
  status: NormalizedTestResult["status"],
  message?: string
): NormalizedTestResult {
  return {
    uuid,
    name: uuid,
    status,
    labels: {},
    parameters: [],
    attachments: [],
    steps: [],
    raw: {
      uuid,
      name: uuid,
      status,
      ...(message === undefined ? {} : { statusDetails: { message } })
    }
  };
}
