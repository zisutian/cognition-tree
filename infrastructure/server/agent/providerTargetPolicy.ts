// SPDX-License-Identifier: GPL-3.0-or-later

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { classifyNetworkAddress, normalizeNetworkHost } from "../network/networkAddress.ts";
import { isLoopbackAddress } from "../network/loopbackAddress.ts";

export class AgentProviderTargetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentProviderTargetValidationError";
  }
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
    const hostname = normalizeNetworkHost(endpoint.hostname);
    if (hostname === "metadata.google.internal") {
      throw new AgentProviderTargetValidationError(
        "Provider endpoint is a forbidden metadata target",
      );
    }
    const literalKind = isIP(hostname)
      ? classifyNetworkAddress(hostname)
      : null;

    if (literalKind === "forbidden") {
      throw new AgentProviderTargetValidationError(
        "Provider endpoint is outside the allowed network targets",
      );
    }
    const loopback = isLoopbackAddress(hostname);

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
    const hostname = normalizeNetworkHost(endpoint.hostname);
    if (isLoopbackAddress(hostname)) return;
    if (hostname === "metadata.google.internal") {
      throw new AgentProviderTargetValidationError(
        "Provider endpoint is outside the allowed network targets",
      );
    }
    const addresses = isIP(hostname)
      ? [hostname]
      : await this.#resolveAddresses(hostname);
    const kinds = new Set(addresses.map(classifyNetworkAddress));

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
