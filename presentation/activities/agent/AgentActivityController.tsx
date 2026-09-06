// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentApplication } from "../../../application/agent";
import { useState } from "react";
import type { ActivityControllerProps } from "../../ui/activityController";
import { createAgentActivitySlots } from "./AgentActivitySlots";

export function AgentActivityController({
  active,
  application,
  renderActivity,
}: AgentActivityControllerProps) {
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

export type AgentActivityApplication = { agent: AgentApplication; };
export type AgentActivityControllerProps = ActivityControllerProps<AgentActivityApplication>;
