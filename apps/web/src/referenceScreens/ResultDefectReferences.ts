import type { TestResult } from "../m1Workspace.js";
import { resolveIssueTrackerLink } from "../projectSettings.js";
import type { IntegrationLinkProvider } from "../projectSettingsTypes.js";
import { isExternalUrl, uniqueStrings } from "./LaunchesReferenceFormatters.js";

export type ResultDefectReference = {
  id: string;
  kind: "internal" | "issue";
  href?: string;
};

const internalDefectIdPattern = /^defect:[0-9a-f]{8}$/i;

export function getResultDefectReferences(
  result: TestResult,
  integrationProviders: IntegrationLinkProvider[] = []
): ResultDefectReference[] {
  return uniqueStrings([result.defect ?? "", ...result.issues]).map((id) => {
    if (internalDefectIdPattern.test(id)) {
      return { id, kind: "internal", href: `#defects/${encodeURIComponent(id)}` };
    }

    const explicitLink = result.linkDetails?.find(
      (link) => link.label === id && isExternalUrl(link.url)
    )?.url;
    const trackerLink = resolveIssueTrackerLink(integrationProviders, id);
    const href = explicitLink ?? (isExternalUrl(id) ? id : trackerLink);
    return href !== undefined && isExternalUrl(href)
      ? { id, kind: "issue", href }
      : { id, kind: "issue" };
  });
}
