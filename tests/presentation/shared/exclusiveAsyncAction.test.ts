import { describe, expect, it, vi } from "vitest";
import {
  createExclusiveAsyncActionRunner,
} from "../../../presentation/ui/shared/useExclusiveAsyncAction";

function createDeferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

function requirePending<Value>(pending: Promise<Value> | null) {
  if (!pending) throw new Error("Expected the action to acquire the gate.");
  return pending;
}

describe("exclusive async action", () => {
  it("acquires synchronously and releases only after settlement", async () => {
    const busyChanges = vi.fn();
    const first = createDeferred<string>();
    const runner = createExclusiveAsyncActionRunner(busyChanges);
    const running = requirePending(runner.run(() => first.promise));

    expect(runner.run(async () => "duplicate")).toBeNull();
    expect(busyChanges.mock.calls).toEqual([[true]]);

    first.resolve("completed");
    await expect(running).resolves.toBe("completed");
    await Promise.resolve();
    expect(busyChanges.mock.calls).toEqual([[true], [false]]);
    await expect(requirePending(runner.run(async () => "next")))
      .resolves.toBe("next");
  });

  it("releases after failure without hiding the error", async () => {
    const busyChanges = vi.fn();
    const runner = createExclusiveAsyncActionRunner(busyChanges);
    const failed = requirePending(runner.run(() => {
      throw new Error("failed");
    }));

    await expect(failed).rejects.toThrow("failed");
    await Promise.resolve();
    expect(busyChanges.mock.calls).toEqual([[true], [false]]);
    await expect(requirePending(runner.run(async () => "recovered")))
      .resolves.toBe("recovered");
  });
});
