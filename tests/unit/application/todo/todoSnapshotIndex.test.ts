// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { createTodoParseIndex } from "../../../../core/todo/indexes/todoParseIndex.ts";
import { projectTodoItemStates } from "../../../../application/todo/todoItemStates.ts";
import { createTodoResourceVersions } from "../../../../application/todo/todoResourceVersions.ts";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoBlockId,
  todoCollectionId,
  todoTimestamp,
} from "../../../support/core/todo/todoTestFixture.ts";

describe("Todo snapshot lookup", () => {
  it("shares indexed lookups, preserves partial reads, and rebuilds for a new snapshot", () => {
    let content = appendTodoTestCollection(createEmptyTodoContent(), {
      collectionIndex: 1,
      createdAt: todoTimestamp(1),
      name: "任务",
    });
    for (let itemIndex = 1; itemIndex <= 2; itemIndex += 1) {
      content = appendTodoTestItem(content, {
        collectionIndex: 1,
        createdAt: todoTimestamp(itemIndex + 1),
        itemIndex,
        text: `任务 ${itemIndex}`,
      });
    }
    const collection = content.collections[0]!;
    const first = {
      ...collection,
      completions: [{ blockId: todoBlockId(1), completedAt: todoTimestamp(4) }],
    };
    const firstContent = { ...content, collections: [first] };
    const digest = (value: unknown) =>
      `sha256:${JSON.stringify(value)}` as `sha256:${string}`;
    const versions = createTodoResourceVersions(digest);
    const parsed = createTodoParseIndex(firstContent).getParsedCollection(todoCollectionId(1))!;

    expect(projectTodoItemStates(parsed, "2026-07-18", versions.itemState))
      .toMatchObject([
        { blockId: todoBlockId(1), completed: true, completedAt: todoTimestamp(4) },
        { blockId: todoBlockId(2), completed: false, completedAt: null },
      ]);
    expect(projectTodoItemStates(parsed, "2026-07-18", versions.itemState,
      new Set([todoBlockId(2)]))).toHaveLength(1);
    const originalVersion = versions.itemState(first, todoBlockId(1));
    const second = {
      ...first,
      completions: [{ blockId: todoBlockId(1), completedAt: todoTimestamp(5) }],
    };
    expect(versions.itemState(second, todoBlockId(1))).not.toBe(originalVersion);
    const removed = { ...second, completions: [] };
    expect(versions.itemState(removed, todoBlockId(1))).not.toBe(originalVersion);
  });
});
