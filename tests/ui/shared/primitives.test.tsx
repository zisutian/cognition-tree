import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SegmentedControl } from "../../../src/ui/shared/primitives";

describe("shared primitives", () => {
  it("renders segmented controls without activity-specific classes", () => {
    const markup = renderToStaticMarkup(
      <SegmentedControl
        ariaLabel="图谱范围"
        options={[
          { label: "全库", value: "global" },
          { label: "局部", value: "local" },
        ]}
        value="global"
        onChange={() => undefined}
      />,
    );

    expect(markup).toContain("ui-segmented-control");
    expect(markup).toContain("ui-segmented-control-option is-active");
    expect(markup).toContain("aria-label=\"图谱范围\"");
    expect(markup).toContain("aria-pressed=\"true\"");
    expect(markup).toContain("aria-pressed=\"false\"");
    expect(markup).not.toContain("graph-segments");
    expect(markup).not.toContain("migration-mode-switch");
  });

  it("supports filled segmented controls for context panels", () => {
    const markup = renderToStaticMarkup(
      <SegmentedControl
        ariaLabel="迁移模式"
        fill
        options={[
          { label: "源笔记 / 目标笔记", value: "pair" },
          { label: "笔记结构", value: "structure" },
        ]}
        value="structure"
        onChange={() => undefined}
      />,
    );

    expect(markup).toContain("ui-segmented-control-fill");
    expect(markup).toContain("--ui-segment-count:2");
    expect(markup).toContain("aria-pressed=\"true\"");
  });
});
