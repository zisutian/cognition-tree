// SPDX-License-Identifier: GPL-3.0-or-later

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  AgentCodexDeviceLoginStatus,
} from "../../../application/agent/agentConfiguration.ts";
import type { ApiRuntime } from "../api/http/runtime.ts";
import { readApiRuntimeNow } from "../api/http/runtime.ts";
import type {
  AgentConfigurationProviderChange,
} from "./configurationAccess.ts";
import type { AgentConfigurationStore } from "./configurationStore.ts";
import {
  CodexAppServerClient,
  resolveCodexEntrypoint,
  withTimeout,
} from "./codexAppServerClient.ts";
import { AgentProviderOperationConflictError } from "./providerOperationErrors.ts";
import { SecureStateCommitOutcomeUnknownError } from "../state/secureJsonPartition.ts";

const codexAppServerRequestTimeoutMilliseconds = 5_000;
const codexDeviceLoginResultLimit = 100;

type CodexDeviceLoginRecord = {
  baseRevision: string;
  child: ChildProcessWithoutNullStreams;
  client: CodexAppServerClient;
  codexLoginId: string;
  configurationChange: AgentConfigurationProviderChange;
  credentialVersion: number;
  finishing: boolean;
  processDirectory: string;
  status: AgentCodexDeviceLoginStatus;
  timeout: NodeJS.Timeout;
};

function verifiedDeviceLoginUrl(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("Codex returned an invalid device login URL");
  }
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Codex returned an invalid device login URL");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Codex returned an invalid device login URL");
  }
  return url.toString();
}

export class CodexDeviceLoginOperations {
  readonly #children = new Set<ChildProcessWithoutNullStreams>();
  readonly #configurationStore: AgentConfigurationStore;
  readonly #finishes = new Map<string, Promise<void>>();
  readonly #logins = new Map<string, CodexDeviceLoginRecord>();
  readonly #projectRoot: string;
  readonly #reservations = new Set<string>();
  readonly #runtime: ApiRuntime;
  readonly #starts = new Set<Promise<AgentCodexDeviceLoginStatus>>();
  readonly #ttlMilliseconds: number;
  #disposed = false;
  #disposePromise: Promise<void> | null = null;

  constructor({
    configurationStore,
    projectRoot,
    runtime,
    ttlMilliseconds,
  }: {
    configurationStore: AgentConfigurationStore;
    projectRoot: string;
    runtime: ApiRuntime;
    ttlMilliseconds: number;
  }) {
    this.#configurationStore = configurationStore;
    this.#projectRoot = projectRoot;
    this.#runtime = runtime;
    this.#ttlMilliseconds = ttlMilliseconds;
  }

