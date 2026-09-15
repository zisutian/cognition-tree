import type { ComponentProps, ReactNode } from "react";
import { expectTypeOf, it } from "vitest";
import type {
  Button,
  CheckboxControl,
  CheckboxGroup,
  ChoiceGroup,
  ColorControl,
  FieldRow,
  FormActions,
  FormLayout,
  InputControl,
  ManagementList,
  ManagementRow,
  Page,
  PageBody,
  RangeControl,
  Section,
  SectionStack,
  SelectControl,
  StatusBadge,
  TextareaControl,
  ToggleButton,
  ToolDivider,
  ToolList,
  ToolListRow,
  ToolPropertyList,
  ToolPropertyRow,
  ToolToolbar,
} from "../../presentation/ui/index.ts";

type VisualOverrides<T> = T extends (props: infer Props) => ReactNode
  ? Extract<keyof Props, "className" | "style" | "density">
  : never;

it("keeps shared appearance outside the public activity API", () => {
  expectTypeOf<
    VisualOverrides<
      | typeof Button
      | typeof CheckboxControl
      | typeof CheckboxGroup
      | typeof ChoiceGroup
      | typeof ColorControl
      | typeof FieldRow
      | typeof FormActions
      | typeof FormLayout
      | typeof InputControl
      | typeof ManagementList
      | typeof ManagementRow
      | typeof Page
      | typeof PageBody
      | typeof RangeControl
      | typeof Section
      | typeof SectionStack
      | typeof SelectControl
      | typeof StatusBadge
      | typeof TextareaControl
      | typeof ToggleButton
      | typeof ToolDivider
      | typeof ToolList
      | typeof ToolListRow
      | typeof ToolPropertyList
      | typeof ToolPropertyRow
      | typeof ToolToolbar
    >
  >().toEqualTypeOf<never>();
  expectTypeOf<
    Extract<ComponentProps<typeof Button>["variant"], "bare">
  >().toEqualTypeOf<never>();
});
