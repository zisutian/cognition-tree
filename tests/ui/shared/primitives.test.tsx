import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SegmentedControl,
  SymbolSlot,
  ToggleButton,
} from "../../../presentation/ui/shared/primitives";

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
  });

  it("supports filled segmented controls for context panels", () => {
    const markup = renderToStaticMarkup(
      <SegmentedControl
        ariaLabel="结构操作模式"
        fill
        options={[
          { label: "源笔记 / 目标笔记", value: "betweenNotes" },
          { label: "笔记结构", value: "withinNote" },
        ]}
        value="withinNote"
        onChange={() => undefined}
      />,
    );

    expect(markup).toContain("ui-segmented-control-fill");
    expect(markup).toContain("--ui-segment-count:2");
    expect(markup).toContain("aria-pressed=\"true\"");
  });

  it("renders shared toggle buttons for pressed toolbar options", () => {
    const markup = renderToStaticMarkup(
      <ToggleButton pressed>隐藏孤立点</ToggleButton>,
    );

    expect(markup).toContain("ui-toggle-button is-active");
    expect(markup).toContain("aria-pressed=\"true\"");
    expect(markup).toContain("隐藏孤立点");
  });

  it("renders shared symbol slots for tree and detail markers", () => {
    const markup = renderToStaticMarkup(
      <SymbolSlot className="detail-line-marker" tone="link">
        T
      </SymbolSlot>,
    );

    expect(markup).toContain("ui-symbol-slot");
    expect(markup).toContain("ui-symbol-slot-link");
    expect(markup).toContain("detail-line-marker");
  });
});
