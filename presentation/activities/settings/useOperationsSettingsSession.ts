// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import type {
  OperationAdministration,
} from "../../../application/operations/operationAdministration";
import {
  createInitialOperationsSettingsSnapshot,
  reduceOperationsSettings,
  type OperationsSettingsSnapshot,
} from "./operationsSettingsSession";

export type OperationsSettingsPanelView = Readonly<{
  load(): Promise<void>;
  selectEntry(entryId: string): void;
  snapshot: OperationsSettingsSnapshot;
}>;

export type OperationsSettingsStatusView = Readonly<{
  snapshot: OperationsSettingsSnapshot;
}>;

export type OperationsSettingsView = OperationsSettingsPanelView &
  OperationsSettingsStatusView;

export type OperationsSettingsSession = OperationsSettingsView & Readonly<{
  reset(): void;
}>;

function auditErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "无法加载操作审计。";
}

export function useOperationsSettingsSession(
  administration: OperationAdministration,
): OperationsSettingsSession {
  const loadGenerationRef = useRef(0);
  const [snapshot, dispatch] = useReducer(
    reduceOperationsSettings,
    undefined,
    createInitialOperationsSettingsSnapshot,
  );
  const reset = useCallback(() => {
    loadGenerationRef.current += 1;
    dispatch({ type: "reset" });
  }, []);
  const load = useCallback(async () => {
    const generation = loadGenerationRef.current + 1;

    loadGenerationRef.current = generation;
    dispatch({ type: "load-started" });
    try {
      const status = await administration.getStatus();

      if (loadGenerationRef.current !== generation) return;
      dispatch({ status, type: "status-loaded" });
      if (status.status === "unavailable") return;
      const { entries } = await administration.list();

      if (loadGenerationRef.current !== generation) return;
      dispatch({ entries, type: "loaded" });
    } catch (error) {
      if (loadGenerationRef.current !== generation) return;
      dispatch({
        errorMessage: auditErrorMessage(error),
        type: "load-failed",
      });
    }
  }, [administration]);
  const selectEntry = useCallback((entryId: string) => {
    dispatch({ entryId, type: "selected" });
  }, []);

  useLayoutEffect(() => () => {
    loadGenerationRef.current += 1;
  }, []);

  return useMemo(() => ({
    load,
    reset,
    selectEntry,
    snapshot,
  }), [load, reset, selectEntry, snapshot]);
}
