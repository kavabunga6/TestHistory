import { describe, expect, it } from "vitest";

import { demoM1Workspace } from "../m1Workspace.js";
import type { IntegrationLinkProvider } from "../projectSettingsTypes.js";
import { getResultDefectReferences } from "./ResultDefectReferences.js";

describe("result defect references", () => {
  it("keeps an issue label as text when no external URL is configured", () => {
    const result = {
      ...demoM1Workspace.results[0]!,
      defect: "PAY-337",
      issues: ["PAY-337"],
      linkDetails: []
    };

    expect(getResultDefectReferences(result)).toEqual([{ id: "PAY-337", kind: "issue" }]);
  });

  it("uses a configured issue tracker and reserves internal routes for cluster IDs", () => {
    const provider: IntegrationLinkProvider = {
      id: "jira",
      enabled: true,
      name: "Jira",
      preset: "jira",
      source: { kind: "issue", matchMode: "first" },
      baseUrl: "https://jira.example.test/browse/",
      suffixTemplate: "{value}",
      encodeSuffix: true,
      previewValue: "PAY-337"
    };
    const result = {
      ...demoM1Workspace.results[0]!,
      defect: "defect:1a2b3c4d",
      issues: ["PAY-337"]
    };

    expect(getResultDefectReferences(result, [provider])).toEqual([
      { id: "defect:1a2b3c4d", kind: "internal", href: "#defects/defect%3A1a2b3c4d" },
      { id: "PAY-337", kind: "issue", href: "https://jira.example.test/browse/PAY-337" }
    ]);
  });
});
