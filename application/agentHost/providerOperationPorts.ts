// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentCodexDeviceLoginStatus, AgentConformanceCheckStatus, AgentOllamaDiscovery, AgentProviderProbe } from '../agent/agentConfiguration.ts';

export type AgentDeviceLoginPort = {
  start(baseRevision: string, providerId: string): Promise<AgentCodexDeviceLoginStatus>;
  get(loginId: string): AgentCodexDeviceLoginStatus | null;
  cancel(loginId: string): Promise<AgentCodexDeviceLoginStatus | null>;
  hasPending(providerId?: string): boolean;
  dispose(): Promise<void>;
};
export type AgentConformancePort = {
  start(baseRevision: string, profileId: string): Promise<AgentConformanceCheckStatus>;
  get(checkId: string): AgentConformanceCheckStatus | null;
  cancel(checkId: string): AgentConformanceCheckStatus | null;
  hasActiveOperations(): boolean;
  dispose(): Promise<void>;
};
export type AgentProviderProbePort = {
  discoverOllama(endpointValue: string): Promise<AgentOllamaDiscovery>;
  probe(providerId: string): Promise<AgentProviderProbe>;
};
