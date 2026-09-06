// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentProfileInput,
  AgentToolCallMode,
} from "../../../application/agent/agentConfiguration.ts";
import type { AgentConfigurationAccess } from "../../../application/agentHost/configurationAccess.ts";
import { AgentConfigurationValidationError } from "../../../application/agentHost/configurationErrors.ts";
import { normalizeProfileInput } from "./configurationInput.ts";
import { assertAgentConfigurationRevision } from "./configurationRevision.ts";
import type {
  AgentConfigurationState,
  StoredProfile,
} from "./configurationStateCodec.ts";
import { requireAgentConfigurationProvider } from "./configurationStateLookup.ts";
import {
  configurationSnapshot,
  profileDigest,
  profileView,
  providerDigest,
} from "./configurationViews.ts";

type MutateAgentConfiguration = <Result>(
  operation: (
    state: AgentConfigurationState,
  ) => { changed: boolean; result: Result },
) => Promise<Result>;

export class AgentProfileConfiguration {
  readonly #access: AgentConfigurationAccess;
  readonly #createId: () => string;
  readonly #mutate: MutateAgentConfiguration;

  constructor({
    access,
    createId,
    mutate,
  }: {
    access: AgentConfigurationAccess;
    createId: () => string;
    mutate: MutateAgentConfiguration;
  }) {
    this.#access = access;
    this.#createId = createId;
    this.#mutate = mutate;
  }

  create(baseRevision: string, input: AgentProfileInput) {
    return this.#mutate((state) => {
      assertAgentConfigurationRevision(state, baseRevision);
      const provider = state.providers.find(({ id }) => id === input.providerId);

      if (!provider) {
        throw new AgentConfigurationValidationError("Agent provider does not exist");
      }
      const profile: StoredProfile = {
        ...normalizeProfileInput(input, provider),
        conformance: null,
        id: `agent-profile-${this.#createId()}`,
        version: 1,
      };

      state.profiles.push(profile);
      return {
        changed: true,
        result: {
          configuration: configurationSnapshot(state),
          profile: profileView(profile, provider),
        },
      };
    });
  }

  update(
    baseRevision: string,
    profileId: string,
    input: AgentProfileInput,
  ) {
    return this.#mutate((state) => {
      assertAgentConfigurationRevision(state, baseRevision);
      const index = state.profiles.findIndex(({ id }) => id === profileId);

      if (index < 0) {
        throw new AgentConfigurationValidationError("Agent profile does not exist");
      }
      const provider = state.providers.find(({ id }) => id === input.providerId);

      if (!provider) {
        throw new AgentConfigurationValidationError("Agent provider does not exist");
      }
      const previous = state.profiles[index];

      if (!previous) {
        throw new AgentConfigurationValidationError(
          "Agent profile does not exist",
        );
      }
      const profile: StoredProfile = {
        ...normalizeProfileInput(input, provider),
        conformance: null,
        id: previous.id,
        version: previous.version + 1,
      };

      state.profiles[index] = profile;
      return {
        changed: true,
        result: {
          configuration: configurationSnapshot(state),
          profile: profileView(profile, provider),
        },
      };
    });
  }

  delete(baseRevision: string, profileId: string) {
    return this.#mutate((state) => {
      assertAgentConfigurationRevision(state, baseRevision);
      const index = state.profiles.findIndex(({ id }) => id === profileId);

      if (index < 0) {
        throw new AgentConfigurationValidationError("Agent profile does not exist");
      }
      this.#access.assertProfileCanBeDeleted(profileId);
      state.profiles.splice(index, 1);
      return { changed: true, result: configurationSnapshot(state) };
    });
  }

  setConformance(
    baseRevision: string,
    profileId: string,
    input: { checkedAt: string; toolCallMode: AgentToolCallMode },
  ) {
    return this.#mutate((state) => {
      assertAgentConfigurationRevision(state, baseRevision);
      const profile = state.profiles.find(({ id }) => id === profileId);

      if (!profile) {
        throw new AgentConfigurationValidationError("Agent profile does not exist");
      }
      const provider = requireAgentConfigurationProvider(
        state,
        profile.providerId,
      );

      if (profile.parameters.kind !== "chat") {
        throw new AgentConfigurationValidationError(
          "Codex profiles do not use chat conformance",
        );
      }
      if (profile.parameters.toolCallMode !== input.toolCallMode) {
        throw new AgentConfigurationValidationError(
          "Conformance mode does not match the profile",
        );
      }
      if (!Number.isFinite(Date.parse(input.checkedAt))) {
        throw new AgentConfigurationValidationError(
          "Conformance timestamp is invalid",
        );
      }
      profile.conformance = {
        checkedAt: input.checkedAt,
        profileDigest: profileDigest(profile),
        providerDigest: providerDigest(provider),
        toolCallMode: input.toolCallMode,
      };
      return {
        changed: true,
        result: {
          configuration: configurationSnapshot(state),
          profile: profileView(profile, provider),
        },
      };
    });
  }
}
