// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentConfigurationState,
} from "./configurationState.ts";

export function requireAgentConfigurationProvider(
  state: AgentConfigurationState,
  providerId: string,
) {
  const provider = state.providers.find(({ id }) => id === providerId);

  if (!provider) {
    throw new Error(`Profile provider does not exist: ${providerId}`);
  }
  return provider;
}
