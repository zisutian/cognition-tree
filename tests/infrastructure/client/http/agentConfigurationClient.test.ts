// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { createHttpAgentConfigurationClient } from "../../../../infrastructure/client/http/agentConfigurationClient.ts";

const revision = `sha256:${"a".repeat(64)}`;
const status = {
  completedAt: null,
  errorMessage: null,
  id: "check-1",
  phase: "calling-tool",
  profileId: "profile-1",
  startedAt: "2026-08-25T00:00:00.000Z",
  status: "running",
} as const;

describe("HTTP Agent configuration client", () => {
  it("starts, polls, and cancels conformance through short v3 requests", async () => {
    const requests: Array<{ method: string; url: string }> = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ method: init?.method ?? "GET", url: String(input) });
      return Response.json(status, {
        status: init?.method === "POST" ? 202 : 200,
      });
    });
    const client = createHttpAgentConfigurationClient({
      baseUrl: "https://ctn.example",
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(client.startConformance(revision, "profile-1"))
      .resolves.toEqual(status);
    await expect(client.getConformance("check-1")).resolves.toEqual(status);
    await expect(client.cancelConformance("check-1")).resolves.toEqual(status);
    expect(requests).toEqual([
      {
        method: "POST",
        url: "https://ctn.example/api/v4/admin/agent-profiles/profile-1/conformance-checks",
      },
      {
        method: "GET",
        url: "https://ctn.example/api/v4/admin/agent-conformance-checks/check-1",
      },
      {
        method: "DELETE",
        url: "https://ctn.example/api/v4/admin/agent-conformance-checks/check-1",
      },
    ]);
  });
});
