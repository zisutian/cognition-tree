// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentConformanceCheckStatus,
} from "../../../application/agent/agentConfiguration.ts";
import type { AgentRuntimeTool } from "../../../application/agent/agentRuntimePort.ts";
import { agentToolDefinitionsForDomain } from "../../../contracts/agent/tools.ts";
import type { ApiRuntime } from "../api/http/runtime.ts";
import { readApiRuntimeNow } from "../api/http/runtime.ts";
import {
  AgentConfigurationConflictError,
  AgentConfigurationValidationError,
  type AgentConfigurationStore,
} from "./configurationStore.ts";
import { ConfiguredAgentRuntimeFactory } from "./configuredAgentRuntimeFactory.ts";
import { AgentProviderOperationConflictError } from "./providerOperationErrors.ts";
import type { AgentProviderTargetPolicy } from "./providerTargetPolicy.ts";
import { createAgentRuntimeProfile } from "../../../application/agentHost/runtimeProfiles.ts";

const conformanceResultLimit = 100;
const conformanceOutputTokenLimit = 512;

const conformanceTools: readonly AgentRuntimeTool[] =
  agentToolDefinitionsForDomain("workspace")
    .filter(({ name }) =>
      name === "list" || name === "describe_syntax" ||
      name === "stage_workspace_create_note"
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

export class AgentConformanceOperations {
  readonly #checks = new Map<string, AgentConformanceCheckRecord>();
  readonly #configurationStore: AgentConfigurationStore;
  readonly #executions = new Map<string, Promise<void>>();
  readonly #reservations = new Set<string>();
  readonly #runtime: ApiRuntime;
  readonly #runtimeFactory: ConfiguredAgentRuntimeFactory;
  readonly #starts = new Set<Promise<AgentConformanceCheckStatus>>();
  #disposed = false;
  #disposePromise: Promise<void> | null = null;

  constructor({
    configurationStore,
    projectRoot,
    runtime,
    targetPolicy,
  }: {
    configurationStore: AgentConfigurationStore;
    projectRoot: string;
    runtime: ApiRuntime;
    targetPolicy: AgentProviderTargetPolicy;
  }) {
    this.#configurationStore = configurationStore;
    this.#runtime = runtime;
    this.#runtimeFactory = new ConfiguredAgentRuntimeFactory({
      projectRoot,
      targetPolicy,
    });
  }

  start(baseRevision: string, profileId: string) {
    this.#assertOpen();
    const execution = this.#start(baseRevision, profileId);

    this.#starts.add(execution);
    void execution.finally(() => this.#starts.delete(execution))
      .catch(() => undefined);
    return execution;
  }

  get(checkId: string) {
    return this.#checks.get(checkId)?.status ?? null;
  }

  cancel(checkId: string) {
    const record = this.#checks.get(checkId);

    if (!record) return null;
    if (record.status.status !== "running") return record.status;
    if (record.status.phase === "recording-result") return record.status;
    record.controller.abort(new Error("Agent conformance check was cancelled"));
    const status: AgentConformanceCheckStatus = {
      ...record.status,
      completedAt: readApiRuntimeNow(this.#runtime).timestamp,
      status: "cancelled",
    };

    this.#checks.set(checkId, { ...record, status });
    return status;
  }

  dispose() {
    this.#disposed = true;
    this.#disposePromise ??= (async () => {
      await Promise.allSettled(this.#starts);
      for (const record of this.#checks.values()) {
        if (
          record.status.status !== "running" ||
          record.status.phase === "recording-result"
        ) {
          continue;
        }
        record.controller.abort(
          new Error("Agent provider operations are closing"),
        );
      }
      await Promise.allSettled(this.#executions.values());
    })();
    return this.#disposePromise;
  }

  hasActiveOperations() {
    return this.#starts.size > 0 || this.#executions.size > 0;
  }

  async #start(baseRevision: string, profileId: string) {
    const hasRunningCheck = [...this.#checks.values()].some(({ status }) =>
      status.profileId === profileId && status.status === "running"
    );

    if (this.#reservations.has(profileId) || hasRunningCheck) {
      throw new AgentProviderOperationConflictError();
    }
    this.#reservations.add(profileId);
    try {
      const configuration = await this.#configurationStore.readSnapshot();

      this.#assertOpen();
      if (configuration.revision !== baseRevision) {
        throw new AgentConfigurationConflictError(configuration.revision);
      }
      await this.#resolveProfile(profileId);
      this.#assertOpen();
      this.#prune();
      if (this.#checks.size >= conformanceResultLimit) {
        throw new AgentProviderOperationConflictError(
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

      this.#checks.set(id, record);
      const execution = new Promise<void>((resolve) => {
        setTimeout(() => {
          void this.#execute(id).then(resolve, resolve);
        }, 0);
      });

      this.#executions.set(id, execution);
      void execution.then(() => this.#executions.delete(id));
      return status;
    } finally {
      this.#reservations.delete(profileId);
    }
  }

  #assertOpen() {
    if (this.#disposed) {
      throw new AgentProviderOperationConflictError(
        "Agent provider operations are closing",
      );
    }
  }

  async #resolveProfile(profileId: string) {
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

  async #run(
    profileId: string,
    signal: AbortSignal,
    onToolCall: () => void,
  ) {
    const { profile, resolved, toolCallMode } =
      await this.#resolveProfile(profileId);
    const verificationProfile = {
      ...profile,
      maxOutputTokens: Math.min(
        profile.maxOutputTokens,
        conformanceOutputTokenLimit,
      ),
      maxToolSteps: 2,
    };
    const runtime = this.#runtimeFactory.create({
      configuration: resolved,
      openAiAuthentication: "allow-unauthenticated",
      profile: verificationProfile,
    });
    const scope = {
      domain: "workspace" as const,
      repositoryId: "conformance-only",
      target: { kind: "repository" as const },
    };
    const session = await runtime.openSession({
      instructions: "This is a no-write tool-call conformance check. First call describe_syntax with no arguments. After its fake guide, call stage_workspace_create_note exactly once with title=Conformance, body='- Conformance', and parentFolderId=null. Do not call list. After the fake staging result, answer in natural language.",
      profileId,
      scope,
      sessionId: this.#runtime.createId(),
    });
    const calls: string[] = [];

    try {
      const result = await session.runTurn({
        executeTool: async (call) => {
          if (call.name === "describe_syntax" && calls.length === 0) {
            calls.push(call.name);
            return {
              available: true,
              guide: {
                blocks: [{
                  example: "- 示例内容",
                  kind: "line",
                  label: "组分",
                  marker: "-",
                  semanticId: "component",
                }],
                bodyInputsExcludeTitle: true,
                domain: "workspace",
                indentation: {
                  character: "tab",
                  displayWidth: 8,
                  nestedExample: "\t- 示例内容",
                },
                inline: [],
                name: "Conformance syntax",
                root: null,
                title: { kind: "first-line", label: "标题" },
              },
            };
          }
          const argumentsValue = call.arguments as Record<string, unknown>;

          if (
            call.name !== "stage_workspace_create_note" ||
            calls.length !== 1 ||
            argumentsValue.body !== "- Conformance" ||
            argumentsValue.parentFolderId !== null ||
            argumentsValue.title !== "Conformance"
          ) {
            throw new Error(
              "Model called the wrong conformance tool or arguments",
            );
          }
          calls.push(call.name);
          return { accepted: true };
        },
        messages: [{ content: "Run the conformance check now.", role: "user" }],
        onEvent: (event) => {
          if (event.type === "tool-call") onToolCall();
        },
        scope,
        signal,
        tools: conformanceTools,
      });

      if (
        calls.join(",") !==
          "describe_syntax,stage_workspace_create_note" ||
        result.toolCalls !== 2 ||
        !result.finalText.trim()
      ) {
        throw new Error(
          "Model did not complete the required tool-call sequence",
        );
      }
    } finally {
      await session.dispose();
    }
    return toolCallMode;
  }

  async #execute(checkId: string) {
    const record = this.#checks.get(checkId);

    if (!record) return;
    try {
      record.controller.signal.throwIfAborted();
      const toolCallMode = await this.#run(
        record.status.profileId,
        record.controller.signal,
        () => {
          const current = this.#checks.get(checkId);

          if (!current || current.status.status !== "running") return;
          this.#checks.set(checkId, {
            ...current,
            status: { ...current.status, phase: "summarizing" },
          });
        },
      );
      let current = this.#checks.get(checkId);

      if (!current || current.status.status !== "running") return;
      record.controller.signal.throwIfAborted();
      current = {
        ...current,
        status: { ...current.status, phase: "recording-result" },
      };
      this.#checks.set(checkId, current);
      await this.#configurationStore.setConformance(
        record.baseRevision,
        record.status.profileId,
        {
          checkedAt: readApiRuntimeNow(this.#runtime).timestamp,
          toolCallMode,
        },
      );
      this.#checks.set(checkId, {
        ...current,
        status: {
          ...current.status,
          completedAt: readApiRuntimeNow(this.#runtime).timestamp,
          status: "succeeded",
        },
      });
    } catch (error) {
      const current = this.#checks.get(checkId);

      if (!current || current.status.status === "cancelled") return;
      const cancelled = record.controller.signal.aborted;

      this.#checks.set(checkId, {
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

  #prune() {
    if (this.#checks.size < conformanceResultLimit) return;
    for (const [id, { status }] of this.#checks) {
      if (status.status === "running") continue;
      this.#checks.delete(id);
      if (this.#checks.size < conformanceResultLimit) return;
    }
  }
}
