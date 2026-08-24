// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createAgentClientController,
  createAgentConfigurationController,
  type AgentScope,
} from "../../../application/agent";
import { createHttpAgentClient } from "../http/agentClient";
import { createHttpAgentConfigurationClient } from "../http/agentConfigurationClient";
import { clientApplicationScheduler } from "../platform/applicationServices";
import { createClientAgentProfilePreference } from "../platform/agentProfilePreference";
import type { ClientApiConfiguration } from "./apiConfiguration";

export function createClientAgentRuntime(
  api: ClientApiConfiguration,
  flushScope: (scope: AgentScope) => Promise<void>,
) {
  const session = createAgentClientController({
    flushScope,
    port: createHttpAgentClient({
      baseUrl: api.baseUrl,
      token: api.token,
    }),
    profilePreference: createClientAgentProfilePreference(),
    scheduler: clientApplicationScheduler,
  });
  const configuration = createAgentConfigurationController({
    onConfigurationChanged: session.refreshStatus,
    port: createHttpAgentConfigurationClient({
      baseUrl: api.baseUrl,
      token: api.token,
    }),
  });

  return { configuration, session };
}
