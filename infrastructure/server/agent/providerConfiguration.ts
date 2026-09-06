// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentProviderInput,
} from "../../../application/agent/index.ts";
import { SecureStateCommitOutcomeUnknownError } from "../../../application/persistence/index.ts";
import type {
  AgentConfigurationAccess,
  AgentConfigurationProviderChange,
} from "../../../application/agentHost/index.ts";
import { AgentConfigurationValidationError } from "../../../application/agentHost/index.ts";
import { normalizeProviderInput } from "./configurationInput.ts";
import { assertAgentConfigurationRevision } from "./configurationRevision.ts";
import type {
  AgentConfigurationState,
  StoredAuthentication,
  StoredProvider,
} from "./configurationStateCodec.ts";
import type { AgentProviderTargetPolicy } from "./providerTargetPolicy.ts";
import type {
  AgentCredentialReference,
} from "./credentialManifest.ts";
import type {
  AgentProviderCredentialStore,
} from "./providerCredentialStore.ts";
import {
  configurationSnapshot,
  providerView,
} from "./configurationViews.ts";

type MutateAgentConfiguration = <Result>(
  operation: (
    state: AgentConfigurationState,
  ) => { changed: boolean; result: Result } | Promise<{
    changed: boolean;
    result: Result;
  }>,
) => Promise<Result>;

type ReadAgentConfiguration = <Result>(
  project: (state: AgentConfigurationState) => Result,
) => Promise<Result>;

function invalidateProviderConformance(
  state: AgentConfigurationState,
  providerId: string,
) {
  for (const profile of state.profiles) {
    if (profile.providerId === providerId) profile.conformance = null;
  }
}

export class AgentProviderConfiguration {
  readonly #access: AgentConfigurationAccess;
  readonly #createId: () => string;
  readonly #credentialStore: AgentProviderCredentialStore;
  readonly #mutate: MutateAgentConfiguration;
  readonly #read: ReadAgentConfiguration;
  readonly #targetPolicy: AgentProviderTargetPolicy;

  constructor({
    access,
    createId,
    credentialStore,
    mutate,
    read,
    targetPolicy,
  }: {
    access: AgentConfigurationAccess;
    createId: () => string;
    credentialStore: AgentProviderCredentialStore;
    mutate: MutateAgentConfiguration;
    read: ReadAgentConfiguration;
    targetPolicy: AgentProviderTargetPolicy;
  }) {
    this.#access = access;
    this.#createId = createId;
    this.#credentialStore = credentialStore;
    this.#mutate = mutate;
    this.#read = read;
    this.#targetPolicy = targetPolicy;
  }

