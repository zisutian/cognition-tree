// SPDX-License-Identifier: GPL-3.0-or-later

import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import type {
  ContentOperationRequest,
  ContentQueryResult,
} from "../../../../application/content/index.ts";
import type { ContentOperationResult } from "../../../../application/operations/index.ts";

function child(root: string, phase: string) {
  const process = fork(
    new URL("./fixtures/contentServiceChild.ts", import.meta.url),
    [root, phase],
    {
      execArgv: ["--import", "tsx"],
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
  let error = "";
  process.stderr!.on("data", (data) => {
    error += String(data);
  });
  const exit = once(process, "exit");
  const message = Promise.race([
    once(process, "message").then(([value]) => value),
    exit.then(() => {
      throw new Error(`Child exited without evidence: ${error}`);
    }),
  ]);
  return { process, exit, message };
}

it.each(["before-commit", "after-commit"])(
  "recovers a real Journal operation without replay after SIGKILL %s",
  async (phase) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ctn-content-process-"));
    const processes: ReturnType<typeof child>[] = [];
    try {
      const writer = child(root, phase);
      processes.push(writer);
      const { request } = (await writer.message) as {
        request: ContentOperationRequest;
      };
      await writeFile(path.join(root, "request.json"), JSON.stringify(request));
      writer.process.kill("SIGKILL");
      await writer.exit;
      const reader = child(root, "reopen");
      processes.push(reader);
      const evidence = (await reader.message) as {
        result: ContentOperationResult;
        repeated: ContentOperationResult;
        directory: ContentQueryResult;
      };
      await reader.exit;
      expect(evidence.result).toMatchObject({
        operationId: request.operationId,
        status: "indeterminate",
      });
      expect(evidence.result.preparation).toMatchObject({
        repositoryId: null,
        targets: [{ type: "journal-entry", actions: ["created"] }],
      });
      expect(
        evidence.result.preparation!.targets[0]!.after!.label,
      ).toBeTruthy();
      expect(
        evidence.result.preparation!.expectedAfterRevision ===
          evidence.directory.basis.baseRevision,
      ).toBe(phase === "after-commit");
      expect(evidence.repeated).toEqual(evidence.result);
      if (evidence.directory.kind !== "directory")
        throw new Error("Missing directory result");
      expect(evidence.directory.resources).toHaveLength(
        phase === "after-commit" ? 1 : 0,
      );
      const disk = await readFile(
        path.join(
          root,
          "repositories",
          ".built-ins",
          "journal",
          "content.json",
        ),
        "utf8",
      );
      if (phase === "after-commit") expect(disk).toContain("中断后的真实内容");
      else expect(disk).not.toContain("中断后的真实内容");
    } finally {
      for (const value of processes)
        if (
          value.process.exitCode === null &&
          value.process.signalCode === null
        ) {
          value.process.kill("SIGKILL");
          await value.exit;
        }
      await rm(root, { force: true, recursive: true });
    }
  },
);
