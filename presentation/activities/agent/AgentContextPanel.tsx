import { createClassNames } from "../../ui/index.ts";
import agentStyles from "./agent.module.css";
const cx = createClassNames(agentStyles);
// SPDX-License-Identifier: GPL-3.0-or-later

import { MessageSquare, Trash2 } from "lucide-react";
import type { AgentApplication } from "../../../application/agent/index.ts";
import {
  CompactContextActionButtons,
  CompactContextList,
  CompactContextRow,
  useFeedback,
} from "../../ui/index.ts";

import {
  agentSessionStateLabels,
  formatAgentScopeLabel,
} from "./agentViewLabels.ts";

export function AgentContextPanel({
  agent,
  creatingSession,
  onSelectSession,
}: {
  agent: AgentApplication;
  creatingSession: boolean;
  onSelectSession(): void;
}) {
  const feedback = useFeedback();
  const { controller, state } = agent;
  return (
    <div className={cx("activity-context-content agent-context")}>
      {state.loadStatus === "loading" ? (
        <p className={cx("agent-muted")}>正在读取 Agent 状态…</p>
      ) : null}
      {state.loadStatus === "failed" ? (
        <p className={cx("agent-error")} role="alert">
          {state.errorMessage}
        </p>
      ) : null}
      <CompactContextList
        aria-label="Agent 会话"
        className={cx("agent-session-list")}
      >
        {state.sessions.map((session) => {
          const selected =
            !creatingSession && session.id === state.activeSessionId;

          return (
            <CompactContextRow
              actions={
                selected ? (
                  <CompactContextActionButtons
                    actions={[
                      {
                        ariaLabel: `删除会话 ${session.id}`,
                        disabled: state.operationStatus === "working",
                        icon: Trash2,
                        onSelect: () => {
                          void feedback.runAction(() =>
                            controller.deleteSession(session.id),
                          );
                        },
                        title: "结束并删除内存会话",
                        tone: "danger",
                      },
                    ]}
                  />
                ) : undefined
              }
              icon={<MessageSquare aria-hidden="true" size={13} />}
              key={session.id}
              label={`${session.profileLabel} · ${formatAgentScopeLabel(session.scope)}`}
              onSelect={() => {
                controller.selectSession(session.id);
                onSelectSession();
              }}
              selected={selected}
              title={`${session.profileLabel} · ${session.profileModel} · v${session.profileVersion} · ${formatAgentScopeLabel(session.scope)}`}
              trailing={
                <span className={cx("agent-session-state")}>
                  {agentSessionStateLabels[session.state]}
                </span>
              }
            />
          );
        })}
      </CompactContextList>
      {state.sessions.length === 0 ? (
        <p className={cx("context-empty")}>没有会话</p>
      ) : null}
    </div>
  );
}
