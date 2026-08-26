import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ChoiceGroup,
  ColorControl,
  InputControl,
  RangeControl,
  SelectControl,
} from "../../../presentation/ui/shared/controls";
import {
  Button,
  ToggleButton,
} from "../../../presentation/ui/shared/primitives";

describe("shared controls", () => {
  it("renders a single choice as a radio group", () => {
    const markup = renderToStaticMarkup(
      <ChoiceGroup
        ariaLabel="图谱范围"
        mode="single"
        options={[
          { label: "全库", value: "global" },
          { label: "局部", value: "local" },
        ]}
        value="global"
        onChange={() => undefined}
      />,
    );

    expect(markup).toContain('role="radiogroup"');
    expect(markup).toContain("aria-label=\"图谱范围\"");
    expect(markup).toContain("aria-checked=\"true\"");
    expect(markup).toContain("aria-checked=\"false\"");
  });

  it("renders multiple choices with pressed state", () => {
    const markup = renderToStaticMarkup(
      <ChoiceGroup
        ariaLabel="搜索范围"
        mode="multiple"
        options={[
          {
            ariaLabel: "本地仓库（repository-a）",
            label: "本地仓库",
            value: "workspace",
          },
          { label: "日记", value: "journal" },
        ]}
        values={["workspace"]}
        onChange={() => undefined}
      />,
    );

    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-label="本地仓库（repository-a）"');
    expect(markup).toContain("aria-pressed=\"true\"");
    expect(markup).toContain("aria-pressed=\"false\"");
  });

  it("renders shared toggle buttons for pressed options", () => {
    const markup = renderToStaticMarkup(
      <>
        <ToggleButton pressed>隐藏孤立点</ToggleButton>
        <Button variant="bare">结构目标</Button>
      </>,
    );

    expect(markup).toContain("aria-pressed=\"true\"");
    expect(markup).toContain("隐藏孤立点");
    expect(markup).toContain("ui-button-bare");
  });

  it("renders input, select, range, and color control contracts", () => {
    const markup = renderToStaticMarkup(
      <>
        <InputControl aria-label="名称" value="示例" readOnly />
        <SelectControl aria-label="Profile" value="one" onChange={() => undefined}>
          <option value="one">One</option>
        </SelectControl>
        <RangeControl aria-label="密度" min={0} max={100} value={40} readOnly />
        <ColorControl aria-label="颜色" value="#ffffff" readOnly />
      </>,
    );

    expect(markup).toContain("ui-input-control ui-control-content");
    expect(markup).toContain("ui-select-control ui-control-content");
    expect(markup).toContain("ui-range-control");
    expect(markup).toContain("ui-color-control");
  });
});
