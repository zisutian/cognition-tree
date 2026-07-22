import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  authorizeWorkspaceApiRequest,
  createWorkspaceApiSecurityPolicy,
  WorkspaceApiSecurityError,
} from "../../../infrastructure/server/api/workspaceApiSecurity.ts";

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
    url: "/api/health",
  }) as IncomingMessage;
}

describe("workspace API security", () => {
  it("allows loopback authorities without a token", () => {
    const policy = createWorkspaceApiSecurityPolicy({ host: "127.0.0.1" });

    expect(policy.requiresBearerToken).toBe(false);
    expect(authorizeWorkspaceApiRequest(
      createRequest({ headers: { host: "localhost:3317" } }),
      policy,
    )).toEqual({ allowedOrigin: null });
    expect(() => authorizeWorkspaceApiRequest(
      createRequest({ headers: { host: "example.test" } }),
      policy,
    )).toThrow("Host is not allowed");
  });

  it("requires token and HTTPS CTN_PUBLIC_URL for every exposed bind", () => {
    expect(() => createWorkspaceApiSecurityPolicy({ host: "0.0.0.0" }))
      .toThrow("CTN_API_TOKEN and CTN_PUBLIC_URL");
    expect(() => createWorkspaceApiSecurityPolicy({
      bearerToken: "x".repeat(32),
      host: "0.0.0.0",
      publicUrl: "http://api.example.test",
    })).toThrow("must be an HTTPS origin");
    expect(() => createWorkspaceApiSecurityPolicy({
      bearerToken: "short",
      host: "0.0.0.0",
      publicUrl: "https://api.example.test",
    })).toThrow("at least 32 characters");
  });

  it("derives Host, Origin, and bearer policy from CTN_PUBLIC_URL", () => {
    const token = "a-secure-api-token-with-at-least-32-characters";
    const policy = createWorkspaceApiSecurityPolicy({
      bearerToken: token,
      host: "0.0.0.0",
      publicUrl: "https://api.example.test:8443",
    });
    const headers = {
      authorization: `Bearer ${token}`,
      host: "api.example.test:8443",
      origin: "https://api.example.test:8443",
    };

    expect(authorizeWorkspaceApiRequest(createRequest({ headers }), policy))
      .toEqual({ allowedOrigin: "https://api.example.test:8443" });
    expect(() => authorizeWorkspaceApiRequest(
      createRequest({ headers: { ...headers, authorization: "Bearer bad" } }),
      policy,
    )).toThrow(WorkspaceApiSecurityError);
    expect(() => authorizeWorkspaceApiRequest(
      createRequest({ headers: { ...headers, host: "attacker.test" } }),
      policy,
    )).toThrow("Host is not allowed");
    expect(JSON.stringify(policy)).not.toContain(token);
  });

  it("allows authenticated preflight without sending the bearer token", () => {
    const policy = createWorkspaceApiSecurityPolicy({
      bearerToken: "x".repeat(32),
      host: "0.0.0.0",
      publicUrl: "https://api.example.test",
    });

    expect(authorizeWorkspaceApiRequest(createRequest({
      headers: { host: "api.example.test", origin: "https://api.example.test" },
      method: "OPTIONS",
    }), policy)).toEqual({ allowedOrigin: "https://api.example.test" });
  });
});
