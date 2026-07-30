import { useCallback, useMemo, useState } from "react";
import {
  createDefaultReferenceGraphSettings,
  type ReferenceGraphSettings,
} from "./referenceGraphSettings";

export type ReferenceGraphSession = {
  resetSignal: number;
  settings: ReferenceGraphSettings;
  resetSettings: () => void;
  resetView: () => void;
  updateSettings: (settings: ReferenceGraphSettings) => void;
};

export function useReferenceGraphSession(): ReferenceGraphSession {
  const [resetSignal, setResetSignal] = useState(0);
  const [settings, setSettings] = useState(createDefaultReferenceGraphSettings);
  const updateSettings = useCallback((next: ReferenceGraphSettings) => {
    setSettings(next);
  }, []);
  const resetSettings = useCallback(() => {
    updateSettings(createDefaultReferenceGraphSettings());
  }, [updateSettings]);
  const resetView = useCallback(() => {
    setResetSignal((current) => current + 1);
  }, []);

  return useMemo(
    () => ({
      resetSettings,
      resetSignal,
      resetView,
      settings,
      updateSettings,
    }),
    [resetSettings, resetSignal, resetView, settings, updateSettings],
  );
}
