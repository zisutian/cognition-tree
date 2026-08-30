// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  AgentSessionController,
} from "../../../application/agent/agentSessionController.ts";
import type { AgentProposal } from "../../../application/agent/agentTypes.ts";

const proposal: AgentProposal = {
  base: {
    content: { value: 1 },
    projection: { prepared: 1 },
    revision: `sha256:${"1".repeat(64)}` as `sha256:${string}`,
  },
  changes: {
    blocks: [],
    occurredAt: "2026-08-30T00:00:00.000Z",
    resources: [],
  },
  destructive: false,
  digest: `sha256:${"a".repeat(64)}` as `sha256:${string}`,
  diff: [],
  id: "proposal-1",
  review: { resources: [], storeLabel: null },
  staged: {
    content: { value: 2 },
    projection: { prepared: 2 },
  },
  status: "pending",
  store: { domain: "journal" },
  version: 2,
};

function controller() {
  return new AgentSessionController({
    id: "session-1",
    profileId: "profile-1",
    runtime: {
      createId: () => "message-1",
      now: () => "2026-08-30T00:00:00.000Z",
    },
    scope: { domain: "journal", entryIds: null },
  });
}

describe("Agent session controller", () => {
  it("retains proposal approval authority when its producing turn fails", () => {
    const session = controller();

    session.beginTurn("turn-1", false);
    session.putProposal(proposal);
    session.failTurn("turn-1", "runtime failed after proposal creation");

    expect(session.snapshot()).toMatchObject({
      activeTurnId: null,
      problem: "runtime failed after proposal creation",
      state: "awaiting-approval",
    });
    expect(() => session.beginTurn("turn-2", false)).toThrow(
      "A proposal must be decided",
    );
  });
});
