// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  createOwnerAuthenticationController,
  type OwnerAuthenticationPort,
} from "../../../application/system/systemConfiguration.ts";

function createDeferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function port(): OwnerAuthenticationPort {
  return {
    load: vi.fn(async () => false),
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
  };
}

describe("owner authentication controller", () => {
  it("does not let an older load overwrite a completed login", async () => {
    const adapter = port();
    const staleLoad = createDeferred<boolean>();

    vi.mocked(adapter.load).mockImplementationOnce(() => staleLoad.promise);
    const controller = createOwnerAuthenticationController(adapter);
    const loading = controller.load();

    await vi.waitFor(() => expect(adapter.load).toHaveBeenCalledOnce());
    await controller.login("owner-secret");
    staleLoad.resolve(false);
    await loading;

    expect(controller.getSnapshot()).toEqual({
      authenticated: true,
      errorMessage: null,
      status: "ready",
    });
  });

  it("serializes login and logout in invocation order", async () => {
    const adapter = port();
    const login = createDeferred<void>();
    const logout = createDeferred<void>();

    vi.mocked(adapter.login).mockImplementationOnce(() => login.promise);
    vi.mocked(adapter.logout).mockImplementationOnce(() => logout.promise);
    const controller = createOwnerAuthenticationController(adapter);
    const loggingIn = controller.login("owner-secret");
    const loggingOut = controller.logout();

    await Promise.resolve();
    expect(adapter.login).toHaveBeenCalledOnce();
    expect(adapter.logout).not.toHaveBeenCalled();
    login.resolve();
    await loggingIn;
    expect(controller.getSnapshot().status).toBe("loading");
    await Promise.resolve();
    expect(adapter.logout).toHaveBeenCalledOnce();

    logout.resolve();
    await loggingOut;
    expect(controller.getSnapshot()).toEqual({
      authenticated: false,
      errorMessage: null,
      status: "ready",
    });
  });
});
