// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentOperationReceipt } from '../operations/agentOperationReceipt.ts';
import type { AgentOperationLedgerPort } from '../operations/operationLedgerPort.ts';
import type { AgentHostRuntime } from './runtimePorts.ts';
import { readAgentHostTimestamp } from './runtimePorts.ts';
import type { AgentCommitStorePort, AgentCommitEventsPort } from './commitPorts.ts';
import type { AgentProposalCommitRoute, AgentProposalCommitContext, AgentProposalCommitOutcome, AgentProposalCommitRequest, AgentProposalCommitPort } from './proposalCommitPort.ts';
import {
  commitAgentProposalExactly,
  markAgentProposalFailed,
  markAgentProposalStale,
  type AgentProposal,
} from "../agent/index.ts";
import {
  AgentOperationIndeterminateError,
  type AgentOperationAttempt,
} from "../operations/operationLedgerPort.ts";
import { VersionedContentCommitOutcomeUnknownError, VersionedContentRevisionConflictError } from "../persistence/versionedCommitErrors.ts";
import {
  AgentProposalCommitIndeterminateError,
  AgentServiceError,
} from "./errors.ts";

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

export class AgentProposalCommitter implements AgentProposalCommitPort {
  readonly #stores: AgentCommitStorePort;
  readonly #events: AgentCommitEventsPort;
  readonly #ledger: AgentOperationLedgerPort | null;
  readonly #runtime: AgentHostRuntime;

  constructor({ stores, events, ledger, runtime }: {
    stores: AgentCommitStorePort;
    events: AgentCommitEventsPort;
    ledger: AgentOperationLedgerPort | null;
    runtime: AgentHostRuntime;
  }) {
    this.#stores = stores;
    this.#events = events;
    this.#ledger = ledger;
    this.#runtime = runtime;
  }

  async commit({
    context,
    ownerId,
    proposal: initialProposal,
    requestId,
    route,
  }: AgentProposalCommitRequest): Promise<AgentProposalCommitOutcome> {
    const ledger = this.#ledger;

    if (!ledger) {
      throw new AgentServiceError("profile_unavailable", "Agent ledger is unavailable");
    }
    let proposal = initialProposal;
    const identity = {
      digest: proposal.digest,
      proposalId: proposal.id,
      proposalVersion: proposal.version,
    };
    const result = await ledger.runAgentIdempotent(
      identity,
      this.#auditAttempt(context, proposal, ownerId, requestId, route),
      async () => {
        let afterRevision: `sha256:${string}` | null = null;
        let result: AgentOperationReceipt["result"] = "failed";

        try {
          const store = await this.#stores.getStore(proposal.store);
          const committed = await commitAgentProposalExactly({
            proposal,
            store,
          });

          afterRevision = committed.receipt.revision;
          result = "committed";
          proposal = committed.proposal;
          this.#events.publish(proposal.store, afterRevision, proposal.changes);
        } catch (error) {
          if (error instanceof VersionedContentCommitOutcomeUnknownError) {
            throw error;
          }
          if (
            error instanceof VersionedContentRevisionConflictError
          ) {
            afterRevision = error.currentRevision;
            result = "stale";
            proposal = markAgentProposalStale(proposal);
          } else {
            proposal = markAgentProposalFailed(proposal);
          }
        }
        return this.#auditEntry(
          context,
          proposal,
          ownerId,
          afterRevision,
          result,
        );
      },
    ).catch((error: unknown) => {
      if (
        error instanceof VersionedContentCommitOutcomeUnknownError ||
        error instanceof AgentOperationIndeterminateError
      ) {
        throw new AgentProposalCommitIndeterminateError(error);
      }
      throw error;
    });

    if (result.entry.result === "committed" && proposal.status !== "committed") {
      proposal = { ...proposal, status: "committed" };
    } else if (result.entry.result === "stale") {
      proposal = markAgentProposalStale(proposal);
    } else if (result.entry.result !== "committed") {
      proposal = markAgentProposalFailed(proposal);
    }
    return {
      proposal,
      receipt: result.entry,
      replayed: result.replayed,
    };
  }

  #auditEntry(
    context: AgentProposalCommitContext,
    proposal: AgentProposal,
    ownerId: string,
    afterRevision: `sha256:${string}` | null,
    result: AgentOperationReceipt["result"],
  ): AgentOperationReceipt {
    return {
      afterRevision,
      approvingOwnerId: ownerId,
      beforeRevision: proposal.base.revision,
      changeMetadata: {
        blockIds: unique(proposal.changes.blocks.map(({ blockId }) => blockId)),
        resourceIds: unique(
          proposal.changes.resources.map(({ resourceId }) => resourceId),
        ),
      },
      digest: proposal.digest,
      occurredAt: readAgentHostTimestamp(this.#runtime),
      profileDigest: context.configuration.profile.digest,
      profileId: context.profile.id,
      profileVersion: context.configuration.profile.version,
      proposalId: proposal.id,
      proposalVersion: proposal.version,
      providerDigest: context.configuration.provider.digest,
      providerId: context.configuration.provider.id,
      providerVersion: context.configuration.provider.version,
      result,
      runtimeKind: context.runtimeKind,
      sessionId: context.sessionId,
      store: proposal.store,
    };
  }

  #auditAttempt(
    context: AgentProposalCommitContext,
    proposal: AgentProposal,
    ownerId: string,
    requestId: string,
    route: AgentProposalCommitRoute,
  ): AgentOperationAttempt {
    return {
      approvingOwnerId: ownerId,
      beforeRevision: proposal.base.revision,
      occurredAt: readAgentHostTimestamp(this.#runtime),
      profileDigest: context.configuration.profile.digest,
      profileId: context.profile.id,
      profileVersion: context.configuration.profile.version,
      providerDigest: context.configuration.provider.digest,
      providerId: context.configuration.provider.id,
      providerVersion: context.configuration.provider.version,
      requestId,
      route,
      runtimeKind: context.runtimeKind,
      sessionId: context.sessionId,
      store: proposal.store,
    };
  }

}
