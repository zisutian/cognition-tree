import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SyntaxContext } from "../../../../src/ui/activities/syntax/SyntaxContext";
import { createSyntaxActivitySlots } from "../../../../src/ui/activities/syntax/SyntaxActivitySlots";
import { SyntaxDetailPanel } from "../../../../src/ui/activities/syntax/SyntaxDetailPanel";
import { SyntaxMainPanel } from "../../../../src/ui/activities/syntax/SyntaxMainPanel";
import { createView } from "../../viewFactory";

describe("syntax panels", () => {
  it("lists syntax files with the active and invalid state", () => {
    const baseView = createView().syntax;
    const markup = renderToStaticMarkup(
      <SyntaxContext
        view={{
          ...baseView,
          files: [
            {
              hasErrors: true,
              id: "syntax-primary",
              isActive: true,
              name: "主要语法",
            },
            {
              hasErrors: false,
              id: "syntax-secondary",
              isActive: false,
              name: "备用语法",
            },
          ],
          hasDraftErrors: true,
        }}
      />,
    );

    expect(markup).toContain('aria-label="新建语法"');
    expect(markup).toContain('data-syntax-file-id="syntax-primary"');
    expect(markup).toContain('data-syntax-file-id="syntax-secondary"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("主要语法");
    expect(markup).toContain("备用语法");
    expect(markup).toContain("错误");
    expect(markup).toContain("has-diagnostics");
    expect(markup).toMatch(/aria-label="新建语法"[^>]*disabled=""/);
    expect(markup).toMatch(
      /data-syntax-file-id="syntax-secondary"[^>]*disabled=""/,
    );
    expect(markup).toMatch(
      /aria-label="删除语法 备用语法"[^>]*disabled=""/,
    );
    expect(markup).toMatch(
      /aria-label="删除语法 主要语法"[^>]*disabled=""/,
    );
  });

  it("uses grouped settings rows with one rule row format", () => {
    const markup = renderToStaticMarkup(
      <SyntaxMainPanel view={createView().syntax} />,
    );

    expect(markup).toContain("type=\"number\"");
    expect(markup).toContain("max=\"16\"");
    expect(markup).toContain("syntax-settings-stack");
    expect(markup).toContain("syntax-settings-group");
    expect(markup).toContain("syntax-setting-line");
    expect(markup).toContain("syntax-rule-row");
    expect(markup).toContain("syntax-rule-header");
    expect(markup).toContain("syntax-rule-actions");
    expect(markup).toContain("语法名称");
    expect(markup).toContain("缩进宽度");
    expect(markup).toContain("块规则");
    expect(markup).toContain("行内规则");
    expect(markup).toContain("syntax-tone-picker");
    expect(markup).toContain("syntax-tone-button is-compact");
    expect(markup).toContain("syntax-role-picker");
    expect(markup).toContain("syntax-role-button");
    expect(markup).toContain("新增块规则");
    expect(markup).toContain('data-syntax-field-id="syntax-profile-name"');
    expect(markup).toContain('data-syntax-field-id="syntax-tab-display-width"');
    expect(markup).toContain('data-syntax-field-id="syntax-marker-rule-group"');
    expect(markup).toContain('data-syntax-field-id="syntax-inline-rule-group"');
    expect(markup).not.toContain("ui-status");
    expect(markup).not.toContain("<select");
    expect(markup).not.toContain("<span>默认</span>");
    expect(markup).not.toContain("<span>蓝色</span>");
    expect(markup).not.toContain("<span>灰色</span>");
    expect(markup).not.toContain("syntax-settings-table");
    expect(markup).not.toContain("syntax-setting-row");
    expect(markup).not.toContain("syntax-row-scope");
    expect(markup).not.toContain("syntax-config-strip");
    expect(markup).not.toContain("syntax-config-item");
    expect(markup).not.toContain("syntax-config-grid");
    expect(markup).not.toContain("syntax-block-header");
    expect(markup).not.toContain("syntax-inline-header");
  });

  it("shows a catalog name conflict at the profile name field", () => {
    const view = createView().syntax;
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

    expect(markup).toContain('aria-describedby="syntax-name-conflict"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('id="syntax-name-conflict"');
    expect(markup).toContain(message);
  });

  it("offers file creation and removes the preview when the catalog is empty", () => {
    const view = createView().syntax;
    const emptyView = {
      ...view,
      activeFileId: null,
      files: [],
      isConfigured: false,
    };
    const markup = renderToStaticMarkup(
      <SyntaxMainPanel view={emptyView} />,
    );
    const slots = createSyntaxActivitySlots({
      onCollapseDetail: () => undefined,
      view: emptyView,
    });

    expect(markup).toContain("没有语法文件");
    expect(markup).toContain("新建语法");
    expect(renderToStaticMarkup(<>{slots.context?.content}</>)).toContain(
      "没有语法文件。",
    );
    expect(slots.detail).toBeNull();
  });

  it("keeps the detail panel focused on syntax preview only", () => {
    const markup = renderToStaticMarkup(
      <SyntaxDetailPanel
        onCollapseDetail={() => undefined}
        view={createView().syntax}
      />,
    );

    expect(markup).toContain("语法预览");
    expect(markup).toContain("语法预览内容");
    expect(markup).toContain("detail-panel-stack");
    expect(markup).toContain("syntax-render-line");
    expect(markup).toContain("syntax-render-marker");
    expect(markup).toContain("ctn-tone-");
    expect(markup).toContain("ctn-text-color-");
    expect(markup).not.toContain("syntax-render-tone-");
    expect(markup).not.toContain("syntax-render-text-");
    expect(markup).toContain("首行标题示例");
    expect(markup).toContain("[[]]");
    expect(markup).toContain("全局概念引用");
    expect(markup).toContain("行内代码");
    expect(markup).not.toContain("行内内容");
    expect(markup).not.toContain("语法详情");
    expect(markup).not.toContain("缩进宽度");
    expect(markup).not.toContain("语法可视化");
    expect(markup).not.toContain("detail-primary-row");
    expect(markup).not.toContain("detail-meta-line");
    expect(markup).not.toContain("detail-divider");
    expect(markup).not.toContain("ui-symbol-slot");
    expect(markup).not.toContain("ui-section-title");
    expect(markup).not.toContain("syntax-detail-summary");
    expect(markup).not.toContain("syntax-detail-meta");
    expect(markup).not.toContain("syntax-detail-preview");
    expect(markup).not.toContain("syntax-detail-config");
    expect(markup).not.toContain("当前配置");
    expect(markup).not.toContain("语法统计");
    expect(markup).not.toContain(">状态<");
  });
});
