// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  PreparedVersionedCommitReceipt,
  PreparedVersionedStore,
} from "../persistence/index.ts";
import type {
  AgentProposal,
  AgentProposalStatus,
  AgentStoreReference,
} from "./agentTypes.ts";
import type {
  DomainChangeSet,
  DomainTextEdit,
} from "../../core/sync/index.ts";

import type { ContentChangeReview } from "../commands/index.ts";

export class AgentProposalStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentProposalStateError";
  }
}

export type AgentProposalDigestPort = {
  digest(value: unknown): `sha256:${string}`;
};

export function createAgentProposal<
  Content,
  Projection,
  Revision extends `sha256:${string}`,
>({
  base,
  changes,
  destructive,
  digestPort,
  diff,
  id,
  review,
  staged,
  store,
  version = 2,
}: {
  base: { content: Content; projection: Projection; revision: Revision };
  changes: DomainChangeSet;
  destructive: boolean;
  digestPort: AgentProposalDigestPort;
  diff: readonly DomainTextEdit[];
  id: string;
  review: ContentChangeReview;
  staged: { content: Content; projection: Projection };
  store: AgentStoreReference;
  version?: number;
}): AgentProposal<Content, Projection, Revision> {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new AgentProposalStateError("Proposal version must be positive");
  }
  const digest = digestPort.digest({
    baseRevision: base.revision,
    changes,
    content: staged.content,
    destructive,
    diff,
    id,
    review,
    store,
    version,
  });

  return {
    base,
    changes,
    destructive,
    digest,
    diff,
    id,
    review,
    staged,
    status: "pending",
    store,
    version,
  };
}

function transitionProposal<
  Content,
  Projection,
  Revision extends string,
>(
  proposal: AgentProposal<Content, Projection, Revision>,
  status: AgentProposalStatus,
) {
  return { ...proposal, status };
}

export function decideAgentProposal<
  Content,
  Projection,
  Revision extends string,
>(
  proposal: AgentProposal<Content, Projection, Revision>,
  decision: "approve" | "reject",
) {
  if (proposal.status !== "pending") {
    throw new AgentProposalStateError("Proposal has already been decided");
  }
  if (decision === "reject") {
    return transitionProposal(proposal, "rejected");
  }
  return transitionProposal(
    proposal,
    proposal.destructive ? "awaiting-destructive-confirmation" : "approved",
  );
}

export function confirmAgentProposalDestruction<
  Content,
  Projection,
  Revision extends string,
>(proposal: AgentProposal<Content, Projection, Revision>) {
  if (proposal.status !== "awaiting-destructive-confirmation") {
    throw new AgentProposalStateError(
      "Proposal is not awaiting destructive confirmation",
    );
  }
  return transitionProposal(proposal, "approved");
}

export type AgentExactCommitResult<
  Content,
  Projection,
  Revision extends string,
> = Readonly<{
  proposal: AgentProposal<Content, Projection, Revision>;
  receipt: PreparedVersionedCommitReceipt<Content, Projection, Revision>;
}>;

export async function commitAgentProposalExactly<
  Content,
  Projection,
  Revision extends `sha256:${string}`,
>({
  proposal,
  store,
}: {
  proposal: AgentProposal<Content, Projection, Revision>;
  store: PreparedVersionedStore<Content, Projection, Revision>;
}): Promise<AgentExactCommitResult<Content, Projection, Revision>> {
  if (proposal.status !== "approved") {
    throw new AgentProposalStateError("Proposal is not approved");
  }
  const receipt = await store.commit({
    baseRevision: proposal.base.revision,
    content: proposal.staged.content,
    projection: proposal.staged.projection,
  });

  return {
    proposal: transitionProposal(proposal, "committed"),
    receipt,
  };
}

export function markAgentProposalStale<
  Content,
  Projection,
  Revision extends string,
>(proposal: AgentProposal<Content, Projection, Revision>) {
  return transitionProposal(proposal, "stale");
}

export function markAgentProposalFailed<
  Content,
  Projection,
  Revision extends string,
>(proposal: AgentProposal<Content, Projection, Revision>) {
  return transitionProposal(proposal, "failed");
}

export function markAgentProposalIndeterminate<
  Content,
  Projection,
  Revision extends string,
>(proposal: AgentProposal<Content, Projection, Revision>) {
  return transitionProposal(proposal, "indeterminate");
}
