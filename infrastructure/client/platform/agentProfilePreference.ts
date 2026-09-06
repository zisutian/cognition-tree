// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentProfilePreferencePort,
} from "../../../application/agent/index.ts";

const agentProfileStorageKey = "cognition-tree.agent-profile";

function getStorage() {
  return globalThis.localStorage ?? null;
}

export function createClientAgentProfilePreference(): AgentProfilePreferencePort {
  return {
    clear() {
      try {
        getStorage()?.removeItem(agentProfileStorageKey);
      } catch {
        // The explicit profile remains in application memory when storage fails.
      }
    },
    load() {
      try {
        return getStorage()?.getItem(agentProfileStorageKey) ?? null;
      } catch {
        return null;
      }
    },
    save(profileId) {
      try {
        getStorage()?.setItem(agentProfileStorageKey, profileId);
      } catch {
        // The explicit profile remains in application memory when storage fails.
      }
    },
  };
}
