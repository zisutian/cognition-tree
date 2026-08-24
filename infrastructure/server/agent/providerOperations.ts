// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentRuntimeTool } from "../../../application/agent/agentRuntimePort.ts";
import { Type } from "@sinclair/typebox";
import type { ApiRuntime } from "../api/http/runtime.ts";
import { readApiRuntimeNow } from "../api/http/runtime.ts";
import {
  AgentConfigurationStore,
  AgentConfigurationValidationError,
} from "./configurationStore.ts";
import { OllamaRuntime } from "./ollamaRuntime.ts";
import { OpenAiChatRuntime } from "./openAiChatRuntime.ts";
import { createAgentRuntimeProfile } from "./runtimeProfiles.ts";
import { AgentProviderTargetPolicy } from "./providerTargetPolicy.ts";

const responseByteLimit = 1024 * 1024;
const probeTimeoutMilliseconds = 5_000;

function validatedEndpoint(value: string) {
  let endpoint: URL;

  try {
    endpoint = new URL(value);
  } catch {
    throw new AgentConfigurationValidationError(
      "Provider endpoint must be an absolute HTTP(S) URL",
    );
  }
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
    throw new AgentConfigurationValidationError(
      "Provider endpoint must use HTTP or HTTPS",
    );
  }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new AgentConfigurationValidationError(
      "Provider endpoint cannot contain credentials, query, or fragment",
    );
  }
  return endpoint;
}

async function readLimitedJson(response: Response) {
  if (!response.body) {
    throw new Error("Provider response has no body");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;
    length += value.byteLength;
    if (length > responseByteLimit) {
      await reader.cancel();
      throw new Error("Provider response exceeded the size limit");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body)) as unknown;
}

async function requestJson(
  url: URL,
  { apiKey, fetch: fetchFn }: { apiKey: string | null; fetch: typeof fetch },
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Provider request timed out")),
    probeTimeoutMilliseconds,
  );

  timeout.unref();
  try {
    const response = await fetchFn(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      redirect: "manual",
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      throw new Error("Provider redirects are not allowed");
    }
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
    return await readLimitedJson(response);
  } finally {
    clearTimeout(timeout);
  }
}

function parseModels(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Provider model response is invalid");
  }
  const record = value as Record<string, unknown>;
  const models = Array.isArray(record.models) ? record.models : record.data;

  if (!Array.isArray(models)) throw new Error("Provider model list is invalid");
  return [...new Set(models.flatMap((candidate) => {
    if (typeof candidate === "string" && candidate) return [candidate];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return [];
    }
    const record = candidate as Record<string, unknown>;
    const model = typeof record.model === "string"
      ? record.model
      : typeof record.name === "string"
        ? record.name
        : typeof record.id === "string"
          ? record.id
        : null;

    return model ? [model] : [];
  }))].sort();
}

const conformanceTool: AgentRuntimeTool = {
  description: "Verify that this model can call the offered host tool.",
  inputSchema: Type.Object({ ack: Type.Literal(true) }, {
    additionalProperties: false,
  }),
  name: "agent_conformance_check",
};

export class AgentProviderOperations {
  readonly #configurationStore: AgentConfigurationStore;
  readonly #fetch: typeof fetch;
  readonly #runtime: ApiRuntime;
  readonly #targetPolicy: AgentProviderTargetPolicy;

  constructor({
    configurationStore,
    fetch: fetchFn = globalThis.fetch.bind(globalThis),
    runtime,
    targetPolicy = new AgentProviderTargetPolicy(),
  }: {
    configurationStore: AgentConfigurationStore;
    fetch?: typeof fetch;
    runtime: ApiRuntime;
    targetPolicy?: AgentProviderTargetPolicy;
  }) {
    this.#configurationStore = configurationStore;
    this.#fetch = fetchFn;
    this.#runtime = runtime;
    this.#targetPolicy = targetPolicy;
  }

  async discoverOllama(endpointValue: string) {
    const endpoint = validatedEndpoint(endpointValue);
    await this.#targetPolicy.assertRequestTarget(endpoint);
    const url = new URL("api/tags", `${endpoint.toString().replace(/\/?$/, "/")}`);
    const models = parseModels(await requestJson(url, {
      apiKey: null,
      fetch: this.#fetch,
    }));

    return { endpoint: endpoint.toString().replace(/\/$/, ""), models };
  }

  async probe(providerId: string) {
    const resolved = await this.#configurationStore.resolveProvider(providerId);

    if (!resolved) {
      throw new AgentConfigurationValidationError("Agent provider does not exist");
    }
    if (resolved.provider.kind === "codex") {
      return {
        models: [],
        reachable: resolved.provider.authenticationStatus === "configured",
      };
    }
    const endpoint = validatedEndpoint(resolved.provider.baseUrl!);
    await this.#targetPolicy.assertRequestTarget(endpoint);
    const path = resolved.provider.kind === "ollama" ? "api/tags" : "models";
    const url = new URL(path, `${endpoint.toString().replace(/\/?$/, "/")}`);
    const models = parseModels(await requestJson(url, {
      apiKey: resolved.apiKey,
      fetch: this.#fetch,
    }));

    return { models, reachable: true };
  }

  async checkConformance(baseRevision: string, profileId: string) {
    const resolved = await this.#configurationStore.resolveProfile(profileId);

    if (!resolved) {
      throw new AgentConfigurationValidationError("Agent profile does not exist");
    }
    if (resolved.profile.parameters.kind !== "chat") {
      throw new AgentConfigurationValidationError(
        "Codex profiles do not require chat conformance",
      );
    }
    if (resolved.provider.authenticationStatus === "missing") {
      throw new AgentConfigurationValidationError(
        "Provider authentication is missing",
      );
    }
    const profile = createAgentRuntimeProfile(resolved);
    if (profile.kind === "codex") {
      throw new AgentConfigurationValidationError(
        "Codex profiles do not require chat conformance",
      );
    }
    const runtime = profile.kind === "ollama"
      ? new OllamaRuntime(profile)
      : new OpenAiChatRuntime(profile, resolved.apiKey ?? "");
    const session = await runtime.openSession({
      instructions: "This is a tool-call conformance check. Call the offered tool exactly once with ack=true, then answer in natural language.",
      profileId,
      scope: { domain: "journal", entryIds: null },
      sessionId: this.#runtime.createId(),
    });
    let calls = 0;

    try {
      const result = await session.runTurn({
        executeTool: async () => {
          calls += 1;
          return { accepted: true };
        },
        messages: [{ content: "Run the conformance check now.", role: "user" }],
        onEvent: () => undefined,
        scope: { domain: "journal", entryIds: null },
        signal: new AbortController().signal,
        tools: [conformanceTool],
      });

      if (calls !== 1 || result.toolCalls !== 1 || !result.finalText.trim()) {
        throw new Error("Model did not complete the required tool-call sequence");
      }
    } finally {
      await session.dispose();
    }
    return (await this.#configurationStore.setConformance(
      baseRevision,
      profileId,
      {
        checkedAt: readApiRuntimeNow(this.#runtime).timestamp,
        toolCallMode: resolved.profile.parameters.toolCallMode,
      },
    )).configuration;
  }
}
