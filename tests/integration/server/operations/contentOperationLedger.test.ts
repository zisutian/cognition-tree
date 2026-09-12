// SPDX-License-Identifier: GPL-3.0-or-later

import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ContentOperationIdempotencyError,
  OperationAuditUnavailableError,
  type ContentOperationIntent,
  type ContentOperationOutcome,
} from "../../../../application/operations/index.ts";
import { OperationLedger } from "../../../../infrastructure/server/operations/index.ts";
import { replaceFileDurably } from "../../../../infrastructure/server/persistence/index.ts";

const roots: string[] = [];
const revision = (value: string): `sha256:${string}` =>
  `sha256:${value.repeat(64)}`;
const intent: ContentOperationIntent = {
  baseRevision: revision("a"),
  command: "replace-text",
  digest: revision("b"),
  occurredAt: "2026-09-09T00:00:00.000Z",
  operationId: "operation-1",
  scope: { domain: "journal" },
};
const committed: ContentOperationOutcome = {
  afterRevision: revision("c"),
  changeMetadata: { blockIds: ["block-1"], resourceIds: ["entry-1"] },
  error: null,
  review: { resources: [], storeLabel: "日记" },
  status: "committed",
};
async function temporaryRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ctn-content-ledger-"));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("durable content operation receipts", () => {
  it("deduplicates concurrent calls and survives restart and audit trimming", async () => {
    const root = await temporaryRoot();
    const ledger = new OperationLedger(root, 1);
    await ledger.initialize();
    const execute = vi.fn(async () => committed);
    const [first, repeated] = await Promise.all([
      ledger.runContentOperation(intent, execute),
      ledger.runContentOperation(intent, execute),
    ]);
    expect(first).toEqual(repeated);
    expect(first.audit).toBe("recorded");
    expect(execute).toHaveBeenCalledTimes(1);
    await ledger.runContentOperation(
      { ...intent, operationId: "operation-2" },
      execute,
    );
    expect(
      (await ledger.list({ cursor: 0, limit: 10 })).entries.map(({ id }) => id),
    ).toEqual(["content-operation-2"]);
    const restarted = new OperationLedger(root, 1);
    await restarted.initialize();
    execute.mockClear();
    expect(await restarted.runContentOperation(intent, execute)).toEqual(first);
    expect(execute).not.toHaveBeenCalled();
    await expect(
      restarted.runContentOperation(
        { ...intent, digest: revision("d") },
        execute,
      ),
    ).rejects.toBeInstanceOf(ContentOperationIdempotencyError);
  });

  it("reports a proven commit when audit finalization fails and never executes it twice", async () => {
    const root = await temporaryRoot();
    let fail = false;
    const ledger = new OperationLedger(root, 10, {
      replaceStateFile: async (target, text) => {
        if (fail)
          throw new Error("Injected disk failure after content commit.");
        await replaceFileDurably(target, text);
      },
    });
    await ledger.initialize();
    const execute = vi.fn(async () => {
      fail = true;
      return committed;
    });
    const result = await ledger.runContentOperation(intent, execute);
    expect(result).toMatchObject({
      status: "committed",
      audit: "failed",
      afterRevision: revision("c"),
    });
    expect(await ledger.runContentOperation(intent, execute)).toEqual(result);
    expect(await ledger.getContentOperation(intent.operationId)).toEqual(
      result,
    );
    expect(execute).toHaveBeenCalledTimes(1);
    const restarted = new OperationLedger(root, 10);
    await restarted.initialize();
    expect(await restarted.runContentOperation(intent, execute)).toMatchObject({
      status: "indeterminate",
      afterRevision: null,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each(["before-effect", "after-effect"])(
    "does not replay after a real child process is killed %s",
    async (phase) => {
      const root = await temporaryRoot();
      const child = fork(
        new URL("./fixtures/contentOperationChild.ts", import.meta.url),
        [root, phase],
        {
          execArgv: ["--import", "tsx"],
          stdio: ["ignore", "ignore", "pipe", "ipc"],
        },
      );
      const exited = once(child, "exit");
      try {
        await Promise.race([
          once(child, "message"),
          exited.then(() => {
            throw new Error("Child exited before persisting its intent.");
          }),
        ]);
        child.kill("SIGKILL");
        await exited;
        const restarted = new OperationLedger(root, 5);
        expect(await restarted.initialize()).toEqual({ status: "available" });
        const result = await restarted.getContentOperation("interrupted");
        expect(result).toMatchObject({
          status: "indeterminate",
          audit: "failed",
        });
        const execute = vi.fn(async () => committed);
        expect(
          await restarted.runContentOperation(
            { ...intent, operationId: "interrupted" },
            execute,
          ),
        ).toEqual(result);
        expect(execute).not.toHaveBeenCalled();
        if (phase === "after-effect")
          expect(await readFile(path.join(root, "effect.txt"), "utf8")).toBe(
            "executed",
          );
        else
          await expect(
            readFile(path.join(root, "effect.txt")),
          ).rejects.toHaveProperty("code", "ENOENT");
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
          await exited;
        }
      }
    },
  );
});

it("retains historical trusted-client audit when upgrading a version 2 ledger", async () => {
  const root = await temporaryRoot();
  const { mkdir, writeFile } = await import("node:fs/promises");
  const directory = path.join(root, "operations-v1");
  await mkdir(directory, { mode: 0o700 });
  const entry = {
    afterRevision: revision("c"),
    beforeRevision: revision("a"),
    changeMetadata: { blockIds: [], resourceIds: ["entry-old"] },
    id: "legacy-operation",
    intentDigest: revision("b"),
    occurredAt: "2026-09-01T00:00:00.000Z",
    principalId: "legacy-client",
    requestId: "legacy-operation",
    result: "committed",
    route: "putJournalSyncSnapshot",
    source: "trusted-client",
    store: { domain: "journal" },
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
  await writeFile(
    path.join(directory, "operations.json"),
    JSON.stringify({
      formatVersion: 2,
      auditEntries: [{ entry, pending: false }],
      agentReceipts: [],
    }),
    { mode: 0o600 },
  );
  const ledger = new OperationLedger(root, 10);
  expect(await ledger.initialize()).toEqual({ status: "available" });
  expect((await ledger.list({ cursor: 0, limit: 10 })).entries).toEqual([
    entry,
  ]);
  await ledger.runContentOperation(intent, async () => committed);
  const reopened = new OperationLedger(root, 10);
  expect(
    (await reopened.list({ cursor: 0, limit: 10 })).entries,
  ).toContainEqual(entry);
});

it("keeps receipts usable after their aggregate size exceeds the former 64 MiB partition limit", async () => {
  const root = await temporaryRoot();
  const ledger = new OperationLedger(root, 1);
  await ledger.initialize();
  const large: ContentOperationOutcome = {
    ...committed,
    review: {
      storeLabel: "日记",
      resources: [
        {
          type: "journal-entry",
          resourceId: "entry-1",
          actions: ["content-updated"],
          before: { label: "记录", path: "记录" },
          after: { label: "记录", path: "记录" },
          blockSummary: {
            created: 0,
            deleted: 0,
            moved: 0,
            stateUpdated: 0,
            updated: 1,
          },
          diff: [
            {
              lines: [
                {
                  beforeLineNumber: 1,
                  afterLineNumber: null,
                  kind: "removed",
                  text: "x".repeat(4 * 1024 * 1024),
                },
              ],
            },
          ],
        },
      ],
    },
  };
  for (let index = 0; index < 17; index++) {
    expect(
      (
        await ledger.runContentOperation(
          { ...intent, operationId: `large-${index}` },
          async () => large,
        )
      ).audit,
    ).toBe("recorded");
  }
  expect(
    (await readFile(path.join(root, "operations-v1", "operations.json")))
      .length,
  ).toBeLessThan(16 * 1024);
  const restarted = new OperationLedger(root, 1);
  await restarted.initialize();
  expect((await restarted.getContentOperation("large-0"))?.review).toEqual(
    large.review,
  );
  expect(
    (
      await restarted.runContentOperation(
        { ...intent, operationId: "after-growth" },
        async () => committed,
      )
    ).status,
  ).toBe("committed");
}, 30000);

it("persists the content result independently of an audit write failure", async () => {
  const root = await temporaryRoot();
  let failAudit = false;
  const ledger = new OperationLedger(root, 1, {
    replaceStateFile: async (target, text) => {
      if (failAudit && path.basename(target) === "operations.json")
        throw new Error("Audit disk failure");
      await replaceFileDurably(target, text);
    },
  });
  await ledger.initialize();
  const result = await ledger.runContentOperation(intent, async () => {
    failAudit = true;
    return committed;
  });
  expect(result).toMatchObject({ status: "committed", audit: "failed" });
  expect(await ledger.getContentOperation(intent.operationId)).toEqual(result);
  const blocked = vi.fn(async () => committed);
  expect(await ledger.runContentOperation(intent, blocked)).toEqual(result);
  expect(blocked).not.toHaveBeenCalled();
  const reopened = new OperationLedger(root, 1);
  await reopened.initialize();
  const execute = vi.fn(async () => committed);
  expect(await reopened.runContentOperation(intent, execute)).toEqual(result);
  expect(execute).not.toHaveBeenCalled();
});

it("keeps independent committed receipts readable but refuses new writes after ledger authority becomes unavailable", async () => {
  const root = await temporaryRoot();
  const ledger = new OperationLedger(root, 1);
  const result = await ledger.runContentOperation(
    intent,
    async () => committed,
  );
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    path.join(root, "operations-v1", "operations.json"),
    "{invalid",
  );
  expect((await ledger.status()).status).toBe("unavailable");
  expect(await ledger.getContentOperation(intent.operationId)).toEqual(result);
  const execute = vi.fn(async () => committed);
  expect(await ledger.runContentOperation(intent, execute)).toEqual(result);
  await expect(
    ledger.runContentOperation(
      { ...intent, operationId: "after-ledger-failure" },
      execute,
    ),
  ).rejects.toBeInstanceOf(OperationAuditUnavailableError);
  expect(execute).not.toHaveBeenCalled();
});

it.each(["query", "repeat"])(
  "prepares legacy receipt authority before %s without explicit initialization",
  async (action) => {
    const root = await temporaryRoot();
    const { mkdir, writeFile } = await import("node:fs/promises");
    const directory = path.join(root, "operations-v1");
    await mkdir(directory, { mode: 0o700 });
    const receipt = {
      ...intent,
      ...committed,
      status: "pending",
      afterRevision: null,
      preparation: null,
      audit: "pending",
      updatedAt: intent.occurredAt,
    };
    await writeFile(
      path.join(directory, "operations.json"),
      JSON.stringify({
        formatVersion: 3,
        contentReceipts: [receipt],
        agentReceipts: [],
        auditEntries: [],
      }),
      { mode: 0o600 },
    );
    const ledger = new OperationLedger(root, 1);
    const execute = vi.fn(async () => committed);
    const result =
      action === "query"
        ? await ledger.getContentOperation(intent.operationId)
        : await ledger.runContentOperation(intent, execute);
    expect(result).toMatchObject({
      operationId: intent.operationId,
      status: "indeterminate",
      afterRevision: null,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(
      JSON.parse(
        await readFile(path.join(directory, "operations.json"), "utf8"),
      ),
    ).not.toHaveProperty("contentReceipts");
  },
);

it("resumes a legacy receipt migration after the index replacement fails", async () => {
  const root = await temporaryRoot();
  const { mkdir, writeFile } = await import("node:fs/promises");
  const directory = path.join(root, "operations-v1");
  await mkdir(directory, { mode: 0o700 });
  const receipt = {
    ...intent,
    ...committed,
    preparation: null,
    audit: "recorded",
    updatedAt: intent.occurredAt,
  };
  await writeFile(
    path.join(directory, "operations.json"),
    JSON.stringify({
      formatVersion: 3,
      contentReceipts: [receipt],
      agentReceipts: [],
      auditEntries: [],
    }),
    { mode: 0o600 },
  );
  const interrupted = new OperationLedger(root, 1, {
    replaceStateFile: async (target, text) => {
      if (path.basename(target) === "operations.json")
        throw new Error("Migration index replacement failed");
      await replaceFileDurably(target, text);
    },
  });
  expect((await interrupted.initialize()).status).toBe("unavailable");
  const restarted = new OperationLedger(root, 1);
  expect((await restarted.initialize()).status).toBe("available");
  expect(await restarted.getContentOperation(intent.operationId)).toEqual(
    receipt,
  );
  const index = JSON.parse(
    await readFile(path.join(directory, "operations.json"), "utf8"),
  );
  expect(index.formatVersion).toBe(4);
  expect(index).not.toHaveProperty("contentReceipts");
});
