import { describe, expect, it } from "vitest";

type DashboardQueryStatus = "passed" | "failed" | "broken" | "skipped" | "muted";

interface DashboardQueryResult {
  id: string;
  name: string;
  status: DashboardQueryStatus;
  muted: boolean;
  tags: string[];
  customFields: Array<{ label: string; value: string }>;
}

interface DashboardQueryModule {
  parseThql: (query: string) => unknown;
  evaluateDashboardQuery: (input: {
    results: DashboardQueryResult[];
    query: string;
    excludeMuted?: boolean;
    groupBy?: "status" | "tags" | { customField: string };
  }) => {
    matchedResults: DashboardQueryResult[];
    groups: Array<{
      key: string;
      total: number;
      statusCounters: Partial<Record<DashboardQueryStatus, number>>;
      resultIds: string[];
    }>;
    totals: {
      total: number;
      statusCounters: Partial<Record<DashboardQueryStatus, number>>;
    };
  };
}

const DASHBOARD_QUERY_MODULE_READY = true;
const describeDashboardQueryContract = DASHBOARD_QUERY_MODULE_READY ? describe : describe.skip;

const fixtureResults: DashboardQueryResult[] = [
  {
    id: "res-login-failed",
    name: "login rejects expired password",
    status: "failed",
    muted: false,
    tags: ["login", "smoke"],
    customFields: [
      { label: "Priority", value: "P0" },
      { label: "Component", value: "auth" }
    ]
  },
  {
    id: "res-checkout-broken-muted",
    name: "checkout saves payment token",
    status: "broken",
    muted: true,
    tags: ["checkout", "payments"],
    customFields: [
      { label: "Priority", value: "P1" },
      { label: "Component", value: "billing" }
    ]
  },
  {
    id: "res-login-passed",
    name: "login accepts valid credentials",
    status: "passed",
    muted: false,
    tags: ["login", "regression"],
    customFields: [
      { label: "Priority", value: "P1" },
      { label: "Component", value: "auth" }
    ]
  },
  {
    id: "res-profile-skipped",
    name: "profile loads locale preferences",
    status: "skipped",
    muted: false,
    tags: ["profile"],
    customFields: [{ label: "Priority", value: "P2" }]
  }
];

async function importDashboardQueryModule(): Promise<DashboardQueryModule> {
  const modulePath = "./dashboardQuery.ts";
  return (await import(modulePath)) as DashboardQueryModule;
}

describeDashboardQueryContract("dashboard query contract", () => {
  it("parses THQL status, tag, custom field, text, and boolean operators", async () => {
    const { parseThql } = await importDashboardQueryModule();

    const ast = parseThql(
      'status:failed AND tag:login AND custom.Priority:P0 AND text:"expired password"'
    );

    expect(ast).toEqual(
      expect.objectContaining({
        type: "and",
        terms: expect.arrayContaining([
          expect.objectContaining({ field: "status", value: "failed" }),
          expect.objectContaining({ field: "tag", value: "login" }),
          expect.objectContaining({ field: "custom.Priority", value: "P0" }),
          expect.objectContaining({ field: "text", value: "expired password" })
        ])
      })
    );
  });

  it("evaluates THQL over result text, status, tags, and custom fields", async () => {
    const { evaluateDashboardQuery } = await importDashboardQueryModule();

    const dashboard = evaluateDashboardQuery({
      results: fixtureResults,
      query: 'status:failed AND tag:login AND custom.Component:auth AND text:"expired"',
      excludeMuted: true
    });

    expect(dashboard.matchedResults.map((result) => result.id)).toEqual(["res-login-failed"]);
    expect(dashboard.totals).toEqual({
      total: 1,
      statusCounters: { failed: 1 }
    });
  });

  it("excludes muted results from dashboard analytics by default when requested", async () => {
    const { evaluateDashboardQuery } = await importDashboardQueryModule();

    const dashboard = evaluateDashboardQuery({
      results: fixtureResults,
      query: "tag:checkout OR status:broken",
      excludeMuted: true
    });

    expect(dashboard.matchedResults).toEqual([]);
    expect(dashboard.totals.total).toBe(0);
  });

  it("groups matching results by tags without counting muted exclusions", async () => {
    const { evaluateDashboardQuery } = await importDashboardQueryModule();

    const dashboard = evaluateDashboardQuery({
      results: fixtureResults,
      query: "tag:login OR tag:checkout",
      excludeMuted: true,
      groupBy: "tags"
    });

    expect(dashboard.groups).toEqual([
      {
        key: "login",
        total: 2,
        statusCounters: { failed: 1, passed: 1 },
        resultIds: ["res-login-failed", "res-login-passed"]
      },
      {
        key: "regression",
        total: 1,
        statusCounters: { passed: 1 },
        resultIds: ["res-login-passed"]
      },
      {
        key: "smoke",
        total: 1,
        statusCounters: { failed: 1 },
        resultIds: ["res-login-failed"]
      }
    ]);
  });

  it("groups matching results by custom field values", async () => {
    const { evaluateDashboardQuery } = await importDashboardQueryModule();

    const dashboard = evaluateDashboardQuery({
      results: fixtureResults,
      query: "custom.Component:auth OR custom.Priority:P2",
      excludeMuted: true,
      groupBy: { customField: "Priority" }
    });

    expect(dashboard.groups).toEqual([
      {
        key: "P0",
        total: 1,
        statusCounters: { failed: 1 },
        resultIds: ["res-login-failed"]
      },
      {
        key: "P1",
        total: 1,
        statusCounters: { passed: 1 },
        resultIds: ["res-login-passed"]
      },
      {
        key: "P2",
        total: 1,
        statusCounters: { skipped: 1 },
        resultIds: ["res-profile-skipped"]
      }
    ]);
  });

  it("groups matching results by status", async () => {
    const { evaluateDashboardQuery } = await importDashboardQueryModule();

    const dashboard = evaluateDashboardQuery({
      results: fixtureResults,
      query: "tag:login OR tag:profile",
      excludeMuted: true,
      groupBy: "status"
    });

    expect(dashboard.groups).toEqual([
      {
        key: "failed",
        total: 1,
        statusCounters: { failed: 1 },
        resultIds: ["res-login-failed"]
      },
      {
        key: "passed",
        total: 1,
        statusCounters: { passed: 1 },
        resultIds: ["res-login-passed"]
      },
      {
        key: "skipped",
        total: 1,
        statusCounters: { skipped: 1 },
        resultIds: ["res-profile-skipped"]
      }
    ]);
  });
});
