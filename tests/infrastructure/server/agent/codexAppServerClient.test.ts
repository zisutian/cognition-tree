// SPDX-License-Identifier: GPL-3.0-or-later

import { EventEmitter } from "node:events";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  CodexAppServerClient,
  parseCodexJsonRpcMessage,
} from "../../../../infrastructure/server/agent/codexAppServerClient.ts";

function createChild() {
  return Object.assign(new EventEmitter(), {
    exitCode: null,
    pid: 1,
    signalCode: null,
    stderr: new PassThrough(),
    stdin: new PassThrough(),
    stdout: new PassThrough(),
  }) as unknown as ChildProcessWithoutNullStreams;
}

describe("Codex app-server client", () => {
  it("parses the three accepted inbound message shapes", () => {
    expect(parseCodexJsonRpcMessage(JSON.stringify({
      id: 1,
      result: { thread: "ready" },
    }))).toEqual({
      id: 1,
      kind: "response",
      result: { thread: "ready" },
    });
    expect(parseCodexJsonRpcMessage(JSON.stringify({
      method: "turn/completed",
      params: { status: "completed" },
    }))).toEqual({
      kind: "notification",
      method: "turn/completed",
      params: { status: "completed" },
    });
    expect(parseCodexJsonRpcMessage(JSON.stringify({
      id: "approval-1",
      method: "item/fileChange/requestApproval",
      params: {},
    }))).toEqual({
      id: "approval-1",
      kind: "server-request",
      method: "item/fileChange/requestApproval",
      params: {},
    });
  });

  it("rejects non-objects and ambiguous responses", () => {
    for (const value of [null, [], 1, "response", { id: 1 }, {
      error: { code: -1, message: "failed" },
      id: 1,
      result: null,
    }]) {
      expect(() => parseCodexJsonRpcMessage(JSON.stringify(value)))
        .toThrow("invalid JSON-RPC");
    }
  });

  it("rejects pending and future requests after the child exits", async () => {
    const child = createChild();
    const client = new CodexAppServerClient(child);
    const pending = client.request("thread/start", {});

    child.emit("exit", 1, null);

    await expect(pending).rejects.toThrow("Codex app-server exited (1)");
    await expect(client.request("thread/start", {})).rejects.toThrow(
      "Codex app-server exited (1)",
    );
  });

  it("closes permanently after malformed child output", async () => {
    const child = createChild();
    const client = new CodexAppServerClient(child);
    const pending = client.request("thread/start", {});

    child.stdout.push("null\n");

    await expect(pending).rejects.toThrow("invalid JSON-RPC");
    await expect(client.request("thread/start", {})).rejects.toThrow(
      "invalid JSON-RPC",
    );
  });
});
