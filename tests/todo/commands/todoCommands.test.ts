// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { replaceCtnSourceTitle } from "../../../core/ctn/metadata/sourceMetadata";
import {
  deleteTodoCollection,
  moveTodoBlock,
  moveTodoCollection,
  renameTodoCollection,
  setTodoBlockCompletion,
  setTodoBlockRecurrence,
  stopTodoBlockRecurrence,
  TodoOccurrenceConflictError,
  toggleTodoBlock,
  updateTodoCollectionBody,
  updateTodoSyntaxSource,
} from "../../../core/todo/commands/todoCommands";
import {
  createTodoCollectionBodyProjection,
  parseTodoCollection,
  validateTodoContent,
} from "../../../core/todo/model/todoContent";
import { projectTodoRecurrence } from "../../../core/todo/recurrence/todoRecurrence";
import { requireTodoSyntaxProfile } from "../../../core/todo/syntax/todoSyntax";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoBlockId,
  todoCollectionId,
  todoTimestamp,
} from "../todoTestFixture";

function collectionWithTasks() {
  let content = appendTodoTestCollection(createEmptyTodoContent(), {
    collectionIndex: 1,
    createdAt: todoTimestamp(1),
    name: "工作",
  });
  content = appendTodoTestItem(content, {
    collectionIndex: 1,
    createdAt: todoTimestamp(2),
    itemIndex: 1,
    text: "父任务",
  });
  return appendTodoTestItem(content, {
    collectionIndex: 1,
    createdAt: todoTimestamp(3),
    itemIndex: 2,
    level: 1,
    text: "子任务",
  });
}

const recurrenceStageId = (index: number) =>
  `todo-recurrence-stage-00000000-0000-4000-8000-${String(index).padStart(
    12,
    "0",
  )}` as const;

