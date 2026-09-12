// SPDX-License-Identifier: GPL-3.0-or-later

import http from "node:http";
import { once } from "node:events";
import { expect, it, vi } from "vitest";
import { buildApiOperationPath, parseApiError } from "../../../../contracts/api/index.ts";
import { createDataRootMigrationRecoveryHandler } from "../../../../infrastructure/server/system/dataRootMigrationRecoveryServer.ts";

it("enforces local recovery and returns API v4 error contracts over HTTP", async () => {
  const recoverOnStartup = vi.fn(async () => { throw new Error("bootstrap lock unavailable"); });
  const server = http.createServer(createDataRootMigrationRecoveryHandler({
    migrations: { current: async () => null, recoverOnStartup },
    failure: null, requestRestart: vi.fn(),
  }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test address");
  const origin = `http://127.0.0.1:${address.port}`;
  const endpoint = origin + buildApiOperationPath("reconcileMigrationRecovery");
  try {
    const denied = await fetch(endpoint, { method: "POST", headers: { Origin: "https://remote.invalid" }, body: "{}" });
    expect(denied.status).toBe(403);
    expect(parseApiError(await denied.json()).code).toBe("forbidden");
    const invalid = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"force":true}' });
    expect(invalid.status).toBe(400);
    expect(parseApiError(await invalid.json()).code).toBe("invalid_request");
    expect(recoverOnStartup).not.toHaveBeenCalled();
    const failed = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(failed.status).toBe(503);
    expect(parseApiError(await failed.json())).toMatchObject({ code: "adapter_unavailable", message: "bootstrap lock unavailable", retryable: true });
    const old = await fetch(origin + buildApiOperationPath("getMigrationRecoveryStatus").replace("/v4/", "/v3/"));
    expect(old.status).toBe(404);
    expect(parseApiError(await old.json()).code).toBe("not_found");
    const status = await fetch(origin + buildApiOperationPath("getMigrationRecoveryStatus"));
    expect(await status.json()).toEqual({ errorMessage: "bootstrap lock unavailable", migration: null });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
