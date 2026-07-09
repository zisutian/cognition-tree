import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SyntaxDetailPanel,
  SyntaxMainPanel,
} from "../../../../src/ui/activities/syntax/SyntaxPanels";
import { createView } from "../../viewFactory";

// @ts-expect-error Node built-in types are intentionally outside the app tsconfig.
const { readFileSync } = (await import("node:fs")) as {
  readFileSync: (path: URL, encoding: "utf8") => string;
};
const activitiesCss = readFileSync(
  new URL("../../../../src/ui/styles/activities/activities.css", import.meta.url),
  "utf8",
);

describe("syntax panels", () => {
  it("uses grouped settings rows with one rule row format", () => {
    const markup = renderToStaticMarkup(<SyntaxMainPanel view={createView()} />);

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
    expect(markup).toContain("新增块规则");
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

  it("keeps the detail panel focused on configuration and visual preview", () => {
    const markup = renderToStaticMarkup(
      <SyntaxDetailPanel
        onCollapseDetail={() => undefined}
        view={createView()}
      />,
    );

    expect(markup).toContain("语法详情");
    expect(markup).toContain("缩进宽度");
    expect(markup).toContain("语法可视化");
    expect(markup).toContain("detail-panel-stack");
    expect(markup).toContain("detail-primary-row");
    expect(markup).toContain("detail-meta-line");
    expect(markup).toContain("detail-divider");
    expect(markup).toContain("syntax-render-line");
    expect(markup).toContain("syntax-render-marker");
    expect(markup).toContain("首行标题示例");
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
    expect(activitiesCss).toContain(".syntax-setting-line input");
    expect(activitiesCss).toContain(".syntax-rule-row input");
    expect(activitiesCss).toContain(
      "border: var(--ui-border-width) solid transparent",
    );
    expect(activitiesCss).not.toMatch(
      /\.syntax-rule-row input:focus,[\s\S]*?outline: var\(--ui-focus-outline\)/,
    );
    expect(activitiesCss).not.toMatch(
      /\.syntax-tone-tile\.is-selected,[\s\S]*?border-color: var\(--color-accent\)/,
    );
    expect(activitiesCss).not.toMatch(
      /\.syntax-render-tone-green \{[\s\S]*?background: var\(--ctn-tone-green-soft\)/,
    );
    expect(activitiesCss).toContain(
      "minmax(calc(var(--ui-control-height) * 2), max-content)",
    );
  });

  it("keeps syntax main layout on one table grid instead of mixed row systems", () => {
    expect(activitiesCss).toContain(".syntax-settings-stack");
    expect(activitiesCss).toContain(".syntax-settings-group");
    expect(activitiesCss).toContain(".syntax-setting-line");
    expect(activitiesCss).toContain(".syntax-rule-row");
    expect(activitiesCss).toContain(".syntax-pair-fields");
    expect(activitiesCss).toContain(".syntax-tone-button.is-compact");
    expect(activitiesCss).not.toContain(".syntax-settings-table");
    expect(activitiesCss).not.toContain(".syntax-setting-row");
    expect(activitiesCss).not.toContain(".syntax-config-strip");
    expect(activitiesCss).not.toContain(".syntax-config-item");
    expect(activitiesCss).not.toContain(".syntax-block-row");
    expect(activitiesCss).not.toContain(".syntax-inline-row");
    expect(activitiesCss).not.toContain(".syntax-tone-fields");
  });
});
