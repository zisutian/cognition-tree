// SPDX-License-Identifier: GPL-3.0-or-later

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  TodoChecklistPanel,
  TodoCollectionDeleteConfirmation,
  TodoContext,
  createTodoInlineEditBlurGuard,
  resolveTodoKeyboardSortCommand,
} from "../../../src/ui/activities/todo/TodoPanels";
import { createView } from "../viewFactory";

describe("Todo panels", () => {
  it.each([
    "collection creation",
    "collection rename",
    "item edit",
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

  it("resolves keyboard sorting only while a handle is active", () => {
    expect(resolveTodoKeyboardSortCommand({
      active: false,
      currentIndex: 1,
      itemCount: 3,
      key: "ArrowUp",
    })).toBeNull();
    expect(resolveTodoKeyboardSortCommand({
      active: true,
      currentIndex: 1,
      itemCount: 3,
      key: "ArrowUp",
    })).toEqual({ kind: "move", toIndex: 0 });
    expect(resolveTodoKeyboardSortCommand({
      active: true,
      currentIndex: 1,
      itemCount: 3,
      key: "ArrowDown",
    })).toEqual({ kind: "move", toIndex: 2 });
    expect(resolveTodoKeyboardSortCommand({
      active: true,
      currentIndex: 0,
      itemCount: 3,
      key: "ArrowUp",
    })).toEqual({ kind: "move", toIndex: 0 });
    expect(resolveTodoKeyboardSortCommand({
      active: true,
      currentIndex: 2,
      itemCount: 3,
      key: "ArrowDown",
    })).toEqual({ kind: "move", toIndex: 2 });
    expect(resolveTodoKeyboardSortCommand({
      active: true,
      currentIndex: 1,
      itemCount: 3,
      key: "Escape",
    })).toEqual({ kind: "exit" });
    expect(resolveTodoKeyboardSortCommand({
      active: true,
      currentIndex: 1,
      itemCount: 3,
      key: "Enter",
    })).toBeNull();
  });

  it("renders ordered selectable collections with inline-edit and drag entry points", () => {
    const markup = renderToStaticMarkup(
      <TodoContext view={createView().todo} />,
    );

    expect(markup.indexOf("今天")).toBeLessThan(markup.indexOf("稍后"));
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('aria-label="新建事项集合"');
    expect(markup).toContain('aria-label="重命名事项集合 今天"');
    expect(markup).toContain('aria-label="删除事项集合 今天"');
    expect(markup).toContain('aria-label="调整事项集合顺序 今天"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain(
      'aria-keyshortcuts="Enter Space ArrowUp ArrowDown Escape"',
    );
    expect(markup).toContain('draggable="true"');
    expect(markup).toContain(">1/2<");
  });

  it("renders the flat stored item order and keeps completed work in place", () => {
    const markup = renderToStaticMarkup(
      <TodoChecklistPanel view={createView().todo} />,
    );

    expect(markup.indexOf("已完成但保持原位")).toBeLessThan(
      markup.indexOf("未完成"),
    );
    expect(markup).toContain("todo-item-row is-completed");
    expect(markup).toContain('type="checkbox" checked=""');
    expect(markup).toContain('aria-label="添加代办"');
    expect(markup).toContain('aria-label="编辑代办 未完成"');
    expect(markup).toContain('aria-label="删除代办 未完成"');
    expect(markup).toContain(
      'aria-label="调整代办顺序 已完成但保持原位"',
    );
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain(
      'aria-keyshortcuts="Enter Space ArrowUp ArrowDown Escape"',
    );
    expect(markup).toContain('draggable="true"');
  });

  it("shows an empty collection entry point without mounting a detail surface", () => {
    const base = createView().todo;
    const markup = renderToStaticMarkup(
      <TodoChecklistPanel
        view={{
          ...base,
          activeCollection: null,
          collections: [],
          items: [],
        }}
      />,
    );

    expect(markup).toContain("还没有事项集合");
    expect(markup).toContain("从左侧新建事项集合");
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
