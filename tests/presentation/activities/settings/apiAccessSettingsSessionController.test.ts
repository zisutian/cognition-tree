// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import type {
  ApiAccessAdministration,
  AutomationApiToken,
  TrustedClientToken,
} from "../../../../application/apiAccess/apiAccessAdministration.ts";
import {
  createApiAccessSettingsSessionController,
} from "../../../../presentation/activities/settings/apiAccessSettingsSessionController.ts";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function automationToken(id: string): AutomationApiToken {
  return {
    createdAt: "2026-08-30T00:00:00.000Z",
    id,
    lastUsedAt: null,
    name: id,
    prefix: id.slice(0, 4),
    repositoryIds: null,
    scopes: ["workspace:read"],
  };
}

function trustedToken(id: string): TrustedClientToken {
  return {
    createdAt: "2026-08-30T00:00:00.000Z",
    id,
    lastUsedAt: null,
    name: id,
    prefix: id.slice(0, 4),
  };
}

function administration(): ApiAccessAdministration {
  return {
    createToken: vi.fn(async () => ({
      secret: "automation-secret",
      token: automationToken("automation-created"),
    })),
    createTrustedClientToken: vi.fn(async () => ({
      secret: "trusted-secret",
      token: trustedToken("trusted-created"),
    })),
    listTokens: vi.fn(async () => []),
    listTrustedClientTokens: vi.fn(async () => []),
    revokeToken: vi.fn(async () => undefined),
    revokeTrustedClientToken: vi.fn(async () => undefined),
  };
}

describe("API access settings session controller", () => {
  it("does not let an older load overwrite a completed token mutation", async () => {
    const adapter = administration();
    const staleTokens = deferred<AutomationApiToken[]>();

    vi.mocked(adapter.listTokens).mockImplementationOnce(
      () => staleTokens.promise,
    );
    const controller = createApiAccessSettingsSessionController(adapter);
    const loading = controller.load();

    await controller.createToken({
      name: "Created",
      repositoryIds: null,
      scopes: ["workspace:read"],
    });
    staleTokens.resolve([automationToken("automation-stale")]);
    await loading;

    expect(controller.getSnapshot()).toMatchObject({
      loading: false,
      secret: "automation-secret",
      tokens: [{ id: "automation-created" }],
    });
  });

  it("stays loading until every concurrent token operation has settled", async () => {
    const adapter = administration();
    const automation = deferred<
      Awaited<ReturnType<ApiAccessAdministration["createToken"]>>
    >();
    const trusted = deferred<
      Awaited<ReturnType<ApiAccessAdministration["createTrustedClientToken"]>>
    >();

    vi.mocked(adapter.createToken).mockImplementationOnce(
      () => automation.promise,
    );
    vi.mocked(adapter.createTrustedClientToken).mockImplementationOnce(
      () => trusted.promise,
    );
    const controller = createApiAccessSettingsSessionController(adapter);
    const creatingAutomation = controller.createToken({
      name: "Automation",
      repositoryIds: null,
      scopes: ["workspace:read"],
    });
    const creatingTrusted = controller.createTrustedClientToken("Trusted");

    automation.resolve({
      secret: "automation-secret",
      token: automationToken("automation-created"),
    });
    await creatingAutomation;
    expect(controller.getSnapshot().loading).toBe(true);

    trusted.resolve({
      secret: "trusted-secret",
      token: trustedToken("trusted-created"),
    });
    await creatingTrusted;
    expect(controller.getSnapshot()).toMatchObject({
      loading: false,
      tokens: [{ id: "automation-created" }],
      trustedClientTokens: [{ id: "trusted-created" }],
    });
  });

  it("does not publish a secret after the page session is reset", async () => {
    const adapter = administration();
    const created = deferred<
      Awaited<ReturnType<ApiAccessAdministration["createToken"]>>
    >();

    vi.mocked(adapter.createToken).mockImplementationOnce(() => created.promise);
    const controller = createApiAccessSettingsSessionController(adapter);
    const creating = controller.createToken({
      name: "Created",
      repositoryIds: null,
      scopes: ["workspace:read"],
    });

    controller.reset();
    created.resolve({
      secret: "must-not-be-published",
      token: automationToken("automation-created"),
    });

    await expect(creating).resolves.toBeNull();
    expect(controller.getSnapshot()).toMatchObject({
      secret: null,
      tokens: [],
    });
  });

  it("does not let an invalidated mutation block the next lifecycle load", async () => {
    const adapter = administration();
    const created = deferred<
      Awaited<ReturnType<ApiAccessAdministration["createToken"]>>
    >();

    vi.mocked(adapter.createToken).mockImplementationOnce(() => created.promise);
    vi.mocked(adapter.listTokens).mockResolvedValueOnce([
      automationToken("automation-current"),
    ]);
    const controller = createApiAccessSettingsSessionController(adapter);
    const creating = controller.createToken({
      name: "Old lifecycle",
      repositoryIds: null,
      scopes: ["workspace:read"],
    });

    controller.reset();
    await controller.load();
    expect(controller.getSnapshot().tokens).toEqual([
      expect.objectContaining({ id: "automation-current" }),
    ]);

    created.resolve({
      secret: "must-not-be-published",
      token: automationToken("automation-invalidated"),
    });
    await expect(creating).resolves.toBeNull();
    expect(controller.getSnapshot()).toMatchObject({
      secret: null,
      tokens: [{ id: "automation-current" }],
    });
  });
});
