// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentDeviceLoginConfigurationPort, AgentDeviceLoginProcess, AgentDeviceLoginProcessPort, AgentDeviceLoginCompletion } from './deviceLoginPorts.ts';
import type { ApplicationScheduler, CancelScheduledTask } from '../runtime/index.ts';
import type {
  AgentCodexDeviceLoginStatus,
} from "../agent/index.ts";
import type { CommandRuntime } from "../commands/index.ts";
import { readCommandRuntimeNow } from "../commands/index.ts";
import type {
  AgentConfigurationProviderChange,
} from "./configurationAccess.ts";
import { AgentProviderOperationConflictError } from "./providerOperationErrors.ts";
import { SecureStateCommitOutcomeUnknownError } from "../persistence/index.ts";

const codexDeviceLoginResultLimit = 100;

type CodexDeviceLoginRecord = {
  baseRevision: string;
  process: AgentDeviceLoginProcess;
  codexLoginId: string;
  configurationChange: AgentConfigurationProviderChange;
  credentialVersion: number;
  finishing: boolean;
  status: AgentCodexDeviceLoginStatus;
  cancelTimeout: CancelScheduledTask;
};

function rejectedReasons(results: readonly PromiseSettledResult<unknown>[]) {
  return results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : []
  );
}

export class CodexDeviceLoginOperations {
  readonly #backgroundFailures: unknown[] = [];
  readonly #cancellations = new Set<Promise<AgentCodexDeviceLoginStatus | null>>();
  readonly #processes = new Set<AgentDeviceLoginProcess>();
  readonly #processPort: AgentDeviceLoginProcessPort;
  readonly #scheduler: ApplicationScheduler;
  readonly #configurationStore: AgentDeviceLoginConfigurationPort;
  readonly #finishes = new Map<string, Promise<void>>();
  readonly #logins = new Map<string, CodexDeviceLoginRecord>();
  readonly #reservations = new Set<string>();
  readonly #runtime: CommandRuntime;
  readonly #starts = new Set<Promise<AgentCodexDeviceLoginStatus>>();
  readonly #ttlMilliseconds: number;
  #disposed = false;
  #disposePromise: Promise<void> | null = null;

  constructor({configurationStore, processes, scheduler, runtime, ttlMilliseconds}: {
    configurationStore: AgentDeviceLoginConfigurationPort;
    processes: AgentDeviceLoginProcessPort;
    scheduler: ApplicationScheduler;
    runtime: CommandRuntime;
    ttlMilliseconds: number;
  }) {
    this.#configurationStore = configurationStore;
    this.#processPort = processes;
    this.#scheduler = scheduler;
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
    return this.#trackCancellation(loginId, "cancelled");
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
      const requestedCancellations = [...this.#logins.entries()]
        .filter(([, { status }]) => status.status === "pending")
        .map(([id]) => this.#trackCancellation(id, "cancelled"));
      const cancellationResults = await Promise.allSettled(
        new Set([...this.#cancellations, ...requestedCancellations]),
      );
      const finishResults = await Promise.allSettled(this.#finishes.values());
      const childResults = await Promise.allSettled(
        [...this.#processes].map((child) => this.#stopProcess(child)),
      );
      const failures = [
        ...rejectedReasons(cancellationResults),
        ...rejectedReasons(finishResults),
        ...rejectedReasons(childResults),
        ...this.#backgroundFailures.splice(0),
      ];

      if (failures.length > 0) throw failures[0];
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
    let process: AgentDeviceLoginProcess | null = null;
    let configurationChange: AgentConfigurationProviderChange | null = null;
    let configurationChangeTransferred = false;
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
      process = await this.#processPort.create(prepared.home);
      const createdProcess = process;
      this.#processes.add(createdProcess);
      createdProcess.onExit(() => this.#processes.delete(createdProcess));
      await createdProcess.initialize();
      this.#assertOpen();
      let activeRecord: CodexDeviceLoginRecord | null = null;
      const completedNotifications: AgentDeviceLoginCompletion[] = [];
      createdProcess.subscribe((params) => {
        if (!activeRecord) {
          completedNotifications.push(params);
          return;
        }
        if (params.loginId !== null && params.loginId !== activeRecord.codexLoginId) return;
        this.#scheduleFinish(activeRecord.status.id, params.success, params.error);
      });
      const loginRecord = await createdProcess.start();
      const verificationUrl = loginRecord.verificationUrl;
      this.#assertOpen();
      const startedAt = readCommandRuntimeNow(this.#runtime).timestamp;
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
      const cancelTimeout = this.#scheduler.schedule(() => {
        void this.#trackCancellation(id, "expired").catch((error: unknown) => {
          this.#backgroundFailures.push(error);
        });
      }, this.#ttlMilliseconds);

      const record: CodexDeviceLoginRecord = {
        baseRevision,
        process: createdProcess,
        codexLoginId: loginRecord.loginId,
        configurationChange,
        credentialVersion: prepared.credentialVersion,
        finishing: false,
        status,
        cancelTimeout,
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

      if (createdProcess.hasExited()) handleUnexpectedExit();
      else createdProcess.onExit(handleUnexpectedExit);
      return status;
    } catch (error) {
      if (process) await this.#stopProcess(process);
      if (staging) {
        await this.#configurationStore.removeCodexDeviceLoginStaging(
          providerId,
          staging.credentialVersion,
          staging.loginId,
        ).catch(() => undefined);
      }
      if (process) await process.cleanup();
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
    record.cancelTimeout();
    await this.#stopProcess(record.process);
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
        completedAt: readCommandRuntimeNow(this.#runtime).timestamp,
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
        completedAt: readCommandRuntimeNow(this.#runtime).timestamp,
        errorMessage: error instanceof SecureStateCommitOutcomeUnknownError
          ? "Codex device login result is unknown; restart before retrying"
          : "Codex device login failed",
        status: "failed",
      };
    } finally {
      record.configurationChange.release();
      try {
        await record.process.cleanup();
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
    void execution.catch((error: unknown) => {
      this.#backgroundFailures.push(error);
    });
  }

  #trackCancellation(
    loginId: string,
    terminalStatus: "cancelled" | "expired",
  ) {
    const execution = this.#cancel(loginId, terminalStatus);

    this.#cancellations.add(execution);
    void execution.finally(() => this.#cancellations.delete(execution))
      .catch(() => undefined);
    return execution;
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
    record.cancelTimeout();
    await record.process.cancel(record.codexLoginId).catch(() => undefined);
    try {
      record.status = {
        ...record.status,
        completedAt: readCommandRuntimeNow(this.#runtime).timestamp,
        status: terminalStatus,
      };
      await this.#stopProcess(record.process);
      await this.#configurationStore.removeCodexDeviceLoginStaging(
        record.status.providerId,
        record.credentialVersion,
        record.status.id,
      ).catch(() => undefined);
      await record.process.cleanup();
      return record.status;
    } finally {
      record.configurationChange.release();
      record.finishing = false;
    }
  }

  async #stopProcess(process: AgentDeviceLoginProcess) {
    await process.stop();
    this.#processes.delete(process);
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
