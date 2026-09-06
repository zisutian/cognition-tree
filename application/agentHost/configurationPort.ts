// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentConfigurationSnapshot, AgentProfileView, AgentProviderView, AgentToolCallMode } from '../agent/agentConfiguration.ts';
import type { AgentConfigurationProfileUse } from './configurationAccess.ts';

export type ResolvedAgentProvider = Readonly<{
  apiKey: string | null;
  codexHome: string | null;
  privateNetworkOrigin: string | null;
  provider: AgentProviderView;
}>;
export type ResolvedAgentConfiguration = ResolvedAgentProvider & Readonly<{ profile: AgentProfileView }>;
export type AgentConfigurationPort = {
  access: { beginProfileUse(profileId: string): AgentConfigurationProfileUse };
  readSnapshot(): Promise<AgentConfigurationSnapshot>;
  resolveProfile(profileId: string, use?: AgentConfigurationProfileUse): Promise<ResolvedAgentConfiguration | null>;
};

export type AgentConformanceConfigurationPort = Pick<AgentConfigurationPort, 'readSnapshot' | 'resolveProfile'> & {
  setConformance(baseRevision: string, profileId: string, input: {checkedAt: string; toolCallMode: AgentToolCallMode}): Promise<unknown>;
};
