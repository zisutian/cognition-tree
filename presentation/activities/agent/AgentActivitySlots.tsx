// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentApplication } from "../../../application/agent";
import type { ActivitySlots } from "../../ui/activityTypes";
import { AgentContextPanel } from "./AgentContextPanel";
import { AgentConversationPanel } from "./AgentConversationPanel";
import { AgentProposalPanel } from "./AgentProposalPanel";
import "./agent.css";

export function createAgentActivitySlots({
  agent,
  onCollapseDetail,
}: {
  agent: AgentApplication;
  onCollapseDetail(): void;
}): ActivitySlots {
  return {
    context: {
      content: <AgentContextPanel agent={agent} />,
      title: "Agent",
    },
    detail: (
      <AgentProposalPanel
        agent={agent}
        onCollapseDetail={onCollapseDetail}
      />
    ),
    main: <AgentConversationPanel agent={agent} />,
  };
}
