// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, it, vi } from "vitest";
import { createServerDataRootWriteScope } from "../../../../infrastructure/server/runtime/index.ts";

it("drains detached child writes and permits admitted work to finish after admission closes", async () => {
  const writes = createServerDataRootWriteScope();
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let child!: Promise<void>;
  let descendantFinished = false;
  await writes.run(async () => {
    child = writes.run(async () => {
      await blocked;
      await writes.run(async () => { descendantFinished = true; });
    });
  });
  const acquired = vi.fn();
  const maintenance = writes.begin().then(lease => { acquired(); return lease; });
  await Promise.resolve();
  expect(acquired).not.toHaveBeenCalled();
  await expect(writes.run(async () => undefined)).rejects.toThrow("maintenance");
  release();
  await child;
  const lease = await maintenance;
  expect(descendantFinished).toBe(true);
  expect(acquired).toHaveBeenCalledOnce();
  lease.finish();
});

it("rejects deferred work that starts from a finished request context", async () => {
  const writes = createServerDataRootWriteScope();
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let late!: Promise<void>;
  const write = vi.fn(async () => undefined);
  await writes.run(async () => { late = blocked.then(() => writes.run(write)); });
  const lease = await writes.begin();
  const rejected = expect(late).rejects.toThrow("maintenance");
  release();
  await rejected;
  expect(write).not.toHaveBeenCalled();
  lease.finish();
  await writes.run(write);
  expect(write).toHaveBeenCalledOnce();
});
