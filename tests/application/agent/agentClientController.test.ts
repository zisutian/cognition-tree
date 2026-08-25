// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  createAgentClientController,
  type AgentClientEvent,
  type AgentClientPort,
  type AgentProfileSummary,
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
    profileDigest: `sha256:${"1".repeat(64)}`,
    profileId: "codex-safe",
    profileLabel: "Codex Safe",
    profileModel: "gpt-5.6-codex",
    profileVersion: 1,
    proposals: [],
    providerDigest: `sha256:${"2".repeat(64)}`,
    providerId: "codex-provider",
    providerVersion: 1,
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
  configurationProblem = null as string | null,
  flushScope = vi.fn(async () => undefined),
  preferredProfileId = null as string | null,
  profiles = [{
    authenticationStatus: "configured" as const,
    availability: "available" as const,
    id: "codex-safe",
    kind: "codex" as const,
    label: "Codex Safe",
    model: "gpt-5.6-codex",
    unavailableReason: null,
  }] as AgentProfileSummary[],
} = {}) {
  let currentSession = createSession();
  let listedSessions: AgentSessionSnapshot[] = [currentSession];
  let eventInput: Parameters<AgentClientPort["openEvents"]>[0] | null = null;
  let scheduled: (() => void) | null = null;
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
      configurationProblem,
      enabled: true,
      profiles,
    })),
    listSessions: vi.fn(async () => listedSessions),
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
  const profilePreference = {
    clear: vi.fn(),
    load: vi.fn(() => preferredProfileId),
    save: vi.fn(),
  };
  const controller = createAgentClientController({
    flushScope: flush,
    port,
    profilePreference,
    scheduler: {
      schedule: (callback) => {
        scheduled = callback;
        return () => {
          if (scheduled === callback) scheduled = null;
        };
      },
    },
  });

  return {
    calls,
    controller,
    emit(event: AgentClientEvent) {
      if (!eventInput) throw new Error("Event stream was not opened");
      eventInput.onEvent(event);
    },
    endEvents(error: unknown = null) {
      if (!eventInput) throw new Error("Event stream was not opened");
      eventInput.onClose(error);
    },
    flush,
    port,
    profilePreference,
    setSession(session: AgentSessionSnapshot) {
      currentSession = session;
    },
    setSessions(sessions: AgentSessionSnapshot[]) {
      listedSessions = sessions;
    },
    runScheduled() {
      if (!scheduled) throw new Error("No reconnect was scheduled");
      const callback = scheduled;

      scheduled = null;
      callback();
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
  it("requires an explicit available profile and never falls back", async () => {
    const unavailableProfile = {
      authenticationStatus: "missing" as const,
      availability: "unavailable" as const,
      id: "openai-missing",
      kind: "openai-chat" as const,
      label: "OpenAI Missing",
      model: "gpt-test",
      unavailableReason: "Server credential is missing",
    };
    const harness = createHarness({
      preferredProfileId: unavailableProfile.id,
      profiles: [
        unavailableProfile,
        {
          authenticationStatus: "configured" as const,
          availability: "available" as const,
          id: "codex-safe",
          kind: "codex" as const,
          label: "Codex Safe",
          model: "gpt-5.6-codex",
          unavailableReason: null,
        },
      ],
    });

    await start(harness);
    expect(harness.controller.getSnapshot().preferredProfileId)
      .toBe("openai-missing");
    await expect(harness.controller.createSession({
      scope: createSession().scope,
    })).rejects.toThrow("available Agent profile");
    expect(harness.port.createSession).not.toHaveBeenCalled();
    expect(harness.profilePreference.save).not.toHaveBeenCalled();

    harness.controller.setPreferredProfile("codex-safe");
    await harness.controller.createSession({ scope: createSession().scope });
    expect(harness.profilePreference.save).toHaveBeenCalledWith("codex-safe");
    expect(harness.port.createSession).toHaveBeenCalledWith({
      profileId: "codex-safe",
      scope: createSession().scope,
    });
    harness.controller.dispose();
  });

  it("clears a saved profile that no longer exists", async () => {
    const harness = createHarness({ preferredProfileId: "removed-profile" });

    await start(harness);
    expect(harness.controller.getSnapshot().preferredProfileId).toBeNull();
    expect(harness.profilePreference.clear).toHaveBeenCalledOnce();
    expect(harness.profilePreference.save).not.toHaveBeenCalled();
    harness.controller.dispose();
  });

  it("keeps optional unavailable profiles in Settings instead of Problems", async () => {
    const harness = createHarness({
      profiles: [{
        authenticationStatus: "configured",
        availability: "unavailable",
        id: "unverified-profile",
        kind: "ollama",
        label: "7B",
        model: "qwen2.5-coder:7b",
        unavailableReason: "Tool-call conformance has not been verified",
      }],
    });

    await start(harness);
    expect(harness.controller.getSnapshot().problems).toEqual([]);
    harness.controller.dispose();
  });

  it("still reports a broken Agent configuration as a global problem", async () => {
    const harness = createHarness({
      configurationProblem: "Agent configuration is invalid",
    });

    await start(harness);
    expect(harness.controller.getSnapshot().problems).toEqual([
      expect.objectContaining({
        code: "configuration_unavailable",
        message: "Agent configuration is invalid",
        sessionId: null,
      }),
    ]);
    harness.controller.dispose();
  });

  it("reloads sessions silently after a clean event-stream end", async () => {
    const harness = createHarness();

    await start(harness);
    harness.setSessions([]);
    harness.endEvents();
    harness.runScheduled();
    await vi.waitFor(() => {
      expect(harness.port.listSessions).toHaveBeenCalledTimes(2);
      expect(harness.controller.getSnapshot().sessions).toEqual([]);
    });
    expect(harness.controller.getSnapshot().problems).toEqual([]);
    harness.controller.dispose();
  });

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
