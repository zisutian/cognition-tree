// SPDX-License-Identifier: GPL-3.0-or-later

import type { IncomingMessage } from "node:http";
import { isLoopbackAddress } from "./loopbackAddress.ts";

export function isLocalRecoveryRequest(request: IncomingMessage) {
  if (!isLoopbackAddress(request.socket.remoteAddress) || !request.headers.host) return false;
  try {
    const host = new URL(`http://${request.headers.host}`);
    if (host.username || host.password || host.pathname !== "/" || host.search || host.hash || !isLoopbackAddress(host.hostname)) return false;
    return request.headers.origin === undefined || request.headers.origin === host.origin;
  } catch { return false; }
}
