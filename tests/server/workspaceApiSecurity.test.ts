import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  authorizeWorkspaceApiRequest,
  createWorkspaceApiSecurityPolicy,
  parseWorkspaceApiAllowedHosts,
  parseWorkspaceApiAllowedOrigins,
  WorkspaceApiSecurityError,
} from "../../server/workspaceApiSecurity.ts";

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
  it("allows loopback authorities without requiring a bearer token", () => {
    const policy = createWorkspaceApiSecurityPolicy({
      host: "127.0.0.1",
    });

    expect(policy.requiresBearerToken).toBe(false);
    expect(
      authorizeWorkspaceApiRequest(
        createRequest({ headers: { host: "localhost:3317" } }),
        policy,
      ),
    ).toEqual({ allowedOrigin: null });
    expect(() =>
      authorizeWorkspaceApiRequest(
        createRequest({ headers: { host: "example.test" } }),
        policy,
      ),
    ).toThrow("Host is not allowed");
  });

  it("requires explicit host and token configuration for exposed binds", () => {
    expect(() =>
      createWorkspaceApiSecurityPolicy({
        allowedHosts: ["notes.example.test"],
        host: "0.0.0.0",
      }),
    ).toThrow("CTN_API_TOKEN is required");
    expect(() =>
      createWorkspaceApiSecurityPolicy({
        bearerToken: "short",
        host: "notes.example.test",
      }),
    ).toThrow("at least 32 characters");
    expect(() =>
      createWorkspaceApiSecurityPolicy({
        bearerToken: "x".repeat(32),
        host: "0.0.0.0",
      }),
    ).toThrow("CTN_API_ALLOWED_HOSTS is required");
  });

  it("validates bearer tokens in constant-size digests", () => {
    const token = "a-secure-api-token-with-at-least-32-characters";
    const policy = createWorkspaceApiSecurityPolicy({
      allowedHosts: ["api.example.test:3001"],
      allowedOrigins: ["https://notes.example.test"],
      bearerToken: token,
      host: "0.0.0.0",
    });
    const headers = {
      authorization: `Bearer ${token}`,
      host: "api.example.test:3001",
      origin: "https://notes.example.test",
    };

    expect(
      authorizeWorkspaceApiRequest(createRequest({ headers }), policy),
    ).toEqual({ allowedOrigin: "https://notes.example.test" });
    expect(() =>
      authorizeWorkspaceApiRequest(
        createRequest({ headers: { ...headers, authorization: "Bearer bad" } }),
        policy,
      ),
    ).toThrow(WorkspaceApiSecurityError);
    expect(() =>
      authorizeWorkspaceApiRequest(
        createRequest({ headers: { ...headers, authorization: undefined } }),
        policy,
      ),
    ).toThrow("Bearer token is invalid");
    expect(JSON.stringify(policy)).not.toContain(token);
  });

  it("allows authenticated browser preflight without sending the token", () => {
    const policy = createWorkspaceApiSecurityPolicy({
      allowedHosts: ["api.example.test"],
      allowedOrigins: ["https://notes.example.test"],
      bearerToken: "x".repeat(32),
      host: "0.0.0.0",
    });

    expect(
      authorizeWorkspaceApiRequest(
        createRequest({
          headers: {
            host: "api.example.test:8443",
            origin: "https://notes.example.test",
          },
          method: "OPTIONS",
        }),
        policy,
      ),
    ).toEqual({ allowedOrigin: "https://notes.example.test" });
  });

  it("normalizes configured Host and Origin allowlists", () => {
    expect(
      parseWorkspaceApiAllowedHosts(
        "API.example.test:3001, api.example.test:3001, api.example.test:80, [::1]",
      ),
    ).toEqual([
      "api.example.test:3001",
      "api.example.test:80",
      "[::1]",
    ]);
    expect(
      parseWorkspaceApiAllowedOrigins(
        "http://localhost:4173/, https://notes.example.test, http://localhost:4173",
      ),
    ).toEqual([
      "http://localhost:4173",
      "https://notes.example.test",
    ]);
  });
});
