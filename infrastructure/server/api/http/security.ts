// SPDX-License-Identifier: GPL-3.0-or-later

import type { IncomingMessage } from "node:http";
import type { ApiPrincipalDto } from "../../../../contracts/api/index.ts";
import { isLoopbackAddress } from "../../network/index.ts";

export const ownerSessionCookieName = "ctn_owner_session";
export const ownerSessionMaxAgeSeconds = 12 * 60 * 60;

export function createOwnerSessionCookie(session: string) {
  return `${ownerSessionCookieName}=${encodeURIComponent(session)}; HttpOnly; SameSite=Strict; Secure; Path=/api/v4; Max-Age=${ownerSessionMaxAgeSeconds}`;
}

export function clearOwnerSessionCookie() {
  return `${ownerSessionCookieName}=; HttpOnly; SameSite=Strict; Secure; Path=/api/v4; Max-Age=0`;
}

type HostPattern = {
  hostname: string;
  port: string | null;
  source: string;
};

export type ApiOwnerSessionAuthority = {
  createOwnerSessionForSecret(
    secret: string,
    now?: Date,
  ): Promise<string | null>;
  verifyOwnerSession(session: string, now?: Date): Promise<boolean>;
};

export type ApiSecurityPolicy = {
  allowedHosts: readonly string[];
  allowedOrigins: readonly string[];
  ownerSessions: ApiOwnerSessionAuthority;
  publicOrigin: string | null;
};

export class ApiSecurityError extends Error {
  allowedOrigin: string | null;
  statusCode: number;

  constructor(
    statusCode: number,
    message: string,
    allowedOrigin: string | null = null,
  ) {
    super(message);
    this.name = "ApiSecurityError";
    this.allowedOrigin = allowedOrigin;
    this.statusCode = statusCode;
  }
}

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function parseHostPattern(value: string): HostPattern {
  const source = value.trim();

  if (!source || /[\s/@]/.test(source) || source.includes("://")) {
    throw new Error(`Invalid API host: ${value}`);
  }
  const authorityMatch = source.startsWith("[")
    ? /^\[[^\]]+\](?::(\d+))?$/.exec(source)
    : /^([^:]+)(?::(\d+))?$/.exec(source);

  if (!authorityMatch) throw new Error(`Invalid API host: ${value}`);
  const explicitPort = authorityMatch[1] && source.startsWith("[")
    ? authorityMatch[1]
    : authorityMatch[2] ?? null;
  let url: URL;

  try {
    url = new URL(`http://${source}`);
  } catch {
    throw new Error(`Invalid API host: ${value}`);
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`Invalid API host: ${value}`);
  }
  if (explicitPort && (Number(explicitPort) < 1 || Number(explicitPort) > 65_535)) {
    throw new Error(`Invalid API host: ${value}`);
  }
  const hostname = normalizeHostname(url.hostname);
  const normalizedHost = hostname.includes(":") ? `[${hostname}]` : hostname;

  return {
    hostname,
    port: explicitPort,
    source: `${normalizedHost}${explicitPort ? `:${explicitPort}` : ""}`,
  };
}

function normalizeAllowedOrigin(value: string) {
  const url = new URL(value);

  if ((url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`Unsupported API origin: ${value}`);
  }
  return url.origin;
}

function readHeader(request: IncomingMessage, name: string) {
  const value = request.headers[name.toLowerCase()];

  return Array.isArray(value) ? value[0] : value;
}

function parseBearerToken(value: string | undefined) {
  const match = /^Bearer ([^\s]+)$/i.exec(value ?? "");

  return match?.[1] ?? null;
}

