// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, expect, it } from "vitest";
import type { ContentQueryResult } from "../../../../application/content/index.ts";
import { createContentServiceFixture } from "./contentServiceFixture.ts";

const scope = { domain: "workspace", repository: "语义目录" } as const;
const fixtures: Awaited<ReturnType<typeof createContentServiceFixture>>[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.dispose();
});
async function fixture() {
  const value = await createContentServiceFixture();
  fixtures.push(value);
  await value.apply(
    { domain: "catalog" },
    { kind: "create-repository", name: scope.repository },
  );
  await value.apply(scope, {
    kind: "create-folder",
    name: "目录",
    parent: null,
  });
  for (const title of ["题一", "题二", "根笔记"])
    await value.apply(scope, {
      kind: "create-note",
      title,
      parent: title === "根笔记" ? null : "目录",
      body: "- 共同甲\n- 共同乙\n- 其他正文",
    });
  return value;
}
function directory(result: ContentQueryResult) {
  if (result.kind !== "directory") throw new Error("Expected directory");
  return result;
}
function search(result: ContentQueryResult) {
  if (result.kind !== "search") throw new Error("Expected search");
  return result;
}

it("searches Todo text without task-state work and calculates only the requested block state", async () => {
  const value = await createContentServiceFixture();
  fixtures.push(value);
  const todo = { domain: "todo" } as const;
  await value.apply(todo, {
    kind: "create-collection",
    name: "局部查询",
    body: "[] 学习\n[] 复习",
  });
  const full = await value.read(todo, "局部查询");
  const selected = full.document.blocks[0]!.blockId;
  let dateReads = 0;
  let stateVersions = 0;
  value.ports.runtime.today = () => {
    dateReads += 1;
    return "2026-09-09";
  };
  const versions = value.ports.versions.todo;
  value.ports.versions.todo = {
    ...versions,
    itemState(...args) {
      stateVersions += 1;
      return versions.itemState(...args);
    },
  };

  const matches = search(
    await value.service.query({
      kind: "search",
      scope: todo,
      text: "学习",
      limit: 10,
    }),
  );
  expect(matches.results.map(({ blockId }) => blockId)).toEqual([selected]);
  expect(dateReads).toBe(0);
  expect(stateVersions).toBe(0);

  const partial = await value.read(todo, "局部查询", selected);
  expect(partial.tasks).toEqual(
    full.tasks.filter(({ blockId }) => blockId === selected),
  );
  expect(partial.document.blocks.map(({ blockId }) => blockId)).toEqual([
    selected,
  ]);
  expect(dateReads).toBe(1);
  expect(stateVersions).toBe(1);
  expect(partial.basis).toEqual(full.basis);
});

it("pages root and relative folders without losing hierarchy and invalidates changed snapshots", async () => {
  const value = await fixture();
  expect(
    directory(
      await value.service.query({ kind: "directory", scope }),
    ).resources.map((item) => item.path),
  ).toEqual(["未命名笔记", "目录", "根笔记"]);
  const first = directory(
    await value.service.query({
      kind: "directory",
      scope,
      parent: "目录",
      limit: 1,
    }),
  );
  expect(first.resources.map((item) => item.path)).toEqual(["目录/题一"]);
  const second = directory(
    await value.service.query({
      kind: "directory",
      scope,
      parent: "目录",
      limit: 1,
      cursor: first.nextCursor!,
    }),
  );
  expect(second.resources.map((item) => item.path)).toEqual(["目录/题二"]);
  expect(second.nextCursor).toBeNull();
  expect(
    directory(
      await value.service.query({ kind: "directory", scope, recursive: true }),
    ).resources,
  ).toHaveLength(5);
  await expect(
    value.service.query({
      kind: "directory",
      scope,
      limit: 1,
      cursor: first.nextCursor!,
    }),
  ).rejects.toThrow("another query");
  await value.apply(scope, {
    kind: "rename-note",
    resource: "题二",
    name: "改名",
  });
  await expect(
    value.service.query({
      kind: "directory",
      scope,
      parent: "目录",
      limit: 1,
      cursor: first.nextCursor!,
    }),
  ).rejects.toMatchObject({ name: "VersionedContentRevisionConflictError" });
});

it("continues search across resources and refuses a cursor from another query", async () => {
  const value = await fixture();
  const query = { kind: "search", scope, text: "共同", limit: 2 } as const;
  const first = search(await value.service.query(query));
  const second = search(
    await value.service.query({ ...query, cursor: first.nextCursor! }),
  );
  const third = search(
    await value.service.query({ ...query, cursor: second.nextCursor! }),
  );
  expect(third.nextCursor).toBeNull();
  expect(
    new Set(
      [...first.results, ...second.results, ...third.results].map(
        (item) => item.blockId,
      ),
    ).size,
  ).toBe(6);
  expect(JSON.stringify(first)).not.toContain("其他正文");
  await expect(
    value.service.query({ ...query, text: "其他", cursor: first.nextCursor! }),
  ).rejects.toThrow("another query");
  await expect(
    value.service.query({ ...query, cursor: "malformed" }),
  ).rejects.toThrow("Invalid page cursor");
});

it("returns syntax guides and names by default and only the selected source on demand", async () => {
  const value = await fixture();
  const initial = await value.service.query({
    kind: "syntax",
    scope,
    includeSource: true,
  });
  if (initial.kind !== "syntax") throw new Error("Expected syntax");
  const original = initial.files.find((file) => file.source)!;
  await value.apply(scope, {
    kind: "create-syntax",
    source: original.source!.replace(original.name, "另一个语法"),
  });
  const guide = await value.service.query({ kind: "syntax", scope });
  if (guide.kind !== "syntax") throw new Error("Expected syntax");
  expect(guide.files).toHaveLength(2);
  expect(guide.files.every((file) => file.source === undefined)).toBe(true);
  const selected = await value.service.query({
    kind: "syntax",
    scope,
    file: "另一个语法",
    includeSource: true,
  });
  if (selected.kind !== "syntax") throw new Error("Expected syntax");
  expect(
    selected.files.filter((file) => file.source).map((file) => file.name),
  ).toEqual(["另一个语法"]);
  expect(selected.guide).not.toBeNull();
  expect(JSON.stringify(selected).length).toBeGreaterThan(
    JSON.stringify(guide).length,
  );
});
