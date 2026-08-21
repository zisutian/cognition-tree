// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentApplication } from "../../../application/agent";

export function createAgentApplicationFixture(): AgentApplication {
  return {
    controller: {
      cancel: async () => undefined,
      confirmDestruction: async () => undefined,
      createSession: async () => undefined,
      decideProposal: async () => undefined,
      deleteSession: async () => undefined,
      dispose: () => undefined,
      getSnapshot: () => ({
        activeSessionId: null,
        errorMessage: null,
        loadStatus: "ready",
        operationStatus: "idle",
        preferredProfileId: null,
        problems: [],
        sessions: [],
        status: { configurationProblem: null, enabled: false, profiles: [] },
      }),
      reload: async () => undefined,
      refreshStatus: async () => undefined,
      selectSession: () => undefined,
      setPreferredProfile: () => undefined,
      sendMessage: async () => undefined,
      start: () => undefined,
      subscribe: () => () => undefined,
    },
    scopeCatalog: {
      activeWorkspace: null,
      journalEntryOptions: [],
      repositoryOptions: [],
      todoCollectionOptions: [],
    },
    state: {
      activeSessionId: null,
      errorMessage: null,
      loadStatus: "ready",
      operationStatus: "idle",
      preferredProfileId: null,
      problems: [],
      sessions: [],
      status: { configurationProblem: null, enabled: false, profiles: [] },
    },
  };
}
