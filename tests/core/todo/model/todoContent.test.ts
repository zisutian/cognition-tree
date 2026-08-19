// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { replaceCtnSourceTitle } from "../../../../core/ctn/metadata/sourceMetadata";
import { toggleTodoBlock } from "../../../../core/todo/commands/todoCommands";
import {
  createTodoParseIndex,
} from "../../../../core/todo/indexes/todoParseIndex";
import {
  isTodoCollectionId,
  validateTodoContentAnalysisTransition,
  validateTodoContent,
  validateTodoContentTransition,
} from "../../../../core/todo/model/todoContent";
import { requireCtnSyntax } from "../../../../core/ctn/syntax/compiler";
import { getPortableNameIssue } from "../../../../core/naming/portableName";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoBlockId,
  todoCollectionId,
  todoTimestamp,
} from "../todoTestFixture";

function createValidContent() {
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

describe("Todo v4 content", () => {
  function captureTransition(operation: () => unknown) {
    try {
      return { status: "accepted" as const, value: operation() };
    } catch (error) {
      return {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : "unknown",
        status: "rejected" as const,
      };
    }
  }

  it("accepts the exact CTN collection and completion sidecar shape", () => {
    const initial = createValidContent();
    const content = toggleTodoBlock(
      initial,
      createTodoParseIndex(initial),
      {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      completedAt: todoTimestamp(3),
      today: "2026-07-18",
      },
    );

    expect(validateTodoContent(content)).toBe(content);
    expect(content).toEqual({
      collections: [{
        completions: [{
          blockId: todoBlockId(1),
          completedAt: todoTimestamp(3),
        }],
        id: todoCollectionId(1),
        recurrences: [],
        source: expect.stringContaining("[] 任务 1"),
      }],
      schemaVersion: 4,
      syntaxSource: expect.stringContaining('semanticId = "todo-item"'),
    });
    expect(isTodoCollectionId(todoCollectionId(1))).toBe(true);
    expect(isTodoCollectionId(todoCollectionId(1).toUpperCase())).toBe(false);
    expect(requireCtnSyntax(content.syntaxSource, "todo").blocks)
      .toMatchObject([{
        marker: "[]",
        semanticId: "todo-item",
        tone: "default",
      }, {
        label: "注解",
        marker: ">",
        semanticId: "marker-rule-2",
        textColor: "green",
        tone: "default",
      }]);
  });

  it("rejects another version, invalid syntax, and duplicate ids", () => {
    const content = createValidContent();

    expect(() => validateTodoContent({
      ...content,
      schemaVersion: 1,
    } as never)).toThrow(/schema version must be 4/);
    expect(() => validateTodoContent({
      ...content,
      syntaxSource: content.syntaxSource.replace(
        'semanticId = "todo-item"',
        'semanticId = "task"',
      ),
    })).toThrow(/syntax is invalid/);
    expect(() => validateTodoContent({
      ...content,
      collections: [content.collections[0]!, content.collections[0]!],
    })).toThrow(/Duplicate todo collection id/);
  });

  it("requires completion ids to remain recognized todo items", () => {
    const initial = createValidContent();
    const completed = toggleTodoBlock(
      initial,
      createTodoParseIndex(initial),
      {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      completedAt: todoTimestamp(3),
      today: "2026-07-18",
      },
    );
    const changedMarker = {
      ...completed,
      collections: [{
        ...completed.collections[0]!,
        source: completed.collections[0]!.source.replace("[]", "?"),
      }],
    };

    expect(() => validateTodoContent(changedMarker))
      .toThrow(/does not identify a todo item/);
    expect(() => validateTodoContent({
      ...completed,
      collections: [{
        ...completed.collections[0]!,
        completions: [{
          blockId: todoBlockId(99),
          completedAt: todoTimestamp(3),
        }],
      }],
    })).toThrow(/does not identify a todo item/);
  });

  it("keeps existing nonportable names readable and reports them separately", () => {
    const content = createValidContent();
    const invalidName = {
      ...content,
      collections: [{
        ...content.collections[0]!,
        source: replaceCtnSourceTitle(
          content.collections[0]!.source,
          "旧/名称",
          todoTimestamp(3),
        ),
      }],
    };
    expect(validateTodoContent(invalidName)).toBe(invalidName);
    const name = createTodoParseIndex(invalidName).collections[0]!.name;

    expect(name).toBe("旧/名称");
    expect(getPortableNameIssue(name))
      .toBe("unsupported-character");
  });

  it("keeps pre-existing normalized collection name conflicts readable", () => {
    const first = createValidContent();
    const second = appendTodoTestCollection(first, {
      collectionIndex: 2,
      name: "其他",
    });
    const duplicate = {
      ...second,
      collections: second.collections.map((collection) =>
        collection.id === todoCollectionId(2)
          ? {
              ...collection,
              source: replaceCtnSourceTitle(
                collection.source,
                "集合 1",
                todoTimestamp(3),
              ),
            }
          : collection
      ),
    };

    expect(validateTodoContent(duplicate)).toBe(duplicate);
  });

  it("locks surviving collection and block identities across transitions", () => {
    const previous = createValidContent();
    const next = appendTodoTestItem(previous, {
      collectionIndex: 1,
      createdAt: todoTimestamp(3),
      itemIndex: 2,
    });
    const titleChanged = {
      ...next,
      collections: [{
        ...next.collections[0]!,
        source: next.collections[0]!.source.replace(
          todoBlockId(10_001),
          todoBlockId(99),
        ),
      }],
    };

    expect(validateTodoContentTransition(previous, next)).toBe(next);
    expect(() => validateTodoContentTransition(previous, titleChanged))
      .toThrow(/title block id is immutable/);
  });

  it("keeps raw and prepared transition validation equivalent", () => {
    const previous = createValidContent();
    const next = appendTodoTestItem(previous, {
      collectionIndex: 1,
      createdAt: todoTimestamp(3),
      itemIndex: 2,
    });
    const titleChanged = {
      ...next,
      collections: [{
        ...next.collections[0]!,
        source: next.collections[0]!.source.replace(
          todoBlockId(10_001),
          todoBlockId(99),
        ),
      }],
    };
    const previousIndex = createTodoParseIndex(previous);

    for (const candidate of [next, titleChanged]) {
      const raw = captureTransition(() =>
        validateTodoContentTransition(previous, candidate)
      );
      const prepared = captureTransition(() =>
        validateTodoContentAnalysisTransition(
          previousIndex.validation,
          createTodoParseIndex(candidate, previousIndex).validation,
        )
      );

      expect(prepared).toEqual(raw);
    }
  });
});
