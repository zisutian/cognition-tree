// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, type APIRequestContext } from "@playwright/test";
import {
  AgentSessionSnapshotSchema,
  parseAgentSchema,
} from "../../contracts/agent";
import { buildApiOperationPath } from "../../contracts/api/registry";
import { e2eAgentProfileId } from "./fakeAgentRuntime";

/** Prepare a real pending proposal through the deterministic model protocol. */
export async function seedJournalProposal(api: APIRequestContext) {
  const created = await api.post(buildApiOperationPath("createAgentSession"), {
    data: {
      profileId: e2eAgentProfileId,
      scope: { domain: "journal", entryIds: null },
    },
  });
  expect(created.status()).toBe(201);
  let session = parseAgentSchema(
    AgentSessionSnapshotSchema,
    await created.json(),
  );
  const sessionId = session.id;
  const sent = await api.post(
    buildApiOperationPath("sendAgentMessage", { sessionId }),
    {
      data: { content: "创建一篇测试日记" },
    },
  );
  expect(sent.status()).toBe(202);
  await expect
    .poll(async () => {
      const response = await api.get(
        buildApiOperationPath("getAgentSession", { sessionId }),
      );
      expect(response.status()).toBe(200);
      session = parseAgentSchema(
        AgentSessionSnapshotSchema,
        await response.json(),
      );
      return session.state;
    })
    .toBe("awaiting-approval");
  const proposal = session.proposals.find(({ status }) => status === "pending");
  if (!proposal) throw new Error("Expected a pending Journal proposal");
  return { sessionId, proposalId: proposal.id };
}
