// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  resolveTodoCollectionSelection,
  resolveTodoCollectionSelectionAfterDelete,
} from "../../../../core/todo/queries/todoQueries";
import {
  appendTodoTestCollection,
  createEmptyTodoContent,
  todoCollectionId,
} from "../todoTestFixture";

describe("todo queries", () => {
  it("selects the first ordered collection unless the requested one exists", () => {
    let content = appendTodoTestCollection(createEmptyTodoContent(), {
      collectionIndex: 1,
    });
    content = appendTodoTestCollection(content, { collectionIndex: 2 });

    expect(resolveTodoCollectionSelection(content, null)).toBe(
      todoCollectionId(1),
    );
    expect(resolveTodoCollectionSelection(content, todoCollectionId(2))).toBe(
      todoCollectionId(2),
    );
    expect(resolveTodoCollectionSelection(content, todoCollectionId(9))).toBe(
      todoCollectionId(1),
    );
    expect(resolveTodoCollectionSelection(createEmptyTodoContent(), null))
      .toBeNull();
  });

  it("selects the following neighbor, then the previous one, after deletion", () => {
    let content = appendTodoTestCollection(createEmptyTodoContent(), {
      collectionIndex: 1,
    });
    content = appendTodoTestCollection(content, { collectionIndex: 2 });
    content = appendTodoTestCollection(content, { collectionIndex: 3 });

    expect(resolveTodoCollectionSelectionAfterDelete(
      content,
      todoCollectionId(2),
    )).toBe(todoCollectionId(3));
    expect(resolveTodoCollectionSelectionAfterDelete(
      content,
      todoCollectionId(3),
    )).toBe(todoCollectionId(2));
    expect(resolveTodoCollectionSelectionAfterDelete(
      { ...content, collections: [content.collections[0]!] },
      todoCollectionId(1),
    )).toBeNull();
    expect(() => resolveTodoCollectionSelectionAfterDelete(
      content,
      todoCollectionId(9),
    )).toThrow(/does not exist/);
  });
});
