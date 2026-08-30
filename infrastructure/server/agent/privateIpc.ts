// SPDX-License-Identifier: GPL-3.0-or-later

import { randomBytes } from "node:crypto";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { parseAgentSchema } from "../../../contracts/agent/parse.ts";
import {
  AgentIpcRequestSchema,
  type AgentIpcRequestDto,
  type AgentIpcResponseDto,
  type AgentIpcToolCatalogDto,
} from "../../../contracts/agent/ipc.ts";

type AgentIpcToolCallRequest = Extract<
  AgentIpcRequestDto,
  { kind: "call-tool" }
>;

type Capability = {
  expiresAt: number;
  handle(request: AgentIpcToolCallRequest): Promise<unknown>;
  listTools(): AgentIpcToolCatalogDto;
  sessionId: string;
};

function send(socket: net.Socket, value: AgentIpcResponseDto) {
  socket.end(`${JSON.stringify(value)}\n`);
}

async function closeServer(server: net.Server) {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())
  );
}

async function cleanupDirectory(directory: string) {
  const resolved = path.resolve(directory);
  const prefix = `${path.resolve(os.tmpdir())}${path.sep}ctn-agent-ipc-`;

  if (!resolved.startsWith(prefix)) {
    throw new Error("Refusing to clean an unexpected Agent IPC directory");
  }
  await rm(resolved, { force: true, recursive: true });
}

export class AgentPrivateIpcServer {
  readonly #capabilities = new Map<string, Capability>();
  #directory: string | null = null;
  #disposed = false;
  #disposePromise: Promise<void> | null = null;
  #endpoint: string | null = null;
  #server: net.Server | null = null;
  #startPromise: Promise<string> | null = null;

  async start() {
    this.#assertOpen();
    if (this.#server) return this.endpoint;
    if (this.#startPromise) return this.#startPromise;
    const execution = this.#start();

    this.#startPromise = execution;
    try {
      return await execution;
    } finally {
      if (this.#startPromise === execution) this.#startPromise = null;
    }
  }

  register({
    expiresAt,
    handle,
    listTools,
    sessionId,
  }: {
    expiresAt: number;
    handle(request: AgentIpcToolCallRequest): Promise<unknown>;
    listTools(): AgentIpcToolCatalogDto;
    sessionId: string;
  }) {
    this.#assertOpen();
    if (!this.#server) throw new Error("Agent private IPC is not started");
    const capability = randomBytes(32).toString("base64url");

    this.#capabilities.set(capability, {
      expiresAt,
      handle,
      listTools,
      sessionId,
    });
    return capability;
  }

  revoke(capability: string) {
    this.#capabilities.delete(capability);
  }

  dispose() {
    this.#disposed = true;
    this.#capabilities.clear();
    this.#disposePromise ??= this.#dispose();
    return this.#disposePromise;
  }

  async #start() {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-agent-ipc-"));
    let server: net.Server | null = null;

    try {
      await chmod(directory, 0o700);
      this.#assertOpen();
      const endpoint = process.platform === "win32"
        ? `\\\\.\\pipe\\ctn-agent-${path.basename(directory)}`
        : path.join(directory, "agent.sock");

      const createdServer = net.createServer((socket) => this.#accept(socket));

      server = createdServer;
      await new Promise<void>((resolve, reject) => {
        createdServer.once("error", reject);
        createdServer.listen(endpoint, () => {
          createdServer.off("error", reject);
          resolve();
        });
      });
      if (process.platform !== "win32") await chmod(endpoint, 0o600);
      this.#assertOpen();
      this.#directory = directory;
      this.#endpoint = endpoint;
      this.#server = server;
      return endpoint;
    } catch (error) {
      try {
        if (server) await closeServer(server);
        await cleanupDirectory(directory);
      } catch (cleanupError) {
        const initializationMessage = error instanceof Error
          ? error.message
          : "unknown initialization failure";
        const cleanupMessage = cleanupError instanceof Error
          ? cleanupError.message
          : "unknown cleanup failure";

        throw new Error(
          `Agent private IPC initialization failed (${initializationMessage}) and cleanup failed (${cleanupMessage})`,
        );
      }
      throw error;
    }
  }

  async #dispose() {
    if (this.#startPromise) {
      await Promise.allSettled([this.#startPromise]);
    }
    const server = this.#server;
    const directory = this.#directory;

    this.#server = null;
    this.#endpoint = null;
    this.#directory = null;
    if (server) await closeServer(server);
    if (directory) await cleanupDirectory(directory);
  }

  #assertOpen() {
    if (this.#disposed) throw new Error("Agent private IPC is closing");
  }

  get endpoint() {
    if (!this.#endpoint) throw new Error("Agent private IPC is not started");
    return this.#endpoint;
  }

  #accept(socket: net.Socket) {
    socket.setEncoding("utf8");
    let source = "";
    let handled = false;

    socket.on("data", (chunk: string) => {
      if (handled) return;
      source += chunk;
      const boundary = source.indexOf("\n");

      if (boundary < 0) {
        if (source.length > 1_000_000) socket.destroy();
        return;
      }
      handled = true;
      void this.#handle(socket, source.slice(0, boundary));
    });
  }

  async #handle(socket: net.Socket, source: string) {
    let input: unknown;

    try {
      input = JSON.parse(source) as unknown;
      const request = parseAgentSchema(AgentIpcRequestSchema, input);
      const capability = this.#capabilities.get(request.capability);

      if (
        !capability ||
        capability.sessionId !== request.sessionId ||
        capability.expiresAt <= Date.now()
      ) {
        send(socket, {
          error: { code: "invalid_capability", message: "Capability is invalid or expired" },
          id: request.id,
        });
        return;
      }
      const result = request.kind === "list-tools"
        ? capability.listTools()
        : await capability.handle(request);

      send(socket, { id: request.id, result });
    } catch (error) {
      const id = input && typeof input === "object" && !Array.isArray(input) &&
          typeof (input as Record<string, unknown>).id === "string"
        ? (input as Record<string, string>).id
        : "00000000-0000-4000-8000-000000000000";

      send(socket, {
        error: {
          code: "tool_failed",
          message: error instanceof Error ? error.message : "Agent tool failed",
        },
        id,
      });
    }
  }
}
