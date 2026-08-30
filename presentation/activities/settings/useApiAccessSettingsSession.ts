// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import type {
  ApiAccessApplication,
  AutomationApiToken,
  CreateAutomationApiTokenRequest,
  TrustedClientToken,
} from "../../../application/apiAccess/apiAccessAdministration";
import {
  createApiAccessSettingsSessionController,
  type ApiAccessSettingsSnapshot,
} from "./apiAccessSettingsSessionController";

export type { ApiAccessSettingsSnapshot } from "./apiAccessSettingsSessionController";

export type ApiAccessSettingsPanelSnapshot = Pick<
  ApiAccessSettingsSnapshot,
  "errorMessage" | "loading" | "tokens" | "trustedClientTokens"
>;

export type ApiAccessSettingsPanelView = Readonly<{
  createToken(
    request: CreateAutomationApiTokenRequest,
  ): Promise<AutomationApiToken | null>;
  createTrustedClientToken(name: string): Promise<TrustedClientToken | null>;
  load(): Promise<void>;
  repositories: ApiAccessApplication["repositories"];
  revokeToken(tokenId: string): Promise<boolean>;
  revokeTrustedClientToken(tokenId: string): Promise<boolean>;
  snapshot: ApiAccessSettingsPanelSnapshot;
}>;

export type ApiAccessSettingsStatusView = Readonly<{
  dismissSecret(): void;
  snapshot: ApiAccessSettingsSnapshot;
}>;

export type ApiAccessSettingsView = ApiAccessSettingsPanelView &
  ApiAccessSettingsStatusView;

export type ApiAccessSettingsSession = ApiAccessSettingsView & Readonly<{
  reset(): void;
}>;

export function useApiAccessSettingsSession(
  apiAccess: ApiAccessApplication,
): ApiAccessSettingsSession {
  const controller = useMemo(
    () => createApiAccessSettingsSessionController(apiAccess.administration),
    [apiAccess.administration],
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(
    () => () => controller.dispose(),
    [controller],
  );

  return useMemo(() => ({
    createToken: controller.createToken,
    createTrustedClientToken: controller.createTrustedClientToken,
    dismissSecret: controller.dismissSecret,
    load: controller.load,
    repositories: apiAccess.repositories,
    reset: controller.reset,
    revokeToken: controller.revokeToken,
    revokeTrustedClientToken: controller.revokeTrustedClientToken,
    snapshot,
  }), [apiAccess.repositories, controller, snapshot]);
}
