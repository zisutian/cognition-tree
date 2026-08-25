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
import type { OfficialClientApi } from "../http/apiTransport";

export function createClientAgentRuntime(
  api: OfficialClientApi,
  flushScope: (scope: AgentScope) => Promise<void>,
) {
  const session = createAgentClientController({
    flushScope,
    port: createHttpAgentClient({
      baseUrl: api.baseUrl,
    }),
    profilePreference: createClientAgentProfilePreference(),
    scheduler: clientApplicationScheduler,
  });
  const configuration = createAgentConfigurationController({
    onConfigurationChanged: session.refreshStatus,
    pollConformance: (milliseconds) =>
      new Promise<void>((resolve) =>
        globalThis.setTimeout(resolve, milliseconds)
      ),
    pollConformanceIntervalMilliseconds: 1_000,
    port: createHttpAgentConfigurationClient({
      baseUrl: api.baseUrl,
    }),
  });

  return { configuration, session };
}
