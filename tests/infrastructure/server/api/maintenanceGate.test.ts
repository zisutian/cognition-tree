// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { ApiMaintenanceGate } from "../../../../infrastructure/server/api/http/maintenanceGate.ts";

describe("API maintenance gate", () => {
  it("waits only for mutations that entered before maintenance", async () => {
    const gate = new ApiMaintenanceGate();
    const leaveMutation = gate.enter("POST");
    const leasePromise = gate.begin();
    let acquired = false;

    void leasePromise.then(() => {
      acquired = true;
    });
    await Promise.resolve();
    expect(acquired).toBe(false);

    const leaveRead = gate.enter("GET");

    leaveRead();
    await Promise.resolve();
    expect(acquired).toBe(false);
    expect(() => gate.enter("PUT")).toThrow(
      expect.objectContaining({ code: "repository_busy" }),
    );

    leaveMutation();
    const lease = await leasePromise;

    expect(acquired).toBe(true);
    lease.finish();
    const leaveNextMutation = gate.enter("DELETE");

    leaveNextMutation();
  });

  it("does not delay maintenance for active reads", async () => {
    const gate = new ApiMaintenanceGate();
    const leaveRead = gate.enter("GET");
    const lease = await gate.begin();

    leaveRead();
    lease.finish();
  });
});