describe("Todo CTN commands", () => {
  it("creates canonical collections and renames only the title", () => {
    const content = appendTodoTestCollection(createEmptyTodoContent(), {
      collectionIndex: 1,
      createdAt: todoTimestamp(1),
      name: "  工作  集合  ",
    });
    const source = content.collections[0]!.source;
    const renamed = renameTodoCollection(content, {
      collectionId: todoCollectionId(1),
      name: "个人集合",
      updatedAt: todoTimestamp(2),
    });
    const profile = requireTodoSyntaxProfile(renamed.syntaxSource);

    expect(parseTodoCollection(content.collections[0]!, profile).name).toBe(
      "工作 集合",
    );
    expect(parseTodoCollection(renamed.collections[0]!, profile).name).toBe(
      "个人集合",
    );
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

    expect(() => renameTodoCollection(second, {
      collectionId: todoCollectionId(2),
      name: "RÉSUMÉ",
      updatedAt: todoTimestamp(4),
    })).toThrow(/name already exists/i);
  });

  it("uses indentation as task hierarchy and preserves block ids while editing", () => {
    const content = collectionWithTasks();
    const profile = requireTodoSyntaxProfile(content.syntaxSource);
    const before = parseTodoCollection(content.collections[0]!, profile);
    const projection = createTodoCollectionBodyProjection(
      content.collections[0]!,
      profile,
    );
    const source = projection.source.replace("父任务", "父任务已修改");
    const edited = updateTodoCollectionBody(content, {
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
    });
    const after = parseTodoCollection(edited.collections[0]!, profile);

    expect(before.document.blocks.slice(1).map(({ id }) => id)).toEqual([
      todoBlockId(1),
      todoBlockId(2),
    ]);
    expect(after.document.blocks.slice(1).map(({ id }) => id)).toEqual([
      todoBlockId(1),
      todoBlockId(2),
    ]);
    expect(after.document.blocks.find(({ id }) => id === todoBlockId(2))?.level)
      .toBe(1);
  });

  it("keeps completion in a sidecar and toggles parent and child independently", () => {
    const content = collectionWithTasks();
    const source = content.collections[0]!.source;
    const parentDone = toggleTodoBlock(content, {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      completedAt: todoTimestamp(4),
      today: "2026-07-18",
    });
    const bothDone = toggleTodoBlock(parentDone, {
      blockId: todoBlockId(2),
      collectionId: todoCollectionId(1),
      completedAt: todoTimestamp(5),
      today: "2026-07-18",
    });
    const childOnly = toggleTodoBlock(bothDone, {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      completedAt: todoTimestamp(6),
      today: "2026-07-18",
    });

    expect(parentDone.collections[0]!.source).toBe(source);
    expect(bothDone.collections[0]!.completions.map(({ blockId }) => blockId))
      .toEqual([todoBlockId(1), todoBlockId(2)]);
    expect(childOnly.collections[0]!.completions).toEqual([
      { blockId: todoBlockId(2), completedAt: todoTimestamp(5) },
    ]);
  });

  it("cleans sidecars when a source block loses todo semantics or is deleted", () => {
    const content = toggleTodoBlock(collectionWithTasks(), {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      completedAt: todoTimestamp(4),
      today: "2026-07-18",
    });
    const changedMarkerSource = content.syntaxSource.replace(
      'marker = "[]"',
      'marker = "[ ]"',
    );
    const changedSyntax = updateTodoSyntaxSource(content, changedMarkerSource);

    expect(changedSyntax.collections[0]!.completions).toEqual([]);
    expect(validateTodoContent(changedSyntax)).toBe(changedSyntax);

    const profile = requireTodoSyntaxProfile(changedSyntax.syntaxSource);
    const projection = createTodoCollectionBodyProjection(
      changedSyntax.collections[0]!,
      profile,
    );
    const deleted = updateTodoCollectionBody(changedSyntax, {
      change: {
        edits: [{ from: 0, insertedText: "", to: projection.source.length }],
        source: "",
      },
      collectionId: todoCollectionId(1),
      createBlockId: () => todoBlockId(99),
      updatedAt: todoTimestamp(5),
    });

    expect(deleted.collections[0]!.completions).toEqual([]);
  });

  it("moves a task subtree within one collection without losing completion", () => {
    const content = toggleTodoBlock(collectionWithTasks(), {
      blockId: todoBlockId(2),
      collectionId: todoCollectionId(1),
      completedAt: todoTimestamp(4),
      today: "2026-07-18",
    });
    const moved = moveTodoBlock(content, {
      blockId: todoBlockId(2),
      collectionId: todoCollectionId(1),
      target: { kind: "above", targetBlockId: todoBlockId(1) },
      updatedAt: todoTimestamp(5),
    });
    const parsed = parseTodoCollection(
      moved.collections[0]!,
      requireTodoSyntaxProfile(moved.syntaxSource),
    );

    expect(parsed.document.blocks.slice(1).map(({ id, level }) => ({ id, level })))
      .toEqual([
        { id: todoBlockId(2), level: 0 },
        { id: todoBlockId(1), level: 0 },
      ]);
    expect(moved.collections[0]!.completions).toEqual(
      content.collections[0]!.completions,
    );
  });

  it("keeps collection order explicit and accepts readable old invalid names", () => {
    let content = collectionWithTasks();
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

  it("converts an ordinary completion into the first recurring occurrence", () => {
    const checked = toggleTodoBlock(collectionWithTasks(), {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      completedAt: todoTimestamp(4),
      today: "2026-07-18",
    });
    const recurring = setTodoBlockRecurrence(checked, {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      rule: { interval: 1, kind: "daily" },
      stageId: recurrenceStageId(1),
      today: "2026-07-18",
    });
    const collection = recurring.collections[0]!;

    expect(collection.completions).toEqual([]);
    expect(collection.recurrences).toEqual([{
      blockId: todoBlockId(1),
      completions: [{
        completedAt: todoTimestamp(4),
        occurrenceDate: "2026-07-18",
        stageId: recurrenceStageId(1),
      }],
      stages: [{
        endsBefore: null,
        id: recurrenceStageId(1),
        rule: { interval: 1, kind: "daily" },
        startsOn: "2026-07-18",
      }],
    }]);
    expect(projectTodoRecurrence(collection.recurrences[0]!, "2026-07-19"))
      .toMatchObject({
        completed: false,
        currentOccurrenceDate: "2026-07-19",
        totalCount: 2,
      });
  });

  it("completes only the latest due occurrence and rejects stale writes", () => {
    const recurring = setTodoBlockRecurrence(collectionWithTasks(), {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      rule: { interval: 1, kind: "daily" },
      stageId: recurrenceStageId(1),
      today: "2026-07-18",
    });
    const completed = setTodoBlockCompletion(recurring, {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      completed: true,
      completedAt: "2026-07-21T08:00:00.000Z",
      occurrenceDate: "2026-07-21",
      today: "2026-07-21",
    });
    const recurrence = completed.collections[0]!.recurrences[0]!;

    expect(recurrence.completions).toEqual([{
      completedAt: "2026-07-21T08:00:00.000Z",
      occurrenceDate: "2026-07-21",
      stageId: recurrenceStageId(1),
    }]);
    expect(projectTodoRecurrence(recurrence, "2026-07-21")).toMatchObject({
      completed: true,
      completedCount: 1,
      totalCount: 4,
    });
    expect(() => setTodoBlockCompletion(completed, {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      completed: false,
      completedAt: "2026-07-22T08:00:00.000Z",
      occurrenceDate: "2026-07-21",
      today: "2026-07-22",
    })).toThrow(TodoOccurrenceConflictError);
  });

  it("starts rule changes tomorrow and retains stages when stopped or re-enabled", () => {
    const initial = setTodoBlockRecurrence(collectionWithTasks(), {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      rule: { interval: 1, kind: "daily" },
      stageId: recurrenceStageId(1),
      today: "2026-07-18",
    });
    const changed = setTodoBlockRecurrence(initial, {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      rule: { interval: 2, kind: "weekly", weekdays: [1, 5] },
      stageId: recurrenceStageId(2),
      today: "2026-07-20",
    });
    const stages = changed.collections[0]!.recurrences[0]!.stages;

    expect(stages).toEqual([
      expect.objectContaining({
        endsBefore: "2026-07-21",
        id: recurrenceStageId(1),
      }),
      expect.objectContaining({
        endsBefore: null,
        id: recurrenceStageId(2),
        startsOn: "2026-07-21",
      }),
    ]);
    const revisedPending = setTodoBlockRecurrence(changed, {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      rule: { dayOfMonth: 31, interval: 1, kind: "monthly" },
      stageId: recurrenceStageId(3),
      today: "2026-07-20",
    });

    expect(revisedPending.collections[0]!.recurrences[0]!.stages).toHaveLength(2);
    expect(revisedPending.collections[0]!.recurrences[0]!.stages[1]!.id)
      .toBe(recurrenceStageId(2));
    const stopped = stopTodoBlockRecurrence(revisedPending, {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      today: "2026-07-20",
    });

    expect(stopped.collections[0]!.recurrences[0]!.stages).toEqual([
      expect.objectContaining({ endsBefore: "2026-07-21" }),
    ]);
    const reenabled = setTodoBlockRecurrence(stopped, {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      rule: { interval: 1, kind: "daily" },
      stageId: recurrenceStageId(3),
      today: "2026-07-21",
    });

    expect(reenabled.collections[0]!.recurrences[0]!.stages).toHaveLength(2);
    expect(reenabled.collections[0]!.recurrences[0]!.stages[1])
      .toMatchObject({
        id: recurrenceStageId(3),
        startsOn: "2026-07-21",
      });
  });

  it("cleans recurrence history when the source block is deleted", () => {
    const recurring = setTodoBlockRecurrence(collectionWithTasks(), {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      rule: { interval: 1, kind: "daily" },
      stageId: recurrenceStageId(1),
      today: "2026-07-18",
    });
    const projection = createTodoCollectionBodyProjection(
      recurring.collections[0]!,
      requireTodoSyntaxProfile(recurring.syntaxSource),
    );
    const deleted = updateTodoCollectionBody(recurring, {
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
    });

    expect(deleted.collections[0]!.recurrences).toEqual([]);
  });
});
