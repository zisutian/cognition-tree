// SPDX-License-Identifier: GPL-3.0-or-later

import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { AgentRuntimeProtocolError } from "../../../application/agent/agentRuntimePort.ts";

export const pinnedCodexVersion = "0.148.0";

type JsonRpcMessage = {
  error?: { code?: number; message?: string };
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
};

type NotificationListener = (message: JsonRpcMessage) => void;

export class CodexAppServerClient {
  readonly #child: ChildProcessWithoutNullStreams;
  #closedError: AgentRuntimeProtocolError | null = null;
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
    const close = (error: AgentRuntimeProtocolError) => {
      if (this.#closedError) return;
      this.#closedError = error;
      for (const pending of this.#pending.values()) pending.reject(error);
      this.#pending.clear();
      this.#listeners.clear();
    };

    lines.on("line", (line) => this.#receive(line));
    child.once("exit", (code, signal) => {
      close(new AgentRuntimeProtocolError(
        `Codex app-server exited (${code ?? signal ?? "unknown"})`,
      ));
    });
    child.once("error", () => close(
      new AgentRuntimeProtocolError("Codex app-server failed to start"),
    ));
    child.stdin.once("error", () => close(
      new AgentRuntimeProtocolError("Codex app-server input closed"),
    ));
  }

  notify(method: string, params: unknown) {
    this.#send({ method, params });
  }

  request(method: string, params: unknown) {
    if (this.#closedError) return Promise.reject(this.#closedError);
    const id = this.#nextId++;

    return new Promise<unknown>((resolve, reject) => {
      this.#pending.set(id, { reject, resolve });
      try {
        this.#send({ id, method, params });
      } catch (error) {
        this.#pending.delete(id);
        reject(error);
      }
    });
  }

  subscribe(listener: NotificationListener) {
    if (this.#closedError) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #send(message: JsonRpcMessage) {
    if (this.#closedError) throw this.#closedError;
    this.#child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #receive(line: string) {
    if (this.#closedError) return;
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
          `Codex JSON-RPC error: ${
            message.error.message ?? message.error.code ?? "unknown"
          }`,
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

export async function resolveCodexEntrypoint(projectRoot: string) {
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

export function withTimeout<Value>(
  promise: Promise<Value>,
  milliseconds: number,
  message: string,
) {
  return new Promise<Value>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new AgentRuntimeProtocolError(message)),
      milliseconds,
    );

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
