// SPDX-License-Identifier: GPL-3.0-or-later

import { isIP } from "node:net";

export function isLoopbackAddress(value: string | undefined) {
  const hostname = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");

  if (hostname === "localhost" || hostname === "::1") return true;
  if (isIP(hostname) === 4) return hostname.startsWith("127.");
  if (hostname.startsWith("::ffff:")) {
    const mappedIpv4 = hostname.slice("::ffff:".length);

    return isIP(mappedIpv4) === 4 && mappedIpv4.startsWith("127.");
  }
  return false;
}
