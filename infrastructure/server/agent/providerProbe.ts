// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentOllamaDiscovery,
  AgentProviderProbe,
} from "../../../application/agent/agentConfiguration.ts";
import type { ApiRuntime } from "../api/http/runtime.ts";
import { readApiRuntimeNow } from "../api/http/runtime.ts";
import {
  AgentConfigurationStore,
  AgentConfigurationValidationError,
} from "./configurationStore.ts";
import { AgentProviderTargetPolicy } from "./providerTargetPolicy.ts";

const responseByteLimit = 1024 * 1024;
const providerProbeTimeoutMilliseconds = 5_000;

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
  {
    apiKey,
    body,
    fetch: fetchFn,
  }: {
    apiKey: string | null;
    body?: unknown;
    fetch: typeof fetch;
  },
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Provider request timed out")),
    providerProbeTimeoutMilliseconds,
  );

  timeout.unref();
  try {
    const response = await fetchFn(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      method: body === undefined ? "GET" : "POST",
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

function positiveSafeInteger(value: unknown) {
  return Number.isSafeInteger(value) && (value as number) > 0
    ? value as number
    : null;
}

function parseLoadedContexts(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return new Map<string, number | null>();
  }
  const candidates = (value as Record<string, unknown>).models;

  if (!Array.isArray(candidates)) return new Map<string, number | null>();
  return new Map(candidates.flatMap((candidate): Array<[string, number | null]> => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return [];
    }
    const record = candidate as Record<string, unknown>;
    const model = typeof record.model === "string"
      ? record.model
      : typeof record.name === "string"
        ? record.name
        : null;
    const context = positiveSafeInteger(record.context_length);

    return model ? [[model, context]] : [];
  }));
}

function parseDeclaredMaximumContext(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const modelInfo = (value as Record<string, unknown>).model_info;

  if (!modelInfo || typeof modelInfo !== "object" || Array.isArray(modelInfo)) {
    return null;
  }
  const candidates = Object.entries(modelInfo)
    .filter(([key]) => key.endsWith(".context_length"))
    .map(([, candidate]) => positiveSafeInteger(candidate))
    .filter((candidate): candidate is number => candidate !== null);

  return candidates.length > 0 ? Math.max(...candidates) : null;
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

export class AgentProviderProbeService {
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

  async discoverOllama(endpointValue: string): Promise<AgentOllamaDiscovery> {
    const endpoint = validatedEndpoint(endpointValue);

    await this.#targetPolicy.assertRequestTarget(endpoint, null);
    const url = new URL("api/tags", `${endpoint.toString().replace(/\/?$/, "/")}`);
    const models = parseModels(await requestJson(url, {
      apiKey: null,
      fetch: this.#fetch,
    }));

    return { endpoint: endpoint.toString().replace(/\/$/, ""), models };
  }

  async probe(providerId: string): Promise<AgentProviderProbe> {
    const resolved = await this.#configurationStore.resolveProvider(providerId);

    if (!resolved) {
      throw new AgentConfigurationValidationError("Agent provider does not exist");
    }
    if (resolved.provider.kind === "codex") {
      return {
        modelContexts: [],
        models: [],
        probedAt: readApiRuntimeNow(this.#runtime).timestamp,
        reachable: resolved.provider.authenticationStatus === "configured",
      };
    }
    const endpoint = validatedEndpoint(resolved.provider.baseUrl!);
    const requestPath = resolved.provider.kind === "ollama" ? "api/tags" : "models";
    const url = new URL(
      requestPath,
      `${endpoint.toString().replace(/\/?$/, "/")}`,
    );

    await this.#targetPolicy.assertRequestTarget(
      url,
      resolved.privateNetworkOrigin,
    );
    const models = parseModels(await requestJson(url, {
      apiKey: resolved.apiKey,
      fetch: this.#fetch,
    }));

    if (resolved.provider.kind !== "ollama") {
      return {
        modelContexts: [],
        models,
        probedAt: readApiRuntimeNow(this.#runtime).timestamp,
        reachable: true,
      };
    }
    const snapshot = await this.#configurationStore.readSnapshot();
    const configuredModels = [...new Set(snapshot.profiles
      .filter(({ providerId: candidate }) => candidate === providerId)
      .map(({ model }) => model))].sort();
    const psUrl = new URL(
      "api/ps",
      `${endpoint.toString().replace(/\/?$/, "/")}`,
    );

    await this.#targetPolicy.assertRequestTarget(
      psUrl,
      resolved.privateNetworkOrigin,
    );
    const loadedContexts = parseLoadedContexts(await requestJson(psUrl, {
      apiKey: resolved.apiKey,
      fetch: this.#fetch,
    }));
    const modelContexts: Array<AgentProviderProbe["modelContexts"][number]> = [];

    for (const model of configuredModels) {
      const showUrl = new URL(
        "api/show",
        `${endpoint.toString().replace(/\/?$/, "/")}`,
      );

      await this.#targetPolicy.assertRequestTarget(
        showUrl,
        resolved.privateNetworkOrigin,
      );
      const declaredMaximumContextTokens = parseDeclaredMaximumContext(
        await requestJson(showUrl, {
          apiKey: resolved.apiKey,
          body: { model },
          fetch: this.#fetch,
        }),
      );

      modelContexts.push({
        declaredMaximumContextTokens,
        model,
        residentContext: !loadedContexts.has(model)
          ? { status: "not-loaded" as const }
          : loadedContexts.get(model) === null
            ? { status: "loaded-unreported" as const }
            : {
                allocatedContextTokens: loadedContexts.get(model)!,
                status: "loaded" as const,
              },
      });
    }

    return {
      modelContexts,
      models,
      probedAt: readApiRuntimeNow(this.#runtime).timestamp,
      reachable: true,
    };
  }
}
