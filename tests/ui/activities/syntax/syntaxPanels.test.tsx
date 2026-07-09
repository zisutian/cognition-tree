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
  it("uses constrained tab width input and tone pickers", () => {
    const markup = renderToStaticMarkup(<SyntaxMainPanel view={createView()} />);

    expect(markup).toContain("type=\"number\"");
    expect(markup).toContain("max=\"16\"");
    expect(markup).toContain("syntax-config-strip");
    expect(markup).toContain("syntax-config-item");
    expect(markup).toContain("syntax-tone-picker");
    expect(markup).toContain("新增块规则");
    expect(markup).not.toContain("syntax-config-grid");
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
    expect(markup).toContain("syntax-detail-summary");
    expect(markup).toContain("syntax-detail-meta");
    expect(markup).toContain("syntax-detail-preview");
    expect(markup).toContain("syntax-render-line");
    expect(markup).toContain("首行标题示例");
    expect(markup).not.toContain("syntax-detail-config");
    expect(markup).not.toContain("当前配置");
    expect(markup).not.toContain("语法统计");
    expect(markup).not.toContain(">状态<");
  });

  it("keeps syntax controls from using bright focus or selected borders", () => {
    expect(activitiesCss).toContain(".syntax-row input");
    expect(activitiesCss).toContain(
      "border: var(--ui-border-width) solid transparent",
    );
    expect(activitiesCss).not.toMatch(
      /\.syntax-row input:focus,[\s\S]*?outline: var\(--ui-focus-outline\)/,
    );
    expect(activitiesCss).not.toMatch(
      /\.syntax-tone-tile\.is-selected,[\s\S]*?border-color: var\(--color-accent\)/,
    );
    expect(activitiesCss).not.toMatch(
      /\.syntax-render-tone-green \{[\s\S]*?background: var\(--ctn-tone-green-soft\)/,
    );
  });
});
