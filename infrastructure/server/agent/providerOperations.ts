// SPDX-License-Identifier: GPL-3.0-or-later

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  AgentCodexDeviceLoginStatus,
  AgentConformanceCheckStatus,
} from "../../../application/agent/agentConfiguration.ts";
import type { AgentRuntimeTool } from "../../../application/agent/agentRuntimePort.ts";
import { agentToolDefinitionsForDomain } from "../../../contracts/agent/tools.ts";
import type { ApiRuntime } from "../api/http/runtime.ts";
import { readApiRuntimeNow } from "../api/http/runtime.ts";
import {
  AgentConfigurationStore,
  AgentConfigurationConflictError,
  AgentConfigurationValidationError,
} from "./configurationStore.ts";
import { createAgentRuntimeProfile } from "./runtimeProfiles.ts";
import { AgentProviderTargetPolicy } from "./providerTargetPolicy.ts";
import { AgentProviderProbeService } from "./providerProbe.ts";
import {
  ConfiguredAgentRuntimeFactory,
} from "./configuredAgentRuntimeFactory.ts";
import {
  CodexAppServerClient,
  resolveCodexEntrypoint,
  withTimeout,
} from "./codexAppServerClient.ts";

const codexAppServerRequestTimeoutMilliseconds = 5_000;
const conformanceResultLimit = 100;
const conformanceOutputTokenLimit = 512;
const defaultCodexDeviceLoginTtlMilliseconds = 15 * 60 * 1_000;
const codexDeviceLoginResultLimit = 100;

function verifiedDeviceLoginUrl(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("Codex returned an invalid device login URL");
  }
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Codex returned an invalid device login URL");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Codex returned an invalid device login URL");
  }
  return url.toString();
}

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

type CodexDeviceLoginRecord = {
  baseRevision: string;
  child: ChildProcessWithoutNullStreams;
  client: CodexAppServerClient;
  codexLoginId: string;
  credentialVersion: number;
  finishing: boolean;
  processDirectory: string;
  status: AgentCodexDeviceLoginStatus;
  timeout: NodeJS.Timeout;
};

export class AgentProviderOperationConflictError extends Error {
  constructor(message = "A conformance check is already running for this profile") {
    super(message);
    this.name = "AgentProviderOperationConflictError";
  }
}

export class AgentProviderOperations {
  readonly #configurationStore: AgentConfigurationStore;
  readonly #conformanceChecks = new Map<string, AgentConformanceCheckRecord>();
  readonly #conformanceExecutions = new Map<string, Promise<void>>();
  readonly #codexDeviceLoginChildren = new Set<ChildProcessWithoutNullStreams>();
  readonly #codexDeviceLoginReservations = new Set<string>();
  readonly #codexDeviceLogins = new Map<string, CodexDeviceLoginRecord>();
  readonly #codexDeviceLoginTtlMilliseconds: number;
  readonly #probeService: AgentProviderProbeService;
  readonly #projectRoot: string;
  readonly #runtime: ApiRuntime;
  readonly #runtimeFactory: ConfiguredAgentRuntimeFactory;
  #disposed = false;

