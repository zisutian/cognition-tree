// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { replaceCtnSourceTitle } from "../../../core/ctn/metadata/sourceMetadata";
import {
  toggleTodoBlock,
  updateTodoCollectionBody,
} from "../../../core/todo/commands/todoCommands";
import { createTodoParseIndex } from "../../../core/todo/indexes/todoParseIndex";
import {
  createTodoCollectionBodyProjection,
  type TodoContent,
} from "../../../core/todo/model/todoContent";
import { requireTodoSyntaxProfile } from "../../../core/todo/syntax/todoSyntax";
import {
  createTodoViewModel,
  getTodoPersistenceErrorMessage,
} from "../../../application/todo/todoViewModel";
import type { TodoMutationActions } from "../../../application/todo/todoApplication";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoBlockId,
  todoCollectionId,
  todoTimestamp,
} from "../../todo/todoTestFixture";

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
  content = toggleTodoBlock(content, {
    blockId: todoBlockId(1),
    collectionId: todoCollectionId(1),
    completedAt: todoTimestamp(4),
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
    toggleBlock: vi.fn(),
    updateCollectionBody: vi.fn(),
    updateSyntaxSource: vi.fn(),
  };
}

function createView(content: TodoContent, activeCollectionId = todoCollectionId(1)) {
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
      collection,
      requireTodoSyntaxProfile(content.syntaxSource),
    );
    const malformed = updateTodoCollectionBody(content, {
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
    });
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

  it("shows persistence failures and conflicts", () => {
    expect(getTodoPersistenceErrorMessage({
      localCopySafe: true,
      message: "本地保存失败",
      phase: "local",
      status: "error",
    })).toBe("本地保存失败");
    expect(getTodoPersistenceErrorMessage({
      remoteRevision: `sha256:${"a".repeat(64)}`,
      status: "conflict",
    })).toBe("代办存在同步冲突，请前往仓库处理。");
  });
});
