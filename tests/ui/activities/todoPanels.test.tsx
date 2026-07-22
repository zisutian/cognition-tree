// SPDX-License-Identifier: GPL-3.0-or-later

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  TodoCollectionDeleteConfirmation,
  TodoContext,
  TodoDetailPanel,
  TodoEditorPanel,
  createTodoInlineEditBlurGuard,
} from "../../../src/ui/activities/todo/TodoPanels";
import { createView } from "../viewFactory";

describe("Todo panels", () => {
  it.each([
    "collection creation",
    "collection rename",
  ])("does not submit %s from the blur caused by Escape", () => {
    const guard = createTodoInlineEditBlurGuard();
    const submit = vi.fn();

    guard.begin();
    guard.cancel();
    guard.onBlur(submit);

    expect(submit).not.toHaveBeenCalled();

    guard.begin();
    guard.onBlur(submit);

    expect(submit).toHaveBeenCalledOnce();
  });

  it("renders ordered collections and actions only on the selected row", () => {
    const markup = renderToStaticMarkup(
      <TodoContext view={createView().todo} />,
    );

    expect(markup.indexOf("今天")).toBeLessThan(markup.indexOf("稍后"));
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('aria-label="新建事项集合"');
    expect(markup).toContain('aria-label="重命名事项集合 今天"');
    expect(markup).toContain('aria-label="删除事项集合 今天"');
    expect(markup).toContain('aria-label="调整事项集合顺序 今天"');
    expect(markup).toContain('draggable="true"');
    expect(markup).toContain(">1/2<");
    expect(markup).not.toContain('aria-label="重命名事项集合 稍后"');
    expect(markup).not.toContain('aria-label="删除事项集合 稍后"');
  });

  it("renders source-backed tasks in the detail tree with independent checkboxes", () => {
    const markup = renderToStaticMarkup(
      <TodoDetailPanel
        onCollapseDetail={() => undefined}
        view={createView().todo}
      />,
    );

    expect(markup.indexOf(">已完成但保持原位</button>")).toBeLessThan(
      markup.indexOf(">未完成</button>"),
    );
    expect(markup).toContain("todo-structure-item is-completed");
    expect(markup).toContain('type="checkbox" checked=""');
    expect(markup).toContain('aria-label="标记未完成 已完成但保持原位"');
    expect(markup).toContain('aria-label="标记完成 未完成"');
    expect(markup).toContain('role="treeitem"');
    expect(markup).toContain('draggable="true"');
  });

  it("mounts the CTN body editor and shows an empty collection entry point", () => {
    const editorMarkup = renderToStaticMarkup(
      <TodoEditorPanel
        focusMode={false}
        onToggleFocusMode={() => undefined}
        view={createView().todo}
      />,
    );
    const base = createView().todo;
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

  it("requires confirmation before deleting a collection and its items", () => {
    const view = createView().todo;
    const onDelete = vi.fn();
    const markup = renderToStaticMarkup(
      <TodoCollectionDeleteConfirmation
        pendingCollection={view.collections[0] ?? null}
        onCancel={() => undefined}
        onDelete={onDelete}
      />,
    );

    expect(markup).toContain('role="alertdialog"');
    expect(markup).toContain("永久删除事项集合");
    expect(markup).toContain("2 条代办");
    expect(onDelete).not.toHaveBeenCalled();
  });
});
