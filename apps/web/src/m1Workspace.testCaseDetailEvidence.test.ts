import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchM1Workspace, workspaceInitialHistoryLimit } from "./m1Workspace.js";
import { jsonResponse, notFoundResponse } from "./m1Workspace.testResponses.js";
import type { ApiTestCaseHistoryPointReadModel } from "./m1WorkspaceApiTypes.js";
import { selectLatestTestCaseResultPoint } from "./m1WorkspaceTestCaseEvidence.js";

const projectId = "project-evidence";
const caseId = "case-checkout";
const launchId = "launch-new";
const resultId = "new-final";
const historyPath = `/api/v1/test-cases/${caseId}/history?projectId=${projectId}&limit=${workspaceInitialHistoryLimit}`;
const resultPath = `/api/v1/launches/${launchId}/results/${resultId}`;

const previousPoint: ApiTestCaseHistoryPointReadModel = {
  launchId: "launch-old",
  launchName: "Previous run",
  launchCreatedAt: "2026-01-01T10:00:00.000Z",
  resultUuid: "old-result",
  testCaseId: caseId,
  status: "failed",
  attemptNumber: 1
};
const firstAttempt: ApiTestCaseHistoryPointReadModel = {
  launchId,
  launchName: "Latest run",
  launchCreatedAt: "2026-01-02T10:00:00.000Z",
  resultUuid: "new-retry",
  testCaseId: caseId,
  status: "passed",
  attemptNumber: 1
};
const finalAttempt: ApiTestCaseHistoryPointReadModel = {
  ...firstAttempt,
  resultUuid: resultId,
  status: "failed",
  attemptNumber: 2
};

afterEach(() => vi.restoreAllMocks());

function mockCatalog(
  detailResponse: Response,
  historyPoints = [previousPoint, firstAttempt, finalAttempt]
) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === `/api/v1/projects/${projectId}/launches?limit=25`) {
      return jsonResponse({ items: [] });
    }
    if (url === `/api/v1/test-cases?projectId=${projectId}&limit=25`) {
      return jsonResponse({
        items: [
          { id: caseId, name: "List name", totalResults: 3, lastStatus: "failed" },
          { id: "case-other", name: "Other", totalResults: 1, lastStatus: "passed" }
        ]
      });
    }
    if (url === `/api/v1/test-cases/${caseId}?projectId=${projectId}`) {
      return jsonResponse({
        id: caseId,
        name: "Catalog case name",
        totalResults: 3,
        lastStatus: "failed",
        testCase: {
          id: caseId,
          projectId,
          name: "Catalog case name",
          description: "Case description",
          tags: ["checkout"],
          members: ["QA"]
        }
      });
    }
    if (url === historyPath) {
      return jsonResponse({ totalPoints: historyPoints.length, points: historyPoints });
    }
    if (url === resultPath) {
      return detailResponse;
    }
    return notFoundResponse();
  });
}

describe("test case evidence hydration", () => {
  it("selects the final attempt in the newest launch, irrespective of history order", () => {
    expect(selectLatestTestCaseResultPoint([finalAttempt, previousPoint, firstAttempt])).toEqual(
      finalAttempt
    );
  });

  it("uses the real nested steps and exception while preserving catalog metadata and history", async () => {
    const fetchMock = mockCatalog(
      jsonResponse({
        uuid: resultId,
        testCaseId: caseId,
        name: "Result-specific name",
        status: "failed",
        labels: {},
        statusDetails: {
          message: "AssertionError: payment confirmation was missing",
          trace: "AssertionError: payment confirmation was missing\n  at Checkout.test.ts:42"
        },
        raw: {
          description: "Result-specific description",
          parameters: [{ name: "browser", value: "Firefox" }]
        },
        steps: [
          {
            name: "Open checkout",
            status: "passed",
            steps: [{ name: "Wait for page", status: "passed" }]
          },
          {
            name: "Pay by card",
            status: "failed",
            steps: [
              {
                name: "Verify confirmation",
                status: "failed",
                statusDetails: {
                  message: "AssertionError: payment confirmation was missing",
                  trace:
                    "AssertionError: payment confirmation was missing\n  at Checkout.test.ts:42"
                }
              }
            ]
          }
        ]
      })
    );

    const workspace = await fetchM1Workspace({
      projectId,
      preferredTestCaseId: caseId,
      routeScope: "test-case-detail"
    });
    const detail = workspace.selectedTestCaseDetail;
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(resultPath);
    expect(detail).toMatchObject({
      id: caseId,
      name: "Catalog case name",
      description: "Case description",
      tags: ["checkout"],
      members: ["QA"],
      parameters: [{ name: "browser", value: "Firefox" }],
      trace: { message: "AssertionError: payment confirmation was missing" }
    });
    expect(detail?.steps[1]?.steps?.[0]).toMatchObject({
      name: "Verify confirmation",
      status: "failed",
      trace: { message: "AssertionError: payment confirmation was missing" }
    });
    expect(detail?.historyPoints?.map((point) => point.resultUuid)).toEqual([
      "new-retry",
      resultId,
      "old-result"
    ]);
    expect(detail?.retryAttempts?.map((attempt) => attempt.final)).toEqual([false, true]);
    expect(workspace.results.find((result) => result.id === caseId)?.steps).toEqual(detail?.steps);
    expect(workspace.results.find((result) => result.id === "case-other")?.steps).toEqual([]);
  });

  it("shows no invented scenario if the latest result is unavailable", async () => {
    mockCatalog(notFoundResponse());
    const workspace = await fetchM1Workspace({
      projectId,
      preferredTestCaseId: caseId,
      routeScope: "test-case-detail"
    });

    expect(workspace.selectedTestCaseDetail).toMatchObject({
      id: caseId,
      description: "Case description",
      steps: [],
      historyPoints: expect.arrayContaining([expect.objectContaining({ resultUuid: resultId })])
    });
  });

  it("loads the latest history page when the first page cannot contain the current run", async () => {
    const latestHistoryPath = `${historyPath}&cursor=2`;
    const fetchMock = mockCatalog(notFoundResponse(), [previousPoint]);
    const initialImplementation = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === historyPath) {
        return jsonResponse({
          totalPoints: workspaceInitialHistoryLimit + 2,
          points: [previousPoint]
        });
      }
      if (url === latestHistoryPath) {
        return jsonResponse({
          totalPoints: workspaceInitialHistoryLimit + 2,
          points: [firstAttempt, finalAttempt]
        });
      }
      return initialImplementation?.(input, init) ?? notFoundResponse();
    });

    const workspace = await fetchM1Workspace({
      projectId,
      preferredTestCaseId: caseId,
      routeScope: "test-case-detail"
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(latestHistoryPath);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(resultPath);
    expect(workspace.selectedTestCaseDetail?.historyPoints?.[0]?.resultUuid).toBe("new-retry");
  });
});
