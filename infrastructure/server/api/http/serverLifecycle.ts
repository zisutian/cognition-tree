// SPDX-License-Identifier: GPL-3.0-or-later

import type { Server } from "node:http";

export const apiServerForceCloseMilliseconds = 5_000;

export class ApiServerLifecycleError extends Error {
  readonly causes: readonly unknown[];

  constructor(causes: readonly unknown[]) {
    super("Multiple API server shutdown operations failed");
    this.name = "ApiServerLifecycleError";
    this.causes = causes;
  }
}

function throwLifecycleFailures(failures: readonly unknown[]) {
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new ApiServerLifecycleError(failures);
}

export async function settleApiServerLifecycleOperations(
  operations: readonly (() => Promise<void> | void)[],
) {
  const results = await Promise.allSettled(
    operations.map((operation) => Promise.resolve().then(operation)),
  );
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : []
  );

  throwLifecycleFailures(failures);
}

export async function settleApiServerLifecyclePhases(
  phases: readonly (readonly (() => Promise<void> | void)[])[],
) {
  const failures: unknown[] = [];

  for (const operations of phases) {
    const results = await Promise.allSettled(
      operations.map((operation) => Promise.resolve().then(operation)),
    );

    for (const result of results) {
      if (result.status === "fulfilled") continue;
      if (result.reason instanceof ApiServerLifecycleError) {
        failures.push(...result.reason.causes);
      } else {
        failures.push(result.reason);
      }
    }
  }
  throwLifecycleFailures(failures);
}

export async function closeApiServer({
  closeLongLivedConnections,
  closeOwnedResources,
  forceAfterMilliseconds = apiServerForceCloseMilliseconds,
  server,
}: {
  closeLongLivedConnections(): Promise<void> | void;
  closeOwnedResources(): Promise<void> | void;
  forceAfterMilliseconds?: number;
  server: Server;
}): Promise<void> {
  if (!Number.isSafeInteger(forceAfterMilliseconds) ||
      forceAfterMilliseconds < 1) {
    throw new Error("forceAfterMilliseconds must be a positive integer");
  }
  const serverClosed = new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  const forceTimer = setTimeout(() => {
    server.closeAllConnections();
  }, forceAfterMilliseconds);

  forceTimer.unref();
  let connectionResults: PromiseSettledResult<void>[];

  try {
    connectionResults = await Promise.allSettled([
      Promise.resolve().then(closeLongLivedConnections),
      serverClosed,
    ]);
  } finally {
    clearTimeout(forceTimer);
  }
  const resourceResults = await Promise.allSettled([
    Promise.resolve().then(closeOwnedResources),
  ]);
  const failures = [...connectionResults, ...resourceResults].flatMap(
    (result) => result.status === "rejected" ? [result.reason] : [],
  );

  throwLifecycleFailures(failures);
}
