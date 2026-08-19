// SPDX-License-Identifier: GPL-3.0-or-later

import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";
import { TodoContext } from "../../../../presentation/activities/todo/TodoContext";
import { TodoDetailPanel } from "../../../../presentation/activities/todo/TodoDetailPanel";
import { TodoEditorPanel } from "../../../../presentation/activities/todo/TodoEditorPanel";
import { TodoRecurrenceEditor } from "../../../../presentation/activities/todo/TodoRecurrenceEditor";
import { FeedbackProvider } from "../../../../presentation/ui/shared/FeedbackProvider";
import { createTodoView } from "../../fixtures/todoViewFixture";
import { expectMarkupSemantics } from "../../markupSemantics";

describe("Todo panels", () => {
  it("renders ordered collections and actions only on the selected row", () => {
    const markup = renderToStaticMarkup(
      <TodoContext view={createTodoView()} />,
    );

    expectMarkupSemantics(markup, {
      has: [
        'aria-current="page"', 'aria-label="新建事项集合"',
        'aria-label="重命名事项集合 今天"',
        'aria-label="删除事项集合 今天"', ">删<", 'draggable="true"', "事项集合",
      ],
      lacks: [
        'aria-label="调整事项集合顺序 今天"', ">1/2<",
        'aria-label="重命名事项集合 稍后"',
        'aria-label="删除事项集合 稍后"', 'role="alertdialog"',
      ],
      ordered: ["今天", "稍后"],
    });
  });

  it("renders source-backed tasks in the detail tree with independent checkboxes", () => {
    const markup = renderToStaticMarkup(
      <TodoDetailPanel
        onCollapseDetail={() => undefined}
        view={createTodoView()}
      />,
    );

    expectMarkupSemantics(markup, {
      has: [
        'type="checkbox" checked=""',
        'aria-label="标记未完成 已完成但保持原位"',
        'aria-label="标记完成 未完成"', 'role="treeitem"',
        ">L1</span>", ">L2</span>",
      ],
      lacks: ['draggable="true"'],
      ordered: [">已完成但保持原位</span>", ">未完成</span>"],
    });
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
        progress: {
          ariaLabel:
            "周期任务，已完成 3/4（完成次数/截至今天应完成次数），下次 2026-07-27",
          text: "↻ 3/4",
        },
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
    const stoppedEditorMarkup = renderToStaticMarkup(
      <FeedbackProvider activeActivityId="todo">
        <TodoRecurrenceEditor
          node={{
            ...recurringNode,
            recurrence: {
              ...recurringNode.recurrence,
              active: false,
              currentOccurrenceDate: null,
              nextOccurrenceDate: null,
              progress: null,
            },
          }}
          onCancel={() => undefined}
          onConfirm={() => undefined}
        />
      </FeedbackProvider>,
    );

    expectMarkupSemantics(markup, {
      has: [
        'aria-label="配置周期 已完成但保持原位"',
        "↻ 3/4",
        "周期任务，已完成 3/4（完成次数/截至今天应完成次数），下次 2026-07-27",
      ],
      lacks: ['aria-label="配置周期 未完成"'],
    });
    expectMarkupSemantics(editorMarkup, {
      has: [
        "完成 3/4 · 下次 2026-07-27", 'aria-label="周期类型"',
        ">确定</button>", ">取消</button>",
      ],
    });
    expectMarkupSemantics(stoppedEditorMarkup, {
      has: ["历史完成 3/4 · 周期已停止"],
      lacks: ["↻ 3/4", ">停止<"],
    });
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

    expectMarkupSemantics(editorMarkup, {
      has: ['aria-label="代办编辑"', 'data-editor-mode="body"'],
    });
    expectMarkupSemantics(markup, {
      has: ["还没有事项集合", "新建事项集合"],
    });
  });

});
