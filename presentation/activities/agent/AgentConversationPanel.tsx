// SPDX-License-Identifier: GPL-3.0-or-later

import { StatusText as StatusBadge } from "compact-ui";
import { Button, EmptyState, List, ManagementRow } from "compact-ui";
import { createClassNames } from "../../ui/index.ts";
import agentStyles from "./agent.module.css";
const cx = createClassNames(agentStyles);

import { Square } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  usePageNavigation,
  pageKey,
  describePage,
} from "../../navigation/index.ts";
import type { AgentApplication } from "../../../application/agent/index.ts";
import { FormError, Page, PageBody, useFeedback } from "../../ui/index.ts";

import {
  agentSessionStateLabels,
  formatAgentScopeLabel,
} from "./agentViewLabels.ts";

export function AgentConversationPanel({
  agent,
  onBeginCreateSession,
}: {
  agent: AgentApplication;
  onBeginCreateSession(): void;
}) {
  const feedback = useFeedback();
  const pages = usePageNavigation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const session =
    agent.state.sessions.find(({ id }) => id === agent.state.activeSessionId) ??
    null;
  const messageLength =
    session?.messages.reduce(
      (length, message) => length + message.content.length,
      0,
    ) ?? 0;
  const sessionKey = pageKey(
    describePage("agent", "agent-session", session?.id ?? "", "").target,
  );
  const followTail = useRef(true);
  const previousLength = useRef(messageLength);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const saved = pages.viewSessions.read<{ top: number; follow: boolean }>(
      sessionKey,
      "conversation-scroll",
    );
    element.scrollTop = saved?.top ?? element.scrollHeight;
    followTail.current = saved?.follow ?? true;
  }, [pages, sessionKey]);

  useEffect(() => {
    if (
      scrollRef.current &&
      followTail.current &&
      previousLength.current !== messageLength
    ) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    previousLength.current = messageLength;
  }, [messageLength, session?.messages.length]);

  if (!session) {
    return (
      <Page aria-label="Agent 对话">
        <EmptyState
          title="没有会话"
          action={
            <Button onClick={onBeginCreateSession} type="button">
              新建会话
            </Button>
          }
        />
      </Page>
    );
  }
  const canCancel = session.state === "queued" || session.state === "running";
  return (
    <Page
      summary={
        <span
          aria-label="会话范围"
          title={`Profile v${session.profileVersion}`}
        >
          {formatAgentScopeLabel(session.scope)}
        </span>
      }
      actions={
        <>
          <StatusBadge
            mode="live"
            tone={session.state === "unavailable" ? "danger" : "neutral"}
          >
            {agentSessionStateLabels[session.state]}
          </StatusBadge>
          {canCancel ? (
            <Button
              onClick={() => void feedback.runAction(agent.controller.cancel)}
              title="取消并停止"
              type="button"
            >
              <Square aria-hidden="true" size={12} />
              取消并停止
            </Button>
          ) : null}
        </>
      }
      aria-label="Agent 对话"
    >
      <PageBody
        aria-live="polite"
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          followTail.current =
            element.scrollHeight - element.clientHeight - element.scrollTop <
            32;
          pages.viewSessions.write(
            sessionKey,
            { top: element.scrollTop, follow: followTail.current },
            "conversation-scroll",
          );
        }}
      >
        {session.messages.length === 0 ? (
          <EmptyState title="没有消息" />
        ) : (
          <List aria-label="会话消息">
            {session.messages.map((message) => (
              <ManagementRow
                key={message.id}
                title={message.role === "user" ? "你" : "Agent"}
                description={
                  <span
                    className={cx("agent-message-content")}
                    data-message-id={message.id}
                    data-message-role={message.role}
                  >
                    {message.content || "…"}
                  </span>
                }
              />
            ))}
          </List>
        )}
      </PageBody>
      <FormError message={session.problem} />
    </Page>
  );
}
