// SPDX-License-Identifier: GPL-3.0-or-later

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  AgentRuntimeProtocolError,
  type AgentPrivateToolProcess,
  type AgentRuntimePort,
  type AgentRuntimeSession,
  type AgentRuntimeTurnRequest,
} from "../../../application/agent/index.ts";
import type { AgentScope } from "../../../application/agent/index.ts";
import type { CodexAgentProfile } from "../../../application/agentHost/index.ts";
import { CodexAppServerClient } from "./codexAppServerClient.ts";
import { resolveCodexEntrypoint } from "./codexPackage.ts";
import { withRuntimeTimeout } from "./runtimeTimeout.ts";

const codexProcessTerminationGraceMilliseconds = 2_000;

class CodexSessionOpeningCleanupError extends AgentRuntimeProtocolError {
  readonly causes: readonly unknown[];

  constructor(causes: readonly unknown[]) {
    super("Codex session opening and cleanup both failed");
    this.name = "CodexSessionOpeningCleanupError";
    this.causes = causes;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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

function childHasExited(child: ChildProcessWithoutNullStreams) {
  return child.pid === undefined ||
    child.exitCode !== null ||
    child.signalCode !== null;
}

function waitForChildExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMilliseconds: number,
) {
  if (childHasExited(child)) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const onExit = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    const timeout = setTimeout(() => {
      child.off("exit", onExit);
      resolve(false);
    }, timeoutMilliseconds);

    timeout.unref();
    child.once("exit", onExit);
  });
}

async function terminateCodexProcess(child: ChildProcessWithoutNullStreams) {
  if (childHasExited(child)) return;
  child.kill("SIGTERM");
  if (await waitForChildExit(
    child,
    codexProcessTerminationGraceMilliseconds,
  )) {
    return;
  }
  child.kill("SIGKILL");
  if (!await waitForChildExit(
    child,
    codexProcessTerminationGraceMilliseconds,
  )) {
    throw new AgentRuntimeProtocolError(
      "Codex app-server did not exit after SIGKILL",
    );
  }
}

function mcpConfig(process: AgentPrivateToolProcess, cwd: string) {
  return {
    approval_policy: "never",
    default_permissions: "ctn-session",
    "mcp_servers.cognition_tree.args": [...process.arguments],
    "mcp_servers.cognition_tree.command": process.command,
    "mcp_servers.cognition_tree.enabled": true,
    "mcp_servers.cognition_tree.env": { ...process.environment },
    "mcp_servers.cognition_tree.required": true,
    "mcp_servers.cognition_tree.startup_timeout_sec": 10,
    "mcp_servers.cognition_tree.tool_timeout_sec": 60,
    "permissions.ctn-session.filesystem": {
      ":minimal": "read",
      [cwd]: "read",
    },
    "permissions.ctn-session.network.enabled": false,
    "shell_environment_policy.exclude": [
      "OPENAI_API_KEY",
      "CTN_AGENT_IPC_ENDPOINT",
      "CTN_AGENT_SESSION_CAPABILITY",
      "CTN_AGENT_SESSION_ID",
    ],
    "shell_environment_policy.inherit": "none",
  };
}

class CodexRuntimeSession implements AgentRuntimeSession {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #client: CodexAppServerClient;
  readonly #cwd: string;
  readonly #directory: string;
  readonly #profile: CodexAgentProfile;
  readonly #threadId: string;
  #activeTurnId: string | null = null;
  #disposed = false;
  #disposePromise: Promise<void> | null = null;

  constructor(input: {
    child: ChildProcessWithoutNullStreams;
    client: CodexAppServerClient;
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
    if (this.#disposed) return;
    await this.#interruptActiveTurn();
  }

  #interruptActiveTurn() {
    if (!this.#activeTurnId) return Promise.resolve();
    return withRuntimeTimeout(this.#client.request("turn/interrupt", {
      threadId: this.#threadId,
      turnId: this.#activeTurnId,
    }), codexProcessTerminationGraceMilliseconds, "Codex interrupt timed out")
      .then(() => undefined);
  }

