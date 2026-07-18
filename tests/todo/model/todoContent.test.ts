// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  isTodoCollectionId,
  isTodoItemId,
  validateTodoContent,
  validateTodoContentTransition,
} from "../../../todo/model/todoContent";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoCollectionId,
  todoItemId,
  todoTimestamp,
} from "../todoTestFixture";

function createValidContent() {
  let content = appendTodoTestCollection(createEmptyTodoContent(), {
    collectionIndex: 1,
    createdAt: todoTimestamp(1),
  });
  content = appendTodoTestItem(content, {
    collectionIndex: 1,
    createdAt: todoTimestamp(2),
    itemIndex: 1,
    text: "  保留两侧空格  ",
  });
  return content;
}

describe("todo content", () => {
  it("rejects another purpose or schema version instead of treating it as Todo v1", () => {
    expect(() => validateTodoContent({
      ...createEmptyTodoContent(),
      purpose: "system-journal",
    } as never)).toThrow(/purpose must be system-todo/);
    expect(() => validateTodoContent({
      ...createEmptyTodoContent(),
      schemaVersion: 2,
    } as never)).toThrow(/schema version must be 1/);
  });

  it("accepts the exact v1 wire shape and stable prefixed identities", () => {
    const content = createValidContent();

    expect(validateTodoContent(content)).toBe(content);
    expect(isTodoCollectionId(todoCollectionId(1))).toBe(true);
    expect(isTodoItemId(todoItemId(1))).toBe(true);
    expect(isTodoCollectionId(todoCollectionId(1).toUpperCase())).toBe(false);
    expect(isTodoItemId("item-00000000-0000-4000-8000-000000000001"))
      .toBe(false);
    expect(content.collections[0]?.items[0]?.text).toBe("  保留两侧空格  ");
  });

  it("rejects duplicate collection ids and globally duplicate item ids", () => {
    const content = createValidContent();
    const collection = content.collections[0]!;

    expect(() => validateTodoContent({
      ...content,
      collections: [...content.collections, collection],
    })).toThrow(/Duplicate todo collection id/);
    expect(() => validateTodoContent({
      ...content,
      collections: [
        collection,
        {
          ...collection,
          id: todoCollectionId(2),
          items: [{ ...collection.items[0]! }],
        },
      ],
    })).toThrow(/Duplicate todo item id/);
  });

  it("requires canonical collection names and preserves valid item text", () => {
    const content = createValidContent();
    const collection = content.collections[0]!;

    expect(() => validateTodoContent({
      ...content,
      collections: [{ ...collection, name: " \t " }],
    })).toThrow(/name must not be empty/);
    expect(() => validateTodoContent({
      ...content,
      collections: [{ ...collection, name: " 集合 1 " }],
    })).toThrow(/name must be trimmed/);
    expect(() => validateTodoContent({
      ...content,
      collections: [{
        ...collection,
        items: [{ ...collection.items[0]!, text: "   " }],
      }],
    })).toThrow(/text must not be empty/);
  });

  it("requires canonical, non-decreasing creation and update timestamps", () => {
    const content = createValidContent();
    const collection = content.collections[0]!;
    const item = collection.items[0]!;

    expect(() => validateTodoContent({
      ...content,
      collections: [{ ...collection, updatedAt: "2026-07-18" }],
    })).toThrow(/canonical ISO timestamp/);
    expect(() => validateTodoContent({
      ...content,
      collections: [{
        ...collection,
        createdAt: todoTimestamp(3),
      }],
    })).toThrow(/updatedAt is before createdAt/);
    expect(() => validateTodoContent({
      ...content,
      collections: [{
        ...collection,
        items: [{ ...item, createdAt: todoTimestamp(3) }],
      }],
    })).toThrow(/updatedAt is before createdAt/);
  });

  it("keeps completion state and timestamps as one consistent fact", () => {
    const content = createValidContent();
    const collection = content.collections[0]!;
    const item = collection.items[0]!;
    const withItem = (overrides: Partial<typeof item>) => ({
      ...content,
      collections: [{
        ...collection,
        updatedAt: todoTimestamp(4),
        items: [{ ...item, updatedAt: todoTimestamp(4), ...overrides }],
      }],
    });

    expect(() => validateTodoContent(withItem({
      completed: true,
      completedAt: null,
    }))).toThrow(/completed and completedAt/);
    expect(() => validateTodoContent(withItem({
      completed: false,
      completedAt: todoTimestamp(3),
    }))).toThrow(/completed and completedAt/);
    expect(() => validateTodoContent(withItem({
      completed: true,
      completedAt: todoTimestamp(1),
    }))).toThrow(/completedAt is before createdAt/);
    expect(() => validateTodoContent(withItem({
      completed: true,
      completedAt: todoTimestamp(5),
    }))).toThrow(/completedAt is after updatedAt/);
  });

  it("requires a collection update to cover every contained item update", () => {
    const content = createValidContent();
    const collection = content.collections[0]!;

    expect(() => validateTodoContent({
      ...content,
      collections: [{
        ...collection,
        items: [{ ...collection.items[0]!, updatedAt: todoTimestamp(3) }],
      }],
    })).toThrow(/updatedAt is before item/);
  });

  it("does not allow an item to predate its owning collection", () => {
    const content = createValidContent();
    const collection = content.collections[0]!;

    expect(() => validateTodoContent({
      ...content,
      collections: [{
        ...collection,
        createdAt: todoTimestamp(3),
        updatedAt: todoTimestamp(3),
      }],
    })).toThrow(/created before collection/);
  });

  it("accepts forward mutations and deletion while locking surviving identities", () => {
    const created = createValidContent();
    const collection = created.collections[0]!;
    const item = collection.items[0]!;
    const edited = {
      ...created,
      collections: [{
        ...collection,
        name: "新名称",
        updatedAt: todoTimestamp(3),
        items: [{ ...item, text: "新任务", updatedAt: todoTimestamp(3) }],
      }],
    };

    expect(validateTodoContentTransition(created, edited)).toBe(edited);
    expect(validateTodoContentTransition(edited, createEmptyTodoContent()))
      .toEqual(createEmptyTodoContent());
    expect(() => validateTodoContentTransition(created, {
      ...edited,
      collections: [{
        ...edited.collections[0]!,
        createdAt: todoTimestamp(0),
      }],
    })).toThrow(/collection .* createdAt is immutable/);
    expect(() => validateTodoContentTransition(edited, {
      ...edited,
      collections: [{
        ...edited.collections[0]!,
        updatedAt: todoTimestamp(2),
        items: [{ ...edited.collections[0]!.items[0]!, updatedAt: todoTimestamp(2) }],
      }],
    })).toThrow(/collection .* updatedAt cannot move backwards/);
    expect(() => validateTodoContentTransition(created, {
      ...edited,
      collections: [{
        ...edited.collections[0]!,
        items: [{
          ...edited.collections[0]!.items[0]!,
          createdAt: todoTimestamp(3),
        }],
      }],
    })).toThrow(/item .* createdAt is immutable/);
    expect(() => validateTodoContentTransition(edited, {
      ...edited,
      collections: [{
        ...edited.collections[0]!,
        items: [{ ...edited.collections[0]!.items[0]!, updatedAt: todoTimestamp(2) }],
      }],
    })).toThrow(/item .* updatedAt cannot move backwards/);
  });

  it("keeps a surviving item in its collection", () => {
    const created = createValidContent();
    const first = created.collections[0]!;
    const item = first.items[0]!;
    const moved = {
      ...created,
      collections: [
        { ...first, items: [] },
        {
          createdAt: todoTimestamp(1),
          id: todoCollectionId(2),
          items: [item],
          name: "集合 2",
          updatedAt: todoTimestamp(2),
        },
      ],
    };

    expect(validateTodoContent(moved)).toBe(moved);
    expect(() => validateTodoContentTransition(created, moved)).toThrow(
      /cannot move to another collection/,
    );
  });

  it("bounds a new completion while allowing a hidden reopen and recompletion", () => {
    const created = createValidContent();
    const collection = created.collections[0]!;
    const item = collection.items[0]!;
    const edited = {
      ...created,
      collections: [{
        ...collection,
        updatedAt: todoTimestamp(3),
        items: [{ ...item, text: "编辑过", updatedAt: todoTimestamp(3) }],
      }],
    };
    const completed = {
      ...edited,
      collections: [{
        ...edited.collections[0]!,
        updatedAt: todoTimestamp(4),
        items: [{
          ...edited.collections[0]!.items[0]!,
          completed: true,
          completedAt: todoTimestamp(4),
          updatedAt: todoTimestamp(4),
        }],
      }],
    };
    const mismatchedCompletion = {
      ...completed,
      collections: [{
        ...completed.collections[0]!,
        items: [{
          ...completed.collections[0]!.items[0]!,
          completedAt: "2026-07-18T02:30:00.000Z",
        }],
      }],
    };
    const coalescedCompletionAndEdit = {
      ...completed,
      collections: [{
        ...completed.collections[0]!,
        updatedAt: todoTimestamp(5),
        items: [{
          ...completed.collections[0]!.items[0]!,
          completedAt: "2026-07-18T03:30:00.000Z",
          text: "完成后又编辑",
          updatedAt: todoTimestamp(5),
        }],
      }],
    };
    const reopened = {
      ...completed,
      collections: [{
        ...completed.collections[0]!,
        updatedAt: todoTimestamp(5),
        items: [{
          ...completed.collections[0]!.items[0]!,
          completed: false,
          completedAt: null,
          updatedAt: todoTimestamp(5),
        }],
      }],
    };
    const recompleted = {
      ...reopened,
      collections: [{
        ...reopened.collections[0]!,
        updatedAt: todoTimestamp(6),
        items: [{
          ...reopened.collections[0]!.items[0]!,
          completed: true,
          completedAt: todoTimestamp(6),
          updatedAt: todoTimestamp(6),
        }],
      }],
    };
    const backdatedRecompletion = {
      ...recompleted,
      collections: [{
        ...recompleted.collections[0]!,
        items: [{
          ...recompleted.collections[0]!.items[0]!,
          completedAt: "2026-07-18T03:30:00.000Z",
        }],
      }],
    };

    expect(validateTodoContentTransition(edited, completed)).toBe(completed);
    expect(
      validateTodoContentTransition(edited, coalescedCompletionAndEdit),
    ).toBe(coalescedCompletionAndEdit);
    expect(validateTodoContent(mismatchedCompletion)).toBe(mismatchedCompletion);
    expect(() =>
      validateTodoContentTransition(edited, mismatchedCompletion)
    ).toThrow(/cannot predate the completion transition/);
    expect(validateTodoContentTransition(completed, reopened)).toBe(reopened);
    expect(validateTodoContentTransition(reopened, recompleted)).toBe(
      recompleted,
    );
    expect(validateTodoContentTransition(completed, recompleted)).toBe(
      recompleted,
    );
    expect(validateTodoContent(backdatedRecompletion)).toBe(
      backdatedRecompletion,
    );
    expect(() =>
      validateTodoContentTransition(completed, backdatedRecompletion)
    ).toThrow(/cannot predate the completion transition/);
  });

  it("does not allow a new item to be backdated before a surviving collection update", () => {
    const previous = {
      ...createEmptyTodoContent(),
      collections: [{
        createdAt: todoTimestamp(1),
        id: todoCollectionId(1),
        items: [],
        name: "集合 1",
        updatedAt: todoTimestamp(3),
      }],
    };
    const next = {
      ...previous,
      collections: [{
        ...previous.collections[0]!,
        items: [{
          completed: false,
          completedAt: null,
          createdAt: todoTimestamp(2),
          id: todoItemId(1),
          text: "回填任务",
          updatedAt: todoTimestamp(2),
        }],
      }],
    };

    expect(validateTodoContent(previous)).toBe(previous);
    expect(validateTodoContent(next)).toBe(next);
    expect(() => validateTodoContentTransition(previous, next)).toThrow(
      /created before its collection's latest update/,
    );
  });
});
