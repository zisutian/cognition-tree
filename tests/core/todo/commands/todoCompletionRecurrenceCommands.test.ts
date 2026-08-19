// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  TodoOccurrenceConflictError,
} from "../../../../core/todo/recurrence/todoOccurrenceConflict";
import {
  createTodoCollectionBodyProjection,
} from "../../../../core/todo/model/todoCollectionProjection";
import {
  projectTodoRecurrence,
} from "../../../../core/todo/recurrence/todoRecurrenceProjection";
import {
  createTodoCollectionWithTasks,
  firstParsedTodoCollection,
  setTodoBlockCompletionForTest,
  setTodoBlockRecurrenceForTest,
  stopTodoBlockRecurrenceForTest,
  todoBlockId,
  todoCollectionId,
  todoRecurrenceStageId,
  todoTimestamp,
  toggleTodoBlockForTest,
} from "./todoCommandTestFixture";

describe("Todo completion and recurrence commands", () => {
  it("keeps completion in a sidecar, touches block time, and toggles independently", () => {
    const content = createTodoCollectionWithTasks();
    const editableSource = createTodoCollectionBodyProjection(
      firstParsedTodoCollection(content),
    ).source;
    const parentDone = toggleTodoBlockForTest(content, {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      completedAt: todoTimestamp(4),
      today: "2026-07-18",
    });
    const bothDone = toggleTodoBlockForTest(parentDone, {
      blockId: todoBlockId(2),
      collectionId: todoCollectionId(1),
      completedAt: todoTimestamp(5),
      today: "2026-07-18",
    });
    const childOnly = toggleTodoBlockForTest(bothDone, {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      completedAt: todoTimestamp(6),
      today: "2026-07-18",
    });

    expect(createTodoCollectionBodyProjection(
      firstParsedTodoCollection(parentDone),
    ).source).toBe(editableSource);
    expect(
      firstParsedTodoCollection(parentDone).analysis.document.blocks.find(
        ({ id }) => id === todoBlockId(1),
      )?.metadata.updatedAt,
    ).toBe(todoTimestamp(4));
    expect(
      firstParsedTodoCollection(parentDone).analysis.document.blocks.find(
        ({ id }) => id === todoBlockId(2),
      )?.metadata.updatedAt,
    ).toBe(todoTimestamp(3));
    expect(bothDone.collections[0]!.completions.map(({ blockId }) => blockId))
      .toEqual([todoBlockId(1), todoBlockId(2)]);
    expect(childOnly.collections[0]!.completions).toEqual([
      { blockId: todoBlockId(2), completedAt: todoTimestamp(5) },
    ]);
  });

  it("converts an ordinary completion into the first recurring occurrence", () => {
    const checked = toggleTodoBlockForTest(createTodoCollectionWithTasks(), {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      completedAt: todoTimestamp(4),
      today: "2026-07-18",
    });
    const recurring = setTodoBlockRecurrenceForTest(checked, {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      rule: { interval: 1, kind: "daily" },
      stageId: todoRecurrenceStageId(1),
      today: "2026-07-18",
    });
    const collection = recurring.collections[0]!;

    expect(collection.completions).toEqual([]);
    expect(collection.recurrences).toEqual([{
      blockId: todoBlockId(1),
      completions: [{
        completedAt: todoTimestamp(4),
        occurrenceDate: "2026-07-18",
        stageId: todoRecurrenceStageId(1),
      }],
      stages: [{
        endsBefore: null,
        id: todoRecurrenceStageId(1),
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
    const completed = setTodoBlockCompletionForTest(recurring, {
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
      stageId: todoRecurrenceStageId(1),
    }]);
    expect(projectTodoRecurrence(recurrence, "2026-07-21")).toMatchObject({
      completed: true,
      completedCount: 1,
      totalCount: 4,
    });
    expect(() => setTodoBlockCompletionForTest(completed, {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      completed: false,
      completedAt: "2026-07-22T08:00:00.000Z",
      occurrenceDate: "2026-07-21",
      today: "2026-07-22",
    })).toThrow(TodoOccurrenceConflictError);
  });

  it("starts rule changes tomorrow and retains stages when stopped or re-enabled", () => {
    const initial = setTodoBlockRecurrenceForTest(
      createTodoCollectionWithTasks(),
      {
        blockId: todoBlockId(1),
        collectionId: todoCollectionId(1),
        rule: { interval: 1, kind: "daily" },
        stageId: todoRecurrenceStageId(1),
        today: "2026-07-18",
      },
    );
    const changed = setTodoBlockRecurrenceForTest(initial, {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      rule: { interval: 2, kind: "weekly", weekdays: [1, 5] },
      stageId: todoRecurrenceStageId(2),
      today: "2026-07-20",
    });
    const stages = changed.collections[0]!.recurrences[0]!.stages;

    expect(stages).toEqual([
      expect.objectContaining({
        endsBefore: "2026-07-21",
        id: todoRecurrenceStageId(1),
      }),
      expect.objectContaining({
        endsBefore: null,
        id: todoRecurrenceStageId(2),
        startsOn: "2026-07-21",
      }),
    ]);
    const revisedPending = setTodoBlockRecurrenceForTest(changed, {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      rule: { dayOfMonth: 31, interval: 1, kind: "monthly" },
      stageId: todoRecurrenceStageId(3),
      today: "2026-07-20",
    });

    expect(revisedPending.collections[0]!.recurrences[0]!.stages).toHaveLength(2);
    expect(revisedPending.collections[0]!.recurrences[0]!.stages[1]!.id)
      .toBe(todoRecurrenceStageId(2));
    const stopped = stopTodoBlockRecurrenceForTest(revisedPending, {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      today: "2026-07-20",
    });

    expect(stopped.collections[0]!.recurrences[0]!.stages).toEqual([
      expect.objectContaining({ endsBefore: "2026-07-21" }),
    ]);
    expect(
      projectTodoRecurrence(
        stopped.collections[0]!.recurrences[0]!,
        "2026-07-20",
      ),
    ).toMatchObject({
      active: false,
      currentOccurrenceDate: null,
      nextOccurrenceDate: null,
    });
    expect(() =>
      setTodoBlockCompletionForTest(stopped, {
        blockId: todoBlockId(1),
        collectionId: todoCollectionId(1),
        completed: true,
        completedAt: todoTimestamp(9),
        occurrenceDate: null,
        today: "2026-07-20",
      })
    ).not.toThrow();
    const reenabled = setTodoBlockRecurrenceForTest(stopped, {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      rule: { interval: 1, kind: "daily" },
      stageId: todoRecurrenceStageId(3),
      today: "2026-07-21",
    });

    expect(reenabled.collections[0]!.recurrences[0]!.stages).toHaveLength(2);
    expect(reenabled.collections[0]!.recurrences[0]!.stages[1])
      .toMatchObject({
        id: todoRecurrenceStageId(3),
        startsOn: "2026-07-21",
      });
  });
});
