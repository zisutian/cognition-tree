// SPDX-License-Identifier: GPL-3.0-or-later

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import type {
  AgentPrivateToolProcess,
  AgentRuntimePort,
  AgentRuntimeSession,
  AgentRuntimeTurnRequest,
} from "../../../application/agent/agentRuntimePort.ts";
import type { AgentScope } from "../../../application/agent/agentTypes.ts";
import type { CodexAgentProfile } from "./profiles.ts";
import { AgentRuntimeProtocolError } from "./openAiChatRuntime.ts";

const pinnedCodexVersion = "0.148.0";

type JsonRpcMessage = {
  error?: { code?: number; message?: string };
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
};

type NotificationListener = (message: JsonRpcMessage) => void;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

class CodexJsonRpcClient {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #listeners = new Set<NotificationListener>();
  #nextId = 1;
  readonly #pending = new Map<number, {
    reject(error: Error): void;
    resolve(value: unknown): void;
  }>();

  constructor(child: ChildProcessWithoutNullStreams) {
    this.#child = child;
    child.stderr.resume();
    const lines = readline.createInterface({ input: child.stdout });

    lines.on("line", (line) => this.#receive(line));
    child.once("exit", (code, signal) => {
      const error = new AgentRuntimeProtocolError(
        `Codex app-server exited (${code ?? signal ?? "unknown"})`,
      );

      for (const pending of this.#pending.values()) pending.reject(error);
      this.#pending.clear();
    });
  }

  notify(method: string, params: unknown) {
    this.#send({ method, params });
  }

  request(method: string, params: unknown) {
    const id = this.#nextId++;

    return new Promise<unknown>((resolve, reject) => {
      this.#pending.set(id, { reject, resolve });
      this.#send({ id, method, params });
    });
  }

  subscribe(listener: NotificationListener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #send(message: JsonRpcMessage) {
    this.#child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #receive(line: string) {
    let message: JsonRpcMessage;

    try {
      message = JSON.parse(line) as JsonRpcMessage;
    } catch {
      for (const pending of this.#pending.values()) {
        pending.reject(new AgentRuntimeProtocolError("Codex emitted invalid JSON-RPC"));
      }
      this.#pending.clear();
      return;
    }
    if (message.id !== undefined && message.method) {
      this.#resolveServerRequest(message);
      return;
    }
    if (typeof message.id === "number") {
      const pending = this.#pending.get(message.id);

      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.error) {
        pending.reject(new AgentRuntimeProtocolError(
          `Codex JSON-RPC error: ${message.error.message ?? message.error.code ?? "unknown"}`,
        ));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (message.method) {
      for (const listener of this.#listeners) listener(message);
    }
  }

  #resolveServerRequest(message: JsonRpcMessage) {
    if (
      message.method === "item/commandExecution/requestApproval" ||
      message.method === "item/fileChange/requestApproval"
    ) {
      this.#send({ id: message.id, result: { decision: "decline" } });
      return;
    }
    if (message.method === "item/permissions/requestApproval") {
      this.#send({ id: message.id, result: { permissions: [] } });
      return;
    }
    if (message.method === "mcpServer/elicitation/request") {
      this.#send({
        id: message.id,
        result: { action: "decline", content: null },
      });
      return;
    }
    this.#send({
      error: { code: -32601, message: "Server request is disabled" },
      id: message.id,
    });
  }
}

async function resolveCodexEntrypoint(projectRoot: string) {
  const packageDirectory = path.join(
    projectRoot,
    "node_modules",
    "@openai",
    "codex",
  );
  const packageJson = JSON.parse(
    await readFile(path.join(packageDirectory, "package.json"), "utf8"),
  ) as { version?: unknown };

  if (packageJson.version !== pinnedCodexVersion) {
    throw new AgentRuntimeProtocolError(
      `Codex package version must be exactly ${pinnedCodexVersion}`,
    );
  }
  return path.join(packageDirectory, "bin", "codex.js");
}

async function createSessionDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-agent-session-"));
  const cwd = path.join(directory, "workspace");
  const runtimeHome = path.join(directory, "runtime-home");

  await Promise.all([
    mkdir(cwd, { mode: 0o700 }),
    mkdir(runtimeHome, { mode: 0o700 }),
  ]);
  await chmod(directory, 0o700);
  const configPath = path.join(runtimeHome, "config.toml");
  const config = [
    'default_permissions = "ctn-session"',
    'approval_policy = "never"',
    "",
    "[permissions.ctn-session.filesystem]",
    '":minimal" = "read"',
    `${JSON.stringify(cwd)} = "read"`,
    "",
    "[permissions.ctn-session.network]",
    "enabled = false",
    "",
  ].join("\n");

  await writeFile(configPath, config, { encoding: "utf8", mode: 0o600 });
  return { cwd, directory, runtimeHome };
}

async function cleanupSessionDirectory(directory: string) {
  const resolved = path.resolve(directory);
  const prefix = `${path.resolve(os.tmpdir())}${path.sep}ctn-agent-session-`;

  if (!resolved.startsWith(prefix)) {
    throw new Error("Refusing to clean an unexpected Codex session directory");
  }
  await rm(resolved, { force: true, recursive: true });
}

