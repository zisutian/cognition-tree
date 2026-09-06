// SPDX-License-Identifier: GPL-3.0-or-later

import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { isLocalRecoveryRequest } from "../../../../infrastructure/server/network/localRecoveryRequest.ts";
import { assertOperationAccess } from "../../../../infrastructure/server/api/http/handlerContext.ts";
import { getApiOperation } from "../../../../contracts/api/registry.ts";

describe("startup recovery boundary", () => {
  it.each([
    ["127.0.0.1", "localhost:3001", undefined, true],
    ["::ffff:127.0.0.1", "[::1]:3001", "http://[::1]:3001", true],
    ["10.0.0.1", "localhost:3001", undefined, false],
    ["127.0.0.1", "example.com", undefined, false],
    ["127.0.0.1", "localhost:3001", "http://example.com", false],
    ["127.0.0.1", "localhost:3001", "https://localhost:3001", false],
    ["127.0.0.1", "localhost:3001", "http://localhost:3002", false],
    ["127.0.0.1", "user@localhost:3001", undefined, false],
  ])("restricts recovery request %s %s %s", (remoteAddress, host, origin, allowed) => {
    const request = { socket: { remoteAddress }, headers: { host, ...(origin ? { origin } : {}) } } as unknown as IncomingMessage;
    expect(isLocalRecoveryRequest(request)).toBe(allowed);
  });

  it("denies startup recovery on the normal service even to its owner", () => {
    expect(() => assertOperationAccess({ kind: "local-owner", id: "local-owner", name: "Local owner" }, getApiOperation("reconcileMigrationRecovery"))).toThrow("local startup recovery server");
  });
});
