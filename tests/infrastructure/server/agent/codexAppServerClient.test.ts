// SPDX-License-Identifier: GPL-3.0-or-later

import { EventEmitter } from "node:events";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { CodexAppServerClient } from "../../../../infrastructure/server/agent/codexAppServerClient.ts";

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
});
