// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { replaceCtnSourceTitle } from "../../../../core/ctn/metadata/sourceMetadata";
import {
  deleteTodoCollection,
  moveTodoCollection,
  updateTodoCollectionBody,
} from "../../../../core/todo/commands/todoCollectionCommands";
import {
  createTodoParseIndex,
} from "../../../../core/todo/indexes/todoParseIndex";
import {
  createTodoCollectionBodyProjection,
} from "../../../../core/todo/model/todoCollectionProjection";
import {
  validateTodoContent,
} from "../../../../core/todo/model/todoValidation";
import {
  appendTodoTestCollection,
  createEmptyTodoContent,
} from "../todoTestFixture";
import {
  createTodoCollectionWithTasks,
  firstParsedTodoCollection,
  renameTodoCollectionForTest,
  setTodoBlockRecurrenceForTest,
  todoBlockId,
  todoCollectionId,
  todoRecurrenceStageId,
  todoTimestamp,
  toggleTodoBlockForTest,
} from "./todoCommandTestFixture";

describe("Todo collection commands", () => {
  it("creates canonical collections and renames only the title", () => {
    const content = appendTodoTestCollection(createEmptyTodoContent(), {
      collectionIndex: 1,
      createdAt: todoTimestamp(1),
      name: "  工作  集合  ",
    });
    const source = content.collections[0]!.source;
    const renamed = renameTodoCollectionForTest(content, {
      collectionId: todoCollectionId(1),
      name: "个人集合",
      updatedAt: todoTimestamp(2),
    });

    expect(firstParsedTodoCollection(content).name).toBe("工作 集合");
    expect(firstParsedTodoCollection(renamed).name).toBe("个人集合");
    expect(renamed.collections[0]!.source).not.toBe(source);
    expect(() => appendTodoTestCollection(createEmptyTodoContent(), {
      collectionIndex: 1,
      name: "非法/名称",
    })).toThrow(/unsupported characters/i);
  });

  it("rejects normalized and case-insensitive collection name conflicts", () => {
    const first = appendTodoTestCollection(createEmptyTodoContent(), {
      collectionIndex: 1,
      name: "Résumé",
    });

    expect(() => appendTodoTestCollection(first, {
      collectionIndex: 2,
      name: "RÉSUMÉ",
    })).toThrow(/name already exists/i);
    const second = appendTodoTestCollection(first, {
      collectionIndex: 2,
      name: "私人",
    });

    expect(() => renameTodoCollectionForTest(second, {
      collectionId: todoCollectionId(2),
      name: "RÉSUMÉ",
      updatedAt: todoTimestamp(4),
    })).toThrow(/name already exists/i);
  });

  it("uses indentation as task hierarchy and preserves block ids while editing", () => {
    const content = createTodoCollectionWithTasks();
    const before = firstParsedTodoCollection(content);
    const projection = createTodoCollectionBodyProjection(before);
    const source = projection.source.replace("父任务", "父任务已修改");
    const edited = updateTodoCollectionBody(
      content,
      createTodoParseIndex(content),
      {
        change: {
          edits: [{
            from: projection.source.indexOf("父任务"),
            insertedText: "父任务已修改",
            to: projection.source.indexOf("父任务") + "父任务".length,
          }],
          source,
        },
        collectionId: todoCollectionId(1),
        createBlockId: () => todoBlockId(99),
        updatedAt: todoTimestamp(4),
      },
    ).content;
    const after = firstParsedTodoCollection(edited);

    expect(before.analysis.document.blocks.slice(1).map(({ id }) => id)).toEqual([
      todoBlockId(1),
      todoBlockId(2),
    ]);
    expect(after.analysis.document.blocks.slice(1).map(({ id }) => id)).toEqual([
      todoBlockId(1),
      todoBlockId(2),
    ]);
    expect(
      after.analysis.document.blocks.find(
        ({ id }) => id === todoBlockId(2),
      )?.level,
    ).toBe(1);
  });

  it("cleans sidecars when a source block loses todo semantics or is deleted", () => {
    const content = toggleTodoBlockForTest(createTodoCollectionWithTasks(), {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      completedAt: todoTimestamp(4),
      today: "2026-07-18",
    });
    const initialProjection = createTodoCollectionBodyProjection(
      firstParsedTodoCollection(content),
    );
    const changedSource = updateTodoCollectionBody(
      content,
      createTodoParseIndex(content),
      {
        change: {
          edits: [{ from: 0, insertedText: "?", to: 2 }],
          source: initialProjection.source.replace("[]", "?"),
        },
        collectionId: todoCollectionId(1),
        createBlockId: () => todoBlockId(99),
        updatedAt: todoTimestamp(5),
      },
    ).content;

    expect(changedSource.collections[0]!.completions).toEqual([]);
    expect(validateTodoContent(changedSource)).toBe(changedSource);

    const projection = createTodoCollectionBodyProjection(
      firstParsedTodoCollection(changedSource),
    );
    const deleted = updateTodoCollectionBody(
      changedSource,
      createTodoParseIndex(changedSource),
      {
        change: {
          edits: [{ from: 0, insertedText: "", to: projection.source.length }],
          source: "",
        },
        collectionId: todoCollectionId(1),
        createBlockId: () => todoBlockId(99),
        updatedAt: todoTimestamp(6),
      },
    ).content;

    expect(deleted.collections[0]!.completions).toEqual([]);
  });

  it("keeps collection order explicit and accepts readable old invalid names", () => {
    let content = createTodoCollectionWithTasks();
    content = appendTodoTestCollection(content, { collectionIndex: 2 });
    const moved = moveTodoCollection(content, {
      collectionId: todoCollectionId(2),
      toIndex: 0,
    });
    const oldInvalid = {
      ...moved,
      collections: moved.collections.map((collection) =>
        collection.id === todoCollectionId(1)
          ? {
              ...collection,
              source: replaceCtnSourceTitle(
                collection.source,
                "旧/名称",
                todoTimestamp(6),
              ),
            }
          : collection
      ),
    };

    expect(moved.collections.map(({ id }) => id)).toEqual([
      todoCollectionId(2),
      todoCollectionId(1),
    ]);
    expect(validateTodoContent(oldInvalid)).toBe(oldInvalid);
    expect(deleteTodoCollection(oldInvalid, todoCollectionId(2)).collections)
      .toHaveLength(1);
  });

  it("cleans recurrence history when the source block is deleted", () => {
    const recurring = setTodoBlockRecurrenceForTest(
      createTodoCollectionWithTasks(),
      {
        blockId: todoBlockId(1),
        collectionId: todoCollectionId(1),
        rule: { interval: 1, kind: "daily" },
        stageId: todoRecurrenceStageId(1),
        today: "2026-07-18",
      },
    );
    const projection = createTodoCollectionBodyProjection(
      firstParsedTodoCollection(recurring),
    );
    const deleted = updateTodoCollectionBody(
      recurring,
      createTodoParseIndex(recurring),
      {
        change: {
          edits: [{
            from: 0,
            insertedText: "",
            to: projection.source.indexOf("\n") + 1,
          }],
          source: projection.source.slice(projection.source.indexOf("\n") + 1),
        },
        collectionId: todoCollectionId(1),
        createBlockId: () => todoBlockId(99),
        updatedAt: todoTimestamp(5),
      },
    ).content;

    expect(deleted.collections[0]!.recurrences).toEqual([]);
  });
});
