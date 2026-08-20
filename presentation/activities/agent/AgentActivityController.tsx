// SPDX-License-Identifier: GPL-3.0-or-later

import type { ActivityControllerProps } from "../activityController";
import { createAgentActivitySlots } from "./AgentActivitySlots";

export function AgentActivityController({
  active,
  application,
  renderActivity,
}: ActivityControllerProps) {
  if (!active) return null;

  return renderActivity((controls) =>
    createAgentActivitySlots({
      agent: application.agent,
      onCollapseDetail: controls.onCollapseDetail,
    }),
  );
}
