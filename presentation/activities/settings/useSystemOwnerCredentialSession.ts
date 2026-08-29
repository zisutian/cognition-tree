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
} from "../../../application/system";

type SystemOwnerCredentialController = Pick<
  SystemConfigurationController,
  "clearOwnerCredential" | "rotateOwnerCredential"
>;

export type SystemOwnerCredentialSnapshot = Readonly<{
  secret: string | null;
}>;

export type SystemOwnerCredentialPanelActions = Readonly<{
  clearOwnerCredential(): Promise<void>;
  dismissSecret(): void;
  rotateOwnerCredential(): Promise<void>;
}>;

export type SystemOwnerCredentialStatusView = Readonly<{
  dismissSecret(): void;
  snapshot: SystemOwnerCredentialSnapshot;
}>;

export type SystemOwnerCredentialView = SystemOwnerCredentialPanelActions &
  SystemOwnerCredentialStatusView;

export type SystemOwnerCredentialSession = SystemOwnerCredentialView & Readonly<{
  reset(): void;
}>;

const initialSnapshot: SystemOwnerCredentialSnapshot = { secret: null };

export function useSystemOwnerCredentialSession(
  configurationController: SystemOwnerCredentialController,
): SystemOwnerCredentialSession {
  const lifecycleEpochRef = useRef(0);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const reset = useCallback(() => {
    lifecycleEpochRef.current += 1;
    setSnapshot(initialSnapshot);
  }, []);
  const rotateOwnerCredential = useCallback(async () => {
    const epoch = lifecycleEpochRef.current + 1;

    lifecycleEpochRef.current = epoch;
    setSnapshot(initialSnapshot);
    const secret = await configurationController.rotateOwnerCredential();

    if (lifecycleEpochRef.current !== epoch) return;
    setSnapshot({ secret });
  }, [configurationController]);
  const clearOwnerCredential = useCallback(async () => {
    reset();
    await configurationController.clearOwnerCredential();
  }, [configurationController, reset]);

  useLayoutEffect(() => () => {
    lifecycleEpochRef.current += 1;
  }, []);

  return useMemo(() => ({
    clearOwnerCredential,
    dismissSecret: reset,
    reset,
    rotateOwnerCredential,
    snapshot,
  }), [
    clearOwnerCredential,
    reset,
    rotateOwnerCredential,
    snapshot,
  ]);
}
