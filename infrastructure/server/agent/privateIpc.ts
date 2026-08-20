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
} from "../../../contracts/agent/ipc.ts";

type Capability = {
  expiresAt: number;
  handle(request: AgentIpcRequestDto): Promise<unknown>;
  sessionId: string;
};

function send(socket: net.Socket, value: AgentIpcResponseDto) {
  socket.end(`${JSON.stringify(value)}\n`);
}

export class AgentPrivateIpcServer {
  readonly #capabilities = new Map<string, Capability>();
  #directory: string | null = null;
  #endpoint: string | null = null;
  #server: net.Server | null = null;

  async start() {
    if (this.#server) return this.endpoint;
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-agent-ipc-"));

    await chmod(directory, 0o700);
    const endpoint = process.platform === "win32"
      ? `\\\\.\\pipe\\ctn-agent-${path.basename(directory)}`
      : path.join(directory, "agent.sock");
    const server = net.createServer((socket) => this.#accept(socket));

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(endpoint, () => {
        server.off("error", reject);
        resolve();
      });
    });
    if (process.platform !== "win32") await chmod(endpoint, 0o600);
    this.#directory = directory;
    this.#endpoint = endpoint;
    this.#server = server;
    return endpoint;
  }

  register({
    expiresAt,
    handle,
    sessionId,
  }: {
    expiresAt: number;
    handle(request: AgentIpcRequestDto): Promise<unknown>;
    sessionId: string;
  }) {
    const capability = randomBytes(32).toString("base64url");

    this.#capabilities.set(capability, { expiresAt, handle, sessionId });
    return capability;
  }

  revoke(capability: string) {
    this.#capabilities.delete(capability);
  }

  async dispose() {
    this.#capabilities.clear();
    const server = this.#server;
    const directory = this.#directory;

    this.#server = null;
    this.#endpoint = null;
    this.#directory = null;
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve())
      );
    }
    if (directory) {
      const resolved = path.resolve(directory);
      const prefix = `${path.resolve(os.tmpdir())}${path.sep}ctn-agent-ipc-`;

      if (!resolved.startsWith(prefix)) {
        throw new Error("Refusing to clean an unexpected Agent IPC directory");
      }
      await rm(resolved, { force: true, recursive: true });
    }
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
      send(socket, { id: request.id, result: await capability.handle(request) });
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
