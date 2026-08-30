// SPDX-License-Identifier: GPL-3.0-or-later

import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  maximumRecoveryRequestBodyBytes,
  parseRecoveryRequestBody,
  readRecoveryRequestDataRoot,
  type RecoveryRequestAbortedError,
} from "../../../../infrastructure/server/system/recoveryRequest.ts";

function requestWithBody(
  body: Buffer | string,
  contentType = "application/json",
) {
  const content = Buffer.isBuffer(body) ? body : Buffer.from(body);

  return Object.assign(Readable.from([content]), {
    aborted: false,
    headers: {
      "content-length": String(content.length),
      "content-type": contentType,
    },
  }) as IncomingMessage;
}

describe("bootstrap recovery request", () => {
  it("accepts only the exact recovery input shape", () => {
    expect(parseRecoveryRequestBody({ dataRoot: null })).toBeNull();
    expect(parseRecoveryRequestBody({ dataRoot: "/srv/cognition-tree" }))
      .toBe("/srv/cognition-tree");
    for (const value of [
      null,
      [],
      {},
      { dataRoot: 1 },
      { dataRoot: null, extra: true },
    ]) {
      expect(() => parseRecoveryRequestBody(value)).toThrow(
        "Recovery request is invalid",
      );
    }
  });

  it("maps transport failures without decoding replacement characters", async () => {
    await expect(readRecoveryRequestDataRoot(
      requestWithBody(Buffer.from([0xff])),
    )).rejects.toMatchObject({ statusCode: 400 });
    await expect(readRecoveryRequestDataRoot(
      requestWithBody("{}", "text/plain"),
    )).rejects.toMatchObject({ statusCode: 415 });
    const declaredOversized = requestWithBody("{}");

    declaredOversized.headers["content-length"] = String(
      maximumRecoveryRequestBodyBytes + 1,
    );
    await expect(readRecoveryRequestDataRoot(declaredOversized))
      .rejects.toMatchObject({ statusCode: 413 });
  });

  it("preserves an aborted request as a transport terminal state", async () => {
    const failure = new Error("socket closed");
    const request = Object.assign(Readable.from((async function* () {
      throw failure;
    })()), {
      aborted: true,
      headers: { "content-type": "application/json" },
    }) as IncomingMessage;

    await expect(readRecoveryRequestDataRoot(request)).rejects.toMatchObject({
      cause: failure,
      name: "RecoveryRequestAbortedError",
    } satisfies Partial<RecoveryRequestAbortedError>);
  });
});
