import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SegmentedControl,
  SymbolSlot,
  ToggleButton,
} from "../../../src/ui/shared/primitives";

// @ts-expect-error Node built-in types are intentionally outside the app tsconfig.
const { readFileSync } = (await import("node:fs")) as {
  readFileSync: (path: URL, encoding: "utf8") => string;
};
const primitivesCss = readFileSync(
  new URL("../../../src/ui/styles/shared/primitives.css", import.meta.url),
  "utf8",
);

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

  it("defines row-style primitives for detail panels without changing panel titles", () => {
    expect(primitivesCss).not.toContain(".ui-panel-detail .ui-panel-header h2");
    expect(primitivesCss).toContain(".ui-symbol-slot");
    expect(primitivesCss).toContain("width: var(--ui-symbol-size)");
    expect(primitivesCss).toContain(".ui-toggle-button.is-active");
    expect(primitivesCss).toContain("color: var(--color-fg-strong)");
    expect(primitivesCss).toContain(".detail-summary-strip");
    expect(primitivesCss).toContain(".detail-primary-row");
    expect(primitivesCss).toContain(".detail-divider");
    expect(primitivesCss).toContain(".detail-line-row");
    expect(primitivesCss).not.toMatch(
      /\.detail-line-row[\s\S]*?border: var\(--ui-border-width\) solid var\(--color-border/,
    );
  });
});
