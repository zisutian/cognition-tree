// SPDX-License-Identifier: GPL-3.0-or-later

import { Button } from "compact-ui";

import { Plus } from "lucide-react";
import type {
  AgentApplication,
} from "../../../application/agentClient/index.ts";
import { type ActivitySlots } from "../../ui/index.ts";
import { AgentContextPanel } from "./AgentContextPanel.tsx";
import { AgentConversationComposer } from "./AgentConversationComposer.tsx";
import { AgentConversationPanel } from "./AgentConversationPanel.tsx";
import {
  AgentProposalPanel,
  AgentProposalActions,
} from "./AgentProposalPanel.tsx";
import { AgentSessionCreatePanel } from "./AgentSessionCreatePanel.tsx";

export function createAgentActivitySlots({
  agent,
  creatingSession,
  onBeginCreateSession,
  onSelectSession,
  onCreated = onSelectSession,
  selectedProposalId = "",
  onSelectProposal = () => undefined,
}: {
  agent: AgentApplication;
  creatingSession: boolean;
  onBeginCreateSession(): void;
  onSelectSession(): void;
  onCreated?(): void;
  selectedProposalId?: string;
  onSelectProposal?(id: string): void;
}): ActivitySlots {
  const session = agent.state.sessions.find(
    (item) => item.id === agent.state.activeSessionId,
  );
  const proposal =
    session?.proposals.find((item) => item.id === selectedProposalId) ??
    [...(session?.proposals ?? [])]
      .reverse()
      .find(
        (item) =>
          item.status === "pending" ||
          item.status === "awaiting-destructive-confirmation",
      ) ??
    session?.proposals.at(-1) ??
    null;
  return {
    context: {
      actions: (
        <Button
          aria-label="新建会话"
          title="新建会话"
          appearance="plain"
          iconOnly
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
            content: (
              <AgentProposalPanel
                agent={agent}
                proposal={proposal}
                onSelect={onSelectProposal}
              />
            ),
            footer: <AgentProposalActions agent={agent} proposal={proposal} />,
          }
        : null,
    main: {
      title: creatingSession
        ? "新建会话"
        : session
          ? `${session.profileLabel} · ${session.profileModel}`
          : "智能体",
      layout: creatingSession ? "form" : "conversation",
      footer:
        !creatingSession && session ? (
          <AgentConversationComposer key={session.id} agent={agent} />
        ) : undefined,
      content: creatingSession ? (
        <AgentSessionCreatePanel agent={agent} onCreated={onCreated} />
      ) : (
        <AgentConversationPanel agent={agent} key={session?.id ?? "empty"} />
      ),
    },
  };
}
