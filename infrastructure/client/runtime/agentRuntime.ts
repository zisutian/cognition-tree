// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createAgentClientController,
  createAgentConfigurationController,
  type AgentScope,
} from "../../../application/agent/index.ts";
import {
  createHttpAgentClient,
  createHttpAgentConfigurationClient,
} from "../http/index.ts";

import {
  clientApplicationScheduler,
  createClientAgentProfilePreference,
} from "../platform/index.ts";

import type { OfficialClientApi } from "../http/index.ts";
import type { ProblemReporter } from "../../../application/problems/index.ts";

export function createClientAgentRuntime(
  api: OfficialClientApi,
  flushScope: (scope: AgentScope) => Promise<void>,
  problemReporter: ProblemReporter<"agent">,
) {
  const session = createAgentClientController({
    flushScope,
    port: createHttpAgentClient({
      baseUrl: api.baseUrl,
    }),
    problemReporter,
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

  return {
    configuration,
    dispose() {
      configuration.dispose();
      session.dispose();
    },
    session,
  };
}
