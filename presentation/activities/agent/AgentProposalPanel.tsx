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
import {
  AgentProposalReview,
  proposalStoreLabel,
} from "./AgentProposalReview";
import {
  StatusBadge,
  StatusSummary,
} from "../../ui/shared/StatusPresentation";

const proposalStatusLabels: Record<AgentProposalView["status"], string> = {
  approved: "已批准",
  "awaiting-destructive-confirmation": "等待删除确认",
  committed: "已提交",
  failed: "提交失败",
  pending: "等待审批",
  rejected: "已拒绝",
  stale: "已过期",
};

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

  const footer = proposal?.status === "pending" ? (
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
  ) : proposal?.status === "awaiting-destructive-confirmation" ? (
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
  ) : null;

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
      <PanelBody className="agent-proposal-body">
        {!proposal ? (
          <EmptyState
            compact
            description="Agent 提交 proposal 后，可在这里审查聚合后的最终 diff。"
            title="暂无待审 proposal"
          />
        ) : (
          <>
            <div className="agent-proposal-scroll ui-scroll-surface">
              {session && session.proposals.length > 1 ? (
                <label className="agent-proposal-picker">
                  <span>Proposal</span>
                  <select
                    className="ui-input"
                    onChange={(event) =>
                      setSelectedProposalId(event.currentTarget.value)}
                    value={proposal.id}
                  >
                    {session.proposals.map((item, index) => (
                      <option key={item.id} value={item.id}>
                        {`第 ${index + 1} 份 · ${proposalStatusLabels[item.status]} · ${proposalStoreLabel(item)}`}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <StatusSummary
                ariaLabel="Proposal 摘要"
                items={[
                  { label: "目标", value: proposalStoreLabel(proposal) },
                  {
                    label: "状态",
                    value: (
                      <StatusBadge tone={proposalStatusTone(proposal.status)}>
                        {proposalStatusLabels[proposal.status]}
                      </StatusBadge>
                    ),
                  },
                  {
                    label: "变更",
                    value: `${proposal.review.resources.length} 项`,
                  },
                ]}
              />
              <AgentProposalReview proposal={proposal} />
            </div>
            {footer}
          </>
        )}
      </PanelBody>
    </Panel>
  );
}

function proposalStatusTone(status: AgentProposalView["status"]) {
  if (status === "failed" || status === "stale" || status === "rejected") {
    return "danger" as const;
  }
  if (
    status === "pending" ||
    status === "awaiting-destructive-confirmation"
  ) {
    return "warning" as const;
  }
  return "success" as const;
}
