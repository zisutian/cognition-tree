// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { replaceCtnSourceTitle } from "../../../core/ctn/metadata/sourceMetadata";
import {
  createTodoParseIndex,
} from "../../../core/todo/indexes/todoParseIndex";
import {
  appendTodoTestCollection,
  createEmptyTodoContent,
  todoCollectionId,
  todoTimestamp,
} from "../todoTestFixture";

describe("todo parse index", () => {
  it("analyzes and updates block ids only for a changed collection", () => {
    let content = appendTodoTestCollection(createEmptyTodoContent(), {
      collectionIndex: 1,
      createdAt: todoTimestamp(1),
      name: "First",
    });
    content = appendTodoTestCollection(content, {
      collectionIndex: 2,
      createdAt: todoTimestamp(2),
      name: "Second",
    });
    const first = createTodoParseIndex(content);
    const changed = {
      ...content,
      collections: content.collections.map((collection) =>
        collection.id === todoCollectionId(1)
          ? {
              ...collection,
              source: replaceCtnSourceTitle(
                collection.source,
                "First changed",
                todoTimestamp(3),
              ),
            }
          : collection
      ),
    };
    const second = createTodoParseIndex(changed, first);

    expect(first.analysisStats).toEqual({
      analyzedCollectionIds: [todoCollectionId(1), todoCollectionId(2)],
      runCount: 2,
      updatedBlockIdOwnerIds: [todoCollectionId(1), todoCollectionId(2)],
    });
    expect(second.analysisStats).toEqual({
      analyzedCollectionIds: [todoCollectionId(1)],
      runCount: 1,
      updatedBlockIdOwnerIds: [todoCollectionId(1)],
    });
    expect(
      second.getParsedCollection(todoCollectionId(2))?.analysis,
    ).toBe(first.getParsedCollection(todoCollectionId(2))?.analysis);
    expect(
      second.blockIdRegistry.blockIdsByOwner.get(todoCollectionId(2)),
    ).toBe(first.blockIdRegistry.blockIdsByOwner.get(todoCollectionId(2)));
  });
});
