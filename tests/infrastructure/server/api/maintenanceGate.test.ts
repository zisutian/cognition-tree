// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { ApiMaintenanceGate } from "../../../../infrastructure/server/api/http/maintenanceGate.ts";

describe("API maintenance gate", () => {
  it("drains admitted work and blocks new content requests while preserving recovery controls", async () => {
    const gate = new ApiMaintenanceGate();
    const leaveMutation = gate.enter("syncWorkspace");
    const leasePromise = gate.begin();
    let acquired = false;

    void leasePromise.then(() => {
      acquired = true;
    });
    await Promise.resolve();
    expect(acquired).toBe(false);

    const leaveRead = gate.enter("getCurrentDataRootMigration");

    leaveRead();
    await Promise.resolve();
    expect(acquired).toBe(false);
    expect(() => gate.enter("syncWorkspace")).toThrow(
      expect.objectContaining({ code: "repository_busy" }),
    );

    leaveMutation();
    const lease = await leasePromise;

    expect(acquired).toBe(true);
    lease.finish();
    const leaveNextMutation = gate.enter("syncWorkspace");

    leaveNextMutation();
  });

  it("drains reads too because authentication and lazy stores can write", async () => {
    const gate = new ApiMaintenanceGate();
    const leaveRead = gate.enter("getWorkspaceSnapshot");
    const acquired = vi.fn();
    const pending = gate.begin().then((lease) => { acquired(); return lease; });
    await Promise.resolve();
    expect(acquired).not.toHaveBeenCalled();
    expect(() => gate.enter("getWorkspaceSnapshot")).toThrow();

    leaveRead();
    leaveRead();
    const lease = await pending;
    expect(acquired).toHaveBeenCalledOnce();
    lease.finish();
    lease.finish();
    expect(gate.isClosed()).toBe(false);
  });
});