function mcpConfig(process: AgentPrivateToolProcess) {
  return {
    "mcp_servers.cognition_tree.args": [...process.arguments],
    "mcp_servers.cognition_tree.command": process.command,
    "mcp_servers.cognition_tree.enabled": true,
    "mcp_servers.cognition_tree.env": { ...process.environment },
    "mcp_servers.cognition_tree.required": true,
    "mcp_servers.cognition_tree.startup_timeout_sec": 10,
    "mcp_servers.cognition_tree.tool_timeout_sec": 60,
    "shell_environment_policy.exclude": [
      "OPENAI_API_KEY",
      "CTN_AGENT_IPC_ENDPOINT",
      "CTN_AGENT_SESSION_CAPABILITY",
      "CTN_AGENT_SESSION_ID",
    ],
    "shell_environment_policy.inherit": "none",
  };
}

function withTimeout<Value>(
  promise: Promise<Value>,
  milliseconds: number,
  message: string,
) {
  return new Promise<Value>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new AgentRuntimeProtocolError(message)), milliseconds);

    timeout.unref();
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

class CodexRuntimeSession implements AgentRuntimeSession {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #client: CodexJsonRpcClient;
  readonly #cwd: string;
  readonly #directory: string;
  readonly #profile: CodexAgentProfile;
  readonly #threadId: string;
  #activeTurnId: string | null = null;

  constructor(input: {
    child: ChildProcessWithoutNullStreams;
    client: CodexJsonRpcClient;
    cwd: string;
    directory: string;
    profile: CodexAgentProfile;
    threadId: string;
  }) {
    this.#child = input.child;
    this.#client = input.client;
    this.#cwd = input.cwd;
    this.#directory = input.directory;
    this.#profile = input.profile;
    this.#threadId = input.threadId;
  }

  async cancel() {
    if (!this.#activeTurnId) return;
    await this.#client.request("turn/interrupt", {
      threadId: this.#threadId,
      turnId: this.#activeTurnId,
    });
  }

  async dispose() {
    if (this.#activeTurnId) await this.cancel().catch(() => undefined);
    this.#child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (this.#child.exitCode !== null) return resolve();
      const timeout = setTimeout(() => {
        this.#child.kill("SIGKILL");
        resolve();
      }, 2_000);

      timeout.unref();
      this.#child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    await cleanupSessionDirectory(this.#directory);
  }

  async runTurn(request: AgentRuntimeTurnRequest) {
    if (this.#activeTurnId) throw new Error("Codex session already has an active turn");
    const input = [...request.messages].reverse().find(({ role }) => role === "user");

    if (!input) throw new Error("Codex turn requires a user message");
    if (input.content.length > this.#profile.maxInputCharacters) {
      throw new Error("Codex turn exceeds maxInputCharacters");
    }
    let finalText = "";
    let settled = false;
    const completedBeforeStart = new Map<string, string>();
    let resolveCompletion!: (status: string) => void;
    let rejectCompletion!: (error: Error) => void;
    const completion = new Promise<string>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });
    const unsubscribe = this.#client.subscribe((message) => {
      const params = record(message.params);

      if (message.method === "item/agentMessage/delta") {
        const delta = typeof params?.delta === "string" ? params.delta : "";

        if (delta) {
          finalText += delta;
          if (finalText.length > this.#profile.maxOutputCharacters) {
            rejectCompletion(new Error("Codex output exceeds maxOutputCharacters"));
            return;
          }
          void request.onEvent({ textDelta: delta, type: "text-delta" });
        }
      }
      if (message.method === "item/completed") {
        const item = record(params?.item);

        if (item?.type === "contextCompaction") {
          void request.onEvent({
            reason: "Codex compacted the in-memory thread",
            type: "compaction-required",
          });
        }
      }
      if (message.method === "turn/completed") {
        const turn = record(params?.turn);
        const completedTurnId = typeof turn?.id === "string" ? turn.id : null;
        const completedStatus = typeof turn?.status === "string"
          ? turn.status
          : "failed";

        if (completedTurnId && completedTurnId !== this.#activeTurnId) {
          completedBeforeStart.set(completedTurnId, completedStatus);
        } else if (completedTurnId && !settled) {
          settled = true;
          resolveCompletion(completedStatus);
        }
      }
      if (message.method === "error") {
        const detail = record(params?.error);

        if (!settled) {
          settled = true;
          rejectCompletion(new AgentRuntimeProtocolError(
            typeof detail?.message === "string" ? detail.message : "Codex turn failed",
          ));
        }
      }
    });
    const onAbort = () => void this.cancel().catch(() => undefined);

    request.signal.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => {
      void this.cancel().catch(() => undefined);
      if (!settled) {
        settled = true;
        rejectCompletion(new Error("Codex turn timed out"));
      }
    }, this.#profile.timeoutMilliseconds);

    timeout.unref();
    try {
      const result = record(await this.#client.request("turn/start", {
        approvalPolicy: "never",
        cwd: this.#cwd,
        environments: [],
        effort: this.#profile.reasoningEffort,
        input: [{ text: input.content, type: "text" }],
        model: this.#profile.model,
        permissions: "ctn-session",
        runtimeWorkspaceRoots: [this.#cwd],
        threadId: this.#threadId,
      }));
      const turn = record(result?.turn);

      if (typeof turn?.id !== "string") {
        throw new AgentRuntimeProtocolError("Codex turn/start omitted turn id");
      }
      this.#activeTurnId = turn.id;
      const earlyStatus = completedBeforeStart.get(turn.id);

      if (earlyStatus && !settled) {
        settled = true;
        resolveCompletion(earlyStatus);
      }
      const status = await completion;

      if (status !== "completed") {
        throw new AgentRuntimeProtocolError(`Codex turn ended with ${status}`);
      }
      return { finalText, toolCalls: 0 };
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener("abort", onAbort);
      unsubscribe();
      this.#activeTurnId = null;
    }
  }
}

