import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SyntaxDetailPanel } from "../../../../src/ui/activities/syntax/SyntaxDetailPanel";
import { SyntaxMainPanel } from "../../../../src/ui/activities/syntax/SyntaxMainPanel";
import { SyntaxSetupPanel } from "../../../../src/ui/activities/syntax/SyntaxSetupPanel";
import { createView } from "../../viewFactory";

// @ts-expect-error Node built-in types are intentionally outside the app tsconfig.
const { readFileSync } = (await import("node:fs")) as {
  readFileSync: (path: URL, encoding: "utf8") => string;
};
const syntaxCss = readFileSync(
  new URL("../../../../src/ui/styles/activities/syntax.css", import.meta.url),
  "utf8",
);
const blockTextCss = readFileSync(
  new URL("../../../../src/ui/styles/shared/blockText.css", import.meta.url),
  "utf8",
);
const primitivesCss = readFileSync(
  new URL("../../../../src/ui/styles/shared/primitives.css", import.meta.url),
  "utf8",
);

describe("syntax panels", () => {
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

  it("keeps setup copy aligned with structure operation wording", () => {
    const markup = renderToStaticMarkup(
      <SyntaxSetupPanel
        errorMessage=""
        onConfigureSyntax={() => undefined}
        onUseDefaultSyntax={() => undefined}
      />,
    );

    expect(markup).toContain("结构操作");
    expect(markup).not.toContain("迁移结构");
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

  it("keeps syntax controls from using bright focus or selected borders", () => {
    expect(primitivesCss).toContain(".ui-input");
    expect(primitivesCss).toContain(
      "border: var(--ui-border-width) solid transparent",
    );
    expect(syntaxCss).not.toContain(".syntax-setting-line input");
    expect(syntaxCss).not.toContain(".syntax-rule-row input");
    expect(syntaxCss).not.toMatch(
      /\.syntax-rule-row input:focus,[\s\S]*?outline: var\(--ui-focus-outline\)/,
    );
    expect(syntaxCss).not.toMatch(
      /\.syntax-tone-tile\.is-selected,[\s\S]*?border-color: var\(--color-accent\)/,
    );
    expect(blockTextCss).toMatch(
      /\.ctn-tone-green \{[\s\S]*?--ctn-tone-background: var\(--ctn-tone-green-soft\)/,
    );
    expect(blockTextCss).toContain(
      "--ctn-tone-background: color-mix(",
    );
    expect(syntaxCss).not.toContain("border-left-color: var(--ctn-tone");
    expect(syntaxCss).not.toContain(
      "border-left: calc(var(--ui-border-width) * 2) solid transparent",
    );
    expect(syntaxCss).toContain(
      "minmax(calc(var(--ui-control-height) * 2), max-content)",
    );
  });

  it("keeps syntax main layout on grouped settings instead of mixed row systems", () => {
    expect(syntaxCss).toContain(".syntax-settings-stack");
    expect(syntaxCss).toContain(".syntax-settings-group");
    expect(syntaxCss).toContain(".syntax-setting-line");
    expect(syntaxCss).toContain(".syntax-rule-row");
    expect(syntaxCss).toContain(".syntax-pair-fields");
    expect(syntaxCss).toContain("--syntax-rule-row-width");
    expect(syntaxCss).toContain("width: min(100%, var(--syntax-rule-row-width))");
    expect(syntaxCss).toContain("calc(var(--ui-control-height) * 12)");
    expect(syntaxCss).not.toContain("calc(var(--ui-control-height) * 26)");
    expect(syntaxCss).toContain(".syntax-tone-button.is-compact");
    expect(syntaxCss).toContain(".syntax-dropdown-menu");
    expect(syntaxCss).toContain(".syntax-role-menu");
    expect(syntaxCss).toContain(".syntax-role-list");
    expect(syntaxCss).toContain(".syntax-role-option");
    expect(syntaxCss).toContain("justify-content: center");
    expect(syntaxCss).not.toContain(".syntax-settings-table");
    expect(syntaxCss).not.toContain(".syntax-setting-row");
    expect(syntaxCss).not.toContain(".syntax-config-strip");
    expect(syntaxCss).not.toContain(".syntax-config-item");
    expect(syntaxCss).not.toContain(".syntax-block-row");
    expect(syntaxCss).not.toContain(".syntax-inline-row");
    expect(syntaxCss).not.toContain(".syntax-tone-fields");
  });
});
