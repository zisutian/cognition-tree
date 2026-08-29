// SPDX-License-Identifier: GPL-3.0-or-later

import { once } from "node:events";
import { createServer, type ServerResponse } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AgentConfigurationStore } from "../../../../infrastructure/server/agent/configurationStore.ts";
import { AgentProviderOperations } from "../../../../infrastructure/server/agent/providerOperations.ts";
import { pinnedCodexVersion } from "../../../../infrastructure/server/agent/codexAppServerClient.ts";
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
  response.write(`data: ${JSON.stringify({
    choices: [{ delta: {}, finish_reason: "stop" }],
  })}\n\n`);
  response.end("data: [DONE]\n\n");
}

async function createFakeCodexProject(completeLogin: boolean) {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ctn-device-codex-"));
  const packageDirectory = path.join(
    projectRoot,
    "node_modules",
    "@openai",
    "codex",
  );
  const fakeAppServer = `
import { writeFileSync } from "node:fs";
import path from "node:path";
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
setInterval(() => undefined, 1000);
let source = "";
const handle = (request) => {
  if (request.method === "initialize") {
    send({ id: request.id, result: { userAgent: "fake-codex" } });
    return;
  }
  if (request.method === "account/login/start") {
    writeFileSync(path.join(process.env.CODEX_HOME, "auth.json"), JSON.stringify({
      inheritedApiKey: process.env.OPENAI_API_KEY ?? null,
      inheritedPersonalSecret: process.env.CTN_TEST_PERSONAL_SECRET ?? null,
      tokens: "managed",
    }), { mode: 0o600 });
    send({ id: request.id, result: {
      loginId: "codex-login-1",
      type: "chatgptDeviceCode",
      userCode: "ABCD-EFGH",
      verificationUrl: "https://auth.openai.com/device",
    } });
    if (${JSON.stringify(completeLogin)}) {
      setTimeout(() => send({ method: "account/login/completed", params: {
        error: null,
        loginId: "codex-login-1",
        success: true,
      } }), 10);
    }
    return;
  }
  if (request.method === "account/login/cancel") {
    send({ id: request.id, result: {} });
  }
};
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  source += chunk;
  while (true) {
    const boundary = source.indexOf("\\n");
    if (boundary < 0) return;
    const line = source.slice(0, boundary);
    source = source.slice(boundary + 1);
    if (line) handle(JSON.parse(line));
  }
});
`;

  await mkdir(path.join(packageDirectory, "bin"), { recursive: true });
  await writeFile(path.join(packageDirectory, "package.json"), JSON.stringify({
    type: "module",
    version: pinnedCodexVersion,
  }));
  await writeFile(
    path.join(packageDirectory, "bin", "codex.js"),
    fakeAppServer,
    { mode: 0o700 },
  );
  return projectRoot;
}

