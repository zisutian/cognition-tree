// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiAccessAdministration,
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

export type ApiAccessSettingsSessionController = Readonly<{
  createToken(
    request: CreateAutomationApiTokenRequest,
  ): Promise<AutomationApiToken | null>;
  createTrustedClientToken(name: string): Promise<TrustedClientToken | null>;
  dismissSecret(): void;
  dispose(): void;
  getSnapshot(): ApiAccessSettingsSnapshot;
  load(): Promise<void>;
  reset(): void;
  revokeToken(tokenId: string): Promise<boolean>;
  revokeTrustedClientToken(tokenId: string): Promise<boolean>;
  subscribe(listener: () => void): () => void;
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

export function createApiAccessSettingsSessionController(
  administration: ApiAccessAdministration,
): ApiAccessSettingsSessionController {
  const listeners = new Set<() => void>();
  let activeOperationCount = 0;
  let disposed = false;
  let lifecycleEpoch = 0;
  let loadGeneration = 0;
  let snapshot = createInitialSnapshot();
  let tokenMutationCount = 0;
  let tokenMutationVersion = 0;
  let trustedMutationCount = 0;
  let trustedMutationVersion = 0;

  const publish = (next: ApiAccessSettingsSnapshot) => {
    if (disposed) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const assertActive = () => {
    if (disposed) {
      throw new Error("API access settings session controller is disposed.");
    }
  };
  const invalidatePendingOperations = () => {
    lifecycleEpoch += 1;
    loadGeneration += 1;
    activeOperationCount = 0;
    tokenMutationCount = 0;
    tokenMutationVersion += 1;
    trustedMutationCount = 0;
    trustedMutationVersion += 1;
  };
  const beginOperation = () => {
    assertActive();
    const epoch = lifecycleEpoch;

    activeOperationCount += 1;
    publish({ ...snapshot, errorMessage: null, loading: true });
    let finished = false;

    return (
      update: (
        current: ApiAccessSettingsSnapshot,
      ) => ApiAccessSettingsSnapshot = (current) => current,
    ) => {
      if (finished) throw new Error("API access operation already settled");
      finished = true;
      if (lifecycleEpoch !== epoch) return false;
      activeOperationCount -= 1;
      publish({
        ...update(snapshot),
        loading: activeOperationCount > 0,
      });
      return true;
    };
  };
  const beginTokenMutation = () => {
    assertActive();
    const epoch = lifecycleEpoch;

    tokenMutationCount += 1;
    tokenMutationVersion += 1;
    const finishOperation = beginOperation();
    let finished = false;

    return (
      update?: (current: ApiAccessSettingsSnapshot) => ApiAccessSettingsSnapshot,
    ) => {
      if (finished) throw new Error("API token mutation already settled");
      finished = true;
      if (lifecycleEpoch === epoch) tokenMutationCount -= 1;
      return finishOperation(update);
    };
  };
  const beginTrustedMutation = () => {
    assertActive();
    const epoch = lifecycleEpoch;

    trustedMutationCount += 1;
    trustedMutationVersion += 1;
    const finishOperation = beginOperation();
    let finished = false;

    return (
      update?: (current: ApiAccessSettingsSnapshot) => ApiAccessSettingsSnapshot,
    ) => {
      if (finished) {
        throw new Error("Trusted client token mutation already settled");
      }
      finished = true;
      if (lifecycleEpoch === epoch) trustedMutationCount -= 1;
      return finishOperation(update);
    };
  };

  return {
    async createToken(request) {
      const finishMutation = beginTokenMutation();
      let created: Awaited<ReturnType<typeof administration.createToken>>;

      try {
        created = await administration.createToken(request);
      } catch (error) {
        finishMutation((current) => ({
          ...current,
          errorMessage: errorMessage(error, "无法创建 API 令牌。"),
        }));
        return null;
      }
      const installed = finishMutation((current) => ({
        ...current,
        secret: created.secret,
        tokens: [
          created.token,
          ...current.tokens.filter(({ id }) => id !== created.token.id),
        ],
      }));

      return installed ? created.token : null;
    },
    async createTrustedClientToken(name) {
      const finishMutation = beginTrustedMutation();
      let created: Awaited<
        ReturnType<typeof administration.createTrustedClientToken>
      >;

      try {
        created = await administration.createTrustedClientToken(name);
      } catch (error) {
        finishMutation((current) => ({
          ...current,
          errorMessage: errorMessage(
            error,
            "无法创建可信客户端令牌。",
          ),
        }));
        return null;
      }
      const installed = finishMutation((current) => ({
        ...current,
        secret: created.secret,
        trustedClientTokens: [
          created.token,
          ...current.trustedClientTokens.filter(
            ({ id }) => id !== created.token.id,
          ),
        ],
      }));

      return installed ? created.token : null;
    },
    dismissSecret() {
      assertActive();
      if (snapshot.secret !== null) publish({ ...snapshot, secret: null });
    },
    dispose() {
      if (disposed) return;
      invalidatePendingOperations();
      disposed = true;
      listeners.clear();
    },
    getSnapshot: () => snapshot,
    async load() {
      assertActive();
      const generation = ++loadGeneration;
      const expectedTokenMutationVersion = tokenMutationVersion;
      const expectedTrustedMutationVersion = trustedMutationVersion;
      const tokenMutationWasPending = tokenMutationCount > 0;
      const trustedMutationWasPending = trustedMutationCount > 0;
      const finishOperation = beginOperation();
      const [tokenResult, trustedResult] = await Promise.allSettled([
        Promise.resolve().then(() => administration.listTokens()),
        Promise.resolve().then(() => administration.listTrustedClientTokens()),
      ]);

      if (loadGeneration !== generation) {
        finishOperation();
        return;
      }
      const tokensAreAuthoritative = !tokenMutationWasPending &&
        tokenMutationVersion === expectedTokenMutationVersion;
      const trustedTokensAreAuthoritative = !trustedMutationWasPending &&
        trustedMutationVersion === expectedTrustedMutationVersion;
      const failures: string[] = [];

      if (tokensAreAuthoritative && tokenResult.status === "rejected") {
        failures.push(loadErrorMessage(
          tokenResult.reason,
          "无法加载自动化令牌",
          "无法加载自动化令牌。",
        ));
      }
      if (trustedTokensAreAuthoritative && trustedResult.status === "rejected") {
        failures.push(loadErrorMessage(
          trustedResult.reason,
          "无法加载可信客户端令牌",
          "无法加载可信客户端令牌。",
        ));
      }
      finishOperation((current) => ({
        ...current,
        errorMessage: failures.length > 0
          ? failures.join(" ")
          : current.errorMessage,
        tokens: tokensAreAuthoritative && tokenResult.status === "fulfilled"
          ? tokenResult.value
          : current.tokens,
        trustedClientTokens:
          trustedTokensAreAuthoritative && trustedResult.status === "fulfilled"
            ? trustedResult.value
            : current.trustedClientTokens,
      }));
    },
    reset() {
      assertActive();
      invalidatePendingOperations();
      publish(createInitialSnapshot());
    },
    async revokeToken(tokenId) {
      const finishMutation = beginTokenMutation();

      try {
        await administration.revokeToken(tokenId);
      } catch (error) {
        finishMutation((current) => ({
          ...current,
          errorMessage: errorMessage(error, "无法撤销 API 令牌。"),
        }));
        return false;
      }
      return finishMutation((current) => ({
        ...current,
        tokens: current.tokens.filter(({ id }) => id !== tokenId),
      }));
    },
    async revokeTrustedClientToken(tokenId) {
      const finishMutation = beginTrustedMutation();

      try {
        await administration.revokeTrustedClientToken(tokenId);
      } catch (error) {
        finishMutation((current) => ({
          ...current,
          errorMessage: errorMessage(
            error,
            "无法撤销可信客户端令牌。",
          ),
        }));
        return false;
      }
      return finishMutation((current) => ({
        ...current,
        trustedClientTokens: current.trustedClientTokens.filter(
          ({ id }) => id !== tokenId,
        ),
      }));
    },
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
