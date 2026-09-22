// SPDX-License-Identifier: GPL-3.0-or-later

import {
  Stack as SectionStack,
  StatusText as StatusBadge,
  PropertyList as ToolPropertyList,
  PropertyRow as ToolPropertyRow,
} from "compact-ui";
import {
  Button,
  FieldRow,
  FormActions,
  FormLayout,
  Section,
  SelectControl,
} from "compact-ui";

import type {
  AgentApplication,
  AgentProposalView,
} from "../../../application/agent/index.ts";
import { Page, PageBody, useFeedback } from "../../ui/index.ts";

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

export function AgentProposalPanel({
  agent,
  proposal,
  onSelect,
}: {
  agent: AgentApplication;
  proposal: AgentProposalView | null;
  onSelect(id: string): void;
}) {
  const session =
    agent.state.sessions.find(({ id }) => id === agent.state.activeSessionId) ??
    null;
  return (
    <Page aria-label="Agent Proposal">
      <PageBody>
        {!proposal ? null : (
          <>
            <SectionStack>
              <Section>
                {session && session.proposals.length > 1 ? (
                  <FormLayout>
                    <FieldRow label="Proposal">
                      {(accessibility) => (
                        <SelectControl
                          {...accessibility}
                          onChange={(event) =>
                            onSelect(event.currentTarget.value)
                          }
                          value={proposal.id}
                        >
                          {session.proposals.map((item, index) => (
                            <option key={item.id} value={item.id}>
                              {`第 ${index + 1} 份 · ${proposalStatusLabels[item.status]} · ${proposalStoreLabel(item)}`}
                            </option>
                          ))}
                        </SelectControl>
                      )}
                    </FieldRow>
                  </FormLayout>
                ) : null}
                <section aria-label="Proposal 摘要">
                  <ToolPropertyList>
                    <ToolPropertyRow
                      label="目标"
                      children={proposalStoreLabel(proposal)}
                    />
                    <ToolPropertyRow
                      label="状态"
                      children={
                        <StatusBadge
                          mode="live"
                          tone={proposalStatusTone(proposal.status)}
                        >
                          {proposalStatusLabels[proposal.status]}
                        </StatusBadge>
                      }
                    />
                    <ToolPropertyRow
                      label="变更"
                      children={`${proposal.review.resources.length} 项`}
                    />
                  </ToolPropertyList>
                </section>
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
    return "neutral" as const;
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

export function AgentProposalActions({
  agent,
  proposal,
}: {
  agent: AgentApplication;
  proposal: AgentProposalView | null;
}) {
  const feedback = useFeedback();
  return proposal?.status === "pending" ? (
    <FormActions>
      <Button
        disabled={agent.state.operationStatus === "working"}
        onClick={() =>
          void feedback.runAction(() =>
            agent.controller.decideProposal(proposal.id, "reject"),
          )
        }
        type="button"
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
      >
        整批批准
      </Button>
    </FormActions>
  ) : proposal?.status === "awaiting-destructive-confirmation" ? (
    <FormActions>
      <Button
        disabled={agent.state.operationStatus === "working"}
        onClick={() =>
          void feedback.runAction(() =>
            agent.controller.confirmDestruction(proposal.id),
          )
        }
        type="button"
        tone="danger"
      >
        确认删除并提交
      </Button>
    </FormActions>
  ) : null;
}
