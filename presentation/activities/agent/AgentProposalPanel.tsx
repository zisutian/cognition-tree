import { createClassNames } from "../../ui/index.ts";
import agentStyles from "./agent.module.css";
const cx = createClassNames(agentStyles);
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useMemo, useState } from "react";
import type {
  AgentApplication,
  AgentProposalView,
} from "../../../application/agent/index.ts";
import {
  Button,
  EmptyState,
  Page,
  PageBody,
  Section,
  SectionStack,
  SelectControl,
  StatusBadge,
  ToolPropertyList,
  ToolPropertyRow,
  useFeedback,
} from "../../ui/index.ts";

import {
  AgentProposalReview,
  proposalStoreLabel,
} from "./AgentProposalReview.tsx";

const proposalStatusLabels: Record<AgentProposalView["status"], string> = {
  approved: "已批准",
  "awaiting-destructive-confirmation": "等待删除确认",
  committed: "已提交",
  failed: "提交失败",
  indeterminate: "结果待确认",
  pending: "等待审批",
  rejected: "已拒绝",
  stale: "已过期",
};

export function AgentProposalPanel({ agent }: { agent: AgentApplication }) {
  const feedback = useFeedback();
  const session =
    agent.state.sessions.find(({ id }) => id === agent.state.activeSessionId) ??
    null;
  const [selectedProposalId, setSelectedProposalId] = useState("");
  const proposal = useMemo(() => {
    if (!session) return null;
    return (
      session.proposals.find(({ id }) => id === selectedProposalId) ??
      [...session.proposals]
        .reverse()
        .find(
          ({ status }) =>
            status === "pending" ||
            status === "awaiting-destructive-confirmation",
        ) ??
      session.proposals.at(-1) ??
      null
    );
  }, [selectedProposalId, session]);

  useEffect(() => {
    if (proposal && proposal.id !== selectedProposalId) {
      setSelectedProposalId(proposal.id);
    }
  }, [proposal?.id, proposal?.status, selectedProposalId]);

  const footer =
    proposal?.status === "pending" ? (
      <div className={cx("agent-proposal-actions")}>
        <Button
          disabled={agent.state.operationStatus === "working"}
          onClick={() =>
            void feedback.runAction(() =>
              agent.controller.decideProposal(proposal.id, "reject"),
            )
          }
          type="button"
          variant="secondary"
        >
          整批拒绝
        </Button>
        <Button
          disabled={agent.state.operationStatus === "working"}
          onClick={() =>
            void feedback.runAction(() =>
              agent.controller.decideProposal(proposal.id, "approve"),
            )
          }
          type="button"
          variant="primary"
        >
          整批批准
        </Button>
      </div>
    ) : proposal?.status === "awaiting-destructive-confirmation" ? (
      <div className={cx("agent-destructive-confirmation")}>
        <Button
          disabled={agent.state.operationStatus === "working"}
          onClick={() =>
            void feedback.runAction(() =>
              agent.controller.confirmDestruction(proposal.id),
            )
          }
          type="button"
          variant="danger"
        >
          确认删除并提交
        </Button>
      </div>
    ) : null;

  return (
    <Page aria-label="Agent Proposal" footer={footer}>
      <PageBody>
        {!proposal ? (
          <EmptyState compact title="暂无待审 proposal" />
        ) : (
          <>
            <SectionStack>
              <Section aria-label="Proposal 摘要">
                {session && session.proposals.length > 1 ? (
                  <label className={cx("agent-proposal-picker")}>
                    <span>Proposal</span>
                    <SelectControl
                      onChange={(event) =>
                        setSelectedProposalId(event.currentTarget.value)
                      }
                      value={proposal.id}
                    >
                      {session.proposals.map((item, index) => (
                        <option key={item.id} value={item.id}>
                          {`第 ${index + 1} 份 · ${proposalStatusLabels[item.status]} · ${proposalStoreLabel(item)}`}
                        </option>
                      ))}
                    </SelectControl>
                  </label>
                ) : null}
                <ToolPropertyList aria-label="Proposal 摘要">
                  <ToolPropertyRow
                    label="目标"
                    value={proposalStoreLabel(proposal)}
                  />
                  <ToolPropertyRow
                    label="状态"
                    value={
                      <StatusBadge tone={proposalStatusTone(proposal.status)}>
                        {proposalStatusLabels[proposal.status]}
                      </StatusBadge>
                    }
                  />
                  <ToolPropertyRow
                    label="变更"
                    value={`${proposal.review.resources.length} 项`}
                  />
                </ToolPropertyList>
              </Section>
              <AgentProposalReview proposal={proposal} />
            </SectionStack>
          </>
        )}
      </PageBody>
    </Page>
  );
}

function proposalStatusTone(status: AgentProposalView["status"]) {
  if (status === "failed" || status === "stale" || status === "rejected") {
    return "danger" as const;
  }
  if (
    status === "indeterminate" ||
    status === "pending" ||
    status === "awaiting-destructive-confirmation"
  ) {
    return "warning" as const;
  }
  return "success" as const;
}
