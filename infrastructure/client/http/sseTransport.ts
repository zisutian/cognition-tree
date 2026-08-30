// SPDX-License-Identifier: GPL-3.0-or-later

export const maximumHttpSseFrameCharacters = 1_000_000;

export async function* readHttpSseData(response: Response) {
  if (!response.body) throw new Error("SSE response has no body");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const reader = response.body.getReader();
  let buffer = "";
  let pendingCarriageReturn = false;
  let reachedEnd = false;

  const appendDecoded = (decoded: string, final: boolean) => {
    let source = pendingCarriageReturn ? `\r${decoded}` : decoded;

    pendingCarriageReturn = false;
    if (!final && source.endsWith("\r")) {
      pendingCarriageReturn = true;
      source = source.slice(0, -1);
    }
    buffer += source.replace(/\r\n|\r/g, "\n");
  };
  const takeFrame = () => {
    const boundary = buffer.indexOf("\n\n");

    if (boundary < 0) {
      if (buffer.length > maximumHttpSseFrameCharacters) {
        throw new Error("SSE frame exceeds the transport limit");
      }
      return null;
    }
    if (boundary > maximumHttpSseFrameCharacters) {
      throw new Error("SSE frame exceeds the transport limit");
    }
    const frame = buffer.slice(0, boundary);

    buffer = buffer.slice(boundary + 2);
    return frame;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        reachedEnd = true;
        appendDecoded(decoder.decode(), true);
      } else {
        appendDecoded(decoder.decode(value, { stream: true }), false);
      }
      while (true) {
        const frame = takeFrame();

        if (frame === null) break;
        const data = frame.split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /, ""))
          .join("\n");

        if (data) yield data;
      }
      if (!done) continue;
      if (buffer.length > 0) {
        throw new Error("SSE response ended with an incomplete frame");
      }
      break;
    }
  } finally {
    if (!reachedEnd) {
      try {
        await reader.cancel();
      } catch {
        // The original stream result remains authoritative.
      }
    }
    reader.releaseLock();
  }
}
