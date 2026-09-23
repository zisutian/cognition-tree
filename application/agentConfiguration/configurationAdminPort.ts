// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentConfigurationSnapshot,
  AgentProfileInput,
  AgentProviderInput,
} from "./agentConfiguration.ts";

/** Commands available to the administration transport. */
export type AgentConfigurationAdminPort = {
  readSnapshot(): Promise<AgentConfigurationSnapshot>;
  createProfile(baseRevision: string, input: AgentProfileInput): Promise<{configuration: AgentConfigurationSnapshot}>;
  updateProfile(baseRevision: string, profileId: string, input: AgentProfileInput): Promise<{configuration: AgentConfigurationSnapshot}>;
  deleteProfile(baseRevision: string, profileId: string): Promise<AgentConfigurationSnapshot>;
  createProvider(baseRevision: string, input: AgentProviderInput): Promise<{configuration: AgentConfigurationSnapshot}>;
  updateProvider(baseRevision: string, providerId: string, input: AgentProviderInput): Promise<{configuration: AgentConfigurationSnapshot}>;
  deleteProvider(baseRevision: string, providerId: string): Promise<AgentConfigurationSnapshot>;
  clearProviderAuthentication(baseRevision: string, providerId: string): Promise<AgentConfigurationSnapshot>;
};
