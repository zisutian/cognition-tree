// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  createAgentConfigurationController,
  type AgentConformanceCheckStatus,
  type AgentConfigurationPort,
  type AgentConfigurationSnapshot,
  type AgentOllamaDiscovery,
  type AgentProviderInput,
  type AgentProviderProbe,
} from "../../../application/agent";

const revision = (value: string) =>
  `sha256:${value.repeat(64)}` as `sha256:${string}`;

function snapshot(
  value: string,
  {
    profile = true,
    provider = true,
  }: { profile?: boolean; provider?: boolean } = {},
): AgentConfigurationSnapshot {
  return {
    profiles: profile
      ? [{
          availability: "available",
          conformance: null,
          digest: revision("b"),
          id: "profile-1",
          label: "Default profile",
          maxResidentSessions: 1,
          model: "qwen3:8b",
          parameters: {
            historyBudgetCharacters: 10_000,
            kind: "chat",
            maxOutputTokens: 1_024,
            maxToolSteps: 4,
            reasoningEffort: "model-default",
            toolCallMode: "native",
          },
          providerId: "provider-1",
          timeoutMilliseconds: 30_000,
          unavailableReason: null,
          version: 1,
        }]
      : [],
    providers: provider
      ? [{
          authenticationStatus: "not-required",
          authenticationType: "none",
          baseUrl: "http://127.0.0.1:11434",
          digest: revision("a"),
          id: "provider-1",
          kind: "ollama",
          label: "Local Ollama",
          privateNetworkAccess: "not-required",
          version: 1,
        }]
      : [],
    revision: revision(value),
  };
}

function providerInput(): AgentProviderInput {
  return {
    authenticationType: "none",
    baseUrl: "http://127.0.0.1:11434",
    kind: "ollama",
    label: "Local Ollama",
    privateNetworkAccessConfirmed: false,
  };
}

function createDeferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
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
    cancelCodexDeviceLogin: vi.fn(async () => ({
      completedAt: "2026-08-25T00:01:00.000Z",
      errorMessage: null,
      expiresAt: "2026-08-25T00:15:00.000Z",
      id: "login-1",
      providerId: "provider-1",
      startedAt: "2026-08-25T00:00:00.000Z",
      status: "cancelled" as const,
      userCode: "ABCD-EFGH",
      verificationUrl: "https://auth.openai.com/device",
    })),
    cancelConformance: vi.fn(async () => check("cancelled")),
    clearProviderAuthentication: vi.fn(async () => snapshot("3")),
    createProfile: vi.fn(async () => snapshot("3")),
    createProvider: vi.fn(async () => snapshot("2")),
    deleteProfile: vi.fn(async () => snapshot("3")),
    deleteProvider: vi.fn(async () => snapshot("3")),
    discoverOllama: vi.fn(async (endpoint) => ({
      endpoint,
      models: ["qwen3:8b"],
    })),
    getConformance: vi.fn(async () => check("succeeded")),
    getCodexDeviceLogin: vi.fn(async () => ({
      completedAt: "2026-08-25T00:01:00.000Z",
      errorMessage: null,
      expiresAt: "2026-08-25T00:15:00.000Z",
      id: "login-1",
      providerId: "provider-1",
      startedAt: "2026-08-25T00:00:00.000Z",
      status: "succeeded" as const,
      userCode: "ABCD-EFGH",
      verificationUrl: "https://auth.openai.com/device",
    })),
    load: vi.fn(async () => snapshot("1")),
    probeProvider: vi.fn(async () => ({
      modelContexts: [{
        declaredMaximumContextTokens: 262_144,
        model: "qwen3:8b",
        residentContext: {
          allocatedContextTokens: 24_576,
          status: "loaded" as const,
        },
      }],
      models: ["qwen3:8b"],
      probedAt: "2026-08-25T00:00:00.000Z",
      reachable: true,
    })),
    startConformance: vi.fn(async () => check("running")),
    startCodexDeviceLogin: vi.fn(async () => ({
      completedAt: null,
      errorMessage: null,
      expiresAt: "2026-08-25T00:15:00.000Z",
      id: "login-1",
      providerId: "provider-1",
      startedAt: "2026-08-25T00:00:00.000Z",
      status: "pending" as const,
      userCode: "ABCD-EFGH",
      verificationUrl: "https://auth.openai.com/device",
    })),
    updateProfile: vi.fn(async () => snapshot("3")),
    updateProvider: vi.fn(async () => snapshot("3")),
  };
}

