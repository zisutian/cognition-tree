// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  createAgentClientController,
  type AgentClientEvent,
  type AgentClientPort,
  type AgentSessionSnapshot,
} from "../../../application/agent";

const sessionId = "00000000-0000-4000-8000-000000000001";
const messageId = "00000000-0000-4000-8000-000000000002";
const proposalId = "00000000-0000-4000-8000-000000000003";

function createSession(sequence = 3): AgentSessionSnapshot {
  return {
    activeTurnId: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    id: sessionId,
    lastActiveAt: "2026-08-20T00:00:00.000Z",
    messages: [{
      content: "A",
      createdAt: "2026-08-20T00:00:00.000Z",
      id: messageId,
      role: "assistant",
    }],
    problem: null,
    profileId: "codex-safe",
    proposals: [],
    scope: {
      domain: "workspace",
      repositoryId: "repository-a",
      target: { kind: "repository" },
    },
    sequence,
    state: "idle",
  };
}

function createHarness({
  flushScope = vi.fn(async () => undefined),
} = {}) {
  let currentSession = createSession();
  let eventInput: Parameters<AgentClientPort["openEvents"]>[0] | null = null;
  const calls: string[] = [];
  const port: AgentClientPort = {
    cancel: vi.fn(async () => undefined),
    confirmDestruction: vi.fn(async () => {
      calls.push("confirm");
      return {} as never;
    }),
    createSession: vi.fn(async () => currentSession),
    decideProposal: vi.fn(async (_sessionId, _proposalId, decision) => {
      calls.push(`decide:${decision}`);
      return {} as never;
    }),
    deleteSession: vi.fn(async () => undefined),
    getSession: vi.fn(async () => {
      calls.push("refresh");
      return currentSession;
    }),
    getStatus: vi.fn(async () => ({
      configurationProblem: null,
      enabled: true,
      profiles: [{
        availability: "available" as const,
        id: "codex-safe",
        kind: "codex" as const,
        label: "Codex Safe",
        unavailableReason: null,
      }],
    })),
    listSessions: vi.fn(async () => [currentSession]),
    openEvents(input) {
      eventInput = input;
      return { close: vi.fn() };
    },
    sendMessage: vi.fn(async () => {
      calls.push("send");
    }),
  };
  const flush = vi.fn(async (...args: Parameters<typeof flushScope>) => {
    calls.push("flush");
    return flushScope(...args);
  });
  const controller = createAgentClientController({
    flushScope: flush,
    port,
    scheduler: {
      schedule: () => () => undefined,
    },
  });

  return {
    calls,
    controller,
    emit(event: AgentClientEvent) {
      if (!eventInput) throw new Error("Event stream was not opened");
      eventInput.onEvent(event);
    },
    flush,
    port,
    setSession(session: AgentSessionSnapshot) {
      currentSession = session;
    },
  };
}

async function start(harness: ReturnType<typeof createHarness>) {
  harness.controller.start();
  await vi.waitFor(() => {
    expect(harness.controller.getSnapshot().loadStatus).toBe("ready");
  });
  harness.calls.splice(0);
}

describe("Agent client controller", () => {
  it("synchronizes the scoped draft before send and approving actions", async () => {
    const harness = createHarness();

    await start(harness);
    await harness.controller.sendMessage("update the note");
    expect(harness.calls).toEqual(["flush", "send", "refresh"]);

    harness.calls.splice(0);
    await harness.controller.decideProposal(proposalId, "reject");
    expect(harness.calls).toEqual(["decide:reject", "refresh"]);

    harness.calls.splice(0);
    await harness.controller.decideProposal(proposalId, "approve");
    expect(harness.calls).toEqual(["flush", "decide:approve", "refresh"]);

    harness.calls.splice(0);
    await harness.controller.confirmDestruction(proposalId);
    expect(harness.calls).toEqual(["flush", "confirm", "refresh"]);
    harness.controller.dispose();
  });

  it("does not contact the Agent API when draft synchronization fails", async () => {
    const harness = createHarness({
      flushScope: vi.fn(async () => {
        throw new Error("Repository is offline");
      }),
    });

    await start(harness);
    await expect(harness.controller.sendMessage("must not be sent"))
      .rejects.toThrow("offline");
    expect(harness.port.sendMessage).not.toHaveBeenCalled();
    expect(harness.controller.getSnapshot().problems).toEqual([
      expect.objectContaining({ message: "Repository is offline" }),
    ]);
    harness.controller.dispose();
  });

  it("applies contiguous deltas incrementally and rereads on a sequence gap", async () => {
    const harness = createHarness();

    await start(harness);
    harness.emit({
      messageId,
      sequence: 4,
      sessionId,
      textDelta: "B",
      type: "message-delta",
    });
    expect(harness.controller.getSnapshot().sessions[0]?.messages[0]?.content)
      .toBe("AB");
    expect(harness.controller.getSnapshot().sessions[0]?.sequence).toBe(4);

    harness.setSession(createSession(7));
    harness.emit({
      sequence: 7,
      sessionId,
      status: "completed",
      turnId: "00000000-0000-4000-8000-000000000004",
      type: "turn-completed",
    });
    await vi.waitFor(() => {
      expect(harness.port.getSession).toHaveBeenCalledTimes(1);
      expect(harness.controller.getSnapshot().sessions[0]?.sequence).toBe(7);
    });
    harness.controller.dispose();
  });
});
