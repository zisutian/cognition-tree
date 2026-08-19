// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  createTodoCollectionWithTasks,
  firstParsedTodoCollection,
  moveTodoBlockForTest,
  todoBlockId,
  todoCollectionId,
  todoTimestamp,
  toggleTodoBlockForTest,
} from "./todoCommandTestFixture";

describe("Todo block commands", () => {
  it("moves a task subtree within one collection without losing completion", () => {
    const content = toggleTodoBlockForTest(createTodoCollectionWithTasks(), {
      blockId: todoBlockId(2),
      collectionId: todoCollectionId(1),
      completedAt: todoTimestamp(4),
      today: "2026-07-18",
    });
    const moved = moveTodoBlockForTest(content, {
      blockId: todoBlockId(2),
      collectionId: todoCollectionId(1),
      target: { kind: "above", targetBlockId: todoBlockId(1) },
      updatedAt: todoTimestamp(5),
    });
    const parsed = firstParsedTodoCollection(moved);

    expect(
      parsed.analysis.document.blocks
        .slice(1)
        .map(({ id, level }) => ({ id, level })),
    ).toEqual([
      { id: todoBlockId(2), level: 0 },
      { id: todoBlockId(1), level: 0 },
    ]);
    expect(moved.collections[0]!.completions).toEqual(
      content.collections[0]!.completions,
    );
  });
});
