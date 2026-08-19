// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  HttpApiResponseError,
  HttpApiUnavailableError,
  requestApiJson,
  resolveApiUrl,
} from "../../../../infrastructure/client/http/apiTransport";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("HTTP API transport", () => {
  it("resolves API endpoints without repository-specific path semantics", () => {
    expect(resolveApiUrl("https://api.test/base", "/api/v1/events"))
      .toBe("https://api.test/base/api/v1/events");
  });

  it("preserves structured API failure facts in a neutral response error", async () => {
    const request = requestApiJson(
      async () => jsonResponse({
        code: "resource_conflict",
        details: { currentRevision: `sha256:${"a".repeat(64)}` },
        message: "content changed",
        requestId: "request-1",
      }, 409),
      "https://api.test",
      "/api/v1/resource",
    );

    await expect(request).rejects.toEqual(
      expect.objectContaining<Partial<HttpApiResponseError>>({
        apiCode: "resource_conflict",
        details: {
          currentRevision: `sha256:${"a".repeat(64)}`,
        },
        retryable: false,
        statusCode: 409,
      }),
    );
  });

  it("classifies network failure without inventing repository errors", async () => {
    await expect(requestApiJson(
      async () => {
        throw new TypeError("network unavailable");
      },
      "https://api.test",
      "/api/v1/resource",
    )).rejects.toBeInstanceOf(HttpApiUnavailableError);
  });
});
