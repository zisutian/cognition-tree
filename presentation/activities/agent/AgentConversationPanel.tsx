import { createClassNames } from "../../ui/index.ts";
import agentStyles from "./agent.module.css";
const cx = createClassNames(agentStyles);
// SPDX-License-Identifier: GPL-3.0-or-later

import { Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AgentApplication } from "../../../application/agent/index.ts";
import {
  Button,
  EmptyState,
  FormActions,
  Page,
  PageBody,
  StatusBadge,
  TextareaControl,
  useExclusiveAsyncAction,
  useFeedback,
} from "../../ui/index.ts";

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
  const sendAction = useExclusiveAsyncAction();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const session =
    agent.state.sessions.find(({ id }) => id === agent.state.activeSessionId) ??
    null;
  const messageLength =
    session?.messages.reduce(
      (length, message) => length + message.content.length,
      0,
    ) ?? 0;

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messageLength, session?.messages.length]);

  if (!session) {
    return (
      <Page aria-label="Agent 对话">
        <EmptyState
          compact
          title="没有会话"
          action={
            <Button
              onClick={onBeginCreateSession}
              type="button"
              variant="primary"
            >
              新建会话
            </Button>
          }
        />
      </Page>
    );
  }
  const canSend =
    !sendAction.busy &&
    session.state === "idle" &&
    agent.state.operationStatus === "idle";
  const canCancel = session.state === "queued" || session.state === "running";
  const send = async () => {
    if (!canSend || draft.trim().length === 0) return;
    const pending = sendAction.run(() =>
      feedback.runAction(async () => {
        await agent.controller.sendMessage(draft);
        return true;
      }),
    );

    if (pending && (await pending)) setDraft("");
  };

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
      footer={
        <form
          className={cx("agent-composer")}
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <TextareaControl
            aria-label="给 Agent 的消息"
            disabled={!canSend}
            maxLength={100_000}
            onChange={(event) => setDraft(event.currentTarget.value)}
            placeholder="消息"
            rows={4}
            value={draft}
          />
          <FormActions>
            <Button
              disabled={!canSend || draft.trim().length === 0}
              type="submit"
              variant="primary"
            >
              发送
            </Button>
          </FormActions>
        </form>
      }
      actions={
        <>
          <StatusBadge
            tone={session.state === "unavailable" ? "danger" : "neutral"}
          >
            {agentSessionStateLabels[session.state]}
          </StatusBadge>
          {canCancel ? (
            <Button
              onClick={() => void feedback.runAction(agent.controller.cancel)}
              title="取消并停止"
              type="button"
              variant="secondary"
            >
              <Square aria-hidden="true" size={12} />
              取消并停止
            </Button>
          ) : null}
        </>
      }
      aria-label="Agent 对话"
    >
      <PageBody aria-live="polite" ref={scrollRef}>
        {session.messages.length === 0 ? (
          <p className={cx("agent-muted")}>没有消息</p>
        ) : (
          <ol className={cx("agent-message-list")}>
            {session.messages.map((message) => (
              <li
                className={cx("agent-message")}
                data-message-id={message.id}
                data-message-role={message.role}
                key={message.id}
              >
                <span>{message.role === "user" ? "你" : "Agent"}</span>
                <p>{message.content || "…"}</p>
              </li>
            ))}
          </ol>
        )}
      </PageBody>
      {session.problem ? (
        <p className={cx("agent-error")} role="alert">
          {session.problem}
        </p>
      ) : null}
    </Page>
  );
}
