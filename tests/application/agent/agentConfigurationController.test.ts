// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  createAgentConfigurationController,
  type AgentConformanceCheckStatus,
  type AgentConfigurationPort,
  type AgentConfigurationSnapshot,
} from "../../../application/agent";

const revision = (value: string) =>
  `sha256:${value.repeat(64)}` as `sha256:${string}`;

function snapshot(value: string): AgentConfigurationSnapshot {
  return { profiles: [], providers: [], revision: revision(value) };
}

function check(
  status: AgentConformanceCheckStatus["status"],
): AgentConformanceCheckStatus {
  return {
    completedAt: status === "running" ? null : "2026-08-25T00:01:00.000Z",
    errorMessage: null,
    id: "check-1",
    phase: status === "running" ? "calling-tool" : "summarizing",
    profileId: "profile-1",
    startedAt: "2026-08-25T00:00:00.000Z",
    status,
  };
}

function port(): AgentConfigurationPort {
  return {
    cancelConformance: vi.fn(async () => check("cancelled")),
    createProfile: vi.fn(async () => snapshot("3")),
    createProvider: vi.fn(async () => snapshot("2")),
    deleteProfile: vi.fn(async () => snapshot("3")),
    deleteProvider: vi.fn(async () => snapshot("3")),
    discoverOllama: vi.fn(async (endpoint) => ({
      endpoint,
      models: ["qwen3:8b"],
    })),
    getConformance: vi.fn(async () => check("succeeded")),
    load: vi.fn(async () => snapshot("1")),
    probeProvider: vi.fn(async () => ({
      models: ["qwen3:8b"],
      reachable: true,
    })),
    startConformance: vi.fn(async () => check("running")),
    updateProfile: vi.fn(async () => snapshot("3")),
    updateProvider: vi.fn(async () => snapshot("3")),
  };
}

describe("Agent configuration controller", () => {
  it("owns exact-revision mutations and explicit discovery state", async () => {
    const adapter = port();
    const changed = vi.fn();
    const controller = createAgentConfigurationController({
      onConfigurationChanged: changed,
      pollConformance: async () => undefined,
      pollConformanceIntervalMilliseconds: 1,
      port: adapter,
    });

    await controller.load();
    await controller.discoverOllama("http://127.0.0.1:11434");
    await controller.createProvider({
      authenticationType: "none",
      baseUrl: "http://127.0.0.1:11434",
      kind: "ollama",
      label: "Local Ollama",
      privateNetworkAccessConfirmed: false,
    });

    expect(adapter.createProvider).toHaveBeenCalledWith(
      revision("1"),
      expect.objectContaining({ kind: "ollama" }),
    );
    expect(controller.getSnapshot()).toMatchObject({
      configuration: { revision: revision("2") },
      discovery: { models: ["qwen3:8b"] },
      operationStatus: "idle",
    });
    expect(changed).toHaveBeenCalledOnce();
  });

  it("retains the server conflict and does not replace current state", async () => {
    const adapter = port();

    vi.mocked(adapter.createProvider).mockRejectedValueOnce(
      new Error("Agent configuration revision changed"),
    );
    const controller = createAgentConfigurationController({
      onConfigurationChanged: vi.fn(),
      pollConformance: async () => undefined,
      pollConformanceIntervalMilliseconds: 1,
      port: adapter,
    });

    await controller.load();
    await expect(controller.createProvider({
      authenticationType: "none",
      baseUrl: "http://127.0.0.1:11434",
      kind: "ollama",
      label: "Local Ollama",
      privateNetworkAccessConfirmed: false,
    })).rejects.toThrow("revision changed");
    expect(controller.getSnapshot()).toMatchObject({
      configuration: { revision: revision("1") },
      errorMessage: "Agent configuration revision changed",
      operationStatus: "idle",
    });
  });

  it("polls an accepted conformance check without holding one HTTP request", async () => {
    const adapter = port();
    const changed = vi.fn();

    vi.mocked(adapter.load)
      .mockResolvedValueOnce(snapshot("1"))
      .mockResolvedValueOnce(snapshot("3"));
    const controller = createAgentConfigurationController({
      onConfigurationChanged: changed,
      pollConformance: async () => undefined,
      pollConformanceIntervalMilliseconds: 1,
      port: adapter,
    });

    await controller.load();
    await controller.checkConformance("profile-1");

    expect(adapter.startConformance).toHaveBeenCalledWith(
      revision("1"),
      "profile-1",
    );
    expect(adapter.getConformance).toHaveBeenCalledWith("check-1");
    expect(controller.getSnapshot()).toMatchObject({
      configuration: { revision: revision("3") },
      conformanceChecks: { "profile-1": { status: "succeeded" } },
      operationStatus: "idle",
    });
    expect(changed).toHaveBeenCalledOnce();
  });
});
