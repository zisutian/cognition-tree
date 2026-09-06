// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentApplication } from "../../../application/agent/index.ts";
import type { ActivitySlots } from "../../ui/index.ts";
import { AgentContextPanel } from "./AgentContextPanel.tsx";
import { AgentConversationPanel } from "./AgentConversationPanel.tsx";
import { AgentProposalPanel } from "./AgentProposalPanel.tsx";
import { AgentSessionCreatePanel } from "./AgentSessionCreatePanel.tsx";
import "./agent.css";

export function createAgentActivitySlots({
  agent,
  creatingSession,
  onBeginCreateSession,
  onCollapseDetail,
  onSelectSession,
}: {
  agent: AgentApplication;
  creatingSession: boolean;
  onBeginCreateSession(): void;
  onCollapseDetail(): void;
  onSelectSession(): void;
}): ActivitySlots {
  return {
    context: {
      content: (
        <AgentContextPanel
          agent={agent}
          creatingSession={creatingSession}
          onBeginCreateSession={onBeginCreateSession}
          onSelectSession={onSelectSession}
        />
      ),
      title: "智能体",
    },
    detail:
      !creatingSession &&
      agent.state.sessions.some(
        (session) =>
          session.id === agent.state.activeSessionId &&
          session.proposals.length > 0,
      ) ? (
        <AgentProposalPanel agent={agent} onCollapseDetail={onCollapseDetail} />
      ) : null,
    main: creatingSession ? (
      <AgentSessionCreatePanel agent={agent} onCreated={onSelectSession} />
    ) : (
      <AgentConversationPanel agent={agent} />
    ),
  };
}