export class CodexRuntime implements AgentRuntimePort {
  readonly #apiKey: string;
  readonly #profile: CodexAgentProfile;
  readonly #projectRoot: string;
  readonly kind = "codex" as const;

  constructor({
    apiKey,
    profile,
    projectRoot,
  }: {
    apiKey: string;
    profile: CodexAgentProfile;
    projectRoot: string;
  }) {
    this.#apiKey = apiKey;
    this.#profile = profile;
    this.#projectRoot = projectRoot;
  }

  async openSession(input: {
    instructions: string;
    privateToolProcess?: AgentPrivateToolProcess;
    profileId: string;
    scope: AgentScope;
    sessionId: string;
  }) {
    if (!input.privateToolProcess) {
      throw new AgentRuntimeProtocolError("Codex requires a private session MCP process");
    }
    const entrypoint = await resolveCodexEntrypoint(this.#projectRoot);
    const temporary = await createSessionDirectory();
    const child = spawn(process.execPath, [entrypoint, "app-server"], {
      cwd: temporary.cwd,
      env: {
        CODEX_HOME: temporary.runtimeHome,
        HOME: temporary.runtimeHome,
        LANG: "C.UTF-8",
        OPENAI_API_KEY: this.#apiKey,
        PATH: path.dirname(process.execPath),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const client = new CodexJsonRpcClient(child);

    try {
      await withTimeout(client.request("initialize", {
        capabilities: { experimentalApi: true },
        clientInfo: {
          name: "cognition_tree",
          title: "Cognition Tree",
          version: "0.1.0",
        },
      }), this.#profile.timeoutMilliseconds, "Codex initialize timed out");
      client.notify("initialized", {});
      const result = record(await withTimeout(client.request("thread/start", {
        approvalPolicy: "never",
        baseInstructions: input.instructions,
        config: mcpConfig(input.privateToolProcess),
        cwd: temporary.cwd,
        dynamicTools: [],
        environments: [],
        ephemeral: true,
        model: this.#profile.model,
        permissions: "ctn-session",
        runtimeWorkspaceRoots: [temporary.cwd],
        selectedCapabilityRoots: [],
        serviceName: "cognition_tree",
      }), this.#profile.timeoutMilliseconds, "Codex thread/start timed out"));
      const thread = record(result?.thread);
      const threadId = typeof thread?.id === "string" ? thread.id : null;
      const instructionSources = result?.instructionSources;
      const activePermissionProfile = record(result?.activePermissionProfile);
      const sandbox = record(result?.sandbox);
      const runtimeWorkspaceRoots = result?.runtimeWorkspaceRoots;
      const isolationFailures = [
        threadId === null ? "thread-id" : null,
        thread?.ephemeral !== true ? "ephemeral" : null,
        thread?.path !== null ? "persistence-path" : null,
        !Array.isArray(instructionSources) || instructionSources.length > 0
          ? "instruction-sources"
          : null,
        activePermissionProfile?.id !== "ctn-session"
          ? "permission-profile"
          : null,
        sandbox?.type !== "readOnly" ? "filesystem-sandbox" : null,
        sandbox?.networkAccess !== false ? "network-sandbox" : null,
        // With environment access disabled, 0.148.0 reports no runtime roots.
        // A sole session cwd is equally confined; every other root fails closed.
        !Array.isArray(runtimeWorkspaceRoots) ||
            runtimeWorkspaceRoots.length > 1 ||
            runtimeWorkspaceRoots.some((root) => root !== temporary.cwd)
          ? "workspace-roots"
          : null,
      ].filter((failure): failure is string => failure !== null);

      if (threadId === null || isolationFailures.length > 0) {
        throw new AgentRuntimeProtocolError(
          `Codex did not create an isolated ephemeral thread: ${
            isolationFailures.join(", ")
          }`,
        );
      }
      return new CodexRuntimeSession({
        child,
        client,
        cwd: temporary.cwd,
        directory: temporary.directory,
        profile: this.#profile,
        threadId,
      });
    } catch (error) {
      child.kill("SIGTERM");
      await cleanupSessionDirectory(temporary.directory);
      throw error;
    }
  }
}

export { pinnedCodexVersion };
