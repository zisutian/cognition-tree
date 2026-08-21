// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "react";
import type { ActivityControllerProps } from "../activityController";
import { createAgentActivitySlots } from "./AgentActivitySlots";

export function AgentActivityController({
  active,
  application,
  renderActivity,
}: ActivityControllerProps) {
  const [creatingSession, setCreatingSession] = useState(false);

  if (!active) return null;

  return renderActivity((controls) =>
    createAgentActivitySlots({
      agent: application.agent,
      creatingSession,
      onBeginCreateSession: () => setCreatingSession(true),
      onCollapseDetail: controls.onCollapseDetail,
      onSelectSession: () => setCreatingSession(false),
    }),
  );
}
