import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SyntaxDetailPanel,
  SyntaxMainPanel,
} from "../../../../src/ui/activities/syntax/SyntaxPanels";
import { createView } from "../../viewFactory";

describe("syntax panels", () => {
  it("uses constrained tab width input and tone pickers", () => {
    const markup = renderToStaticMarkup(<SyntaxMainPanel view={createView()} />);

    expect(markup).toContain("type=\"number\"");
    expect(markup).toContain("max=\"16\"");
    expect(markup).toContain("syntax-tone-picker");
    expect(markup).toContain("新增块规则");
  });

  it("keeps the detail panel focused on configuration and visual preview", () => {
    const markup = renderToStaticMarkup(
      <SyntaxDetailPanel
        onCollapseDetail={() => undefined}
        view={createView()}
      />,
    );

    expect(markup).toContain("当前配置");
    expect(markup).toContain("缩进宽度");
    expect(markup).toContain("语法可视化");
    expect(markup).not.toContain("语法统计");
  });
});
