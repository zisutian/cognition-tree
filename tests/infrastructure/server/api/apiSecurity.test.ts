import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  authorizeApiRequest,
  createApiSecurityPolicy,
  ApiSecurityError,
} from "../../../../infrastructure/server/api/http/security.ts";

const noAutomationTokens = {
  authenticate: async () => null,
};

function createRequest({
  headers,
  method = "GET",
}: {
  headers: IncomingHttpHeaders;
  method?: string;
}) {
  return Object.assign(Readable.from([]), {
    headers,
    method,
    url: "/api/v2/health",
  }) as IncomingMessage;
}

describe("CTN API v2 security", () => {
  it("allows loopback authorities without a token", async () => {
    const policy = createApiSecurityPolicy({ host: "127.0.0.1" });

    expect(policy.requiresBearerToken).toBe(false);
    await expect(authorizeApiRequest(
      createRequest({ headers: { host: "localhost:3317" } }),
      policy,
      noAutomationTokens,
    )).resolves.toMatchObject({
      allowedOrigin: null,
      principal: { kind: "local-owner" },
    });
    await expect(authorizeApiRequest(
      createRequest({ headers: { host: "example.test" } }),
      policy,
      noAutomationTokens,
    )).rejects.toThrow("Host is not allowed");
  });

  it("requires token and HTTPS CTN_PUBLIC_URL for every exposed bind", () => {
    expect(() => createApiSecurityPolicy({ host: "0.0.0.0" }))
      .toThrow("CTN_API_TOKEN and CTN_PUBLIC_URL");
    expect(() => createApiSecurityPolicy({
      bearerToken: "x".repeat(32),
      host: "0.0.0.0",
      publicUrl: "http://api.example.test",
    })).toThrow("must be an HTTPS origin");
    expect(() => createApiSecurityPolicy({
      bearerToken: "short",
      host: "0.0.0.0",
      publicUrl: "https://api.example.test",
    })).toThrow("at least 32 characters");
  });

  it("derives Host, Origin, and owner principal from CTN_PUBLIC_URL", async () => {
    const token = "a-secure-api-token-with-at-least-32-characters";
    const policy = createApiSecurityPolicy({
      bearerToken: token,
      host: "0.0.0.0",
      publicUrl: "https://api.example.test:8443",
    });
    const headers = {
      authorization: `Bearer ${token}`,
      host: "api.example.test:8443",
      origin: "https://api.example.test:8443",
    };

    await expect(authorizeApiRequest(
      createRequest({ headers }),
      policy,
      noAutomationTokens,
    )).resolves.toMatchObject({
      allowedOrigin: "https://api.example.test:8443",
      principal: { kind: "owner" },
    });
    await expect(authorizeApiRequest(
      createRequest({ headers: { ...headers, authorization: "Bearer bad" } }),
      policy,
      noAutomationTokens,
    )).rejects.toThrow(ApiSecurityError);
    await expect(authorizeApiRequest(
      createRequest({ headers: { ...headers, host: "attacker.test" } }),
      policy,
      noAutomationTokens,
    )).rejects.toThrow("Host is not allowed");
    expect(JSON.stringify(policy)).not.toContain(token);
  });

  it("allows authenticated preflight without sending the bearer token", async () => {
    const policy = createApiSecurityPolicy({
      bearerToken: "x".repeat(32),
      host: "0.0.0.0",
      publicUrl: "https://api.example.test",
    });

    await expect(authorizeApiRequest(createRequest({
      headers: { host: "api.example.test", origin: "https://api.example.test" },
      method: "OPTIONS",
    }), policy, noAutomationTokens)).resolves.toMatchObject({
      allowedOrigin: "https://api.example.test",
      principal: { kind: "local-owner" },
    });
  });
});
