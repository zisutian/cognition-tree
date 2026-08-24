// SPDX-License-Identifier: GPL-3.0-or-later

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class AgentProviderTargetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentProviderTargetValidationError";
  }
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase();

  return normalized === "localhost" || normalized === "::1" ||
    /^127(?:\.[0-9]{1,3}){3}$/.test(normalized);
}

function isPrivateOrSpecialAddress(address: string) {
  const normalized = address.toLowerCase();

  if (normalized === "::1") return false;
  if (normalized.includes(":")) {
    return normalized === "::" || normalized.startsWith("fc") ||
      normalized.startsWith("fd") || normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") || normalized.startsWith("fea") ||
      normalized.startsWith("feb");
  }
  const octets = normalized.split(".").map(Number);

  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) {
    return true;
  }
  const [first, second] = octets as [number, number, number, number];

  return first === 0 || first === 10 || first === 100 && second >= 64 &&
      second <= 127 || first === 169 && second === 254 || first === 172 &&
      second >= 16 && second <= 31 || first === 192 && second === 168 ||
      first >= 224;
}

function parseOrigin(value: string) {
  const url = new URL(value);

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username || url.password || url.pathname !== "/" || url.search ||
    url.hash
  ) {
    throw new Error("Agent private target must be an HTTP(S) origin");
  }
  return url.origin;
}

export class AgentProviderTargetPolicy {
  readonly #allowedPrivateOrigins: ReadonlySet<string>;

  constructor(allowedPrivateOrigins: readonly string[] = []) {
    this.#allowedPrivateOrigins = new Set(allowedPrivateOrigins.map(parseOrigin));
  }

  assertConfiguration(
    endpoint: URL,
    authenticationType: "bearer" | "none",
  ) {
    const loopback = isLoopbackHostname(endpoint.hostname);
    const privateAllowed = this.#allowedPrivateOrigins.has(endpoint.origin);

    if (authenticationType === "none" && !loopback && !privateAllowed) {
      throw new AgentProviderTargetValidationError(
        "auth:none is restricted to loopback or explicitly allowed private providers",
      );
    }
    if (authenticationType === "bearer" && !loopback &&
        endpoint.protocol !== "https:") {
      throw new AgentProviderTargetValidationError(
        "Remote providers with credentials must use HTTPS",
      );
    }
  }

  async assertRequestTarget(endpoint: URL) {
    if (isLoopbackHostname(endpoint.hostname) ||
        this.#allowedPrivateOrigins.has(endpoint.origin)) return;
    if (endpoint.hostname === "metadata.google.internal") {
      throw new AgentProviderTargetValidationError(
        "Provider endpoint is outside the allowed network targets",
      );
    }
    const addresses = isIP(endpoint.hostname)
      ? [endpoint.hostname]
      : (await lookup(endpoint.hostname, { all: true, verbatim: true }))
        .map(({ address }) => address);

    if (addresses.length === 0 || addresses.some(isPrivateOrSpecialAddress)) {
      throw new AgentProviderTargetValidationError(
        "Provider endpoint is outside the allowed network targets",
      );
    }
  }
}

export function parseAgentPrivateTargets(value: string | undefined) {
  return new AgentProviderTargetPolicy(
    value?.split(",").map((candidate) => candidate.trim()).filter(Boolean) ?? [],
  );
}
