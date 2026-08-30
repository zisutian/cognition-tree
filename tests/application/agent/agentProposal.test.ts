// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  commitAgentProposalExactly,
  confirmAgentProposalDestruction,
  createAgentProposal,
  decideAgentProposal,
  markAgentProposalIndeterminate,
} from "../../../application/agent/agentProposal.ts";

const beforeRevision =
  `sha256:${"1".repeat(64)}` as `sha256:${string}`;
const afterRevision =
  `sha256:${"2".repeat(64)}` as `sha256:${string}`;

function proposal(
  destructive = false,
  digest = vi.fn(() =>
    `sha256:${"a".repeat(64)}` as `sha256:${string}`
  ),
) {
  return createAgentProposal({
    base: {
      content: { value: 1 },
      projection: { prepared: 1 },
      revision: beforeRevision,
    },
    changes: {
      blocks: [],
      occurredAt: "2026-08-20T00:00:00.000Z",
      resources: [],
    },
    destructive,
    digestPort: { digest },
    diff: [],
    id: "00000000-0000-4000-8000-000000000001",
    review: { resources: [], storeLabel: null },
    staged: {
      content: { value: 2 },
      projection: { prepared: 2 },
    },
    store: { domain: "journal" as const },
  });
}

describe("Agent proposal authority", () => {
  it("includes the frozen review in proposal integrity version 2", () => {
    const digest = vi.fn(() =>
      `sha256:${"a".repeat(64)}` as `sha256:${string}`
    );
    const created = proposal(false, digest);

    expect(created.version).toBe(2);
    expect(created.review).toEqual({ resources: [], storeLabel: null });
    expect(digest).toHaveBeenCalledWith(expect.objectContaining({
      review: { resources: [], storeLabel: null },
      version: 2,
    }));
  });

  it("commits the approved staged content through exactly one CAS call", async () => {
    const approved = decideAgentProposal(proposal(), "approve");
    const loadSnapshot = vi.fn();
    const commit = vi.fn(async (transaction) => ({
      after: {
        content: transaction.content,
        projection: transaction.projection,
        revision: afterRevision,
      },
      before: approved.base,
      revision: afterRevision,
    }));

    const result = await commitAgentProposalExactly({
      proposal: approved,
      store: { commit, loadSnapshot },
    });

    expect(loadSnapshot).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith({
      baseRevision: beforeRevision,
      content: approved.staged.content,
      projection: approved.staged.projection,
    });
    expect(result.proposal.status).toBe("committed");
  });

  it("requires a separate confirmation before a destructive proposal can commit", async () => {
    const awaiting = decideAgentProposal(proposal(true), "approve");
    const commit = vi.fn();

    expect(awaiting.status).toBe("awaiting-destructive-confirmation");
    await expect(commitAgentProposalExactly({
      proposal: awaiting,
      store: { commit, loadSnapshot: vi.fn() },
    })).rejects.toThrow("Proposal is not approved");

    expect(confirmAgentProposalDestruction(awaiting).status).toBe("approved");
    expect(commit).not.toHaveBeenCalled();
  });

  it("keeps proposal decisions whole and immutable", () => {
    const original = proposal();
    const rejected = decideAgentProposal(original, "reject");

    expect(original.status).toBe("pending");
    expect(rejected.status).toBe("rejected");
    expect(() => decideAgentProposal(rejected, "approve")).toThrow(
      "Proposal has already been decided",
    );
  });

  it("projects an indeterminate commit as a terminal immutable proposal", () => {
    const approved = decideAgentProposal(proposal(), "approve");
    const indeterminate = markAgentProposalIndeterminate(approved);

    expect(approved.status).toBe("approved");
    expect(indeterminate.status).toBe("indeterminate");
  });
});
