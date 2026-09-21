// SPDX-License-Identifier: GPL-3.0-or-later

import {
  usePageDriver,
  usePageNavigation,
  describePage,
  pageKey,
  usePageViewState,
} from "../../navigation/index.ts";

import { useState } from "react";
import type { AgentApplication } from "../../../application/agent/index.ts";
import type { ActivityControllerProps } from "../../ui/index.ts";
import { createAgentActivitySlots } from "./AgentActivitySlots.tsx";

export function AgentActivityController({
  active,
  application,
  renderActivity,
}: AgentActivityControllerProps) {
  const [creatingSession, setCreatingSession] = useState(false);

  const pages = usePageNavigation();
  const sessionPage = (id: string) => {
    const session = application.agent.state.sessions.find((s) => s.id === id);
    return session
      ? describePage("agent", "agent-session", id, session.profileLabel)
      : null;
  };
  const activeSessionKey = pageKey(
    describePage(
      "agent",
      "agent-session",
      application.agent.state.activeSessionId ?? "empty",
      "",
    ).target,
  );
  const [selectedProposalId, setSelectedProposalId] = usePageViewState(
    activeSessionKey,
    "proposal",
    "",
  );
  const createPage = describePage("agent", "agent-create", "new", "新建会话");
  usePageDriver("agent", {
    ready: application.agent.state.loadStatus !== "loading",
    current: () =>
      creatingSession
        ? createPage
        : application.agent.state.activeSessionId
          ? sessionPage(application.agent.state.activeSessionId)
          : describePage("agent", "activity", "agent", "智能体"),
    describe: (target) =>
      target.kind === "agent-session"
        ? sessionPage(target.id)
        : target.kind === "agent-create"
          ? createPage
          : describePage("agent", "activity", "agent", "智能体"),
    select: (target) => {
      if (target.kind === "agent-session") {
        if (!sessionPage(target.id)) return false;
        application.agent.controller.selectSession(target.id);
        setCreatingSession(false);
      } else if (target.kind === "agent-create") setCreatingSession(true);
    },
  });
  if (!active) return null;

  return renderActivity(() =>
    createAgentActivitySlots({
      agent: application.agent,
      selectedProposalId,
      onSelectProposal: setSelectedProposalId,
      creatingSession,
      onBeginCreateSession: () => {
        pages.open(createPage, "preview", () => setCreatingSession(true));
      },
      onSelectSession: () => {
        setCreatingSession(false);
      },
      onCreated: () => {
        pages.created("agent", () => setCreatingSession(false));
      },
    }),
  );
}

export type AgentActivityApplication = { agent: AgentApplication };
export type AgentActivityControllerProps =
  ActivityControllerProps<AgentActivityApplication>;
