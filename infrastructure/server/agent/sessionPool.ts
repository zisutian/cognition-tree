// SPDX-License-Identifier: GPL-3.0-or-later

import { AgentServiceError } from "./errors.ts";
import type { AgentPrivateIpcServer } from "./privateIpc.ts";
import type { AgentRuntimeProfile } from "./runtimeProfiles.ts";
import type { AgentSessionRecord } from "./sessionRecord.ts";
import type { AgentServicePolicy } from "./servicePolicy.ts";

type SessionPoolRuntime = {
  now(): Date;
};

export class AgentSessionPool {
  readonly #disposals = new Set<Promise<void>>();
  readonly #ipc: AgentPrivateIpcServer;
  readonly #openingProfiles = new Map<string, number>();
  readonly #runtime: SessionPoolRuntime;
  readonly #servicePolicy: AgentServicePolicy;
  readonly #sessions = new Map<string, AgentSessionRecord>();
  readonly #starts = new Set<Promise<unknown>>();
  readonly #sweeper: NodeJS.Timeout;
  #closed = false;
  #disposePromise: Promise<void> | null = null;

  constructor({
    ipc,
    runtime,
    servicePolicy,
  }: {
    ipc: AgentPrivateIpcServer;
    runtime: SessionPoolRuntime;
    servicePolicy: AgentServicePolicy;
  }) {
    this.#ipc = ipc;
    this.#runtime = runtime;
    this.#servicePolicy = servicePolicy;
    this.#sweeper = setInterval(() => {
      void this.#expireSessions();
    }, 60_000);
    this.#sweeper.unref();
  }

  list() {
    this.pruneExpired();
    return [...this.#sessions.values()];
  }

  pruneExpired() {
    this.#removeExpiredSessionsWithoutWaiting();
  }

  require(sessionId: string) {
    const record = this.#sessions.get(sessionId);

    if (!record) {
      throw new AgentServiceError("not_found", "Agent session does not exist");
    }
    if (this.#isExpired(record)) {
      this.#sessions.delete(sessionId);
      void this.disposeRecord(record);
      throw new AgentServiceError(
        "session_unavailable",
        "Agent session expired",
      );
    }
    return record;
  }

  remove(sessionId: string) {
    const record = this.require(sessionId);

    this.#sessions.delete(sessionId);
    return record;
  }

  publish(record: AgentSessionRecord) {
    if (this.#closed) throw new Error("Agent session pool is closed");
    const sessionId = record.controller.snapshot().id;

    if (this.#sessions.has(sessionId)) {
      throw new Error("Agent session is already resident");
    }
    this.#sessions.set(sessionId, record);
  }

  unpublish(record: AgentSessionRecord) {
    const sessionId = record.controller.snapshot().id;

    if (this.#sessions.get(sessionId) !== record) return false;
    this.#sessions.delete(sessionId);
    return true;
  }

  reserveProfile(profile: AgentRuntimeProfile) {
    if (this.#closed) throw new Error("Agent session pool is closed");
    this.#removeExpiredSessionsWithoutWaiting();
    const resident = [...this.#sessions.values()].filter(({ profile: value }) =>
      value.id === profile.id
    ).length;
    const opening = this.#openingProfiles.get(profile.id) ?? 0;

    if (resident + opening >= profile.maxResidentSessions) {
      throw new AgentServiceError(
        "session_capacity_reached",
        "Agent profile has reached maxResidentSessions",
      );
    }
    this.#openingProfiles.set(profile.id, opening + 1);
    let released = false;

    return {
      release: () => {
        if (released) return;
        released = true;
        const opening = this.#openingProfiles.get(profile.id);

        if (opening === undefined) {
          throw new Error("Agent Profile capacity reservation is missing");
        }
        if (opening > 1) {
          this.#openingProfiles.set(profile.id, opening - 1);
        } else {
          this.#openingProfiles.delete(profile.id);
        }
      },
    };
  }

  trackStart<Result>(execution: Promise<Result>) {
    this.#starts.add(execution);
    void execution.finally(() => this.#starts.delete(execution))
      .catch(() => undefined);
    return execution;
  }

  hasResidentSessions() {
    this.pruneExpired();
    return this.#disposals.size > 0 || this.#starts.size > 0 ||
      this.#sessions.size > 0;
  }

  closeEventStreams() {
    for (const record of this.#sessions.values()) record.events.close();
  }

  disposeRecord(record: AgentSessionRecord) {
    if (record.disposePromise) return record.disposePromise;
    const execution = (async () => {
      record.abortController?.abort(new Error("Agent session ended"));
      if (record.capability) {
        this.#ipc.revoke(record.capability);
        record.capability = null;
      }
      record.events.close();
      try {
        await this.stopRuntimeSession(record, false);
      } finally {
        record.configurationUse.release();
      }
    })();

    record.disposePromise = execution;
    this.#disposals.add(execution);
    void execution.finally(() => this.#disposals.delete(execution))
      .catch(() => undefined);
    return execution;
  }

  stopRuntimeSession(record: AgentSessionRecord, cancel: boolean) {
    record.runtimeStopPromise ??= (async () => {
      if (cancel) await record.runtimeSession.cancel().catch(() => undefined);
      await record.runtimeSession.dispose();
    })();
    return record.runtimeStopPromise;
  }

  dispose() {
    if (this.#disposePromise) return this.#disposePromise;
    this.#closed = true;
    clearInterval(this.#sweeper);
    const records = [...this.#sessions.values()];

    this.#sessions.clear();
    const disposals = records.map((record) => this.disposeRecord(record));

    this.#disposePromise = this.#finishDisposal(
      [...this.#starts],
      disposals,
    );
    return this.#disposePromise;
  }

  async #finishDisposal(
    starts: readonly Promise<unknown>[],
    disposals: readonly Promise<void>[],
  ) {
    await Promise.allSettled([...starts, ...disposals]);
    while (this.#disposals.size > 0) {
      await Promise.allSettled(this.#disposals);
    }
  }

  #isExpired(record: AgentSessionRecord) {
    const snapshot = record.controller.snapshot();
    const now = this.#runtime.now().getTime();

    return now - Date.parse(snapshot.lastActiveAt) >=
        this.#servicePolicy.idleTtlMilliseconds ||
      now - Date.parse(snapshot.createdAt) >=
        this.#servicePolicy.absoluteTtlMilliseconds;
  }

  #removeExpiredSessionsWithoutWaiting() {
    for (const [sessionId, record] of this.#sessions) {
      if (!this.#isExpired(record)) continue;
      this.#sessions.delete(sessionId);
      void this.disposeRecord(record);
    }
  }

  async #expireSessions() {
    const expired: AgentSessionRecord[] = [];

    for (const [sessionId, record] of this.#sessions) {
      if (!this.#isExpired(record)) continue;
      this.#sessions.delete(sessionId);
      expired.push(record);
    }
    await Promise.allSettled(expired.map((record) => this.disposeRecord(record)));
  }
}
