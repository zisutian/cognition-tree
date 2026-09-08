// SPDX-License-Identifier: GPL-3.0-or-later

import type { IncomingHttpHeaders,IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { describe,expect,it } from "vitest";
import {
authorizeApiRequest,
createApiSecurityPolicy,
} from "../../../../infrastructure/server/api/http/security.ts";

const ownerSessions = {
  createOwnerSessionForSecret: async () => null,
  verifyOwnerSession: async (session: string) => session === "valid-session",
};

function createRequest({
  headers,
  method = "GET",
  remoteAddress = "127.0.0.1",
}: {
  headers: IncomingHttpHeaders;
  method?: string;
  remoteAddress?: string;
}) {
  return Object.assign(Readable.from([]), {
    headers,
    method,
    socket: { remoteAddress },
    url: "/api/v4/health",
  }) as IncomingMessage;
}

function loopbackPolicy() {
  return createApiSecurityPolicy({
    ownerSessions,
    port: 3_001,
    publicOrigin: null,
  });
}

describe("CTN API v4 security", () => {
  it("grants local owner only when both socket and Host are loopback", async () => {
    const policy = loopbackPolicy();

    await expect(authorizeApiRequest(createRequest({
      headers: { host: "localhost:3001" },
    }), policy)).resolves.toMatchObject({
      principal: { kind: "local-owner" },
    });
    await expect(authorizeApiRequest(createRequest({
      headers: { host: "localhost:3001" },
      remoteAddress: "192.168.1.20",
    }), policy)).resolves.toMatchObject({ principal: null });
  });

  it("does not promote a loopback reverse proxy for a public Host", async () => {
    const policy = createApiSecurityPolicy({
      ownerSessions,
      port: 3_001,
      publicOrigin: "https://tree.example.test",
    });

    await expect(authorizeApiRequest(createRequest({
      headers: { host: "tree.example.test" },
    }), policy)).resolves.toMatchObject({ principal: null });
  });

  it.each(["Bearer ctn_legacy", "Bearer ctnt_legacy", "Bearer invalid", "Bearer", "Basic ignored", ""])("rejects explicit Authorization without local or cookie fallback: %s", async (authorization) => {
    await expect(authorizeApiRequest(createRequest({ headers: { authorization, host: "localhost:3001", cookie: "ctn_owner_session=valid-session" } }), loopbackPolicy())).rejects.toMatchObject({ statusCode: 401 });
  });

  it("accepts a signed owner cookie remotely and requires exact Origin for mutation", async () => {
    const policy = createApiSecurityPolicy({
      ownerSessions,
      port: 3_001,
      publicOrigin: "https://tree.example.test",
    });
    const remote = "192.168.1.20";

    await expect(authorizeApiRequest(createRequest({
      headers: {
        cookie: "ctn_owner_session=valid-session",
        host: "tree.example.test",
      },
      remoteAddress: remote,
    }), policy)).resolves.toMatchObject({
      principal: { kind: "owner" },
    });
    await expect(authorizeApiRequest(createRequest({
      headers: {
        cookie: "ctn_owner_session=valid-session",
        host: "tree.example.test",
      },
      method: "POST",
      remoteAddress: remote,
    }), policy)).rejects.toMatchObject({ statusCode: 403 });
    await expect(authorizeApiRequest(createRequest({
      headers: {
        cookie: "ctn_owner_session=valid-session",
        host: "tree.example.test",
        origin: "https://tree.example.test",
      },
      method: "POST",
      remoteAddress: remote,
    }), policy)).resolves.toMatchObject({
      principal: { kind: "owner" },
    });
  });

  it("validates preflight Host and Origin without granting a principal", async () => {
    const policy = createApiSecurityPolicy({
      ownerSessions,
      port: 3_001,
      publicOrigin: "https://tree.example.test",
    });

    await expect(authorizeApiRequest(createRequest({
      headers: {
        host: "tree.example.test",
        origin: "https://tree.example.test",
      },
      method: "OPTIONS",
      remoteAddress: "192.168.1.20",
    }), policy)).resolves.toEqual({
      allowedOrigin: "https://tree.example.test",
      principal: null,
    });
  });
});
