// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { replaceCtnSourceTitle } from "../../../core/ctn/metadata/sourceMetadata";
import {
  setTodoBlockRecurrence,
  stopTodoBlockRecurrence,
  toggleTodoBlock,
} from "../../../core/todo/commands/todoCompletionRecurrenceCommands";
import {
  updateTodoCollectionBody,
} from "../../../core/todo/commands/todoCollectionCommands";
import { createTodoParseIndex } from "../../../core/todo/indexes/todoParseIndex";
import {
  createTodoCollectionBodyProjection,
} from "../../../core/todo/model/todoCollectionProjection";
import type { TodoContent } from "../../../core/todo/model/todoContent";
import type { TodoLocalDate } from "../../../core/todo/recurrence/todoLocalDate";
import { createTodoViewModel } from "../../../application/todo/todoViewModel";
import type { TodoMutationActions } from "../../../application/todo/todoApplication";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoBlockId,
  todoCollectionId,
  todoTimestamp,
} from "../../core/todo/todoTestFixture";

function createContent() {
  let content = appendTodoTestCollection(createEmptyTodoContent(), {
    collectionIndex: 1,
    createdAt: todoTimestamp(1),
    name: "第一组",
  });
  content = appendTodoTestItem(content, {
    collectionIndex: 1,
    createdAt: todoTimestamp(2),
    itemIndex: 1,
    text: "已完成但保持原位",
  });
  content = appendTodoTestItem(content, {
    collectionIndex: 1,
    createdAt: todoTimestamp(3),
    itemIndex: 2,
    level: 1,
    text: "子任务",
  });
  content = toggleTodoBlock(content, createTodoParseIndex(content), {
    blockId: todoBlockId(1),
    collectionId: todoCollectionId(1),
    completedAt: todoTimestamp(4),
    today: "2026-07-18",
  });
  return appendTodoTestCollection(content, {
    collectionIndex: 2,
    createdAt: todoTimestamp(5),
    name: "第二组",
  });
}

function createActions(): TodoMutationActions {
  return {
    createCollection: vi.fn(() => todoCollectionId(2)),
    deleteCollection: vi.fn(() => todoCollectionId(1)),
    moveBlock: vi.fn(),
    moveCollection: vi.fn(),
    renameCollection: vi.fn(),
    setBlockCompletion: vi.fn(),
    setBlockRecurrence: vi.fn(),
    stopBlockRecurrence: vi.fn(),
    toggleBlock: vi.fn(),
    updateCollectionBody: vi.fn(),
    updateSyntaxSource: vi.fn(),
  };
}

function createView(
  content: TodoContent,
  activeCollectionId = todoCollectionId(1),
  today: TodoLocalDate = "2026-07-18",
) {
  const actions = createActions();
  const selectCollection = vi.fn();
  const openCollectionLine = vi.fn();
  const view = createTodoViewModel({
    activeBodyPosition: { collectionId: activeCollectionId, lineNumber: 2 },
    activeCollectionId,
    consumeFocusRequest: vi.fn(),
    content,
    focusRequest: null,
    index: createTodoParseIndex(content),
    ...actions,
    openCollectionLine,
    persistence: { status: "saved" },
    selectCollection,
    today,
    updateActiveBodyLine: vi.fn(),
  });

  return { actions, openCollectionLine, selectCollection, view };
}

