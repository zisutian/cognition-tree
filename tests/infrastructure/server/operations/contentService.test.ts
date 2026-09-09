// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createContentServiceFixture } from "./contentServiceFixture.ts";

const fixtures: Awaited<ReturnType<typeof createContentServiceFixture>>[] = [];
async function fixture() {
  const value = await createContentServiceFixture();
  fixtures.push(value);
  return value;
}
afterEach(async () => {
  for (const value of fixtures.splice(0)) await value.dispose();
});
const workspace = { domain: "workspace" as const, repository: "学习资料" };
const journal = { domain: "journal" as const };
const todo = { domain: "todo" as const };

describe("local semantic content use cases on real storage", () => {
  it("reads exact titles and paths, rejects ambiguity, and returns only the requested block", async () => {
    const value = await fixture();
    expect(
      await value.apply(
        { domain: "catalog" },
        { kind: "create-repository", name: workspace.repository },
      ),
    ).toMatchObject({ status: "committed" });
    for (const name of ["操作系统", "复习"]) {
      expect(
        await value.apply(workspace, {
          kind: "create-folder",
          parent: null,
          name,
        }),
      ).toMatchObject({ status: "committed" });
      expect(
        await value.apply(workspace, {
          kind: "create-note",
          parent: name,
          title: "进程",
          body: "- 父项\n\t: 局部内容\n- 无关的长内容",
        }),
      ).toMatchObject({ status: "committed" });
    }
    await expect(value.read(workspace, "进程")).rejects.toMatchObject({
      code: "target_ambiguous",
      candidates: ["操作系统/进程", "复习/进程"],
    });
    const note = await value.read(workspace, "操作系统/进程");
    const block = note.document.blocks.find(({ text }) => text === "局部内容")!;
    const selected = await value.read(
      workspace,
      "操作系统/进程",
      block.blockId,
    );
    expect(selected.document.editableText).toBe("\t: 局部内容");
    expect(JSON.stringify(selected)).not.toContain("无关的长内容");
    const operation = {
      operationId: randomUUID(),
      basis: note.basis,
      scope: workspace,
      command: {
        kind: "edit-content" as const,
        resource: "操作系统/进程",
        edit: {
          kind: "replace-text" as const,
          blockId: block.blockId,
          replacements: [{ oldText: "局部内容", newText: "精确改动" }],
        },
      },
    };
    const result = await value.service.execute(operation);
    expect(result).toMatchObject({ status: "committed", audit: "recorded" });
    expect(await value.service.execute(operation)).toEqual(result);
    expect(JSON.stringify(result)).not.toContain('content":{"schemaVersion');
    expect(
      (await value.read(workspace, "操作系统/进程")).document.blocks.find(
        ({ blockId }) => blockId === block.blockId,
      )?.text,
    ).toBe("精确改动");
    const repository = (await value.catalog.listRepositories())
      .repositories[0]!;
    expect(
      await readFile(
        path.join(repository.location.serverPath, "操作系统", "进程.ctn"),
        "utf8",
      ),
    ).toContain("精确改动");
  });

  it("binds a write to its read repository even when another repository has identical content and reuses the name", async () => {
    const value = await fixture();
    await value.apply(
      { domain: "catalog" },
      { kind: "create-repository", name: workspace.repository },
    );
    await value.apply(workspace, {
      kind: "create-note",
      parent: null,
      title: "目标",
      body: "- 原文",
    });
    const read = await value.read(workspace, "目标");
    const id = read.basis.repositoryId!;
    const snapshot = await (await value.catalog.getStore(id)).loadSnapshot();
    await value.catalog.renameRepository(id, { label: "已改名" });
    const clone = await value.catalog.createRepository({
      label: workspace.repository,
      content: snapshot.content,
    });
    const current = await value.read(workspace, "目标");
    expect(current.basis.baseRevision).toBe(read.basis.baseRevision);
    expect(clone.id).not.toBe(id);
    const result = await value.service.execute({
      operationId: randomUUID(),
      scope: workspace,
      basis: read.basis,
      command: {
        kind: "edit-content",
        resource: "目标",
        edit: {
          kind: "replace-text",
          blockId: null,
          replacements: [{ oldText: "原文", newText: "误写" }],
        },
      },
    });
    expect(result).toMatchObject({
      status: "conflict",
      error: { code: "target_identity_conflict" },
    });
    expect((await value.read(workspace, "目标")).document.editableText).toBe(
      "- 原文",
    );
    expect(
      (await value.read({ ...workspace, repository: "已改名" }, "目标"))
        .document.editableText,
    ).toBe("- 原文");
  });

  it("rejects stale name reuse after rename and commits cross-note moves once without changing identities", async () => {
    const value = await fixture();
    await value.apply(
      { domain: "catalog" },
      { kind: "create-repository", name: workspace.repository },
    );
    await value.apply(workspace, {
      kind: "create-note",
      parent: null,
      title: "原笔记",
      body: "- 父项\n\t: 子项",
    });
    const original = await value.read(workspace, "原笔记");
    await value.apply(workspace, {
      kind: "rename-note",
      resource: "原笔记",
      name: "新名称",
    });
    await value.apply(workspace, {
      kind: "create-note",
      parent: null,
      title: "原笔记",
      body: "- 新对象",
    });
    const rejected = await value.service.execute({
      scope: workspace,
      operationId: randomUUID(),
      basis: original.basis,
      command: { kind: "delete-note", resource: "原笔记" },
    });
    expect(rejected).toMatchObject({ status: "conflict" });
    expect((await value.read(workspace, "原笔记")).document.editableText).toBe(
      "- 新对象",
    );
    const moved = await value.apply(workspace, {
      kind: "move-block",
      resource: "新名称",
      blockId: original.document.blocks[0]!.blockId,
      targetResource: "原笔记",
      targetBlockId: null,
      position: "end",
    });
    expect(moved).toMatchObject({ status: "committed" });
    const target = await value.read(workspace, "原笔记");
    expect(target.document.blocks.map(({ blockId }) => blockId)).toEqual(
      expect.arrayContaining(
        original.document.blocks.map(({ blockId }) => blockId),
      ),
    );
    expect(
      (await value.read(workspace, "新名称")).document.blocks,
    ).toHaveLength(0);
  });

  it("edits a root note by explicit path and retains diagnostics outside parsed blocks", async () => {
    const value = await fixture();
    await value.apply(
      { domain: "catalog" },
      { kind: "create-repository", name: workspace.repository },
    );
    await value.apply(workspace, {
      kind: "create-folder",
      parent: null,
      name: "目录",
    });
    for (const parent of [null, "目录"]) {
      await value.apply(workspace, {
        kind: "create-note",
        parent,
        title: "进程",
        body: "- 正常内容\n! 未知行",
      });
    }
    const before = await value.read(workspace, "./进程");
    expect(before.document.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ lineNumber: 2 })]),
    );
    await value.apply(workspace, {
      kind: "edit-content",
      resource: "./进程",
      edit: {
        kind: "replace-text",
        blockId: null,
        replacements: [{ oldText: "! 未知行", newText: ": 已修复" }],
      },
    });
    expect(
      (await value.read(workspace, "./进程")).document.diagnostics,
    ).toEqual([]);
    expect(
      (await value.read(workspace, "目录/进程")).document.editableText,
    ).toContain("! 未知行");
  });

  it("edits and moves Journal subtrees while preserving the managed title", async () => {
    const value = await fixture();
    expect(
      await value.apply(journal, {
        kind: "create-entry",
        body: "- 第一项\n\t: 子项\n- 第二项",
      }),
    ).toMatchObject({ status: "committed" });
    const before = await value.read(journal, "2026-09-09-0001");
    expect(
      await value.apply(journal, {
        kind: "move-block",
        resource: before.resource.name,
        blockId: before.document.blocks[0]!.blockId,
        targetResource: before.resource.name,
        targetBlockId: null,
        position: "end",
      }),
    ).toMatchObject({ status: "committed" });
    const after = await value.read(journal, before.resource.name);
    expect(after.document.editableText).toBe("- 第二项\n- 第一项\n\t: 子项");
    expect(after.document.createdAt).toBe(before.document.createdAt);
    expect(after.document.blocks.map(({ blockId }) => blockId).sort()).toEqual(
      before.document.blocks.map(({ blockId }) => blockId).sort(),
    );
  });

  it("keeps Todo completion and recurrence visible in local reads", async () => {
    const value = await fixture();
    expect(
      await value.apply(todo, {
        kind: "create-collection",
        name: "今日计划",
        body: "[] 学习\n[] 复习",
      }),
    ).toMatchObject({ status: "committed" });
    const before = await value.read(todo, "今日计划");
    const blockId = before.document.blocks[0]!.blockId;
    expect(
      await value.apply(todo, {
        kind: "set-completion",
        resource: "今日计划",
        blockId,
        completed: true,
        occurrenceDate: null,
      }),
    ).toMatchObject({ status: "committed" });
    expect((await value.read(todo, "今日计划")).tasks[0]).toMatchObject({
      blockId,
      completed: true,
    });
    expect(
      await value.apply(todo, {
        kind: "set-recurrence",
        resource: "今日计划",
        blockId,
        rule: { kind: "daily", interval: 1 },
      }),
    ).toMatchObject({ status: "committed" });
    expect(
      (await value.read(todo, "今日计划")).tasks[0]?.recurrence,
    ).toMatchObject({ active: true, rule: { kind: "daily", interval: 1 } });
  });
  it("rejects catalog input before commit and maintains syntax configuration through named commands", async () => {
    const value = await fixture();
    await value.apply(
      { domain: "catalog" },
      { kind: "create-repository", name: workspace.repository },
    );
    expect(
      await value.apply(
        { domain: "catalog" },
        { kind: "create-repository", name: workspace.repository },
      ),
    ).toMatchObject({ status: "failed" });
    await value.apply(workspace, {
      kind: "create-note",
      parent: null,
      title: "原文",
      body: "- 保留内容",
    });
    const syntax = await value.service.query({
      kind: "syntax",
      scope: workspace,
    });
    if (syntax.kind !== "syntax") throw new Error("Expected syntax");
    const file = syntax.files[0]!;
    const source = file.source.replace(file.name, "专用语法");
    expect(
      await value.apply(workspace, { kind: "create-syntax", source }),
    ).toMatchObject({ status: "committed" });
    expect(
      await value.apply(workspace, {
        kind: "activate-syntax",
        syntax: "专用语法",
      }),
    ).toMatchObject({ status: "committed" });
    expect(
      await value.apply(workspace, {
        kind: "update-syntax",
        syntax: "专用语法",
        source,
      }),
    ).toMatchObject({ status: "committed" });
    expect(
      await value.apply(workspace, {
        kind: "delete-syntax",
        syntax: file.name,
      }),
    ).toMatchObject({ status: "committed" });
    expect(
      await value.apply(workspace, {
        kind: "delete-syntax",
        syntax: "专用语法",
      }),
    ).toMatchObject({ status: "committed" });
    expect((await value.read(workspace, "原文")).document).toMatchObject({
      editableText: "- 保留内容",
      blocks: [],
      writingGuide: null,
    });
    const beforeRaw = await value.catalog
      .getStore((await value.catalog.listRepositories()).repositories[0]!.id)
      .then((store) => store.loadSnapshot());
    expect(
      await value.apply(workspace, {
        kind: "edit-content",
        resource: "原文",
        edit: {
          kind: "replace-text",
          blockId: null,
          replacements: [
            { oldText: "保留内容", newText: "修改内容\n追加原文" },
          ],
        },
      }),
    ).toMatchObject({ status: "committed" });
    expect((await value.read(workspace, "原文")).document.editableText).toBe(
      "- 修改内容\n追加原文",
    );
    const afterRaw = await value.catalog
      .getStore((await value.catalog.listRepositories()).repositories[0]!.id)
      .then((store) => store.loadSnapshot());
    expect(afterRaw.content.workspace.notes[0]!.id).toBe(
      beforeRaw.content.workspace.notes[0]!.id,
    );
    expect(
      afterRaw.content.workspace.notes[0]!.source.match(
        /id=[^ ]+ created=[^ ]+/g,
      ),
    ).toEqual(
      beforeRaw.content.workspace.notes[0]!.source.match(
        /id=[^ ]+ created=[^ ]+/g,
      ),
    );
    expect(
      await value.apply(workspace, {
        kind: "edit-content",
        resource: "原文",
        edit: {
          kind: "insert-blocks",
          blockId: null,
          position: "end",
          text: "- 禁止块操作",
        },
      }),
    ).toMatchObject({ status: "failed" });
    for (const scope of [journal, todo]) {
      const current = await value.service.query({ kind: "syntax", scope });
      if (current.kind !== "syntax") throw new Error("Expected syntax");
      expect(
        await value.apply(scope, {
          kind: "update-syntax",
          syntax: null,
          source: current.files[0]!.source,
        }),
      ).toMatchObject({ status: "committed" });
      expect(
        await value.apply(scope, {
          kind: "update-syntax",
          syntax: null,
          source: "invalid",
        }),
      ).toMatchObject({ status: "failed" });
    }
  });

  it("applies multiple exact replacements atomically and rejects ambiguous or overlapping edits without writes", async () => {
    const value = await fixture();
    await value.apply(
      { domain: "catalog" },
      { kind: "create-repository", name: workspace.repository },
    );
    await value.apply(workspace, {
      kind: "create-note",
      parent: null,
      title: "精确文本",
      body: "- 重复\n- 重复\n- 唯一内容",
    });
    const before = await value.read(workspace, "精确文本");
    for (const replacements of [
      [{ oldText: "重复", newText: "改动" }],
      [
        { oldText: "唯一", newText: "改变" },
        { oldText: "不存在", newText: "失败" },
      ],
      [
        { oldText: "唯一内容", newText: "改变" },
        { oldText: "内容", newText: "失败" },
      ],
    ]) {
      expect(
        await value.apply(workspace, {
          kind: "edit-content",
          resource: "精确文本",
          edit: { kind: "replace-text", blockId: null, replacements },
        }),
      ).toMatchObject({ status: "failed" });
      expect(await value.read(workspace, "精确文本")).toEqual(before);
    }
    const last = before.document.blocks.at(-1)!;
    expect(
      await value.apply(workspace, {
        kind: "edit-content",
        resource: "精确文本",
        edit: {
          kind: "insert-blocks",
          blockId: last.blockId,
          position: "inside",
          text: ": 新子项",
        },
      }),
    ).toMatchObject({ status: "committed" });
    const inserted = await value.read(
      workspace,
      "精确文本",
      last.blockId,
      true,
    );
    expect(inserted.document.editableText).toBe("- 唯一内容\n\t: 新子项");
    expect(
      await value.apply(workspace, {
        kind: "edit-content",
        resource: "精确文本",
        edit: { kind: "delete-subtree", blockId: last.blockId },
      }),
    ).toMatchObject({ status: "committed" });
    expect(
      (await value.read(workspace, "精确文本")).document.blocks.map(
        ({ blockId, createdAt }) => ({ blockId, createdAt }),
      ),
    ).toEqual(
      before.document.blocks
        .slice(0, 2)
        .map(({ blockId, createdAt }) => ({ blockId, createdAt })),
    );
  });
});
