import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CheckboxControl,
  ChoiceGroup,
  ColorControl,
  InputControl,
  RangeControl,
  SelectControl,
} from "../../../../presentation/ui/shared/controls";
import { ToggleButton } from "../../../../presentation/ui/shared/primitives";

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
    expect(markup).toContain('aria-label="图谱范围"');
    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain('aria-checked="false"');
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
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
  });

  it("renders shared toggle buttons for pressed options", () => {
    const markup = renderToStaticMarkup(
      <ToggleButton pressed disabled>
        隐藏孤立点
      </ToggleButton>,
    );

    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("隐藏孤立点");
    expect(markup).toContain('disabled=""');
  });

  it.each([
    [
      "checkbox",
      <CheckboxControl aria-label="启用" checked disabled />,
      ['type="checkbox"', 'checked=""', 'disabled=""'],
    ],
    [
      "text",
      <InputControl aria-label="名称" value="示例" readOnly />,
      ['aria-label="名称"', 'value="示例"', 'readOnly=""'],
    ],
    [
      "select",
      <SelectControl aria-label="Profile" value="one" disabled>
        <option value="one">One</option>
      </SelectControl>,
      ['aria-label="Profile"', 'selected=""', 'disabled=""'],
    ],
    [
      "range",
      <RangeControl aria-label="密度" min={0} max={100} value={40} readOnly />,
      ['type="range"', 'min="0"', 'max="100"', 'value="40"'],
    ],
    [
      "color",
      <ColorControl aria-label="颜色" value="#ffffff" readOnly />,
      ['type="color"', 'value="#ffffff"', 'readOnly=""'],
    ],
  ] as const)(
    "preserves native %s control attributes",
    (_name, control, attributes) => {
      const markup = renderToStaticMarkup(control);
      for (const attribute of attributes) expect(markup).toContain(attribute);
    },
  );
});