  start(baseRevision: string, providerId: string) {
    this.#assertOpen();
    const execution = this.#start(baseRevision, providerId);

    this.#starts.add(execution);
    void execution.finally(() => this.#starts.delete(execution))
      .catch(() => undefined);
    return execution;
  }

  get(loginId: string) {
    return this.#logins.get(loginId)?.status ?? null;
  }

  cancel(loginId: string) {
    return this.#cancel(loginId, "cancelled");
  }

  hasPending(providerId?: string) {
    return [...this.#reservations].some((candidate) =>
      providerId === undefined || candidate === providerId
    ) || [...this.#logins.values()].some(({ finishing, status }) =>
      (status.status === "pending" || finishing) &&
      (providerId === undefined || status.providerId === providerId)
    );
  }

  dispose() {
    this.#disposed = true;
    this.#disposePromise ??= (async () => {
      await Promise.allSettled(this.#starts);
      await Promise.all([...this.#logins.entries()]
        .filter(([, { status }]) => status.status === "pending")
        .map(([id]) => this.#cancel(id, "cancelled")));
      await Promise.all([...this.#children]
        .map((child) => this.#stopProcess(child)));
      await Promise.allSettled(this.#finishes.values());
    })();
    return this.#disposePromise;
  }

  async #start(
    baseRevision: string,
    providerId: string,
  ): Promise<AgentCodexDeviceLoginStatus> {
    const hasPendingLogin = [...this.#logins.values()].some(
      ({ status }) =>
        status.providerId === providerId && status.status === "pending",
    );

    if (this.#reservations.has(providerId) || hasPendingLogin) {
      throw new AgentProviderOperationConflictError(
        "A Codex device login is already pending for this provider",
      );
    }
    this.#reservations.add(providerId);
    let child: ChildProcessWithoutNullStreams | null = null;
    let configurationChange: AgentConfigurationProviderChange | null = null;
    let configurationChangeTransferred = false;
    let processDirectory: string | null = null;
    let staging: Readonly<{
      credentialVersion: number;
      home: string;
      loginId: string;
    }> | null = null;

    try {
      this.#prune();
      if (this.#logins.size >= codexDeviceLoginResultLimit) {
        throw new AgentProviderOperationConflictError(
          "Codex device login capacity has been reached",
        );
      }
      const id = this.#runtime.createId();

      configurationChange = await this.#configurationStore.reserveProviderChange(
        baseRevision,
        providerId,
      );
      const prepared = await this.#configurationStore.prepareCodexDeviceLogin(
        baseRevision,
        providerId,
        id,
        configurationChange,
      );

      staging = { ...prepared, loginId: id };
      processDirectory = await mkdtemp(
        path.join(os.tmpdir(), "ctn-codex-login-"),
      );
      const entrypoint = await resolveCodexEntrypoint(this.#projectRoot);

      child = spawn(process.execPath, [entrypoint, "app-server"], {
        cwd: processDirectory,
        env: {
          CODEX_HOME: prepared.home,
          HOME: prepared.home,
          LANG: "C.UTF-8",
          PATH: path.dirname(process.execPath),
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.#children.add(child);
      child.once("exit", () => this.#children.delete(child!));
      const client = new CodexAppServerClient(child);

      await withTimeout(
        client.request("initialize", {
          capabilities: { experimentalApi: true },
          clientInfo: {
            name: "cognition_tree",
            title: "Cognition Tree",
            version: "0.1.0",
          },
        }),
        codexAppServerRequestTimeoutMilliseconds,
        "Codex device login initialize timed out",
      );
      this.#assertOpen();
      client.notify("initialized", {});
      let activeRecord: CodexDeviceLoginRecord | null = null;
      const completedNotifications: Array<Record<string, unknown>> = [];

      client.subscribe((message) => {
        if (message.method !== "account/login/completed") return;
        const params = message.params && typeof message.params === "object" &&
            !Array.isArray(message.params)
          ? message.params as Record<string, unknown>
          : null;

        if (!params) return;
        if (!activeRecord) {
          completedNotifications.push(params);
          return;
        }
        if (
          params.loginId !== null &&
          params.loginId !== activeRecord.codexLoginId
        ) {
          return;
        }
        this.#scheduleFinish(
          activeRecord.status.id,
          params.success === true,
          typeof params.error === "string" ? params.error : null,
        );
      });
      const login = await withTimeout(
        client.request("account/login/start", { type: "chatgptDeviceCode" }),
        codexAppServerRequestTimeoutMilliseconds,
        "Codex device login start timed out",
      );
      const loginRecord = login && typeof login === "object" &&
          !Array.isArray(login)
        ? login as Record<string, unknown>
        : null;

      if (
        loginRecord?.type !== "chatgptDeviceCode" ||
        typeof loginRecord.loginId !== "string" ||
        loginRecord.loginId.length === 0 ||
        typeof loginRecord.userCode !== "string" ||
        loginRecord.userCode.length === 0
      ) {
        throw new Error("Codex returned an invalid device login response");
      }
      const verificationUrl = verifiedDeviceLoginUrl(
        loginRecord.verificationUrl,
      );

      this.#assertOpen();
      const startedAt = readApiRuntimeNow(this.#runtime).timestamp;
      const status: AgentCodexDeviceLoginStatus = {
        completedAt: null,
        errorMessage: null,
        expiresAt: new Date(
          Date.parse(startedAt) + this.#ttlMilliseconds,
        ).toISOString(),
        id,
        providerId,
        startedAt,
        status: "pending",
        userCode: loginRecord.userCode,
        verificationUrl,
      };
      const timeout = setTimeout(() => {
        void this.#cancel(id, "expired");
      }, this.#ttlMilliseconds);

      timeout.unref();
      const record: CodexDeviceLoginRecord = {
        baseRevision,
        child,
        client,
        codexLoginId: loginRecord.loginId,
        configurationChange,
        credentialVersion: prepared.credentialVersion,
        finishing: false,
        processDirectory,
        status,
        timeout,
      };

      configurationChangeTransferred = true;
      this.#logins.set(id, record);
      activeRecord = record;
      for (const params of completedNotifications) {
        if (
          params.loginId !== null &&
          params.loginId !== record.codexLoginId
        ) {
          continue;
        }
        this.#scheduleFinish(
          id,
          params.success === true,
          typeof params.error === "string" ? params.error : null,
        );
      }
      const handleUnexpectedExit = () => {
        const current = this.#logins.get(id);

        if (current?.status.status === "pending" && !current.finishing) {
          this.#scheduleFinish(
            id,
            false,
            "Codex device login process ended",
          );
        }
      };

      if (child.exitCode !== null) handleUnexpectedExit();
      else child.once("exit", handleUnexpectedExit);
      return status;
    } catch (error) {
      if (child) await this.#stopProcess(child);
      if (staging) {
        await this.#configurationStore.removeCodexDeviceLoginStaging(
          providerId,
          staging.credentialVersion,
          staging.loginId,
        ).catch(() => undefined);
      }
      if (processDirectory) await this.#cleanupDirectory(processDirectory);
      throw error;
    } finally {
      this.#reservations.delete(providerId);
      if (!configurationChangeTransferred) configurationChange?.release();
    }
  }

  #assertOpen() {
    if (this.#disposed) {
      throw new AgentProviderOperationConflictError(
        "Agent provider operations are closing",
      );
    }
  }

  async #finish(
    loginId: string,
    succeeded: boolean,
    _providerError: string | null,
  ) {
    const record = this.#logins.get(loginId);

    if (!record || record.status.status !== "pending" || record.finishing) return;
    record.finishing = true;
    clearTimeout(record.timeout);
    await this.#stopProcess(record.child);
    try {
      if (!succeeded) throw new Error("Codex device login failed");
      await this.#configurationStore.completeCodexDeviceLogin(
        record.baseRevision,
        record.status.providerId,
        record.credentialVersion,
        record.status.id,
        record.configurationChange,
      );
      record.status = {
        ...record.status,
        completedAt: readApiRuntimeNow(this.#runtime).timestamp,
        status: "succeeded",
      };
    } catch (error) {
      if (!(error instanceof SecureStateCommitOutcomeUnknownError)) {
        await this.#configurationStore.removeCodexDeviceLoginStaging(
          record.status.providerId,
          record.credentialVersion,
          record.status.id,
        ).catch(() => undefined);
      }
      record.status = {
        ...record.status,
        completedAt: readApiRuntimeNow(this.#runtime).timestamp,
        errorMessage: error instanceof SecureStateCommitOutcomeUnknownError
          ? "Codex device login result is unknown; restart before retrying"
          : "Codex device login failed",
        status: "failed",
      };
    } finally {
      record.configurationChange.release();
      try {
        await this.#cleanupDirectory(record.processDirectory);
      } finally {
        record.finishing = false;
      }
    }
  }

  #scheduleFinish(
    loginId: string,
    succeeded: boolean,
    providerError: string | null,
  ) {
    if (this.#finishes.has(loginId)) return;
    const execution = this.#finish(loginId, succeeded, providerError)
      .finally(() => this.#finishes.delete(loginId));

    this.#finishes.set(loginId, execution);
    void execution.catch(() => undefined);
  }

  async #cancel(
    loginId: string,
    terminalStatus: "cancelled" | "expired",
  ) {
    const record = this.#logins.get(loginId);

    if (!record) return null;
    if (record.status.status !== "pending") return record.status;
    if (record.finishing) return record.status;
    record.finishing = true;
    clearTimeout(record.timeout);
    await withTimeout(
      record.client.request("account/login/cancel", {
        loginId: record.codexLoginId,
      }),
      codexAppServerRequestTimeoutMilliseconds,
      "Codex device login cancellation timed out",
    ).catch(() => undefined);
    try {
      record.status = {
        ...record.status,
        completedAt: readApiRuntimeNow(this.#runtime).timestamp,
        status: terminalStatus,
      };
      await this.#stopProcess(record.child);
      await this.#configurationStore.removeCodexDeviceLoginStaging(
        record.status.providerId,
        record.credentialVersion,
        record.status.id,
      ).catch(() => undefined);
      await this.#cleanupDirectory(record.processDirectory);
      return record.status;
    } finally {
      record.configurationChange.release();
      record.finishing = false;
    }
  }

  async #stopProcess(child: ChildProcessWithoutNullStreams) {
    if (child.exitCode !== null) {
      this.#children.delete(child);
      return;
    }
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 2_000);

      timeout.unref();
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    this.#children.delete(child);
  }

  async #cleanupDirectory(directory: string) {
    const resolved = path.resolve(directory);
    const prefix = `${path.resolve(os.tmpdir())}${path.sep}ctn-codex-login-`;

    if (!resolved.startsWith(prefix)) {
      throw new Error("Refusing to clean an unexpected Codex login directory");
    }
    await rm(resolved, { force: true, recursive: true });
  }

  #prune() {
    if (this.#logins.size < codexDeviceLoginResultLimit) return;
    for (const [id, { finishing, status }] of this.#logins) {
      if (status.status === "pending" || finishing) continue;
      this.#logins.delete(id);
      if (this.#logins.size < codexDeviceLoginResultLimit) return;
    }
  }
}