  dispose() {
    if (this.#disposePromise) return this.#disposePromise;
    this.#disposed = true;
    this.#disposePromise = (async () => {
      await this.#interruptActiveTurn().catch(() => undefined);
      await terminateCodexProcess(this.#child);
      await cleanupSessionDirectory(this.#directory);
    })();
    return this.#disposePromise;
  }

  async runTurn(request: AgentRuntimeTurnRequest) {
    if (this.#disposed) {
      throw new AgentRuntimeProtocolError("Codex session is disposed");
    }
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
    let eventFailure: Error | null = null;
    let eventTail = Promise.resolve();
    const asError = (error: unknown) =>
      error instanceof Error
        ? error
        : new Error("Codex event delivery failed");
    const enqueueEvent = (
      event: Parameters<AgentRuntimeTurnRequest["onEvent"]>[0],
    ) => {
      if (settled) return;
      eventTail = eventTail.then(() => request.onEvent(event)).then(
        () => undefined,
        (error: unknown) => {
          eventFailure ??= asError(error);
          if (!settled) {
            settled = true;
            rejectCompletion(eventFailure);
          }
        },
      );
    };
    const settleCompletion = (status: string) => {
      if (settled) return;
      settled = true;
      void eventTail.then(() => {
        if (eventFailure) rejectCompletion(eventFailure);
        else resolveCompletion(status);
      });
    };
    const failCompletion = (error: Error) => {
      if (settled) return;
      settled = true;
      void eventTail.then(() => rejectCompletion(eventFailure ?? error));
    };
    const unsubscribe = this.#client.subscribe((message) => {
      const params = record(message.params);

      if (message.method === "item/agentMessage/delta") {
        const delta = typeof params?.delta === "string" ? params.delta : "";

        if (delta) {
          finalText += delta;
          if (finalText.length > this.#profile.maxOutputCharacters) {
            failCompletion(
              new Error("Codex output exceeds maxOutputCharacters"),
            );
            return;
          }
          enqueueEvent({ textDelta: delta, type: "text-delta" });
        }
      }
      if (message.method === "item/completed") {
        const item = record(params?.item);

        if (item?.type === "contextCompaction") {
          enqueueEvent({
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
          settleCompletion(completedStatus);
        }
      }
      if (message.method === "error") {
        const detail = record(params?.error);

        if (!settled) {
          failCompletion(new AgentRuntimeProtocolError(
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
        failCompletion(new Error("Codex turn timed out"));
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
        settleCompletion(earlyStatus);
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
  readonly #authentication:
    | Readonly<{ apiKey: string; type: "api-key" }>
    | Readonly<{ codexHome: string; type: "chatgpt-device-code" }>;
  readonly #profile: CodexAgentProfile;
  readonly #projectRoot: string;
  readonly kind = "codex" as const;

  constructor({
    authentication,
    profile,
    projectRoot,
  }: {
    authentication:
      | Readonly<{ apiKey: string; type: "api-key" }>
      | Readonly<{ codexHome: string; type: "chatgpt-device-code" }>;
    profile: CodexAgentProfile;
    projectRoot: string;
  }) {
    this.#authentication = authentication;
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
        CODEX_HOME: this.#authentication.type === "chatgpt-device-code"
          ? this.#authentication.codexHome
          : temporary.runtimeHome,
        HOME: temporary.runtimeHome,
        LANG: "C.UTF-8",
        PATH: path.dirname(process.execPath),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const client = new CodexAppServerClient(child);

    try {
      await withRuntimeTimeout(client.request("initialize", {
        capabilities: { experimentalApi: true },
        clientInfo: {
          name: "cognition_tree",
          title: "Cognition Tree",
          version: "0.1.0",
        },
      }), this.#profile.timeoutMilliseconds, "Codex initialize timed out");
      client.notify("initialized", {});
      if (this.#authentication.type === "api-key") {
        const login = record(await withRuntimeTimeout(client.request(
          "account/login/start",
          { apiKey: this.#authentication.apiKey, type: "apiKey" },
        ), this.#profile.timeoutMilliseconds, "Codex API key login timed out"));

        if (login?.type !== "apiKey") {
          throw new AgentRuntimeProtocolError("Codex rejected API key login");
        }
      } else {
        const accountResult = record(await withRuntimeTimeout(client.request(
          "account/read",
          { refreshToken: false },
        ), this.#profile.timeoutMilliseconds, "Codex account check timed out"));
        const account = record(accountResult?.account);

        if (account?.type !== "chatgpt") {
          throw new AgentRuntimeProtocolError(
            "Codex managed ChatGPT authentication is unavailable",
          );
        }
      }
      const result = record(await withRuntimeTimeout(client.request("thread/start", {
        approvalPolicy: "never",
        baseInstructions: input.instructions,
        config: mcpConfig(input.privateToolProcess, temporary.cwd),
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
      try {
        await terminateCodexProcess(child);
        await cleanupSessionDirectory(temporary.directory);
      } catch (cleanupError) {
        throw new CodexSessionOpeningCleanupError([error, cleanupError]);
      }
      throw error;
    }
  }
}
