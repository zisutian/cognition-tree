// SPDX-License-Identifier: GPL-3.0-or-later

import { once } from "node:events";
import { createServer, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AgentConfigurationStore } from "../../../../infrastructure/server/agent/configurationStore.ts";
import { AgentProviderOperations } from "../../../../infrastructure/server/agent/providerOperations.ts";
import type { ApiRuntime } from "../../../../infrastructure/server/api/http/runtime.ts";

const runtime: ApiRuntime = {
  createId: () => "00000000-0000-4000-8000-000000000001",
  now: () => new Date("2026-08-25T00:00:00.000Z"),
  timezoneOffsetMinutes: () => 480,
  today: () => "2026-08-25",
};

function writeSse(response: ServerResponse, content: string) {
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  response.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
  response.end("data: [DONE]\n\n");
}

describe("Agent provider operations", () => {
  it("discovers Ollama and verifies the pinned single-json mode explicitly", async () => {
    let completion = 0;
    const completionBodies: Array<Record<string, unknown>> = [];
    const requests: string[] = [];
    const server = createServer(async (request, response) => {
      requests.push(request.url ?? "");
      if (request.url === "/api/tags") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({
          models: [{ model: "qwen3:8b" }, { name: "qwen3:8b" }],
        }));
        return;
      }
      let body = "";

      for await (const chunk of request) body += chunk.toString();
      completionBodies.push(JSON.parse(body) as Record<string, unknown>);
      completion += 1;
      writeSse(
        response,
        completion === 1
          ? JSON.stringify({
              arguments: { ack: true },
              name: "agent_conformance_check",
            })
          : "符合性验证完成。",
      );
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();

    if (!address || typeof address === "string") throw new Error("Missing port");
    const endpoint = `http://127.0.0.1:${address.port}`;
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-provider-ops-"));
    const ids = ["ollama", "writer"];
    const store = new AgentConfigurationStore(directory, {
      createId: () => ids.shift()!,
    });
    const operations = new AgentProviderOperations({
      configurationStore: store,
      runtime,
    });

    try {
      expect(await operations.discoverOllama(endpoint)).toEqual({
        endpoint,
        models: ["qwen3:8b"],
      });
      let configuration = await store.readSnapshot();
      const provider = await store.createProvider(configuration.revision, {
        authenticationType: "none",
        baseUrl: endpoint,
        kind: "ollama",
        label: "Local Ollama",
        privateNetworkAccessConfirmed: false,
      });

      configuration = provider.configuration;
      expect(await operations.probe(provider.provider.id)).toEqual({
        models: ["qwen3:8b"],
        reachable: true,
      });
      const profile = await store.createProfile(configuration.revision, {
        label: "Local writer",
        maxResidentSessions: 1,
        model: "qwen3:8b",
        parameters: {
          contextWindowTokens: 8_192,
          kind: "chat",
          maxOutputTokens: 1_024,
          maxToolSteps: 2,
          toolCallMode: "single-json",
        },
        providerId: provider.provider.id,
        timeoutMilliseconds: 5_000,
      });

      expect(profile.profile.availability).toBe("unavailable");
      const started = await operations.startConformance(
        profile.configuration.revision,
        profile.profile.id,
      );

      expect(started).toMatchObject({
        phase: "calling-tool",
        status: "running",
      });
      await vi.waitFor(() => {
        expect(operations.getConformance(started.id)?.status).toBe("succeeded");
      });
      const verified = await store.readSnapshot();

      expect(verified.profiles[0]).toMatchObject({
        availability: "available",
        conformance: { toolCallMode: "single-json" },
      });
      expect(requests).toEqual([
        "/api/tags",
        "/api/tags",
        "/v1/chat/completions",
        "/v1/chat/completions",
      ]);
      expect(completionBodies).toHaveLength(2);
      expect(completionBodies.every(({ max_tokens: maxTokens }) =>
        maxTokens === 512
      )).toBe(true);
    } finally {
      await operations.dispose();
      server.close();
      await once(server, "close");
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects metadata discovery before making a request", async () => {
    const fetchFn = vi.fn();
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-provider-ops-"));
    const operations = new AgentProviderOperations({
      configurationStore: new AgentConfigurationStore(directory),
      fetch: fetchFn,
      runtime,
    });

    try {
      await expect(operations.discoverOllama("http://169.254.169.254"))
        .rejects.toThrow("empty, mixed, or forbidden");
      expect(fetchFn).not.toHaveBeenCalled();
    } finally {
      await operations.dispose();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("cancels an active conformance request without recording a result", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-provider-ops-"));
    let resolveCompletionStarted!: () => void;
    const completionStarted = new Promise<void>((resolve) => {
      resolveCompletionStarted = resolve;
    });
    const server = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(": waiting\n\n");
      resolveCompletionStarted();
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();

    if (!address || typeof address === "string") throw new Error("Missing port");
    const endpoint = `http://127.0.0.1:${address.port}`;
    const ids = ["ollama", "writer"];
    const store = new AgentConfigurationStore(directory, {
      createId: () => ids.shift()!,
    });
    const operations = new AgentProviderOperations({
      configurationStore: store,
      runtime,
    });

    try {
      let configuration = await store.readSnapshot();
      const provider = await store.createProvider(configuration.revision, {
        authenticationType: "none",
        baseUrl: endpoint,
        kind: "ollama",
        label: "Local Ollama",
        privateNetworkAccessConfirmed: false,
      });
      configuration = provider.configuration;
      const profile = await store.createProfile(configuration.revision, {
        label: "Local writer",
        maxResidentSessions: 1,
        model: "qwen3.8:27b",
        parameters: {
          contextWindowTokens: 16_384,
          kind: "chat",
          maxOutputTokens: 2_048,
          maxToolSteps: 8,
          toolCallMode: "native",
        },
        providerId: provider.provider.id,
        timeoutMilliseconds: 900_000,
      });
      const started = await operations.startConformance(
        profile.configuration.revision,
        profile.profile.id,
      );

      await completionStarted;
      expect(operations.cancelConformance(started.id)).toMatchObject({
        status: "cancelled",
      });
      await vi.waitFor(() => {
        expect(operations.getConformance(started.id)?.status).toBe("cancelled");
      });
      expect((await store.readSnapshot()).profiles[0]?.conformance).toBeNull();
    } finally {
      await operations.dispose();
      server.close();
      await once(server, "close");
      await rm(directory, { force: true, recursive: true });
    }
  });
});
