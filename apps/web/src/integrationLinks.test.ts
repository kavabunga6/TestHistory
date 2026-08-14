import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { demoM1Workspace } from "./m1Workspace.js";
import {
  buildProviderLink,
  resolveIssueTrackerLink,
  type IntegrationLinkProvider
} from "./projectSettings.js";
import { TestCaseDetailReferenceScreen } from "./referenceScreens/TestCaseDetailReferenceScreen.js";

const jiraProvider: IntegrationLinkProvider = {
  baseUrl: "https://jira.example.test/browse/",
  enabled: true,
  encodeSuffix: true,
  id: "jira",
  name: "Jira",
  preset: "jira",
  previewValue: "TH-1",
  source: { kind: "issue", matchMode: "all", name: "issue" },
  suffixTemplate: "{value}"
};

describe("integration links", () => {
  it("builds a safe encoded provider URL", () => {
    expect(buildProviderLink(jiraProvider, "TH ANDROID-431")).toBe(
      "https://jira.example.test/browse/TH%20ANDROID-431"
    );
  });

  it("resolves only enabled issue providers", () => {
    expect(resolveIssueTrackerLink([jiraProvider], "TH-ANDROID-431")).toBe(
      "https://jira.example.test/browse/TH-ANDROID-431"
    );
    expect(resolveIssueTrackerLink([{ ...jiraProvider, enabled: false }], "TH-ANDROID-431")).toBe(
      undefined
    );
  });

  it("renders tags as actions and imported Jira issues as links", () => {
    const result = demoM1Workspace.results.find(
      (candidate) => candidate.tags.length > 0 && candidate.issues.length > 0
    );
    expect(result).toBeDefined();

    const markup = renderToStaticMarkup(
      React.createElement(TestCaseDetailReferenceScreen, {
        integrationProviders: [jiraProvider],
        onOpenLaunchResultsByTag: () => undefined,
        results: [result!],
        selectedId: result!.id
      })
    );

    expect(markup).toContain(
      `href="https://jira.example.test/browse/${encodeURIComponent(result!.issues[0]!)}"`
    );
    expect(markup).toContain(`>${result!.tags[0]!}</button>`);
  });
});
