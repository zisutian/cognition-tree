// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import {
  apiV1Scopes,
  type ApiV1PrincipalDto,
} from "../../../../contracts/api/types.ts";
import type { ApiV1StateStore } from "../state/store.ts";

export const defaultApiV1AllowedOrigins = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
] as const;

type HostPattern = {
  hostname: string;
  port: string | null;
  source: string;
};

export type ApiV1SecurityPolicy = {
  allowedHosts: readonly string[];
  allowedOrigins: readonly string[];
  bearerTokenDigest: Buffer | null;
  requiresBearerToken: boolean;
};

export class ApiV1SecurityError extends Error {
  allowedOrigin: string | null;
  statusCode: number;

  constructor(
    statusCode: number,
    message: string,
    allowedOrigin: string | null = null,
  ) {
    super(message);
    this.name = "ApiV1SecurityError";
    this.allowedOrigin = allowedOrigin;
    this.statusCode = statusCode;
  }
}

function normalizeHostname(hostname: string) {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

function parseHostPattern(value: string): HostPattern {
  const source = value.trim();

  if (!source || /[\s/@]/.test(source) || source.includes("://")) {
    throw new Error(`Invalid API host: ${value}`);
  }

  const authorityMatch = source.startsWith("[")
    ? /^\[[^\]]+\](?::(\d+))?$/.exec(source)
    : /^([^:]+)(?::(\d+))?$/.exec(source);

  if (!authorityMatch) {
    throw new Error(`Invalid API host: ${value}`);
  }

  const explicitPort = authorityMatch[1] && source.startsWith("[")
    ? authorityMatch[1]
    : authorityMatch[2] ?? null;
  let url: URL;

  try {
    url = new URL(`http://${source}`);
  } catch {
    throw new Error(`Invalid API host: ${value}`);
  }

  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`Invalid API host: ${value}`);
  }

  if (
    explicitPort &&
    (Number(explicitPort) < 1 || Number(explicitPort) > 65_535)
  ) {
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

function isLoopbackHost(host: string) {
  const hostname = normalizeHostname(host);

  if (hostname === "localhost" || hostname === "::1") {
    return true;
  }
  if (isIP(hostname) === 4) {
    return hostname.startsWith("127.");
  }
  if (hostname.startsWith("::ffff:")) {
    const mappedIpv4 = hostname.slice("::ffff:".length);

    return isIP(mappedIpv4) === 4 && mappedIpv4.startsWith("127.");
  }
  return false;
}

function normalizeAllowedOrigin(value: string) {
  const origin = new URL(value).origin;

  if (!origin.startsWith("http://") && !origin.startsWith("https://")) {
    throw new Error(`Unsupported API origin: ${value}`);
  }

  return origin;
}

function digestToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest();
}

function readHeader(request: IncomingMessage, name: string) {
  const value = request.headers[name.toLowerCase()];

  return Array.isArray(value) ? value[0] : value;
}

function parseBearerToken(value: string | undefined) {
  const match = /^Bearer ([^\s]+)$/i.exec(value ?? "");

  return match?.[1] ?? null;
}

function readApiV1BearerToken(request: IncomingMessage) {
  return parseBearerToken(readHeader(request, "authorization"));
}

function assertAllowedHost(
  requestHost: string | undefined,
  allowedHosts: readonly string[],
) {
  if (!requestHost) {
    throw new ApiV1SecurityError(400, "Host header is required");
  }

  let requestPattern: HostPattern;

  try {
    requestPattern = parseHostPattern(requestHost);
  } catch {
    throw new ApiV1SecurityError(400, "Host header is invalid");
  }

  const allowed = allowedHosts.some((allowedHost) => {
    const pattern = parseHostPattern(allowedHost);

    return pattern.hostname === requestPattern.hostname &&
      (pattern.port === null || pattern.port === requestPattern.port);
  });

  if (!allowed) {
    throw new ApiV1SecurityError(403, "Host is not allowed");
  }
}

export function createApiV1SecurityPolicy({
  bearerToken,
  host,
  publicUrl,
}: {
  bearerToken?: string;
  host: string;
  publicUrl?: string;
}): ApiV1SecurityPolicy {
  const loopback = isLoopbackHost(host);
  const requiresBearerToken = !loopback || Boolean(bearerToken);

  if (!loopback && (!bearerToken || !publicUrl)) {
    throw new Error(
      "CTN_API_TOKEN and CTN_PUBLIC_URL are required for a non-loopback API host",
    );
  }
  if (bearerToken !== undefined && bearerToken.length < 32) {
    throw new Error("CTN_API_TOKEN must contain at least 32 characters");
  }
  let publicOrigin: string | null = null;
  let publicHost: string | null = null;

  if (publicUrl) {
    const url = new URL(publicUrl);

    if (url.protocol !== "https:" || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash) {
      throw new Error("CTN_PUBLIC_URL must be an HTTPS origin");
    }
    publicOrigin = url.origin;
    publicHost = url.host;
  }
  if (!loopback && (!publicOrigin || !publicHost)) {
    throw new Error("CTN_PUBLIC_URL must be configured for a non-loopback API host");
  }

  const resolvedHosts = publicHost
    ? [publicHost]
    : ["127.0.0.1", "localhost", "[::1]"];
  const resolvedOrigins = publicOrigin
    ? [publicOrigin]
    : [...defaultApiV1AllowedOrigins];

  return {
    allowedHosts: [
      ...new Set(resolvedHosts.map((value) => parseHostPattern(value).source)),
    ],
    allowedOrigins: [
      ...new Set(resolvedOrigins.map(normalizeAllowedOrigin)),
    ],
    bearerTokenDigest: bearerToken ? digestToken(bearerToken) : null,
    requiresBearerToken,
  };
}

export async function authorizeApiV1Request(
  request: IncomingMessage,
  policy: ApiV1SecurityPolicy,
  stateStore: Pick<ApiV1StateStore, "authenticate">,
): Promise<{
  allowedOrigin: string | null;
  principal: ApiV1PrincipalDto;
}> {
  assertAllowedHost(readHeader(request, "host"), policy.allowedHosts);

  const requestOrigin = readHeader(request, "origin");
  let allowedOrigin: string | null = null;

  if (requestOrigin) {
    try {
      allowedOrigin = normalizeAllowedOrigin(requestOrigin);
    } catch {
      throw new ApiV1SecurityError(403, "Origin is not allowed");
    }
    if (!policy.allowedOrigins.includes(allowedOrigin)) {
      throw new ApiV1SecurityError(403, "Origin is not allowed");
    }
  }
  if (!policy.requiresBearerToken || request.method === "OPTIONS") {
    return {
      allowedOrigin,
      principal: {
        id: "local-owner",
        kind: "local-owner",
        name: "本机官方客户端",
        repositoryIds: null,
        scopes: [...apiV1Scopes],
      },
    };
  }
  const token = readApiV1BearerToken(request);
  const presentedDigest = token ? digestToken(token) : null;

  if (
    presentedDigest &&
    policy.bearerTokenDigest &&
    timingSafeEqual(presentedDigest, policy.bearerTokenDigest)
  ) {
    return {
      allowedOrigin,
      principal: {
        id: "bootstrap-owner",
        kind: "owner",
        name: "Owner",
        repositoryIds: null,
        scopes: [...apiV1Scopes],
      },
    };
  }
  const principal = token ? await stateStore.authenticate(token) : null;

  if (!principal) {
    throw new ApiV1SecurityError(
      401,
      "Bearer token is invalid",
      allowedOrigin,
    );
  }
  return { allowedOrigin, principal };
}
