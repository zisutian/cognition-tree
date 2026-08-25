// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentConformanceCheckStatus } from "../../../application/agent/agentConfiguration.ts";
import type { AgentRuntimeTool } from "../../../application/agent/agentRuntimePort.ts";
import { agentToolDefinitionsForDomain } from "../../../contracts/agent/tools.ts";
import type { ApiRuntime } from "../api/http/runtime.ts";
import { readApiRuntimeNow } from "../api/http/runtime.ts";
import {
  AgentConfigurationStore,
  AgentConfigurationConflictError,
  AgentConfigurationValidationError,
} from "./configurationStore.ts";
import { OllamaRuntime } from "./ollamaRuntime.ts";
import { OpenAiChatRuntime } from "./openAiChatRuntime.ts";
import { createAgentRuntimeProfile } from "./runtimeProfiles.ts";
import { AgentProviderTargetPolicy } from "./providerTargetPolicy.ts";

const responseByteLimit = 1024 * 1024;
const probeTimeoutMilliseconds = 5_000;
const conformanceResultLimit = 100;
const conformanceOutputTokenLimit = 512;

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
    probeTimeoutMilliseconds,
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
  if (!value || typeof value !== "object" || Array.isArray(value)) return new Map();
  const candidates = (value as Record<string, unknown>).models;

  if (!Array.isArray(candidates)) return new Map();
  return new Map(candidates.flatMap((candidate): Array<[string, number]> => {
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

    return model && context !== null ? [[model, context]] : [];
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

const conformanceTools: readonly AgentRuntimeTool[] =
  agentToolDefinitionsForDomain("workspace")
    .filter(({ name }) =>
      name === "list" || name === "stage_workspace_create_note"
    )
    .map(({ description, inputSchema, name }) => ({
      description,
      inputSchema: inputSchema as unknown as Readonly<Record<string, unknown>>,
      name,
    }));

type AgentConformanceCheckRecord = Readonly<{
  baseRevision: string;
  controller: AbortController;
  status: AgentConformanceCheckStatus;
}>;

export class AgentConformanceCheckConflictError extends Error {
  constructor(message = "A conformance check is already running for this profile") {
    super(message);
    this.name = "AgentConformanceCheckConflictError";
  }
}

export class AgentProviderOperations {
  readonly #configurationStore: AgentConfigurationStore;
  readonly #conformanceChecks = new Map<string, AgentConformanceCheckRecord>();
  readonly #conformanceExecutions = new Map<string, Promise<void>>();
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
    await this.#targetPolicy.assertRequestTarget(endpoint, null);
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
        modelContexts: [],
        models: [],
        probedAt: readApiRuntimeNow(this.#runtime).timestamp,
        reachable: resolved.provider.authenticationStatus === "configured",
      };
    }
    const endpoint = validatedEndpoint(resolved.provider.baseUrl!);
    const path = resolved.provider.kind === "ollama" ? "api/tags" : "models";
    const url = new URL(path, `${endpoint.toString().replace(/\/?$/, "/")}`);
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
    const modelContexts = [];

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
        loadedContextTokens: loadedContexts.get(model) ?? null,
        model,
      });
    }

    return {
      modelContexts,
      models,
      probedAt: readApiRuntimeNow(this.#runtime).timestamp,
      reachable: true,
    };
  }

  async startConformance(baseRevision: string, profileId: string) {
    const configuration = await this.#configurationStore.readSnapshot();

    if (configuration.revision !== baseRevision) {
      throw new AgentConfigurationConflictError(configuration.revision);
    }
    if ([...this.#conformanceChecks.values()].some(({ status }) =>
      status.profileId === profileId && status.status === "running"
    )) {
      throw new AgentConformanceCheckConflictError();
    }
    await this.#resolveConformanceProfile(profileId);
    this.#pruneConformanceChecks();
    if (this.#conformanceChecks.size >= conformanceResultLimit) {
      throw new AgentConformanceCheckConflictError(
        "Agent conformance check capacity has been reached",
      );
    }
    const id = this.#runtime.createId();
    const status: AgentConformanceCheckStatus = {
      completedAt: null,
      errorMessage: null,
      id,
      phase: "calling-tool",
      profileId,
      startedAt: readApiRuntimeNow(this.#runtime).timestamp,
      status: "running",
    };
    const record: AgentConformanceCheckRecord = {
      baseRevision,
      controller: new AbortController(),
      status,
    };

    this.#conformanceChecks.set(id, record);
    const execution = new Promise<void>((resolve) => {
      setTimeout(() => void this.#executeConformance(id).finally(resolve), 0);
    });

    this.#conformanceExecutions.set(id, execution);
    void execution.finally(() => this.#conformanceExecutions.delete(id));
    return status;
  }

  async dispose() {
    for (const record of this.#conformanceChecks.values()) {
      if (record.status.status !== "running" ||
          record.status.phase === "recording-result") continue;
      record.controller.abort(new Error("Agent provider operations are closing"));
    }
    await Promise.allSettled(this.#conformanceExecutions.values());
  }

  getConformance(checkId: string) {
    return this.#conformanceChecks.get(checkId)?.status ?? null;
  }

  cancelConformance(checkId: string) {
    const record = this.#conformanceChecks.get(checkId);

    if (!record) return null;
    if (record.status.status !== "running") return record.status;
    if (record.status.phase === "recording-result") return record.status;
    record.controller.abort(new Error("Agent conformance check was cancelled"));
    const status: AgentConformanceCheckStatus = {
      ...record.status,
      completedAt: readApiRuntimeNow(this.#runtime).timestamp,
      status: "cancelled",
    };

    this.#conformanceChecks.set(checkId, { ...record, status });
    return status;
  }

  async #resolveConformanceProfile(profileId: string) {
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
    return {
      profile,
      resolved,
      toolCallMode: resolved.profile.parameters.toolCallMode,
    };
  }

  async #runConformance(
    profileId: string,
    signal: AbortSignal,
    onToolCall: () => void,
  ) {
    const { profile, resolved, toolCallMode } =
      await this.#resolveConformanceProfile(profileId);
    const verificationProfile = {
      ...profile,
      maxOutputTokens: Math.min(
        profile.maxOutputTokens,
        conformanceOutputTokenLimit,
      ),
      maxToolSteps: 1,
    };
    const beforeRequest = () => this.#targetPolicy.assertRequestTarget(
      new URL(resolved.provider.baseUrl!),
      resolved.privateNetworkOrigin,
    );
    const runtime = verificationProfile.kind === "ollama"
      ? new OllamaRuntime(verificationProfile, beforeRequest)
      : new OpenAiChatRuntime(
        verificationProfile,
        resolved.apiKey ?? "",
        beforeRequest,
      );
    const session = await runtime.openSession({
      instructions: "This is a no-write tool-call conformance check. Call stage_workspace_create_note exactly once with title=Conformance, body=Conformance, and parentFolderId=null. Do not call list. After the fake tool result, answer in natural language.",
      profileId,
      scope: {
        domain: "workspace",
        repositoryId: "conformance-only",
        target: { kind: "repository" },
      },
      sessionId: this.#runtime.createId(),
    });
    let calls = 0;

    try {
      const result = await session.runTurn({
        executeTool: async (call) => {
          const argumentsValue = call.arguments as Record<string, unknown>;

          if (
            call.name !== "stage_workspace_create_note" ||
            argumentsValue.body !== "Conformance" ||
            argumentsValue.parentFolderId !== null ||
            argumentsValue.title !== "Conformance"
          ) {
            throw new Error("Model called the wrong conformance tool or arguments");
          }
          calls += 1;
          return { accepted: true };
        },
        messages: [{ content: "Run the conformance check now.", role: "user" }],
        onEvent: (event) => {
          if (event.type === "tool-call") onToolCall();
        },
        scope: {
          domain: "workspace",
          repositoryId: "conformance-only",
          target: { kind: "repository" },
        },
        signal,
        tools: conformanceTools,
      });

      if (calls !== 1 || result.toolCalls !== 1 || !result.finalText.trim()) {
        throw new Error("Model did not complete the required tool-call sequence");
      }
    } finally {
      await session.dispose();
    }
    return toolCallMode;
  }

  async #executeConformance(checkId: string) {
    const record = this.#conformanceChecks.get(checkId);

    if (!record) return;
    try {
      record.controller.signal.throwIfAborted();
      const toolCallMode = await this.#runConformance(
        record.status.profileId,
        record.controller.signal,
        () => {
          const current = this.#conformanceChecks.get(checkId);

          if (!current || current.status.status !== "running") return;
          this.#conformanceChecks.set(checkId, {
            ...current,
            status: { ...current.status, phase: "summarizing" },
          });
        },
      );
      let current = this.#conformanceChecks.get(checkId);

      if (!current || current.status.status !== "running") return;
      record.controller.signal.throwIfAborted();
      current = {
        ...current,
        status: { ...current.status, phase: "recording-result" },
      };
      this.#conformanceChecks.set(checkId, current);
      await this.#configurationStore.setConformance(
        record.baseRevision,
        record.status.profileId,
        {
          checkedAt: readApiRuntimeNow(this.#runtime).timestamp,
          toolCallMode,
        },
      );
      this.#conformanceChecks.set(checkId, {
        ...current,
        status: {
          ...current.status,
          completedAt: readApiRuntimeNow(this.#runtime).timestamp,
          status: "succeeded",
        },
      });
    } catch (error) {
      const current = this.#conformanceChecks.get(checkId);

      if (!current || current.status.status === "cancelled") return;
      const cancelled = record.controller.signal.aborted;

      this.#conformanceChecks.set(checkId, {
        ...current,
        status: {
          ...current.status,
          completedAt: readApiRuntimeNow(this.#runtime).timestamp,
          errorMessage: cancelled
            ? null
            : error instanceof Error
              ? error.message
              : "Agent conformance check failed",
          status: cancelled ? "cancelled" : "failed",
        },
      });
    }
  }

  #pruneConformanceChecks() {
    if (this.#conformanceChecks.size < conformanceResultLimit) return;
    for (const [id, { status }] of this.#conformanceChecks) {
      if (status.status === "running") continue;
      this.#conformanceChecks.delete(id);
      if (this.#conformanceChecks.size < conformanceResultLimit) return;
    }
  }
}
