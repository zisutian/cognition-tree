// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentCredentialReference } from "./configurationState.ts";

export type AgentConfigurationCredentialsPort = {
  writeApiKey(providerId: string, apiKey: string, version: number): Promise<AgentCredentialReference>;
  prepareCodexManagedHome(providerId: string, version: number, loginId: string): Promise<{home: string}>;
  activateCodexManagedHome(providerId: string, version: number, loginId: string): Promise<AgentCredentialReference>;
  removeCodexStagingHome(providerId: string, version: number, loginId: string): Promise<void>;
  remove(reference: AgentCredentialReference): Promise<void>;
};
