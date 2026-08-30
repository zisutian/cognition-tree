// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import type { WorkspaceRepositoryCatalog } from "../../../../infrastructure/server/repository/catalog.ts";
import {
  createApiServer,
} from "../../../../infrastructure/server/api/http/server.ts";

const unusedCatalogOperation = async (): Promise<never> => {
  throw new Error("Catalog must not be used by this test");
};

const catalog = {
  createRepository: unusedCatalogOperation,
  deleteRepository: unusedCatalogOperation,
  getStore: unusedCatalogOperation,
  listRepositories: unusedCatalogOperation,
  renameRepository: unusedCatalogOperation,
} satisfies WorkspaceRepositoryCatalog;

describe("API server", () => {
  it("contains a rejected API handler for an invalid request target", async () => {
    const server = createApiServer({
      catalog,
      logger: {
        error: () => {
          throw new Error("Injected logging failure");
        },
      },
      security: {
        allowedHosts: ["127.0.0.1"],
        allowedOrigins: [],
        ownerSessions: {
          createOwnerSessionForSecret: async () => null,
          verifyOwnerSession: async () => false,
        },
        publicOrigin: null,
      },
    });
    const request = Object.assign(Readable.from([]), {
      headers: { host: "127.0.0.1" },
      method: "GET",
      socket: { remoteAddress: "127.0.0.1" },
      url: "http://[",
    }) as IncomingMessage;
    let body = "";
    let headersSent = false;
    let statusCode = 0;
    let resolveEnded!: () => void;
    const ended = new Promise<void>((resolve) => {
      resolveEnded = resolve;
    });
    const response = {
      destroy: () => {
        throw new Error("Response must not be destroyed");
      },
      end: (chunk = "") => {
        body += chunk.toString();
        resolveEnded();
      },
      get headersSent() {
        return headersSent;
      },
      writeHead: (nextStatusCode: number, _headers: OutgoingHttpHeaders) => {
        headersSent = true;
        statusCode = nextStatusCode;
      },
    } as unknown as ServerResponse;

    server.emit("request", request, response);
    await ended;

    expect(statusCode).toBe(500);
    expect(body).toBe("Internal server error");
  });
});
