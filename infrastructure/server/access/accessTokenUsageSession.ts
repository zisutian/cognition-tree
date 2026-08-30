// SPDX-License-Identifier: GPL-3.0-or-later

const persistenceIntervalMilliseconds = 60_000;

export type AccessTokenUsageObservation = Readonly<{
  observedAt: string;
  requiresPersistence: boolean;
  tokenId: string;
}>;

export type AccessTokenUsageResult<Result> = Readonly<{
  observation: AccessTokenUsageObservation | null;
  result: Result;
}>;

function timestampMilliseconds(value: string, label: string) {
  const milliseconds = Date.parse(value);

  if (!Number.isFinite(milliseconds)) {
    throw new Error(`${label} is not a valid timestamp.`);
  }
  return milliseconds;
}

/**
 * Owns volatile access observations and call ordering for one token store.
 * Durable last-used timestamps remain owned by the store's state partition.
 * The queue commits a resolved partition operation's observation before a
 * subsequently requested list or revocation can observe the session.
 */
export class AccessTokenUsageSession {
  readonly #latestObservations = new Map<string, string>();
  #operationQueue: Promise<void> = Promise.resolve();

  run<Result>(operation: () => Promise<Result>): Promise<Result> {
    const pending = this.#operationQueue.then(operation);

    this.#operationQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  runObservedAccess<Result>(
    operation: () => Promise<AccessTokenUsageResult<Result>>,
  ): Promise<Result> {
    return this.run(async () => {
      const outcome = await operation();

      if (outcome.observation) {
        this.#latestObservations.set(
          outcome.observation.tokenId,
          outcome.observation.observedAt,
        );
      }
      return outcome.result;
    });
  }

  runRevocation(
    tokenId: string,
    operation: () => Promise<boolean>,
  ): Promise<boolean> {
    return this.run(async () => {
      const revoked = await operation();

      if (revoked) this.#latestObservations.delete(tokenId);
      return revoked;
    });
  }

  prepareObservation({
    observedAt,
    persistedAt,
    tokenId,
  }: {
    observedAt: string;
    persistedAt: string | null;
    tokenId: string;
  }): AccessTokenUsageObservation {
    const observedMilliseconds = timestampMilliseconds(
      observedAt,
      "Observed token usage",
    );
    const persistedMilliseconds = persistedAt === null
      ? -Infinity
      : timestampMilliseconds(persistedAt, "Persisted token usage");

    return {
      observedAt,
      requiresPersistence: observedMilliseconds - persistedMilliseconds >=
        persistenceIntervalMilliseconds,
      tokenId,
    };
  }

  resolveLastUsedAt(tokenId: string, persistedAt: string | null) {
    return this.#latestObservations.get(tokenId) ?? persistedAt;
  }
}
