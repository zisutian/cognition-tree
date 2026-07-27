import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SyntaxContext } from "../../../../presentation/activities/views/syntax/SyntaxContext";
import { createSyntaxActivitySlots } from "../../../../presentation/activities/views/syntax/SyntaxActivitySlots";
import { SyntaxDetailPanel } from "../../../../presentation/activities/views/syntax/SyntaxDetailPanel";
import { SyntaxMainPanel } from "../../../../presentation/activities/views/syntax/SyntaxMainPanel";
import { createSyntaxView } from "../../fixtures/syntaxViewFixture";
import { createCtnSyntaxDraft } from "../../../../core/ctn/syntax/draft";
import { defaultJournalSyntax } from "../../../../core/journal/syntax/defaultJournalSyntax";
import { defaultTodoSyntax } from "../../../../core/todo/syntax/defaultTodoSyntax";
import { createUiSyntaxView } from "../../../../application/workspace/projection/viewSyntax";

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

    expect(markup).toContain('aria-label="新建笔记库语法"');
    expect(markup).toContain("系统语法");
    expect(markup).toContain("笔记库语法");
    expect(markup).toContain("日记");
    expect(markup).toContain("代办");
    expect(markup).toContain('data-syntax-file-id="syntax-primary"');
    expect(markup).toContain('data-syntax-file-id="syntax-secondary"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('aria-label="已启用语法"');
    expect(markup).toContain("主要语法");
    expect(markup).toContain("备用语法");
    expect(markup).toContain("错误");
    expect(markup).toMatch(/aria-label="新建笔记库语法"[^>]*disabled=""/);
    expect(markup).toMatch(
      /data-syntax-file-id="syntax-secondary"[^>]*disabled=""/,
    );
    expect(markup).toMatch(/data-syntax-owner="journal"[^>]*disabled=""/);
    expect(markup).toMatch(/data-syntax-owner="todo"[^>]*disabled=""/);
    expect(markup).not.toContain('aria-label="删除语法 备用语法"');
    expect(markup).toMatch(
      /aria-label="删除语法 主要语法"[^>]*disabled=""/,
    );
  });

  it("exposes syntax fields, rule actions, and inline color semantics", () => {
    const markup = renderToStaticMarkup(
      <SyntaxMainPanel view={createSyntaxView()} />,
    );

    expect(markup).toContain("type=\"number\"");
    expect(markup).toContain("max=\"16\"");
    expect(markup).toContain("缩进宽度");
    expect(markup).toContain("块规则");
    expect(markup).toContain("行内规则");
    expect(markup).toContain("新增块规则");
    expect(markup).toContain(
      'aria-label="全局概念引用颜色: 蓝色"',
    );
    expect(markup).not.toContain("全局概念引用背景色");
    expect(markup).not.toContain("全局概念引用文字色");
    expect(occurrenceCount(markup, 'aria-label="删除块规则"')).toBe(5);
    expect(occurrenceCount(markup, 'aria-label="删除行内规则"')).toBe(3);
    expect(markup).not.toContain('aria-label="语法名称"');
    expect(markup).not.toContain('data-syntax-field-id="syntax-profile-name"');
    expect(markup).toContain('data-syntax-field-id="syntax-tab-display-width"');
    expect(markup).toContain('data-syntax-field-id="syntax-block-rule-group"');
    expect(markup).toContain('data-syntax-field-id="syntax-inline-rule-group"');
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

    expect(markup).toContain('aria-label="启用语法 正在编辑"');
    expect(markup).toContain('aria-label="重命名语法 正在编辑"');
    expect(markup).toContain('aria-label="删除语法 正在编辑"');
    expect(markup).not.toContain('aria-label="删除语法 已启用"');
    expect(markup).toContain('aria-label="已启用语法"');
    expect(markup).not.toContain(">启用</span>");
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

    expect(markup).toContain("顶格正文");
    expect(markup).toContain("<h2>日记</h2>");
    expect(markup).not.toContain("顶格概念");
    expect(markup).not.toContain("首行标题");
    expect(markup).not.toContain('aria-label="语法名称"');
    expect(occurrenceCount(markup, 'aria-label="开始"')).toBe(1);
    expect(occurrenceCount(markup, 'aria-label="结束"')).toBe(1);
    expect(markup).toContain(">[[</span>");
    expect(markup).toContain(">]]</span>");
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

    expect(markup).toContain("代办背景色: 编辑器背景");
    expect(markup).toContain("代办颜色: 青色");
    expect(markup).not.toContain("代办文字色");
    expect(markup).toContain("<h2>代办</h2>");
    expect(markup).toContain(">代办</span>");
    expect(markup).toContain(">[]</span>");
    expect(markup).not.toContain('value="代办"');
    expect(markup).not.toContain('value="[]"');
    expect(markup).not.toContain("首行标题");
    expect(markup).not.toContain('aria-label="语法名称"');
    expect(markup).not.toContain('aria-label="角色: 普通块"');
    expect(markup).toContain(">普通块</span>");
    expect(markup).not.toContain('aria-label="标记"');
    expect(markup).not.toMatch(/aria-label="开始"[^>]*disabled=""/);
    expect(markup).not.toMatch(/aria-label="结束"[^>]*disabled=""/);
    expect(markup).not.toContain('aria-label="删除块规则"');
    expect(markup).not.toContain('aria-label="删除行内规则"');
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

    expect(markup).not.toContain('aria-label="语法名称"');
    expect(markup).not.toContain(message);
    expect(markup).toContain("撤销无效更改");
    expect(markup).toContain("修复或撤销前不能离开此配置");
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

    expect(markup).toContain("语法设置");
    expect(renderToStaticMarkup(<>{slots.context?.content}</>)).toContain(
      "当前笔记库没有语法文件。",
    );
    expect(slots.detail).not.toBeNull();
  });

  it("keeps the detail panel focused on syntax preview content", () => {
    const markup = renderToStaticMarkup(
      <SyntaxDetailPanel
        onCollapseDetail={() => undefined}
        view={createSyntaxView()}
      />,
    );

    expect(markup).toContain("语法预览");
    expect(markup).toContain("语法预览内容");
    expect(markup).toContain("首行标题示例");
    expect(markup).toContain("[[]]");
    expect(markup).toContain("全局概念引用");
    expect(markup).toContain("行内代码");
    expect(markup).not.toContain("行内内容");
    expect(markup).not.toContain("语法详情");
    expect(markup).not.toContain("缩进宽度");
    expect(markup).not.toContain("语法可视化");
    expect(markup).not.toContain("当前配置");
    expect(markup).not.toContain("语法统计");
    expect(markup).not.toContain(">状态<");
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

      expect(markup).not.toContain("首行标题示例");
    }
  });
});
