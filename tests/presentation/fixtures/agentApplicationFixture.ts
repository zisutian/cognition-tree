// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentApplication } from "../../../application/agent";

export function createAgentApplicationFixture(): AgentApplication {
  return {
    configurationController: {
      checkConformance: async () => undefined,
      createProfile: async () => undefined,
      createProvider: async () => undefined,
      deleteProfile: async () => undefined,
      deleteProvider: async () => undefined,
      discoverOllama: async () => undefined,
      getSnapshot: () => ({
        configuration: null,
        discovery: null,
        errorMessage: null,
        loadStatus: "ready",
        operationStatus: "idle",
        probes: {},
      }),
      load: async () => undefined,
      probeProvider: async () => undefined,
      subscribe: () => () => undefined,
      updateProfile: async () => undefined,
      updateProvider: async () => undefined,
    },
    configurationState: {
      configuration: null,
      discovery: null,
      errorMessage: null,
      loadStatus: "ready",
      operationStatus: "idle",
      probes: {},
    },
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
