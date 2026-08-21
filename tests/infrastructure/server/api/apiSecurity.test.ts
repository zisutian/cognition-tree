import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
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
    url: "/api/v3/health",
  }) as IncomingMessage;
}

describe("CTN API v3 security", () => {
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

  it("honors explicit automation credentials on loopback", async () => {
    const policy = createApiSecurityPolicy({ host: "127.0.0.1" });
    const secret = "ctn_loopback-automation-token";
    const authenticate = vi.fn(async (presented: string) =>
      presented === secret
        ? {
            id: "automation-token",
            kind: "automation" as const,
            name: "只读工具",
            repositoryIds: ["repository-allowed"],
            scopes: ["workspace:read" as const],
          }
        : null
    );

    await expect(authorizeApiRequest(createRequest({
      headers: {
        authorization: `Bearer ${secret}`,
        host: "localhost:3317",
      },
    }), policy, { authenticate })).resolves.toMatchObject({
      principal: {
        id: "automation-token",
        kind: "automation",
        repositoryIds: ["repository-allowed"],
        scopes: ["workspace:read"],
      },
    });
    expect(authenticate).toHaveBeenCalledWith(secret);

    await expect(authorizeApiRequest(createRequest({
      headers: {
        authorization: "Bearer invalid",
        host: "localhost:3317",
      },
    }), policy, { authenticate })).rejects.toMatchObject({ statusCode: 401 });
    await expect(authorizeApiRequest(createRequest({
      headers: {
        authorization: "Bearer",
        host: "localhost:3317",
      },
    }), policy, { authenticate })).rejects.toMatchObject({ statusCode: 401 });
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
