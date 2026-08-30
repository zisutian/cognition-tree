// SPDX-License-Identifier: GPL-3.0-or-later

import {
  commitAgentProposalExactly,
  markAgentProposalFailed,
  markAgentProposalStale,
  type AgentProposal,
} from "../../../application/agent/index.ts";
import type {
  AgentOperationAuditEntryDto,
} from "../../../contracts/agent/schemas.ts";
import type { ApiBuiltInCatalog } from "../api/http/ports.ts";
import type { ApiRuntime } from "../api/http/runtime.ts";
import { readApiRuntimeNow } from "../api/http/runtime.ts";
import type { ApiEventHub } from "../api/sync/events.ts";
import type { ApiRevisionTracker } from "../api/sync/revisionTracker.ts";
import type { AgentOperationAttempt } from "../operations/operationLedgerContract.ts";
import type { OperationLedger } from "../operations/operationLedger.ts";
import type { WorkspaceRepositoryCatalog } from "../repository/catalog.ts";
import type { WorkspaceRepositoryStore } from "../repository/store.ts";
import { WorkspaceRevisionConflictError } from "../repository/store.ts";
import type {
  VersionedContentStore,
} from "../repository/versioned/contentStore.ts";
import {
  VersionedContentRevisionConflictError,
} from "../repository/versioned/contentStore.ts";
import type { ResolvedAgentConfiguration } from "./configurationStore.ts";
import { AgentServiceError } from "./errors.ts";
import type { AgentRuntimeProfile } from "./runtimeProfiles.ts";

export type AgentProposalCommitRoute = AgentOperationAttempt["route"];

type AgentProposalCommitContext = Readonly<{
  configuration: ResolvedAgentConfiguration;
  profile: AgentRuntimeProfile;
  runtimeKind: AgentOperationAuditEntryDto["runtimeKind"];
  sessionId: string;
}>;

export type AgentProposalCommitOutcome = Readonly<{
  proposal: AgentProposal;
  receipt: AgentOperationAuditEntryDto;
  replayed: boolean;
}>;

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

export class AgentProposalCommitter {
  readonly #builtInCatalog: ApiBuiltInCatalog;
  readonly #catalog: WorkspaceRepositoryCatalog;
  readonly #eventHub: ApiEventHub;
  readonly #ledger: OperationLedger | null;
  readonly #revisionTracker: ApiRevisionTracker;
  readonly #runtime: ApiRuntime;

  constructor({
    builtInCatalog,
    catalog,
    eventHub,
    ledger,
    revisionTracker,
    runtime,
  }: {
    builtInCatalog: ApiBuiltInCatalog;
    catalog: WorkspaceRepositoryCatalog;
    eventHub: ApiEventHub;
    ledger: OperationLedger | null;
    revisionTracker: ApiRevisionTracker;
    runtime: ApiRuntime;
  }) {
    this.#builtInCatalog = builtInCatalog;
    this.#catalog = catalog;
    this.#eventHub = eventHub;
    this.#ledger = ledger;
    this.#revisionTracker = revisionTracker;
    this.#runtime = runtime;
  }

  async commit({
    context,
    ownerId,
    proposal: initialProposal,
    requestId,
    route,
  }: {
    context: AgentProposalCommitContext;
    ownerId: string;
    proposal: AgentProposal;
    requestId: string;
    route: AgentProposalCommitRoute;
  }): Promise<AgentProposalCommitOutcome> {
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
        let result: AgentOperationAuditEntryDto["result"] = "failed";

        try {
          const store = await this.#proposalStore(proposal);
          const committed = await commitAgentProposalExactly({
            proposal,
            store,
          });

          afterRevision = committed.receipt.revision;
          result = "committed";
          proposal = committed.proposal;
          this.#publishCommittedProposal(proposal, afterRevision);
        } catch (error) {
          if (
            error instanceof WorkspaceRevisionConflictError ||
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
    );

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

  async #proposalStore(proposal: AgentProposal) {
    if (proposal.store.domain === "workspace") {
      return await this.#catalog.getStore(
        proposal.store.repositoryId,
      ) as WorkspaceRepositoryStore;
    }
    return await this.#builtInCatalog.getStore(proposal.store.domain) as
      VersionedContentStore<unknown, unknown>;
  }

  #auditEntry(
    context: AgentProposalCommitContext,
    proposal: AgentProposal,
    ownerId: string,
    afterRevision: `sha256:${string}` | null,
    result: AgentOperationAuditEntryDto["result"],
  ): AgentOperationAuditEntryDto {
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
      occurredAt: readApiRuntimeNow(this.#runtime).timestamp,
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
      occurredAt: readApiRuntimeNow(this.#runtime).timestamp,
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

  #publishCommittedProposal(
    proposal: AgentProposal,
    revision: `sha256:${string}`,
  ) {
    if (proposal.store.domain === "workspace") {
      this.#revisionTracker.observeWorkspace(proposal.store.repositoryId, revision);
    } else {
      this.#revisionTracker.observeDomain(proposal.store.domain, revision);
    }
    const checkpoint = this.#revisionTracker.checkpoint({
      sequence: this.#eventHub.sequence,
      streamId: this.#eventHub.streamId,
    });

    this.#eventHub.publish(checkpoint, proposal.changes);
  }
}