function readCookie(value: string | undefined, name: string) {
  for (const field of value?.split(";") ?? []) {
    const separator = field.indexOf("=");

    if (separator < 0 || field.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(field.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function assertAllowedHost(
  requestHost: string | undefined,
  allowedHosts: readonly string[],
) {
  if (!requestHost) throw new ApiSecurityError(400, "Host header is required");
  let requestPattern: HostPattern;

  try {
    requestPattern = parseHostPattern(requestHost);
  } catch {
    throw new ApiSecurityError(400, "Host header is invalid");
  }
  const allowed = allowedHosts.some((allowedHost) => {
    const pattern = parseHostPattern(allowedHost);

    return pattern.hostname === requestPattern.hostname &&
      (pattern.port === null || pattern.port === requestPattern.port);
  });

  if (!allowed) throw new ApiSecurityError(403, "Host is not allowed");
  return requestPattern;
}

function isMutation(method: string | undefined) {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

export function createApiSecurityPolicy({
  ownerSessions,
  port,
  publicOrigin,
}: {
  ownerSessions: ApiOwnerSessionAuthority;
  port: number;
  publicOrigin: string | null;
}): ApiSecurityPolicy {
  const normalizedPublicOrigin = publicOrigin
    ? normalizeAllowedOrigin(publicOrigin)
    : null;
  if (normalizedPublicOrigin && !normalizedPublicOrigin.startsWith("https://")) {
    throw new Error("Public origin must use HTTPS");
  }
  const publicHost = normalizedPublicOrigin
    ? new URL(normalizedPublicOrigin).host
    : null;
  const localHosts = ["127.0.0.1", "localhost", "[::1]"];
  const localOrigins = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ];

  return {
    allowedHosts: [...new Set([
      ...localHosts,
      ...(publicHost ? [publicHost] : []),
    ].map((value) => parseHostPattern(value).source))],
    allowedOrigins: [...new Set([
      ...localOrigins,
      ...(normalizedPublicOrigin ? [normalizedPublicOrigin] : []),
    ].map(normalizeAllowedOrigin))],
    ownerSessions,
    publicOrigin: normalizedPublicOrigin,
  };
}

export async function authorizeApiRequest(
  request: IncomingMessage,
  policy: ApiSecurityPolicy,
  accessStore: { authenticate(secret: string): Promise<ApiPrincipalDto | null> },
): Promise<{
  allowedOrigin: string | null;
  principal: ApiPrincipalDto | null;
}> {
  const requestHost = assertAllowedHost(
    readHeader(request, "host"),
    policy.allowedHosts,
  );
  const requestOrigin = readHeader(request, "origin");
  let allowedOrigin: string | null = null;

  if (requestOrigin) {
    try {
      allowedOrigin = normalizeAllowedOrigin(requestOrigin);
    } catch {
      throw new ApiSecurityError(403, "Origin is not allowed");
    }
    if (!policy.allowedOrigins.includes(allowedOrigin)) {
      throw new ApiSecurityError(403, "Origin is not allowed");
    }
  }
  if (request.method === "OPTIONS") return { allowedOrigin, principal: null };
  const authorization = readHeader(request, "authorization");

  if (authorization !== undefined) {
    const token = parseBearerToken(authorization);

    if (!token) throw new ApiSecurityError(401, "Bearer token is invalid", allowedOrigin);
    const principal = await accessStore.authenticate(token);

    if (!principal) throw new ApiSecurityError(401, "Bearer token is invalid", allowedOrigin);
    return { allowedOrigin, principal };
  }
  if (
    isLoopbackAddress(request.socket.remoteAddress) &&
    isLoopbackAddress(requestHost.hostname)
  ) {
    return {
      allowedOrigin,
      principal: {
        id: "local-owner",
        kind: "local-owner",
        name: "本机官方客户端",
      },
    };
  }
  const session = readCookie(readHeader(request, "cookie"), ownerSessionCookieName);

  if (!session || !await policy.ownerSessions.verifyOwnerSession(session)) {
    return { allowedOrigin, principal: null };
  }
  if (isMutation(request.method) &&
      (!policy.publicOrigin || allowedOrigin !== policy.publicOrigin)) {
    throw new ApiSecurityError(
      403,
      "Owner session mutations require an exact Origin",
      allowedOrigin,
    );
  }
  return {
    allowedOrigin,
    principal: { id: "owner-session", kind: "owner", name: "Owner" },
  };
}
