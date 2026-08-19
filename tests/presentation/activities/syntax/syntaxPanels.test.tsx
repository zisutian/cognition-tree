import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SyntaxContext } from "../../../../presentation/activities/syntax/SyntaxContext";
import { createSyntaxActivitySlots } from "../../../../presentation/activities/syntax/SyntaxActivitySlots";
import { SyntaxDetailPanel } from "../../../../presentation/activities/syntax/SyntaxDetailPanel";
import { SyntaxMainPanel } from "../../../../presentation/activities/syntax/SyntaxMainPanel";
import { createSyntaxView } from "../../fixtures/syntaxViewFixture";
import { createCtnSyntaxDraft } from "../../../../core/ctn/syntax/draft";
import { defaultJournalSyntax } from "../../../../core/journal/syntax/defaultJournalSyntax";
import { defaultTodoSyntax } from "../../../../core/todo/syntax/defaultTodoSyntax";
import { createUiSyntaxView } from "../../../../application/workspace/projection/viewSyntax";
import { expectMarkupSemantics } from "../../markupSemantics";

function occurrenceCount(source: string, value: string) {
  return source.split(value).length - 1;
}

describe("syntax panels", () => {
  it("lists syntax files with the active and invalid state", () => {
    const baseView = createSyntaxView();
    const markup = renderToStaticMarkup(
      <SyntaxContext
        view={{
          ...baseView,
          files: [
            {
              hasErrors: true,
              id: "syntax-primary",
              isActive: true,
              isSelected: true,
              name: "主要语法",
            },
            {
              hasErrors: false,
              id: "syntax-secondary",
              isActive: false,
              isSelected: false,
              name: "备用语法",
            },
          ],
          hasDraftErrors: true,
        }}
      />,
    );

    expectMarkupSemantics(markup, {
      has: [
        'aria-label="新建笔记库语法"', "系统语法", "笔记库语法",
        'aria-current="page"', 'aria-label="已启用语法"',
        "主要语法", "备用语法", "错误",
        /aria-label="新建笔记库语法"[^>]*disabled=""/,
        /data-syntax-file-id="syntax-secondary"[^>]*disabled=""/,
        /data-syntax-owner="(?:journal|todo)"[^>]*disabled=""/,
        /aria-label="删除语法 主要语法"[^>]*disabled=""/,
      ],
      lacks: ['aria-label="删除语法 备用语法"'],
    });
  });

  it("exposes syntax fields, rule actions, and inline color semantics", () => {
    const markup = renderToStaticMarkup(
      <SyntaxMainPanel view={createSyntaxView()} />,
    );

    expectMarkupSemantics(markup, {
      has: [
        'type="number"', 'max="16"', "缩进宽度",
        "块规则", "行内规则", "新增块规则",
        'aria-label="全局概念引用颜色: 灰色"',
      ],
      lacks: [
        "全局概念引用背景色", "全局概念引用文字色",
        'aria-label="语法名称"',
      ],
    });
    expect(occurrenceCount(markup, 'aria-label="删除块规则"')).toBe(5);
    expect(occurrenceCount(markup, 'aria-label="删除行内规则"')).toBe(3);
  });

  it("renders file actions only on the selected row and separates activation", () => {
    const view = createSyntaxView();
    const markup = renderToStaticMarkup(
      <SyntaxContext
        view={{
          ...view,
          activeFileId: "syntax-active",
          files: [
            {
              hasErrors: false,
              id: "syntax-active",
              isActive: true,
              isSelected: false,
              name: "已启用",
            },
            {
              hasErrors: false,
              id: "syntax-editing",
              isActive: false,
              isSelected: true,
              name: "正在编辑",
            },
          ],
          selectedTarget: {
            fileId: "syntax-editing",
            kind: "workspace-file",
          },
        }}
      />,
    );

    expectMarkupSemantics(markup, {
      has: [
        'aria-label="启用语法 正在编辑"', 'aria-label="重命名语法 正在编辑"',
        'aria-label="删除语法 正在编辑"',
        'aria-label="已启用语法"',
      ],
      lacks: ['aria-label="删除语法 已启用"', ">启用</span>"],
    });
  });

  it("keeps the Journal name and reference trigger visibly protected", () => {
    const base = createSyntaxView();
    const draft = createCtnSyntaxDraft(defaultJournalSyntax);
    const referenceId = draft.inline.find(
      ({ semanticId }) => semanticId === "global-reference",
    )!.id;
    const markup = renderToStaticMarkup(
      <SyntaxMainPanel
        view={{
          ...base,
          ...createUiSyntaxView({ draft, owner: "journal" }),
          nameEditable: false,
          protectedInlineRuleIds: [referenceId],
          protectedInlineTriggerRuleIds: [referenceId],
          rootRuleLabel: "顶格正文",
          selectedTarget: { kind: "journal" },
        }}
      />,
    );

    expectMarkupSemantics(markup, {
      has: ["顶格正文", "<h2>日记</h2>", ">[[</span>", ">]]</span>"],
      lacks: ["顶格概念", "首行标题", 'aria-label="语法名称"'],
    });
    expect(occurrenceCount(markup, 'aria-label="开始"')).toBe(1);
    expect(occurrenceCount(markup, 'aria-label="结束"')).toBe(1);
    expect(occurrenceCount(markup, 'aria-label="删除块规则"')).toBe(4);
    expect(occurrenceCount(markup, 'aria-label="删除行内规则"')).toBe(2);
  });

  it("renders the protected Todo item with fixed structure and editable colors", () => {
    const base = createSyntaxView();
    const draft = createCtnSyntaxDraft(defaultTodoSyntax);
    const todoItemId = draft.blocks.find(
      ({ semanticId }) => semanticId === "todo-item",
    )!.id;
    const referenceId = draft.inline.find(
      ({ semanticId }) => semanticId === "global-reference",
    )!.id;
    const markup = renderToStaticMarkup(
      <SyntaxMainPanel
        view={{
          ...base,
          ...createUiSyntaxView({ draft, owner: "todo" }),
          nameEditable: false,
          protectedBlockRuleIds: [todoItemId],
          protectedInlineRuleIds: [referenceId],
          rootRuleLabel: null,
          selectedTarget: { kind: "todo" },
        }}
      />,
    );

    expectMarkupSemantics(markup, {
      has: [
        "代办背景色: 编辑器背景", "代办颜色: 青色", "<h2>代办</h2>",
        ">代办</span>", ">[]</span>", ">普通块</span>", 'value="注解"',
        'aria-label="角色: 普通块"', 'aria-label="标记"',
        'aria-label="删除块规则"',
      ],
      lacks: [
        "代办文字色", 'value="代办"', 'value="[]"', "首行标题",
        'aria-label="语法名称"',
        /aria-label="开始"[^>]*disabled=""/,
        /aria-label="结束"[^>]*disabled=""/,
        'aria-label="删除行内规则"',
      ],
    });
    expect(occurrenceCount(markup, 'aria-label="角色: 普通块"')).toBe(1);
    expect(occurrenceCount(markup, 'aria-label="标记"')).toBe(1);
    expect(occurrenceCount(markup, 'aria-label="删除块规则"')).toBe(1);
  });

  it("keeps catalog name conflicts in the invalid draft recovery state", () => {
    const view = createSyntaxView();
    const message = "语法名称“备用语法”已存在。";
    const markup = renderToStaticMarkup(
      <SyntaxMainPanel
        view={{
          ...view,
          hasDraftErrors: true,
          nameConflictMessage: message,
        }}
      />,
    );

    expectMarkupSemantics(markup, {
      has: ["撤销无效更改", "修复或撤销前不能离开此配置"],
      lacks: ['aria-label="语法名称"', message],
    });
  });

  it("keeps system syntax available when the workspace catalog is empty", () => {
    const view = createSyntaxView();
    const emptyView = {
      ...view,
      activeFileId: null,
      files: [],
      selectedTarget: { kind: "journal" as const },
      systemConfigurations: view.systemConfigurations.map((item) => ({
        ...item,
        isSelected: item.owner === "journal",
      })),
      workspaceAvailable: false,
    };
    const markup = renderToStaticMarkup(
      <SyntaxMainPanel view={emptyView} />,
    );
    const slots = createSyntaxActivitySlots({
      onCollapseDetail: () => undefined,
      view: emptyView,
    });

    expectMarkupSemantics(markup, { has: ["语法设置"] });
    expectMarkupSemantics(renderToStaticMarkup(<>{slots.context?.content}</>), {
      has: ["当前笔记库没有语法文件。"],
    });
    expect(slots.detail).not.toBeNull();
  });

  it("keeps the detail panel focused on syntax preview content", () => {
    const markup = renderToStaticMarkup(
      <SyntaxDetailPanel
        onCollapseDetail={() => undefined}
        view={createSyntaxView()}
      />,
    );

    expectMarkupSemantics(markup, {
      has: [
        "语法预览", "语法预览内容", "首行标题示例",
        "[[]]", "全局概念引用", "行内代码",
      ],
      lacks: [
        "行内内容", "语法详情", "缩进宽度", "语法可视化",
        "当前配置", "语法统计", ">状态<",
      ],
    });
  });

  it("omits hidden system titles from syntax previews", () => {
    const base = createSyntaxView();

    for (const kind of ["journal", "todo"] as const) {
      const markup = renderToStaticMarkup(
        <SyntaxDetailPanel
          onCollapseDetail={() => undefined}
          view={{ ...base, selectedTarget: { kind } }}
        />,
      );

      expectMarkupSemantics(markup, { lacks: ["首行标题示例"] });
    }
  });
});
