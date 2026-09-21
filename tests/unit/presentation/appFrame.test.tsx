import { describe, expect, it } from "vitest";
import { Workbench, initialWorkbenchLayout } from "compact-ui";
import { uiConfig } from "../../../presentation/ui/index.ts";
import { renderToStaticMarkup } from "../../support/presentation/render.tsx";
describe("Compact UI workbench integration", () => {
  const render = (focusMode = false) =>
    renderToStaticMarkup(
      <Workbench
        activities={[{ id: "notes", label: "笔记", icon: "N" }]}
        activeActivityId="notes"
        onActivityRequest={() => {}}
        context={{ title: "目录", content: "目录内容", layout: "fill" }}
        main={{ title: "正文", content: "正文内容", layout: "fill" }}
        detail={{ title: "结构", content: "结构内容", layout: "fill" }}
        bottom={{ title: "问题", content: "问题内容", layout: "fill" }}
        status={{ start: "保存状态" }}
        layout={{
          ...initialWorkbenchLayout(uiConfig),
          bottomExpanded: true,
          focusMode,
        }}
        onLayoutChange={() => {}}
      />,
    );
  it("provides all regions and accessible resizing through the package", () => {
    const markup = render();
    for (const label of [
      "目录内容",
      "正文内容",
      "结构内容",
      "问题内容",
      "保存状态",
    ])
      expect(markup).toContain(label);
    expect(markup).toContain('role="separator"');
  });
  it("keeps only main content in focus mode", () => {
    const markup = render(true);
    expect(markup).toContain("正文内容");
    expect(markup).not.toContain("目录内容");
    expect(markup).not.toContain("结构内容");
  });
});
