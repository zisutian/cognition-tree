// SPDX-License-Identifier: GPL-3.0-or-later

import { MessageSquare, Plus } from "lucide-react";
import type {
  AgentApplication,
  AgentScope,
} from "../../../application/agent";
import { Button } from "../../ui/shared/primitives";
import { useFeedback } from "../../ui/shared/FeedbackProvider";
import {
  CompactContextActionButtons,
  CompactContextList,
  CompactContextRow,
} from "../../ui/shared/CompactContextList";

const sessionStateLabels = {
  idle: "空闲",
  queued: "排队中",
  running: "推理中",
  "awaiting-approval": "等待审批",
  "awaiting-destructive-confirmation": "等待删除确认",
  unavailable: "不可用",
} as const;

function sessionScopeLabel(scope: AgentScope) {
  if (scope.domain === "workspace") {
    const target = scope.target.kind === "repository"
      ? "整个仓库"
      : scope.target.kind === "folder"
        ? `文件夹 ${scope.target.folderId}`
        : `笔记 ${scope.target.noteId}`;

    return `Workspace · ${target}`;
  }
  if (scope.domain === "journal") {
    return scope.entryIds === null
      ? "Journal · 全域"
      : `Journal · ${scope.entryIds.length} 篇日记`;
  }
  return scope.collectionIds === null
    ? "Todo · 全域"
    : `Todo · ${scope.collectionIds.length} 个集合`;
}

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
  const profileLabelById = new Map(
    state.status?.profiles.map(({ id, label }) => [id, label]) ?? [],
  );

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
              actions={(
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
              )}
              icon={<MessageSquare aria-hidden="true" size={13} />}
              key={session.id}
              label={(
                <span className="agent-session-label">
                  <strong>
                    {profileLabelById.get(session.profileId) ?? session.profileId}
                  </strong>
                  <span>{sessionScopeLabel(session.scope)}</span>
                </span>
              )}
              onSelect={() => {
                controller.selectSession(session.id);
                onSelectSession();
              }}
              rowClassName="agent-session-row"
              selected={selected}
              title={`${sessionScopeLabel(session.scope)} · ${session.id}`}
              trailing={(
                <span className="agent-session-state">
                  {sessionStateLabels[session.state]}
                </span>
              )}
            />
          );
        })}
      </CompactContextList>
      {state.sessions.length === 0 ? (
        <p className="agent-muted">没有驻留中的 Agent 会话。</p>
      ) : null}
    </div>
  );
}
