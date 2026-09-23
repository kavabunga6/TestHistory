import { useEffect, useState } from "react";

import { getStoredSessionToken, loadCurrentUser, type CurrentUser } from "./auth.js";
import { getProjectSettingsAccess, loadProjectSettingsFromApi } from "./projectSettings.js";

export function useCurrentUserAccess() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | undefined>();

  useEffect(() => {
    let active = true;
    let requestSequence = 0;
    const syncCurrentUser = () => {
      const sequence = ++requestSequence;
      setCurrentUser(undefined);
      const token = getStoredSessionToken();
      if (token === undefined) {
        return;
      }

      void loadCurrentUser(token)
        .then((user) => {
          if (active && sequence === requestSequence) {
            setCurrentUser(user);
          }
        })
        .catch(() => {
          if (active && sequence === requestSequence) {
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

  return { currentUser };
}

export function useProjectDeleteAccess(currentUser?: CurrentUser, projectId?: string) {
  const [canDeleteEntities, setCanDeleteEntities] = useState(false);

  useEffect(() => {
    let active = true;
    if (currentUser === undefined || projectId === undefined) {
      setCanDeleteEntities(false);
      return;
    }
    if (currentUser.role === "admin") {
      setCanDeleteEntities(true);
      return;
    }

    void loadProjectSettingsFromApi(projectId)
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
  }, [currentUser, projectId]);

  return canDeleteEntities;
}
