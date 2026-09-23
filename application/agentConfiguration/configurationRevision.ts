// SPDX-License-Identifier: GPL-3.0-or-later

import { AgentConfigurationConflictError } from "./configurationErrors.ts";
import type { AgentConfigurationState } from "./configurationState.ts";
import type { AgentConfigurationViews } from "./configurationViews.ts";

export function assertAgentConfigurationRevision(
  state: AgentConfigurationState,
  baseRevision: string,
  views: AgentConfigurationViews,
) {
  const current = views.stateRevision(state);

  if (baseRevision !== current) {
    throw new AgentConfigurationConflictError(current);
  }
}
