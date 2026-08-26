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
    expect(resolveApiUrl("https://api.test/base", "/api/v3/content/events"))
      .toBe("https://api.test/base/api/v3/content/events");
  });

  it("preserves structured API failure facts in a neutral response error", async () => {
    const request = requestApiJson(
      async () => jsonResponse({
        code: "resource_conflict",
        details: { currentRevision: `sha256:${"a".repeat(64)}` },
        message: "content changed",
        requestId: "request-1",
        retryable: true,
      }, 409),
      "https://api.test",
      "/api/v3/content/resource",
    );

    await expect(request).rejects.toEqual(
      expect.objectContaining<Partial<HttpApiResponseError>>({
        apiCode: "resource_conflict",
        details: {
          currentRevision: `sha256:${"a".repeat(64)}`,
        },
        retryable: true,
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
      "/api/v3/content/resource",
    )).rejects.toBeInstanceOf(HttpApiUnavailableError);
  });
});
