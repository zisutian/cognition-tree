import { useCallback, useMemo } from "react";
import {
  useRepositorySessionState,
  createRepositorySessionKey,
} from "../../../ui/index.ts";

import {
  ReferenceGraphControllerCache,
  type ReferenceGraphController,
} from "./referenceGraphController.ts";
import {
  createDefaultReferenceGraphSettings,
  type ReferenceGraphSettings,
} from "./referenceGraphSettings.ts";

export type ReferenceGraphSession = {
  getController: (
    topologyIdentity: object,
    topologyVariant: string,
  ) => ReferenceGraphController;
  resetSignal: number;
  settings: ReferenceGraphSettings;
  resetSettings: () => void;
  resetView: () => void;
  updateSettings: (settings: ReferenceGraphSettings) => void;
};

type ReferenceGraphSessionState = {
  controllers: ReferenceGraphControllerCache;
  resetSignal: number;
  settings: ReferenceGraphSettings;
};

const referenceGraphSessionKey =
  createRepositorySessionKey<ReferenceGraphSessionState>(
    "notes-reference-graph",
  );

function createReferenceGraphSessionState(): ReferenceGraphSessionState {
  return {
    controllers: new ReferenceGraphControllerCache(),
    resetSignal: 0,
    settings: createDefaultReferenceGraphSettings(),
  };
}

export function useReferenceGraphSession(
  repositoryId: string,
): ReferenceGraphSession {
  const [session, setSession] = useRepositorySessionState(
    referenceGraphSessionKey,
    repositoryId,
    createReferenceGraphSessionState,
  );
  const getController = useCallback(
    (topologyIdentity: object, topologyVariant: string) =>
      session.controllers.get(topologyIdentity, topologyVariant),
    [session.controllers],
  );
  const updateSettings = useCallback((next: ReferenceGraphSettings) => {
    setSession((current) => ({ ...current, settings: next }));
  }, [setSession]);
  const resetSettings = useCallback(() => {
    updateSettings(createDefaultReferenceGraphSettings());
  }, [updateSettings]);
  const resetView = useCallback(() => {
    setSession((current) => ({
      ...current,
      resetSignal: current.resetSignal + 1,
    }));
  }, [setSession]);

  return useMemo(
    () => ({
      getController,
      resetSettings,
      resetSignal: session.resetSignal,
      resetView,
      settings: session.settings,
      updateSettings,
    }),
    [
      getController,
      resetSettings,
      resetView,
      session.resetSignal,
      session.settings,
      updateSettings,
    ],
  );
}
