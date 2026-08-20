// SPDX-License-Identifier: GPL-3.0-or-later

import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  AgentApplication,
  AgentProposalView,
} from "../../../application/agent";
import {
  Button,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
} from "../../ui/shared/primitives";
import { useFeedback } from "../../ui/shared/FeedbackProvider";

const proposalStatusLabels: Record<AgentProposalView["status"], string> = {
  approved: "已批准",
  "awaiting-destructive-confirmation": "等待删除确认",
  committed: "已提交",
  failed: "提交失败",
  pending: "等待审批",
  rejected: "已拒绝",
  stale: "已过期",
};

function storeLabel(proposal: AgentProposalView) {
  return proposal.store.domain === "workspace"
    ? `Workspace · ${proposal.store.repositoryId}`
    : proposal.store.domain === "journal"
      ? "Journal"
      : "Todo";
}

export function AgentProposalPanel({
  agent,
  onCollapseDetail,
}: {
  agent: AgentApplication;
  onCollapseDetail(): void;
}) {
  const feedback = useFeedback();
  const session = agent.state.sessions.find(
    ({ id }) => id === agent.state.activeSessionId,
  ) ?? null;
  const [selectedProposalId, setSelectedProposalId] = useState("");
  const [destructiveConfirmed, setDestructiveConfirmed] = useState(false);
  const proposal = useMemo(() => {
    if (!session) return null;
    return session.proposals.find(({ id }) => id === selectedProposalId) ??
      [...session.proposals].reverse().find(({ status }) =>
        status === "pending" ||
        status === "awaiting-destructive-confirmation"
      ) ?? session.proposals.at(-1) ?? null;
  }, [selectedProposalId, session]);

  useEffect(() => {
    if (proposal && proposal.id !== selectedProposalId) {
      setSelectedProposalId(proposal.id);
    }
    setDestructiveConfirmed(false);
  }, [proposal?.id, proposal?.status, selectedProposalId]);

  return (
    <Panel aria-label="Agent Proposal" className="agent-proposal-panel" tone="detail">
      <PanelHeader
        actions={
          <Button
            aria-label="折叠 Proposal"
            onClick={onCollapseDetail}
            title="折叠 Proposal"
            type="button"
            variant="icon"
          >
            <ChevronRight aria-hidden="true" size={14} />
          </Button>
        }
        title="Proposal"
      />
      <PanelBody className="agent-proposal-body" scroll>
        {!proposal ? (
          <EmptyState
            description="Agent 提交 proposal 后，可在这里审查聚合后的最终 diff。"
            title="暂无待审 proposal"
          />
        ) : (
          <>
            {session && session.proposals.length > 1 ? (
              <label className="agent-proposal-picker">
                <span>Proposal</span>
                <select
                  className="ui-input"
                  onChange={(event) =>
                    setSelectedProposalId(event.currentTarget.value)}
                  value={proposal.id}
                >
                  {session.proposals.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.id.slice(0, 8)} · {proposalStatusLabels[item.status]}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <dl className="agent-proposal-meta">
              <div><dt>目标</dt><dd>{storeLabel(proposal)}</dd></div>
              <div><dt>状态</dt><dd>{proposalStatusLabels[proposal.status]}</dd></div>
              <div><dt>Base</dt><dd><code>{proposal.baseRevision}</code></dd></div>
              <div><dt>Digest</dt><dd><code>{proposal.digest}</code></dd></div>
            </dl>
            <section className="agent-change-summary">
              <h3>变更摘要</h3>
              <p>
                {proposal.changes.resources.length} 个资源，
                {proposal.changes.blocks.length} 个块
                {proposal.destructive ? "，包含删除" : ""}
              </p>
              <ul>
                {proposal.changes.resources.map((change, index) => (
                  <li key={`${change.resourceId}:${change.kind}:${index}`}>
                    <strong>{change.kind}</strong> {change.resourceId}
                  </li>
                ))}
              </ul>
            </section>
            <section className="agent-diff">
              <h3>最终聚合 diff</h3>
              {proposal.diff.length === 0 ? (
                <p className="agent-muted">没有文本 diff。</p>
              ) : (
                <ol>
                  {proposal.diff.map((hunk, index) => (
                    <li key={`${hunk.resourceId}:${hunk.from}:${index}`}>
                      <header>
                        <code>{hunk.resourceId}</code>
                        <span>{hunk.from}–{hunk.to}</span>
                      </header>
                      <pre>{hunk.insertedText || "（删除所选范围）"}</pre>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            {proposal.status === "pending" ? (
              <div className="agent-proposal-actions">
                <Button
                  disabled={agent.state.operationStatus === "working"}
                  onClick={() => void feedback.runAction(
                    () => agent.controller.decideProposal(proposal.id, "reject"),
                  )}
                  type="button"
                  variant="secondary"
                >
                  整批拒绝
                </Button>
                <Button
                  disabled={agent.state.operationStatus === "working"}
                  onClick={() => void feedback.runAction(
                    () => agent.controller.decideProposal(proposal.id, "approve"),
                  )}
                  type="button"
                  variant="primary"
                >
                  整批批准
                </Button>
              </div>
            ) : null}
            {proposal.status === "awaiting-destructive-confirmation" ? (
              <div className="agent-destructive-confirmation">
                <strong>独立删除确认</strong>
                <p>批准尚未写入。确认后将按原 proposal 执行一次 exact CAS。</p>
                <label>
                  <input
                    checked={destructiveConfirmed}
                    onChange={(event) => setDestructiveConfirmed(
                      event.currentTarget.checked,
                    )}
                    type="checkbox"
                  />
                  我确认执行 proposal 中的全部删除
                </label>
                <Button
                  disabled={
                    !destructiveConfirmed ||
                    agent.state.operationStatus === "working"
                  }
                  onClick={() => void feedback.runAction(
                    () => agent.controller.confirmDestruction(proposal.id),
                  )}
                  type="button"
                  variant="primary"
                >
                  确认删除并提交
                </Button>
              </div>
            ) : null}
          </>
        )}
      </PanelBody>
    </Panel>
  );
}
