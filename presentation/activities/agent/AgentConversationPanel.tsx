// SPDX-License-Identifier: GPL-3.0-or-later

import { Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AgentApplication } from "../../../application/agent";
import {
  Button,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  cx,
} from "../../ui/shared/primitives";
import { useFeedback } from "../../ui/shared/FeedbackProvider";

const stateLabels = {
  idle: "空闲",
  queued: "排队中",
  running: "正在推理",
  "awaiting-approval": "等待审批",
  "awaiting-destructive-confirmation": "等待删除确认",
  unavailable: "不可用",
} as const;

export function AgentConversationPanel({ agent }: { agent: AgentApplication }) {
  const feedback = useFeedback();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const session = agent.state.sessions.find(
    ({ id }) => id === agent.state.activeSessionId,
  ) ?? null;
  const messageLength = session?.messages.reduce(
    (length, message) => length + message.content.length,
    0,
  ) ?? 0;

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messageLength, session?.messages.length]);

  if (!session) {
    return (
      <Panel aria-label="Agent 对话" className="agent-conversation-panel">
        <EmptyState
          description="在左侧选择 allowlist profile 和不可扩大的硬范围。"
          title="创建或选择一个 Agent 会话"
        />
      </Panel>
    );
  }
  const canSend = session.state === "idle" &&
    agent.state.operationStatus === "idle";
  const canCancel = session.state === "queued" || session.state === "running";
  const send = async () => {
    if (!canSend || draft.trim().length === 0) return;
    const sent = await feedback.runAction(async () => {
      await agent.controller.sendMessage(draft);
      return true;
    });

    if (sent) setDraft("");
  };

  return (
    <Panel aria-label="Agent 对话" className="agent-conversation-panel">
      <PanelHeader
        actions={
          canCancel ? (
            <Button
              onClick={() => void feedback.runAction(agent.controller.cancel)}
              title="取消推理并停止此会话 runtime"
              type="button"
              variant="secondary"
            >
              <Square aria-hidden="true" size={12} />
              取消并停止
            </Button>
          ) : null
        }
        title={`Agent 对话 · ${stateLabels[session.state]}`}
      />
      <PanelBody className="agent-conversation-body">
        <div
          aria-live="polite"
          className="agent-message-scroll ui-scroll-surface"
          ref={scrollRef}
        >
          {session.messages.length === 0 ? (
            <p className="agent-muted">发送消息后，Agent 只能在当前硬范围内读取和暂存修改。</p>
          ) : (
            <ol className="agent-message-list">
              {session.messages.map((message) => (
                <li
                  className={cx(
                    "agent-message",
                    message.role === "user" ? "is-user" : "is-assistant",
                  )}
                  data-message-id={message.id}
                  key={message.id}
                >
                  <span>{message.role === "user" ? "你" : "Agent"}</span>
                  <p>{message.content || "…"}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
        {session.problem ? (
          <p className="agent-error" role="alert">{session.problem}</p>
        ) : null}
        <form
          className="agent-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <textarea
            aria-label="给 Agent 的消息"
            disabled={!canSend}
            maxLength={100_000}
            onChange={(event) => setDraft(event.currentTarget.value)}
            placeholder={canSend ? "描述希望 Agent 完成的修改…" : "当前会话暂不能接收新消息"}
            rows={4}
            value={draft}
          />
          <div>
            <span>发送前会先同步当前范围对应的已加载 draft。</span>
            <Button
              disabled={!canSend || draft.trim().length === 0}
              type="submit"
              variant="primary"
            >
              发送
            </Button>
          </div>
        </form>
      </PanelBody>
    </Panel>
  );
}
