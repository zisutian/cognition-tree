// SPDX-License-Identifier: GPL-3.0-or-later

import type { ServerResponse } from "node:http";

function destroyResponse(response: ServerResponse) {
  if (response.destroyed) return;
  try {
    response.destroy();
  } catch {
    // Connection cleanup is best-effort and must not escape event publication.
  }
}

export function writeServerSentEvent(
  response: ServerResponse,
  payload: string,
) {
  if (response.destroyed || response.writableEnded) return false;
  try {
    if (response.write(payload)) {
      return !response.destroyed && !response.writableEnded;
    }
  } catch {
    // A failed client connection cannot own the publisher's outcome.
  }
  destroyResponse(response);
  return false;
}

export function endServerSentEventResponse(response: ServerResponse) {
  if (response.destroyed || response.writableEnded) return;
  try {
    response.end();
  } catch {
    destroyResponse(response);
  }
}
