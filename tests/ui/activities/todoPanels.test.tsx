// SPDX-License-Identifier: GPL-3.0-or-later

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TodoContext } from "../../../presentation/activities/views/todo/TodoContext";
import { TodoDetailPanel } from "../../../presentation/activities/views/todo/TodoDetailPanel";
import { TodoEditorPanel } from "../../../presentation/activities/views/todo/TodoEditorPanel";
import { TodoRecurrenceEditor } from "../../../presentation/activities/views/todo/TodoRecurrenceEditor";
import { FeedbackProvider } from "../../../presentation/ui/shared/FeedbackProvider";
import { createTodoView } from "../fixtures/todoViewFixture";

describe("Todo panels", () => {
  it("renders ordered collections and actions only on the selected row", () => {
    const markup = renderToStaticMarkup(
      <TodoContext view={createTodoView()} />,
    );

    expect(markup.indexOf("今天")).toBeLessThan(markup.indexOf("稍后"));
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('aria-label="新建事项集合"');
    expect(markup).toContain('aria-label="重命名事项集合 今天"');
    expect(markup).toContain('aria-label="删除事项集合 今天"');
    expect(markup).toContain('draggable="true"');
    expect(markup).not.toContain('aria-label="调整事项集合顺序 今天"');
    expect(markup).toContain("事项集合");
    expect(markup).not.toContain(">1/2<");
    expect(markup).not.toContain('aria-label="重命名事项集合 稍后"');
    expect(markup).not.toContain('aria-label="删除事项集合 稍后"');
  });

  it("renders source-backed tasks in the detail tree with independent checkboxes", () => {
    const markup = renderToStaticMarkup(
      <TodoDetailPanel
        onCollapseDetail={() => undefined}
        view={createTodoView()}
      />,
    );

    expect(markup.indexOf(">已完成但保持原位</span>")).toBeLessThan(
      markup.indexOf(">未完成</span>"),
    );
    expect(markup).toContain('type="checkbox" checked=""');
    expect(markup).toContain('aria-label="标记未完成 已完成但保持原位"');
    expect(markup).toContain('aria-label="标记完成 未完成"');
    expect(markup).toContain('role="treeitem"');
    expect(markup).toContain(">L1</span>");
    expect(markup).toContain(">L2</span>");
    expect(markup).not.toContain('draggable="true"');
  });

  it("shows recurrence controls only for the selected structure task", () => {
    const base = createTodoView();
    const recurringNode = {
      ...base.outline.nodes[0]!,
      recurrence: {
        active: true,
        completedCount: 3,
        currentOccurrenceDate: "2026-07-26" as const,
        nextOccurrenceDate: "2026-07-27" as const,
        rule: { interval: 1, kind: "daily" as const },
        totalCount: 4,
      },
    };
    const view = {
      ...base,
      outline: {
        ...base.outline,
        activeBlock: recurringNode,
        nodes: [recurringNode, base.outline.nodes[1]!],
      },
    };
    const markup = renderToStaticMarkup(
      <FeedbackProvider activeActivityId="todo">
        <TodoDetailPanel
          onCollapseDetail={() => undefined}
          view={view}
        />
      </FeedbackProvider>,
    );
    const editorMarkup = renderToStaticMarkup(
      <FeedbackProvider activeActivityId="todo">
        <TodoRecurrenceEditor
          node={recurringNode}
          onCancel={() => undefined}
          onConfirm={() => undefined}
        />
      </FeedbackProvider>,
    );

    expect(markup).toContain('aria-label="配置周期 已完成但保持原位"');
    expect(markup).toContain(
      'title="周期任务 · 3/4 · 下次 2026-07-27"',
    );
    expect(markup).not.toContain('aria-label="配置周期 未完成"');
    expect(editorMarkup).toContain("完成 3/4 · 下次 2026-07-27");
    expect(editorMarkup).toContain('aria-label="周期类型"');
    expect(editorMarkup).toContain(">确定</button>");
    expect(editorMarkup).toContain(">取消</button>");
  });

  it("mounts the CTN body editor and shows an empty collection entry point", () => {
    const editorMarkup = renderToStaticMarkup(
      <TodoEditorPanel
        focusMode={false}
        onToggleFocusMode={() => undefined}
        view={createTodoView()}
      />,
    );
    const base = createTodoView();
    const markup = renderToStaticMarkup(
      <TodoEditorPanel
        focusMode={false}
        onToggleFocusMode={() => undefined}
        view={{
          ...base,
          activeCollection: null,
          collections: [],
        }}
      />,
    );

    expect(editorMarkup).toContain('aria-label="代办编辑"');
    expect(editorMarkup).toContain('data-editor-mode="body"');
    expect(markup).toContain("还没有事项集合");
    expect(markup).toContain("新建事项集合");
  });

  it("starts collection deletion in the selected row without a dialog", () => {
    const markup = renderToStaticMarkup(
      <TodoContext view={createTodoView()} />,
    );

    expect(markup).toContain('aria-label="删除事项集合 今天"');
    expect(markup).toContain(">删<");
    expect(markup).not.toContain('role="alertdialog"');
  });
});
