import { useEffect, useState } from "react";

import {
  demoProjectSettings,
  loadIntegrationLinkProvidersFromApi,
  type IntegrationLinkProvider
} from "./projectSettings.js";

export function useIntegrationLinkProviders(): IntegrationLinkProvider[] {
  const [providers, setProviders] = useState<IntegrationLinkProvider[]>([]);
  const localDemoProviders = import.meta.env.DEV
    ? demoProjectSettings.integrationProviders.filter((item) => item.enabled)
    : [];

  useEffect(() => {
    let active = true;

    void loadIntegrationLinkProvidersFromApi()
      .then((items) => {
        if (active) {
          const enabledItems = items.filter((item) => item.enabled);
          setProviders(enabledItems.length > 0 ? enabledItems : localDemoProviders);
        }
      })
      .catch(() => {
        if (active) {
          setProviders(localDemoProviders);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return providers;
}
