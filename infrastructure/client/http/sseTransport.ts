// SPDX-License-Identifier: GPL-3.0-or-later

import { readSseFrames, SseFrameError } from "../../sse/index.ts";

export const maximumHttpSseFrameCharacters = 1_000_000;

export async function* readHttpSseData(response: Response) {
  if (!response.body) throw new Error("SSE response has no body");
  try {
    for await (const frame of readSseFrames(response.body, maximumHttpSseFrameCharacters)) {
      const data = frame.split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n");
      if (data) yield data;
    }
  } catch (error) {
    if (error instanceof SseFrameError) {
      if (error.code === "invalid_utf8") throw error.cause;
      if (error.code === "oversized_frame") {
        throw new Error("SSE frame exceeds the transport limit");
      }
      throw new Error("SSE response ended with an incomplete frame");
    }
    throw error;
  }
}
