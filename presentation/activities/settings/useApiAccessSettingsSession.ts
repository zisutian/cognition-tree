// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ApiAccessApplication,
  AutomationApiToken,
  CreateAutomationApiTokenRequest,
  TrustedClientToken,
} from "../../../application/apiAccess/apiAccessAdministration";

export type ApiAccessSettingsSnapshot = Readonly<{
  errorMessage: string | null;
  loading: boolean;
  secret: string | null;
  tokens: AutomationApiToken[];
  trustedClientTokens: TrustedClientToken[];
}>;

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
  revokeTrustedClientToken(
    tokenId: string,
  ): Promise<boolean>;
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

function createInitialSnapshot(): ApiAccessSettingsSnapshot {
  return {
    errorMessage: null,
    loading: true,
    secret: null,
    tokens: [],
    trustedClientTokens: [],
  };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function loadErrorMessage(
  error: unknown,
  label: string,
  fallback: string,
) {
  return error instanceof Error ? `${label}：${error.message}` : fallback;
}

export function useApiAccessSettingsSession(
  apiAccess: ApiAccessApplication,
): ApiAccessSettingsSession {
  const administration = apiAccess.administration;
  const lifecycleEpochRef = useRef(0);
  const [snapshot, setSnapshot] = useState(createInitialSnapshot);
  const reset = useCallback(() => {
    lifecycleEpochRef.current += 1;
    setSnapshot(createInitialSnapshot());
  }, []);
  const dismissSecret = useCallback(() => {
    setSnapshot((current) =>
      current.secret === null ? current : { ...current, secret: null }
    );
  }, []);
  const load = useCallback(async () => {
    const epoch = lifecycleEpochRef.current;

    setSnapshot((current) => ({
      ...current,
      errorMessage: null,
      loading: true,
    }));
    const [tokenResult, trustedResult] = await Promise.allSettled([
      administration.listTokens(),
      administration.listTrustedClientTokens(),
    ]);

    if (lifecycleEpochRef.current !== epoch) return;
    const failures: string[] = [];

    if (tokenResult.status === "rejected") {
      failures.push(loadErrorMessage(
        tokenResult.reason,
        "无法加载自动化令牌",
        "无法加载自动化令牌。",
      ));
    }
    if (trustedResult.status === "rejected") {
      failures.push(loadErrorMessage(
        trustedResult.reason,
        "无法加载可信客户端令牌",
        "无法加载可信客户端令牌。",
      ));
    }
    setSnapshot((current) => ({
      ...current,
      errorMessage: failures.length > 0 ? failures.join(" ") : null,
      loading: false,
      tokens: tokenResult.status === "fulfilled"
        ? tokenResult.value
        : current.tokens,
      trustedClientTokens: trustedResult.status === "fulfilled"
        ? trustedResult.value
        : current.trustedClientTokens,
    }));
  }, [administration]);
  const createToken = useCallback(async (
    request: CreateAutomationApiTokenRequest,
  ) => {
    const epoch = lifecycleEpochRef.current;

    setSnapshot((current) => ({
      ...current,
      errorMessage: null,
      loading: true,
    }));
    try {
      const created = await administration.createToken(request);

      if (lifecycleEpochRef.current !== epoch) return null;
      setSnapshot((current) => ({
        ...current,
        loading: false,
        secret: created.secret,
        tokens: [
          created.token,
          ...current.tokens.filter(({ id }) => id !== created.token.id),
        ],
      }));
      return created.token;
    } catch (error) {
      if (lifecycleEpochRef.current !== epoch) return null;
      setSnapshot((current) => ({
        ...current,
        errorMessage: errorMessage(error, "无法创建 API 令牌。"),
        loading: false,
      }));
      return null;
    }
  }, [administration]);
  const createTrustedClientToken = useCallback(async (name: string) => {
    const epoch = lifecycleEpochRef.current;

    setSnapshot((current) => ({
      ...current,
      errorMessage: null,
      loading: true,
    }));
    try {
      const created = await administration.createTrustedClientToken(name);

      if (lifecycleEpochRef.current !== epoch) return null;
      setSnapshot((current) => ({
        ...current,
        loading: false,
        secret: created.secret,
        trustedClientTokens: [created.token, ...current.trustedClientTokens],
      }));
      return created.token;
    } catch (error) {
      if (lifecycleEpochRef.current !== epoch) return null;
      setSnapshot((current) => ({
        ...current,
        errorMessage: errorMessage(
          error,
          "无法创建可信客户端令牌。",
        ),
        loading: false,
      }));
      return null;
    }
  }, [administration]);
  const revokeToken = useCallback(async (tokenId: string) => {
    const epoch = lifecycleEpochRef.current;

    setSnapshot((current) => ({ ...current, errorMessage: null }));
    try {
      await administration.revokeToken(tokenId);
      if (lifecycleEpochRef.current !== epoch) return false;
      setSnapshot((current) => ({
        ...current,
        tokens: current.tokens.filter(({ id }) => id !== tokenId),
      }));
      return true;
    } catch (error) {
      if (lifecycleEpochRef.current !== epoch) return false;
      setSnapshot((current) => ({
        ...current,
        errorMessage: errorMessage(error, "无法撤销 API 令牌。"),
      }));
      return false;
    }
  }, [administration]);
  const revokeTrustedClientToken = useCallback(async (tokenId: string) => {
    const epoch = lifecycleEpochRef.current;

    setSnapshot((current) => ({ ...current, errorMessage: null }));
    try {
      await administration.revokeTrustedClientToken(tokenId);
      if (lifecycleEpochRef.current !== epoch) return false;
      setSnapshot((current) => ({
        ...current,
        trustedClientTokens: current.trustedClientTokens.filter(
          ({ id }) => id !== tokenId,
        ),
      }));
      return true;
    } catch (error) {
      if (lifecycleEpochRef.current !== epoch) return false;
      setSnapshot((current) => ({
        ...current,
        errorMessage: errorMessage(
          error,
          "无法撤销可信客户端令牌。",
        ),
      }));
      return false;
    }
  }, [administration]);

  useEffect(() => () => {
    lifecycleEpochRef.current += 1;
  }, []);

  return useMemo(() => ({
    createToken,
    createTrustedClientToken,
    dismissSecret,
    load,
    repositories: apiAccess.repositories,
    reset,
    revokeToken,
    revokeTrustedClientToken,
    snapshot,
  }), [
    apiAccess.repositories,
    createToken,
    createTrustedClientToken,
    dismissSecret,
    load,
    reset,
    revokeToken,
    revokeTrustedClientToken,
    snapshot,
  ]);
}
