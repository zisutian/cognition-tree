// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { createServerDataRootWriteScope } from "../../../../infrastructure/server/runtime/index.ts";
import { ApiMaintenanceGate } from "../../../../infrastructure/server/api/http/maintenanceGate.ts";

describe("API maintenance gate", () => {
  it.each(["syncWorkspace", "getWorkspaceSnapshot"])("drains %s, including possible authentication and lazy-store writes", async operationId => {
    const gate = new ApiMaintenanceGate(createServerDataRootWriteScope());
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const request = gate.run(operationId, () => pending);
    const acquired = vi.fn();
    const maintenance = gate.begin().then(lease => { acquired(); return lease; });
    await Promise.resolve();
    expect(acquired).not.toHaveBeenCalled();
    await expect(gate.run(operationId, async () => undefined)).rejects.toMatchObject({ code: "repository_busy" });
    await expect(gate.run("getCurrentDataRootMigration", async () => "control state")).resolves.toBe("control state");
    expect(acquired).not.toHaveBeenCalled();
    release();
    await request;
    const lease = await maintenance;
    expect(acquired).toHaveBeenCalledOnce();
    lease.finish();
    lease.finish();
    expect(gate.isClosed()).toBe(false);
    await gate.run(operationId, async () => undefined);
  });
});
