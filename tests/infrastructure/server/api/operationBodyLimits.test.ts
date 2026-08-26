// SPDX-License-Identifier: GPL-3.0-or-later

import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { apiOperations } from "../../../../contracts/api/registry.ts";
import {
  defaultMaximumBodyBytes,
  readApiJsonBody,
} from "../../../../infrastructure/server/api/http/transport.ts";

function requestWithLength(length: number) {
  return Object.assign(Readable.from([]), {
    headers: {
      "content-length": String(length),
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
});
