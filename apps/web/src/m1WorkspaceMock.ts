import type { M1WorkspaceResponse } from "./m1WorkspaceTypes.js";
import { mockM1Launch } from "./m1WorkspaceMockLaunch.js";
import { mockM1Launches } from "./m1WorkspaceMockLaunches.js";
import { mockM1Results } from "./m1WorkspaceMockResults.js";
import { defaultResultSteps } from "./m1WorkspaceMockPreview.js";

export const mockM1WorkspaceResponse: M1WorkspaceResponse = {
  launch: mockM1Launch,
  launches: mockM1Launches,
  results: mockM1Results,
  resultSteps: {
    "AUTH-483420": defaultResultSteps
  }
};
