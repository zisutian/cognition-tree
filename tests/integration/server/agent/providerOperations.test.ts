import { it } from "./fixtures/modelHttp.ts";
import { createServerDataRootWriteScope } from "../../../../infrastructure/server/runtime/index.ts";

import { createServerProviderOperations } from "../../../../infrastructure/server/runtime/providerRuntime.ts";
import { type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, vi } from "vitest";
import { AgentConfigurationStore } from "../../../../infrastructure/server/agent/configurationStore.ts";

import { runtime } from "./fixtures/agentRuntime.ts";
function writeSse(response: ServerResponse, content: string) {
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  response.write(
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
  );
  response.write(
    `data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: "stop" }],
    })}\n\n`,
  );
  response.end("data: [DONE]\n\n");
}

describe("Provider discovery and conformance", () => {
  it("discovers Ollama and verifies the pinned single-json mode explicitly", async ({
    modelHttp,
  }) => {
    let completion = 0;
    const completionBodies: Array<Record<string, unknown>> = [];
    const showBodies: Array<Record<string, unknown>> = [];
    const requests: string[] = [];
    const endpoint = await modelHttp(async (request, response) => {
      requests.push(request.url ?? "");
      if (request.url === "/api/tags") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            models: [{ model: "qwen3:8b" }, { name: "qwen3:8b" }],
          }),
        );
        return;
      }
      if (request.url === "/api/ps") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            models: [{ context_length: 24_576, name: "qwen3:8b" }],
          }),
        );
        return;
      }
      let body = "";

      for await (const chunk of request) body += chunk.toString();
      if (request.url === "/api/show") {
        showBodies.push(JSON.parse(body) as Record<string, unknown>);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            model_info: { "qwen3.context_length": 262_144 },
          }),
        );
        return;
      }
      completionBodies.push(JSON.parse(body) as Record<string, unknown>);
      completion += 1;
      writeSse(
        response,
        completion === 1
          ? JSON.stringify({ arguments: {}, name: "describe_syntax" })
          : completion === 2
            ? JSON.stringify({
                arguments: {
                  body: "- Conformance",
                  parentFolderId: null,
                  title: "Conformance",
                },
                name: "stage_workspace_create_note",
              })
            : "符合性验证完成。",
      );
    });

    const directory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-provider-ops-"),
    );
    const ids = ["ollama", "writer"];
    const store = new AgentConfigurationStore(directory, {
      createId: () => ids.shift()!,
    });
    const operations = createServerProviderOperations({
      writes: createServerDataRootWriteScope(),
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
      const profile = await store.createProfile(configuration.revision, {
        label: "Local writer",
        maxResidentSessions: 1,
        model: "qwen3:8b",
        parameters: {
          historyBudgetCharacters: 32_768,
          kind: "chat",
          maxOutputTokens: 1_024,
          maxToolSteps: 3,
          reasoningEffort: "model-default",
          toolCallMode: "single-json",
        },
        providerId: provider.provider.id,
        timeoutMilliseconds: 5_000,
      });

      expect(await operations.probe(provider.provider.id)).toEqual({
        modelContexts: [
          {
            declaredMaximumContextTokens: 262_144,
            model: "qwen3:8b",
            residentContext: {
              allocatedContextTokens: 24_576,
              status: "loaded",
            },
          },
        ],
        models: ["qwen3:8b"],
        probedAt: "2026-08-25T00:00:00.000Z",
        reachable: true,
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
        "/api/ps",
        "/api/show",
        "/v1/chat/completions",
        "/v1/chat/completions",
        "/v1/chat/completions",
      ]);
      expect(showBodies).toEqual([{ model: "qwen3:8b" }]);
      expect(completionBodies).toHaveLength(3);
      const offered = completionBodies[0]?.tools as Array<{
        function: { name: string; parameters: Record<string, unknown> };
      }>;

      expect(offered.map(({ function: { name } }) => name)).toEqual([
        "list",
        "describe_syntax",
        "stage_workspace_create_note",
      ]);
      expect(offered[2]?.function.parameters).toMatchObject({
        required: ["body", "parentFolderId", "title"],
        type: "object",
      });
      expect(
        completionBodies.every(
          ({ max_tokens: maxTokens }) => maxTokens === 512,
        ),
      ).toBe(true);
    } finally {
      await operations.dispose();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("probes Codex authentication state without fetching provider metadata", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-provider-ops-"),
    );
    const fetchFn = vi.fn();
    const store = new AgentConfigurationStore(directory, {
      createId: () => "codex-probe",
    });
    const operations = createServerProviderOperations({
      writes: createServerDataRootWriteScope(),
      configurationStore: store,
      fetch: fetchFn,
      runtime,
    });

    try {
      const initial = await store.readSnapshot();
      const provider = await store.createProvider(initial.revision, {
        apiKey: "codex-probe-secret",
        authenticationType: "api-key",
        baseUrl: null,
        kind: "codex",
        label: "Codex probe",
        privateNetworkAccessConfirmed: false,
      });

      await expect(operations.probe(provider.provider.id)).resolves.toEqual({
        modelContexts: [],
        models: [],
        probedAt: "2026-08-25T00:00:00.000Z",
        reachable: true,
      });
      expect(fetchFn).not.toHaveBeenCalled();
    } finally {
      await operations.dispose();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("probes OpenAI model ids with the configured Bearer credential", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-provider-ops-"),
    );
    const fetchFn = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ id: "gpt-5" }, { id: "gpt-4.1" }, { id: "gpt-5" }],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
    );
    const store = new AgentConfigurationStore(directory, {
      createId: () => "openai-probe",
    });
    const operations = createServerProviderOperations({
      writes: createServerDataRootWriteScope(),
      configurationStore: store,
      fetch: fetchFn,
      runtime,
    });

    try {
      const initial = await store.readSnapshot();
      const provider = await store.createProvider(initial.revision, {
        apiKey: "openai-probe-secret",
        authenticationType: "api-key",
        baseUrl: "http://127.0.0.1:12345/v1",
        kind: "openai-chat",
        label: "OpenAI-compatible probe",
        privateNetworkAccessConfirmed: false,
      });

      await expect(operations.probe(provider.provider.id)).resolves.toEqual({
        modelContexts: [],
        models: ["gpt-4.1", "gpt-5"],
        probedAt: "2026-08-25T00:00:00.000Z",
        reachable: true,
      });
      expect(fetchFn).toHaveBeenCalledOnce();
      const [requestedUrl, request] = fetchFn.mock.calls[0]!;

      expect(String(requestedUrl)).toBe("http://127.0.0.1:12345/v1/models");
      expect(request).toMatchObject({
        headers: { Authorization: "Bearer openai-probe-secret" },
        method: "GET",
        redirect: "manual",
      });
    } finally {
      await operations.dispose();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects invalid Provider metadata transports", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-provider-ops-"),
    );
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { Location: "https://redirected.example/models" },
          status: 302,
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array(1024 * 1024 + 1), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(Uint8Array.from([0x7b, 0x22, 0xff, 0x22, 0x7d]), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response("{}", {
          headers: { "Content-Type": "text/plain" },
          status: 200,
        }),
      );
    const operations = createServerProviderOperations({
      writes: createServerDataRootWriteScope(),
      configurationStore: new AgentConfigurationStore(directory),
      fetch: fetchFn,
      runtime,
    });

    try {
      await expect(
        operations.discoverOllama("http://127.0.0.1:12345"),
      ).rejects.toThrow("Provider redirects are not allowed");
      await expect(
        operations.discoverOllama("http://127.0.0.1:12345"),
      ).rejects.toThrow("Provider response exceeded the size limit");
      await expect(
        operations.discoverOllama("http://127.0.0.1:12345"),
      ).rejects.toThrow("Provider response is invalid UTF-8");
      await expect(
        operations.discoverOllama("http://127.0.0.1:12345"),
      ).rejects.toThrow("Provider response must use application/json");
      expect(fetchFn).toHaveBeenCalledTimes(4);
    } finally {
      await operations.dispose();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("times out a stalled Provider metadata request", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-provider-ops-"),
    );
    const fetchFn = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;

          if (!signal) {
            reject(
              new Error("Provider request did not include an abort signal"),
            );
            return;
          }
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    const operations = createServerProviderOperations({
      writes: createServerDataRootWriteScope(),
      configurationStore: new AgentConfigurationStore(directory),
      fetch: fetchFn,
      runtime,
    });

    vi.useFakeTimers();
    try {
      const result = expect(
        operations.discoverOllama("http://127.0.0.1:12345"),
      ).rejects.toThrow("Provider request timed out");

      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(5_000);
      await result;
      expect(fetchFn).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
      await operations.dispose();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects metadata discovery before making a request", async () => {
    const fetchFn = vi.fn();
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-provider-ops-"),
    );
    const operations = createServerProviderOperations({
      writes: createServerDataRootWriteScope(),
      configurationStore: new AgentConfigurationStore(directory),
      fetch: fetchFn,
      runtime,
    });

    try {
      await expect(
        operations.discoverOllama("http://169.254.169.254"),
      ).rejects.toThrow("empty, mixed, or forbidden");
      expect(fetchFn).not.toHaveBeenCalled();
    } finally {
      await operations.dispose();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("reports unknown Ollama context facts without changing the profile", async ({
    modelHttp,
  }) => {
    const endpoint = await modelHttp(async (request, response) => {
      if (request.url === "/api/tags") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            models: [
              { name: "configured-model" },
              { name: "not-loaded-model" },
            ],
          }),
        );
        return;
      }
      if (request.url === "/api/ps") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({ models: [{ name: "configured-model" }] }),
        );
        return;
      }
      if (request.url === "/api/show") {
        for await (const _chunk of request) {
          // Drain the request before responding like Ollama.
        }
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ model_info: {} }));
        return;
      }
      response.writeHead(404).end();
    });

    const directory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-provider-ops-"),
    );
    const store = new AgentConfigurationStore(directory);
    const operations = createServerProviderOperations({
      writes: createServerDataRootWriteScope(),
      configurationStore: store,
      runtime,
    });

    try {
      const initial = await store.readSnapshot();
      const provider = await store.createProvider(initial.revision, {
        authenticationType: "none",
        baseUrl: endpoint,
        kind: "ollama",
        label: "Local Ollama",
        privateNetworkAccessConfirmed: false,
      });
      const profile = await store.createProfile(
        provider.configuration.revision,
        {
          label: "Configured model",
          maxResidentSessions: 1,
          model: "configured-model",
          parameters: {
            historyBudgetCharacters: 65_536,
            kind: "chat",
            maxOutputTokens: 1_024,
            maxToolSteps: 8,
            reasoningEffort: "model-default",
            toolCallMode: "single-json",
          },
          providerId: provider.provider.id,
          timeoutMilliseconds: 60_000,
        },
      );
      const notLoadedProfile = await store.createProfile(
        profile.configuration.revision,
        {
          label: "Not loaded model",
          maxResidentSessions: 1,
          model: "not-loaded-model",
          parameters: {
            historyBudgetCharacters: 65_536,
            kind: "chat",
            maxOutputTokens: 1_024,
            maxToolSteps: 8,
            reasoningEffort: "model-default",
            toolCallMode: "single-json",
          },
          providerId: provider.provider.id,
          timeoutMilliseconds: 60_000,
        },
      );

      await expect(operations.probe(provider.provider.id)).resolves.toEqual({
        modelContexts: [
          {
            declaredMaximumContextTokens: null,
            model: "configured-model",
            residentContext: { status: "loaded-unreported" },
          },
          {
            declaredMaximumContextTokens: null,
            model: "not-loaded-model",
            residentContext: { status: "not-loaded" },
          },
        ],
        models: ["configured-model", "not-loaded-model"],
        probedAt: "2026-08-25T00:00:00.000Z",
        reachable: true,
      });
      expect((await store.readSnapshot()).revision).toBe(
        notLoadedProfile.configuration.revision,
      );
    } finally {
      await operations.dispose();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("cancels an active conformance request without recording a result", async ({
    modelHttp,
  }) => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-provider-ops-"),
    );
    let resolveCompletionStarted!: () => void;
    const completionStarted = new Promise<void>((resolve) => {
      resolveCompletionStarted = resolve;
    });
    const endpoint = await modelHttp((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(": waiting\n\n");
      resolveCompletionStarted();
    });

    const ids = ["ollama", "writer"];
    const store = new AgentConfigurationStore(directory, {
      createId: () => ids.shift()!,
    });
    const operations = createServerProviderOperations({
      writes: createServerDataRootWriteScope(),
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
          historyBudgetCharacters: 65_536,
          kind: "chat",
          maxOutputTokens: 2_048,
          maxToolSteps: 8,
          reasoningEffort: "model-default",
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
      expect(operations.hasActiveOperations()).toBe(true);
      expect(operations.cancelConformance(started.id)).toMatchObject({
        status: "cancelled",
      });
      expect(operations.hasActiveOperations()).toBe(true);
      await vi.waitFor(() => {
        expect(operations.getConformance(started.id)?.status).toBe("cancelled");
      });
      expect((await store.readSnapshot()).profiles[0]?.conformance).toBeNull();
      await vi.waitFor(() =>
        expect(operations.hasActiveOperations()).toBe(false),
      );
    } finally {
      await operations.dispose();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("serializes conformance starts for the same profile", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-provider-ops-"),
    );
    const store = new AgentConfigurationStore(directory);
    const operations = createServerProviderOperations({
      writes: createServerDataRootWriteScope(),
      configurationStore: store,
      runtime,
    });

    try {
      const initial = await store.readSnapshot();
      const provider = await store.createProvider(initial.revision, {
        authenticationType: "none",
        baseUrl: "http://127.0.0.1:12345",
        kind: "ollama",
        label: "Local Ollama",
        privateNetworkAccessConfirmed: false,
      });
      const profile = await store.createProfile(
        provider.configuration.revision,
        {
          label: "Local writer",
          maxResidentSessions: 1,
          model: "qwen3.8:27b",
          parameters: {
            historyBudgetCharacters: 65_536,
            kind: "chat",
            maxOutputTokens: 2_048,
            maxToolSteps: 8,
            reasoningEffort: "model-default",
            toolCallMode: "native",
          },
          providerId: provider.provider.id,
          timeoutMilliseconds: 900_000,
        },
      );
      const starts = await Promise.allSettled([
        operations.startConformance(
          profile.configuration.revision,
          profile.profile.id,
        ),
        operations.startConformance(
          profile.configuration.revision,
          profile.profile.id,
        ),
      ]);

      expect(
        starts.filter(({ status }) => status === "fulfilled"),
      ).toHaveLength(1);
      expect(starts.filter(({ status }) => status === "rejected")).toHaveLength(
        1,
      );
      expect(starts.find(({ status }) => status === "rejected")).toMatchObject({
        reason: expect.objectContaining({
          message: "A conformance check is already running for this profile",
        }),
      });
    } finally {
      await operations.dispose();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects every new Provider operation after disposal", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-provider-ops-"),
    );
    const operations = createServerProviderOperations({
      writes: createServerDataRootWriteScope(),
      configurationStore: new AgentConfigurationStore(directory),
      runtime,
    });

    try {
      await operations.dispose();
      const message = "Agent provider operations are closing";

      await expect(
        operations.discoverOllama("http://127.0.0.1:11434"),
      ).rejects.toThrow(message);
      await expect(operations.probe("provider-id")).rejects.toThrow(message);
      await expect(
        operations.startCodexDeviceLogin("revision", "provider-id"),
      ).rejects.toThrow(message);
      await expect(
        operations.startConformance("revision", "profile-id"),
      ).rejects.toThrow(message);
    } finally {
      await operations.dispose();
      await rm(directory, { force: true, recursive: true });
    }
  });
});
