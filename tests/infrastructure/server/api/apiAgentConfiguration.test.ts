// SPDX-License-Identifier: GPL-3.0-or-later

import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentConfigurationSnapshot } from "../../../../application/agent/agentConfiguration.ts";
import type { ApiCreatedTokenDto } from "../../../../contracts/api/types.ts";
import { dispatch, withHandler } from "./support/apiServerTestHarness.ts";

describe("Agent configuration admin API", () => {
  it("manages versioned configuration without returning secrets", async () => {
    await withHandler(async (handler, rootDirectory) => {
      const empty = await dispatch<AgentConfigurationSnapshot>(handler, {
        method: "GET",
        url: "/api/v3/admin/agent-configuration",
      });

      expect(empty).toMatchObject({
        body: { profiles: [], providers: [] },
        statusCode: 200,
      });
      const secret = "agent-provider-secret";
      const withProvider = await dispatch<AgentConfigurationSnapshot>(handler, {
        body: {
          baseRevision: empty.body!.revision,
          provider: {
            apiKey: secret,
            authenticationType: "bearer",
            baseUrl: "https://models.example.invalid/v1",
            kind: "openai-chat",
            label: "OpenAI compatible",
            privateNetworkAccessConfirmed: false,
          },
        },
        method: "POST",
        url: "/api/v3/admin/agent-providers",
      });

      expect(withProvider.statusCode).toBe(201);
      expect(withProvider.body?.providers[0]).toMatchObject({
        authenticationStatus: "configured",
        kind: "openai-chat",
      });
      expect(JSON.stringify(withProvider.body)).not.toContain(secret);
      const profile = await dispatch<AgentConfigurationSnapshot>(handler, {
        body: {
          baseRevision: withProvider.body!.revision,
          profile: {
            label: "Writer",
            maxResidentSessions: 2,
            model: "local-model",
            parameters: {
              contextWindowTokens: 8192,
              kind: "chat",
              maxOutputTokens: 1024,
              maxToolSteps: 8,
              toolCallMode: "native",
            },
            providerId: withProvider.body!.providers[0]!.id,
            timeoutMilliseconds: 5000,
          },
        },
        method: "POST",
        url: "/api/v3/admin/agent-profiles",
      });

      expect(profile).toMatchObject({
        body: {
          profiles: [{
            availability: "unavailable",
            unavailableReason: "Tool-call conformance has not been verified",
            version: 1,
          }],
        },
        statusCode: 201,
      });
      const stale = await dispatch<{ code: string }>(handler, {
        body: {
          baseRevision: empty.body!.revision,
          profile: {
            label: "Writer renamed",
            maxResidentSessions: 2,
            model: "local-model",
            parameters: {
              contextWindowTokens: 8192,
              kind: "chat",
              maxOutputTokens: 1024,
              maxToolSteps: 8,
              toolCallMode: "native",
            },
            providerId: withProvider.body!.providers[0]!.id,
            timeoutMilliseconds: 5000,
          },
        },
        method: "PATCH",
        url: `/api/v3/admin/agent-profiles/${profile.body!.profiles[0]!.id}`,
      });

      expect(stale).toMatchObject({
        body: { code: "resource_conflict" },
        statusCode: 409,
      });
      const file = path.join(
        rootDirectory,
        "server-state",
        "agent-config-v1",
        "configuration.json",
      );

      expect((await lstat(path.dirname(file))).mode & 0o777).toBe(0o700);
      expect((await lstat(file)).mode & 0o777).toBe(0o600);
      expect(await readFile(file, "utf8")).toContain(secret);
    });
  });

  it("rejects automation principals", async () => {
    await withHandler(async (handler) => {
      const created = await dispatch<ApiCreatedTokenDto>(handler, {
        body: { name: "reader", repositoryIds: null, scopes: ["journal:read"] },
        method: "POST",
        url: "/api/v3/admin/automation-tokens",
      });
      const response = await dispatch<{ code: string }>(handler, {
        method: "GET",
        token: created.body!.secret,
        url: "/api/v3/admin/agent-configuration",
      });

      expect(response).toMatchObject({
        body: { code: "forbidden" },
        statusCode: 403,
      });
    });
  });
});
