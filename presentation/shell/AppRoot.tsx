import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  createClientOwnerAuthenticationRuntime,
} from "../../infrastructure/client/runtime/systemRuntime";
import { AuthenticatedWorkbenchRoot } from "./AuthenticatedWorkbenchRoot";
import { OwnerLogin } from "./OwnerLogin";

export function AppRoot() {
  const api = useMemo(() => ({ baseUrl: globalThis.location.origin }), []);
  const authenticationController = useMemo(
    () => createClientOwnerAuthenticationRuntime(api),
    [api],
  );
  const authenticationState = useSyncExternalStore(
    authenticationController.subscribe,
    authenticationController.getSnapshot,
    authenticationController.getSnapshot,
  );

  useEffect(() => {
    void authenticationController.load();
  }, [authenticationController]);

  if (!authenticationState.authenticated) {
    return (
      <OwnerLogin
        controller={authenticationController}
        state={authenticationState}
      />
    );
  }
  return (
    <AuthenticatedWorkbenchRoot
      api={api}
      authenticationController={authenticationController}
      authenticationState={authenticationState}
    />
  );
}
