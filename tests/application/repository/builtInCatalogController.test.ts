// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import type {
  BuiltInCatalog,
  BuiltInCatalogData,
} from "../../../application/repository/builtInCatalog";
import {
  createBuiltInCatalogController,
} from "../../../application/repository/builtInCatalogController";

const catalogData: BuiltInCatalogData = {
  issues: [],
  repositories: [],
};

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((next) => {
    resolve = next;
  });

  return { promise, resolve };
}

function createHarness() {
  const catalog: BuiltInCatalog = {
    label: "Built-ins",
    listBuiltIns: vi.fn(async () => catalogData),
    retry: vi.fn(),
  };

  return {
    catalog,
    controller: createBuiltInCatalogController(catalog),
  };
}

describe("built-in catalog controller", () => {
  it("starts idempotently and invalidates its in-flight reload when stopped", async () => {
    const harness = createHarness();
    const pending = deferred<BuiltInCatalogData>();

    vi.mocked(harness.catalog.listBuiltIns).mockReturnValueOnce(pending.promise);
    harness.controller.start();
    harness.controller.start();

    expect(harness.catalog.listBuiltIns).toHaveBeenCalledOnce();
    harness.controller.stop();
    pending.resolve(catalogData);
    await pending.promise;
    await Promise.resolve();

    expect(harness.controller.getState()).toEqual({ status: "loading" });
  });

  it("contains a failed background refresh after preserving ready state", async () => {
    const harness = createHarness();

    await harness.controller.reload();
    vi.mocked(harness.catalog.listBuiltIns).mockRejectedValueOnce(
      new Error("refresh failed"),
    );
    harness.controller.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.controller.getState()).toEqual({
      ...catalogData,
      retryingId: null,
      status: "ready",
    });
  });
});
