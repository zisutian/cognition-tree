// SPDX-License-Identifier: GPL-3.0-or-later

import { AgentConfigurationConflictError } from "../../../application/agentHost/configurationErrors.ts";
import type { AgentConfigurationState } from "./configurationStateCodec.ts";
import { stateRevision } from "./configurationViews.ts";

export function assertAgentConfigurationRevision(
  state: AgentConfigurationState,
  baseRevision: string,
) {
  const current = stateRevision(state);

  if (baseRevision !== current) {
    throw new AgentConfigurationConflictError(current);
  }
}
