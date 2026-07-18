// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  SystemRepositoryContentValidationError,
  SystemRepositoryTransitionValidationError,
  validateSystemRepositoryContent,
  validateSystemRepositoryTransition,
} from "../../../src/storage/repository/systemRepository";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoTimestamp,
} from "../../todo/todoTestFixture";

function createTodoContent() {
  return appendTodoTestItem(
    appendTodoTestCollection(createEmptyTodoContent(), {
      collectionIndex: 1,
      createdAt: todoTimestamp(1),
    }),
    {
      collectionIndex: 1,
      createdAt: todoTimestamp(2),
      itemIndex: 1,
    },
  );
}

describe("system Todo repository validation", () => {
  it("applies Todo semantic validation after the wire parser", () => {
    const content = createTodoContent();
    const invalid = {
      ...content,
      collections: [{ ...content.collections[0]!, name: " 未裁剪 " }],
    };

    expect(validateSystemRepositoryContent(content, "system-todo")).toEqual(
      content,
    );
    expect(() =>
      validateSystemRepositoryContent(invalid, "system-todo")
    ).toThrow(SystemRepositoryContentValidationError);
    expect(() => validateSystemRepositoryContent(invalid, "system-todo"))
      .toThrow(/name must be trimmed/);
  });

  it("wraps Todo transition violations without changing valid forward content", () => {
    const previous = createTodoContent();
    const collection = previous.collections[0]!;
    const item = collection.items[0]!;
    const next = {
      ...previous,
      collections: [{
        ...collection,
        updatedAt: todoTimestamp(3),
        items: [{ ...item, text: "更新", updatedAt: todoTimestamp(3) }],
      }],
    };
    const rollback = {
      ...next,
      collections: [{
        ...next.collections[0]!,
        updatedAt: todoTimestamp(2),
        items: [{ ...next.collections[0]!.items[0]!, updatedAt: todoTimestamp(2) }],
      }],
    };

    expect(validateSystemRepositoryTransition(previous, next, "system-todo"))
      .toEqual(next);
    expect(() =>
      validateSystemRepositoryTransition(next, rollback, "system-todo")
    ).toThrow(SystemRepositoryTransitionValidationError);
    expect(() =>
      validateSystemRepositoryTransition(next, rollback, "system-todo")
    ).toThrow(/updatedAt cannot move backwards/);
  });
});
