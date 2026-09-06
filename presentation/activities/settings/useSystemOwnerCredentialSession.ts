// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  SystemConfigurationController,
} from "../../../application/system/index.ts";
import {
  activateSystemOwnerCredentialRotation,
  createInitialSystemOwnerCredentialSnapshot,
  prepareSystemOwnerCredentialRotation,
  type SystemOwnerCredentialSnapshot,
} from "./systemOwnerCredentialSession.ts";

type SystemOwnerCredentialController = Pick<
  SystemConfigurationController,
  | "activateOwnerCredentialRotation"
  | "clearOwnerCredential"
  | "prepareOwnerCredentialRotation"
>;

export type {
  SystemOwnerCredentialPreparation,
  SystemOwnerCredentialSnapshot,
} from "./systemOwnerCredentialSession.ts";

export type SystemOwnerCredentialPanelView = Readonly<{
  activatePreparedOwnerCredential(): Promise<void>;
  clearOwnerCredential(): Promise<void>;
  dismissSecret(): void;
  prepareOwnerCredentialRotation(): Promise<void>;
  snapshot: SystemOwnerCredentialSnapshot;
}>;

export type SystemOwnerCredentialStatusView = Readonly<{
  dismissSecret(): void;
  snapshot: SystemOwnerCredentialSnapshot;
}>;

export type SystemOwnerCredentialView = SystemOwnerCredentialPanelView &
  SystemOwnerCredentialStatusView;

export type SystemOwnerCredentialSession = SystemOwnerCredentialView;

export function useSystemOwnerCredentialSession(
  configurationController: SystemOwnerCredentialController,
): SystemOwnerCredentialSession {
  const lifecycleEpochRef = useRef(0);
  const [snapshot, setSnapshot] = useState(
    createInitialSystemOwnerCredentialSnapshot,
  );
  const reset = useCallback(() => {
    lifecycleEpochRef.current += 1;
    setSnapshot(createInitialSystemOwnerCredentialSnapshot());
  }, []);
  const prepareOwnerCredentialRotation = useCallback(async () => {
    const epoch = lifecycleEpochRef.current + 1;

    lifecycleEpochRef.current = epoch;
    const preparedSnapshot = await prepareSystemOwnerCredentialRotation(
      configurationController,
    );

    if (lifecycleEpochRef.current !== epoch) return;
    setSnapshot(preparedSnapshot);
  }, [configurationController]);
  const activatePreparedOwnerCredential = useCallback(async () => {
    const epoch = lifecycleEpochRef.current;
    const activatedSnapshot = await activateSystemOwnerCredentialRotation(
      snapshot,
      configurationController,
    );

    if (lifecycleEpochRef.current !== epoch) return;
    setSnapshot((current) =>
      current === snapshot ? activatedSnapshot : current
    );
  }, [configurationController, snapshot]);
  const clearOwnerCredential = useCallback(async () => {
    await configurationController.clearOwnerCredential();
    reset();
  }, [configurationController, reset]);

  useLayoutEffect(() => () => {
    lifecycleEpochRef.current += 1;
  }, []);

  return useMemo(() => ({
    activatePreparedOwnerCredential,
    clearOwnerCredential,
    dismissSecret: reset,
    prepareOwnerCredentialRotation,
    snapshot,
  }), [
    activatePreparedOwnerCredential,
    clearOwnerCredential,
    prepareOwnerCredentialRotation,
    reset,
    snapshot,
  ]);
}
