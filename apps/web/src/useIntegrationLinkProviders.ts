import { useEffect, useState } from "react";

import {
  loadIntegrationLinkProvidersFromApi,
  type IntegrationLinkProvider
} from "./projectSettings.js";

export function useIntegrationLinkProviders(projectId?: string): IntegrationLinkProvider[] {
  const [providers, setProviders] = useState<IntegrationLinkProvider[]>([]);

  useEffect(() => {
    let active = true;
    setProviders([]);
    if (projectId === undefined) {
      return () => {
        active = false;
      };
    }

    void loadIntegrationLinkProvidersFromApi(projectId)
      .then((items) => {
        if (active) {
          setProviders(items.filter((item) => item.enabled));
        }
      })
      .catch(() => {
        if (active) {
          setProviders([]);
        }
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  return providers;
}
