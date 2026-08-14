import type { M1WorkspaceResponse } from "./m1WorkspaceTypes.js";

export const mockM1Launch: M1WorkspaceResponse["launch"] = {
  name: "PR-1289 Checkout Regression",
  build: "build 7842",
  branch: "feature/card-retry",
  started: "Сегодня, 09:41",
  environment: "staging",
  owner: "Platform QA"
};
