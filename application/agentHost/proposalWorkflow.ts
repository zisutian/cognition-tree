// SPDX-License-Identifier: GPL-3.0-or-later

import {
  confirmAgentProposalDestruction,
  decideAgentProposal,
  markAgentProposalIndeterminate,
  type AgentProposal,
  type AgentRuntimePort,
  type AgentSessionController,
} from "../agent/index.ts";
import type { AgentOperationReceipt } from "../operations/agentOperationReceipt.ts";
import type { ResolvedAgentConfiguration } from "./configurationPort.ts";
import {
  AgentProposalCommitIndeterminateError,
  AgentServiceError,
} from "./errors.ts";
import { type AgentProposalCommitOutcome, type AgentProposalCommitPort, type AgentProposalCommitRoute } from "./proposalCommitPort.ts";
import { toAgentProposalView } from "../agent/agentTypes.ts";
import type { AgentRuntimeProfile } from "./runtimeProfiles.ts";

export type AgentProposalWorkflowRecord = {
  configuration: ResolvedAgentConfiguration;
  controller: AgentSessionController;
  profile: AgentRuntimeProfile;
  runtime: Pick<AgentRuntimePort, "kind">;
};

function hasTerminalCommitStatus(proposal: AgentProposal) {
  return proposal.status === "committed" || proposal.status === "stale" ||
    proposal.status === "failed" || proposal.status === "indeterminate";
}

export class AgentProposalWorkflow<
  Record extends AgentProposalWorkflowRecord,
> {
  readonly #assertScopeAvailable: (record: Record) => Promise<void>;
  readonly #committer: AgentProposalCommitPort;
  readonly #emitProposal: (record: Record, proposal: AgentProposal) => void;
  readonly #isClosing: () => boolean;
  readonly #scheduleReceiptSummary: (
    record: Record,
    receipt: AgentOperationReceipt,
  ) => void;

  constructor({
    assertScopeAvailable,
    committer,
    emitProposal,
    isClosing,
    scheduleReceiptSummary,
  }: {
    assertScopeAvailable: (record: Record) => Promise<void>;
    committer: AgentProposalCommitPort;
    emitProposal: (record: Record, proposal: AgentProposal) => void;
    isClosing: () => boolean;
    scheduleReceiptSummary: (
      record: Record,
      receipt: AgentOperationReceipt,
    ) => void;
  }) {
    this.#assertScopeAvailable = assertScopeAvailable;
    this.#committer = committer;
    this.#emitProposal = emitProposal;
    this.#isClosing = isClosing;
    this.#scheduleReceiptSummary = scheduleReceiptSummary;
  }

  async decide({
    decision,
    ownerId,
    proposalId,
    record,
    requestId,
  }: {
    decision: "approve" | "reject";
    ownerId: string;
    proposalId: string;
    record: Record;
    requestId: string;
  }) {
    await this.#assertScopeAvailable(record);
    let proposal = record.controller.getProposal(proposalId);

    if (hasTerminalCommitStatus(proposal)) {
      return toAgentProposalView(proposal);
    }
    if (proposal.status === "rejected") {
      if (decision !== "reject") {
        throw new AgentServiceError("invalid_request", "Proposal was rejected");
      }
      return toAgentProposalView(proposal);
    }
    if (proposal.status === "pending") {
      proposal = decideAgentProposal(proposal, decision);
      record.controller.putProposal(proposal);
      this.#emitProposal(record, proposal);
    }
    if (decision === "reject") {
      if (proposal.status !== "rejected") {
        throw new AgentServiceError(
          "invalid_request",
          "Proposal has already been approved",
        );
      }
      return toAgentProposalView(proposal);
    }
    if (proposal.status === "awaiting-destructive-confirmation") {
      return toAgentProposalView(proposal);
    }
    return this.#commit(
      record,
      proposal,
      ownerId,
      requestId,
      "proposal-decision",
    );
  }

  async confirmDestruction({
    ownerId,
    proposalId,
    record,
    requestId,
  }: {
    ownerId: string;
    proposalId: string;
    record: Record;
    requestId: string;
  }) {
    await this.#assertScopeAvailable(record);
    let proposal = record.controller.getProposal(proposalId);

    if (hasTerminalCommitStatus(proposal)) {
      return toAgentProposalView(proposal);
    }
    proposal = confirmAgentProposalDestruction(proposal);
    record.controller.putProposal(proposal);
    this.#emitProposal(record, proposal);
    return this.#commit(
      record,
      proposal,
      ownerId,
      requestId,
      "destructive-confirmation",
    );
  }

  async #commit(
    record: Record,
    proposal: AgentProposal,
    ownerId: string,
    requestId: string,
    route: AgentProposalCommitRoute,
  ) {
    let outcome: AgentProposalCommitOutcome;

    try {
      outcome = await this.#committer.commit({
        context: {
          configuration: record.configuration,
          profile: record.profile,
          runtimeKind: record.runtime.kind,
          sessionId: record.controller.snapshot().id,
        },
        ownerId,
        proposal,
        requestId,
        route,
      });
    } catch (error) {
      if (error instanceof AgentProposalCommitIndeterminateError) {
        const indeterminate = markAgentProposalIndeterminate(proposal);

        record.controller.putProposal(indeterminate);
        if (!this.#isClosing()) this.#emitProposal(record, indeterminate);
      }
      throw error;
    }

    record.controller.putProposal(outcome.proposal);
    if (!this.#isClosing()) this.#emitProposal(record, outcome.proposal);
    if (outcome.receipt.result === "committed") {
      if (!outcome.replayed && !this.#isClosing()) {
        this.#scheduleReceiptSummary(record, outcome.receipt);
      }
      return toAgentProposalView(outcome.proposal);
    }
    if (outcome.receipt.result === "stale") {
      throw new AgentServiceError(
        "proposal_stale",
        "Store revision changed after the proposal was staged",
      );
    }
    throw new AgentServiceError("session_unavailable", "Agent commit failed");
  }
}
