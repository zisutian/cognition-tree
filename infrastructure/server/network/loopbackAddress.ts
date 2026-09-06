// SPDX-License-Identifier: GPL-3.0-or-later

import { classifyNetworkAddress, normalizeNetworkHost } from "./networkAddress.ts";

export function isLoopbackAddress(value: string | undefined) {
  const host = normalizeNetworkHost(value ?? "");
  return host === "localhost" || classifyNetworkAddress(host) === "loopback";
}
