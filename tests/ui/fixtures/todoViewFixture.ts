import type { TodoViewModel } from "../../../application/todo";
import {
  defaultTodoSyntax,
  defaultTodoSyntaxSource,
} from "../../../core/todo/syntax/defaultTodoSyntax";

export function createTodoView(
  overrides: Partial<TodoViewModel> = {},
): TodoViewModel {
  return {
    activeCollection: {
      createdAt: "2026-07-18T01:00:00.000Z",
      id: "todo-collection-00000000-0000-4000-8000-000000000001",
      name: "今天",
      updatedAt: "2026-07-18T04:00:00.000Z",
    },
    collections: [
      {
        completedItemCount: 1,
        createdAt: "2026-07-18T01:00:00.000Z",
        id: "todo-collection-00000000-0000-4000-8000-000000000001",
        isActive: true,
        itemCount: 2,
        name: "今天",
        updatedAt: "2026-07-18T04:00:00.000Z",
      },
      {
        completedItemCount: 0,
        createdAt: "2026-07-18T05:00:00.000Z",
        id: "todo-collection-00000000-0000-4000-8000-000000000002",
        isActive: false,
        itemCount: 0,
        name: "稍后",
        updatedAt: "2026-07-18T05:00:00.000Z",
      },
    ],
    createCollection: () =>
      "todo-collection-00000000-0000-4000-8000-000000000002",
    deleteCollection: () =>
      "todo-collection-00000000-0000-4000-8000-000000000002",
    diagnostics: {
      diagnostics: [],
      errorCount: 0,
      status: "ready",
      warningCount: 0,
    },
    editor: {
      checkableBlocks: [
        {
          blockId: "00000000-0000-4000-8000-000000000001",
          checked: true,
          label: "已完成但保持原位",
          lineNumber: 1,
        },
        {
          blockId: "00000000-0000-4000-8000-000000000002",
          checked: false,
          label: "未完成",
          lineNumber: 2,
        },
      ],
      contentMode: { kind: "body", title: "今天" },
      documentText: "[] 已完成但保持原位\n\t[] 未完成",
      focusTarget: null,
      onActiveLineChange: () => undefined,
      onConsumeFocusTarget: () => undefined,
      syntax: defaultTodoSyntax,
      updateBody: () => undefined,
    },
    moveBlock: () => undefined,
    moveCollection: () => undefined,
    navigation: {
      focusRequest: null,
      openCollectionLine: () => undefined,
    },
    outline: {
      activeBlock: null,
      nodes: [
        {
          children: [],
          completed: true,
          completedAt: "2026-07-18T04:00:00.000Z",
          endLineNumber: 1,
          hasDiagnostics: false,
          id: "00000000-0000-4000-8000-000000000001",
          label: "代办",
          level: 0,
          lineNumber: 1,
          metadata: {
            createdAt: "2026-07-18T02:00:00.000Z",
            updatedAt: "2026-07-18T04:00:00.000Z",
          },
          recurrence: null,
          text: "已完成但保持原位",
        },
        {
          children: [],
          completed: false,
          completedAt: null,
          endLineNumber: 2,
          hasDiagnostics: false,
          id: "00000000-0000-4000-8000-000000000002",
          label: "代办",
          level: 0,
          lineNumber: 2,
          metadata: {
            createdAt: "2026-07-18T03:00:00.000Z",
            updatedAt: "2026-07-18T03:00:00.000Z",
          },
          recurrence: null,
          text: "未完成",
        },
      ],
      onSelectLine: () => undefined,
    },
    persistence: { status: "saved" },
    renameCollection: () => undefined,
    selectCollection: () => undefined,
    setBlockCompletion: () => undefined,
    setBlockRecurrence: () => undefined,
    stopBlockRecurrence: () => undefined,
    syntax: {
      syntax: defaultTodoSyntax,
      source: defaultTodoSyntaxSource,
      updateSource: () => undefined,
    },
    toggleBlock: () => undefined,
    updateCollectionBody: () => undefined,
    updateSyntaxSource: () => undefined,
    ...overrides,
  };
}
