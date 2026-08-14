import { useEffect, useState } from "react";

import { getStoredSessionToken, loadCurrentUser, type CurrentUser } from "./auth.js";
import { getProjectSettingsAccess, loadProjectSettingsFromApi } from "./projectSettings.js";

export function useCurrentUserAccess() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | undefined>();
  const [canDeleteEntities, setCanDeleteEntities] = useState(false);

  useEffect(() => {
    let active = true;
    const syncCurrentUser = () => {
      const token = getStoredSessionToken();
      if (token === undefined) {
        setCurrentUser(undefined);
        return;
      }

      void loadCurrentUser(token)
        .then((user) => {
          if (active) {
            setCurrentUser(user);
          }
        })
        .catch(() => {
          if (active) {
            setCurrentUser(undefined);
          }
        });
    };

    syncCurrentUser();
    globalThis.addEventListener("testhistory-auth-changed", syncCurrentUser);
    return () => {
      active = false;
      globalThis.removeEventListener("testhistory-auth-changed", syncCurrentUser);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (currentUser === undefined) {
      setCanDeleteEntities(false);
      return;
    }
    if (currentUser.role === "admin") {
      setCanDeleteEntities(true);
      return;
    }

    void loadProjectSettingsFromApi()
      .then((settings) => {
        if (active) {
          const access = getProjectSettingsAccess(settings, currentUser.email);
          setCanDeleteEntities(access.role === "owner");
        }
      })
      .catch(() => {
        if (active) {
          setCanDeleteEntities(false);
        }
      });

    return () => {
      active = false;
    };
  }, [currentUser]);

  return { canDeleteEntities, currentUser };
}
