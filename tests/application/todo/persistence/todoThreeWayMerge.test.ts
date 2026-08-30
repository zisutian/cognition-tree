import { describe, expect, it } from "vitest";
import { createTodoParseIndex } from "../../../../core/todo/indexes/todoParseIndex";
import { recoverTodoLocalConflictCopies } from "../../../../application/todo/persistence/todoConflictRecovery";
import { mergeTodoContent } from "../../../../application/todo/persistence/todoThreeWayMerge";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoBlockId,
  todoCollectionId,
  todoTimestamp,
} from "../../../core/todo/todoTestFixture";

describe("Todo three-way persistence", () => {
  it("merges completion and recurrence as separate item-state units", () => {
    let base = appendTodoTestCollection(createEmptyTodoContent(), {
      collectionIndex: 1,
    });

    base = appendTodoTestItem(base, {
      collectionIndex: 1,
      createdAt: todoTimestamp(2),
      itemIndex: 1,
    });
    const blockId = todoBlockId(1);
    const local = structuredClone(base);
    const remote = structuredClone(base);

    local.collections[0]!.completions.push({
      blockId,
      completedAt: todoTimestamp(3),
    });
    remote.collections[0]!.recurrences.push({
      blockId,
      completions: [],
      stages: [{
        endsBefore: null,
        id:
          "todo-recurrence-stage-00000000-0000-4000-8000-000000000001",
        rule: { interval: 1, kind: "daily" },
        startsOn: "2026-07-18",
      }],
    });
    const baseIndex = createTodoParseIndex(base);
    const prepare = (content: typeof base) => ({
      content,
      projection: createTodoParseIndex(content, baseIndex),
    });
    const merged = mergeTodoContent(
      { content: base, projection: baseIndex },
      prepare(local),
      prepare(remote),
    );

    expect(merged.status).toBe("merged");
    if (merged.status === "merged") {
      const collection = merged.content.collections.find(
        ({ id }) => id === todoCollectionId(1),
      )!;

      expect(collection.completions).toEqual(local.collections[0]!.completions);
      expect(collection.recurrences).toEqual(remote.collections[0]!.recurrences);
      expect(merged.projection.analysisStats.runCount).toBe(0);
    }
    const otherCompletion = structuredClone(base);

    otherCompletion.collections[0]!.completions.push({
      blockId,
      completedAt: todoTimestamp(4),
    });
    expect(mergeTodoContent(
      { content: base, projection: baseIndex },
      prepare(local),
      prepare(otherCompletion),
    )).toEqual({
      status: "conflict",
      unitIds: [`todo:completion:${todoCollectionId(1)}:${blockId}`],
    });
    expect(mergeTodoContent(
      { content: base, projection: baseIndex },
      prepare(local),
      prepare(otherCompletion),
      "remote",
    )).toMatchObject({
      content: {
        collections: [{
          completions: otherCompletion.collections[0]!.completions,
        }],
      },
      status: "merged",
    });
  });

  it("creates a recovery collection and rejects mixed unsupported units", () => {
    let nextId = 500;
    let base = appendTodoTestCollection(createEmptyTodoContent(), {
      collectionIndex: 1,
    });

    base = appendTodoTestItem(base, {
      collectionIndex: 1,
      createdAt: todoTimestamp(2),
      itemIndex: 1,
      text: "本地任务",
    });
    const local = structuredClone(base);

    local.collections[0]!.completions.push({
      blockId: todoBlockId(1),
      completedAt: todoTimestamp(3),
    });
    const selected = createEmptyTodoContent();
    const selectedProjection = createTodoParseIndex(selected);
    const recovered = recoverTodoLocalConflictCopies(
      { content: selected, projection: selectedProjection },
      { unitIds: [`todo:collection:${todoCollectionId(1)}:body`] },
      {
        createBlockId: () =>
          `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
        createTodoCollectionId: () =>
          `todo-collection-00000000-0000-4000-8000-${
            String(nextId++).padStart(12, "0")
          }` as const,
        now: () => "2026-07-29T12:00:00.000Z",
      },
      {
        content: local,
        projection: createTodoParseIndex(local),
      },
    ).prepared.content;

    expect(recovered.collections).toHaveLength(1);
    expect(recovered.collections[0]).toMatchObject({
      completions: [],
      source: expect.stringContaining("本地任务"),
      recurrences: [],
    });
    expect(createTodoParseIndex(recovered).collections[0]!.name).toContain(
      "本地恢复副本",
    );
    expect(() => recoverTodoLocalConflictCopies(
      { content: selected, projection: selectedProjection },
      {
        unitIds: [
          `todo:collection:${todoCollectionId(1)}:body`,
          `todo:completion:${todoCollectionId(1)}:${todoBlockId(1)}`,
        ],
      },
      {
        createBlockId: () =>
          `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
        createTodoCollectionId: () =>
          `todo-collection-00000000-0000-4000-8000-${
            String(nextId++).padStart(12, "0")
          }` as const,
        now: () => "2026-07-29T12:00:00.000Z",
      },
      {
        content: local,
        projection: createTodoParseIndex(local),
      },
    )).toThrow(
      `当前冲突单元无法无损另存：todo:completion:${
        todoCollectionId(1)
      }:${todoBlockId(1)}`,
    );
  });
});
