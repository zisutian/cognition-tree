// SPDX-License-Identifier: GPL-3.0-or-later

import { Plus } from "lucide-react";
import type { AgentApplication } from "../../../application/agent/index.ts";
import { Button, type ActivitySlots } from "../../ui/index.ts";
import { AgentContextPanel } from "./AgentContextPanel.tsx";
import { AgentConversationPanel } from "./AgentConversationPanel.tsx";
import { AgentProposalPanel } from "./AgentProposalPanel.tsx";
import { AgentSessionCreatePanel } from "./AgentSessionCreatePanel.tsx";

export function createAgentActivitySlots({
  agent,
  creatingSession,
  onBeginCreateSession,
  onSelectSession,
}: {
  agent: AgentApplication;
  creatingSession: boolean;
  onBeginCreateSession(): void;
  onSelectSession(): void;
}): ActivitySlots {
  const session = agent.state.sessions.find(
    (item) => item.id === agent.state.activeSessionId,
  );
  return {
    context: {
      actions: (
        <Button
          aria-label="新建会话"
          title="新建会话"
          variant="icon"
          type="button"
          onClick={onBeginCreateSession}
        >
          <Plus aria-hidden="true" />
        </Button>
      ),
      content: (
        <AgentContextPanel
          agent={agent}
          creatingSession={creatingSession}
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
      )
        ? {
            title: "Proposal",
            layout: "detail",
            collapseLabel: "折叠 Proposal",
            content: <AgentProposalPanel agent={agent} />,
          }
        : null,
    main: {
      title: creatingSession
        ? "新建会话"
        : session
          ? `${session.profileLabel} · ${session.profileModel}`
          : "智能体",
      layout: creatingSession ? "form" : "conversation",
      content: creatingSession ? (
        <AgentSessionCreatePanel agent={agent} onCreated={onSelectSession} />
      ) : (
        <AgentConversationPanel
          agent={agent}
          onBeginCreateSession={onBeginCreateSession}
        />
      ),
    },
  };
}
