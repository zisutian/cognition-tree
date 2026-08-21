// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createAgentClientController,
  type AgentScope,
} from "../../../application/agent";
import { createHttpAgentClient } from "../http/agentClient";
import { clientApplicationScheduler } from "../platform/applicationServices";
import { createClientAgentProfilePreference } from "../platform/agentProfilePreference";
import type { ClientApiConfiguration } from "./apiConfiguration";

export function createClientAgentRuntime(
  api: ClientApiConfiguration,
  flushScope: (scope: AgentScope) => Promise<void>,
) {
  return createAgentClientController({
    flushScope,
    port: createHttpAgentClient({
      baseUrl: api.baseUrl,
      token: api.token,
    }),
    profilePreference: createClientAgentProfilePreference(),
    scheduler: clientApplicationScheduler,
  });
}
