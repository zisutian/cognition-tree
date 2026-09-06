// SPDX-License-Identifier: GPL-3.0-or-later

import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { AgentRuntimeProtocolError } from "../../../application/agent/index.ts";
import { listenToAgentJsonLines } from "./jsonLineTransport.ts";

type OutgoingJsonRpcMessage = {
  error?: { code: number; message: string };
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
};

export type CodexJsonRpcMessage =
  | {
      id: number | string;
      kind: "server-request";
      method: string;
      params?: unknown;
    }
  | {
      kind: "notification";
      method: string;
      params?: unknown;
    }
  | (
      | { error: { code: number; message: string } }
      | { result: unknown }
    ) & { id: number; kind: "response" };

type NotificationListener = (
  message: Extract<CodexJsonRpcMessage, { kind: "notification" }>,
) => void;

function protocolError() {
  return new AgentRuntimeProtocolError("Codex emitted invalid JSON-RPC");
}

export function parseCodexJsonRpcMessage(line: string): CodexJsonRpcMessage {
  let parsed: unknown;

  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    throw protocolError();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw protocolError();
  }
  const record = parsed as Record<string, unknown>;

  if ("method" in record) {
    if (typeof record.method !== "string" || record.method.length === 0) {
      throw protocolError();
    }
    if (!("id" in record)) {
      return {
        kind: "notification",
        method: record.method,
        ...(record.params === undefined ? {} : { params: record.params }),
      };
    }
    if (
      typeof record.id !== "string" &&
      !(typeof record.id === "number" && Number.isSafeInteger(record.id))
    ) {
      throw protocolError();
    }
    return {
      id: record.id,
      kind: "server-request",
      method: record.method,
      ...(record.params === undefined ? {} : { params: record.params }),
    };
  }
  if (!Number.isSafeInteger(record.id)) throw protocolError();
  const id = record.id as number;
  const hasError = Object.prototype.hasOwnProperty.call(record, "error");
  const hasResult = Object.prototype.hasOwnProperty.call(record, "result");

  if (hasError === hasResult) throw protocolError();
  if (hasResult) return { id, kind: "response", result: record.result };
  if (!record.error || typeof record.error !== "object" ||
      Array.isArray(record.error)) {
    throw protocolError();
  }
  const error = record.error as Record<string, unknown>;

  if (typeof error.code !== "number" || !Number.isFinite(error.code) ||
      typeof error.message !== "string") {
    throw protocolError();
  }
  return {
    error: { code: error.code, message: error.message },
    id,
    kind: "response",
  };
}

export class CodexAppServerClient {
  readonly #child: ChildProcessWithoutNullStreams;
  #closedError: AgentRuntimeProtocolError | null = null;
  readonly #listeners = new Set<NotificationListener>();
  #nextId = 1;
  readonly #pending = new Map<number, {
    reject(error: Error): void;
    resolve(value: unknown): void;
  }>();
  #stopReading: () => void = () => undefined;

  constructor(child: ChildProcessWithoutNullStreams) {
    this.#child = child;
    child.stderr.resume();
    this.#stopReading = listenToAgentJsonLines(child.stdout, {
      onFailure: () => this.#close(new AgentRuntimeProtocolError(
        "Codex emitted invalid JSON-RPC framing",
      )),
      onLine: (line) => this.#receive(line),
    });
    child.once("exit", (code, signal) => {
      this.#close(new AgentRuntimeProtocolError(
        `Codex app-server exited (${code ?? signal ?? "unknown"})`,
      ));
    });
    child.once("error", () => this.#close(
      new AgentRuntimeProtocolError("Codex app-server failed to start"),
    ));
    child.stdin.once("error", () => this.#close(
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

  #close(error: AgentRuntimeProtocolError) {
    if (this.#closedError) return;
    this.#closedError = error;
    this.#stopReading();
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
    this.#listeners.clear();
  }

  #send(message: OutgoingJsonRpcMessage) {
    if (this.#closedError) throw this.#closedError;
    this.#child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #receive(line: string) {
    if (this.#closedError) return false;
    let message: CodexJsonRpcMessage;

    try {
      message = parseCodexJsonRpcMessage(line);
    } catch (error) {
      this.#close(
        error instanceof AgentRuntimeProtocolError ? error : protocolError(),
      );
      return false;
    }
    if (message.kind === "server-request") {
      this.#resolveServerRequest(message);
      return true;
    }
    if (message.kind === "response") {
      const pending = this.#pending.get(message.id);

      if (!pending) return true;
      this.#pending.delete(message.id);
      if ("error" in message) {
        pending.reject(new AgentRuntimeProtocolError(
          `Codex JSON-RPC error: ${message.error.message}`,
        ));
      } else {
        pending.resolve(message.result);
      }
      return true;
    }
    for (const listener of this.#listeners) listener(message);
    return true;
  }

  #resolveServerRequest(
    message: Extract<CodexJsonRpcMessage, { kind: "server-request" }>,
  ) {
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
