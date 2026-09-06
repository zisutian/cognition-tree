// SPDX-License-Identifier: GPL-3.0-or-later

import { MessageSquare, Plus } from "lucide-react";
import type { AgentApplication } from "../../../application/agent/index.ts";
import {
  Button,
  useFeedback,
  CompactContextActionButtons,
  CompactContextList,
  CompactContextRow,
} from "../../ui/index.ts";


import {
  agentSessionStateLabels,
  formatAgentScopeLabel,
} from "./agentViewLabels.ts";

export function AgentContextPanel({
  agent,
  creatingSession,
  onBeginCreateSession,
  onSelectSession,
}: {
  agent: AgentApplication;
  creatingSession: boolean;
  onBeginCreateSession(): void;
  onSelectSession(): void;
}) {
  const feedback = useFeedback();
  const { controller, state } = agent;
  return (
    <div className="activity-context-content agent-context">
      <div className="context-toolbar">
        <Button
          aria-label="新建会话"
          onClick={onBeginCreateSession}
          title="新建会话"
          type="button"
          variant="icon"
        >
          <Plus aria-hidden="true" size={14} />
        </Button>
      </div>
      {state.loadStatus === "loading" ? (
        <p className="agent-muted">正在读取 Agent 状态…</p>
      ) : null}
      {state.loadStatus === "failed" ? (
        <p className="agent-error" role="alert">{state.errorMessage}</p>
      ) : null}
      <CompactContextList aria-label="Agent 会话" className="agent-session-list">
        {state.sessions.map((session) => {
          const selected = !creatingSession &&
            session.id === state.activeSessionId;

          return (
            <CompactContextRow
              actions={selected ? (
                <CompactContextActionButtons
                  actions={[{
                    ariaLabel: `删除会话 ${session.id}`,
                    disabled: state.operationStatus === "working",
                    label: "删",
                    onSelect: () => {
                      void feedback.runAction(
                        () => controller.deleteSession(session.id),
                      );
                    },
                    title: "结束并删除内存会话",
                    tone: "danger",
                  }]}
                />
              ) : undefined}
              icon={<MessageSquare aria-hidden="true" size={13} />}
              key={session.id}
              label={(
                <span className="agent-session-label">
                  <strong>
                    {session.profileLabel}
                  </strong>
                  <span>{session.profileModel} · v{session.profileVersion}</span>
                  <span>{formatAgentScopeLabel(session.scope)}</span>
                </span>
              )}
              onSelect={() => {
                controller.selectSession(session.id);
                onSelectSession();
              }}
              rowClassName="agent-session-row"
              selected={selected}
              title={`${session.profileLabel} · ${session.profileModel} · v${session.profileVersion} · ${formatAgentScopeLabel(session.scope)}`}
              trailing={(
                <span className="agent-session-state">
                  {agentSessionStateLabels[session.state]}
                </span>
              )}
            />
          );
        })}
      </CompactContextList>
      {state.sessions.length === 0 ? (
        <p className="context-empty">没有驻留中的 Agent 会话。</p>
      ) : null}
    </div>
  );
}
