// SPDX-License-Identifier: GPL-3.0-or-later

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class AgentProviderTargetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentProviderTargetValidationError";
  }
}

type AddressKind = "forbidden" | "loopback" | "private" | "public";

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase();

  return normalized === "localhost" || normalized === "::1" ||
    /^127(?:\.[0-9]{1,3}){3}$/.test(normalized);
}

function addressKind(address: string): AddressKind {
  const normalized = address.toLowerCase();

  if (normalized.startsWith("::ffff:")) {
    return addressKind(normalized.slice("::ffff:".length));
  }
  if (normalized === "::1") return "loopback";
  if (normalized.includes(":")) {
    if (normalized === "::" || normalized.startsWith("fe8") ||
        normalized.startsWith("fe9") || normalized.startsWith("fea") ||
        normalized.startsWith("feb") || normalized.startsWith("ff")) {
      return "forbidden";
    }
    return normalized.startsWith("fc") || normalized.startsWith("fd")
      ? "private"
      : "public";
  }
  const octets = normalized.split(".").map(Number);

  if (octets.length !== 4 || octets.some((value) =>
    !Number.isInteger(value) || value < 0 || value > 255
  )) return "forbidden";
  const [first, second] = octets as [number, number, number, number];

  if (first === 127) return "loopback";
  if (first === 0 || first === 169 && second === 254 || first >= 224) {
    return "forbidden";
  }
  if (first === 10 || first === 100 && second >= 64 && second <= 127 ||
      first === 172 && second >= 16 && second <= 31 ||
      first === 192 && second === 168) return "private";
  return "public";
}

function parseOrigin(value: string) {
  const url = new URL(value);

  if ((url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Agent private target must be an HTTP(S) origin");
  }
  return url.origin;
}

export class AgentProviderTargetPolicy {
  readonly #resolveAddresses: (hostname: string) => Promise<readonly string[]>;

  constructor({
    resolveAddresses = async (hostname: string) =>
      (await lookup(hostname, { all: true, verbatim: true }))
        .map(({ address }) => address),
  }: {
    resolveAddresses?: (hostname: string) => Promise<readonly string[]>;
  } = {}) {
    this.#resolveAddresses = resolveAddresses;
  }

  configurationPermission(
    endpoint: URL,
    authenticationType: "api-key" | "chatgpt-device-code" | "none",
    confirmed: boolean,
  ) {
    if (endpoint.hostname === "metadata.google.internal") {
      throw new AgentProviderTargetValidationError(
        "Provider endpoint is a forbidden metadata target",
      );
    }
    const literalKind = isIP(endpoint.hostname)
      ? addressKind(endpoint.hostname)
      : null;

    if (literalKind === "forbidden") {
      throw new AgentProviderTargetValidationError(
        "Provider endpoint is outside the allowed network targets",
      );
    }
    const loopback = isLoopbackHostname(endpoint.hostname);

    if (authenticationType !== "none" && !loopback &&
        endpoint.protocol !== "https:") {
      throw new AgentProviderTargetValidationError(
        "Remote providers with credentials must use HTTPS",
      );
    }
    if ((literalKind === "private" || authenticationType === "none" && !loopback) &&
        !confirmed) {
      throw new AgentProviderTargetValidationError(
        "Non-loopback private providers require explicit confirmation",
      );
    }
    return confirmed && !loopback ? parseOrigin(endpoint.origin) : null;
  }

  async assertRequestTarget(
    endpoint: URL,
    permittedPrivateOrigin: string | null,
  ) {
    if (isLoopbackHostname(endpoint.hostname)) return;
    if (endpoint.hostname === "metadata.google.internal") {
      throw new AgentProviderTargetValidationError(
        "Provider endpoint is outside the allowed network targets",
      );
    }
    const addresses = isIP(endpoint.hostname)
      ? [endpoint.hostname]
      : await this.#resolveAddresses(endpoint.hostname);
    const kinds = new Set(addresses.map(addressKind));

    if (addresses.length === 0 || kinds.has("forbidden") || kinds.size !== 1) {
      throw new AgentProviderTargetValidationError(
        "Provider DNS target is empty, mixed, or forbidden",
      );
    }
    const kind = [...kinds][0];

    if (kind === "public") return;
    if (kind === "private" && permittedPrivateOrigin === endpoint.origin) return;
    throw new AgentProviderTargetValidationError(
      "Provider private target has not been confirmed for this provider version",
    );
  }
}
