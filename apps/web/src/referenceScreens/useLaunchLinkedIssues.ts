import { useEffect, useState } from "react";

import { getJson } from "../apiHttp.js";
import type { LaunchListItem, WorkspaceListPage } from "../m1Workspace.js";
import { defaultOverviewListPageSize } from "./LaunchesReferenceModel.js";

export type LaunchLinkedIssue = {
  id: string;
  resultUuid: string;
  resultName: string;
};

export type LaunchLinkedIssuesPage = {
  kind: "launch-linked-issues";
  launchId: string;
  page: WorkspaceListPage;
  items: LaunchLinkedIssue[];
};

type LoadState =
  | { status: "loading"; launchId: string }
  | { status: "ready"; launchId: string; data: LaunchLinkedIssuesPage }
  | { status: "error"; launchId: string };

export function useLaunchLinkedIssues(launch: LaunchListItem) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<number>(defaultOverviewListPageSize);
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading", launchId: launch.id });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ status: "loading", launchId: launch.id });

    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(pageIndex * pageSize)
    });
    void getJson<unknown>(
      `/api/v1/launches/${encodeURIComponent(launch.id)}/linked-issues?${params}`,
      { signal: controller.signal }
    )
      .then((data) => {
        if (!active) return;
        if (!isLaunchLinkedIssuesPage(data, launch.id)) {
          throw new Error("Invalid linked issue response");
        }
        if (pageIndex > 0 && data.page.returned === 0) {
          setPageIndex(Math.max(0, Math.ceil(data.page.total / pageSize) - 1));
          return;
        }
        setState({ status: "ready", launchId: launch.id, data });
      })
      .catch(() => {
        if (active) setState({ status: "error", launchId: launch.id });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [launch, pageIndex, pageSize, requestVersion]);

  return {
    pageIndex,
    pageSize,
    retry: () => setRequestVersion((version) => version + 1),
    setPageIndex,
    setPageSize: (nextPageSize: number) => {
      setPageSize(nextPageSize);
      setPageIndex(0);
    },
    state:
      state.launchId === launch.id ? state : ({ status: "loading", launchId: launch.id } as const)
  };
}

function isLaunchLinkedIssuesPage(
  value: unknown,
  launchId: string
): value is LaunchLinkedIssuesPage {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Partial<LaunchLinkedIssuesPage>;
  return (
    response.kind === "launch-linked-issues" &&
    response.launchId === launchId &&
    Number.isInteger(response.page?.total) &&
    Number.isInteger(response.page?.limit) &&
    Number.isInteger(response.page?.offset) &&
    Number.isInteger(response.page?.returned) &&
    Array.isArray(response.items)
  );
}
