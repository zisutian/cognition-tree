// SPDX-License-Identifier: GPL-3.0-or-later

import type { IncomingMessage, ServerResponse } from "node:http";

export type ClientRuntime = {
  closeLongLivedConnections(): Promise<void>;
  dispose(): Promise<void>;
  handle(request: IncomingMessage, response: ServerResponse): Promise<void>;
};
