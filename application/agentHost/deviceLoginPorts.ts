// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentConfigurationProviderChange } from './configurationAccess.ts';

export type AgentDeviceLoginCompletion = {loginId: string | null; success: boolean; error: string | null};
export type AgentDeviceLoginProcess = {
  initialize(): Promise<void>;
  start(): Promise<{loginId: string; userCode: string; verificationUrl: string}>;
  subscribe(listener: (result: AgentDeviceLoginCompletion) => void): void;
  cancel(loginId: string): Promise<void>;
  onExit(listener: () => void): void;
  hasExited(): boolean;
  stop(): Promise<void>;
  cleanup(): Promise<void>;
};
export type AgentDeviceLoginProcessPort = {create(credentialHome: string): Promise<AgentDeviceLoginProcess>};
export type AgentDeviceLoginConfigurationPort = {
  reserveProviderChange(baseRevision: string, providerId: string): Promise<AgentConfigurationProviderChange>;
  prepareCodexDeviceLogin(baseRevision: string, providerId: string, loginId: string, change: AgentConfigurationProviderChange): Promise<{credentialVersion: number; home: string}>;
  removeCodexDeviceLoginStaging(providerId: string, credentialVersion: number, loginId: string): Promise<void>;
  completeCodexDeviceLogin(baseRevision: string, providerId: string, credentialVersion: number, loginId: string, change: AgentConfigurationProviderChange): Promise<unknown>;
};