  constructor({
    configurationStore,
    codexDeviceLoginTtlMilliseconds = defaultCodexDeviceLoginTtlMilliseconds,
    fetch: fetchFn = globalThis.fetch.bind(globalThis),
    projectRoot = process.cwd(),
    runtime,
    targetPolicy = new AgentProviderTargetPolicy(),
  }: {
    configurationStore: AgentConfigurationStore;
    codexDeviceLoginTtlMilliseconds?: number;
    fetch?: typeof fetch;
    projectRoot?: string;
    runtime: ApiRuntime;
    targetPolicy?: AgentProviderTargetPolicy;
  }) {
    this.#configurationStore = configurationStore;
    this.#codexDeviceLoginTtlMilliseconds = codexDeviceLoginTtlMilliseconds;
    this.#probeService = new AgentProviderProbeService({
      configurationStore,
      fetch: fetchFn,
      runtime,
      targetPolicy,
    });
    this.#projectRoot = path.resolve(projectRoot);
    this.#runtime = runtime;
    this.#runtimeFactory = new ConfiguredAgentRuntimeFactory({
      projectRoot: this.#projectRoot,
      targetPolicy,
    });
  }

  async discoverOllama(endpointValue: string) {
    return this.#probeService.discoverOllama(endpointValue);
  }

  async probe(providerId: string) {
    return this.#probeService.probe(providerId);
  }

  async startCodexDeviceLogin(baseRevision: string, providerId: string) {
    if (this.#disposed) {
      throw new AgentProviderOperationConflictError(
        "Agent provider operations are closing",
      );
    }
    const hasPendingLogin = [...this.#codexDeviceLogins.values()].some(
      ({ status }) =>
        status.providerId === providerId && status.status === "pending",
    );

    if (this.#codexDeviceLoginReservations.has(providerId) || hasPendingLogin) {
      throw new AgentProviderOperationConflictError(
        "A Codex device login is already pending for this provider",
      );
    }
    this.#codexDeviceLoginReservations.add(providerId);
    let child: ChildProcessWithoutNullStreams | null = null;
    let processDirectory: string | null = null;
    let staging: Readonly<{
      credentialVersion: number;
      home: string;
      loginId: string;
    }> | null = null;

    try {
      this.#pruneCodexDeviceLogins();
      if (this.#codexDeviceLogins.size >= codexDeviceLoginResultLimit) {
        throw new AgentProviderOperationConflictError(
          "Codex device login capacity has been reached",
        );
      }
      const id = this.#runtime.createId();
      const prepared = await this.#configurationStore.prepareCodexDeviceLogin(
        baseRevision,
        providerId,
        id,
      );
      staging = { ...prepared, loginId: id };
      processDirectory = await mkdtemp(
        path.join(os.tmpdir(), "ctn-codex-login-"),
      );
      const entrypoint = await resolveCodexEntrypoint(this.#projectRoot);

      child = spawn(process.execPath, [entrypoint, "app-server"], {
        cwd: processDirectory,
        env: {
          CODEX_HOME: prepared.home,
          HOME: prepared.home,
          LANG: "C.UTF-8",
          PATH: path.dirname(process.execPath),
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.#codexDeviceLoginChildren.add(child);
      child.once("exit", () => this.#codexDeviceLoginChildren.delete(child!));
      const client = new CodexAppServerClient(child);

      await withTimeout(
        client.request("initialize", {
          capabilities: { experimentalApi: true },
          clientInfo: {
            name: "cognition_tree",
            title: "Cognition Tree",
            version: "0.1.0",
          },
        }),
        codexAppServerRequestTimeoutMilliseconds,
        "Codex device login initialize timed out",
      );
      if (this.#disposed) {
        throw new AgentProviderOperationConflictError(
          "Agent provider operations are closing",
        );
      }
      client.notify("initialized", {});
      let activeRecord: CodexDeviceLoginRecord | null = null;
      const completedNotifications: Array<Record<string, unknown>> = [];

      client.subscribe((message) => {
        if (message.method !== "account/login/completed") return;
        const params = message.params && typeof message.params === "object" &&
            !Array.isArray(message.params)
          ? message.params as Record<string, unknown>
          : null;

        if (!params) return;
        if (!activeRecord) {
          completedNotifications.push(params);
          return;
        }
        if (params.loginId !== null &&
            params.loginId !== activeRecord.codexLoginId) return;
        void this.#finishCodexDeviceLogin(
          activeRecord.status.id,
          params.success === true,
          typeof params.error === "string" ? params.error : null,
        );
      });
      const login = await withTimeout(
        client.request("account/login/start", { type: "chatgptDeviceCode" }),
        codexAppServerRequestTimeoutMilliseconds,
        "Codex device login start timed out",
      );
      const loginRecord = login && typeof login === "object" && !Array.isArray(login)
        ? login as Record<string, unknown>
        : null;

      if (loginRecord?.type !== "chatgptDeviceCode" ||
          typeof loginRecord.loginId !== "string" ||
          loginRecord.loginId.length === 0 ||
          typeof loginRecord.userCode !== "string" ||
          loginRecord.userCode.length === 0) {
        throw new Error("Codex returned an invalid device login response");
      }
      const verificationUrl = verifiedDeviceLoginUrl(
        loginRecord.verificationUrl,
      );
      const startedAt = readApiRuntimeNow(this.#runtime).timestamp;
      const status: AgentCodexDeviceLoginStatus = {
        completedAt: null,
        errorMessage: null,
        expiresAt: new Date(
          Date.parse(startedAt) + this.#codexDeviceLoginTtlMilliseconds,
        ).toISOString(),
        id,
        providerId,
        startedAt,
        status: "pending",
        userCode: loginRecord.userCode,
        verificationUrl,
      };
      const timeout = setTimeout(() => {
        void this.#cancelCodexDeviceLogin(id, "expired");
      }, this.#codexDeviceLoginTtlMilliseconds);

      timeout.unref();
      const record: CodexDeviceLoginRecord = {
        baseRevision,
        child,
        client,
        codexLoginId: loginRecord.loginId,
        credentialVersion: prepared.credentialVersion,
        finishing: false,
        processDirectory,
        status,
        timeout,
      };

      this.#codexDeviceLogins.set(id, record);
      activeRecord = record;
      for (const params of completedNotifications) {
        if (params.loginId !== null && params.loginId !== record.codexLoginId) {
          continue;
        }
        void this.#finishCodexDeviceLogin(
          id,
          params.success === true,
          typeof params.error === "string" ? params.error : null,
        );
      }
      const handleUnexpectedExit = () => {
        const current = this.#codexDeviceLogins.get(id);

        if (current?.status.status === "pending" && !current.finishing) {
          void this.#finishCodexDeviceLogin(
            id,
            false,
            "Codex device login process ended",
          );
        }
      };

      if (child.exitCode !== null) handleUnexpectedExit();
      else child.once("exit", handleUnexpectedExit);
      return status;
    } catch (error) {
      if (child) await this.#stopCodexLoginProcess(child);
      if (staging) {
        await this.#configurationStore.removeCodexDeviceLoginStaging(
          providerId,
          staging.credentialVersion,
          staging.loginId,
        ).catch(() => undefined);
      }
      if (processDirectory) {
        await this.#cleanupCodexLoginProcessDirectory(processDirectory);
      }
      throw error;
    } finally {
      this.#codexDeviceLoginReservations.delete(providerId);
    }
  }

  getCodexDeviceLogin(loginId: string) {
    return this.#codexDeviceLogins.get(loginId)?.status ?? null;
  }

  cancelCodexDeviceLogin(loginId: string) {
    return this.#cancelCodexDeviceLogin(loginId, "cancelled");
  }

  hasPendingCodexLogin(providerId?: string) {
    return [...this.#codexDeviceLoginReservations].some((candidate) =>
      providerId === undefined || candidate === providerId
    ) || [...this.#codexDeviceLogins.values()].some(({ status }) =>
      status.status === "pending" &&
      (providerId === undefined || status.providerId === providerId)
    );
  }

  async startConformance(baseRevision: string, profileId: string) {
    const configuration = await this.#configurationStore.readSnapshot();

    if (configuration.revision !== baseRevision) {
      throw new AgentConfigurationConflictError(configuration.revision);
    }
    if ([...this.#conformanceChecks.values()].some(({ status }) =>
      status.profileId === profileId && status.status === "running"
    )) {
      throw new AgentProviderOperationConflictError();
    }
    await this.#resolveConformanceProfile(profileId);
    this.#pruneConformanceChecks();
    if (this.#conformanceChecks.size >= conformanceResultLimit) {
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

    this.#conformanceChecks.set(id, record);
    const execution = new Promise<void>((resolve) => {
      setTimeout(() => void this.#executeConformance(id).finally(resolve), 0);
    });

    this.#conformanceExecutions.set(id, execution);
    void execution.finally(() => this.#conformanceExecutions.delete(id));
    return status;
  }

  async dispose() {
    this.#disposed = true;
    for (const record of this.#conformanceChecks.values()) {
      if (record.status.status !== "running" ||
          record.status.phase === "recording-result") continue;
      record.controller.abort(new Error("Agent provider operations are closing"));
    }
    await Promise.all([...this.#codexDeviceLogins.entries()]
      .filter(([, { status }]) => status.status === "pending")
      .map(([id]) => this.#cancelCodexDeviceLogin(id, "cancelled")));
    await Promise.all([...this.#codexDeviceLoginChildren]
      .map((child) => this.#stopCodexLoginProcess(child)));
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
      maxToolSteps: 2,
    };
    const runtime = this.#runtimeFactory.create({
      configuration: resolved,
      openAiAuthentication: "allow-unauthenticated",
      profile: verificationProfile,
    });
    const session = await runtime.openSession({
      instructions: "This is a no-write tool-call conformance check. First call describe_syntax with no arguments. After its fake guide, call stage_workspace_create_note exactly once with title=Conformance, body='- Conformance', and parentFolderId=null. Do not call list. After the fake staging result, answer in natural language.",
      profileId,
      scope: {
        domain: "workspace",
        repositoryId: "conformance-only",
        target: { kind: "repository" },
      },
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
            throw new Error("Model called the wrong conformance tool or arguments");
          }
          calls.push(call.name);
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

      if (
        calls.join(",") !==
          "describe_syntax,stage_workspace_create_note" ||
        result.toolCalls !== 2 || !result.finalText.trim()
      ) {
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

  async #finishCodexDeviceLogin(
    loginId: string,
    succeeded: boolean,
    _providerError: string | null,
  ) {
    const record = this.#codexDeviceLogins.get(loginId);

    if (!record || record.status.status !== "pending" || record.finishing) return;
    record.finishing = true;
    clearTimeout(record.timeout);
    await this.#stopCodexLoginProcess(record.child);
    try {
      if (!succeeded) throw new Error("Codex device login failed");
      await this.#configurationStore.completeCodexDeviceLogin(
        record.baseRevision,
        record.status.providerId,
        record.credentialVersion,
        record.status.id,
      );
      record.status = {
        ...record.status,
        completedAt: readApiRuntimeNow(this.#runtime).timestamp,
        status: "succeeded",
      };
    } catch {
      await this.#configurationStore.removeCodexDeviceLoginStaging(
        record.status.providerId,
        record.credentialVersion,
        record.status.id,
      ).catch(() => undefined);
      record.status = {
        ...record.status,
        completedAt: readApiRuntimeNow(this.#runtime).timestamp,
        errorMessage: "Codex device login failed",
        status: "failed",
      };
    } finally {
      await this.#cleanupCodexLoginProcessDirectory(record.processDirectory);
    }
  }

  async #cancelCodexDeviceLogin(
    loginId: string,
    terminalStatus: "cancelled" | "expired",
  ) {
    const record = this.#codexDeviceLogins.get(loginId);

    if (!record) return null;
    if (record.status.status !== "pending") return record.status;
    if (record.finishing) return record.status;
    record.finishing = true;
    clearTimeout(record.timeout);
    await withTimeout(
      record.client.request("account/login/cancel", {
        loginId: record.codexLoginId,
      }),
      codexAppServerRequestTimeoutMilliseconds,
      "Codex device login cancellation timed out",
    ).catch(() => undefined);
    record.status = {
      ...record.status,
      completedAt: readApiRuntimeNow(this.#runtime).timestamp,
      status: terminalStatus,
    };
    await this.#stopCodexLoginProcess(record.child);
    await this.#configurationStore.removeCodexDeviceLoginStaging(
      record.status.providerId,
      record.credentialVersion,
      record.status.id,
    ).catch(() => undefined);
    await this.#cleanupCodexLoginProcessDirectory(record.processDirectory);
    return record.status;
  }

  async #stopCodexLoginProcess(child: ChildProcessWithoutNullStreams) {
    if (child.exitCode !== null) {
      this.#codexDeviceLoginChildren.delete(child);
      return;
    }
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 2_000);

      timeout.unref();
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    this.#codexDeviceLoginChildren.delete(child);
  }

  async #cleanupCodexLoginProcessDirectory(directory: string) {
    const resolved = path.resolve(directory);
    const prefix = `${path.resolve(os.tmpdir())}${path.sep}ctn-codex-login-`;

    if (!resolved.startsWith(prefix)) {
      throw new Error("Refusing to clean an unexpected Codex login directory");
    }
    await rm(resolved, { force: true, recursive: true });
  }

  #pruneCodexDeviceLogins() {
    if (this.#codexDeviceLogins.size < codexDeviceLoginResultLimit) return;
    for (const [id, { status }] of this.#codexDeviceLogins) {
      if (status.status === "pending") continue;
      this.#codexDeviceLogins.delete(id);
      if (this.#codexDeviceLogins.size < codexDeviceLoginResultLimit) return;
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