describe("Agent provider operations", () => {
  it("completes and cancels isolated Codex device-code logins", async () => {
    const completedProject = await createFakeCodexProject(true);
    const cancelledProject = await createFakeCodexProject(false);
    const expiredProject = await createFakeCodexProject(false);
    const completedDirectory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-provider-device-completed-"),
    );
    const cancelledDirectory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-provider-device-cancelled-"),
    );
    const expiredDirectory = await mkdtemp(
      path.join(os.tmpdir(), "ctn-provider-device-expired-"),
    );
    const completedStore = new AgentConfigurationStore(completedDirectory, {
      createId: () => "codex-completed",
    });
    const cancelledStore = new AgentConfigurationStore(cancelledDirectory, {
      createId: () => "codex-cancelled",
    });
    const expiredStore = new AgentConfigurationStore(expiredDirectory, {
      createId: () => "codex-expired",
    });
    const completedOperations = new AgentProviderOperations({
      configurationStore: completedStore,
      projectRoot: completedProject,
      runtime,
    });
    const cancelledOperations = new AgentProviderOperations({
      configurationStore: cancelledStore,
      projectRoot: cancelledProject,
      runtime,
    });
    const expiredOperations = new AgentProviderOperations({
      codexDeviceLoginTtlMilliseconds: 10,
      configurationStore: expiredStore,
      projectRoot: expiredProject,
      runtime,
    });
    process.env.OPENAI_API_KEY = "must-not-enter-device-login";
    process.env.CTN_TEST_PERSONAL_SECRET = "must-not-enter-device-login";

    try {
      const completedInitial = await completedStore.readSnapshot();
      const completedProvider = await completedStore.createProvider(
        completedInitial.revision,
        {
          authenticationType: "chatgpt-device-code",
          baseUrl: null,
          kind: "codex",
          label: "ChatGPT Codex",
          privateNetworkAccessConfirmed: false,
        },
      );
      const started = await completedOperations.startCodexDeviceLogin(
        completedProvider.configuration.revision,
        completedProvider.provider.id,
      );

      expect(started).toMatchObject({
        status: "pending",
        userCode: "ABCD-EFGH",
        verificationUrl: "https://auth.openai.com/device",
      });
      await vi.waitFor(() => {
        expect(completedOperations.getCodexDeviceLogin(started.id)?.status)
          .toBe("succeeded");
      });
      const resolved = await completedStore.resolveProvider(
        completedProvider.provider.id,
      );

      expect(resolved).toMatchObject({
        apiKey: null,
        provider: {
          authenticationStatus: "configured",
          authenticationType: "chatgpt-device-code",
        },
      });
      const auth = JSON.parse(await readFile(
        path.join(resolved!.codexHome!, "auth.json"),
        "utf8",
      ));

      expect(auth).toMatchObject({
        inheritedApiKey: null,
        inheritedPersonalSecret: null,
      });

      const cancelledInitial = await cancelledStore.readSnapshot();
      const cancelledProvider = await cancelledStore.createProvider(
        cancelledInitial.revision,
        {
          authenticationType: "chatgpt-device-code",
          baseUrl: null,
          kind: "codex",
          label: "Cancelled Codex",
          privateNetworkAccessConfirmed: false,
        },
      );
      const cancelling = await cancelledOperations.startCodexDeviceLogin(
        cancelledProvider.configuration.revision,
        cancelledProvider.provider.id,
      );

      expect(cancelledOperations.hasPendingCodexLogin(
        cancelledProvider.provider.id,
      )).toBe(true);
      await expect(cancelledOperations.startCodexDeviceLogin(
        cancelledProvider.configuration.revision,
        cancelledProvider.provider.id,
      )).rejects.toThrow("already pending");
      await expect(cancelledOperations.cancelCodexDeviceLogin(cancelling.id))
        .resolves.toMatchObject({ status: "cancelled" });
      await expect(cancelledStore.resolveProvider(cancelledProvider.provider.id))
        .resolves.toMatchObject({
          codexHome: null,
          provider: { authenticationStatus: "missing" },
        });

      const expiredInitial = await expiredStore.readSnapshot();
      const expiredProvider = await expiredStore.createProvider(
        expiredInitial.revision,
        {
          authenticationType: "chatgpt-device-code",
          baseUrl: null,
          kind: "codex",
          label: "Expired Codex",
          privateNetworkAccessConfirmed: false,
        },
      );
      const expiring = await expiredOperations.startCodexDeviceLogin(
        expiredProvider.configuration.revision,
        expiredProvider.provider.id,
      );

      await vi.waitFor(() => {
        expect(expiredOperations.getCodexDeviceLogin(expiring.id)?.status)
          .toBe("expired");
      });
      await expect(expiredStore.resolveProvider(expiredProvider.provider.id))
        .resolves.toMatchObject({
          codexHome: null,
          provider: { authenticationStatus: "missing" },
        });
    } finally {
      delete process.env.OPENAI_API_KEY;
      delete process.env.CTN_TEST_PERSONAL_SECRET;
      await Promise.all([
        completedOperations.dispose(),
        cancelledOperations.dispose(),
        expiredOperations.dispose(),
      ]);
      await Promise.all([
        rm(completedProject, { force: true, recursive: true }),
        rm(cancelledProject, { force: true, recursive: true }),
        rm(expiredProject, { force: true, recursive: true }),
        rm(completedDirectory, { force: true, recursive: true }),
        rm(cancelledDirectory, { force: true, recursive: true }),
        rm(expiredDirectory, { force: true, recursive: true }),
      ]);
    }
  });

  it("discovers Ollama and verifies the pinned single-json mode explicitly", async () => {
    let completion = 0;
    const completionBodies: Array<Record<string, unknown>> = [];
    const showBodies: Array<Record<string, unknown>> = [];
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
      if (request.url === "/api/ps") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({
          models: [{ context_length: 24_576, name: "qwen3:8b" }],
        }));
        return;
      }
      let body = "";

      for await (const chunk of request) body += chunk.toString();
      if (request.url === "/api/show") {
        showBodies.push(JSON.parse(body) as Record<string, unknown>);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({
          model_info: { "qwen3.context_length": 262_144 },
        }));
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
        modelContexts: [{
          declaredMaximumContextTokens: 262_144,
          model: "qwen3:8b",
          residentContext: {
            allocatedContextTokens: 24_576,
            status: "loaded",
          },
        }],
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

  it("probes Codex authentication state without fetching provider metadata", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-provider-ops-"));
    const fetchFn = vi.fn();
    const store = new AgentConfigurationStore(directory, {
      createId: () => "codex-probe",
    });
    const operations = new AgentProviderOperations({
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
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-provider-ops-"));
    const fetchFn = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({
        data: [{ id: "gpt-5" }, { id: "gpt-4.1" }, { id: "gpt-5" }],
      }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })
    );
    const store = new AgentConfigurationStore(directory, {
      createId: () => "openai-probe",
    });
    const operations = new AgentProviderOperations({
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

  it("rejects redirected and oversized Provider metadata responses", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-provider-ops-"));
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, {
        headers: { Location: "https://redirected.example/models" },
        status: 302,
      }))
      .mockResolvedValueOnce(new Response(
        new Uint8Array(1024 * 1024 + 1),
        { status: 200 },
      ));
    const operations = new AgentProviderOperations({
      configurationStore: new AgentConfigurationStore(directory),
      fetch: fetchFn,
      runtime,
    });

    try {
      await expect(operations.discoverOllama("http://127.0.0.1:12345"))
        .rejects.toThrow("Provider redirects are not allowed");
      await expect(operations.discoverOllama("http://127.0.0.1:12345"))
        .rejects.toThrow("Provider response exceeded the size limit");
      expect(fetchFn).toHaveBeenCalledTimes(2);
    } finally {
      await operations.dispose();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("times out a stalled Provider metadata request", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-provider-ops-"));
    const fetchFn = vi.fn<typeof fetch>((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;

        if (!signal) {
          reject(new Error("Provider request did not include an abort signal"));
          return;
        }
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      })
    );
    const operations = new AgentProviderOperations({
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

  it("reports unknown Ollama context facts without changing the profile", async () => {
    const server = createServer(async (request, response) => {
      if (request.url === "/api/tags") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({
          models: [
            { name: "configured-model" },
            { name: "not-loaded-model" },
          ],
        }));
        return;
      }
      if (request.url === "/api/ps") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ models: [{ name: "configured-model" }] }));
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

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();

    if (!address || typeof address === "string") throw new Error("Missing port");
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-provider-ops-"));
    const store = new AgentConfigurationStore(directory);
    const operations = new AgentProviderOperations({
      configurationStore: store,
      runtime,
    });

    try {
      const initial = await store.readSnapshot();
      const provider = await store.createProvider(initial.revision, {
        authenticationType: "none",
        baseUrl: `http://127.0.0.1:${address.port}`,
        kind: "ollama",
        label: "Local Ollama",
        privateNetworkAccessConfirmed: false,
      });
      const profile = await store.createProfile(provider.configuration.revision, {
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
      });
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
      server.close();
      await once(server, "close");
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