describe("Todo CTN view model", () => {
  it("projects source order, nested structure, and sidecar completion", () => {
    const { view } = createView(createContent());

    expect(view.collections).toEqual([
      expect.objectContaining({
        completedItemCount: 1,
        id: todoCollectionId(1),
        isActive: true,
        itemCount: 2,
        name: "第一组",
      }),
      expect.objectContaining({
        completedItemCount: 0,
        id: todoCollectionId(2),
        isActive: false,
        itemCount: 0,
        name: "第二组",
      }),
    ]);
    expect(view.editor.documentText).toBe(
      "[] 已完成但保持原位\n\t[] 子任务",
    );
    expect(view.editor.checkableBlocks).toEqual([
      expect.objectContaining({ blockId: todoBlockId(1), checked: true }),
      expect.objectContaining({ blockId: todoBlockId(2), checked: false }),
    ]);
    expect(view.outline.nodes[0]).toMatchObject({
      completed: true,
      id: todoBlockId(1),
      text: "已完成但保持原位",
      children: [{ id: todoBlockId(2), completed: false, text: "子任务" }],
    });
    expect(view.outline.activeBlock?.id).toBe(todoBlockId(2));
    expect(view.diagnostics.diagnostics).toEqual([]);
  });

  it("routes editor, completion, structure, syntax, and navigation actions", () => {
    const { actions, openCollectionLine, selectCollection, view } = createView(
      createContent(),
    );
    const change = { edits: [], source: view.editor.documentText };

    view.selectCollection(todoCollectionId(2));
    view.editor.updateBody(change);
    view.toggleBlock(todoCollectionId(1), todoBlockId(1));
    view.moveBlock(todoCollectionId(1), todoBlockId(2), {
      kind: "above",
      targetBlockId: todoBlockId(1),
    });
    view.syntax.updateSource("source");
    view.outline.onSelectLine(2);
    expect(view.navigation.openCollectionBlock(
      todoCollectionId(1),
      todoBlockId(2),
    )).toBe(true);
    expect(openCollectionLine).toHaveBeenLastCalledWith(
      todoCollectionId(1),
      2,
    );
    expect(view.navigation.openCollectionBlock(
      todoCollectionId(1),
      "00000000-0000-4000-8000-999999999999",
    )).toBe(false);
    expect(openCollectionLine).toHaveBeenLastCalledWith(
      todoCollectionId(1),
      1,
    );

    expect(selectCollection).toHaveBeenCalledWith(todoCollectionId(2));
    expect(actions.updateCollectionBody).toHaveBeenCalledWith(
      todoCollectionId(1),
      change,
    );
    expect(actions.toggleBlock).toHaveBeenCalledWith(
      todoCollectionId(1),
      todoBlockId(1),
    );
    expect(actions.moveBlock).toHaveBeenCalled();
    expect(actions.updateSyntaxSource).toHaveBeenCalledWith("source");
    expect(openCollectionLine).toHaveBeenCalledWith(todoCollectionId(1), 2);
  });

  it("reprojects recurring completion and statistics from the local date", () => {
    const content = createContent();
    const recurring = setTodoBlockRecurrence(
      content,
      createTodoParseIndex(content),
      {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      rule: { interval: 1, kind: "daily" },
      stageId:
        "todo-recurrence-stage-00000000-0000-4000-8000-000000000001",
      today: "2026-07-18",
      updatedAt: todoTimestamp(20),
      },
    );
    const firstDay = createView(
      recurring,
      todoCollectionId(1),
      "2026-07-18",
    ).view;
    const nextDay = createView(
      recurring,
      todoCollectionId(1),
      "2026-07-19",
    ).view;

    expect(firstDay.outline.nodes[0]).toMatchObject({
      completed: true,
      recurrence: {
        active: true,
        completedCount: 1,
        currentOccurrenceDate: "2026-07-18",
        nextOccurrenceDate: "2026-07-19",
        progress: {
          ariaLabel: expect.stringContaining(
            "已完成 1/1（完成次数/截至今天应完成次数）",
          ),
          text: "↻ 1/1",
        },
        totalCount: 1,
      },
    });
    expect(firstDay.editor.checkableBlocks[0]).toMatchObject({
      checked: true,
      recurrenceProgress: {
        ariaLabel: expect.stringContaining(
          "已完成 1/1（完成次数/截至今天应完成次数）",
        ),
        text: "↻ 1/1",
      },
    });
    expect(nextDay.outline.nodes[0]).toMatchObject({
      completed: false,
      recurrence: {
        active: true,
        completedCount: 1,
        currentOccurrenceDate: "2026-07-19",
        nextOccurrenceDate: "2026-07-20",
        progress: {
          text: "↻ 1/2",
        },
        totalCount: 2,
      },
    });
    expect(nextDay.collections[0]?.completedItemCount).toBe(0);
    expect(nextDay.editor.checkableBlocks[0]).toMatchObject({
      checked: false,
      recurrenceProgress: {
        ariaLabel: expect.stringContaining(
          "已完成 1/2（完成次数/截至今天应完成次数）",
        ),
        text: "↻ 1/2",
      },
    });
  });

  it("removes recurrence presentation immediately after stopping the schedule", () => {
    const content = createContent();
    const recurring = setTodoBlockRecurrence(
      content,
      createTodoParseIndex(content),
      {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      rule: { interval: 1, kind: "daily" },
      stageId:
        "todo-recurrence-stage-00000000-0000-4000-8000-000000000001",
      today: "2026-07-18",
      updatedAt: todoTimestamp(20),
      },
    );
    const stopped = stopTodoBlockRecurrence(
      recurring,
      createTodoParseIndex(recurring),
      {
        blockId: todoBlockId(1),
        collectionId: todoCollectionId(1),
        today: "2026-07-18",
        updatedAt: todoTimestamp(21),
      },
    );
    const view = createView(
      stopped,
      todoCollectionId(1),
      "2026-07-18",
    ).view;

    expect(stopped.collections[0]?.completions).toEqual([
      expect.objectContaining({
        blockId: todoBlockId(1),
        completedAt: todoTimestamp(4),
      }),
    ]);
    expect(view.outline.nodes[0]).toMatchObject({
      completed: true,
      recurrence: {
        active: false,
        completedCount: 1,
        progress: null,
        totalCount: 1,
      },
    });
    expect(view.editor.checkableBlocks[0]).toMatchObject({
      checked: true,
    });
    expect(view.editor.checkableBlocks[0]).not.toHaveProperty(
      "recurrenceProgress",
    );
  });

  it("reports missing markers without hiding recognized descendants", () => {
    let content = appendTodoTestCollection(createEmptyTodoContent(), {
      collectionIndex: 1,
    });
    content = appendTodoTestItem(content, {
      collectionIndex: 1,
      createdAt: todoTimestamp(2),
      itemIndex: 1,
      text: "合法子任务",
    });
    const collection = content.collections[0]!;
    const projection = createTodoCollectionBodyProjection(
      createTodoParseIndex(content).getParsedCollection(collection.id)!,
    );
    const malformed = updateTodoCollectionBody(
      content,
      createTodoParseIndex(content),
      {
      change: {
        edits: [{
          from: 0,
          insertedText: "缺少符号\n\t[] 合法子任务",
          to: projection.source.length,
        }],
        source: "缺少符号\n\t[] 合法子任务",
      },
      collectionId: todoCollectionId(1),
      createBlockId: () => todoBlockId(99),
      updatedAt: todoTimestamp(3),
      },
    ).content;
    const { view } = createView(malformed);

    expect(view.diagnostics.diagnostics).toEqual([
      expect.objectContaining({ code: "missing-todo-marker" }),
    ]);
    expect(view.outline.nodes).toEqual([
      expect.objectContaining({ text: "合法子任务" }),
    ]);
  });

  it("projects every pre-existing normalized collection name conflict", () => {
    const content = createContent();
    const conflicted = {
      ...content,
      collections: content.collections.map((collection) =>
        collection.id === todoCollectionId(2)
          ? {
              ...collection,
              source: replaceCtnSourceTitle(
                collection.source,
                "第一组",
                todoTimestamp(6),
              ),
            }
          : collection
      ),
    };
    const { view } = createView(conflicted);

    const nameDiagnostics = view.diagnostics.diagnostics.filter(
      ({ code }) => code === "todo-collection-name-conflict",
    );

    expect(nameDiagnostics).toHaveLength(2);
    expect(nameDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: "name",
        target: expect.objectContaining({
          entity: "collection",
          kind: "portable-name",
          owner: "todo",
        }),
      }),
    ]));
  });
});
