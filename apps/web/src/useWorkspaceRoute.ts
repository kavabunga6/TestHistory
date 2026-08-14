import { useCallback, useEffect, useState } from "react";

import { getHashFromRoute, getRouteFromHash, type WorkspaceRoute } from "./workspaceRouting.js";

export function useWorkspaceRoute() {
  const [route, setRouteState] = useState<WorkspaceRoute>(() =>
    getRouteFromHash(globalThis.location.hash)
  );

  useEffect(() => {
    const syncRouteFromHash = () => {
      const nextRoute = getRouteFromHash(globalThis.location.hash);
      const normalizedHash = getHashFromRoute(nextRoute);
      if (globalThis.location.hash !== normalizedHash) {
        globalThis.history.replaceState(null, "", normalizedHash);
      }
      setRouteState(nextRoute);
    };

    syncRouteFromHash();
    globalThis.addEventListener("hashchange", syncRouteFromHash);
    globalThis.addEventListener("popstate", syncRouteFromHash);
    return () => {
      globalThis.removeEventListener("hashchange", syncRouteFromHash);
      globalThis.removeEventListener("popstate", syncRouteFromHash);
    };
  }, []);

  const setRoute = useCallback((nextRoute: WorkspaceRoute) => {
    const nextHash = getHashFromRoute(nextRoute);
    if (globalThis.location.hash !== nextHash) {
      globalThis.history.pushState(null, "", nextHash);
    }
    setRouteState(nextRoute);
  }, []);

  return { route, setRoute };
}
