// SPDX-License-Identifier: GPL-3.0-or-later

import type { Server } from "node:http";

export const apiServerForceCloseMilliseconds = 5_000;

export async function closeApiServer({
  closeOwnedResources,
  forceAfterMilliseconds = apiServerForceCloseMilliseconds,
  server,
}: {
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
  try {
    const results = await Promise.allSettled([
      Promise.resolve().then(closeOwnedResources),
      serverClosed,
    ]);
    const failures = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : []
    );

    if (failures.length > 0) throw failures[0];
  } finally {
    clearTimeout(forceTimer);
  }
}
