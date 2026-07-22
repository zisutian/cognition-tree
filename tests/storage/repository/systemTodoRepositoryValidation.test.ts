// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  SystemRepositoryContentValidationError,
  SystemRepositoryTransitionValidationError,
  validateSystemRepositoryContent,
  validateSystemRepositoryTransition,
} from "../../../src/storage/repository/systemRepository";
import {
  toggleTodoBlock,
  updateTodoCollectionBody,
} from "../../../core/todo/commands/todoCommands";
import {
  createTodoCollectionBodyProjection,
} from "../../../core/todo/model/todoContent";
import { requireTodoSyntaxProfile } from "../../../core/todo/syntax/todoSyntax";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoBlockId,
  todoCollectionId,
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
      collections: [{
        ...content.collections[0]!,
        completions: [{
          blockId: todoBlockId(99),
          completedAt: todoTimestamp(3),
        }],
      }],
    };

    expect(validateSystemRepositoryContent(content, "system-todo")).toEqual(
      content,
    );
    expect(() =>
      validateSystemRepositoryContent(invalid, "system-todo")
    ).toThrow(SystemRepositoryContentValidationError);
    expect(() => validateSystemRepositoryContent(invalid, "system-todo"))
      .toThrow(/does not identify a source block/);
  });

  it("wraps Todo transition violations without changing valid forward content", () => {
    const previous = createTodoContent();
    const collection = previous.collections[0]!;
    const projection = createTodoCollectionBodyProjection(
      collection,
      requireTodoSyntaxProfile(previous.syntaxSource),
    );
    const from = projection.source.indexOf("任务 1");
    const next = updateTodoCollectionBody(previous, {
      change: {
        edits: [{ from, insertedText: "更新", to: from + "任务 1".length }],
        source: projection.source.replace("任务 1", "更新"),
      },
      collectionId: todoCollectionId(1),
      createBlockId: () => todoBlockId(99),
      updatedAt: todoTimestamp(3),
    });
    const completed = toggleTodoBlock(next, {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      completedAt: todoTimestamp(4),
    });

    expect(validateSystemRepositoryTransition(previous, next, "system-todo"))
      .toEqual(next);
    expect(() =>
      validateSystemRepositoryTransition(completed, previous, "system-todo")
    ).toThrow(SystemRepositoryTransitionValidationError);
    expect(() =>
      validateSystemRepositoryTransition(completed, previous, "system-todo")
    ).toThrow(/updatedAt cannot move backwards/);
  });
});
