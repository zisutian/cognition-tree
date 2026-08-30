// SPDX-License-Identifier: GPL-3.0-or-later

import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { apiOperations } from "../../../../contracts/api/registry.ts";
import {
  defaultMaximumBodyBytes,
  readApiJsonBody,
} from "../../../../infrastructure/server/api/http/transport.ts";
import type {
  ApiRequestAbortedError,
} from "../../../../infrastructure/server/api/http/transport.ts";

function requestWithLength(length: number) {
  return Object.assign(Readable.from([]), {
    headers: {
      "content-length": String(length),
      "content-type": "application/json",
    },
  }) as IncomingMessage;
}

function requestWithBody(body: Buffer) {
  return Object.assign(Readable.from([body]), {
    headers: {
      "content-length": String(body.length),
      "content-type": "application/json",
    },
  }) as IncomingMessage;
}

describe("operation-specific API body limits", () => {
  it("expands only the three sync PUT operations", () => {
    const expanded = apiOperations.filter(({ maximumBodyBytes }) =>
      maximumBodyBytes !== undefined
    );

    expect(expanded.map(({ method, operationId, maximumBodyBytes }) => ({
      maximumBodyBytes,
      method,
      operationId,
    }))).toEqual([
      {
        maximumBodyBytes: 42 * 1024 * 1024,
        method: "PUT",
        operationId: "putWorkspaceSyncSnapshot",
      },
      {
        maximumBodyBytes: 42 * 1024 * 1024,
        method: "PUT",
        operationId: "putJournalSyncSnapshot",
      },
      {
        maximumBodyBytes: 42 * 1024 * 1024,
        method: "PUT",
        operationId: "putTodoSyncSnapshot",
      },
    ]);
  });

  it("uses the selected operation limit for both declared and streamed bodies", async () => {
    const length = defaultMaximumBodyBytes + 1;

    await expect(readApiJsonBody(requestWithLength(length))).rejects.toMatchObject({
      statusCode: 413,
    });
    await expect(readApiJsonBody(requestWithLength(length), 42 * 1024 * 1024))
      .rejects.toMatchObject({
        message: "Request body is empty",
        statusCode: 400,
      });
  });

  it("rejects invalid UTF-8 instead of replacing bytes inside valid JSON", async () => {
    const body = Buffer.from([
      0x7b,
      0x22,
      0x76,
      0x61,
      0x6c,
      0x75,
      0x65,
      0x22,
      0x3a,
      0x22,
      0xff,
      0x22,
      0x7d,
    ]);

    await expect(readApiJsonBody(requestWithBody(body))).rejects.toMatchObject({
      message: "Request body is invalid UTF-8",
      statusCode: 400,
    });
  });

  it("classifies an aborted upload separately from API response errors", async () => {
    const streamFailure = new Error("socket closed while uploading");
    const request = Object.assign(Readable.from((async function* () {
      throw streamFailure;
    })()), {
      aborted: true,
      headers: { "content-type": "application/json" },
    }) as IncomingMessage;

    await expect(readApiJsonBody(request)).rejects.toMatchObject({
      cause: streamFailure,
      name: "ApiRequestAbortedError",
    } satisfies Partial<ApiRequestAbortedError>);
  });
});
