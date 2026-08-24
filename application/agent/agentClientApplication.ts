// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentClientController,
  AgentClientState,
} from "./agentClientController.ts";
import type {
  AgentConfigurationController,
  AgentConfigurationState,
} from "./agentConfigurationController.ts";

export type AgentScopeOption = Readonly<{
  id: string;
  label: string;
}>;

export type AgentScopeCatalog = Readonly<{
  activeWorkspace: Readonly<{
    folderOptions: readonly AgentScopeOption[];
    noteOptions: readonly AgentScopeOption[];
    repositoryId: string;
  }> | null;
  journalEntryOptions: readonly AgentScopeOption[];
  repositoryOptions: readonly AgentScopeOption[];
  todoCollectionOptions: readonly AgentScopeOption[];
}>;

export type AgentApplication = Readonly<{
  configurationController: AgentConfigurationController;
  configurationState: AgentConfigurationState;
  controller: AgentClientController;
  scopeCatalog: AgentScopeCatalog;
  state: AgentClientState;
}>;