  async create(baseRevision: string, input: AgentProviderInput) {
    let candidate: AgentCredentialReference | null = null;
    let candidateMayBeAuthoritative = false;

    try {
      return await this.#mutate(async (state) => {
        assertAgentConfigurationRevision(state, baseRevision);
        const id = `agent-provider-${this.#createId()}`;
        const normalized = normalizeProviderInput(input, this.#targetPolicy);
        const prepared = await this.#authenticationForInput(id, input);
        const provider: StoredProvider = {
          ...normalized,
          authentication: prepared.authentication,
          id,
          version: 1,
        };

        candidate = prepared.candidate;
        state.providers.push(provider);
        candidateMayBeAuthoritative = candidate !== null;
        return {
          changed: true,
          result: {
            configuration: configurationSnapshot(state),
            provider: providerView(provider),
          },
        };
      });
    } catch (error) {
      await this.#removeRejectedCredentialCandidate(
        candidate,
        candidateMayBeAuthoritative,
        error,
      );
      throw error;
    }
  }

  async update(
    baseRevision: string,
    providerId: string,
    input: AgentProviderInput,
  ) {
    let candidate: AgentCredentialReference | null = null;
    let candidateMayBeAuthoritative = false;
    const lifecycle: { change: AgentConfigurationProviderChange | null } = {
      change: null,
    };

    try {
      const outcome = await this.#mutate(async (state) => {
        assertAgentConfigurationRevision(state, baseRevision);
        const index = state.providers.findIndex(({ id }) => id === providerId);

        if (index < 0) {
          throw new AgentConfigurationValidationError(
            "Agent provider does not exist",
          );
        }
        lifecycle.change = this.#beginProviderChange(state, providerId);
        const previous = state.providers[index];

        if (!previous) {
          throw new AgentConfigurationValidationError(
            "Agent provider does not exist",
          );
        }
        const normalized = normalizeProviderInput(input, this.#targetPolicy);
        const prepared = await this.#authenticationForInput(
          previous.id,
          input,
          previous.authentication,
        );
        const provider: StoredProvider = {
          ...normalized,
          authentication: prepared.authentication,
          id: previous.id,
          version: previous.version + 1,
        };

        candidate = prepared.candidate;
        invalidateProviderConformance(state, providerId);
        state.providers[index] = provider;
        candidateMayBeAuthoritative = candidate !== null;
        const previousCredential = previous.authentication.type !== "none"
          ? previous.authentication.credential
          : null;
        const nextCredential = provider.authentication.type !== "none"
          ? provider.authentication.credential
          : null;
        return {
          changed: true,
          result: {
            credentialToRemove: previousCredential &&
                previousCredential.reference !== nextCredential?.reference
              ? previousCredential
              : null,
            value: {
              configuration: configurationSnapshot(state),
              provider: providerView(provider),
            },
          },
        };
      });

      await this.#removeObsoleteCredential(outcome.credentialToRemove);
      return outcome.value;
    } catch (error) {
      await this.#removeRejectedCredentialCandidate(
        candidate,
        candidateMayBeAuthoritative,
        error,
      );
      throw error;
    } finally {
      lifecycle.change?.release();
    }
  }

  async delete(baseRevision: string, providerId: string) {
    const lifecycle: { change: AgentConfigurationProviderChange | null } = {
      change: null,
    };

    try {
      const outcome = await this.#mutate((state) => {
        assertAgentConfigurationRevision(state, baseRevision);
        if (state.profiles.some(({ providerId: candidate }) =>
          candidate === providerId
        )) {
          throw new AgentConfigurationValidationError(
            "Delete profiles that reference this provider first",
          );
        }
        const index = state.providers.findIndex(({ id }) => id === providerId);

        if (index < 0) {
          throw new AgentConfigurationValidationError(
            "Agent provider does not exist",
          );
        }
        lifecycle.change = this.#beginProviderChange(state, providerId);
        const [provider] = state.providers.splice(index, 1);

        if (!provider) {
          throw new AgentConfigurationValidationError(
            "Agent provider does not exist",
          );
        }
        return {
          changed: true,
          result: {
            configuration: configurationSnapshot(state),
            credential: provider.authentication.type !== "none"
              ? provider.authentication.credential
              : null,
          },
        };
      });

      await this.#removeObsoleteCredential(outcome.credential);
      return outcome.configuration;
    } finally {
      lifecycle.change?.release();
    }
  }

  reserveChange(
    baseRevision: string,
    providerId: string,
  ): Promise<AgentConfigurationProviderChange> {
    return this.#read((state) => {
      assertAgentConfigurationRevision(state, baseRevision);
      if (!state.providers.some(({ id }) => id === providerId)) {
        throw new AgentConfigurationValidationError(
          "Agent provider does not exist",
        );
      }
      return this.#beginProviderChange(state, providerId);
    });
  }

  async prepareCodexDeviceLogin(
    baseRevision: string,
    providerId: string,
    loginId: string,
    change: AgentConfigurationProviderChange | null = null,
  ) {
    const credentialVersion = await this.#read((state) => {
      assertAgentConfigurationRevision(state, baseRevision);
      const provider = state.providers.find(({ id }) => id === providerId);

      if (!provider || provider.kind !== "codex" ||
          provider.authentication.type !== "chatgpt-device-code") {
        throw new AgentConfigurationValidationError(
          "Codex device login requires a device-code provider",
        );
      }
      if (change) this.#access.assertProviderChange(change, providerId);
      return (provider.authentication.credential?.version ?? 0) + 1;
    });
    const { home } = await this.#credentialStore.prepareCodexManagedHome(
      providerId,
      credentialVersion,
      loginId,
    );

    return { credentialVersion, home };
  }

  removeCodexDeviceLoginStaging(
    providerId: string,
    credentialVersion: number,
    loginId: string,
  ) {
    return this.#credentialStore.removeCodexStagingHome(
      providerId,
      credentialVersion,
      loginId,
    );
  }

  async completeCodexDeviceLogin(
    baseRevision: string,
    providerId: string,
    credentialVersion: number,
    loginId: string,
    reservedChange: AgentConfigurationProviderChange | null = null,
  ) {
    const ownsChange = reservedChange === null;
    let change = reservedChange;
    let credential: AgentCredentialReference | null = null;
    let candidateMayBeAuthoritative = false;

    try {
      const activeChange = change ?? await this.reserveChange(
        baseRevision,
        providerId,
      );

      change = activeChange;
      this.#access.assertProviderChange(activeChange, providerId);
      const activatedCredential =
        await this.#credentialStore.activateCodexManagedHome(
          providerId,
          credentialVersion,
          loginId,
        );
      credential = activatedCredential;
      const outcome = await this.#mutate((state) => {
        assertAgentConfigurationRevision(state, baseRevision);
        this.#access.assertProviderChange(activeChange, providerId);
        const provider = state.providers.find(({ id }) => id === providerId);

        if (!provider || provider.kind !== "codex" ||
            provider.authentication.type !== "chatgpt-device-code") {
          throw new AgentConfigurationValidationError(
            "Codex device login provider changed",
          );
        }
        const previousCredential = provider.authentication.credential;

        provider.authentication = {
          credential: activatedCredential,
          type: "chatgpt-device-code",
        };
        candidateMayBeAuthoritative = true;
        provider.version += 1;
        invalidateProviderConformance(state, providerId);
        return {
          changed: true,
          result: {
            configuration: configurationSnapshot(state),
            previousCredential,
          },
        };
      });

      await this.#removeObsoleteCredential(outcome.previousCredential);
      return outcome.configuration;
    } catch (error) {
      if (credential) {
        await this.#removeRejectedCredentialCandidate(
          credential,
          candidateMayBeAuthoritative,
          error,
        );
      } else {
        await this.#credentialStore.removeCodexStagingHome(
          providerId,
          credentialVersion,
          loginId,
        ).catch(() => undefined);
      }
      throw error;
    } finally {
      if (ownsChange) change?.release();
    }
  }

  async clearAuthentication(baseRevision: string, providerId: string) {
    const lifecycle: { change: AgentConfigurationProviderChange | null } = {
      change: null,
    };

    try {
      const outcome = await this.#mutate((state) => {
        assertAgentConfigurationRevision(state, baseRevision);
        const provider = state.providers.find(({ id }) => id === providerId);

        if (!provider || provider.authentication.type === "none") {
          throw new AgentConfigurationValidationError(
            "Agent provider authentication cannot be cleared",
          );
        }
        lifecycle.change = this.#beginProviderChange(state, providerId);
        const credential = provider.authentication.credential;

        provider.authentication = {
          credential: null,
          type: provider.authentication.type,
        };
        provider.version += 1;
        invalidateProviderConformance(state, providerId);
        return {
          changed: true,
          result: { configuration: configurationSnapshot(state), credential },
        };
      });

      await this.#removeObsoleteCredential(outcome.credential);
      return outcome.configuration;
    } finally {
      lifecycle.change?.release();
    }
  }

  async #authenticationForInput(
    providerId: string,
    input: AgentProviderInput,
    previous: StoredAuthentication | null = null,
  ): Promise<{
    authentication: StoredAuthentication;
    candidate: AgentCredentialReference | null;
  }> {
    if (input.authenticationType === "none") {
      return { authentication: { type: "none" }, candidate: null };
    }
    if (input.authenticationType === "chatgpt-device-code") {
      return {
        authentication: previous?.type === "chatgpt-device-code"
          ? previous
          : { credential: null, type: "chatgpt-device-code" },
        candidate: null,
      };
    }
    if (input.apiKey === undefined) {
      return {
        authentication: previous?.type === "api-key"
          ? previous
          : { credential: null, type: "api-key" },
        candidate: null,
      };
    }
    const previousVersion = previous?.type === "api-key"
      ? previous.credential?.version ?? 0
      : 0;
    const credential = await this.#credentialStore.writeApiKey(
      providerId,
      input.apiKey,
      previousVersion + 1,
    );

    return {
      authentication: { credential, type: "api-key" },
      candidate: credential,
    };
  }

  #beginProviderChange(
    state: AgentConfigurationState,
    providerId: string,
  ) {
    return this.#access.beginProviderChange(
      providerId,
      state.profiles
        .filter(({ providerId: candidate }) => candidate === providerId)
        .map(({ id }) => id),
    );
  }

  async #removeObsoleteCredential(
    credential: AgentCredentialReference | null,
  ) {
    if (!credential) return;
    await this.#credentialStore.remove(credential).catch(() => undefined);
  }

  async #removeRejectedCredentialCandidate(
    candidate: AgentCredentialReference | null,
    candidateMayBeAuthoritative: boolean,
    error: unknown,
  ) {
    if (!candidate ||
        (candidateMayBeAuthoritative &&
          error instanceof SecureStateCommitOutcomeUnknownError)) return;
    await this.#credentialStore.remove(candidate).catch(() => undefined);
  }
}
