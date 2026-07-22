import { describe, expect, it } from "vitest";
import { webDavLockPath } from "../../../../infrastructure/server/adapters/webdav/webDavControlFiles.ts";
import {
  WebDavWriterLeaseCoordinator,
} from "../../../../infrastructure/server/adapters/webdav/webDavWriterLease.ts";
import { InMemoryWebDavTransport } from "./inMemoryWebDavTransport.ts";

describe("WebDAV writer lease coordinator", () => {
  it("releases with the renewed ETag when release races an active renewal", async () => {
    const transport = new InMemoryWebDavTransport();
    const coordinator = new WebDavWriterLeaseCoordinator({
      createId: () => "writer-1",
      leaseMs: 60_000,
      now: Date.now,
      renewMs: 60_000,
      transport,
    });
    const lease = await coordinator.acquire();
    let continueRenewal!: () => void;
    let renewalStarted!: () => void;
    const canContinue = new Promise<void>((resolve) => {
      continueRenewal = resolve;
    });
    const started = new Promise<void>((resolve) => {
      renewalStarted = resolve;
    });

    transport.beforeWrite = async (path) => {
      if (path === webDavLockPath) {
        renewalStarted();
        await canContinue;
      }
    };
    const renewal = coordinator.renew(lease);

    await started;
    const release = coordinator.release(lease);
    continueRenewal();
    await renewal;
    await release;

    expect(transport.has(webDavLockPath)).toBe(false);
  });
});
