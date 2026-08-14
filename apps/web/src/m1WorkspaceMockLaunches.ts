import type { LaunchListItem } from "./m1WorkspaceTypes.js";

export const mockM1Launches: LaunchListItem[] = [
  {
    id: "L-1289",
    name: "PR-1289 Checkout Regression",
    state: "open",
    metadata: ["staging", "Chrome 126", "feature/card-retry"],
    defects: 2,
    members: 7,
    counters: { passed: 482, failed: 7, broken: 3, skipped: 18, muted: 0 }
  },
  {
    id: "L-1288",
    name: "Nightly Auth Smoke",
    state: "closed",
    metadata: ["staging", "Firefox 126", "main"],
    defects: 0,
    members: 5,
    counters: { passed: 214, failed: 0, broken: 1, skipped: 3, muted: 0 }
  },
  {
    id: "L-1287",
    name: "Release Candidate 24.06",
    state: "closed",
    metadata: ["preprod", "Chrome 126", "release/24.06"],
    defects: 5,
    members: 11,
    counters: { passed: 932, failed: 12, broken: 4, skipped: 21, muted: 0 }
  }
];
