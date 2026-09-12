import { createServerDataRootWriteScope } from "../../../../infrastructure/server/runtime/index.ts";
import { createServerDeviceLoginOperations } from "../../../../infrastructure/server/runtime/deviceLoginRuntime.ts";
import { createServerProviderOperations } from "../../../../infrastructure/server/runtime/providerRuntime.ts";

import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AgentConfigurationStore } from "../../../../infrastructure/server/agent/configurationStore.ts";

import { createDeviceLoginProcessPort } from "../../../../infrastructure/server/agent/deviceLoginProcess.ts";

import { replaceFileDurably } from "../../../../infrastructure/server/persistence/fileSystemPersistence.ts";
import { runtime } from "./fixtures/agentRuntime.ts";
import { createFakeCodexProject } from "./fixtures/codexDeviceProject.ts";

describe("Codex device login lifecycle", () => {
  it("observes process exit before releasing a forcibly stopped login", async () => {
    const projectRoot = await createFakeCodexProject(false, true);
    const credentialHome = await mkdtemp(
      path.join(os.tmpdir(), "ctn-device-reaping-"),
    );
    const process = await createDeviceLoginProcessPort({ projectRoot }).create(
      credentialHome,
    );

    try {
      await process.initialize();
      await process.start();
      let exited = false;
      process.onExit(() => {
        exited = true;
      });
      await process.stop();
      expect(exited).toBe(true);
      expect(process.hasExited()).toBe(true);
      await process.stop();
    } finally {
      await process.stop();
      await process.cleanup();
      await rm(projectRoot, { recursive: true, force: true });
      await rm(credentialHome, { recursive: true, force: true });
    }
  });

  it("completes and cancels isolated Codex device-code logins", async () => {
    const completedProject = await createFakeCodexProject(true);
    const cancelledProject = await createFakeCodexProject(false);
    const expiredProject = await createFakeCodexProject(false);
    const completedDirectory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-provider-device-completed-"),
    );
    const cancelledDirectory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-provider-device-cancelled-"),
    );
    const expiredDirectory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-provider-device-expired-"),
    );
    const completedStore = new AgentConfigurationStore(completedDirectory, {
      createId: () => "codex-completed",
    });
    const cancelledStore = new AgentConfigurationStore(cancelledDirectory, {
      createId: () => "codex-cancelled",
    });
    const expiredStore = new AgentConfigurationStore(expiredDirectory, {
      createId: () => "codex-expired",
    });
    const completedOperations = createServerProviderOperations({
      writes: createServerDataRootWriteScope(),
      configurationStore: completedStore,
      projectRoot: completedProject,
      runtime,
    });
    const cancelledOperations = createServerProviderOperations({
      writes: createServerDataRootWriteScope(),
      configurationStore: cancelledStore,
      projectRoot: cancelledProject,
      runtime,
    });
    const expiredOperations = createServerProviderOperations({
      writes: createServerDataRootWriteScope(),
      codexDeviceLoginTtlMilliseconds: 10,
      configurationStore: expiredStore,
      projectRoot: expiredProject,
      runtime,
    });
    process.env.OPENAI_API_KEY = "must-not-enter-device-login";
    process.env.CTN_TEST_PERSONAL_SECRET = "must-not-enter-device-login";

    try {
      const completedInitial = await completedStore.readSnapshot();
      const completedProvider = await completedStore.createProvider(
        completedInitial.revision,
        {
          authenticationType: "chatgpt-device-code",
          baseUrl: null,
          kind: "codex",
          label: "ChatGPT Codex",
          privateNetworkAccessConfirmed: false,
        },
      );
      const started = await completedOperations.startCodexDeviceLogin(
        completedProvider.configuration.revision,
        completedProvider.provider.id,
      );

      expect(started).toMatchObject({
        status: "pending",
        userCode: "ABCD-EFGH",
        verificationUrl: "https://auth.openai.com/device",
      });
      await vi.waitFor(() => {
        expect(
          completedOperations.getCodexDeviceLogin(started.id)?.status,
        ).toBe("succeeded");
      });
      const resolved = await completedStore.resolveProvider(
        completedProvider.provider.id,
      );

      expect(resolved).toMatchObject({
        apiKey: null,
        provider: {
          authenticationStatus: "configured",
          authenticationType: "chatgpt-device-code",
        },
      });
      const auth = JSON.parse(
        await readFile(path.join(resolved!.codexHome!, "auth.json"), "utf8"),
      );

      expect(auth).toMatchObject({
        inheritedApiKey: null,
        inheritedPersonalSecret: null,
      });

      const cancelledInitial = await cancelledStore.readSnapshot();
      const cancelledProvider = await cancelledStore.createProvider(
        cancelledInitial.revision,
        {
          authenticationType: "chatgpt-device-code",
          baseUrl: null,
          kind: "codex",
          label: "Cancelled Codex",
          privateNetworkAccessConfirmed: false,
        },
      );
      const cancelling = await cancelledOperations.startCodexDeviceLogin(
        cancelledProvider.configuration.revision,
        cancelledProvider.provider.id,
      );

      expect(
        cancelledOperations.hasPendingCodexLogin(cancelledProvider.provider.id),
      ).toBe(true);
      await expect(
        cancelledOperations.startCodexDeviceLogin(
          cancelledProvider.configuration.revision,
          cancelledProvider.provider.id,
        ),
      ).rejects.toThrow("already pending");
      await expect(
        cancelledOperations.cancelCodexDeviceLogin(cancelling.id),
      ).resolves.toMatchObject({ status: "cancelled" });
      await expect(
        cancelledStore.resolveProvider(cancelledProvider.provider.id),
      ).resolves.toMatchObject({
        codexHome: null,
        provider: { authenticationStatus: "missing" },
      });

      const expiredInitial = await expiredStore.readSnapshot();
      const expiredProvider = await expiredStore.createProvider(
        expiredInitial.revision,
        {
          authenticationType: "chatgpt-device-code",
          baseUrl: null,
          kind: "codex",
          label: "Expired Codex",
          privateNetworkAccessConfirmed: false,
        },
      );
      const expiring = await expiredOperations.startCodexDeviceLogin(
        expiredProvider.configuration.revision,
        expiredProvider.provider.id,
      );

      await vi.waitFor(() => {
        expect(expiredOperations.getCodexDeviceLogin(expiring.id)?.status).toBe(
          "expired",
        );
      });
      await expect(
        expiredStore.resolveProvider(expiredProvider.provider.id),
      ).resolves.toMatchObject({
        codexHome: null,
        provider: { authenticationStatus: "missing" },
      });
    } finally {
      delete process.env.OPENAI_API_KEY;
      delete process.env.CTN_TEST_PERSONAL_SECRET;
      await Promise.all([
        completedOperations.dispose(),
        cancelledOperations.dispose(),
        expiredOperations.dispose(),
      ]);
      await Promise.all([
        rm(completedProject, { force: true, recursive: true }),
        rm(cancelledProject, { force: true, recursive: true }),
        rm(expiredProject, { force: true, recursive: true }),
        rm(completedDirectory, { force: true, recursive: true }),
        rm(cancelledDirectory, { force: true, recursive: true }),
        rm(expiredDirectory, { force: true, recursive: true }),
      ]);
    }
  });

  it("retains a failed TTL cleanup until device-login disposal", async () => {
    const project = await createFakeCodexProject(false);
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-provider-device-cleanup-"),
    );
    const store = new AgentConfigurationStore(directory, {
      createId: () => "codex-cleanup-failure",
    });
    const cleanupDirectory = vi.fn(async () => {
      throw new Error("injected login cleanup failure");
    });
    const operations = createServerDeviceLoginOperations({
      writes: createServerDataRootWriteScope(),
      cleanupDirectory,
      configurationStore: store,
      projectRoot: project,
      runtime,
      ttlMilliseconds: 10,
    });

    try {
      const initial = await store.readSnapshot();
      const created = await store.createProvider(initial.revision, {
        authenticationType: "chatgpt-device-code",
        baseUrl: null,
        kind: "codex",
        label: "Cleanup failure Codex",
        privateNetworkAccessConfirmed: false,
      });
      const started = await operations.start(
        created.configuration.revision,
        created.provider.id,
      );

      await vi.waitFor(() => {
        expect(operations.get(started.id)?.status).toBe("expired");
      });
      await expect(operations.dispose()).rejects.toThrow(
        "injected login cleanup failure",
      );
      expect(cleanupDirectory).toHaveBeenCalledOnce();
      const current = await store.readSnapshot();
      const lease = await store.reserveProviderChange(
        current.revision,
        created.provider.id,
      );

      lease.release();
    } finally {
      await operations.dispose().catch(() => undefined);
      await Promise.all([
        rm(project, { force: true, recursive: true }),
        rm(directory, { force: true, recursive: true }),
      ]);
    }
  });

  it("drains background credential activation before admitting migration", async () => {
    const project = await createFakeCodexProject(true);
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-provider-device-drain-"),
    );
    const writes = createServerDataRootWriteScope();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let activated!: () => void;
    const activating = new Promise<void>((resolve) => {
      activated = resolve;
    });
    let pause = false;
    const store = new AgentConfigurationStore(directory, {
      createId: () => "codex-drain",
      replaceConfigurationFile: async (file, source, options) => {
        if (pause) {
          pause = false;
          activated();
          await blocked;
        }
        await replaceFileDurably(file, source, options);
      },
    });
    const operations = createServerProviderOperations({
      configurationStore: store,
      projectRoot: project,
      runtime,
      writes,
    });
    let maintenance: Awaited<ReturnType<typeof writes.begin>> | null = null;
    try {
      const initial = await store.readSnapshot();
      const provider = await store.createProvider(initial.revision, {
        authenticationType: "chatgpt-device-code",
        baseUrl: null,
        kind: "codex",
        label: "Drained Codex",
        privateNetworkAccessConfirmed: false,
      });
      pause = true;
      const login = await operations.startCodexDeviceLogin(
        provider.configuration.revision,
        provider.provider.id,
      );
      await activating;
      const acquired = vi.fn();
      const pending = writes.begin().then((lease) => {
        acquired();
        return lease;
      });
      await Promise.resolve();
      expect(acquired).not.toHaveBeenCalled();
      release();
      maintenance = await pending;
      await vi.waitFor(() =>
        expect(operations.getCodexDeviceLogin(login.id)?.status).toBe(
          "succeeded",
        ),
      );
      const reloaded = new AgentConfigurationStore(directory);
      await expect(
        reloaded.resolveProvider(provider.provider.id),
      ).resolves.toMatchObject({
        codexHome: expect.any(String),
        provider: { authenticationStatus: "configured" },
      });
    } finally {
      release();
      maintenance?.finish();
      await operations.dispose();
      await rm(project, { force: true, recursive: true });
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("preserves possibly authoritative Codex authentication after an unknown commit", async () => {
    const project = await createFakeCodexProject(true);
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-provider-device-unknown-"),
    );
    let failAfterReplacement = false;
    const store = new AgentConfigurationStore(directory, {
      createId: () => "codex-unknown",
      replaceConfigurationFile: async (file, source, options) => {
        await replaceFileDurably(file, source, options);
        if (failAfterReplacement) {
          failAfterReplacement = false;
          throw new Error("directory sync failed after replacement");
        }
      },
    });
    const operations = createServerProviderOperations({
      writes: createServerDataRootWriteScope(),
      configurationStore: store,
      projectRoot: project,
      runtime,
    });

    try {
      const initial = await store.readSnapshot();
      const provider = await store.createProvider(initial.revision, {
        authenticationType: "chatgpt-device-code",
        baseUrl: null,
        kind: "codex",
        label: "Unknown Codex",
        privateNetworkAccessConfirmed: false,
      });

      failAfterReplacement = true;
      const started = await operations.startCodexDeviceLogin(
        provider.configuration.revision,
        provider.provider.id,
      );

      await vi.waitFor(() => {
        expect(operations.getCodexDeviceLogin(started.id)).toMatchObject({
          errorMessage: expect.stringContaining("unknown"),
          status: "failed",
        });
      });
      const reloaded = new AgentConfigurationStore(directory);

      await expect(
        reloaded.resolveProvider(provider.provider.id),
      ).resolves.toMatchObject({
        codexHome: expect.any(String),
        provider: { authenticationStatus: "configured" },
      });
    } finally {
      await operations.dispose();
      await rm(project, { force: true, recursive: true });
      await rm(directory, { force: true, recursive: true });
    }
  });
});
