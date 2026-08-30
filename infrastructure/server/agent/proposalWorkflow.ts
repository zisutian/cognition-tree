// SPDX-License-Identifier: GPL-3.0-or-later

import {
  confirmAgentProposalDestruction,
  decideAgentProposal,
  type AgentProposal,
  type AgentRuntimePort,
  type AgentSessionController,
} from "../../../application/agent/index.ts";
import type {
  AgentOperationAuditEntryDto,
} from "../../../contracts/agent/schemas.ts";
import type { ResolvedAgentConfiguration } from "./configurationStore.ts";
import { AgentServiceError } from "./errors.ts";
import type {
  AgentProposalCommitter,
  AgentProposalCommitRoute,
} from "./proposalCommitter.ts";
import { toAgentProposalDto } from "./proposalCodec.ts";
import type { AgentRuntimeProfile } from "./runtimeProfiles.ts";

export type AgentProposalWorkflowRecord = {
  configuration: ResolvedAgentConfiguration;
  controller: AgentSessionController;
  profile: AgentRuntimeProfile;
  runtime: Pick<AgentRuntimePort, "kind">;
};

function hasTerminalCommitStatus(proposal: AgentProposal) {
  return proposal.status === "committed" || proposal.status === "stale" ||
    proposal.status === "failed";
}

export class AgentProposalWorkflow<
  Record extends AgentProposalWorkflowRecord,
> {
  readonly #assertScopeAvailable: (record: Record) => Promise<void>;
  readonly #committer: AgentProposalCommitter;
  readonly #emitProposal: (record: Record, proposal: AgentProposal) => void;
  readonly #isClosing: () => boolean;
  readonly #scheduleReceiptSummary: (
    record: Record,
    receipt: AgentOperationAuditEntryDto,
  ) => void;

  constructor({
    assertScopeAvailable,
    committer,
    emitProposal,
    isClosing,
    scheduleReceiptSummary,
  }: {
    assertScopeAvailable: (record: Record) => Promise<void>;
    committer: AgentProposalCommitter;
    emitProposal: (record: Record, proposal: AgentProposal) => void;
    isClosing: () => boolean;
    scheduleReceiptSummary: (
      record: Record,
      receipt: AgentOperationAuditEntryDto,
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
      return toAgentProposalDto(proposal);
    }
    if (proposal.status === "rejected") {
      if (decision !== "reject") {
        throw new AgentServiceError("invalid_request", "Proposal was rejected");
      }
      return toAgentProposalDto(proposal);
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
      return toAgentProposalDto(proposal);
    }
    if (proposal.status === "awaiting-destructive-confirmation") {
      return toAgentProposalDto(proposal);
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
      return toAgentProposalDto(proposal);
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
    const outcome = await this.#committer.commit({
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

    record.controller.putProposal(outcome.proposal);
    if (!this.#isClosing()) this.#emitProposal(record, outcome.proposal);
    if (outcome.receipt.result === "committed") {
      if (!outcome.replayed && !this.#isClosing()) {
        this.#scheduleReceiptSummary(record, outcome.receipt);
      }
      return toAgentProposalDto(outcome.proposal);
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