describe("Agent configuration controller", () => {
  it("returns a committed configuration when the dependent status refresh fails", async () => {
    const adapter = port();
    const saved = snapshot("2");
    vi.mocked(adapter.updateProvider).mockResolvedValue(saved);
    const controller = createAgentConfigurationController({
      onConfigurationChanged: async () => { throw new Error("status unavailable"); },
      pollConformance: async () => undefined,
      pollConformanceIntervalMilliseconds: 1,
      port: adapter,
    });
    await controller.load();
    const baseRevision = controller.getSnapshot().configuration!.revision;
    await expect(controller.updateProvider(baseRevision, "provider-1", providerInput())).resolves.toEqual(saved);
    expect(adapter.updateProvider).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().configuration).toEqual(saved);
    expect(controller.getSnapshot().errorMessage).toContain("配置已保存，状态刷新失败");
    controller.dispose();
  });

  it("submits the form's frozen revision after a newer configuration was loaded", async () => {
    const adapter = port();
    const controller = createAgentConfigurationController({
      onConfigurationChanged: vi.fn(),
      pollConformance: async () => undefined,
      pollConformanceIntervalMilliseconds: 1,
      port: adapter,
    });
    await controller.load();
    const formRevision = controller.getSnapshot().configuration!.revision;
    vi.mocked(adapter.load).mockResolvedValueOnce(snapshot("2"));
    await controller.load();
    vi.mocked(adapter.updateProvider).mockRejectedValueOnce(new Error("revision changed"));
    await expect(controller.updateProvider(formRevision, "provider-1", providerInput()))
      .rejects.toThrow("revision changed");
    expect(adapter.updateProvider).toHaveBeenCalledExactlyOnceWith(revision("1"), "provider-1", providerInput());
    expect(controller.getSnapshot().configuration?.revision).toBe(revision("2"));
  });

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
    await controller.createProvider(revision("1"), providerInput());

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
    await expect(controller.createProvider(revision("1"), providerInput())).rejects.toThrow(
      "revision changed",
    );
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

  it("returns a pending device login immediately and refreshes after completion", async () => {
    const adapter = port();
    const changed = vi.fn();
    const polling = createDeferred<void>();

    vi.mocked(adapter.load)
      .mockResolvedValueOnce(snapshot("1"))
      .mockResolvedValueOnce(snapshot("3"));
    const controller = createAgentConfigurationController({
      onConfigurationChanged: changed,
      pollConformance: () => polling.promise,
      pollConformanceIntervalMilliseconds: 1,
      port: adapter,
    });

    await controller.load();
    await controller.startCodexDeviceLogin("provider-1");

    expect(adapter.startCodexDeviceLogin).toHaveBeenCalledWith(
      revision("1"),
      "provider-1",
    );
    expect(controller.getSnapshot()).toMatchObject({
      codexDeviceLogins: { "provider-1": { status: "pending" } },
      operationStatus: "idle",
    });
    polling.resolve();
    await vi.waitFor(() => {
      expect(controller.getSnapshot()).toMatchObject({
        codexDeviceLogins: { "provider-1": { status: "succeeded" } },
        configuration: { revision: revision("3") },
      });
    });
    expect(changed).toHaveBeenCalledOnce();
  });

  it("does not let an older device-login poll overwrite cancellation", async () => {
    const adapter = port();
    const stalePoll = createDeferred<
      Awaited<ReturnType<AgentConfigurationPort["getCodexDeviceLogin"]>>
    >();

    vi.mocked(adapter.getCodexDeviceLogin).mockImplementationOnce(
      () => stalePoll.promise,
    );
    const controller = createAgentConfigurationController({
      onConfigurationChanged: vi.fn(),
      pollConformance: async () => undefined,
      pollConformanceIntervalMilliseconds: 1,
      port: adapter,
    });

    await controller.load();
    await controller.startCodexDeviceLogin("provider-1");
    await vi.waitFor(() => {
      expect(adapter.getCodexDeviceLogin).toHaveBeenCalledWith("login-1");
    });
    await controller.cancelCodexDeviceLogin("provider-1");
    stalePoll.resolve({
      completedAt: null,
      errorMessage: null,
      expiresAt: "2026-08-25T00:15:00.000Z",
      id: "login-1",
      providerId: "provider-1",
      startedAt: "2026-08-25T00:00:00.000Z",
      status: "pending",
      userCode: "ABCD-EFGH",
      verificationUrl: "https://auth.openai.com/device",
    });
    await stalePoll.promise;
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(adapter.getCodexDeviceLogin).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toMatchObject({
      codexDeviceLogins: { "provider-1": { status: "cancelled" } },
      operationStatus: "idle",
    });
  });

  it("does not let an older conformance poll overwrite cancellation", async () => {
    const adapter = port();
    const stalePoll = createDeferred<AgentConformanceCheckStatus>();

    vi.mocked(adapter.getConformance).mockImplementationOnce(
      () => stalePoll.promise,
    );
    const controller = createAgentConfigurationController({
      onConfigurationChanged: vi.fn(),
      pollConformance: async () => undefined,
      pollConformanceIntervalMilliseconds: 1,
      port: adapter,
    });

    await controller.load();
    const checking = controller.checkConformance("profile-1");

    await vi.waitFor(() => {
      expect(adapter.getConformance).toHaveBeenCalledWith("check-1");
    });
    await controller.cancelConformance("profile-1");
    stalePoll.resolve(check("running"));
    await checking;

    expect(controller.getSnapshot()).toMatchObject({
      conformanceChecks: { "profile-1": { status: "cancelled" } },
      operationStatus: "idle",
    });
  });

  it("keeps polling when device-login cancellation is not terminal", async () => {
    const adapter = port();
    const finishing = createDeferred<
      Awaited<ReturnType<AgentConfigurationPort["getCodexDeviceLogin"]>>
    >();

    vi.mocked(adapter.load)
      .mockResolvedValueOnce(snapshot("1"))
      .mockResolvedValueOnce(snapshot("3"));
    vi.mocked(adapter.getCodexDeviceLogin).mockImplementationOnce(
      () => finishing.promise,
    );
    vi.mocked(adapter.cancelCodexDeviceLogin).mockResolvedValueOnce({
      completedAt: null,
      errorMessage: null,
      expiresAt: "2026-08-25T00:15:00.000Z",
      id: "login-1",
      providerId: "provider-1",
      startedAt: "2026-08-25T00:00:00.000Z",
      status: "pending",
      userCode: "ABCD-EFGH",
      verificationUrl: "https://auth.openai.com/device",
    });
    const changed = vi.fn();
    const controller = createAgentConfigurationController({
      onConfigurationChanged: changed,
      pollConformance: async () => undefined,
      pollConformanceIntervalMilliseconds: 1,
      port: adapter,
    });

    await controller.load();
    await controller.startCodexDeviceLogin("provider-1");
    await vi.waitFor(() => {
      expect(adapter.getCodexDeviceLogin).toHaveBeenCalledWith("login-1");
    });
    await controller.cancelCodexDeviceLogin("provider-1");
    finishing.resolve({
      completedAt: "2026-08-25T00:01:00.000Z",
      errorMessage: null,
      expiresAt: "2026-08-25T00:15:00.000Z",
      id: "login-1",
      providerId: "provider-1",
      startedAt: "2026-08-25T00:00:00.000Z",
      status: "succeeded",
      userCode: "ABCD-EFGH",
      verificationUrl: "https://auth.openai.com/device",
    });

    await vi.waitFor(() => {
      expect(controller.getSnapshot()).toMatchObject({
        codexDeviceLogins: { "provider-1": { status: "succeeded" } },
        configuration: { revision: revision("3") },
      });
    });
    expect(changed).toHaveBeenCalledOnce();
  });

  it("does not let a late nonterminal cancellation regress login success", async () => {
    const adapter = port();
    const finishing = createDeferred<
      Awaited<ReturnType<AgentConfigurationPort["getCodexDeviceLogin"]>>
    >();
    const cancelling = createDeferred<
      Awaited<ReturnType<AgentConfigurationPort["cancelCodexDeviceLogin"]>>
    >();

    vi.mocked(adapter.load)
      .mockResolvedValueOnce(snapshot("1"))
      .mockResolvedValueOnce(snapshot("3"));
    vi.mocked(adapter.getCodexDeviceLogin).mockImplementationOnce(
      () => finishing.promise,
    );
    vi.mocked(adapter.cancelCodexDeviceLogin).mockImplementationOnce(
      () => cancelling.promise,
    );
    const changed = vi.fn();
    const controller = createAgentConfigurationController({
      onConfigurationChanged: changed,
      pollConformance: async () => undefined,
      pollConformanceIntervalMilliseconds: 1,
      port: adapter,
    });

    await controller.load();
    await controller.startCodexDeviceLogin("provider-1");
    await vi.waitFor(() => {
      expect(adapter.getCodexDeviceLogin).toHaveBeenCalledWith("login-1");
    });
    const cancellation = controller.cancelCodexDeviceLogin("provider-1");

    finishing.resolve({
      completedAt: "2026-08-25T00:01:00.000Z",
      errorMessage: null,
      expiresAt: "2026-08-25T00:15:00.000Z",
      id: "login-1",
      providerId: "provider-1",
      startedAt: "2026-08-25T00:00:00.000Z",
      status: "succeeded",
      userCode: "ABCD-EFGH",
      verificationUrl: "https://auth.openai.com/device",
    });
    await vi.waitFor(() => {
      expect(controller.getSnapshot().codexDeviceLogins["provider-1"]?.status)
        .toBe("succeeded");
    });
    cancelling.resolve({
      completedAt: null,
      errorMessage: null,
      expiresAt: "2026-08-25T00:15:00.000Z",
      id: "login-1",
      providerId: "provider-1",
      startedAt: "2026-08-25T00:00:00.000Z",
      status: "pending",
      userCode: "ABCD-EFGH",
      verificationUrl: "https://auth.openai.com/device",
    });
    await cancellation;

    expect(controller.getSnapshot()).toMatchObject({
      codexDeviceLogins: { "provider-1": { status: "succeeded" } },
      configuration: { revision: revision("3") },
      operationStatus: "idle",
    });
    expect(changed).toHaveBeenCalledOnce();
  });

  it("keeps polling when conformance cancellation is not terminal", async () => {
    const adapter = port();
    const finishing = createDeferred<AgentConformanceCheckStatus>();

    vi.mocked(adapter.load)
      .mockResolvedValueOnce(snapshot("1"))
      .mockResolvedValueOnce(snapshot("3"));
    vi.mocked(adapter.getConformance).mockImplementationOnce(
      () => finishing.promise,
    );
    vi.mocked(adapter.cancelConformance).mockResolvedValueOnce({
      ...check("running"),
      phase: "recording-result",
    });
    const changed = vi.fn();
    const controller = createAgentConfigurationController({
      onConfigurationChanged: changed,
      pollConformance: async () => undefined,
      pollConformanceIntervalMilliseconds: 1,
      port: adapter,
    });

    await controller.load();
    const checking = controller.checkConformance("profile-1");

    await vi.waitFor(() => {
      expect(adapter.getConformance).toHaveBeenCalledWith("check-1");
    });
    await controller.cancelConformance("profile-1");
    finishing.resolve(check("succeeded"));
    await checking;

    expect(controller.getSnapshot()).toMatchObject({
      configuration: { revision: revision("3") },
      conformanceChecks: { "profile-1": { status: "succeeded" } },
      operationStatus: "idle",
    });
    expect(changed).toHaveBeenCalledOnce();
  });

  it("does not let an older load overwrite a committed mutation", async () => {
    const adapter = port();
    const controller = createAgentConfigurationController({
      onConfigurationChanged: vi.fn(),
      pollConformance: async () => undefined,
      pollConformanceIntervalMilliseconds: 1,
      port: adapter,
    });

    await controller.load();
    const staleLoad = createDeferred<AgentConfigurationSnapshot>();

    vi.mocked(adapter.load).mockImplementationOnce(() => staleLoad.promise);
    const loading = controller.load();

    await controller.createProvider(revision("1"), providerInput());
    staleLoad.resolve(snapshot("1"));
    await loading;

    expect(controller.getSnapshot()).toMatchObject({
      configuration: { revision: revision("2") },
      loadStatus: "ready",
    });
  });

  it("removes operation state when configuration entities are deleted", async () => {
    const adapter = port();
    const controller = createAgentConfigurationController({
      onConfigurationChanged: vi.fn(),
      pollConformance: async () => undefined,
      pollConformanceIntervalMilliseconds: 1,
      port: adapter,
    });

    await controller.load();
    await controller.probeProvider("provider-1");
    await controller.checkConformance("profile-1");
    await controller.startCodexDeviceLogin("provider-1");
    await vi.waitFor(() => {
      expect(controller.getSnapshot().codexDeviceLogins["provider-1"]?.status)
        .toBe("succeeded");
    });
    vi.mocked(adapter.deleteProfile).mockResolvedValueOnce(
      snapshot("4", { profile: false }),
    );
    await controller.deleteProfile("profile-1");

    expect(controller.getSnapshot()).toMatchObject({
      codexDeviceLogins: { "provider-1": { status: "succeeded" } },
      conformanceChecks: {},
      probes: { "provider-1": { reachable: true } },
    });

    vi.mocked(adapter.deleteProvider).mockResolvedValueOnce(
      snapshot("5", { profile: false, provider: false }),
    );
    await controller.deleteProvider("provider-1");

    expect(controller.getSnapshot()).toMatchObject({
      codexDeviceLogins: {},
      conformanceChecks: {},
      probes: {},
    });
  });

  it("ignores a provider probe that finishes after deletion", async () => {
    const adapter = port();
    const pendingProbe = createDeferred<AgentProviderProbe>();

    vi.mocked(adapter.probeProvider).mockImplementationOnce(
      () => pendingProbe.promise,
    );
    vi.mocked(adapter.deleteProvider).mockResolvedValueOnce(
      snapshot("4", { profile: false, provider: false }),
    );
    const controller = createAgentConfigurationController({
      onConfigurationChanged: vi.fn(),
      pollConformance: async () => undefined,
      pollConformanceIntervalMilliseconds: 1,
      port: adapter,
    });

    await controller.load();
    const probing = controller.probeProvider("provider-1");

    await controller.deleteProvider("provider-1");
    pendingProbe.resolve({
      modelContexts: [],
      models: [],
      probedAt: "2026-08-25T00:00:00.000Z",
      reachable: true,
    });
    await probing;

    expect(controller.getSnapshot().probes).toEqual({});
  });

  it("does not let a delayed mutation response regress later authority", async () => {
    const adapter = port();
    const controller = createAgentConfigurationController({
      onConfigurationChanged: vi.fn(),
      pollConformance: async () => undefined,
      pollConformanceIntervalMilliseconds: 1,
      port: adapter,
    });

    await controller.load();
    const delayedMutation = createDeferred<AgentConfigurationSnapshot>();

    vi.mocked(adapter.createProvider).mockImplementationOnce(
      () => delayedMutation.promise,
    );
    const firstMutation = controller.createProvider(revision("1"), providerInput());

    vi.mocked(adapter.load).mockResolvedValueOnce(snapshot("2"));
    await controller.load();
    await controller.clearProviderAuthentication("provider-1");
    delayedMutation.resolve(snapshot("2"));
    await firstMutation;

    expect(controller.getSnapshot()).toMatchObject({
      configuration: { revision: revision("3") },
      loadStatus: "ready",
    });
  });

  it("stays working until every concurrent operation has settled", async () => {
    const adapter = port();
    const controller = createAgentConfigurationController({
      onConfigurationChanged: vi.fn(),
      pollConformance: async () => undefined,
      pollConformanceIntervalMilliseconds: 1,
      port: adapter,
    });

    await controller.load();
    const discovery = createDeferred<AgentOllamaDiscovery>();
    const probe = createDeferred<AgentProviderProbe>();

    vi.mocked(adapter.discoverOllama).mockImplementationOnce(
      () => discovery.promise,
    );
    vi.mocked(adapter.probeProvider).mockImplementationOnce(() => probe.promise);
    const failedDiscovery = expect(
      controller.discoverOllama("http://127.0.0.1:11434"),
    ).rejects.toThrow("Ollama is unreachable");
    const probing = controller.probeProvider("provider-1");

    discovery.reject(new Error("Ollama is unreachable"));
    await failedDiscovery;
    expect(controller.getSnapshot()).toMatchObject({
      errorMessage: "Ollama is unreachable",
      operationStatus: "working",
    });

    probe.resolve({
      modelContexts: [],
      models: [],
      probedAt: "2026-08-25T00:00:00.000Z",
      reachable: true,
    });
    await probing;
    expect(controller.getSnapshot()).toMatchObject({
      errorMessage: "Ollama is unreachable",
      operationStatus: "idle",
    });
  });

  it("terminates pending polling and rejects work after disposal", async () => {
    const adapter = port();
    const pollStarted = createDeferred<void>();
    const releasePoll = createDeferred<void>();
    const listener = vi.fn();
    const controller = createAgentConfigurationController({
      onConfigurationChanged: vi.fn(),
      pollConformance: async () => {
        pollStarted.resolve();
        await releasePoll.promise;
      },
      pollConformanceIntervalMilliseconds: 1,
      port: adapter,
    });

    await controller.load();
    controller.subscribe(listener);
    await controller.startCodexDeviceLogin("provider-1");
    await pollStarted.promise;
    const terminalSnapshot = controller.getSnapshot();

    listener.mockClear();
    controller.dispose();
    releasePoll.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(adapter.getCodexDeviceLogin).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toBe(terminalSnapshot);
    await expect(controller.cancelCodexDeviceLogin("provider-1"))
      .rejects.toThrow("disposed");
    await expect(controller.discoverOllama("http://127.0.0.1:11434"))
      .rejects.toThrow("disposed");
    expect(adapter.cancelCodexDeviceLogin).not.toHaveBeenCalled();
    expect(adapter.discoverOllama).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });
});
